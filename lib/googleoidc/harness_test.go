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
	"crypto"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/api/constants"
	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/auth"
	"github.com/gravitational/teleport/lib/auth/authclient"
	"github.com/gravitational/teleport/lib/auth/authtest"
	"github.com/gravitational/teleport/lib/backend"
	"github.com/gravitational/teleport/lib/cryptosuites"
	teleoidc "github.com/gravitational/teleport/lib/oidc"
)

// The fork pins every provider endpoint to a canonical Google URL, in the
// connector policy, in validateDiscoveryConfig and in the transport
// allow-list. A hermetic test therefore cannot move the issuer: it must keep
// the canonical URLs and rewrite only the network hop. rewriteRoundTripper
// does that. Every layer above it, including allowListRoundTripper and the
// bounded upstream round tripper, still sees the real Google URLs.
type rewriteRoundTripper struct {
	base   http.RoundTripper
	target *url.URL
}

func (r rewriteRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	rewritten := *req.URL
	rewritten.Scheme = r.target.Scheme
	rewritten.Host = r.target.Host
	clone.URL = &rewritten
	clone.Host = req.URL.Host
	return r.base.RoundTrip(clone)
}

// fakeGoogle is a hermetic stand-in for accounts.google.com.
//
// lib/oidc/fakeissuer cannot be used directly here: its signer is unexported
// and IDP.IssueToken hardcodes Kubernetes service-account claims, so it cannot
// mint an ID token that carries email, email_verified, hd and nonce. This
// provider follows the same shape as the upstream fake in
// lib/oidc/caching_token_validator_test.go, which exercises the very validator
// this package uses.
type fakeGoogle struct {
	t         *testing.T
	server    *httptest.Server
	signer    jose.Signer
	publicKey crypto.PublicKey

	mu sync.Mutex
	// authorization request parameters, as the browser presented them.
	authQuery url.Values
	// tokenRequests counts token exchanges the provider served.
	tokenRequests int
	// validCode is the authorization code the token endpoint accepts.
	validCode string
	// nonceOverride, when set, replaces the nonce the ID token carries.
	nonceOverride *string
	// tokenErrorBody, when set, makes the token endpoint fail with this body.
	tokenErrorBody string
	// mutateClaims, when set, edits the ID token claims before signing.
	mutateClaims func(map[string]any)
	// subject is the Google account identifier the ID token asserts.
	subject string
	// email is the address the ID token asserts.
	email string
	// hostedDomain is the hd claim the ID token asserts.
	hostedDomain string
	// enforcePKCE checks the code verifier against the recorded challenge.
	enforcePKCE bool
}

func newFakeGoogle(t *testing.T) *fakeGoogle {
	t.Helper()

	key, err := cryptosuites.GenerateKeyWithAlgorithm(cryptosuites.RSA2048)
	require.NoError(t, err)
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.RS256, Key: key},
		(&jose.SignerOptions{}).WithType("JWT"),
	)
	require.NoError(t, err)

	f := &fakeGoogle{
		t:            t,
		signer:       signer,
		publicKey:    key.Public(),
		validCode:    "authorization-code",
		subject:      "google-subject",
		email:        "user@example.com",
		hostedDomain: "example.com",
		enforcePKCE:  true,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", f.handleDiscovery)
	mux.HandleFunc("/o/oauth2/v2/auth", f.handleAuthorize)
	mux.HandleFunc("/token", f.handleToken)
	mux.HandleFunc("/oauth2/v3/certs", f.handleJWKS)

	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

// transport returns the network hop that reaches the fake provider while the
// caller keeps addressing the canonical Google URLs.
func (f *fakeGoogle) transport() http.RoundTripper {
	target, err := url.Parse(f.server.URL)
	require.NoError(f.t, err)
	return rewriteRoundTripper{base: f.server.Client().Transport, target: target}
}

// httpClient builds the discovery and token-exchange client with the same two
// layers NewHTTPClient builds in production: the bounded upstream round
// tripper, with the Google allow-list over it.
func (f *fakeGoogle) httpClient() *http.Client {
	client := &http.Client{Transport: teleoidc.NewOIDCRoundTripper(f.transport())}
	require.NoError(f.t, RestrictClientToGoogle(client))
	return client
}

// validatorMutator builds the ID token validator client. It keeps
// RestrictClientToGoogle, so the allow-list is still exercised.
func (f *fakeGoogle) validatorMutator(client *http.Client) error {
	client.Transport = teleoidc.NewOIDCRoundTripper(f.transport())
	return RestrictClientToGoogle(client)
}

func (f *fakeGoogle) handleDiscovery(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"issuer":                                testIssuer,
		"authorization_endpoint":                googleAuthorizationEndpoint,
		"token_endpoint":                        googleTokenEndpoint,
		"jwks_uri":                              googleJWKSEndpoint,
		"response_types_supported":              []string{"code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"scopes_supported":                      []string{"openid", "email"},
	})
}

func (f *fakeGoogle) handleJWKS(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{
		Key:       f.publicKey,
		Use:       "sig",
		Algorithm: string(jose.RS256),
	}}})
}

// handleAuthorize records what the browser presented to Google.
func (f *fakeGoogle) handleAuthorize(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.authQuery = r.URL.Query()
	f.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (f *fakeGoogle) handleToken(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	f.mu.Lock()
	f.tokenRequests++
	authQuery := f.authQuery
	nonceOverride := f.nonceOverride
	tokenErrorBody := f.tokenErrorBody
	mutateClaims := f.mutateClaims
	validCode := f.validCode
	enforcePKCE := f.enforcePKCE
	subject, email, hostedDomain := f.subject, f.email, f.hostedDomain
	f.mu.Unlock()

	if tokenErrorBody != "" {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, tokenErrorBody, http.StatusBadRequest)
		return
	}
	if r.Form.Get("code") != validCode {
		http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
		return
	}
	if enforcePKCE {
		verifier := r.Form.Get("code_verifier")
		if verifier == "" || authQuery.Get("code_challenge_method") != "S256" ||
			oauth2S256(verifier) != authQuery.Get("code_challenge") {
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
			return
		}
	}

	now := time.Now()
	claims := map[string]any{
		"iss":            testIssuer,
		"aud":            "client-id",
		"sub":            subject,
		"iat":            now.Add(-time.Minute).Unix(),
		"nbf":            now.Add(-time.Minute).Unix(),
		"exp":            now.Add(time.Hour).Unix(),
		"email":          email,
		"email_verified": true,
		"hd":             hostedDomain,
		"nonce":          authQuery.Get("nonce"),
	}
	if nonceOverride != nil {
		claims["nonce"] = *nonceOverride
	}
	if mutateClaims != nil {
		mutateClaims(claims)
	}

	idToken, err := jwt.Signed(f.signer).Claims(claims).Serialize()
	if err != nil {
		http.Error(w, `{"error":"server_error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token": "access-token",
		"token_type":   "Bearer",
		"expires_in":   3600,
		"id_token":     idToken,
	})
}

// visitAuthorization plays the browser: it follows the authorization URL the
// Auth Service handed back, so the provider records the state, the nonce and
// the PKCE challenge.
func (f *fakeGoogle) visitAuthorization(rawURL string) {
	f.t.Helper()

	client := &http.Client{Transport: f.transport()}
	resp, err := client.Get(rawURL)
	require.NoError(f.t, err)
	defer resp.Body.Close()
	_, err = io.Copy(io.Discard, resp.Body)
	require.NoError(f.t, err)
	require.Equal(f.t, http.StatusNoContent, resp.StatusCode)
}

// authorizationValues returns what the browser presented to Google.
func (f *fakeGoogle) authorizationValues() url.Values {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.authQuery
}

func (f *fakeGoogle) tokenExchangeCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.tokenRequests
}

const (
	testIssuer       = "https://accounts.google.com"
	testProxyAddress = "proxy.example.com:3080"
)

// loginEnv is one hermetic Google login environment: a real Auth Service, a
// real fork Service, and the fake provider.
type loginEnv struct {
	t         *testing.T
	auth      *auth.Server
	backend   backend.Backend
	google    *fakeGoogle
	service   *Service
	connector types.OIDCConnector
}

// newLoginEnv builds the environment. mutateSpec, when set, edits the
// connector spec before it is stored.
func newLoginEnv(t *testing.T, mutateSpec func(*types.OIDCConnectorV3)) *loginEnv {
	t.Helper()
	ctx := context.Background()

	srv, err := authtest.NewTestServer(authtest.ServerConfig{
		Auth: authtest.AuthServerConfig{
			Dir:         t.TempDir(),
			ClusterName: "localhost",
		},
	})
	require.NoError(t, err)
	t.Cleanup(func() { _ = srv.Auth().Close() })

	google := newFakeGoogle(t)

	service, err := NewService(ServiceConfig{
		AuthServer: srv.Auth(),
		Backend:    srv.AuthServer.Backend,
		HTTPClient: google.httpClient(),
	})
	require.NoError(t, err)
	service.validatorMutators = []teleoidc.ClientMutator{google.validatorMutator}

	role, err := types.NewRole("access", types.RoleSpecV6{})
	require.NoError(t, err)
	_, err = srv.Auth().UpsertRole(ctx, role)
	require.NoError(t, err)

	connector := testConnector(t).(*types.OIDCConnectorV3)
	if mutateSpec != nil {
		mutateSpec(connector)
	}
	stored, err := srv.Auth().UpsertOIDCConnector(ctx, connector)
	require.NoError(t, err)

	return &loginEnv{
		t:         t,
		auth:      srv.Auth(),
		backend:   srv.AuthServer.Backend,
		google:    google,
		service:   service,
		connector: stored,
	}
}

// forkKeyspaceKeys returns every backend key the fork owns. The fork keyspace
// holds the nonce of a live login and the single-use claim marker, and nothing
// else, so it is what an unauthenticated caller could make the cluster store.
func (e *loginEnv) forkKeyspaceKeys() []string {
	e.t.Helper()

	start := backend.NewKey(forkKeyspace)
	result, err := e.backend.GetRange(context.Background(), start, backend.RangeEnd(start), backend.NoLimit)
	require.NoError(e.t, err)

	keys := make([]string, 0, len(result.Items))
	for _, item := range result.Items {
		keys = append(keys, item.Key.String())
	}
	return keys
}

// authRequest returns the request the proxy would build for a browser login.
func (e *loginEnv) authRequest() types.OIDCAuthRequest {
	return types.OIDCAuthRequest{
		Type:              constants.OIDC,
		ConnectorID:       e.connector.GetName(),
		CreateWebSession:  true,
		ClientRedirectURL: "/web",
		CSRFToken:         "csrf-token",
		ClientLoginIP:     "127.0.0.1",
		ClientUserAgent:   "test-agent",
		ProxyAddress:      testProxyAddress,
	}
}

// createRequest starts a login and plays the browser hop to Google.
func (e *loginEnv) createRequest() *types.OIDCAuthRequest {
	e.t.Helper()

	request, err := e.service.CreateOIDCAuthRequest(context.Background(), e.authRequest())
	require.NoError(e.t, err)
	e.google.visitAuthorization(request.RedirectURL)
	return request
}

// callback finishes the login with the code the fake provider accepts.
func (e *loginEnv) callback(request *types.OIDCAuthRequest) (*authclient.OIDCAuthResponse, error) {
	e.t.Helper()

	return e.service.ValidateOIDCAuthCallback(context.Background(), url.Values{
		"state": []string{request.StateToken},
		"code":  []string{e.google.validCode},
	})
}

// callbackWithAudit finishes a login and returns what the audit event would
// report. The callback hands every state failure the same error, so the audit
// failure class is the only place that separates a replayed state from a state
// that names no login.
func (e *loginEnv) callbackWithAudit(stateToken, code string) (*callbackAudit, error) {
	e.t.Helper()

	audit := newCallbackAudit()
	_, err := e.service.validateCallback(context.Background(), url.Values{
		"state": []string{stateToken},
		"code":  []string{code},
	}, audit)
	return audit, err
}

// login runs one complete browser login and requires that it succeeds.
func (e *loginEnv) login() *authclient.OIDCAuthResponse {
	e.t.Helper()

	response, err := e.callback(e.createRequest())
	require.NoError(e.t, err)
	return response
}

// requireNoUser asserts that no Teleport user was created.
func (e *loginEnv) requireNoUser(username string) {
	e.t.Helper()

	_, err := e.auth.GetUser(context.Background(), username, false)
	require.Error(e.t, err, "a denied login must not create a user")
}

// oauth2S256 mirrors the S256 code challenge oauth2 computes.
func oauth2S256(verifier string) string {
	digest := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(digest[:])
}
