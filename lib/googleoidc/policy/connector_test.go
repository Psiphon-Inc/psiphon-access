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

package policy

import (
	"testing"

	"github.com/gravitational/trace"
	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/api/constants"
	"github.com/gravitational/teleport/api/types"
)

// testConnector returns a connector that passes the fork policy.
func testConnector(t *testing.T, mutate ...func(*types.OIDCConnectorV3)) types.OIDCConnector {
	t.Helper()

	conn := &types.OIDCConnectorV3{
		Kind:    types.KindOIDC,
		Version: types.V3,
		Metadata: types.Metadata{
			Name: "google",
			Labels: map[string]string{
				WorkspaceDomainsLabel: "example.com",
			},
		},
		Spec: types.OIDCConnectorSpecV3{
			IssuerURL:    GoogleIssuer,
			ClientID:     "client-id",
			ClientSecret: "client-secret",
			RedirectURLs: []string{"https://proxy.example.com:3080/v1/webapi/oidc/callback"},
			Scope:        []string{"openid", "email"},
			PKCEMode:     string(constants.OIDCPKCEModeEnabled),
			ClaimsToRoles: []types.ClaimMapping{{
				Claim: "email",
				Value: "user@example.com",
				Roles: []string{"access"},
			}},
		},
	}

	for _, m := range mutate {
		m(conn)
	}

	return conn
}

func TestValidateConnector(t *testing.T) {
	t.Parallel()

	require.NoError(t, ValidateConnector(testConnector(t)))

	// The whole-domain wildcard is the second accepted shape.
	require.NoError(t, ValidateConnector(testConnector(t, func(c *types.OIDCConnectorV3) {
		c.Spec.ClaimsToRoles[0].Value = "*@example.com"
	})))

	tests := []struct {
		name   string
		mutate func(*types.OIDCConnectorV3)
		errIs  string
	}{
		{
			name:   "google service account",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.GoogleServiceAccount = "{}" },
			errIs:  "service-account",
		},
		{
			name:   "google service account uri",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.GoogleServiceAccountURI = "file:///sa.json" },
			errIs:  "service-account",
		},
		{
			name:   "google admin email",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.GoogleAdminEmail = "admin@example.com" },
			errIs:  "service-account",
		},
		{
			name:   "other issuer",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.IssuerURL = "https://login.example.com" },
			errIs:  "canonical Google OIDC issuer",
		},
		{
			name:   "pkce off",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.PKCEMode = string(constants.OIDCPKCEModeDisabled) },
			errIs:  "requires PKCE",
		},
		// The connector write path must reject every catch-all claim value.
		// The grammar itself is proven in claimvalue_test.go.
		{
			name:   "star claim mapping",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = "*" },
			errIs:  "user@domain or *@domain",
		},
		{
			name:   "double star claim mapping",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = "**" },
			errIs:  "user@domain or *@domain",
		},
		{
			name:   "star at star claim mapping",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = "*@*" },
			errIs:  "not a Google Workspace domain",
		},
		{
			name:   "catch-all regexp claim mapping",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = "^.*$" },
			errIs:  "raw regular expression",
		},
		{
			name:   "catch-all regexp group claim mapping",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = "^(.*)$" },
			errIs:  "raw regular expression",
		},
		{
			name:   "catch-all regexp class claim mapping",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = `^[\s\S]*$` },
			errIs:  "raw regular expression",
		},
		{
			name:   "claim mapping outside the workspace domain",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = "attacker@evil.example.net" },
			errIs:  "not a Google Workspace domain",
		},
		{
			name:   "empty claim mapping value",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = "" },
			errIs:  "cannot be empty",
		},
		{
			name:   "unsupported claim mapping",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Claim = "sub" },
			errIs:  "only supports email and groups OIDC claim mappings",
		},
		{
			name:   "groups claim mapping without the cloud identity scope",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Claim = "groups" },
			errIs:  "requires the OIDC scope",
		},
		{
			name:   "cloud identity scope without a groups claim mapping",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.Scope = append(c.Spec.Scope, CloudIdentityGroupsReadScope) },
			errIs:  "only accepted together with a groups claim mapping",
		},
		{
			name:   "no workspace domain label",
			mutate: func(c *types.OIDCConnectorV3) { c.Metadata.Labels = nil },
			errIs:  "Google Workspace domain allow-list",
		},
		{
			name: "empty workspace domain label",
			mutate: func(c *types.OIDCConnectorV3) {
				c.Metadata.Labels[WorkspaceDomainsLabel] = "  , "
			},
			errIs: "Google Workspace domain allow-list",
		},
		{
			name: "wildcard workspace domain",
			mutate: func(c *types.OIDCConnectorV3) {
				c.Metadata.Labels[WorkspaceDomainsLabel] = "*.example.com"
			},
			errIs: "invalid Google Workspace domain",
		},
		{
			name:   "unverified email allowed",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.AllowUnverifiedEmail = true },
			errIs:  "verified OIDC email",
		},
		{
			name: "http redirect url",
			mutate: func(c *types.OIDCConnectorV3) {
				c.Spec.RedirectURLs = []string{"http://proxy.example.com/v1/webapi/oidc/callback"}
			},
			errIs: "redirect URL",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := ValidateConnector(testConnector(t, test.mutate))
			require.Error(t, err)
			require.Contains(t, err.Error(), test.errIs)
		})
	}
}

func TestWorkspaceDomains(t *testing.T) {
	t.Parallel()

	domains, err := WorkspaceDomains(testConnector(t, func(c *types.OIDCConnectorV3) {
		c.Metadata.Labels[WorkspaceDomainsLabel] = " Example.COM , second.example.net ,example.com"
	}))
	require.NoError(t, err)
	require.Equal(t, []string{"example.com", "second.example.net"}, domains)
}

// A login must be denied unless the hd claim names an allowed Workspace
// domain. The issuer serves every Google account, including personal ones.
func TestCheckHostedDomain(t *testing.T) {
	t.Parallel()

	allowed := []string{"example.com", "second.example.net"}

	tests := []struct {
		name         string
		hostedDomain string
		wantErr      string
	}{
		{name: "match", hostedDomain: "example.com"},
		{name: "second domain", hostedDomain: "second.example.net"},
		{name: "case insensitive", hostedDomain: "ExAmPlE.CoM"},
		{name: "surrounding space", hostedDomain: " example.com "},
		{name: "mismatch", hostedDomain: "evil.com", wantErr: "not allowed"},
		{name: "personal account", hostedDomain: "gmail.com", wantErr: "not allowed"},
		{name: "suffix trick", hostedDomain: "notexample.com", wantErr: "not allowed"},
		{name: "absent", hostedDomain: "", wantErr: "did not return a Google Workspace domain"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := CheckHostedDomain(test.hostedDomain, allowed)
			if test.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
			require.Contains(t, err.Error(), test.wantErr)
		})
	}
}

// The hd claim is not cross-checked against the email claim anywhere else, so
// the email domain carries its own allow-list check.
func TestCheckEmailDomain(t *testing.T) {
	t.Parallel()

	allowed := []string{"example.com", "second.example.net"}

	tests := []struct {
		name    string
		email   string
		wantErr string
	}{
		{name: "match", email: "user@example.com"},
		{name: "second domain", email: "user@second.example.net"},
		{name: "case insensitive", email: "User@ExAmPlE.CoM"},
		{name: "surrounding space", email: " user@example.com "},
		{name: "foreign domain", email: "user@evil.com", wantErr: "not allowed"},
		{name: "personal account", email: "user@gmail.com", wantErr: "not allowed"},
		{name: "suffix trick", email: "user@notexample.com", wantErr: "not allowed"},
		{name: "allowed domain in the local part", email: "example.com@evil.com", wantErr: "not allowed"},
		{name: "trailing dot", email: "user@example.com.", wantErr: "not allowed"},
		{name: "absent", email: "", wantErr: "usable email address"},
		{name: "no domain part", email: "user", wantErr: "usable email address"},
		{name: "empty domain part", email: "user@", wantErr: "usable email address"},
		{name: "empty local part", email: "@example.com", wantErr: "usable email address"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := CheckEmailDomain(test.email, allowed)
			if test.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
			require.Contains(t, err.Error(), test.wantErr)
		})
	}
}

// A Workspace tenant may hold secondary and alias domains, so hd and the email
// domain may differ. Both must be allow-listed, and neither must equal the
// other. This is the case that separates the policy from an equality check.
func TestCheckEmailDomainAllowsASecondaryDomain(t *testing.T) {
	t.Parallel()

	allowed := []string{"example.com", "alias.example.net"}

	require.NoError(t, CheckHostedDomain("example.com", allowed))
	require.NoError(t, CheckEmailDomain("user@alias.example.net", allowed))
}

func TestRedirectURLForProxy(t *testing.T) {
	t.Parallel()

	conn := testConnector(t)

	url, err := RedirectURLForProxy(conn, "proxy.example.com:3080")
	require.NoError(t, err)
	require.Equal(t, "https://proxy.example.com:3080/v1/webapi/oidc/callback", url)

	_, err = RedirectURLForProxy(conn, "other.example.com:3080")
	require.Error(t, err)

	_, err = RedirectURLForProxy(conn, "")
	require.Error(t, err)
}

func TestValidateAuthRequestMode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		request types.OIDCAuthRequest
		allowed bool
	}{
		{
			name:    "browser",
			request: types.OIDCAuthRequest{CreateWebSession: true},
			allowed: true,
		},
		{
			name:    "SSO test",
			request: types.OIDCAuthRequest{SSOTestFlow: true},
			allowed: true,
		},
		{
			name:    "console with SSH key",
			request: types.OIDCAuthRequest{SshPublicKey: []byte("ssh-key")},
			allowed: true,
		},
		{
			name:    "console with TLS key",
			request: types.OIDCAuthRequest{TlsPublicKey: []byte("tls-key")},
			allowed: true,
		},
		{
			name:    "no login mode",
			request: types.OIDCAuthRequest{},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			err := ValidateAuthRequestMode(test.request)
			if test.allowed {
				require.NoError(t, err)
				return
			}
			require.True(t, trace.IsAccessDenied(err), "unexpected error: %v", err)
		})
	}
}
