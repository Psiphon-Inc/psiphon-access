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
	"crypto/tls"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gravitational/trace"
	"github.com/julienschmidt/httprouter"

	"github.com/gravitational/teleport"
	"github.com/gravitational/teleport/lib/auth"
	"github.com/gravitational/teleport/lib/auth/authclient"
	"github.com/gravitational/teleport/lib/backend"
	"github.com/gravitational/teleport/lib/httplib"
	"github.com/gravitational/teleport/lib/plugin"
	"github.com/gravitational/teleport/lib/services"
	logutils "github.com/gravitational/teleport/lib/utils/log"
	"github.com/gravitational/teleport/lib/web"
)

// PluginName is the registry name of the fork OIDC plugin.
const PluginName = "google-oidc"

// Plugin adds the fork OIDC routes and the fork OIDC runtime to a Teleport
// process, so that neither lib/web/apiserver.go nor lib/auth/apiserver.go nor
// lib/service/service.go has to be patched.
type Plugin struct {
	logger *slog.Logger
}

var _ plugin.Plugin = (*Plugin)(nil)

// NewPlugin returns the fork OIDC plugin.
func NewPlugin() *Plugin {
	return &Plugin{logger: logutils.NewPackageLogger(teleport.ComponentKey, "google-oidc")}
}

// GetName returns the plugin name.
func (p *Plugin) GetName() string { return PluginName }

// Install registers the plugin and its process hook on a registry. Call it
// from Activate, before service.NewTeleport.
func Install(registry plugin.Registry) error {
	if registry == nil {
		return trace.BadParameter("missing plugin registry")
	}

	p := NewPlugin()
	if err := registry.Add(p); err != nil {
		return trace.Wrap(err)
	}

	// The registry hands the process to this callback inside initAuthService,
	// right after the local auth server is set. It is the only seam that
	// carries both the auth server and the backend, and it needs no upstream
	// change.
	registry.SetUsageReportingInitFunc(p.InitAuthProcess)

	return nil
}

// authProcess is the part of *service.TeleportProcess this plugin needs.
type authProcess interface {
	GetAuthServer() *auth.Server
	GetBackend() backend.Backend
}

// InitAuthProcess builds the OIDC service and registers it with the auth
// server. It also asserts that the OIDC entitlement is live.
func (p *Plugin) InitAuthProcess(process any) error {
	ctx := context.Background()

	proc, ok := process.(authProcess)
	if !ok {
		return trace.BadParameter("expected a Teleport process with an auth server, got %T", process)
	}

	authServer := proc.GetAuthServer()
	if authServer == nil {
		return trace.BadParameter("the Teleport process has no auth server")
	}

	// Fail loudly when modules.SetModules ran too late. Without this the gate
	// stays closed and the only symptom is AccessDenied at login time.
	if err := AssertOIDCEntitlement(ctx, authServer); err != nil {
		return trace.Wrap(err)
	}

	service, err := NewService(ServiceConfig{
		AuthServer: authServer,
		Backend:    proc.GetBackend(),
		Logger:     p.logger,
	})
	if err != nil {
		return trace.Wrap(err)
	}

	authServer.SetOIDCService(service)
	p.logger.InfoContext(ctx, "Registered the fork Google OIDC service")

	return nil
}

// RegisterAuthServices is not used by this plugin.
func (p *Plugin) RegisterAuthServices(context.Context, any, func() (*tls.Certificate, error)) error {
	return nil
}

// RegisterAuthWebHandlers adds the callback validation route the proxy calls.
//
// lib/auth/apiserver.go:186 calls this with &srv, built at line 121 as
// APIServer{...}, so the concrete type is *auth.APIServer.
func (p *Plugin) RegisterAuthWebHandlers(service any) error {
	srv, ok := service.(*auth.APIServer)
	if !ok {
		return trace.BadParameter("expected *auth.APIServer, got %T", service)
	}

	srv.POST("/:version/oidc/requests/validate", srv.WithAuth(validateCallbackHandler))

	return nil
}

// validateCallbackHandler serves /:version/oidc/requests/validate. The client
// side is authclient.HTTPClient.ValidateOIDCAuthCallback.
func validateCallbackHandler(
	clt *auth.ServerWithRoles,
	w http.ResponseWriter,
	r *http.Request,
	p httprouter.Params,
	version string,
) (any, error) {
	var req authclient.ValidateOIDCAuthCallbackReq
	if err := httplib.ReadJSON(r, &req); err != nil {
		return nil, trace.Wrap(err)
	}

	response, err := clt.ValidateOIDCAuthCallback(r.Context(), req.Query)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	raw := authclient.OIDCAuthRawResponse{
		Username:      response.Username,
		Identity:      response.Identity,
		Cert:          response.Cert,
		TLSCert:       response.TLSCert,
		Req:           response.Req,
		ClientOptions: response.ClientOptions,
	}
	if response.Session != nil {
		rawSession, err := services.MarshalWebSession(
			response.Session, services.WithVersion(version), services.PreserveRevision())
		if err != nil {
			return nil, trace.Wrap(err)
		}
		raw.Session = rawSession
	}
	raw.HostSigners = make([]json.RawMessage, len(response.HostSigners))
	for i, ca := range response.HostSigners {
		data, err := services.MarshalCertAuthority(
			ca, services.WithVersion(version), services.PreserveRevision())
		if err != nil {
			return nil, trace.Wrap(err)
		}
		raw.HostSigners[i] = data
	}

	return &raw, nil
}

// RegisterProxyWebHandlers adds the browser, console, and callback routes.
//
// lib/web/apiserver.go:830 calls this with h, built at line 573 as
// &Handler{...}, so the concrete type is *web.Handler.
func (p *Plugin) RegisterProxyWebHandlers(handler any) error {
	h, ok := handler.(*web.Handler)
	if !ok {
		return trace.BadParameter("expected *web.Handler, got %T", handler)
	}

	// WithRedirect and WithMetaRedirect take an unexported named type. A
	// function literal has an unnamed type with the same underlying type, so
	// it is assignable from this package. WithLimiter takes the exported
	// httplib.HandlerFunc, so it needs no such trick.
	//
	// The console route is rate limited and the two browser routes are not,
	// which is what upstream does for its own SSO routes.
	h.GET("/webapi/oidc/login/web", h.WithRedirect(p.loginWeb(h)))
	h.POST("/webapi/oidc/login/console", h.WithLimiter(p.loginConsole(h)))
	h.GET("/webapi/oidc/callback", h.WithMetaRedirect(p.callback(h)))

	return nil
}
