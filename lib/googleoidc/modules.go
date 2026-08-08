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

// Package googleoidc holds the fork-local Google Workspace OIDC login support.
//
// The package is fork-only. It carries the whole runtime, so that the fork
// modifies as few upstream files as possible. See
// docs/oidc-google/minimal-divergence-design.md.
package googleoidc

import (
	"context"
	"maps"

	"github.com/gravitational/trace"

	"github.com/gravitational/teleport/api/client/proto"
	"github.com/gravitational/teleport/entitlements"
	"github.com/gravitational/teleport/lib/modules"
)

// OIDCModules wraps a [modules.Modules] and reports the OIDC entitlement as
// enabled. It replaces the four gate patches in lib/auth/auth_with_roles.go.
type OIDCModules struct {
	modules.Modules
}

// WithOIDC returns a wrapper around inner that enables the OIDC entitlement.
//
// Install it with [modules.SetModules] BEFORE service.NewTeleport runs. The
// auth server copies modules.GetModules() at construction time, so a later
// call has no effect and raises no error. Use [AssertOIDCEntitlement] to catch
// that mistake at startup.
func WithOIDC(inner modules.Modules) *OIDCModules {
	return &OIDCModules{Modules: inner}
}

// PsiphonThemeName is the web UI theme this fork selects. The proxy copies
// Features.CustomTheme into webConfig.customTheme, and the browser resolves a
// theme by that name. The value must equal PSIPHON_THEME_NAME in
// web/packages/teleport/src/psiphonTheme.ts, or the UI silently falls back to
// the upstream theme and the fork looks unbranded.
const PsiphonThemeName = "psiphon"

// Features returns the wrapped features with the OIDC entitlement enabled and
// the fork web UI theme selected.
//
// Features is copied by value, but Entitlements is a map. The map must be
// cloned before the write, or the wrapper mutates the inner implementation.
// The bug is invisible in an OSS build, because defaultModules.Features()
// rebuilds its map on every call. Keep TestFeaturesDoesNotMutateSharedEntitlements.
func (m *OIDCModules) Features() modules.Features {
	f := m.Modules.Features()

	ents := make(map[entitlements.EntitlementKind]modules.EntitlementInfo, len(f.Entitlements)+1)
	maps.Copy(ents, f.Entitlements)
	ents[entitlements.OIDC] = modules.EntitlementInfo{Enabled: true}
	f.Entitlements = ents

	// The theme rides on the same wrapper because it needs no other seam: the
	// proxy reads it straight from the features it already asks for. It is set
	// unconditionally rather than behind a second switch, because a fork that
	// serves the upstream branding is the thing the rebrand exists to prevent.
	// CustomTheme is a plain string and not an entitlement, so it needs no
	// entry in the map above.
	f.CustomTheme = PsiphonThemeName

	return f
}

// AuthPinger is the part of *auth.Server that reports the features the auth
// server itself captured at construction time.
type AuthPinger interface {
	Ping(ctx context.Context) (proto.PingResponse, error)
}

// AssertOIDCEntitlement fails when the running auth server does not report the
// OIDC entitlement.
//
// Ping reads the modules value the auth server captured when it was built, not
// the process-wide value. That is the only way to detect a modules.SetModules
// call that ran after service.NewTeleport: such a call changes the global and
// leaves the auth server gate closed, with no error anywhere.
func AssertOIDCEntitlement(ctx context.Context, srv AuthPinger) error {
	if srv == nil {
		return trace.BadParameter("cannot assert the OIDC entitlement without an auth server")
	}

	resp, err := srv.Ping(ctx)
	if err != nil {
		return trace.Wrap(err, "reading auth server features")
	}

	if !resp.GetServerFeatures().GetEntitlements()[string(entitlements.OIDC)].GetEnabled() {
		return trace.BadParameter(
			"the auth server does not report the OIDC entitlement: call modules.SetModules(googleoidc.WithOIDC(...)) before service.NewTeleport")
	}

	return nil
}
