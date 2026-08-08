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

// Package policy holds the fork Google OIDC connector policy.
//
// It is a leaf package on purpose. lib/auth calls ValidateConnector from the
// connector write path, so this package must not import lib/auth.
package policy

import (
	"net/url"
	"slices"
	"strings"

	"github.com/gravitational/trace"

	"github.com/gravitational/teleport/api/constants"
	"github.com/gravitational/teleport/api/types"
)

const (
	// GoogleIssuer is the only issuer this fork accepts.
	GoogleIssuer = "https://accounts.google.com"

	// WorkspaceDomainsLabel is the connector metadata label that carries the
	// Google Workspace domain allow-list, as a comma-separated list.
	//
	// The issuer https://accounts.google.com serves EVERY Google account,
	// including personal gmail.com accounts. Without this allow-list any
	// Google user on the internet who reaches the callback can match a
	// permissive claims_to_roles mapping.
	WorkspaceDomainsLabel = "fork.teleport.dev/google-workspace-domains"

	// callbackPath is the only callback path this fork accepts.
	callbackPath = "/v1/webapi/oidc/callback"
)

// ValidateConnector applies the fork Google OIDC policy. The Auth Service
// write path and the login path both call it, so a connector cannot be stored
// and cannot be used unless it passes.
func ValidateConnector(conn types.OIDCConnector) error {
	if conn == nil {
		return trace.BadParameter("missing OIDC connector")
	}

	// No domain-wide delegation. The fork never holds Google credentials of
	// its own, and never impersonates a Workspace administrator.
	if conn.GetGoogleServiceAccount() != "" ||
		conn.GetGoogleServiceAccountURI() != "" ||
		conn.GetGoogleAdminEmail() != "" {
		return trace.BadParameter("this fork does not support Google service-account settings")
	}

	if conn.GetIssuerURL() != GoogleIssuer {
		return trace.BadParameter("this fork only supports the canonical Google OIDC issuer %q", GoogleIssuer)
	}
	if conn.GetPKCEMode() != constants.OIDCPKCEModeEnabled {
		return trace.BadParameter("this fork requires PKCE for Google OIDC connectors")
	}
	if conn.GetProvider() != "" {
		return trace.BadParameter("this fork does not support OIDC provider settings")
	}
	switch conn.GetRequestObjectMode() {
	case constants.OIDCRequestObjectModeUnknown, constants.OIDCRequestObjectModeNone:
	default:
		return trace.BadParameter("this fork does not support OIDC request objects")
	}
	if conn.IsMFAEnabled() {
		return trace.BadParameter("this fork does not support OIDC SSO MFA")
	}
	if conn.GetAllowUnverifiedEmail() {
		return trace.BadParameter("this fork requires verified OIDC email addresses")
	}
	if _, ok := conn.GetMaxAge(); ok {
		return trace.BadParameter("this fork does not support OIDC max_age")
	}
	if _, err := RedirectURL(conn); err != nil {
		return trace.Wrap(err)
	}

	workspaceDomains, err := WorkspaceDomains(conn)
	if err != nil {
		return trace.Wrap(err)
	}

	var hasEmailScope bool
	for _, scope := range conn.GetScope() {
		switch scope {
		case "openid":
		case "email":
			hasEmailScope = true
		case CloudIdentityGroupsReadScope:
			// Accepted. GroupLookupSettings below decides whether the rest of
			// the connector agrees with it.
		default:
			return trace.BadParameter("this fork does not support the OIDC scope %q", scope)
		}
	}
	if !hasEmailScope {
		return trace.BadParameter("this fork requires the email OIDC scope")
	}

	// Group lookup settings are checked before the claim mappings, so that a
	// groups mapping without the scope, or without a domain allow-list, is
	// named as such.
	if _, err := GroupLookupSettings(conn); err != nil {
		return trace.Wrap(err)
	}

	// A claim value is a matcher, not a literal string, so it is checked
	// against an allow-list grammar. See claimvalue.go.
	for _, mapping := range conn.GetClaimsToRoles() {
		grammar, ok := grammarForClaim(mapping.Claim)
		if !ok {
			return trace.BadParameter(
				"this fork only supports email and groups OIDC claim mappings, got %q", mapping.Claim)
		}
		if err := grammar.validate(mapping.Value, workspaceDomains); err != nil {
			return trace.Wrap(err)
		}
	}

	return nil
}

// WorkspaceDomains returns the Google Workspace domain allow-list of the
// connector. The list is required, and every login must carry a matching hd
// claim.
func WorkspaceDomains(conn types.OIDCConnector) ([]string, error) {
	raw := conn.GetMetadata().Labels[WorkspaceDomainsLabel]

	var domains []string
	for _, part := range strings.Split(raw, ",") {
		domain := strings.ToLower(strings.TrimSpace(part))
		if domain == "" {
			continue
		}
		if strings.ContainsAny(domain, "@/ \t*?") || !strings.Contains(domain, ".") ||
			strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") {
			return nil, trace.BadParameter("invalid Google Workspace domain %q in label %q", part, WorkspaceDomainsLabel)
		}
		if !slices.Contains(domains, domain) {
			domains = append(domains, domain)
		}
	}

	if len(domains) == 0 {
		return nil, trace.BadParameter(
			"this fork requires the Google Workspace domain allow-list in the connector label %q", WorkspaceDomainsLabel)
	}

	return domains, nil
}

// CheckHostedDomain denies a login whose hd claim is absent from, or does not
// match, the connector allow-list. Google sends hd only for a Workspace
// account, so an absent claim means a personal Google account.
func CheckHostedDomain(hostedDomain string, allowed []string) error {
	domain := strings.ToLower(strings.TrimSpace(hostedDomain))
	if domain == "" {
		return trace.AccessDenied("OIDC provider did not return a Google Workspace domain")
	}
	if !slices.Contains(allowed, domain) {
		return trace.AccessDenied("Google Workspace domain is not allowed by this connector")
	}
	return nil
}

// CheckEmailDomain denies a login whose email claim sits outside the connector
// allow-list.
//
// The hd claim is not enough on its own. Nothing else compares hd with the
// address that becomes the Teleport user name and that drives every
// claims_to_roles mapping, so the email domain is allow-listed here too. Both
// checks must pass.
//
// The two domains are NOT required to be equal. Google Workspace supports
// secondary and alias domains, and this fork does not depend on how Google
// populates hd for them. Requiring both to be allow-listed is stronger than
// the single hd check, and it still serves a legitimate multi-domain tenant.
func CheckEmailDomain(email string, allowed []string) error {
	address := strings.ToLower(strings.TrimSpace(email))
	at := strings.LastIndex(address, "@")
	if at <= 0 || at == len(address)-1 {
		return trace.AccessDenied("OIDC provider did not return a usable email address")
	}
	if !slices.Contains(allowed, address[at+1:]) {
		return trace.AccessDenied("email domain is not allowed by this connector")
	}
	return nil
}

// RedirectURL returns the single callback URL of the connector.
func RedirectURL(conn types.OIDCConnector) (*url.URL, error) {
	redirectURLs := conn.GetRedirectURLs()
	if len(redirectURLs) != 1 {
		return nil, trace.BadParameter("this fork requires exactly one OIDC redirect URL")
	}

	raw := redirectURLs[0]
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, trace.BadParameter("invalid OIDC redirect URL")
	}
	if parsed.Scheme != "https" ||
		parsed.Hostname() == "" ||
		parsed.User != nil ||
		parsed.RawQuery != "" ||
		parsed.ForceQuery ||
		strings.Contains(raw, "#") ||
		parsed.Path != callbackPath ||
		parsed.EscapedPath() != callbackPath {
		return nil, trace.BadParameter(
			"OIDC redirect URL must be an HTTPS URL with the exact callback path and no user info, query, or fragment")
	}
	return parsed, nil
}

// RedirectURLForProxy returns the callback URL, and checks that it belongs to
// the proxy that started the login.
func RedirectURLForProxy(conn types.OIDCConnector, proxyAddress string) (string, error) {
	parsed, err := RedirectURL(conn)
	if err != nil {
		return "", trace.Wrap(err)
	}
	if proxyAddress == "" {
		return "", trace.BadParameter("OIDC auth request is missing the proxy address")
	}
	if !strings.EqualFold(parsed.Host, proxyAddress) {
		return "", trace.BadParameter("OIDC redirect URL does not match the proxy address")
	}
	return conn.GetRedirectURLs()[0], nil
}

// ValidateAuthRequestMode permits browser, test, and console login requests.
func ValidateAuthRequestMode(req types.OIDCAuthRequest) error {
	console := !req.CreateWebSession && (len(req.SshPublicKey) != 0 || len(req.TlsPublicKey) != 0)
	if !req.CreateWebSession && !req.SSOTestFlow && !console {
		return trace.AccessDenied("OIDC auth request has no supported login mode")
	}
	return nil
}
