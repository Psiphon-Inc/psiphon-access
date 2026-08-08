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
	"log/slog"
	"net/http"
	"net/url"

	"github.com/gravitational/trace"
	"github.com/jonboulle/clockwork"
	"github.com/zitadel/oidc/v3/pkg/client"
	zoidc "github.com/zitadel/oidc/v3/pkg/oidc"
	"golang.org/x/oauth2"

	"github.com/gravitational/teleport"
	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/auth"
	"github.com/gravitational/teleport/lib/auth/authclient"
	"github.com/gravitational/teleport/lib/backend"
	"github.com/gravitational/teleport/lib/defaults"
	"github.com/gravitational/teleport/lib/googleoidc/policy"
	teleoidc "github.com/gravitational/teleport/lib/oidc"
	logutils "github.com/gravitational/teleport/lib/utils/log"
)

// Service implements [auth.OIDCService] for Google Workspace.
var _ auth.OIDCService = (*Service)(nil)

// errMFANotSupported reports that the fork does not do SSO MFA.
var errMFANotSupported = &trace.NotImplementedError{Message: "this fork does not support OIDC SSO MFA"}

// validatorKey is the caching key for ID token validators. Upstream allows a
// key with more than the issuer and the audience, so the connector name is
// part of the key: a new client id or a new connector gets a new validator.
type validatorKey struct {
	issuer    string
	audience  string
	connector string
}

func (k validatorKey) GetIssuer() string   { return k.issuer }
func (k validatorKey) GetAudience() string { return k.audience }

// ServiceConfig holds the dependencies of [Service].
type ServiceConfig struct {
	// AuthServer is the local auth server. The service reads connectors and
	// users through it, and issues sessions and certificates with it.
	AuthServer *auth.Server
	// Backend is the cluster backend. The service owns one keyspace in it for
	// single-use state.
	Backend backend.Backend
	// Clock is the clock. It defaults to a real clock.
	Clock clockwork.Clock
	// HTTPClient talks to the Google OIDC endpoints. It defaults to
	// [NewHTTPClient].
	HTTPClient *http.Client
	// Logger is the logger. It defaults to a package logger.
	Logger *slog.Logger
}

// Service is the fork Google Workspace OIDC login runtime.
type Service struct {
	auth       *auth.Server
	clock      clockwork.Clock
	httpClient *http.Client
	logger     *slog.Logger
	state      *StateStore
	validators *teleoidc.CachingTokenValidator[*zoidc.IDTokenClaims, validatorKey]

	// cloudIdentityTransport is the network hop of the Cloud Identity group
	// lookup. The pinning round tripper, which allows one host, one path and
	// one method, always sits above it. An in-package test replaces it with a
	// hop to a local fake, which keeps the group tests off the network.
	cloudIdentityTransport http.RoundTripper

	// validatorMutators build the HTTP client of the ID token validator.
	// [NewService] always sets exactly [RestrictClientToGoogle], and the field
	// is unexported, so no caller outside this package can drop the endpoint
	// allow-list. An in-package test replaces it to point the validator at a
	// local fake issuer, which keeps the login tests off the network.
	validatorMutators []teleoidc.ClientMutator
}

// NewService returns the fork OIDC service. Register it with
// (*auth.Server).SetOIDCService.
func NewService(cfg ServiceConfig) (*Service, error) {
	if cfg.AuthServer == nil {
		return nil, trace.BadParameter("missing auth server")
	}
	if cfg.Backend == nil {
		return nil, trace.BadParameter("missing backend")
	}
	if cfg.Clock == nil {
		cfg.Clock = cfg.AuthServer.GetClock()
	}
	if cfg.Logger == nil {
		cfg.Logger = logutils.NewPackageLogger(teleport.ComponentKey, "google-oidc")
	}
	if cfg.HTTPClient == nil {
		httpClient, err := NewHTTPClient()
		if err != nil {
			return nil, trace.Wrap(err)
		}
		cfg.HTTPClient = httpClient
	}

	state, err := NewStateStore(cfg.Backend, cfg.Clock, defaults.OIDCAuthRequestTTL)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	validators, err := teleoidc.NewCachingTokenValidator[*zoidc.IDTokenClaims, validatorKey](cfg.Clock)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	cloudIdentityTransport, err := defaults.Transport()
	if err != nil {
		return nil, trace.Wrap(err)
	}

	return &Service{
		auth:                   cfg.AuthServer,
		clock:                  cfg.Clock,
		httpClient:             cfg.HTTPClient,
		logger:                 cfg.Logger,
		state:                  state,
		validators:             validators,
		cloudIdentityTransport: cloudIdentityTransport,
		validatorMutators:      []teleoidc.ClientMutator{RestrictClientToGoogle},
	}, nil
}

// CreateOIDCAuthRequest starts a Google login.
func (s *Service) CreateOIDCAuthRequest(ctx context.Context, req types.OIDCAuthRequest) (*types.OIDCAuthRequest, error) {
	request, err := s.createAuthRequest(ctx, req)
	return request, trace.Wrap(err)
}

// CreateOIDCAuthRequestForMFA is not supported by this fork.
func (s *Service) CreateOIDCAuthRequestForMFA(context.Context, types.OIDCAuthRequest) (*types.OIDCAuthRequest, error) {
	return nil, errMFANotSupported
}

// ValidateOIDCAuthCallback finishes a Google login.
func (s *Service) ValidateOIDCAuthCallback(ctx context.Context, q url.Values) (*authclient.OIDCAuthResponse, error) {
	audit := newCallbackAudit()
	response, err := s.validateCallback(ctx, q, audit)
	if audit.emit {
		s.emitLoginEvent(ctx, audit, response, err)
	}
	return response, trace.Wrap(err)
}

// getConnector returns the connector of the request, and applies the fork
// policy to it. The write path applies the same policy, but a connector that
// was stored before a policy change must not be usable.
func (s *Service) getConnector(ctx context.Context, request types.OIDCAuthRequest) (types.OIDCConnector, error) {
	if request.SSOTestFlow {
		if request.ConnectorSpec == nil {
			return nil, trace.BadParameter("ConnectorSpec cannot be nil when SSOTestFlow is true")
		}
		if request.ConnectorID == "" {
			return nil, trace.BadParameter("ConnectorID cannot be empty")
		}
		connector, err := types.NewOIDCConnector(request.ConnectorID, *request.ConnectorSpec)
		if err != nil {
			return nil, trace.Wrap(err)
		}
		if err := policy.ValidateConnector(connector); err != nil {
			return nil, trace.Wrap(err)
		}
		return connector, nil
	}

	connector, err := s.auth.GetOIDCConnector(ctx, request.ConnectorID, true)
	if err != nil {
		return nil, trace.Wrap(err)
	}
	if err := policy.ValidateConnector(connector); err != nil {
		return nil, trace.Wrap(err)
	}
	return connector, nil
}

// newOAuth2Config discovers the provider and builds the OAuth2 config. The
// discovery document must name the Google endpoints, so a hijacked discovery
// response cannot move the token exchange elsewhere.
func (s *Service) newOAuth2Config(ctx context.Context, connector types.OIDCConnector, callbackURL string) (*oauth2.Config, error) {
	discoveryCtx, cancel := context.WithTimeout(ctx, providerTimeout)
	defer cancel()

	dc, err := client.Discover(discoveryCtx, connector.GetIssuerURL(), s.httpClient)
	if err != nil {
		return nil, trace.Wrap(err, "discovering oidc document")
	}
	if err := validateDiscoveryConfig(dc); err != nil {
		return nil, trace.Wrap(err)
	}

	return &oauth2.Config{
		ClientID:     connector.GetClientID(),
		ClientSecret: connector.GetClientSecret(),
		RedirectURL:  callbackURL,
		Scopes:       connectorScopes(connector),
		Endpoint: oauth2.Endpoint{
			AuthURL:  dc.AuthorizationEndpoint,
			TokenURL: dc.TokenEndpoint,
		},
	}, nil
}

// validateDiscoveryConfig pins every endpoint of the discovery document.
func validateDiscoveryConfig(dc *zoidc.DiscoveryConfiguration) error {
	if dc == nil ||
		dc.Issuer != policy.GoogleIssuer ||
		dc.AuthorizationEndpoint != googleAuthorizationEndpoint ||
		dc.TokenEndpoint != googleTokenEndpoint ||
		dc.JwksURI != googleJWKSEndpoint {
		return trace.BadParameter("OIDC discovery document contains an unsupported endpoint")
	}
	return nil
}

// connectorScopes returns the scopes to request, with openid always present.
func connectorScopes(connector types.OIDCConnector) []string {
	scopes := []string{"openid"}
	for _, scope := range connector.GetScope() {
		if scope == "" || scope == "openid" {
			continue
		}
		scopes = append(scopes, scope)
	}
	return scopes
}

// authRequestFromProto converts the stored request into the client shape.
func authRequestFromProto(req *types.OIDCAuthRequest) authclient.OIDCAuthRequest {
	return authclient.OIDCAuthRequest{
		ConnectorID:       req.ConnectorID,
		CSRFToken:         req.CSRFToken,
		SSHPubKey:         req.SshPublicKey,
		TLSPubKey:         req.TlsPublicKey,
		CreateWebSession:  req.CreateWebSession,
		ClientRedirectURL: req.ClientRedirectURL,
	}
}
