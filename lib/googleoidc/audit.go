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
	"unicode/utf8"

	"github.com/gravitational/trace"

	"github.com/gravitational/teleport/api/types"
	apievents "github.com/gravitational/teleport/api/types/events"
	"github.com/gravitational/teleport/lib/auth/authclient"
	"github.com/gravitational/teleport/lib/events"
)

// failureClass is the coarse reason a login failed. The audit event carries
// the class, never the provider error text, so that a provider cannot write
// into the audit log.
type failureClass string

const (
	failureProviderError         failureClass = "provider_error"
	failureInvalidCallback       failureClass = "invalid_callback"
	failureUnknownState          failureClass = "unknown_state"
	failureCallbackReplayed      failureClass = "callback_replayed"
	failureRequestValidation     failureClass = "request_validation_failed"
	failureConnectorResolution   failureClass = "connector_resolution_failed"
	failurePKCEVerification      failureClass = "pkce_verification_failed"
	failureRedirectValidation    failureClass = "redirect_validation_failed"
	failureProviderConfiguration failureClass = "provider_configuration_failed"
	failureTokenExchange         failureClass = "token_exchange_failed"
	failureIDTokenValidation     failureClass = "id_token_validation_failed"
	failureIdentityValidation    failureClass = "identity_validation_failed"
	failureHostedDomain          failureClass = "hosted_domain_denied"
	failureEmailDomain           failureClass = "email_domain_denied"
	failureClaimsProcessing      failureClass = "claims_processing_failed"
	failureRoleMapping           failureClass = "role_mapping_failed"
	failureUserCreation          failureClass = "user_creation_failed"
	failureLoginHook             failureClass = "login_hook_failed"
	failureUserState             failureClass = "user_state_failed"
	failureCredentialIssuance    failureClass = "credential_issuance_failed"
	failureInternal              failureClass = "internal_error"
)

const (
	// roleSource values report which claim family granted the roles of a
	// login. The audit event carries the value the mappings actually produced.
	//
	roleSourceEmail  = "email"
	roleSourceGroups = "groups"
	roleSourceBoth   = "both"
	roleSourceNone   = "none"

	// auditFailureUserMessage is the only text a failed login shows the user.
	auditFailureUserMessage = "OIDC login failed."

	// stateFailureUserMessage is the only text a callback whose state is
	// unknown or already spent shows the user. Both paths use it, so the
	// caller cannot tell the two apart.
	stateFailureUserMessage = "OIDC login session is not valid. Please start the login again."

	// maxAuditUserAgentBytes bounds the user agent the audit event records.
	maxAuditUserAgentBytes = 512
)

// callbackAudit collects what the login event reports.
type callbackAudit struct {
	emit                bool
	request             *types.OIDCAuthRequest
	connectorID         string
	failureClass        failureClass
	roleSource          string
	roleMappingWarnings int
	appliedLoginRules   []string

	// groupLookup is set when the connector looks group membership up. It
	// carries no provider text and no credential.
	groupLookup    *groupLookupResult
	groupLookupSet bool
}

// setGroupLookup records the outcome of one group lookup.
func (a *callbackAudit) setGroupLookup(result groupLookupResult) {
	copied := result
	copied.Groups = append([]string(nil), result.Groups...)
	a.groupLookup = &copied
	a.groupLookupSet = true
}

// groupAuditAttributes renders the group lookup for the login event.
//
// The class is one value, so it is always legible, and the counters say what
// each gate dropped.
func (a *callbackAudit) groupAuditAttributes() map[string]any {
	if !a.groupLookupSet || a.groupLookup == nil {
		return nil
	}
	result := a.groupLookup

	class := string(result.Outcome)
	if result.failed() {
		class = string(result.Failure)
	}

	attributes := map[string]any{
		"group_lookup_class":              class,
		"group_lookup_mode":               string(result.Mode),
		"group_count":                     len(result.Groups),
		"group_lookup_rejected_namespace": result.Rejected.Namespace,
		"group_lookup_rejected_label":     result.Rejected.Label,
		"group_lookup_rejected_syntax":    result.Rejected.Syntax,
		"group_lookup_rejected_domain":    result.Rejected.Domain,
	}
	return attributes
}

func newCallbackAudit() *callbackAudit {
	return &callbackAudit{roleSource: roleSourceNone}
}

func (a *callbackAudit) setRequest(request *types.OIDCAuthRequest) {
	a.emit = true
	a.request = request
	a.connectorID = request.ConnectorID
}

// providerError hides the provider error text behind a failure class.
func providerError(class failureClass, _ error) error {
	return trace.WithUserMessage(trace.AccessDenied("OIDC callback failed: %s", class), auditFailureUserMessage)
}

// roleMappingAudit reports how roles were calculated.
type roleMappingAudit struct {
	roleSource          string
	roleMappingWarnings int
	appliedLoginRules   []string
}

// emitLoginEvent writes the login event for one callback.
func (s *Service) emitLoginEvent(ctx context.Context, audit *callbackAudit, response *authclient.OIDCAuthResponse, callbackErr error) {
	testFlow := audit.request != nil && audit.request.SSOTestFlow
	success := callbackErr == nil

	code := events.UserSSOLoginCode
	switch {
	case success && testFlow:
		code = events.UserSSOTestFlowLoginCode
	case !success && testFlow:
		code = events.UserSSOTestFlowLoginFailureCode
	case !success:
		code = events.UserSSOLoginFailureCode
	}

	attributes := map[string]any{
		"role_source":           audit.roleSource,
		"sso_test_flow":         testFlow,
		"role_mapping_warnings": audit.roleMappingWarnings,
	}
	for name, value := range audit.groupAuditAttributes() {
		attributes[name] = value
	}
	encodedAttributes, err := apievents.EncodeMap(attributes)
	if err != nil {
		s.logger.WarnContext(ctx, "Failed to encode OIDC login audit attributes", "error", err)
	}

	event := &apievents.UserLogin{
		Metadata: apievents.Metadata{
			Type: events.UserLoginEvent,
			Code: code,
		},
		Method:             events.LoginMethodOIDC,
		IdentityAttributes: encodedAttributes,
		AppliedLoginRules:  append([]string(nil), audit.appliedLoginRules...),
		ConnectorID:        audit.connectorID,
		Status: apievents.Status{
			Success: success,
		},
	}

	if audit.request != nil {
		event.ConnectionMetadata.RemoteAddr = audit.request.ClientLoginIP
		if userAgent := audit.request.ClientUserAgent; userAgent != "" &&
			len(userAgent) <= maxAuditUserAgentBytes && utf8.ValidString(userAgent) {
			event.ClientMetadata.UserAgent = userAgent
		}
	}

	if success && response != nil {
		event.User = response.Username
	} else if !success {
		class := audit.failureClass
		if class == "" {
			class = failureInternal
		}
		event.Status.Error = string(class)
		event.Status.UserMessage = auditFailureUserMessage
	}

	if err := s.auth.EmitAuditEvent(ctx, event); err != nil {
		s.logger.WarnContext(ctx, "Failed to emit OIDC login audit event", "error", err)
	}
}
