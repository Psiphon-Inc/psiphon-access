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
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gravitational/trace"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/ssh"

	"github.com/gravitational/teleport/api/constants"
	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/api/utils/keys"
	"github.com/gravitational/teleport/lib/auth"
	"github.com/gravitational/teleport/lib/auth/authclient"
	"github.com/gravitational/teleport/lib/client/sso"
	"github.com/gravitational/teleport/lib/cryptosuites"
	"github.com/gravitational/teleport/lib/googleoidc/policy"
	"github.com/gravitational/teleport/lib/secret"
)

// A complete browser login works end to end against a hermetic provider, and
// it produces the web session, the identity and the Teleport user.
func TestLoginEndToEnd(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.createRequest()
	require.NotEmpty(t, request.StateToken)

	redirect, err := url.Parse(request.RedirectURL)
	require.NoError(t, err)
	require.Equal(t, googleAuthorizationEndpoint,
		redirect.Scheme+"://"+redirect.Host+redirect.Path)

	response, err := env.callback(request)
	require.NoError(t, err)
	require.Equal(t, "user@example.com", response.Username)
	require.NotNil(t, response.Session)
	require.Equal(t, env.connector.GetName(), response.Identity.ConnectorID)
	require.Equal(t, "google-subject", response.Identity.UserID)

	user, err := env.auth.GetUser(context.Background(), "user@example.com", false)
	require.NoError(t, err)
	require.Equal(t, []string{"access"}, user.GetRoles())
	require.Len(t, user.GetOIDCIdentities(), 1)
	require.Equal(t, "google-subject", user.GetOIDCIdentities()[0].UserID)
	require.NotContains(t, user.GetTraits(), "groups")
}

// The connector redirect URL is pinned to one proxy. A login started through a
// different host must be refused, and the refusal must come from the redirect
// check, not from a missing field.
func TestLoginRefusesAMismatchedProxyAddress(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.authRequest()
	request.ProxyAddress = "evil.example.net:3080"

	_, err := env.service.CreateOIDCAuthRequest(context.Background(), request)
	require.Error(t, err)
	require.Contains(t, err.Error(), "does not match the proxy address")
}

// A request without a proxy address is refused. loginWeb sets the field from
// the request Host, so this is the fail-closed behaviour behind that.
func TestLoginRefusesAMissingProxyAddress(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.authRequest()
	request.ProxyAddress = ""

	_, err := env.service.CreateOIDCAuthRequest(context.Background(), request)
	require.Error(t, err)
	require.Contains(t, err.Error(), "missing the proxy address")
}

// The proxy address of the connector is matched without regard to letter case.
func TestLoginAcceptsTheProxyAddressCaseInsensitively(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.authRequest()
	request.ProxyAddress = "PROXY.example.COM:3080"

	_, err := env.service.CreateOIDCAuthRequest(context.Background(), request)
	require.NoError(t, err)
}

// A console request must reach the client redirect check. A public key must
// not let an unapproved listener receive the login response.
func TestConsoleLoginRefusesAnUnapprovedClientRedirect(t *testing.T) {
	env := newLoginEnv(t, nil)

	privateKey, err := cryptosuites.GenerateKeyWithAlgorithm(cryptosuites.Ed25519)
	require.NoError(t, err)
	publicKey, err := ssh.NewPublicKey(privateKey.Public())
	require.NoError(t, err)

	request := env.authRequest()
	request.CreateWebSession = false
	request.SshPublicKey = ssh.MarshalAuthorizedKey(publicKey)
	request.ClientRedirectURL = "https://evil.example.net/callback?secret_key=test"
	request.CertTTL = time.Hour

	_, err = env.service.CreateOIDCAuthRequest(context.Background(), request)
	require.Error(t, err)
	require.Contains(t, err.Error(), auth.InvalidClientRedirectErrorMessage)
}

// M2b. THE NONCE MUST NOT BE THE STATE TOKEN.
//
// The state token travels in the browser URL, so it reaches browser history, a
// Referer header and a proxy log. The old fork prototype reused it as the
// nonce, which made the nonce public and the ID token binding worthless. This
// test drives the real callback: the provider mints an ID token whose nonce is
// the state token, and the login must be refused.
func TestCallbackRejectsAnIDTokenWithTheStateTokenAsNonce(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.createRequest()

	// The nonce the browser carried must already differ from the state token.
	require.NotEqual(t, request.StateToken, env.google.authorizationValues().Get("nonce"),
		"the authorization URL must not carry the state token as the nonce")

	stateToken := request.StateToken
	env.google.nonceOverride = &stateToken

	_, err := env.callback(request)
	require.Error(t, err, "an ID token whose nonce is the state token must be refused")
	require.Contains(t, err.Error(), "id_token_validation_failed")
	env.requireNoUser("user@example.com")
}

// M2c. The nonce is read from the server-side store, never from the callback
// query. A callback that carries its own nonce parameter must not be able to
// satisfy the ID token check.
func TestCallbackIgnoresANonceInTheQuery(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.createRequest()

	attackerNonce := "attacker-chosen-nonce"
	env.google.nonceOverride = &attackerNonce

	_, err := env.service.ValidateOIDCAuthCallback(context.Background(), url.Values{
		"state": []string{request.StateToken},
		"code":  []string{env.google.validCode},
		"nonce": []string{attackerNonce},
	})
	require.Error(t, err, "the nonce must come from the store, not from the callback query")
	require.Contains(t, err.Error(), "id_token_validation_failed")
	env.requireNoUser("user@example.com")
}

// The stored nonce is the one the ID token must carry. A correct login
// succeeds, which proves the negative tests above fail for the right reason.
func TestCallbackAcceptsTheStoredNonce(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.createRequest()
	stored, err := env.service.state.Nonce(context.Background(), request.StateToken)
	require.NoError(t, err)
	require.Equal(t, stored, env.google.authorizationValues().Get("nonce"))
	require.NotEqual(t, request.StateToken, stored)

	_, err = env.callback(request)
	require.NoError(t, err)
}

// M4b. checkIdentityClaims must gate the login, not merely be called.
// Deleting the use of its result disables the email_verified check and the
// Workspace domain binding at the same time.
func TestCallbackEnforcesTheIdentityClaimChecks(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(map[string]any)
		wantErr string
	}{
		{
			name:    "unverified email",
			mutate:  func(c map[string]any) { c["email_verified"] = false },
			wantErr: "did not verify email",
		},
		{
			name:    "personal Google account without hd",
			mutate:  func(c map[string]any) { delete(c, "hd") },
			wantErr: "did not return a Google Workspace domain",
		},
		{
			name:    "hd of a foreign Workspace",
			mutate:  func(c map[string]any) { c["hd"] = "evil.example.net" },
			wantErr: "not allowed by this connector",
		},
		{
			name:    "hd of the wrong type",
			mutate:  func(c map[string]any) { c["hd"] = []string{"example.com"} },
			wantErr: "did not return a Google Workspace domain",
		},

		{
			name:    "missing email",
			mutate:  func(c map[string]any) { delete(c, "email") },
			wantErr: "did not return an email",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			env := newLoginEnv(t, nil)
			env.google.mutateClaims = test.mutate

			_, err := env.callback(env.createRequest())
			require.Error(t, err)
			require.Contains(t, err.Error(), test.wantErr)
			env.requireNoUser("user@example.com")
		})
	}
}

// M1. A caller-supplied PKCE verifier must never be honoured. A caller that
// can choose the verifier, or replay an earlier one, weakens the exchange.
func TestCreateRequestIgnoresACallerSuppliedPKCEVerifier(t *testing.T) {
	env := newLoginEnv(t, nil)

	const weakVerifier = "weak-verifier-chosen-by-the-caller"
	request := env.authRequest()
	request.PkceVerifier = weakVerifier

	stored, err := env.service.CreateOIDCAuthRequest(context.Background(), request)
	require.NoError(t, err)
	require.NotEqual(t, weakVerifier, stored.PkceVerifier,
		"a caller-supplied PKCE verifier must be replaced")
	// oauth2.GenerateVerifier always returns a 43-octet base64url string.
	require.Len(t, stored.PkceVerifier, 43)

	env.google.visitAuthorization(stored.RedirectURL)
	challenge := env.google.authorizationValues().Get("code_challenge")
	require.Equal(t, "S256", env.google.authorizationValues().Get("code_challenge_method"))
	require.Equal(t, oauth2S256(stored.PkceVerifier), challenge)
	require.NotEqual(t, oauth2S256(weakVerifier), challenge,
		"the authorization request must not challenge on the caller-supplied verifier")

	// The exchange still succeeds, so the generated verifier is the one in use.
	_, err = env.callback(stored)
	require.NoError(t, err)
}

// M3, first half. The state token is single-use. A replayed callback must be
// refused, and the refusal must happen before the token exchange.
func TestCallbackIsRefusedOnReplay(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.createRequest()
	_, err := env.callback(request)
	require.NoError(t, err)

	exchangesAfterFirstLogin := env.google.tokenExchangeCount()
	require.Equal(t, 1, exchangesAfterFirstLogin)

	// The error the caller sees is deliberately the same for a replayed state
	// and for a state that names no login, so the replay is proven through the
	// audit failure class.
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.Error(t, err, "a replayed OIDC callback must be refused")
	require.ErrorIs(t, err, errStateNotUsable)
	require.Equal(t, failureCallbackReplayed, audit.failureClass,
		"a replayed real state must be audited as a replay")
	require.Equal(t, exchangesAfterFirstLogin, env.google.tokenExchangeCount(),
		"a replayed callback must be refused before the token exchange")
}

// M3, second half. Two callbacks that arrive together must not both win, and
// only one token exchange may happen.
func TestConcurrentCallbacksHaveExactlyOneWinner(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.createRequest()

	const attempts = 8
	start := make(chan struct{})
	results := make(chan error, attempts)
	for range attempts {
		go func() {
			<-start
			_, err := env.service.ValidateOIDCAuthCallback(context.Background(), url.Values{
				"state": []string{request.StateToken},
				"code":  []string{env.google.validCode},
			})
			results <- err
		}()
	}
	close(start)

	var succeeded int
	for range attempts {
		if err := <-results; err == nil {
			succeeded++
		}
	}
	require.Equal(t, 1, succeeded, "exactly one concurrent callback may win")
	require.Equal(t, 1, env.google.tokenExchangeCount(),
		"a losing callback must not reach the token exchange")
	require.ElementsMatch(t,
		[]string{
			stateKey("nonce", request.StateToken).String(),
			stateKey("used", request.StateToken).String(),
		},
		env.forkKeyspaceKeys(),
		"the concurrent callbacks may leave exactly one claim marker")
}

// The proxy callback route is unauthenticated and no
// permission check stands in front of it, so a caller that presents a state
// nobody issued must not make the cluster write anything. The claim used to
// run before the auth request lookup, which let any caller create one backend
// item per request, each one alive for the auth request TTL.
func TestCallbackWithAnUnknownStateWritesNothing(t *testing.T) {
	env := newLoginEnv(t, nil)

	require.Empty(t, env.forkKeyspaceKeys(), "no login has started yet")

	const attempts = 8
	for i := range attempts {
		_, err := env.service.ValidateOIDCAuthCallback(context.Background(), url.Values{
			"state": []string{fmt.Sprintf("state-nobody-issued-%d", i)},
			"code":  []string{"code-nobody-issued"},
		})
		require.Error(t, err)
		require.True(t, trace.IsAccessDenied(err), "got %v", err)
	}

	require.Empty(t, env.forkKeyspaceKeys(),
		"a state that names no login must not create a backend item")
	require.Zero(t, env.google.tokenExchangeCount(),
		"a state that names no login must not reach the token exchange")
}

// Looking the auth request up first must not turn the
// state store into an oracle. A replayed real state is still reported as a
// replay inside the Auth Service, and both paths hand the browser the same
// error class and the same user message.
func TestCallbackHidesWhetherAStateIsUnknownOrSpent(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.createRequest()
	_, err := env.callback(request)
	require.NoError(t, err)

	replayAudit, replayErr := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.Error(t, replayErr)
	require.Equal(t, failureCallbackReplayed, replayAudit.failureClass,
		"a replayed real state must still be detected as a replay")

	unknownAudit, unknownErr := env.callbackWithAudit("state-nobody-issued", env.google.validCode)
	require.Error(t, unknownErr)
	require.Equal(t, failureUnknownState, unknownAudit.failureClass)
	require.False(t, unknownAudit.emit,
		"a state that names no login must not let an unauthenticated caller write the audit log")

	require.True(t, trace.IsAccessDenied(replayErr), "got %v", replayErr)
	require.True(t, trace.IsAccessDenied(unknownErr), "got %v", unknownErr)
	require.Equal(t, stateFailureUserMessage, trace.UserMessage(unknownErr))
	require.Equal(t, stateFailureUserMessage, trace.UserMessage(replayErr))
	require.Equal(t, replayErr.Error(), unknownErr.Error(),
		"an unknown state and a spent state must look the same to the caller")
}

// M3, third half. The claim happens before the token exchange, so a failed
// exchange burns the login. That is fail-closed and deliberate: a retryable
// state token would let an attacker with a stolen callback URL keep trying.
func TestTokenExchangeFailureIsNotRetryable(t *testing.T) {
	env := newLoginEnv(t, nil)

	request := env.createRequest()
	env.google.tokenErrorBody = `{"error":"invalid_grant"}`

	_, err := env.callback(request)
	require.Error(t, err)
	require.Contains(t, err.Error(), "token_exchange_failed")

	// The provider now works again, but the state token is spent.
	env.google.tokenErrorBody = ""
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.Error(t, err, "a burnt state token must not be usable after a failed exchange")
	require.ErrorIs(t, err, errStateNotUsable)
	require.Equal(t, failureCallbackReplayed, audit.failureClass)
	env.requireNoUser("user@example.com")
}

// M8. The provider must never write into the error the user or the audit log
// sees. Everything the provider sends is replaced by a failure class.
func TestProviderErrorTextNeverReachesTheCaller(t *testing.T) {
	env := newLoginEnv(t, nil)

	const providerText = "PROVIDER-SUPPLIED-MARKER-a1b2c3"
	request := env.createRequest()
	env.google.tokenErrorBody = `{"error":"invalid_grant","error_description":"` + providerText + `"}`

	_, err := env.callback(request)
	require.Error(t, err)
	require.NotContains(t, err.Error(), providerText,
		"provider text must not reach the caller")
	require.NotContains(t, trace.UserMessage(err), providerText,
		"provider text must not reach the user message")
	require.Contains(t, trace.UserMessage(err), auditFailureUserMessage)
	require.Contains(t, err.Error(), string(failureTokenExchange))
}

// M11. The SSO test flow builds a connector from the request spec. That
// connector must be validated too, or tctl sso test becomes a way to run a
// login against a connector the policy would refuse.
func TestSSOTestFlowValidatesTheConnectorSpec(t *testing.T) {
	env := newLoginEnv(t, nil)

	// Upstream types.NewOIDCConnector accepts an empty PKCE mode. Only the
	// fork policy refuses it, so the message proves the policy ran.
	spec := env.connector.(*types.OIDCConnectorV3).Spec
	spec.PKCEMode = ""

	_, err := env.service.CreateOIDCAuthRequest(context.Background(), types.OIDCAuthRequest{
		Type:              constants.OIDC,
		ConnectorID:       env.connector.GetName(),
		SSOTestFlow:       true,
		ConnectorSpec:     &spec,
		ClientRedirectURL: "http://127.0.0.1:1234/callback",
		ProxyAddress:      testProxyAddress,
	})
	require.Error(t, err, "the SSO test flow must apply the fork connector policy")
	require.Contains(t, err.Error(), "requires PKCE")
}

// The SSO test flow also refuses a spec that lost the Workspace allow-list.
// The allow-list lives in a metadata label, which the spec cannot carry, so
// the test flow fails closed.
func TestSSOTestFlowRefusesASpecWithoutTheAllowList(t *testing.T) {
	env := newLoginEnv(t, nil)

	spec := env.connector.(*types.OIDCConnectorV3).Spec

	_, err := env.service.CreateOIDCAuthRequest(context.Background(), types.OIDCAuthRequest{
		Type:              constants.OIDC,
		ConnectorID:       env.connector.GetName(),
		SSOTestFlow:       true,
		ConnectorSpec:     &spec,
		ClientRedirectURL: "http://127.0.0.1:1234/callback",
		ProxyAddress:      testProxyAddress,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "Google Workspace domain allow-list")
}

// The Teleport user is pinned to the Google subject. A Google account whose
// subject changed, or an account that was recreated under the same address,
// must not take over the existing Teleport user.
func TestLoginRefusesAChangedSubjectForAnExistingUser(t *testing.T) {
	env := newLoginEnv(t, nil)

	env.login()

	env.google.subject = "a-different-google-subject"
	_, err := env.callback(env.createRequest())
	require.Error(t, err, "a changed Google subject must not take over the existing user")
	require.Contains(t, err.Error(), "subject does not match the existing user")

	user, err := env.auth.GetUser(context.Background(), "user@example.com", false)
	require.NoError(t, err)
	require.Equal(t, "google-subject", user.GetOIDCIdentities()[0].UserID,
		"the stored subject must not change")
}

// A Google subject already bound to one Teleport user must not bind to a
// second one. A renamed Google account would otherwise collect accounts.
func TestLoginRefusesASubjectBoundToAnotherUser(t *testing.T) {
	env := newLoginEnv(t, func(c *types.OIDCConnectorV3) {
		// The whole-domain wildcard maps both addresses of this test. A raw
		// regexp is no longer an accepted claim value.
		c.Spec.ClaimsToRoles[0].Value = "*@example.com"
	})

	env.login()

	// The same Google account now presents a different address, so it maps to
	// a different Teleport user name.
	env.google.email = "renamed@example.com"
	_, err := env.callback(env.createRequest())
	require.Error(t, err, "one Google subject must not bind to a second Teleport user")
	require.Contains(t, err.Error(), "already bound to a different user")
	env.requireNoUser("renamed@example.com")
}

// hd alone must not carry the login. The email claim
// becomes the Teleport user name and feeds every trait, so its domain is
// allow-listed too, and the denial must come from that check rather than from
// role mapping further down.
func TestCallbackDeniesAnEmailDomainOutsideTheAllowList(t *testing.T) {
	env := newLoginEnv(t, nil)
	env.google.mutateClaims = func(c map[string]any) { c["email"] = "user@evil.example.net" }

	request := env.createRequest()
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.Error(t, err)
	require.Contains(t, err.Error(), "email domain is not allowed by this connector")
	require.Equal(t, failureEmailDomain, audit.failureClass,
		"the denial must come from the email domain check, not from role mapping")
	env.requireNoUser("user@evil.example.net")
}

// A Workspace tenant may hold secondary and alias
// domains, and this fork does not depend on how Google populates hd for them.
// The policy is therefore membership of both domains in the allow-list, not
// equality of the two. This test is the case that separates the two policies:
// hd and the email domain differ, and the login is allowed.
func TestLoginAllowsASecondaryWorkspaceDomain(t *testing.T) {
	env := newLoginEnv(t, func(c *types.OIDCConnectorV3) {
		c.Metadata.Labels[policy.WorkspaceDomainsLabel] = "example.com,alias.example.net"
		c.Spec.ClaimsToRoles[0].Value = "user@alias.example.net"
	})
	env.google.email = "user@alias.example.net"
	env.google.hostedDomain = "example.com"

	response, err := env.callback(env.createRequest())
	require.NoError(t, err, "an allow-listed secondary domain must be able to log in")
	require.Equal(t, "user@alias.example.net", response.Username)
}

// A verified Workspace account that no claim mapping names must be denied.
// Authentication is not authorization.
func TestLoginRefusesAnUnmappedUser(t *testing.T) {
	env := newLoginEnv(t, nil)

	env.google.email = "nobody@example.com"

	_, err := env.callback(env.createRequest())
	require.Error(t, err)
	require.Contains(t, err.Error(), "did not match any configured roles")
	env.requireNoUser("nobody@example.com")
}

// The audit attribute must report the mappings that
// actually granted the roles. All four values are reachable now that the group
// lookup exists. The groups and both arms live in groups_test.go, where the
// hermetic Cloud Identity is.
func TestAuditRoleSourceFollowsTheMappings(t *testing.T) {
	t.Run("email", func(t *testing.T) {
		env := newLoginEnv(t, nil)

		request := env.createRequest()
		audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
		require.NoError(t, err)
		require.Equal(t, roleSourceEmail, audit.roleSource)
	})

	t.Run("none", func(t *testing.T) {
		env := newLoginEnv(t, nil)
		env.google.email = "nobody@example.com"

		request := env.createRequest()
		audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
		require.Error(t, err)
		require.Equal(t, failureRoleMapping, audit.failureClass)
		require.Equal(t, roleSourceNone, audit.roleSource,
			"a login that matched no mapping must not report a role source")
	})
}

func TestCallbackSelectsTheRequestedLoginMode(t *testing.T) {
	t.Run("console issues certificates without a web session", func(t *testing.T) {
		env := newLoginEnv(t, nil)
		ctx := context.Background()

		sshKey, tlsKey, err := cryptosuites.GenerateUserSSHAndTLSKey(
			ctx, cryptosuites.GetCurrentSuiteFromAuthPreference(env.auth))
		require.NoError(t, err)
		sshPublicKey, err := ssh.NewPublicKey(sshKey.Public())
		require.NoError(t, err)
		tlsPublicKey, err := keys.MarshalPublicKey(tlsKey.Public())
		require.NoError(t, err)
		responseKey, err := secret.NewKey()
		require.NoError(t, err)

		clientRedirect := &url.URL{
			Scheme: "http",
			Host:   "127.0.0.1:12345",
			Path:   "/callback",
			RawQuery: url.Values{
				"secret_key": {responseKey.String()},
			}.Encode(),
		}
		request := env.authRequest()
		request.CreateWebSession = false
		request.SshPublicKey = ssh.MarshalAuthorizedKey(sshPublicKey)
		request.TlsPublicKey = tlsPublicKey
		request.ClientRedirectURL = clientRedirect.String()
		request.CertTTL = time.Hour

		created, err := env.service.CreateOIDCAuthRequest(ctx, request)
		require.NoError(t, err)
		env.google.visitAuthorization(created.RedirectURL)
		response, err := env.callback(created)
		require.NoError(t, err)
		require.Nil(t, response.Session)
		require.NotEmpty(t, response.Cert)
		require.NotEmpty(t, response.TLSCert)
		require.NotEmpty(t, response.HostSigners)

		httpRequest := httptest.NewRequest(http.MethodGet, "/webapi/oidc/callback", nil)
		redirect := NewPlugin().finishCallback(httptest.NewRecorder(), httpRequest, response)
		redirectURL, err := url.Parse(redirect)
		require.NoError(t, err)
		require.Equal(t, clientRedirect.Scheme, redirectURL.Scheme)
		require.Equal(t, clientRedirect.Host, redirectURL.Host)
		require.NotEmpty(t, redirectURL.Query().Get("response"))

		plainResponse, err := responseKey.Open([]byte(redirectURL.Query().Get("response")))
		require.NoError(t, err)
		var consoleResponse authclient.CLILoginResponse
		require.NoError(t, json.Unmarshal(plainResponse, &consoleResponse))
		require.Equal(t, response.Username, consoleResponse.Username)
		require.Equal(t, response.Cert, consoleResponse.Cert)
		require.Equal(t, response.TLSCert, consoleResponse.TLSCert)
	})

	t.Run("browser refuses a response without a session", func(t *testing.T) {
		response := &authclient.OIDCAuthResponse{
			Req: authclient.OIDCAuthRequest{CreateWebSession: true},
		}
		httpRequest := httptest.NewRequest(http.MethodGet, "/webapi/oidc/callback", nil)

		redirect := NewPlugin().finishCallback(httptest.NewRecorder(), httpRequest, response)
		require.Equal(t, sso.LoginFailedRedirectURL, redirect)
	})
}

// A pre-existing local Teleport user must not be taken over by a Google login
// that happens to carry the same name.
func TestLoginRefusesTakingOverALocalUser(t *testing.T) {
	env := newLoginEnv(t, nil)
	ctx := context.Background()

	local, err := types.NewUser("user@example.com")
	require.NoError(t, err)
	local.SetRoles([]string{"access"})
	_, err = env.auth.CreateUser(ctx, local)
	require.NoError(t, err)

	_, err = env.callback(env.createRequest())
	require.Error(t, err, "a Google login must not take over a local user")
	require.Contains(t, err.Error(), "is not an OIDC user")

	stored, err := env.auth.GetUser(ctx, "user@example.com", false)
	require.NoError(t, err)
	require.Empty(t, stored.GetOIDCIdentities(), "the local user must keep no OIDC identity")
}
