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
	"fmt"
	"math/rand/v2"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/lib/utils"
)

// propertyDomains is the Workspace allow-list every test in this file uses.
var propertyDomains = []string{"example.com", "second.example.net"}

// outsideAddresses are addresses that no accepted claim value may ever match.
// The domain of an address is the text after its last @, and none of these
// domains is in propertyDomains. An attacker can register every one of them.
var outsideAddresses = []string{
	"attacker@evil.example.net",
	"attacker@evil.net",
	"attacker@gmail.com",
	// Lookalike domains. The first replaces the l with a capital I, the
	// second replaces the m with rn, and the third replaces the dot with a
	// letter, which is what an unescaped dot in a raw regexp lets through.
	"attacker@exampIe.com",
	"attacker@exarnple.com",
	"victim@exampleXcom",
	// Suffix and prefix tricks around an allowed domain.
	"attacker@notexample.com",
	"attacker@example.co",
	"attacker@example.com.evil.net",
	"attacker@sub.example.com",
	"attacker@second.example.net.evil.net",
	"attacker@example.net",
	// Structural tricks.
	"attacker@example.com@evil.net",
	"user@example.com\nattacker@evil.example.net",
	"attacker@ example.com",
	"@evil.net",
	"attacker",
	"",
}

// insideAddresses are addresses inside the allow-list. They are used to prove
// the matcher helper and the corpus are not vacuous.
var insideAddresses = []string{
	"user@example.com",
	"first.last@example.com",
	"user@second.example.net",
}

// matchesInProduction reports whether a Teleport claim mapping with this value
// matches address. It compiles the value the way lib/services/traits.go
// compiles a claims_to_roles value on the login path: through
// utils.RegexpWithConfig, which applies the glob and raw-regexp rules of
// lib/utils/replace.go, and then through utils.ReplaceRegexpWith, whose
// not-found error is what makes the mapping skip a trait value.
func matchesInProduction(t *testing.T, value, address string) bool {
	t.Helper()

	expr, err := utils.RegexpWithConfig(value, utils.RegexpConfig{IgnoreCase: true})
	if err != nil {
		// An invalid regexp never matches, and the login path warns and
		// skips the mapping.
		return false
	}
	if _, err := utils.ReplaceRegexpWith(expr, "some-role", address); err != nil {
		return false
	}
	return true
}

// The helper must report a match for the values the reviewer proved dangerous,
// otherwise the property test below would pass for the wrong reason.
func TestMatchesInProductionIsNotVacuous(t *testing.T) {
	t.Parallel()

	for _, value := range []string{"*", "^.*$", "**", "*@*", "^(.*)$", `^[\s\S]*$`} {
		require.True(t, matchesInProduction(t, value, "attacker@evil.example.net"),
			"value %q must still match an outside address, the probe is the point", value)
	}
	require.True(t, matchesInProduction(t, "*@example.com", "user@example.com"))
	require.False(t, matchesInProduction(t, "*@example.com", "attacker@evil.example.net"))
}

// The six values a reviewer proved against the denylist must all be rejected,
// and the two legitimate shapes must be accepted.
func TestValidateEmailClaimValue(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		value   string
		accept  bool
		errIs   string
		comment string
	}{
		// The six proven bypasses.
		{name: "star", value: "*", errIs: "user@domain or *@domain"},
		{name: "anchored any", value: "^.*$", errIs: "regular expression"},
		{name: "double star", value: "**", errIs: "user@domain or *@domain"},
		{name: "star at star", value: "*@*", errIs: "not a Google Workspace domain"},
		{name: "anchored group", value: "^(.*)$", errIs: "regular expression"},
		{name: "anchored class", value: `^[\s\S]*$`, errIs: "regular expression"},

		// Raw regexps, including the unescaped dot in the domain part.
		{name: "raw regexp exact domain", value: `^[^@]+@example\.com$`, errIs: "regular expression"},
		{name: "raw regexp unescaped dot", value: "^.*@example.com$", errIs: "regular expression"},
		{name: "raw regexp of an allowed address", value: "^user@example.com$", errIs: "regular expression"},
		{name: "caret only", value: "^", errIs: "regular expression"},

		// Wrong @ count.
		{name: "empty", value: "", errIs: "cannot be empty"},
		{name: "no at", value: "example.com", errIs: "user@domain or *@domain"},
		{name: "two ats", value: "user@example.com@example.com", errIs: "user@domain or *@domain"},
		{name: "star at star at domain", value: "*@*@example.com", errIs: "user@domain or *@domain"},

		// Local part shapes that are not an exact address or a lone star.
		{name: "empty local part", value: "@example.com", errIs: "local part"},
		{name: "partial local glob", value: "admin*@example.com", errIs: "local part"},
		{name: "leading star local", value: "*admin@example.com", errIs: "local part"},
		{name: "regexp local part", value: ".*@example.com", errIs: "local part"},
		{name: "class local part", value: "[a-z]+@example.com", errIs: "local part"},
		{name: "group local part", value: "(user|admin)@example.com", errIs: "local part"},
		{name: "space in local part", value: "the user@example.com", errIs: "local part"},
		{name: "leading space", value: " user@example.com", errIs: "local part"},
		{name: "tab in local part", value: "user\t@example.com", errIs: "local part"},
		{name: "newline in local part", value: "user\n@example.com", errIs: "local part"},
		// Refused on purpose. A non-ASCII local part
		// needs a normalisation rule first. Plus addressing is a delivery
		// alias that the Google email claim never carries, and the plus sign
		// is a regexp metacharacter.
		{name: "non ascii local part", value: "üser@example.com", errIs: "local part"},
		{name: "plus addressing", value: "user+tag@example.com", errIs: "local part"},

		// Domains outside the connector allow-list.
		{name: "outside domain", value: "user@evil.example.net", errIs: "not a Google Workspace domain"},
		{name: "star outside domain", value: "*@evil.example.net", errIs: "not a Google Workspace domain"},
		{name: "domain suffix", value: "user@example.com.evil.net", errIs: "not a Google Workspace domain"},
		{name: "domain prefix", value: "user@notexample.com", errIs: "not a Google Workspace domain"},
		{name: "subdomain", value: "user@sub.example.com", errIs: "not a Google Workspace domain"},
		{name: "domain wildcard", value: "user@*.example.com", errIs: "not a Google Workspace domain"},
		{name: "trailing space in domain", value: "user@example.com ", errIs: "not a Google Workspace domain"},
		{name: "trailing dot in domain", value: "user@example.com.", errIs: "not a Google Workspace domain"},
		{name: "lookalike domain", value: "user@exampIe.com", errIs: "not a Google Workspace domain"},

		// The two accepted shapes.
		{name: "exact address", value: "user@example.com", accept: true},
		{name: "exact address second domain", value: "user@second.example.net", accept: true},
		{name: "dotted local part", value: "first.last@example.com", accept: true},
		{name: "dashed local part", value: "first-last@example.com", accept: true},
		{name: "underscored local part", value: "first_last@example.com", accept: true},
		// Accepted on purpose. A Google account name can hold an
		// apostrophe, and it is not a regexp metacharacter, so it can only
		// reach the matcher as a literal.
		{name: "apostrophe local part", value: "o'brien@example.com", accept: true},
		{name: "apostrophe with dot", value: "o'brien.jr@example.com", accept: true},
		{name: "digits in local part", value: "user2026@example.com", accept: true},
		{name: "mixed case local part", value: "First.Last@example.com", accept: true},
		{name: "mixed case domain", value: "user@Example.COM", accept: true},
		{name: "whole domain", value: "*@example.com", accept: true},
		{name: "whole second domain", value: "*@second.example.net", accept: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			err := validateEmailClaimValue(test.value, propertyDomains)
			if test.accept {
				require.NoError(t, err, "value %q must be accepted", test.value)
				return
			}
			require.Error(t, err, "value %q must be rejected", test.value)
			require.Contains(t, err.Error(), test.errIs)
		})
	}
}

// An accepted value must match the address it names. A grammar that accepted
// nothing usable would pass the property test below and be useless.
func TestAcceptedClaimValuesMatchTheirOwnDomain(t *testing.T) {
	t.Parallel()

	require.True(t, matchesInProduction(t, "user@example.com", "user@example.com"))
	require.True(t, matchesInProduction(t, "*@example.com", "anyone@example.com"))
	require.True(t, matchesInProduction(t, "*@second.example.net", "anyone@second.example.net"))
}

// claimValueCorpus returns a wide set of candidate claim values: a structured
// cross product around the allowed and forbidden shapes, plus random strings
// over an alphabet full of regexp and glob metacharacters.
func claimValueCorpus() []string {
	locals := []string{
		"", "user", "User", "u", "first.last", "first-last", "first_last", "user1",
		"*", "**", "a*", "*a", "*.*", ".*", ".+", "[a-z]", "[^@]+", "(.*)", "(a|b)",
		"user+tag", "user tag", "user\t", "user\n", "üser", "^user", "user$", `\w+`,
		"a{1,9}", "a?", "a|b", "/user/", "%s", "\x00",
	}
	ats := []string{"", "@", "@@", " @ ", "@x@"}
	domains := []string{
		"", "example.com", "EXAMPLE.COM", "Example.Com", "second.example.net",
		"example.com.", ".example.com", "example.com ", " example.com",
		"evil.example.net", "notexample.com", "example.co", "example.com.evil.net",
		"sub.example.com", "exampIe.com", "exarnple.com", "*", "**", "*.example.com",
		"example.*", "example.com|evil.net", "example.com\n", `example\.com`,
		".*", "[a-z.]+", "(example|evil).com",
	}
	wrappers := []struct{ prefix, suffix string }{
		{"", ""}, {"^", "$"}, {"^", ""}, {"", "$"}, {"^(", ")$"}, {" ", " "},
	}

	var corpus []string
	for _, local := range locals {
		for _, at := range ats {
			for _, domain := range domains {
				for _, wrap := range wrappers {
					corpus = append(corpus, wrap.prefix+local+at+domain+wrap.suffix)
				}
			}
		}
	}

	// Random strings over an alphabet of letters, digits and every character
	// that has a meaning to the glob or regexp compiler.
	alphabet := []rune(`abzABZ019.-_+*^$@()[]{}|?\/ ` + "\t\n")
	random := rand.New(rand.NewPCG(0x5eed, 0xc1a1))
	randomRunes := func(length int) string {
		var b strings.Builder
		for range length {
			b.WriteRune(alphabet[random.IntN(len(alphabet))])
		}
		return b.String()
	}
	for range 40000 {
		corpus = append(corpus, randomRunes(random.IntN(15)))
	}

	// Random near misses: a random local part in front of a real domain, so
	// the corpus keeps hitting the accepting path and the border around it.
	nearDomains := []string{
		"example.com", "EXAMPLE.com", "Second.Example.NET", "second.example.net",
		"example.com.evil.net", "evil.example.net", "exampIe.com", "example.com ",
	}
	for range 20000 {
		local := randomRunes(1 + random.IntN(8))
		corpus = append(corpus, local+"@"+nearDomains[random.IntN(len(nearDomains))])
	}

	return corpus
}

// The invariant: whatever a grammar accepts, the Teleport matcher built from
// that value must not match any address outside the connector Workspace
// domains. This is the real proof, because it holds for every value in a wide
// corpus, not for the handful of values a denylist happened to name.
//
// The loop runs over the whole grammar registry, so the groups claim is held
// to the same standard as the email claim, and so a third grammar is covered
// on the day it is added.
func TestAcceptedClaimValueNeverMatchesOutsideWorkspaceDomains(t *testing.T) {
	t.Parallel()

	corpus := claimValueCorpus()
	require.Greater(t, len(corpus), 40000)
	require.Len(t, claimGrammars, 2, "a new grammar must be covered by this property")

	for _, grammar := range claimGrammars {
		t.Run(grammar.claim, func(t *testing.T) {
			t.Parallel()

			var accepted int
			for _, value := range corpus {
				if err := grammar.validate(value, propertyDomains); err != nil {
					continue
				}
				accepted++

				for _, address := range outsideAddresses {
					if matchesInProduction(t, value, address) {
						t.Fatalf("accepted %s claim value %q matches the outside address %q",
							grammar.claim, value, address)
					}
				}
			}

			// A grammar that accepts nothing would satisfy the invariant and
			// be worthless, so the corpus must exercise the accepting path.
			require.Greater(t, accepted, 500, "the corpus must contain accepted values")
			t.Logf("claim %s: checked %d candidate values, %d accepted, against %d outside addresses",
				grammar.claim, len(corpus), accepted, len(outsideAddresses))
		})
	}
}

// The same invariant, driven by the fuzzer, over every grammar. The seed
// corpus runs in a normal go test run, and go test -fuzz explores further.
func FuzzAcceptedClaimValueNeverMatchesOutsideWorkspaceDomains(f *testing.F) {
	for _, seed := range []string{
		"*", "^.*$", "**", "*@*", "^(.*)$", `^[\s\S]*$`, "user@example.com",
		"*@example.com", "^.*@example.com$", "admin*@example.com", "@example.com",
		"engineering@example.com", "*@second.example.net",
	} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, value string) {
		for _, grammar := range claimGrammars {
			if err := grammar.validate(value, propertyDomains); err != nil {
				continue
			}
			for _, address := range outsideAddresses {
				if matchesInProduction(t, value, address) {
					t.Fatalf("accepted %s claim value %q matches the outside address %q",
						grammar.claim, value, address)
				}
			}
		}
	})
}

// A second claim grammar must be addable without rewriting the caller, so the
// registry, and not ValidateConnector, decides which claims exist.
func TestClaimGrammarRegistry(t *testing.T) {
	t.Parallel()

	grammar, ok := grammarForClaim("email")
	require.True(t, ok)
	require.NoError(t, grammar.validate("user@example.com", propertyDomains))

	groups, ok := grammarForClaim(GroupsClaim)
	require.True(t, ok)
	require.NoError(t, groups.validate("engineering@example.com", propertyDomains))

	_, ok = grammarForClaim("")
	require.False(t, ok)

	_, ok = grammarForClaim("sub")
	require.False(t, ok)
}

// The groups grammar is the email grammar with its own message. It must reject
// every shape the email grammar rejects, and the message must name the group
// shape so an operator is not told to write a user address.
func TestValidateGroupsClaimValue(t *testing.T) {
	t.Parallel()

	accepted := []string{
		"engineering@example.com",
		"eng-platform@example.com",
		"eng.platform@second.example.net",
		"*@example.com",
		"Engineering@Example.COM",
	}
	for _, value := range accepted {
		require.NoError(t, validateGroupsClaimValue(value, propertyDomains), "value %q must be accepted", value)
	}

	rejected := map[string]string{
		"":                            "cannot be empty",
		"*":                           "group@domain or *@domain",
		"**":                          "group@domain or *@domain",
		"*@*":                         "not a Google Workspace domain",
		"^.*$":                        "regular expression",
		"^.*@example.com$":            "regular expression",
		"eng*@example.com":            "local part",
		"@example.com":                "local part",
		"engineering@evil.net":        "not a Google Workspace domain",
		"engineering@sub.example.com": "not a Google Workspace domain",
	}
	for value, wantMessage := range rejected {
		err := validateGroupsClaimValue(value, propertyDomains)
		require.Error(t, err, "value %q must be rejected", value)
		require.Contains(t, err.Error(), wantMessage)
	}

	// The two grammars must agree on every value of the corpus. If they ever
	// diverge, one of them has been relaxed by accident.
	for _, value := range claimValueCorpus() {
		emailErr := validateEmailClaimValue(value, propertyDomains)
		groupsErr := validateGroupsClaimValue(value, propertyDomains)
		require.Equal(t, emailErr == nil, groupsErr == nil,
			"the email and groups grammars disagree on %q", value)
	}
}

// The rejection message must name the offending value, so an operator can fix
// the connector without reading the source.
func TestClaimValueErrorNamesTheValue(t *testing.T) {
	t.Parallel()

	err := validateEmailClaimValue("admin*@example.com", propertyDomains)
	require.Error(t, err)
	require.Contains(t, err.Error(), fmt.Sprintf("%q", "admin*@example.com"))
}
