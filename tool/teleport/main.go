/*
 * Teleport
 * Copyright (C) 2023  Gravitational, Inc.
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

package main

import (
	"fmt"
	"os"

	_ "github.com/gravitational/teleport/lib/fipscheck"
	"github.com/gravitational/teleport/lib/googleoidc"
	"github.com/gravitational/teleport/lib/observability/metrics"
	"github.com/gravitational/teleport/session/reexec"
	"github.com/gravitational/teleport/tool/teleport/common"
)

func init() {
	metrics.RegisterPrometheusCollectors(metrics.BuildCollector())
}

func main() {
	// MaybeReexec must run before anything else in this file, including the
	// fork activation below. When os.Args[1] names a reexec subcommand this
	// process is a short-lived helper, not teleport, and that path must not
	// parse TELEPORT_ENABLE_GOOGLE_OIDC or touch the process-wide modules
	// value.
	reexec.MaybeReexec()

	// FORK-LOCAL: Google Workspace OIDC is compiled in and off by default.
	// Activate must run before common.Run: the auth server copies
	// modules.GetModules() at construction time. See lib/googleoidc.Activate.
	registry, err := googleoidc.Activate()
	if err != nil {
		fmt.Fprintf(os.Stderr, "teleport: %v\n", err)
		os.Exit(1)
	}

	common.Run(common.Options{
		Args:           os.Args[1:],
		PluginRegistry: registry,
	})
}
