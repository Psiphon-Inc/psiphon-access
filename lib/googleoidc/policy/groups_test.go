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

package policy

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/api/types"
)

// withGroups turns a test connector into a group-gated connector.
func withGroups(mode, fallback string) func(*types.OIDCConnectorV3) {
	return func(c *types.OIDCConnectorV3) {
		c.Spec.Scope = append(c.Spec.Scope, CloudIdentityGroupsReadScope)
		c.Spec.ClaimsToRoles = append(c.Spec.ClaimsToRoles, types.ClaimMapping{
			Claim: GroupsClaim,
			Value: "engineering@example.com",
			Roles: []string{"access"},
		})
		if c.Metadata.Labels == nil {
			c.Metadata.Labels = map[string]string{}
		}
		if mode != "" {
			c.Metadata.Labels[GroupMembershipLabel] = mode
		}
		if fallback != "" {
			c.Metadata.Labels[GroupFallbackLabel] = fallback
		}
	}
}

func TestGroupLookupSettings(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		mutate func(*types.OIDCConnectorV3)
		want   GroupSettings
		errIs  string
	}{
		{
			name: "off by default",
			want: GroupSettings{},
		},
		{
			name:   "direct",
			mutate: withGroups("direct", ""),
			want: GroupSettings{
				Enabled:          true,
				Mode:             MembershipDirect,
				WorkspaceDomains: []string{"example.com"},
			},
		},
		{
			name:   "mode is read without case",
			mutate: withGroups("  Direct  ", ""),
			want: GroupSettings{
				Enabled:          true,
				Mode:             MembershipDirect,
				WorkspaceDomains: []string{"example.com"},
			},
		},
		{
			name:   "unknown mode",
			mutate: withGroups("nested", ""),
			errIs:  "unsupported Google group membership mode",
		},
		{
			name:   "missing mode",
			mutate: withGroups("", ""),
			errIs:  "requires the connector label",
		},
		{
			name: "groups mapping without the scope",
			mutate: func(c *types.OIDCConnectorV3) {
				withGroups("direct", "")(c)
				c.Spec.Scope = []string{"openid", "email"}
			},
			errIs: "requires the OIDC scope",
		},
		{
			name: "scope without a groups mapping",
			mutate: func(c *types.OIDCConnectorV3) {
				c.Spec.Scope = append(c.Spec.Scope, CloudIdentityGroupsReadScope)
			},
			errIs: "only accepted together with a groups claim mapping",
		},
		{
			name: "membership label without the scope",
			mutate: func(c *types.OIDCConnectorV3) {
				c.Metadata.Labels[GroupMembershipLabel] = "direct"
			},
			errIs: "needs the OIDC scope",
		},
		{
			name: "fallback label without the scope",
			mutate: func(c *types.OIDCConnectorV3) {
				c.Metadata.Labels[GroupFallbackLabel] = "direct"
			},
			errIs: "needs the OIDC scope",
		},
		{
			// The fail-closed rule for group lookups. A lookup with no
			// domain allow-list would hand a role mapping a group of any
			// tenant, so it is a refusal.
			name: "groups mapping without a workspace domain allow-list",
			mutate: func(c *types.OIDCConnectorV3) {
				withGroups("direct", "")(c)
				delete(c.Metadata.Labels, WorkspaceDomainsLabel)
			},
			errIs: "Google Workspace domain allow-list",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			mutations := []func(*types.OIDCConnectorV3){}
			if test.mutate != nil {
				mutations = append(mutations, test.mutate)
			}

			settings, err := GroupLookupSettings(testConnector(t, mutations...))
			if test.errIs != "" {
				require.Error(t, err)
				require.Contains(t, err.Error(), test.errIs)
				require.False(t, settings.Enabled, "a refused connector must not enable group lookup")
				return
			}
			require.NoError(t, err)
			require.Equal(t, test.want, settings)
		})
	}
}

// The transitive mode is refused, and the refusal has to teach. Direct
// membership is a strict subset of transitive membership, so silently reading
// "transitive" as "direct" would grant fewer roles than the operator asked for
// with nothing to say so. The operator therefore has to be told two things:
// what to write instead, and what they lose by writing it.
//
// This asserts the CONTENT of the message, not only that an error happened,
// because the content is the whole point of keeping a one-value label.
func TestTransitiveMembershipIsRefusedWithAnExplanation(t *testing.T) {
	t.Parallel()

	for _, written := range []string{"transitive", "Transitive", "  TRANSITIVE  "} {
		t.Run(written, func(t *testing.T) {
			t.Parallel()

			settings, err := GroupLookupSettings(testConnector(t, withGroups(written, "")))
			require.Error(t, err)
			require.False(t, settings.Enabled,
				"a refused connector must not enable group lookup")

			message := err.Error()
			require.Contains(t, message, "transitive",
				"the message must name the mode that was refused")
			require.Contains(t, message, "no longer supported",
				"the operator must learn the mode is gone, not that they mistyped it")
			require.Contains(t, message, GroupMembershipLabel,
				"the message must name the label to change")
			require.Contains(t, message, `"direct"`,
				"the message must name the value to write instead")

			// The nesting caveat. Direct membership does not follow nesting,
			// and the failure is silent: the login succeeds with fewer roles.
			// An operator who is moved off transitive has to be warned here,
			// because this is the one moment the fork knows they wanted it.
			require.Contains(t, message, "nested groups",
				"the message must warn that nested groups are not followed")
			require.Contains(t, message, "must not contain another group",
				"the warning must say what the operator has to do about nesting")
		})
	}
}

// The fallback label is refused for ANY non-empty value, not only the value it
// used to accept. It selected a fallback from the removed transitive mode, so
// there is nothing left for it to mean, and an instruction the fork cannot
// honour must never be ignored in silence.
func TestFallbackLabelIsRefusedWithAnExplanation(t *testing.T) {
	t.Parallel()

	// "direct" and "off" were the two accepted values, and "sometimes" was
	// always a typo. All three are now the same refusal.
	for _, written := range []string{"direct", "off", "sometimes", "true"} {
		t.Run(written, func(t *testing.T) {
			t.Parallel()

			settings, err := GroupLookupSettings(testConnector(t, withGroups("direct", written)))
			require.Error(t, err,
				"the fallback label must be refused whatever value it carries")
			require.False(t, settings.Enabled,
				"a refused connector must not enable group lookup")

			message := err.Error()
			require.Contains(t, message, GroupFallbackLabel,
				"the message must name the label that has to go")
			require.Contains(t, message, "no longer supported")
			require.Contains(t, message, "remove it",
				"the message must tell the operator to remove the label")
		})
	}
}

// A nil connector must not produce usable settings.
func TestGroupLookupSettingsRejectsNil(t *testing.T) {
	t.Parallel()

	settings, err := GroupLookupSettings(nil)
	require.Error(t, err)
	require.False(t, settings.Enabled)
}

// ValidateConnector must accept a complete group-gated connector, so the
// feature is reachable from the connector write path, and it must refuse the
// removed mode and the removed label there too. A connector that only the
// callback refuses would be written to the backend and break at login time.
func TestValidateConnectorAcceptsGroupLookup(t *testing.T) {
	t.Parallel()

	require.NoError(t, ValidateConnector(testConnector(t, withGroups("direct", ""))))

	err := ValidateConnector(testConnector(t, withGroups("transitive", "")))
	require.Error(t, err, "the write path must refuse the removed membership mode")
	require.Contains(t, err.Error(), "no longer supported")

	err = ValidateConnector(testConnector(t, withGroups("direct", "direct")))
	require.Error(t, err, "the write path must refuse the removed fallback label")
	require.Contains(t, err.Error(), GroupFallbackLabel)

	// The groups mapping value goes through the groups grammar.
	err = ValidateConnector(testConnector(t, func(c *types.OIDCConnectorV3) {
		withGroups("direct", "")(c)
		c.Spec.ClaimsToRoles[len(c.Spec.ClaimsToRoles)-1].Value = "*"
	}))
	require.Error(t, err)
	require.Contains(t, err.Error(), "group@domain or *@domain")
}
