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
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/gravitational/trace"
	"github.com/stretchr/testify/require"
	zoidc "github.com/zitadel/oidc/v3/pkg/oidc"

	"github.com/gravitational/teleport/api/types"
)

// idTokenClaims builds claims the way the validator does, by decoding a token
// body. Extra claims such as hd survive into the Claims map.
func idTokenClaims(t *testing.T, now time.Time, fields string) *zoidc.IDTokenClaims {
	t.Helper()

	raw := fmt.Sprintf(`{"iss":%q,"aud":"client-id","sub":"google-subject","iat":%d,"exp":%d,%s}`,
		"https://accounts.google.com", now.Unix(), now.Add(time.Hour).Unix(), fields)

	claims := new(zoidc.IDTokenClaims)
	require.NoError(t, json.Unmarshal([]byte(raw), claims))
	return claims
}

// A Google ID token proves only that Google authenticated the account. The
// issuer serves every Google account, personal ones included, so the login
// must be denied unless the hd claim names an allowed Workspace domain.
func TestCheckIdentityClaims(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	allowed := []string{"example.com", "alias.example.net"}

	tests := []struct {
		name      string
		fields    string
		wantClass failureClass
		wantErr   string
	}{
		{
			name:   "workspace account",
			fields: `"email":"user@example.com","email_verified":true,"hd":"example.com"`,
		},
		{
			name:   "hd letter case does not matter",
			fields: `"email":"user@example.com","email_verified":true,"hd":"ExAmPlE.CoM"`,
		},
		{
			name:      "hd mismatch is denied",
			fields:    `"email":"user@evil.com","email_verified":true,"hd":"evil.com"`,
			wantClass: failureHostedDomain,
			wantErr:   "not allowed",
		},
		// hd and the email domain are checked
		// independently, and both must be allow-listed.
		{
			name:      "email domain outside the allow-list is denied although hd is inside",
			fields:    `"email":"user@evil.com","email_verified":true,"hd":"example.com"`,
			wantClass: failureEmailDomain,
			wantErr:   "email domain is not allowed",
		},
		{
			name:      "hd outside the allow-list is denied although the email domain is inside",
			fields:    `"email":"user@example.com","email_verified":true,"hd":"evil.com"`,
			wantClass: failureHostedDomain,
			wantErr:   "Google Workspace domain is not allowed",
		},
		{
			// The case that separates this policy from an equality check.
			name:   "a secondary domain is allowed when hd and the email domain are both allow-listed",
			fields: `"email":"user@alias.example.net","email_verified":true,"hd":"example.com"`,
		},
		{
			name:   "email domain letter case does not matter",
			fields: `"email":"User@ExAmPlE.CoM","email_verified":true,"hd":"example.com"`,
		},
		{
			name:      "an email without a domain is denied",
			fields:    `"email":"user","email_verified":true,"hd":"example.com"`,
			wantClass: failureEmailDomain,
			wantErr:   "usable email address",
		},
		{
			name:      "personal gmail account is denied",
			fields:    `"email":"attacker@gmail.com","email_verified":true`,
			wantClass: failureHostedDomain,
			wantErr:   "did not return a Google Workspace domain",
		},
		{
			name:      "hd of the wrong type is denied",
			fields:    `"email":"user@example.com","email_verified":true,"hd":["example.com"]`,
			wantClass: failureHostedDomain,
			wantErr:   "did not return a Google Workspace domain",
		},
		{
			name:      "email lookalike domain is denied",
			fields:    `"email":"user@example.com","email_verified":true,"hd":"notexample.com"`,
			wantClass: failureHostedDomain,
			wantErr:   "not allowed",
		},
		{
			name:      "unverified email is denied before the domain check",
			fields:    `"email":"user@example.com","email_verified":false,"hd":"example.com"`,
			wantClass: failureIdentityValidation,
			wantErr:   "did not verify email",
		},
		{
			name:      "missing email is denied",
			fields:    `"email_verified":true,"hd":"example.com"`,
			wantClass: failureIdentityValidation,
			wantErr:   "did not return an email",
		},
		{
			name:      "future not-before is denied",
			fields:    fmt.Sprintf(`"email":"user@example.com","email_verified":true,"hd":"example.com","nbf":%d`, now.Add(time.Hour).Unix()),
			wantClass: failureIdentityValidation,
			wantErr:   "future not-before",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			class, err := checkIdentityClaims(idTokenClaims(t, now, test.fields), allowed, now)
			if test.wantErr == "" {
				require.NoError(t, err)
				require.Empty(t, string(class))
				return
			}

			require.Error(t, err)
			require.Contains(t, err.Error(), test.wantErr)
			require.Equal(t, test.wantClass, class)
			require.True(t, trace.IsAccessDenied(err), "got %v", err)
		})
	}
}

// A missing subject is denied. The subject is what binds the login to a
// Teleport user.
func TestCheckIdentityClaimsRequiresASubject(t *testing.T) {
	t.Parallel()

	now := time.Now()
	claims := idTokenClaims(t, now, `"email":"user@example.com","email_verified":true,"hd":"example.com"`)
	claims.Subject = ""

	class, err := checkIdentityClaims(claims, []string{"example.com"}, now)
	require.Error(t, err)
	require.Equal(t, failureIdentityValidation, class)
	require.Contains(t, err.Error(), "did not return a subject")
}

func TestCheckIdentityClaimsRejectsNilClaims(t *testing.T) {
	t.Parallel()

	class, err := checkIdentityClaims(nil, []string{"example.com"}, time.Now())
	require.Error(t, err)
	require.Equal(t, failureIdentityValidation, class)
}

// The audit role source must come from the mappings that
// matched. It used to be the constant "email" whenever any role matched, so
// it carried no information.
func TestRoleSourceForMappings(t *testing.T) {
	t.Parallel()

	emailMapping := types.TraitMapping{Trait: "email", Value: "user@example.com", Roles: []string{"access"}}
	groupMapping := types.TraitMapping{Trait: "groups", Value: "admins", Roles: []string{"editor"}}

	traits := map[string][]string{
		"email":  {"user@example.com"},
		"groups": {"admins"},
	}

	tests := []struct {
		name     string
		mappings types.TraitMappingSet
		traits   map[string][]string
		want     string
	}{
		{
			name:     "email only",
			mappings: types.TraitMappingSet{emailMapping},
			traits:   traits,
			want:     roleSourceEmail,
		},
		{
			name:     "groups only",
			mappings: types.TraitMappingSet{groupMapping},
			traits:   traits,
			want:     roleSourceGroups,
		},
		{
			name:     "both families",
			mappings: types.TraitMappingSet{emailMapping, groupMapping},
			traits:   traits,
			want:     roleSourceBoth,
		},
		{
			name:     "a mapping that matches nothing",
			mappings: types.TraitMappingSet{emailMapping, groupMapping},
			traits:   map[string][]string{"email": {"nobody@example.com"}},
			want:     roleSourceNone,
		},
		{
			name:     "no mapping at all",
			mappings: nil,
			traits:   traits,
			want:     roleSourceNone,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.want, roleSourceForMappings(test.mappings, test.traits))
		})
	}
}

// A provider supplied groups claim must never reach a trait, because group
// membership is not implemented in this build.
func TestClaimsToTraits(t *testing.T) {
	t.Parallel()

	now := time.Now()
	claims := idTokenClaims(t, now,
		`"email":"user@example.com","email_verified":true,"hd":"example.com","groups":["admins"]`)

	raw, err := claimsToMap(claims)
	require.NoError(t, err)
	require.Equal(t, "example.com", raw["hd"])
	require.Contains(t, raw, "groups")

	delete(raw, "groups")
	traits := claimsToTraits(raw)
	require.Equal(t, []string{"user@example.com"}, traits["email"])
	require.NotContains(t, traits, "groups")
}
