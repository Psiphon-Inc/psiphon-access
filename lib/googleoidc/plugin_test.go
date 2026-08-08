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
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/lib/auth"
	"github.com/gravitational/teleport/lib/client/sso"
	"github.com/gravitational/teleport/lib/plugin"
	"github.com/gravitational/teleport/lib/web"
)

// The real registry accepts the fork plugin.
func TestPluginIsAcceptedByRegistry(t *testing.T) {
	t.Parallel()

	registry := plugin.NewRegistry()
	require.NoError(t, Install(registry))
	require.True(t, registry.IsRegistered(PluginName))

	require.Error(t, Install(nil))
}

// lib/web/apiserver.go calls RegisterProxyWebHandlers with *web.Handler.
func TestRegisterProxyWebHandlers(t *testing.T) {
	t.Parallel()

	registry := plugin.NewRegistry()
	require.NoError(t, Install(registry))

	h := &web.Handler{}
	require.NoError(t, registry.RegisterProxyWebHandlers(h))

	routes := []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/webapi/oidc/login/web"},
		{method: http.MethodPost, path: "/webapi/oidc/login/console"},
		{method: http.MethodGet, path: "/webapi/oidc/callback"},
	}
	for _, route := range routes {
		handle, _, _ := h.Lookup(route.method, route.path)
		require.NotNil(t, handle, "route %s was not registered", route.path)
	}
}

// lib/auth/apiserver.go calls RegisterAuthWebHandlers with *auth.APIServer.
func TestRegisterAuthWebHandlers(t *testing.T) {
	t.Parallel()

	registry := plugin.NewRegistry()
	require.NoError(t, Install(registry))

	srv := &auth.APIServer{}
	require.NoError(t, registry.RegisterAuthWebHandlers(srv))

	handle, _, _ := srv.Lookup(http.MethodPost, "/v2/oidc/requests/validate")
	require.NotNil(t, handle, "the callback validation route was not registered")
}

// The registry passes the handler as any, so a wrong dynamic type must be a
// clear runtime error.
func TestRegisterRejectsWrongTypes(t *testing.T) {
	t.Parallel()

	p := NewPlugin()

	err := p.RegisterProxyWebHandlers("not a handler")
	require.Error(t, err)
	require.Contains(t, err.Error(), "expected *web.Handler, got string")

	err = p.RegisterAuthWebHandlers(42)
	require.Error(t, err)
	require.Contains(t, err.Error(), "expected *auth.APIServer, got int")

	err = p.InitAuthProcess("not a process")
	require.Error(t, err)
	require.Contains(t, err.Error(), "auth server")
}

// The login route is a redirect handler. It runs from outside lib/web, and it
// sends the browser to the failure page when the proxy client is missing.
func TestLoginRouteRuns(t *testing.T) {
	t.Parallel()

	h := &web.Handler{}
	require.NoError(t, NewPlugin().RegisterProxyWebHandlers(h))

	handle, params, _ := h.Lookup(http.MethodGet, "/webapi/oidc/login/web")
	require.NotNil(t, handle)

	recorder := httptest.NewRecorder()
	handle(recorder, httptest.NewRequest(http.MethodGet, "/webapi/oidc/login/web", nil), params)

	require.Equal(t, http.StatusFound, recorder.Code)
	require.Equal(t, sso.LoginFailedRedirectURL, recorder.Header().Get("Location"))
}
