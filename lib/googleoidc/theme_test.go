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
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/lib/modules"
	"github.com/gravitational/teleport/lib/modules/modulestest"
)

// The theme is selected by name across a language boundary: Go sets
// Features.CustomTheme, the proxy copies it into webConfig, and TypeScript
// resolves a theme by that string. Nothing at either compiler catches a
// mismatch, and the failure is silent: the UI falls back to the upstream theme
// and simply looks unbranded. So the value is asserted on both sides.

func TestFeaturesSelectsTheForkTheme(t *testing.T) {
	base := &modulestest.Modules{}
	wrapped := WithOIDC(base)

	require.Equal(t, PsiphonThemeName, wrapped.Features().CustomTheme,
		"the proxy reads this straight into webConfig.customTheme")
	require.NotEmpty(t, PsiphonThemeName)
}

// The theme must not depend on the OIDC entitlement having been asked for, and
// must survive a features refresh, because the proxy re-reads features on a
// timer rather than once at startup.
func TestForkThemeSurvivesAFeaturesRefresh(t *testing.T) {
	base := &modulestest.Modules{}
	wrapped := WithOIDC(base)

	first := wrapped.Features()
	wrapped.SetFeatures(modules.Features{})
	second := wrapped.Features()

	require.Equal(t, PsiphonThemeName, first.CustomTheme)
	require.Equal(t, PsiphonThemeName, second.CustomTheme,
		"a refresh must not drop the theme, or the UI reverts to upstream branding")
}

// The other half of the contract. The browser resolves the theme by this exact
// string, so a rename on one side alone unbrands the UI with no error anywhere.
func TestThemeNameMatchesTheWebUIConstant(t *testing.T) {
	const themeFile = "../../web/packages/teleport/src/psiphonTheme.ts"

	source, err := os.ReadFile(themeFile)
	require.NoError(t, err, "expected the fork theme at %s", filepath.Clean(themeFile))

	match := regexp.MustCompile(
		`PSIPHON_THEME_NAME\s*=\s*'([^']+)'`).FindSubmatch(source)
	require.NotNil(t, match,
		"could not find PSIPHON_THEME_NAME in %s; if it was renamed, update this test and PsiphonThemeName together",
		themeFile)

	require.Equal(t, PsiphonThemeName, string(match[1]),
		"PsiphonThemeName in Go and PSIPHON_THEME_NAME in TypeScript must be identical, "+
			"or the proxy sends a theme name the browser does not know and the UI silently "+
			"falls back to the upstream theme")
}
