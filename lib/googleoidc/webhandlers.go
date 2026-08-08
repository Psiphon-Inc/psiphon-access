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
	"net"
	"net/http"

	"github.com/gravitational/trace"
	"github.com/julienschmidt/httprouter"

	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/auth/authclient"
	"github.com/gravitational/teleport/lib/client"
	"github.com/gravitational/teleport/lib/client/sso"
	"github.com/gravitational/teleport/lib/httplib"
	"github.com/gravitational/teleport/lib/web"
)

// loginWeb starts a browser login. It returns the provider URL, and the proxy
// redirects the browser there.
func (p *Plugin) loginWeb(h *web.Handler) func(http.ResponseWriter, *http.Request, httprouter.Params) string {
	return func(w http.ResponseWriter, r *http.Request, _ httprouter.Params) string {
		ctx := r.Context()

		clt := h.GetProxyClient()
		if clt == nil {
			p.logger.ErrorContext(ctx, "Proxy client is not available")
			return sso.LoginFailedRedirectURL
		}

		req, err := web.ParseSSORequestParams(r)
		if err != nil {
			p.logger.ErrorContext(ctx, "Failed to extract SSO parameters from request", "error", err)
			return sso.LoginFailedRedirectURL
		}

		remoteAddr, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			p.logger.ErrorContext(ctx, "Failed to parse request remote address", "error", err)
			return sso.LoginFailedRedirectURL
		}

		response, err := clt.CreateOIDCAuthRequest(ctx, authRequestForLogin(r, req, remoteAddr))
		if err != nil {
			p.logger.ErrorContext(ctx, "Failed to create an OIDC auth request", "error", err)
			return sso.LoginFailedRedirectURL
		}

		return response.RedirectURL
	}
}

// loginConsole starts a console login and returns the provider URL.
func (p *Plugin) loginConsole(h *web.Handler) httplib.HandlerFunc {
	return func(_ http.ResponseWriter, r *http.Request, _ httprouter.Params) (any, error) {
		ctx := r.Context()

		clt := h.GetProxyClient()
		if clt == nil {
			p.logger.ErrorContext(ctx, "Proxy client is not available")
			return nil, trace.AccessDenied("%s", web.SSOLoginFailureMessage)
		}

		req := new(client.SSOLoginConsoleReq)
		if err := httplib.ReadResourceJSON(r, req); err != nil {
			p.logger.ErrorContext(ctx, "Failed to read the console login request")
			return nil, trace.AccessDenied("%s", web.SSOLoginFailureMessage)
		}
		if err := req.CheckAndSetDefaults(); err != nil {
			p.logger.ErrorContext(ctx, "Invalid console login request")
			return nil, trace.AccessDenied("%s", web.SSOLoginFailureMessage)
		}

		remoteAddr, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			p.logger.ErrorContext(ctx, "Failed to parse request remote address", "error", err)
			return nil, trace.AccessDenied("%s", web.SSOLoginFailureMessage)
		}

		response, err := clt.CreateOIDCAuthRequest(ctx, authRequestForConsoleLogin(r, req, remoteAddr))
		if err != nil {
			p.logger.ErrorContext(ctx, "Failed to create an OIDC console auth request", "error", err)
			return nil, trace.AccessDenied("%s", web.SSOLoginFailureMessage)
		}

		return &client.SSOLoginConsoleResponse{RedirectURL: response.RedirectURL}, nil
	}
}

// authRequestForConsoleLogin builds one console request. It never creates a
// web session.
func authRequestForConsoleLogin(r *http.Request, req *client.SSOLoginConsoleReq, remoteAddr string) types.OIDCAuthRequest {
	return types.OIDCAuthRequest{
		CreateWebSession:        false,
		ConnectorID:             req.ConnectorID,
		SshPublicKey:            req.SSHPubKey,
		TlsPublicKey:            req.TLSPubKey,
		SshAttestationStatement: req.SSHAttestationStatement.ToProto(),
		TlsAttestationStatement: req.TLSAttestationStatement.ToProto(),
		CertTTL:                 req.CertTTL,
		ClientRedirectURL:       req.RedirectURL,
		Compatibility:           req.Compatibility,
		RouteToCluster:          req.RouteToCluster,
		KubernetesCluster:       req.KubernetesCluster,
		ClientLoginIP:           remoteAddr,
		Scope:                   req.Scope,
		ProxyAddress:            r.Host,
	}
}

// authRequestForLogin builds the auth request of one browser login.
//
// ProxyAddress carries the host the browser asked for. The Auth Service checks
// it against the connector redirect URL in policy.RedirectURLForProxy, so a
// login started through one proxy can never send the browser to the callback
// of another one. Without this field that check has nothing to compare, and
// every browser login fails closed.
func authRequestForLogin(r *http.Request, params *web.SSORequestParams, remoteAddr string) types.OIDCAuthRequest {
	return types.OIDCAuthRequest{
		CSRFToken:         params.CSRFToken,
		ConnectorID:       params.ConnectorID,
		CreateWebSession:  true,
		ClientRedirectURL: params.ClientRedirectURL,
		ClientLoginIP:     remoteAddr,
		ClientUserAgent:   r.UserAgent(),
		ProxyAddress:      r.Host,
		Scope:             params.Scope,
	}
}

// callback finishes a browser or console login. The Auth Service validates
// the provider response before this handler selects the requested login mode.
func (p *Plugin) callback(h *web.Handler) func(http.ResponseWriter, *http.Request, httprouter.Params) string {
	return func(w http.ResponseWriter, r *http.Request, _ httprouter.Params) string {
		ctx := r.Context()

		clt := h.GetProxyClient()
		if clt == nil {
			p.logger.ErrorContext(ctx, "Proxy client is not available")
			return sso.LoginFailedBadCallbackRedirectURL
		}

		response, err := clt.ValidateOIDCAuthCallback(ctx, r.URL.Query())
		if err != nil {
			// Log the error. It is already a bounded failure class, because
			// validateCallback returns sentinel errors and providerError, never
			// raw provider text. Dropping it leaves an operator with a failed
			// login and no cause.
			p.logger.ErrorContext(ctx, "Failed to process the OIDC callback", "error", err)
			return sso.LoginFailedBadCallbackRedirectURL
		}

		return p.finishCallback(w, r, response)
	}
}

func (p *Plugin) finishCallback(w http.ResponseWriter, r *http.Request, response *authclient.OIDCAuthResponse) string {
	ctx := r.Context()

	if response.Req.CreateWebSession {
		if response.Session == nil {
			p.logger.ErrorContext(ctx, "Browser OIDC response has no web session")
			return sso.LoginFailedRedirectURL
		}

		result := &web.SSOCallbackResponse{
			CSRFToken:         response.Req.CSRFToken,
			Username:          response.Username,
			SessionName:       response.Session.GetName(),
			SessionExpiry:     response.Session.Expiry(),
			ClientRedirectURL: response.Req.ClientRedirectURL,
		}

		// The CSRF check stays on. A callback that skips it accepts a login
		// that another site started.
		if err := web.SSOSetWebSessionAndRedirectURL(w, r, result, true); err != nil {
			p.logger.ErrorContext(ctx, "Failed to set the web session", "error", err)
			return sso.LoginFailedRedirectURL
		}

		if token := response.Session.GetDeviceWebToken(); token != nil {
			redirectPath, err := web.BuildDeviceWebRedirectPath(token, result.ClientRedirectURL)
			if err != nil {
				p.logger.DebugContext(ctx, "Invalid device web token", "error", err)
			}
			return redirectPath
		}

		return result.ClientRedirectURL
	}

	if len(response.Req.SSHPubKey)+len(response.Req.TLSPubKey) == 0 {
		p.logger.ErrorContext(ctx, "OIDC response is not a browser or console login")
		return sso.LoginFailedRedirectURL
	}

	redirectURL, err := web.ConstructSSHResponse(web.AuthParams{
		ClientRedirectURL: response.Req.ClientRedirectURL,
		Username:          response.Username,
		Identity:          response.Identity,
		Session:           response.Session,
		Cert:              response.Cert,
		TLSCert:           response.TLSCert,
		HostSigners:       response.HostSigners,
		// web.Handler has no exported FIPS accessor. The plugin cannot read
		// this setting without another upstream change.
		FIPS:          false,
		ClientOptions: response.ClientOptions,
	})
	if err != nil {
		p.logger.ErrorContext(ctx, "Failed to construct the console login response", "error", err)
		return sso.LoginFailedRedirectURL
	}

	return redirectURL.String()
}
