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
	"testing"

	"github.com/gravitational/trace"
	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/auth/authtest"
	"github.com/gravitational/teleport/lib/googleoidc/policy"
	"github.com/gravitational/teleport/lib/modules"
)

// newTestAuthClient builds a real auth server and an admin client for it.
//
// The modules wrapper must already be installed when this runs, because
// lib/auth/auth.go copies modules.GetModules() at construction time.
func newTestAuthClient(t *testing.T) connectorWriter {
	t.Helper()

	srv, err := authtest.NewTestServer(authtest.ServerConfig{
		Auth: authtest.AuthServerConfig{
			Dir:         t.TempDir(),
			ClusterName: "localhost",
		},
	})
	require.NoError(t, err)
	t.Cleanup(func() { _ = srv.Auth().Close() })

	clt, err := srv.TLS.NewClient(authtest.TestAdmin())
	require.NoError(t, err)
	t.Cleanup(func() { _ = clt.Close() })

	return clt
}

// connectorWriter is every admin write path for an OIDC connector. tctl
// create -f uses Create, tctl edit uses Update, and the older clients use
// Upsert, so the fork policy must run on all three.
type connectorWriter interface {
	CreateOIDCConnector(context.Context, types.OIDCConnector) (types.OIDCConnector, error)
	UpdateOIDCConnector(context.Context, types.OIDCConnector) (types.OIDCConnector, error)
	UpsertOIDCConnector(context.Context, types.OIDCConnector) (types.OIDCConnector, error)
	GetOIDCConnector(ctx context.Context, id string, withSecrets bool) (types.OIDCConnector, error)
}

// connectorWriteMethods names each write path and calls it.
//
// needsExisting marks a method that only works on a connector that is already
// stored. Such a method is given a compliant connector first, and the mutated
// connector then carries the matching revision, so a refusal can only come
// from the fork policy and never from a revision mismatch.
var connectorWriteMethods = []struct {
	name          string
	needsExisting bool
	write         func(connectorWriter, context.Context, types.OIDCConnector) (types.OIDCConnector, error)
}{
	{
		name: "CreateOIDCConnector",
		write: func(c connectorWriter, ctx context.Context, conn types.OIDCConnector) (types.OIDCConnector, error) {
			return c.CreateOIDCConnector(ctx, conn)
		},
	},
	{
		name:          "UpdateOIDCConnector",
		needsExisting: true,
		write: func(c connectorWriter, ctx context.Context, conn types.OIDCConnector) (types.OIDCConnector, error) {
			return c.UpdateOIDCConnector(ctx, conn)
		},
	},
	{
		name: "UpsertOIDCConnector",
		write: func(c connectorWriter, ctx context.Context, conn types.OIDCConnector) (types.OIDCConnector, error) {
			return c.UpsertOIDCConnector(ctx, conn)
		},
	},
}

// The fork policy patch in lib/auth/oidc.go sits on three methods. A patch
// that covers only one of them leaves tctl create -f or tctl edit open, so
// every method is driven here.
//
// The test installs process-wide modules, so it cannot run in parallel.
func TestConnectorPolicyRunsOnEveryWritePath(t *testing.T) {
	ctx := context.Background()

	badConnectors := []struct {
		name    string
		mutate  func(*types.OIDCConnectorV3)
		wantErr string
	}{
		{
			name:    "google_service_account",
			mutate:  func(c *types.OIDCConnectorV3) { c.Spec.GoogleServiceAccountURI = "file:///sa.json" },
			wantErr: "service-account",
		},
		{
			name:    "missing workspace domain allow-list",
			mutate:  func(c *types.OIDCConnectorV3) { c.Metadata.Labels = nil },
			wantErr: "Google Workspace domain allow-list",
		},
		{
			name:    "catch-all claim mapping",
			mutate:  func(c *types.OIDCConnectorV3) { c.Spec.ClaimsToRoles[0].Value = "*" },
			wantErr: "user@domain or *@domain",
		},
		{
			name:    "PKCE disabled",
			mutate:  func(c *types.OIDCConnectorV3) { c.Spec.PKCEMode = "" },
			wantErr: "requires PKCE",
		},
	}

	for _, method := range connectorWriteMethods {
		for _, bad := range badConnectors {
			t.Run(method.name+" rejects "+bad.name, func(t *testing.T) {
				previous := modules.GetModules()
				modules.SetModules(WithOIDC(previous))
				t.Cleanup(func() { modules.SetModules(previous) })

				clt := newTestAuthClient(t)

				connector := testConnector(t).(*types.OIDCConnectorV3)
				if method.needsExisting {
					existing, err := clt.CreateOIDCConnector(ctx, testConnector(t))
					require.NoError(t, err)
					connector.SetRevision(existing.GetRevision())
				}
				bad.mutate(connector)

				_, err := method.write(clt, ctx, connector)
				require.Error(t, err)
				require.NotContains(t, err.Error(), "OIDC is only available in Teleport Enterprise",
					"the entitlement gate must be open, so the failure comes from the connector policy")
				require.Contains(t, err.Error(), bad.wantErr)

				// The refused connector must not be readable afterwards. A
				// refusal that still writes is no refusal at all.
				stored, err := clt.GetOIDCConnector(ctx, connector.GetName(), true)
				if !method.needsExisting {
					require.True(t, trace.IsNotFound(err), "a refused connector must not be stored, got %v", err)
					return
				}
				require.NoError(t, err)
				require.NoError(t, policy.ValidateConnector(stored),
					"a refused update must leave the compliant connector in place")
			})
		}
	}

	// A connector the policy accepts must still reach the backend through
	// every method, so the guard is not a blanket refusal.
	t.Run("a compliant connector is accepted by every write path", func(t *testing.T) {
		previous := modules.GetModules()
		modules.SetModules(WithOIDC(previous))
		t.Cleanup(func() { modules.SetModules(previous) })

		clt := newTestAuthClient(t)

		created, err := clt.CreateOIDCConnector(ctx, testConnector(t))
		require.NoError(t, err)
		require.Equal(t, "google", created.GetName())

		update := testConnector(t)
		update.SetRevision(created.GetRevision())
		updated, err := clt.UpdateOIDCConnector(ctx, update)
		require.NoError(t, err)

		upsert := testConnector(t)
		upsert.SetRevision(updated.GetRevision())
		_, err = clt.UpsertOIDCConnector(ctx, upsert)
		require.NoError(t, err)
	})
}

// The entitlement wrapper opens the real gate in lib/auth/auth_with_roles.go,
// and the fork connector policy in lib/auth/oidc.go rejects a connector the
// fork cannot serve. The test drives both through a real auth server.
//
// The test installs process-wide modules, so it cannot run in parallel.
func TestOIDCGateAndConnectorPolicy(t *testing.T) {
	ctx := context.Background()

	t.Run("gate closed without the wrapper", func(t *testing.T) {
		clt := newTestAuthClient(t)

		_, err := clt.UpsertOIDCConnector(ctx, testConnector(t))
		require.Error(t, err)
		require.True(t, trace.IsAccessDenied(err), "the gate must deny access, got %v", err)
		require.Contains(t, err.Error(), "OIDC is only available in Teleport Enterprise")
	})

	t.Run("wrapper installed too late has no effect", func(t *testing.T) {
		clt := newTestAuthClient(t)

		previous := modules.GetModules()
		modules.SetModules(WithOIDC(previous))
		t.Cleanup(func() { modules.SetModules(previous) })

		_, err := clt.UpsertOIDCConnector(ctx, testConnector(t))
		require.Error(t, err)
		require.True(t, trace.IsAccessDenied(err), "the gate must deny access, got %v", err)
		require.Contains(t, err.Error(), "OIDC is only available in Teleport Enterprise")
	})

	t.Run("gate open with the wrapper", func(t *testing.T) {
		previous := modules.GetModules()
		modules.SetModules(WithOIDC(previous))
		t.Cleanup(func() { modules.SetModules(previous) })

		clt := newTestAuthClient(t)

		connector, err := clt.UpsertOIDCConnector(ctx, testConnector(t))
		require.NoError(t, err)
		require.Equal(t, "google", connector.GetName())
	})

	// Every domain-wide delegation field must be refused by the fork patch in
	// lib/auth/oidc.go, through the real connector write path.
	delegationFields := []struct {
		name   string
		mutate func(*types.OIDCConnectorV3)
	}{
		{
			name:   "google_service_account",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.GoogleServiceAccount = `{"type":"service_account"}` },
		},
		{
			name:   "google_service_account_uri",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.GoogleServiceAccountURI = "file:///sa.json" },
		},
		{
			name:   "google_admin_email",
			mutate: func(c *types.OIDCConnectorV3) { c.Spec.GoogleAdminEmail = "admin@example.com" },
		},
	}

	for _, field := range delegationFields {
		t.Run("connector policy rejects "+field.name, func(t *testing.T) {
			previous := modules.GetModules()
			modules.SetModules(WithOIDC(previous))
			t.Cleanup(func() { modules.SetModules(previous) })

			clt := newTestAuthClient(t)

			bad := testConnector(t).(*types.OIDCConnectorV3)
			field.mutate(bad)

			_, err := clt.UpsertOIDCConnector(ctx, bad)
			require.Error(t, err)
			require.NotContains(t, err.Error(), "OIDC is only available in Teleport Enterprise",
				"the entitlement gate must be open, so the failure comes from the connector policy")
			require.Contains(t, err.Error(), "service-account")
		})
	}

	t.Run("connector policy requires the workspace domain allow-list", func(t *testing.T) {
		previous := modules.GetModules()
		modules.SetModules(WithOIDC(previous))
		t.Cleanup(func() { modules.SetModules(previous) })

		clt := newTestAuthClient(t)

		bad := testConnector(t).(*types.OIDCConnectorV3)
		bad.Metadata.Labels = nil

		_, err := clt.UpsertOIDCConnector(ctx, bad)
		require.Error(t, err)
		require.NotContains(t, err.Error(), "OIDC is only available in Teleport Enterprise",
			"the entitlement gate must be open, so the failure comes from the connector policy")
		require.Contains(t, err.Error(), "Google Workspace domain allow-list")
	})
}
