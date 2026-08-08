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
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gravitational/trace"
	"golang.org/x/oauth2"

	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/auth"
	"github.com/gravitational/teleport/lib/client/sso"
	"github.com/gravitational/teleport/lib/defaults"
	"github.com/gravitational/teleport/lib/googleoidc/policy"
	"github.com/gravitational/teleport/lib/utils"
)

// providerTimeout bounds every call to the provider.
const providerTimeout = 15 * time.Second

// createAuthRequest builds the authorization URL and stores the request.
func (s *Service) createAuthRequest(ctx context.Context, req types.OIDCAuthRequest) (*types.OIDCAuthRequest, error) {
	if len(req.ClientUserAgent) > maxAuditUserAgentBytes || !utf8.ValidString(req.ClientUserAgent) {
		req.ClientUserAgent = ""
	}

	if err := policy.ValidateAuthRequestMode(req); err != nil {
		return nil, trace.Wrap(err)
	}

	connector, err := s.getConnector(ctx, req)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	domains, err := policy.WorkspaceDomains(connector)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	if !req.CreateWebSession {
		ceremonyType := sso.CeremonyTypeLogin
		if req.SSOTestFlow {
			ceremonyType = sso.CeremonyTypeTest
		}
		if err := sso.ValidateClientRedirect(req.ClientRedirectURL, ceremonyType, connector.GetClientRedirectSettings()); err != nil {
			return nil, trace.Wrap(err, auth.InvalidClientRedirectErrorMessage)
		}
	}

	secrets, err := newRequestSecrets()
	if err != nil {
		return nil, trace.Wrap(err)
	}
	req.PkceVerifier = secrets.verifier
	req.StateToken = secrets.state
	nonce := secrets.nonce

	callbackURL, err := policy.RedirectURLForProxy(connector, req.ProxyAddress)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	config, err := s.newOAuth2Config(ctx, connector, callbackURL)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	req.RedirectURL = authCodeURL(config, connector, &req, nonce, domains)

	// Store the nonce before the request, so that a callback can never find a
	// request without its nonce.
	if err := s.state.PutNonce(ctx, req.StateToken, nonce); err != nil {
		return nil, trace.Wrap(err)
	}

	s.logger.DebugContext(ctx, "Creating OIDC auth request", "connector", connector.GetName())
	if err := s.auth.Services.CreateOIDCAuthRequest(ctx, req, defaults.OIDCAuthRequestTTL); err != nil {
		return nil, trace.Wrap(err)
	}

	return &req, nil
}

// requestSecrets holds the per-login random values.
type requestSecrets struct {
	// state is the OAuth2 state token. It travels in the browser URL.
	state string
	// nonce binds the ID token to this login. It never travels in a URL the
	// browser sees.
	nonce string
	// verifier is the PKCE verifier.
	verifier string
}

// newRequestSecrets returns fresh, independent values for one login.
//
// The nonce must NOT be the state token. The state token lands in browser
// history, in a Referer header, and in a proxy log, so a nonce equal to it is
// not secret and cannot bind the ID token to this login.
func newRequestSecrets() (requestSecrets, error) {
	state, err := utils.CryptoRandomHex(defaults.TokenLenBytes)
	if err != nil {
		return requestSecrets{}, trace.Wrap(err)
	}

	nonce, err := utils.CryptoRandomHex(defaults.TokenLenBytes)
	if err != nil {
		return requestSecrets{}, trace.Wrap(err)
	}

	// Always generate a fresh PKCE verifier and ignore any caller-supplied
	// value. A caller that can influence the verifier, directly or by replaying
	// an earlier value, could weaken or defeat the PKCE exchange.
	return requestSecrets{state: state, nonce: nonce, verifier: oauth2.GenerateVerifier()}, nil
}

// authCodeURL builds the provider authorization URL.
func authCodeURL(
	config *oauth2.Config,
	connector types.OIDCConnector,
	req *types.OIDCAuthRequest,
	nonce string,
	domains []string,
) string {
	opts := make([]oauth2.AuthCodeOption, 0, 6)
	opts = append(opts,
		oauth2.SetAuthURLParam("nonce", nonce),
		oauth2.S256ChallengeOption(req.PkceVerifier),
		// hd asks Google to offer only accounts of the allowed Workspace
		// domains. It is a hint for the user, not a control: the callback
		// checks the hd claim of the ID token.
		oauth2.SetAuthURLParam("hd", strings.Join(domains, ",")),
	)
	if req.LoginHint != "" {
		opts = append(opts, oauth2.SetAuthURLParam("login_hint", req.LoginHint))
	}
	if prompt := connector.GetPrompt(); prompt != "" {
		opts = append(opts, oauth2.SetAuthURLParam("prompt", prompt))
	}
	if acr := connector.GetACR(); acr != "" {
		opts = append(opts, oauth2.SetAuthURLParam("acr_values", acr))
	}

	return config.AuthCodeURL(req.StateToken, opts...)
}
