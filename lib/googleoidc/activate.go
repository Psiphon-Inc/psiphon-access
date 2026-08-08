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
	"fmt"
	"os"
	"strconv"

	"github.com/gravitational/teleport/lib/modules"
	"github.com/gravitational/teleport/lib/plugin"
)

// EnableEnvVar turns the fork Google Workspace OIDC feature on. It is unset,
// and the feature is off, by default: a fork operator who does not need
// Google OIDC runs the teleport binary with no behaviour change from
// upstream.
//
// The value is parsed with strconv.ParseBool ("1", "t", "true", "yes" and
// their opposites, case-insensitively for the alphabetic forms; see the
// standard library for the exact grammar). A value that is set but does not
// parse is a configuration mistake, not "feature off".
const EnableEnvVar = "TELEPORT_ENABLE_GOOGLE_OIDC"

// Activate reads EnableEnvVar. When it is unset or false, it returns a nil
// registry and common.Run gets no plugin registry, exactly as upstream
// tool/teleport/main.go behaves. When it is true, it wires the fork Google
// OIDC feature into the process that common.Run is about to build and
// returns the registry common.Options.PluginRegistry must carry.
//
// Both halves of the activation run together, and only here:
//
//  1. modules.SetModules installs the wrapper that reports the OIDC
//     entitlement as enabled. It must run before service.NewTeleport, which
//     runs inside common.Run: the auth server copies modules.GetModules() at
//     construction time, so a call after that point has no effect.
//  2. The plugin registry, with the fork plugin added, is returned for the
//     caller to assign to common.Options.PluginRegistry, so common.Run passes
//     it into servicecfg.Config.PluginRegistry instead of the empty default
//     registry service.NewTeleport would otherwise create.
//
// The two halves are kept on the same gate on purpose. Plugin.InitAuthProcess
// asserts that the OIDC entitlement is live every time the plugin is
// registered, and fails the process loudly if it is not. Registering the
// plugin without the wrapper would trip that assertion on every run;
// installing the wrapper without the plugin would leave the entitlement open
// with no route to use it. Flipping one env var must not be able to produce
// either half-activated state, so there is exactly one flag, not two.
//
// tool/teleport/main.go must call Activate after reexec.MaybeReexec and
// before common.Run. MaybeReexec must stay first: when os.Args[1] names a
// reexec subcommand this process is a short-lived helper, not teleport, and
// that path must not parse the env var or touch the process-wide modules
// value.
func Activate() (plugin.Registry, error) {
	raw, isSet := os.LookupEnv(EnableEnvVar)
	if !isSet {
		return nil, nil
	}

	enabled, err := strconv.ParseBool(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid %s=%q: %w (use true/false, 1/0, t/f, yes/no)",
			EnableEnvVar, raw, err)
	}
	if !enabled {
		return nil, nil
	}

	modules.SetModules(WithOIDC(modules.GetModules()))

	registry := plugin.NewRegistry()
	if err := Install(registry); err != nil {
		return nil, fmt.Errorf("failed to install the Google OIDC plugin: %w", err)
	}

	fmt.Fprintln(os.Stderr, "teleport: Google Workspace OIDC is enabled ("+EnableEnvVar+"=true)")
	return registry, nil
}
