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

package main

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestMainWiresGoogleOIDCActivation is the tripwire that lib/googleoidc tests
// cannot be. Those tests call Activate directly. Deleting the call from
// main.go would leave them green and ship a binary that never turns the
// feature on. This test reads the entrypoint source.
func TestMainWiresGoogleOIDCActivation(t *testing.T) {
	src, err := os.ReadFile("main.go")
	require.NoError(t, err)
	text := string(src)
	require.Contains(t, text, "googleoidc.Activate()",
		"tool/teleport/main.go must call googleoidc.Activate before common.Run")
	require.Contains(t, text, "PluginRegistry:",
		"the registry Activate returns must reach common.Run")
	require.Contains(t, text, "reexec.MaybeReexec()",
		"MaybeReexec must stay first so a reexec helper does not parse the env var")
}
