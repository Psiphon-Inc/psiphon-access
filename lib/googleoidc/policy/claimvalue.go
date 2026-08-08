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
)

// A claims_to_roles value is not a literal string. Teleport compiles it in
// lib/utils/replace.go, and the login path uses that compiled matcher in
// lib/services/traits.go. Two rules make a denylist useless there.
//
//  1. A plain value goes through utils.GlobToRegexp, which quotes every
//     character and then turns each * into (.*). So ** and *@* match every
//     address.
//  2. A value that starts with ^ and ends with $ is passed to the regexp
//     engine unescaped. So ^(.*)$ matches every address, and ^.*@example.com$
//     also matches victim@exampleXcom, a domain an attacker can register.
//
// The fork therefore validates the value as written, against an allow-list
// grammar, and rejects everything the grammar does not name.

// claimGrammar holds the accepted claims_to_roles values of one OIDC claim.
// A second claim, for example groups, is added by appending one entry to
// claimGrammars. No caller changes.
type claimGrammar struct {
	// claim is the OIDC claim name this grammar applies to.
	claim string
	// validate reports whether value is an accepted mapping value for a
	// connector whose Google Workspace allow-list is workspaceDomains. It
	// returns a BadParameter error that names the value.
	validate func(value string, workspaceDomains []string) error
}

// claimGrammars holds one grammar per supported claim.
//
// The groups grammar holds a group address to the same standard as an email
// address, because the two reach the same matcher in lib/services/traits.go. A
// group value is a Google group address, and the trait it matches is built
// from the Cloud Identity lookup, never from a provider supplied groups claim.
var claimGrammars = []claimGrammar{
	{claim: "email", validate: validateEmailClaimValue},
	{claim: GroupsClaim, validate: validateGroupsClaimValue},
}

// grammarForClaim returns the grammar of a claim, and reports whether the
// fork supports that claim at all.
func grammarForClaim(claim string) (claimGrammar, bool) {
	index := slices.IndexFunc(claimGrammars, func(g claimGrammar) bool {
		return g.claim == claim
	})
	if index < 0 {
		return claimGrammar{}, false
	}
	return claimGrammars[index], true
}

// emailClaimValueShapes and groupsClaimValueShapes describe the accepted
// grammar of each claim in an error message. The grammar itself is the same.
const (
	emailClaimValueShapes = "either user@domain or *@domain, " +
		"where domain is one of the Google Workspace domains of this connector"
	groupsClaimValueShapes = "either group@domain or *@domain, " +
		"where domain is one of the Google Workspace domains of this connector"
)

// validateEmailClaimValue applies the address grammar to an email mapping.
func validateEmailClaimValue(value string, workspaceDomains []string) error {
	return trace.Wrap(validateAddressClaimValue(value, workspaceDomains, emailClaimValueShapes))
}

// validateGroupsClaimValue applies the address grammar to a groups mapping.
//
// A group value gets no relaxation. A bare wildcard would grant a role to any
// group of any tenant that the lookup ever returns, and a raw regexp carries
// the unescaped dot that makes ^.*@example.com$ match victim@exampleXcom. The
// Cloud Identity lookup already drops a group outside the Workspace allow-list
// at runtime, so this is the second of two gates, not the only one.
func validateGroupsClaimValue(value string, workspaceDomains []string) error {
	return trace.Wrap(validateAddressClaimValue(value, workspaceDomains, groupsClaimValueShapes))
}

// validateAddressClaimValue accepts two shapes of claim value, and nothing
// else:
//
//  1. An exact address, local@domain.
//  2. A whole-domain wildcard, *@domain.
//
// In both shapes domain must be one of the connector Workspace domains,
// compared without case. Every other value is rejected, including every raw
// regexp, every partial wildcard such as admin*@example.com, and every value
// that carries a regexp metacharacter, whitespace, or a control character.
func validateAddressClaimValue(value string, workspaceDomains []string, shapes string) error {
	if value == "" {
		return trace.BadParameter("OIDC claim mapping value cannot be empty: write %s", shapes)
	}

	// Teleport treats a value that starts with ^ and ends with $ as a raw
	// regexp and does not escape it. The fork accepts no raw regexp, which
	// also removes the unescaped dot in a domain part.
	if strings.HasPrefix(value, "^") {
		return trace.BadParameter(
			"OIDC claim mapping value %q is a raw regular expression, which this fork does not accept: write %s",
			value, shapes)
	}

	if strings.Count(value, "@") != 1 {
		return trace.BadParameter(
			"OIDC claim mapping value %q must be %s", value, shapes)
	}
	local, domain, _ := strings.Cut(value, "@")

	if local == "" {
		return trace.BadParameter(
			"OIDC claim mapping value %q has an empty local part: write %s", value, shapes)
	}
	// A lone star is the whole-domain wildcard. Any other local part must be
	// a literal address part. A partial wildcard such as admin*@example.com
	// is rejected on purpose, to keep the grammar small.
	if local != "*" && !isLiteralLocalPart(local) {
		return trace.BadParameter(
			"OIDC claim mapping value %q has a local part that is not a plain address or a single *: write %s",
			value, shapes)
	}

	if !slices.ContainsFunc(workspaceDomains, func(allowed string) bool {
		return strings.EqualFold(allowed, domain)
	}) {
		return trace.BadParameter(
			"OIDC claim mapping value %q ends in %q, which is not a Google Workspace domain of this connector",
			value, domain)
	}

	return nil
}

// isLiteralLocalPart reports whether local is a plain address local part. The
// accepted set is ASCII letters, digits, and the four separators a Google
// account name can hold. Every other character is refused, so no regexp
// metacharacter, whitespace, control character, or non-ASCII rune can reach
// the matcher.
//
// The apostrophe is accepted because a Google account name can hold one, and
// because it is not a regexp metacharacter, so it can only ever reach the
// matcher as a literal.
//
// Two shapes stay refused on purpose. Plus addressing is refused because the
// Google email claim carries the primary Workspace address rather than a
// delivery alias, so a mapping value holding a plus sign would never match a
// claim, and because the plus sign is a regexp metacharacter. A non-ASCII
// local part is refused because admitting one needs a normalisation rule
// first, or a confusable local part becomes an authorization input.
func isLiteralLocalPart(local string) bool {
	for _, r := range local {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '.' || r == '-' || r == '_' || r == '\'':
		default:
			return false
		}
	}
	return true
}
