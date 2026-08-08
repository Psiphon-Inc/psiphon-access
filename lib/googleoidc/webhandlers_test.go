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
	"time"

	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/api/utils/keys/hardwarekey"
	"github.com/gravitational/teleport/lib/client"
	"github.com/gravitational/teleport/lib/web"
)

// loginHTTPRequest builds the browser request the proxy login route receives.
func loginHTTPRequest(host string) *http.Request {
	r := httptest.NewRequest(http.MethodGet,
		"/webapi/oidc/login/web?connector_id=google&redirect_url=/web", nil)
	r.Host = host
	r.Header.Set("User-Agent", "test-agent")
	return r
}

func loginParams() *web.SSORequestParams {
	return &web.SSORequestParams{
		ClientRedirectURL: "/web",
		ConnectorID:       "google",
		CSRFToken:         "csrf-token",
	}
}

// The proxy login route must carry the host the browser asked for. Without it
// policy.RedirectURLForProxy has nothing to compare and browser login is
// impossible.
func TestLoginRequestCarriesTheProxyAddress(t *testing.T) {
	t.Parallel()

	request := authRequestForLogin(loginHTTPRequest(testProxyAddress), loginParams(), "127.0.0.1")

	require.Equal(t, testProxyAddress, request.ProxyAddress)
	require.True(t, request.CreateWebSession)
	require.Equal(t, "google", request.ConnectorID)
	require.Equal(t, "csrf-token", request.CSRFToken)
	require.Equal(t, "/web", request.ClientRedirectURL)
	require.Equal(t, "127.0.0.1", request.ClientLoginIP)
	require.Equal(t, "test-agent", request.ClientUserAgent)
}

func TestConsoleLoginRequestCarriesClientParameters(t *testing.T) {
	t.Parallel()

	sshAttestation := new(hardwarekey.AttestationStatement)
	tlsAttestation := new(hardwarekey.AttestationStatement)
	consoleRequest := &client.SSOLoginConsoleReq{
		RedirectURL: "http://127.0.0.1:12345/callback?secret_key=test",
		UserPublicKeys: client.UserPublicKeys{
			SSHPubKey:               []byte("ssh-key"),
			TLSPubKey:               []byte("tls-key"),
			SSHAttestationStatement: sshAttestation,
			TLSAttestationStatement: tlsAttestation,
		},
		CertTTL:           time.Hour,
		ConnectorID:       "google",
		Compatibility:     "oldssh",
		Scope:             "scope",
		RouteToCluster:    "leaf",
		KubernetesCluster: "kube",
	}
	httpRequest := httptest.NewRequest(http.MethodPost, "/webapi/oidc/login/console", nil)
	httpRequest.Host = testProxyAddress

	request := authRequestForConsoleLogin(httpRequest, consoleRequest, "127.0.0.1")

	require.False(t, request.CreateWebSession)
	require.Equal(t, consoleRequest.ConnectorID, request.ConnectorID)
	require.Equal(t, consoleRequest.SSHPubKey, request.SshPublicKey)
	require.Equal(t, consoleRequest.TLSPubKey, request.TlsPublicKey)
	require.Equal(t, sshAttestation.ToProto(), request.SshAttestationStatement)
	require.Equal(t, tlsAttestation.ToProto(), request.TlsAttestationStatement)
	require.Equal(t, consoleRequest.CertTTL, request.CertTTL)
	require.Equal(t, consoleRequest.RedirectURL, request.ClientRedirectURL)
	require.Equal(t, consoleRequest.Compatibility, request.Compatibility)
	require.Equal(t, consoleRequest.RouteToCluster, request.RouteToCluster)
	require.Equal(t, consoleRequest.KubernetesCluster, request.KubernetesCluster)
	require.Equal(t, "127.0.0.1", request.ClientLoginIP)
	require.Equal(t, consoleRequest.Scope, request.Scope)
	require.Equal(t, testProxyAddress, request.ProxyAddress)
}

// The proxy address the route reports is the browser Host, so a request that
// arrives at a host the connector does not name is refused by the real Auth
// Service. The check is not relaxed: it is satisfied only by the right proxy.
func TestLoginRequestFromAnotherHostIsRefused(t *testing.T) {
	env := newLoginEnv(t, nil)
	ctx := context.Background()

	good := authRequestForLogin(loginHTTPRequest(testProxyAddress), loginParams(), "127.0.0.1")
	_, err := env.service.CreateOIDCAuthRequest(ctx, good)
	require.NoError(t, err, "the connector proxy must be accepted")

	bad := authRequestForLogin(loginHTTPRequest("evil.example.net:3080"), loginParams(), "127.0.0.1")
	_, err = env.service.CreateOIDCAuthRequest(ctx, bad)
	require.Error(t, err, "a login that arrives at another host must be refused")
	require.Contains(t, err.Error(), "does not match the proxy address")
}
