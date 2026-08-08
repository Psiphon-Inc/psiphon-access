/*
 * Psiphon Access
 * Copyright (C) 2026  Psiphon Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package googleoidc

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"time"

	"github.com/gravitational/trace"
	"github.com/zitadel/oidc/v3/pkg/client/rp"
	zoidc "github.com/zitadel/oidc/v3/pkg/oidc"
	"golang.org/x/oauth2"

	"github.com/gravitational/teleport"
	"github.com/gravitational/teleport/api/constants"
	apidefaults "github.com/gravitational/teleport/api/defaults"
	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/api/utils/keys/hardwarekey"
	"github.com/gravitational/teleport/lib/auth"
	"github.com/gravitational/teleport/lib/auth/authclient"
	"github.com/gravitational/teleport/lib/googleoidc/policy"
	"github.com/gravitational/teleport/lib/loginrule"
	"github.com/gravitational/teleport/lib/services"
	"github.com/gravitational/teleport/lib/utils"
)

// errStateNotUsable is the ONLY error a callback returns when its state token
// names no live auth request and when that token was already spent. One value
// serves both paths on purpose: trace.AccessDeniedError compares by message,
// so any second value would be an oracle that tells an attacker whether a
// guessed state ever existed. The audit failure class, which stays inside the
// cluster, keeps the two apart.
var errStateNotUsable = &trace.AccessDeniedError{Message: stateFailureUserMessage}

// createUserParams holds what a login creates or updates on the user.
type createUserParams struct {
	ConnectorName string
	Username      string
	UserID        string
	Roles         []string
	Traits        map[string][]string
	SessionTTL    time.Duration
}

// validateCallback checks the callback and issues the credentials.
func (s *Service) validateCallback(ctx context.Context, q url.Values, audit *callbackAudit) (*authclient.OIDCAuthResponse, error) {
	stateToken := q.Get("state")
	if stateToken == "" {
		return nil, trace.WithUserMessage(trace.BadParameter("OIDC callback is missing state"),
			"Invalid parameters received from OIDC provider.")
	}

	code := q.Get("code")
	var callbackErr error
	switch {
	case q.Get("error") != "":
		audit.failureClass = failureProviderError
		callbackErr = trace.WithUserMessage(trace.AccessDenied("OIDC provider rejected authentication"),
			"OIDC provider rejected authentication.")
	case code == "":
		audit.failureClass = failureInvalidCallback
		callbackErr = trace.WithUserMessage(trace.BadParameter("OIDC callback is missing code"),
			"Invalid parameters received from OIDC provider.")
	}
	if callbackErr != nil {
		if request, err := s.auth.Services.GetOIDCAuthRequest(ctx, stateToken); err == nil {
			audit.setRequest(request)
		}
		return nil, callbackErr
	}

	// Look the auth request up BEFORE anything is written. The proxy callback
	// route is unauthenticated, so a state that names no login must cost the
	// backend nothing. The upstream ClaimOIDCAuthRequest read first as well.
	//
	req, err := s.auth.Services.GetOIDCAuthRequest(ctx, stateToken)
	if err != nil {
		s.logger.DebugContext(ctx, "OIDC callback presented a state that names no login", "error", err)
		audit.failureClass = failureUnknownState
		return nil, trace.Wrap(errStateNotUsable)
	}
	audit.setRequest(req)

	// Make the state single-use before the token exchange, so that a failed
	// exchange burns the login. The lookup above reads a different key, so the
	// claim is still one atomic backend.Create and there is no check-then-write
	// race on the claim itself.
	if err := s.state.Claim(ctx, stateToken); err != nil {
		if errors.Is(err, ErrStateAlreadyUsed) {
			audit.failureClass = failureCallbackReplayed
			return nil, trace.Wrap(errStateNotUsable)
		}
		audit.failureClass = failureInternal
		return nil, trace.Wrap(err)
	}

	if err := policy.ValidateAuthRequestMode(*req); err != nil {
		audit.failureClass = failureRequestValidation
		return nil, trace.Wrap(err)
	}

	connector, err := s.getConnector(ctx, *req)
	if err != nil {
		audit.failureClass = failureConnectorResolution
		return nil, trace.Wrap(err, "Failed to get OIDC connector.")
	}
	audit.connectorID = connector.GetName()

	domains, err := policy.WorkspaceDomains(connector)
	if err != nil {
		audit.failureClass = failureConnectorResolution
		return nil, trace.Wrap(err)
	}

	groupSettings, err := policy.GroupLookupSettings(connector)
	if err != nil {
		audit.failureClass = failureConnectorResolution
		return nil, trace.Wrap(err)
	}

	if req.PkceVerifier == "" {
		audit.failureClass = failurePKCEVerification
		return nil, trace.AccessDenied("OIDC authentication request is missing PKCE verification data")
	}

	nonce, err := s.state.Nonce(ctx, stateToken)
	if err != nil {
		audit.failureClass = failureRequestValidation
		return nil, trace.Wrap(err, "Failed to read the OIDC nonce.")
	}

	callbackURL, err := policy.RedirectURLForProxy(connector, req.ProxyAddress)
	if err != nil {
		audit.failureClass = failureRedirectValidation
		return nil, trace.Wrap(err)
	}

	config, err := s.newOAuth2Config(ctx, connector, callbackURL)
	if err != nil {
		audit.failureClass = failureProviderConfiguration
		return nil, providerError(audit.failureClass, err)
	}

	exchangeCtx, cancel := context.WithTimeout(ctx, providerTimeout)
	exchangeCtx = context.WithValue(exchangeCtx, oauth2.HTTPClient, s.httpClient)
	token, err := config.Exchange(exchangeCtx, code, oauth2.VerifierOption(req.PkceVerifier))
	cancel()
	if err != nil {
		audit.failureClass = failureTokenExchange
		return nil, providerError(audit.failureClass, err)
	}

	idToken, ok := token.Extra("id_token").(string)
	if !ok || idToken == "" {
		audit.failureClass = failureIDTokenValidation
		return nil, trace.BadParameter("missing or invalid id_token found in OIDC OAuth2 token")
	}

	validator, err := s.validators.GetValidatorWithKey(ctx, validatorKey{
		issuer:    connector.GetIssuerURL(),
		audience:  connector.GetClientID(),
		connector: connector.GetName(),
	}, s.validatorMutators...)
	if err != nil {
		audit.failureClass = failureIDTokenValidation
		return nil, providerError(audit.failureClass, err)
	}

	claims, err := validator.ValidateToken(ctx, idToken, rp.WithNonce(func(context.Context) string {
		return nonce
	}))
	if err != nil {
		audit.failureClass = failureIDTokenValidation
		return nil, providerError(audit.failureClass, err)
	}

	if class, err := checkIdentityClaims(claims, domains, s.clock.Now()); err != nil {
		audit.failureClass = class
		return nil, trace.Wrap(err)
	}

	rawClaims, err := claimsToMap(claims)
	if err != nil {
		audit.failureClass = failureClaimsProcessing
		return nil, trace.Wrap(err, "Failed to extract OIDC claims.")
	}
	// Drop any provider supplied groups claim. Google does not put group
	// membership in an ID token, and a raw token claim is NEVER a fallback for
	// the Cloud Identity lookup, so the claim is removed before the lookup can
	// put a verified value in its place.
	delete(rawClaims, policy.GroupsClaim)

	var verifiedGroups []string
	if groupSettings.Enabled {
		// The lookup uses the access token of this login and nothing else. The
		// token is not stored, not audited and not logged.
		lookup := s.lookupGroups(ctx, groupSettings, token.AccessToken, claims.Email)
		audit.setGroupLookup(lookup)
		s.logGroupLookup(ctx, connector.GetName(), lookup)

		// A failed lookup grants no roles from group mappings. It does not
		// deny the login: an email mapping still applies, and local auth is
		// untouched.
		verifiedGroups = lookup.Groups
		if len(verifiedGroups) > 0 {
			rawClaims[policy.GroupsClaim] = verifiedGroups
		}
	}

	if connector.GetACR() != "" && claims.GetAuthenticationContextClassReference() != connector.GetACR() {
		audit.failureClass = failureIdentityValidation
		return nil, trace.AccessDenied("OIDC provider did not return the expected ACR value")
	}

	identity := &types.OIDCIdentity{
		ID:        claims.GetSubject(),
		Name:      claims.Name,
		Email:     claims.Email,
		ExpiresAt: claims.GetExpiration(),
	}

	params, roleAudit, err := s.calculateUser(ctx, connector, rawClaims, claims, req, verifiedGroups)
	audit.roleSource = roleAudit.roleSource
	audit.roleMappingWarnings = roleAudit.roleMappingWarnings
	audit.appliedLoginRules = append([]string(nil), roleAudit.appliedLoginRules...)
	if err != nil {
		audit.failureClass = failureRoleMapping
		return nil, trace.Wrap(err, "Failed to calculate user attributes.")
	}

	user, err := s.createUser(ctx, params, req.SSOTestFlow)
	if err != nil {
		audit.failureClass = failureUserCreation
		return nil, trace.Wrap(err, "Failed to create user from provided parameters.")
	}

	if req.SSOTestFlow {
		return &authclient.OIDCAuthResponse{
			Req:      authRequestFromProto(req),
			Identity: externalIdentity(connector.GetName(), params.Username, identity.ID),
			Username: user.GetName(),
		}, nil
	}

	if err := s.auth.CallLoginHooks(ctx, user); err != nil {
		audit.failureClass = failureLoginHook
		return nil, trace.Wrap(err)
	}

	userState, err := s.auth.GetUserOrLoginState(ctx, user.GetName())
	if err != nil {
		audit.failureClass = failureUserState
		return nil, trace.Wrap(err)
	}

	response, err := s.makeAuthResponse(ctx, req, userState, identity, params.SessionTTL)
	if err != nil {
		audit.failureClass = failureCredentialIssuance
		return nil, trace.Wrap(err)
	}

	return response, nil
}

// checkIdentityClaims validates the identity an ID token asserts, and binds it
// to the Google Workspace domains the connector allows.
func checkIdentityClaims(claims *zoidc.IDTokenClaims, domains []string, now time.Time) (failureClass, error) {
	if claims == nil {
		return failureIdentityValidation, trace.AccessDenied("OIDC provider did not return claims")
	}

	nowWithOffset := now.Add(time.Second)
	switch {
	case claims.GetIssuedAt().After(nowWithOffset):
		return failureIdentityValidation, trace.AccessDenied("OIDC provider returned a future issued-at time")
	case claims.NotBefore.AsTime().After(nowWithOffset):
		return failureIdentityValidation, trace.AccessDenied("OIDC provider returned a future not-before time")
	case claims.GetSubject() == "":
		return failureIdentityValidation, trace.AccessDenied("OIDC provider did not return a subject")
	case claims.Email == "":
		return failureIdentityValidation, trace.AccessDenied("OIDC provider did not return an email")
	case !bool(claims.EmailVerified):
		return failureIdentityValidation, trace.AccessDenied("OIDC provider did not verify email")
	}

	// The issuer https://accounts.google.com serves EVERY Google account,
	// including personal gmail.com accounts. A verified email proves only that
	// Google verified it, not that the account belongs to the operator
	// Workspace. Bind the login to the connector domain allow-list here, right
	// after the email_verified check.
	if err := policy.CheckHostedDomain(hostedDomain(claims), domains); err != nil {
		return failureHostedDomain, trace.Wrap(err)
	}

	// The hd claim alone is trusted by nobody here. The email claim becomes the
	// Teleport user name and drives every claims_to_roles mapping, so its
	// domain must be allow-listed as well. The two domains need not be equal:
	// a Workspace tenant may hold secondary and alias domains.21
	// item 3.
	if err := policy.CheckEmailDomain(claims.Email, domains); err != nil {
		return failureEmailDomain, trace.Wrap(err)
	}

	return "", nil
}

// hostedDomain returns the hd claim of the ID token.
func hostedDomain(claims *zoidc.IDTokenClaims) string {
	if claims == nil {
		return ""
	}
	value, ok := claims.Claims["hd"].(string)
	if !ok {
		return ""
	}
	return value
}

// claimsToMap renders the ID token claims as a claim map. The zitadel claims
// type keeps every raw claim, so provider specific claims survive.
func claimsToMap(claims *zoidc.IDTokenClaims) (types.OIDCClaims, error) {
	encoded, err := json.Marshal(claims)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	var rawClaims types.OIDCClaims
	if err := json.Unmarshal(encoded, &rawClaims); err != nil {
		return nil, trace.Wrap(err)
	}
	return rawClaims, nil
}

// calculateUser maps claims to a Teleport user.
func (s *Service) calculateUser(
	ctx context.Context,
	connector types.OIDCConnector,
	claims types.OIDCClaims,
	idTokenClaims *zoidc.IDTokenClaims,
	request *types.OIDCAuthRequest,
	verifiedGroups []string,
) (*createUserParams, roleMappingAudit, error) {
	roleAudit := roleMappingAudit{roleSource: roleSourceNone}

	username, err := usernameFromClaims(connector, claims)
	if err != nil {
		return nil, roleAudit, trace.Wrap(err)
	}

	traits := claimsToTraits(claims)
	warnings, roles := services.TraitsToRoles(connector.GetTraitMappings(), traits)
	roleAudit.roleMappingWarnings = len(warnings)
	if len(roles) == 0 {
		return nil, roleAudit, trace.AccessDenied("OIDC claims did not match any configured roles")
	}
	roleAudit.roleSource = roleSourceForMappings(connector.GetTraitMappings(), traits)

	evaluationOutput, err := s.auth.GetLoginRuleEvaluator().Evaluate(ctx, &loginrule.EvaluationInput{Traits: traits})
	if err != nil {
		return nil, roleAudit, trace.Wrap(err)
	}
	roleAudit.appliedLoginRules = append([]string(nil), evaluationOutput.AppliedRules...)
	traits = evaluationOutput.Traits
	// A login rule must not invent group membership. Roles are calculated
	// above, before the rules run, so an injected groups trait can grant no
	// role, but it would still be stored on the user and read by a role
	// template. Reset the trait to exactly what Cloud Identity confirmed.
	if len(verifiedGroups) > 0 {
		traits[policy.GroupsClaim] = append([]string(nil), verifiedGroups...)
	} else {
		delete(traits, policy.GroupsClaim)
	}

	rolesFetched, err := services.FetchRoles(roles, s.auth, traits)
	if err != nil {
		return nil, roleAudit, trace.Wrap(err)
	}

	return &createUserParams{
		ConnectorName: connector.GetName(),
		Username:      username,
		UserID:        idTokenClaims.GetSubject(),
		Roles:         roles,
		Traits:        traits,
		SessionTTL:    utils.MinTTL(rolesFetched.AdjustSessionTTL(apidefaults.MaxCertDuration), request.CertTTL),
	}, roleAudit, nil
}

// roleSourceForMappings reports which claim family granted the roles of a
// login. The audit attribute was the constant "email" whenever any role
// matched, so it carried no information.
//
// The connector policy accepts email and groups claim mappings only, so a
// mapping on a third claim cannot exist and cannot be silently reported as
// none.
func roleSourceForMappings(mappings types.TraitMappingSet, traits map[string][]string) string {
	mappingsFor := func(trait string) types.TraitMappingSet {
		selected := make(types.TraitMappingSet, 0, len(mappings))
		for _, mapping := range mappings {
			if mapping.Trait == trait {
				selected = append(selected, mapping)
			}
		}
		return selected
	}

	_, emailRoles := services.TraitsToRoles(mappingsFor("email"), traits)
	_, groupRoles := services.TraitsToRoles(mappingsFor(policy.GroupsClaim), traits)

	switch {
	case len(emailRoles) > 0 && len(groupRoles) > 0:
		return roleSourceBoth
	case len(emailRoles) > 0:
		return roleSourceEmail
	case len(groupRoles) > 0:
		return roleSourceGroups
	default:
		return roleSourceNone
	}
}

// createUser creates or updates the Teleport user of a login.
func (s *Service) createUser(ctx context.Context, p *createUserParams, dryRun bool) (types.User, error) {
	s.logger.DebugContext(ctx, "Generating dynamic OIDC identity",
		"connector_name", p.ConnectorName,
		"user_name", p.Username,
		"roles", p.Roles,
		"dry_run", dryRun,
	)

	expires := s.clock.Now().UTC().Add(p.SessionTTL)

	user := &types.UserV2{
		Kind:    types.KindUser,
		Version: types.V2,
		Metadata: types.Metadata{
			Name:      p.Username,
			Namespace: apidefaults.Namespace,
			Expires:   &expires,
		},
		Spec: types.UserSpecV2{
			Roles:  p.Roles,
			Traits: p.Traits,
			OIDCIdentities: []types.ExternalIdentity{{
				ConnectorID: p.ConnectorName,
				Username:    p.Username,
				UserID:      p.UserID,
			}},
			CreatedBy: types.CreatedBy{
				User: types.UserRef{Name: teleport.UserSystem},
				Time: s.clock.Now().UTC(),
				Connector: &types.ConnectorRef{
					Type:     constants.OIDC,
					ID:       p.ConnectorName,
					Identity: p.Username,
				},
			},
		},
	}

	if err := s.validateSubjectBinding(ctx, p.ConnectorName, p.UserID, p.Username); err != nil {
		return nil, trace.Wrap(err)
	}

	existingUser, err := s.auth.Services.GetUser(ctx, p.Username, false)
	if err != nil && !trace.IsNotFound(err) {
		return nil, trace.Wrap(err)
	}

	if existingUser != nil {
		ref := user.GetCreatedBy().Connector
		if !ref.IsSameProvider(existingUser.GetCreatedBy().Connector) {
			return nil, trace.AlreadyExists("local user %q already exists and is not an OIDC user", existingUser.GetName())
		}
		if err := validateExistingSubject(existingUser, p.ConnectorName, p.UserID); err != nil {
			return nil, trace.Wrap(err)
		}
	}

	if dryRun {
		return user, nil
	}

	if existingUser != nil {
		user.SetRevision(existingUser.GetRevision())
		if _, err := s.auth.UpdateUser(ctx, user); err != nil {
			return nil, trace.Wrap(err)
		}
		return user, nil
	}

	if _, err := s.auth.CreateUser(ctx, user); err != nil {
		return nil, trace.Wrap(err)
	}

	return user, nil
}

// validateSubjectBinding denies a login whose Google subject is already bound
// to another Teleport user. A renamed Google account must not take over an
// existing account.
func (s *Service) validateSubjectBinding(ctx context.Context, connectorID, subject, username string) error {
	users, err := s.auth.GetUsers(ctx, false)
	if err != nil {
		s.logger.WarnContext(ctx, "Failed to list users while validating OIDC subject binding", "error", err)
		return trace.AccessDenied("OIDC subject binding could not be verified")
	}

	for _, user := range users {
		if user.GetName() == username {
			continue
		}
		for _, identity := range user.GetOIDCIdentities() {
			if identity.ConnectorID == connectorID && identity.UserID != "" && identity.UserID == subject {
				return trace.AccessDenied("OIDC subject is already bound to a different user")
			}
		}
	}

	return nil
}

// validateExistingSubject denies a login whose Google subject does not match
// the subject already recorded on the user.
func validateExistingSubject(user types.User, connectorID, subject string) error {
	found := false
	for _, identity := range user.GetOIDCIdentities() {
		if identity.ConnectorID != connectorID {
			continue
		}
		found = true
		if identity.UserID == "" || identity.UserID != subject {
			return trace.AccessDenied("OIDC subject does not match the existing user")
		}
	}
	if !found {
		return trace.AccessDenied("existing OIDC user has no identity for this connector")
	}
	return nil
}

// makeAuthResponse issues the web session and the certificates.
func (s *Service) makeAuthResponse(
	ctx context.Context,
	req *types.OIDCAuthRequest,
	userState services.UserState,
	identity *types.OIDCIdentity,
	sessionTTL time.Duration,
) (*authclient.OIDCAuthResponse, error) {
	response := authclient.OIDCAuthResponse{
		Req:      authRequestFromProto(req),
		Identity: externalIdentity(req.ConnectorID, userState.GetName(), identity.ID),
		Username: userState.GetName(),
	}

	if req.CreateWebSession {
		session, err := s.auth.CreateWebSessionFromReq(ctx, auth.NewWebSessionRequest{
			User:                 userState.GetName(),
			Roles:                userState.GetRoles(),
			Traits:               userState.GetTraits(),
			SessionTTL:           sessionTTL,
			LoginTime:            s.clock.Now().UTC(),
			LoginIP:              req.ClientLoginIP,
			LoginUserAgent:       req.ClientUserAgent,
			AttestWebSession:     true,
			CreateDeviceWebToken: true,
			Scope:                req.Scope,
		})
		if err != nil {
			return nil, trace.Wrap(err, "Failed to create web session.")
		}
		response.Session = session
	}

	if len(req.SshPublicKey) != 0 || len(req.TlsPublicKey) != 0 {
		sshCert, tlsCert, err := s.auth.CreateSessionCerts(ctx, &auth.SessionCertsRequest{
			UserState:               userState,
			SessionTTL:              sessionTTL,
			SSHPubKey:               req.SshPublicKey,
			TLSPubKey:               req.TlsPublicKey,
			SSHAttestationStatement: hardwarekey.AttestationStatementFromProto(req.SshAttestationStatement),
			TLSAttestationStatement: hardwarekey.AttestationStatementFromProto(req.TlsAttestationStatement),
			Compatibility:           req.Compatibility,
			RouteToCluster:          req.RouteToCluster,
			KubernetesCluster:       req.KubernetesCluster,
			LoginIP:                 req.ClientLoginIP,
			Scope:                   req.Scope,
		})
		if err != nil {
			return nil, trace.Wrap(err, "Failed to create session certificate.")
		}

		clusterName, err := s.auth.GetClusterName(ctx)
		if err != nil {
			return nil, trace.Wrap(err, "Failed to obtain cluster name.")
		}

		response.Cert = sshCert
		response.TLSCert = tlsCert

		authority, err := s.auth.GetCertAuthority(ctx, types.CertAuthID{
			Type:       types.HostCA,
			DomainName: clusterName.GetClusterName(),
		}, false)
		if err != nil {
			return nil, trace.Wrap(err, "Failed to obtain cluster's host CA.")
		}
		response.HostSigners = append(response.HostSigners, authority)
	}

	if options, err := s.auth.ClientOptionsForLogin(userState); err == nil {
		response.ClientOptions = options
	} else {
		s.logger.WarnContext(ctx, "Failed to calculate client options for OIDC login",
			"username", userState.GetName(), "error", err)
	}

	return &response, nil
}

// usernameFromClaims returns the Teleport user name of a login.
func usernameFromClaims(connector types.OIDCConnector, claims types.OIDCClaims) (string, error) {
	claimName := connector.GetUsernameClaim()
	if claimName == "" {
		claimName = "email"
	}

	value, ok := claims[claimName]
	if !ok {
		return "", trace.AccessDenied("OIDC provider did not return required username claim %q", claimName)
	}

	name, ok := value.(string)
	if !ok || name == "" {
		return "", trace.AccessDenied("OIDC username claim %q must be a non-empty string", claimName)
	}

	return name, nil
}

// claimsToTraits renders claims as user traits.
func claimsToTraits(claims types.OIDCClaims) map[string][]string {
	traits := make(map[string][]string)
	for claimName, v := range claims {
		switch claimValue := v.(type) {
		case string:
			traits[claimName] = []string{claimValue}
		case []string:
			traits[claimName] = claimValue
		case []any:
			for _, vv := range claimValue {
				if s, ok := vv.(string); ok {
					traits[claimName] = append(traits[claimName], s)
				}
			}
		case bool:
			traits[claimName] = []string{strconv.FormatBool(claimValue)}
		case float64:
			traits[claimName] = []string{strconv.FormatFloat(claimValue, 'f', -1, 64)}
		case json.Number:
			traits[claimName] = []string{claimValue.String()}
		}
	}
	return traits
}

// externalIdentity builds the external identity of a login.
func externalIdentity(connectorID, username, userID string) types.ExternalIdentity {
	return types.ExternalIdentity{
		ConnectorID: connectorID,
		Username:    username,
		UserID:      userID,
	}
}
