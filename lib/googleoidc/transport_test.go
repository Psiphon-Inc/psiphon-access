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
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	teleoidc "github.com/gravitational/teleport/lib/oidc"
)

// recordingTransport records the requests it receives and answers them.
type recordingTransport struct {
	requests []string
	body     string
}

func (t *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.requests = append(t.requests, req.URL.String())

	body := t.body
	if body == "" {
		body = "{}"
	}

	return &http.Response{
		Status:     "200 OK",
		StatusCode: http.StatusOK,
		Header:     http.Header{},
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    req,
	}, nil
}

// The mutator must WRAP the transport the caller installed. lib/oidc puts the
// bounded round tripper there, and a mutator that replaces it drops the
// response size bound in silence.
func TestRestrictClientToGoogleWrapsTheTransport(t *testing.T) {
	t.Parallel()

	inner := &recordingTransport{}
	client := &http.Client{Transport: teleoidc.NewOIDCRoundTripper(inner)}

	require.NoError(t, RestrictClientToGoogle(client))

	wrapper, ok := client.Transport.(allowListRoundTripper)
	require.True(t, ok, "the allow-list must be the outer layer, got %T", client.Transport)
	require.IsType(t, &teleoidc.OIDCRoundTripper{}, wrapper.next,
		"the upstream bounded round tripper must still be underneath")

	resp, err := client.Get(googleJWKSEndpoint)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	require.Equal(t, []string{googleJWKSEndpoint}, inner.requests)
}

// A client with no transport would lose the response size bound, so the
// mutator refuses it instead of installing one of its own.
func TestRestrictClientToGoogleRefusesAnEmptyTransport(t *testing.T) {
	t.Parallel()

	err := RestrictClientToGoogle(&http.Client{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "response size bound")

	require.Error(t, RestrictClientToGoogle(nil))
}

// Only the Google OIDC endpoints may be fetched.
func TestAllowListDeniesOtherEndpoints(t *testing.T) {
	t.Parallel()

	inner := &recordingTransport{}
	client := &http.Client{Transport: inner}
	client.Transport = allowListRoundTripper{next: inner}

	for _, allowed := range []string{googleDiscoveryEndpoint, googleTokenEndpoint, googleJWKSEndpoint} {
		resp, err := client.Get(allowed)
		require.NoError(t, err, allowed)
		require.NoError(t, resp.Body.Close())
	}

	denied := []string{
		"https://attacker.example.com/token",
		"https://accounts.google.com/o/oauth2/v2/auth",
		googleTokenEndpoint + "?extra=1",
		"http://oauth2.googleapis.com/token",
	}
	for _, target := range denied {
		_, err := client.Get(target)
		require.Error(t, err, target)
		require.Contains(t, err.Error(), "not allowed")
	}

	require.Len(t, inner.requests, 3, "a denied request must never reach the network")
}

// The client the fork builds itself has the same two layers.
func TestNewHTTPClientComposesOverTheUpstreamRoundTripper(t *testing.T) {
	t.Parallel()

	client, err := NewHTTPClient()
	require.NoError(t, err)

	wrapper, ok := client.Transport.(allowListRoundTripper)
	require.True(t, ok, "got %T", client.Transport)
	require.IsType(t, &teleoidc.OIDCRoundTripper{}, wrapper.next)
	require.NotNil(t, client.CheckRedirect)

	req, err := http.NewRequest(http.MethodGet, "https://attacker.example.com/", nil)
	require.NoError(t, err)
	require.Error(t, client.CheckRedirect(req, nil))
}
