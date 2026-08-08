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

	"github.com/gravitational/teleport/api/client/proto"

	"github.com/gravitational/teleport/entitlements"
	"github.com/gravitational/teleport/lib/modules"
	"github.com/gravitational/teleport/lib/modules/modulestest"
)

// SEAM 1a: the wrapper satisfies modules.Modules at compile time.
var _ modules.Modules = (*OIDCModules)(nil)

// SEAM 1a. The wrapper only overrides Features. Every other method comes from
// the embedded interface value.
func TestWrapperSatisfiesModulesInterface(t *testing.T) {
	inner := modulestest.OSSModules()
	w := WithOIDC(inner)

	require.Equal(t, modules.BuildOSS, w.BuildType())
	require.True(t, w.IsOSSBuild())
	require.False(t, w.IsEnterpriseBuild())
	require.True(t, w.Features().GetEntitlement(entitlements.OIDC).Enabled)
}

// SEAM 1b: SetModules installs the wrapper globally.
func TestSetModulesEnablesOIDC(t *testing.T) {
	prev := modules.GetModules()
	t.Cleanup(func() { modules.SetModules(prev) })

	require.False(t, modules.GetModules().Features().GetEntitlement(entitlements.OIDC).Enabled,
		"baseline: OIDC must be off before the wrapper is installed")

	modules.SetModules(WithOIDC(prev))

	require.True(t, modules.GetModules().Features().GetEntitlement(entitlements.OIDC).Enabled,
		"OIDC must be on after the wrapper is installed")
}

// SEAM 1c: THE CRITICAL TEST. Features.Entitlements is a map. If the wrapper
// writes into the map it received, it corrupts the inner implementation's
// state. modulestest.Modules.Features returns the stored struct, so the map is
// shared. Any real implementation that caches Features behaves the same way.
func TestFeaturesDoesNotMutateSharedEntitlements(t *testing.T) {
	inner := modulestest.OSSModules()
	w := WithOIDC(inner)

	require.True(t, w.Features().GetEntitlement(entitlements.OIDC).Enabled,
		"wrapper must report OIDC as enabled")

	// This is exactly the condition the four gate sites in
	// lib/auth/auth_with_roles.go read, but on the UNWRAPPED modules.
	require.False(t, inner.Features().GetEntitlement(entitlements.OIDC).Enabled,
		"wrapper leaked the OIDC entitlement into the inner implementation")

	_, present := inner.TestFeatures.Entitlements[entitlements.OIDC]
	require.False(t, present,
		"wrapper wrote the OIDC key into the shared Entitlements map")
}

// The former TestFeaturesDoesNotMutateGlobalModules was removed here. It could
// not fail: defaultModules.Features rebuilds its Entitlements map on every
// call, so prev.Features() returns a fresh map whatever the wrapper does. A
// mutation that writes the OIDC key straight into the received map passed it
// and failed only TestFeaturesDoesNotMutateSharedEntitlements above, which is
// the real test of that property.

// SEAM 1e: the wrapper does not need to override SetFeatures. SetFeatures is
// promoted to the inner implementation, and Features recomputes the override on
// every call, so a runtime feature refresh cannot switch OIDC off.
func TestSetFeaturesSurvivesRefresh(t *testing.T) {
	inner := &settableModules{Modules: modulestest.OSSModules()}
	w := WithOIDC(inner)

	require.True(t, w.Features().GetEntitlement(entitlements.OIDC).Enabled)

	// Simulate a Cloud feature refresh that replaces the whole feature set.
	w.SetFeatures(modules.Features{
		Cloud: true,
		Entitlements: map[entitlements.EntitlementKind]modules.EntitlementInfo{
			entitlements.App: {Enabled: true},
		},
	})

	require.True(t, inner.setCalled, "SetFeatures must reach the inner implementation")
	require.True(t, inner.Features().Cloud, "the refresh must take effect")
	require.True(t, w.Features().GetEntitlement(entitlements.OIDC).Enabled,
		"OIDC must survive a runtime feature refresh")
	require.True(t, w.Features().Cloud, "the refresh must be visible through the wrapper")
}

// settableModules is a modules.Modules whose SetFeatures actually stores, which
// modulestest.Modules does not do.
type settableModules struct {
	modules.Modules
	features  modules.Features
	setCalled bool
}

func (m *settableModules) Features() modules.Features {
	if !m.setCalled {
		return m.Modules.Features()
	}
	return m.features
}

func (m *settableModules) SetFeatures(f modules.Features) {
	m.features = f
	m.setCalled = true
}

// fakePinger reports whatever entitlement map it is given, in the same shape
// the auth server reports through Ping.
type fakePinger struct {
	features *proto.Features
	err      error
}

func (p fakePinger) Ping(context.Context) (proto.PingResponse, error) {
	if p.err != nil {
		return proto.PingResponse{}, p.err
	}
	return proto.PingResponse{ServerFeatures: p.features}, nil
}

// The startup assertion must fail when the auth server did not capture the
// wrapper, which is what happens when SetModules runs too late.
func TestAssertOIDCEntitlement(t *testing.T) {
	ctx := context.Background()

	t.Run("entitlement live", func(t *testing.T) {
		err := AssertOIDCEntitlement(ctx, fakePinger{features: WithOIDC(modulestest.OSSModules()).Features().ToProto()})
		require.NoError(t, err)
	})

	t.Run("entitlement missing", func(t *testing.T) {
		err := AssertOIDCEntitlement(ctx, fakePinger{features: modulestest.OSSModules().Features().ToProto()})
		require.Error(t, err)
		require.Contains(t, err.Error(), "does not report the OIDC entitlement")
	})

	t.Run("no features at all", func(t *testing.T) {
		err := AssertOIDCEntitlement(ctx, fakePinger{})
		require.Error(t, err)
	})

	t.Run("ping fails", func(t *testing.T) {
		err := AssertOIDCEntitlement(ctx, fakePinger{err: trace.ConnectionProblem(nil, "no auth server")})
		require.Error(t, err)
	})

	t.Run("no auth server", func(t *testing.T) {
		require.Error(t, AssertOIDCEntitlement(ctx, nil))
	})
}
