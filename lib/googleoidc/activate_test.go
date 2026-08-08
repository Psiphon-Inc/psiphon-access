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
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/entitlements"
	"github.com/gravitational/teleport/lib/modules"
)

// restoreModules puts the process-wide modules value back after a test. The
// activation path installs a wrapper globally, so a test that does not restore
// it leaks the entitlement into every later test in this package.
func restoreModules(t *testing.T) {
	t.Helper()
	previous := modules.GetModules()
	t.Cleanup(func() { modules.SetModules(previous) })
}

func oidcEntitlementLive() bool {
	return modules.GetModules().Features().GetEntitlement(entitlements.OIDC).Enabled
}

func TestActivate(t *testing.T) {
	t.Run("enabled installs the wrapper and registers the plugin", func(t *testing.T) {
		restoreModules(t)
		t.Setenv(EnableEnvVar, "true")

		require.False(t, oidcEntitlementLive(),
			"precondition: the OIDC entitlement must be closed before activation")

		registry, err := Activate()
		require.NoError(t, err)
		require.NotNil(t, registry, "activation must return a registry to hand to common.Run")
		require.True(t, oidcEntitlementLive(),
			"Activate must install the entitlement wrapper, or the gate stays shut")
		require.True(t, registry.IsRegistered(PluginName),
			"Activate must register the fork plugin, or no OIDC route is served")
	})

	t.Run("unset leaves the process untouched", func(t *testing.T) {
		restoreModules(t)

		registry, err := Activate()
		require.NoError(t, err)
		require.Nil(t, registry, "an unset flag must not build a registry")
		require.False(t, oidcEntitlementLive(),
			"an unset flag must leave the OIDC entitlement closed")
	})

	t.Run("explicitly false leaves the process untouched", func(t *testing.T) {
		restoreModules(t)
		t.Setenv(EnableEnvVar, "false")

		registry, err := Activate()
		require.NoError(t, err)
		require.Nil(t, registry, "a false flag must not build a registry")
		require.False(t, oidcEntitlementLive(),
			"a false flag must leave the OIDC entitlement closed")
	})

	t.Run("unparseable value is an error and does not enable the feature", func(t *testing.T) {
		restoreModules(t)
		t.Setenv(EnableEnvVar, "maybe")

		registry, err := Activate()
		require.Error(t, err)
		require.ErrorContains(t, err, EnableEnvVar)
		require.Nil(t, registry)
		require.False(t, oidcEntitlementLive(),
			"a bad value must not enable the entitlement")
	})
}
