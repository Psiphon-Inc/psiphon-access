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
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// A 403 that matches a known reason is classified, and carries no reason
// tokens onward. The class already tells the operator what to do, so there is
// nothing to log and no provider text should escape.
func TestClassifiedForbiddenCarriesNoReasons(t *testing.T) {
	t.Parallel()

	for _, reason := range []string{"SERVICE_DISABLED", "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "customerNotLicensed"} {
		t.Run(reason, func(t *testing.T) {
			t.Parallel()

			ci := newFakeCloudIdentity(t)
			ci.directErr = &ciError{status: http.StatusForbidden, body: forbiddenBody(reason)}

			result := groupService(t, ci).lookupGroups(
				context.Background(), directSettings(), "access-token", "user@example.com")

			require.NotEqual(t, groupFailurePermissionDenied, result.Failure,
				"a known reason must not land in the catch-all")
			require.Empty(t, result.UnclassifiedReasons,
				"a classified 403 must not carry provider reasons onward")
		})
	}
}

// The catch-all keeps the reason, because the class alone says only "denied"
// and an operator cannot act on that.
func TestUnclassifiedForbiddenKeepsTheReason(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directErr = &ciError{status: http.StatusForbidden, body: forbiddenBody("SOME_NEW_REASON")}

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")

	require.Equal(t, groupFailurePermissionDenied, result.Failure)
	require.Contains(t, result.UnclassifiedReasons, "SOME_NEW_REASON",
		"the catch-all must keep the reason, or a refused login is uninvestigable")
}

// A provider controls the reason string, so it must not be able to write
// arbitrary content into a log line.
func TestSanitizeReasonsRefusesHostileTokens(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		given []string
		want  []string
	}{
		{
			name:  "plain enum tokens are kept",
			given: []string{"SERVICE_DISABLED", "some-reason.v2"},
			want:  []string{"SERVICE_DISABLED", "some-reason.v2"},
		},
		{
			name:  "whitespace and newlines are dropped",
			given: []string{"a b", "line\nbreak", "tab\there"},
			want:  nil,
		},
		{
			name:  "quotes and log separators are dropped",
			given: []string{`with"quote`, "with=equals", "with,comma"},
			want:  nil,
		},
		{
			name:  "an over-long token is dropped",
			given: []string{strings.Repeat("a", maxReasonLength+1)},
			want:  nil,
		},
		{
			name:  "empty and blank are dropped",
			given: []string{"", "   "},
			want:  nil,
		},
		{
			name:  "duplicates collapse",
			given: []string{"SERVICE_DISABLED", "SERVICE_DISABLED"},
			want:  []string{"SERVICE_DISABLED"},
		},
		{
			name: "the token count is bounded",
			given: []string{
				"reason1", "reason2", "reason3", "reason4",
				"reason5", "reason6", "reason7",
			},
			want: []string{"reason1", "reason2", "reason3", "reason4", "reason5"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.want, sanitizeReasons(test.given))
		})
	}
}
