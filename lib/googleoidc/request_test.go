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
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"

	"github.com/gravitational/teleport/api/constants"
	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/googleoidc/policy"
)

func testConnector(t *testing.T) types.OIDCConnector {
	t.Helper()

	return &types.OIDCConnectorV3{
		Kind:    types.KindOIDC,
		Version: types.V3,
		Metadata: types.Metadata{
			Name: "google",
			Labels: map[string]string{
				policy.WorkspaceDomainsLabel: "example.com",
			},
		},
		Spec: types.OIDCConnectorSpecV3{
			IssuerURL:    policy.GoogleIssuer,
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
}

func testOAuth2Config() *oauth2.Config {
	return &oauth2.Config{
		ClientID:    "client-id",
		RedirectURL: "https://proxy.example.com:3080/v1/webapi/oidc/callback",
		Scopes:      []string{"openid", "email"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  googleAuthorizationEndpoint,
			TokenURL: googleTokenEndpoint,
		},
	}
}

// THE NONCE MUST NOT BE THE STATE TOKEN. The state token travels in the
// browser URL, so it reaches browser history, Referer headers, and proxy logs.
// The old fork prototype reused it as the nonce.
func TestNonceIsIndependentOfTheStateToken(t *testing.T) {
	t.Parallel()

	seenState := map[string]bool{}
	seenNonce := map[string]bool{}

	for range 200 {
		secrets, err := newRequestSecrets()
		require.NoError(t, err)

		require.NotEmpty(t, secrets.state)
		require.NotEmpty(t, secrets.nonce)
		require.NotEmpty(t, secrets.verifier)

		require.NotEqual(t, secrets.state, secrets.nonce, "the nonce must not be the state token")
		require.NotEqual(t, secrets.state, secrets.verifier)
		require.NotEqual(t, secrets.nonce, secrets.verifier)

		require.False(t, seenState[secrets.state], "state token repeated")
		require.False(t, seenNonce[secrets.nonce], "nonce repeated")
		require.False(t, seenNonce[secrets.state], "a state token was reused as a nonce")
		seenState[secrets.state] = true
		seenNonce[secrets.nonce] = true
	}
}

// The authorization URL must carry the independent nonce, not the state token.
func TestAuthCodeURLCarriesAnIndependentNonce(t *testing.T) {
	t.Parallel()

	secrets, err := newRequestSecrets()
	require.NoError(t, err)

	connector := testConnector(t)
	req := &types.OIDCAuthRequest{
		StateToken:   secrets.state,
		PkceVerifier: secrets.verifier,
	}

	raw := authCodeURL(testOAuth2Config(), connector, req, secrets.nonce, []string{"example.com"})

	parsed, err := url.Parse(raw)
	require.NoError(t, err)
	q := parsed.Query()

	require.Equal(t, secrets.state, q.Get("state"))
	require.Equal(t, secrets.nonce, q.Get("nonce"))
	require.NotEqual(t, q.Get("state"), q.Get("nonce"), "the nonce must not be the state token")

	// PKCE must be requested with S256, and the verifier itself must never
	// appear in the URL.
	require.Equal(t, "S256", q.Get("code_challenge_method"))
	require.NotEmpty(t, q.Get("code_challenge"))
	require.NotContains(t, raw, secrets.verifier)

	// The Workspace hint is present. It is a hint only, the callback checks
	// the hd claim.
	require.Equal(t, "example.com", q.Get("hd"))
}
