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
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/entitlements"
	"github.com/gravitational/teleport/lib/auth"
	"github.com/gravitational/teleport/lib/auth/authtest"
	"github.com/gravitational/teleport/lib/backend"
	"github.com/gravitational/teleport/lib/client/sso"
	"github.com/gravitational/teleport/lib/modules"
	"github.com/gravitational/teleport/lib/plugin"
	"github.com/gravitational/teleport/lib/web"
)

// fakeTeleportProcess is a stand-in for *service.TeleportProcess: the part of
// the real process that satisfies plugin.go's unexported authProcess
// interface (GetAuthServer, GetBackend). *service.TeleportProcess carries the
// same two methods (lib/service/service.go), so a registry callback that
// works against this fake works against the real process for the same reason.
type fakeTeleportProcess struct {
	authServer *auth.Server
	backend    backend.Backend
}

func (p *fakeTeleportProcess) GetAuthServer() *auth.Server { return p.authServer }
func (p *fakeTeleportProcess) GetBackend() backend.Backend { return p.backend }

// TestActivationTurnsOnGoogleOIDC reproduces, in order, exactly what
// Activate does before it hands control to common.Run, and then proves each
// of the three things the fork entrypoint exists to turn on:
//
//  1. entitlement live: the auth server built AFTER modules.SetModules reports
//     the OIDC entitlement through Ping, and AssertOIDCEntitlement agrees;
//  2. plugin registered: the registry accepted the plugin, and running the
//     registry's usage-reporting callback (the seam lib/service/service.go's
//     initAuthService calls after the local auth server is set) builds the
//     fork OIDC service and attaches it to the auth server without error;
//  3. routes reachable: registering the registry's handlers on a real
//     *web.Handler and a real *auth.APIServer, the way lib/web/apiserver.go
//     and lib/auth/apiserver.go do, makes the proxy and auth routes callable,
//     and calling the proxy login route runs the actual production closure
//     instead of a 404.
//
// Upstream tool/teleport/main.go never called modules.SetModules and never
// built a plugin registry, so none of this ran in the upstream binary. The
// fork calls Activate from tool/teleport/main.go so that it does. See
// TestActivationRequiresModulesBeforeServer below for the mutation that
// proves the ordering matters.
func TestActivationTurnsOnGoogleOIDC(t *testing.T) {
	ctx := context.Background()

	// Step 1 of Activate: install the entitlement wrapper. This
	// MUST run before the auth server is built, exactly as the doc comment on
	// modules.SetModules and on WithOIDC requires.
	prev := modules.GetModules()
	t.Cleanup(func() { modules.SetModules(prev) })
	modules.SetModules(WithOIDC(prev))

	// Stand-in for service.NewTeleport building the auth server: it captures
	// modules.GetModules() at construction time.
	srv, err := authtest.NewTestServer(authtest.ServerConfig{
		Auth: authtest.AuthServerConfig{
			Dir:         t.TempDir(),
			ClusterName: "localhost",
		},
	})
	require.NoError(t, err)
	t.Cleanup(func() { _ = srv.Auth().Close() })

	// PROOF 1: entitlement live. The auth server's own Ping reports OIDC as
	// enabled, and the assertion the plugin runs at InitAuthProcess time
	// agrees.
	require.NoError(t, AssertOIDCEntitlement(ctx, srv.Auth()),
		"the auth server built after modules.SetModules must report the OIDC entitlement live")

	// Step 2 of Activate: build the registry and install the fork
	// plugin, exactly as googleoidc.Install does.
	registry := plugin.NewRegistry()
	require.NoError(t, Install(registry))

	// PROOF 2: plugin registered, and its process hook actually runs.
	// lib/service/service.go's initAuthService calls
	// registry.InitUsageReporting right after the local auth server is set;
	// this reproduces that call. It re-runs AssertOIDCEntitlement internally
	// and then builds a *Service and calls srv.Auth().SetOIDCService(service).
	require.True(t, registry.IsRegistered(PluginName))
	process := &fakeTeleportProcess{authServer: srv.Auth(), backend: srv.AuthServer.Backend}
	require.NoError(t, registry.InitUsageReporting(process),
		"the plugin's process hook must accept a real auth server once the entitlement is live")

	// PROOF 3: routes reachable. lib/web/apiserver.go calls
	// RegisterProxyWebHandlers with *web.Handler, and lib/auth/apiserver.go
	// calls RegisterAuthWebHandlers with *auth.APIServer; reproduce both calls
	// through the registry, the same indirection the real process uses.
	handler := &web.Handler{}
	require.NoError(t, registry.RegisterProxyWebHandlers(handler))
	apiServer := &auth.APIServer{}
	require.NoError(t, registry.RegisterAuthWebHandlers(apiServer))

	proxyRoutes := []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/webapi/oidc/login/web"},
		{method: http.MethodPost, path: "/webapi/oidc/login/console"},
		{method: http.MethodGet, path: "/webapi/oidc/callback"},
	}
	for _, route := range proxyRoutes {
		handle, _, _ := handler.Lookup(route.method, route.path)
		require.NotNil(t, handle, "route %s was not registered on the proxy handler", route.path)
	}
	validateHandle, _, _ := apiServer.Lookup(http.MethodPost, "/v2/oidc/requests/validate")
	require.NotNil(t, validateHandle, "the callback validation route was not registered on the auth API server")

	// The login route is reachable and runs the real production closure: with
	// no proxy client configured it fails closed to the generic login-failed
	// page, rather than 404ing or panicking. web.Handler routing has no
	// dependency on a live proxy client at Lookup time, so this call exercises
	// the exact function the browser would hit.
	loginHandle, params, _ := handler.Lookup(http.MethodGet, "/webapi/oidc/login/web")
	require.NotNil(t, loginHandle)
	recorder := httptest.NewRecorder()
	loginHandle(recorder, httptest.NewRequest(http.MethodGet, "/webapi/oidc/login/web", nil), params)
	require.Equal(t, http.StatusFound, recorder.Code)
	require.Equal(t, sso.LoginFailedRedirectURL, recorder.Header().Get("Location"))
}

// TestActivationRequiresModulesBeforeServer is the negative case behind PROOF
// 2 above. It builds the auth server WITHOUT installing the modules wrapper
// first (the ordering bug the doc comments on modules.SetModules, WithOIDC and
// AssertOIDCEntitlement all warn about), then runs the exact same registry
// call. It must fail, and fail with the message AssertOIDCEntitlement
// produces, not with some unrelated error.
//
// This test is the mutation-proof for TestActivationTurnsOnGoogleOIDC: if
// TestActivationTurnsOnGoogleOIDC's own modules.SetModules(WithOIDC(prev))
// call is removed, the auth server built afterward stops reporting the
// entitlement and that test fails the exact same way this one intentionally
// does. See the report at /tmp/oidc-verify/19-activation-k8s.md for the
// pasted go test output of that mutation.
func TestActivationRequiresModulesBeforeServer(t *testing.T) {
	prev := modules.GetModules()
	t.Cleanup(func() { modules.SetModules(prev) })
	// Deliberately do NOT call modules.SetModules(WithOIDC(prev)) here. The
	// auth server below is built against whatever modules value is already
	// installed, which in a normal test run is the OSS default with OIDC off.
	require.False(t, modules.GetModules().Features().GetEntitlement(entitlements.OIDC).Enabled,
		"baseline: OIDC must be off, or this negative case proves nothing")

	srv, err := authtest.NewTestServer(authtest.ServerConfig{
		Auth: authtest.AuthServerConfig{
			Dir:         t.TempDir(),
			ClusterName: "localhost",
		},
	})
	require.NoError(t, err)
	t.Cleanup(func() { _ = srv.Auth().Close() })

	registry := plugin.NewRegistry()
	require.NoError(t, Install(registry))

	process := &fakeTeleportProcess{authServer: srv.Auth(), backend: srv.AuthServer.Backend}
	err = registry.InitUsageReporting(process)
	require.Error(t, err, "the plugin must refuse to attach to an auth server that does not report the OIDC entitlement")
	require.ErrorContains(t, err, "does not report the OIDC entitlement")
}
