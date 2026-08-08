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
	"net/url"

	"github.com/gravitational/trace"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/gravitational/teleport/lib/defaults"
	teleoidc "github.com/gravitational/teleport/lib/oidc"
)

const (
	googleDiscoveryEndpoint     = "https://accounts.google.com/.well-known/openid-configuration"
	googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenEndpoint         = "https://oauth2.googleapis.com/token"
	googleJWKSEndpoint          = "https://www.googleapis.com/oauth2/v3/certs"

	// maxRedirects bounds the redirect chain when the allow-list permits one.
	maxRedirects = 10
)

// allowedEndpoints holds every URL the Auth Service may fetch itself. The
// authorization endpoint is not here: the browser goes there, not the server.
var allowedEndpoints = []string{
	googleDiscoveryEndpoint,
	googleTokenEndpoint,
	googleJWKSEndpoint,
}

// isAllowedEndpoint reports whether the fork may fetch this URL.
func isAllowedEndpoint(endpoint *url.URL) bool {
	if endpoint == nil {
		return false
	}
	target := endpoint.String()
	for _, allowed := range allowedEndpoints {
		if target == allowed {
			return true
		}
	}
	return false
}

// allowListRoundTripper denies every request that does not go to a Google OIDC
// endpoint. It is a thin layer over another round tripper, and it never
// replaces one: the layer below carries the upstream response size bound.
type allowListRoundTripper struct {
	next http.RoundTripper
}

func (t allowListRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if !isAllowedEndpoint(req.URL) {
		return nil, trace.AccessDenied("OIDC provider endpoint is not allowed")
	}
	return t.next.RoundTrip(req)
}

func (t allowListRoundTripper) CloseIdleConnections() {
	type closeIdler interface {
		CloseIdleConnections()
	}
	if next, ok := t.next.(closeIdler); ok {
		next.CloseIdleConnections()
	}
}

// RestrictClientToGoogle is a [teleoidc.ClientMutator]. It composes the
// endpoint allow-list OVER the transport the caller already installed.
//
// It must WRAP client.Transport, never replace it. lib/oidc installs
// [teleoidc.OIDCRoundTripper] there, which bounds the response body. A mutator
// that assigns a fresh transport drops that bound in silence, so this function
// fails instead when the transport is missing.
func RestrictClientToGoogle(client *http.Client) error {
	if client == nil {
		return trace.BadParameter("missing http client")
	}
	if client.Transport == nil {
		return trace.BadParameter(
			"the OIDC http client has no transport to wrap: the response size bound would be lost")
	}

	client.Transport = allowListRoundTripper{next: client.Transport}

	previous := client.CheckRedirect
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if !isAllowedEndpoint(req.URL) {
			return trace.AccessDenied("OIDC provider redirect is not allowed")
		}
		if previous != nil {
			return previous(req, via)
		}
		if len(via) >= maxRedirects {
			return trace.AccessDenied("too many OIDC provider redirects")
		}
		return nil
	}

	return nil
}

// NewHTTPClient returns the client the fork uses for OIDC discovery and for
// the token exchange. It has the same two layers the caching validator builds:
// the upstream bounded round tripper, with the Google allow-list over it.
func NewHTTPClient() (*http.Client, error) {
	transport, err := defaults.Transport()
	if err != nil {
		return nil, trace.Wrap(err)
	}

	client := &http.Client{
		Transport: teleoidc.NewOIDCRoundTripper(otelhttp.NewTransport(transport)),
	}
	if err := RestrictClientToGoogle(client); err != nil {
		return nil, trace.Wrap(err)
	}

	return client, nil
}
