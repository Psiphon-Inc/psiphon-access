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
	"slices"
	"strings"

	"github.com/gravitational/trace"

	"github.com/gravitational/teleport/api/types"
)

const (
	// CloudIdentityGroupsReadScope is the only scope a group lookup needs. The
	// fork asks Google for it on behalf of the user who is logging in, and it
	// uses the resulting short-lived access token and nothing else. There is
	// no domain-wide delegation, no Admin SDK, no service-account
	// impersonation, and no persistent Google credential.
	CloudIdentityGroupsReadScope = "https://www.googleapis.com/auth/cloud-identity.groups.readonly"

	// GroupMembershipLabel carries the membership mode of the connector. It is
	// required whenever group lookup is on, and "direct" is its only accepted
	// value. One legal value makes the label redundant as a choice, and it is
	// kept for two reasons: it is where the operator acknowledges that nesting
	// is not followed, and it is what lets a connector written for the removed
	// transitive mode be refused rather than silently reinterpreted.
	GroupMembershipLabel = "fork.teleport.dev/google-group-membership"

	// GroupFallbackLabel was the opt-in fallback from the transitive mode to
	// the direct mode. Transitive membership is gone, so the label has nothing
	// to fall back from and is now refused. The name is kept so that a
	// connector still carrying it gets an explanation instead of silence.
	GroupFallbackLabel = "fork.teleport.dev/google-group-fallback"

	// GroupsClaim is the claim name a group mapping uses.
	GroupsClaim = "groups"
)

// MembershipMode selects which Cloud Identity method resolves membership.
// Direct membership is the only supported mode.
//
// WHY TRANSITIVE MEMBERSHIP IS GONE. It did not work, and buying the ability
// to use it was poor value. Measured against a live Workspace Business Plus
// tenant on 2026-08-09, with one end-user access token:
//
//	searchTransitiveGroups -> 403 "Error(4013): Insufficient permissions to
//	                          retrieve memberships", with no reason token in
//	                          the error body at all
//	searchDirectGroups     -> 200, 30 groups
//
// Same token, same scope, same OAuth client, same Google project, seconds
// apart. That comparison rules out an insufficient scope, a disabled API, an
// OAuth client the tenant does not trust, and group visibility, which returns
// an empty 200 rather than a 403. The remaining explanation is that the tenant
// is not entitled to transitive search. That is inferred and not proven: the
// message names permissions, not licensing.
//
// The entitlement was not worth buying, because the lookup uses the access
// token of the user who is logging in. Every user who logs in would need it,
// not one administrator or one service account.
//
// THE COST OF DIRECT MEMBERSHIP, which an operator must plan around. Direct
// membership does not follow nesting. If a connector maps a group that
// CONTAINS another group, a member of only the inner group gets no roles from
// that mapping.
//
// The direction of that failure is safe. Direct membership is a strict subset
// of transitive membership, so this fork can only ever grant fewer roles than
// a transitive lookup would, never more. It cannot over-grant.
//
// It is, however, SILENT. The login succeeds, the audit event records
// group_lookup_succeeded, and the user simply holds less access than intended.
// Nothing distinguishes "in no mapped group" from "in a mapped group through
// nesting, which cannot be seen". Keep mapped groups flat, or accept that a
// nested member gets nothing. Making this loud is not yet implemented.
type MembershipMode string

const (
	// MembershipDirect resolves membership with
	// cloudidentity.googleapis.com groups.memberships.searchDirectGroups, so
	// only a direct membership grants roles. It is the only supported mode.
	MembershipDirect MembershipMode = "direct"

	// membershipTransitive is the removed mode. It is matched only so that a
	// connector carrying it is refused with an explanation.
	membershipTransitive MembershipMode = "transitive"
)

// GroupSettings is the group lookup configuration of one connector.
type GroupSettings struct {
	// Enabled reports whether this connector looks group membership up.
	Enabled bool
	// Mode is the membership mode. It is empty when Enabled is false, and
	// [MembershipDirect] otherwise, because that is the only supported mode.
	Mode MembershipMode
	// WorkspaceDomains is the Google Workspace domain allow-list. A group
	// outside it is dropped. It is never empty when Enabled is true.
	WorkspaceDomains []string
}

// GroupLookupSettings reads the group lookup configuration of a connector, and
// rejects every inconsistent combination.
//
// The rules are deliberately strict, because each inconsistency would
// otherwise be silent:
//
//   - A groups claim mapping without the Cloud Identity scope would never
//     match anything, so the operator would see roles quietly disappear.
//   - The Cloud Identity scope without a groups claim mapping would ask the
//     user for an access grant the fork never uses.
//   - A membership label without the scope would look like a setting that
//     does something.
//   - Group lookup without a Workspace domain allow-list would let a group of
//     any domain reach a role mapping. This is the fail-closed rule of
//     no allow-list and a groups mapping is a refusal, never a
//     lookup with no domain gate.
func GroupLookupSettings(conn types.OIDCConnector) (GroupSettings, error) {
	if conn == nil {
		return GroupSettings{}, trace.BadParameter("missing OIDC connector")
	}

	hasScope := slices.Contains(conn.GetScope(), CloudIdentityGroupsReadScope)
	hasGroupsMapping := slices.ContainsFunc(conn.GetClaimsToRoles(), func(mapping types.ClaimMapping) bool {
		return mapping.Claim == GroupsClaim
	})

	labels := conn.GetMetadata().Labels
	rawMode := strings.ToLower(strings.TrimSpace(labels[GroupMembershipLabel]))
	rawFallback := strings.ToLower(strings.TrimSpace(labels[GroupFallbackLabel]))

	switch {
	case hasGroupsMapping && !hasScope:
		return GroupSettings{}, trace.BadParameter(
			"a groups claim mapping requires the OIDC scope %q", CloudIdentityGroupsReadScope)
	case hasScope && !hasGroupsMapping:
		return GroupSettings{}, trace.BadParameter(
			"the OIDC scope %q is only accepted together with a groups claim mapping",
			CloudIdentityGroupsReadScope)
	}

	if !hasScope {
		if rawMode != "" {
			return GroupSettings{}, trace.BadParameter(
				"the connector label %q needs the OIDC scope %q", GroupMembershipLabel, CloudIdentityGroupsReadScope)
		}
		if rawFallback != "" {
			return GroupSettings{}, trace.BadParameter(
				"the connector label %q needs the OIDC scope %q", GroupFallbackLabel, CloudIdentityGroupsReadScope)
		}
		return GroupSettings{}, nil
	}

	var mode MembershipMode
	switch MembershipMode(rawMode) {
	case MembershipDirect:
		mode = MembershipDirect
	case membershipTransitive:
		// Refuse rather than quietly treat this as direct. Direct membership is
		// a subset of transitive membership, so a silent reinterpretation would
		// grant fewer roles than the operator asked for, with nothing to say
		// so. See the MembershipMode doc comment for why the mode was removed.
		return GroupSettings{}, trace.BadParameter(
			"the %q Google group membership mode is no longer supported, set the connector label %q to %q; "+
				"transitive search is refused by a Workspace tenant without the entitlement, and direct "+
				"membership does not follow nested groups, so a mapped group must not contain another group",
			membershipTransitive, GroupMembershipLabel, MembershipDirect)
	case "":
		return GroupSettings{}, trace.BadParameter(
			"group lookup requires the connector label %q, set it to %q",
			GroupMembershipLabel, MembershipDirect)
	default:
		return GroupSettings{}, trace.BadParameter(
			"unsupported Google group membership mode %q in label %q, use %q",
			labels[GroupMembershipLabel], GroupMembershipLabel, MembershipDirect)
	}

	// The fallback existed only to recover from a failing transitive attempt.
	// With one mode there is nothing to fall back from, so the label is an
	// instruction the fork can no longer honour and is refused.
	if rawFallback != "" {
		return GroupSettings{}, trace.BadParameter(
			"the connector label %q is no longer supported, remove it; it selected a fallback from the "+
				"removed %q membership mode, and %q is now the only mode",
			GroupFallbackLabel, membershipTransitive, MembershipDirect)
	}

	// Fail closed. A group lookup with no domain allow-list would hand a role
	// mapping a group of any domain, including a group of a tenant the
	// operator does not control.
	domains, err := WorkspaceDomains(conn)
	if err != nil {
		return GroupSettings{}, trace.Wrap(err)
	}

	return GroupSettings{
		Enabled:          true,
		Mode:             mode,
		WorkspaceDomains: domains,
	}, nil
}
