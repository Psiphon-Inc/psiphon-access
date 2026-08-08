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
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/api/googleapi"

	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/googleoidc/policy"
	"github.com/gravitational/teleport/lib/loginrule"
	logutils "github.com/gravitational/teleport/lib/utils/log"
)

// fakeLoginRuleEvaluator replaces the traits of a login, the way a login rule
// does.
type fakeLoginRuleEvaluator struct {
	traits map[string][]string
	rules  []string
}

func (f fakeLoginRuleEvaluator) Evaluate(context.Context, *loginrule.EvaluationInput) (*loginrule.EvaluationOutput, error) {
	return &loginrule.EvaluationOutput{
		Traits:       f.traits,
		AppliedRules: f.rules,
	}, nil
}

// ---------------------------------------------------------------------------
// A hermetic Cloud Identity.
// ---------------------------------------------------------------------------

// ciKey is one groupKey of a search response.
type ciKey struct {
	ID        string `json:"id,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

// ciMembership is one relation of a searchDirectGroups response.
type ciMembership struct {
	GroupKey ciKey             `json:"groupKey"`
	Labels   map[string]string `json:"labels,omitempty"`
}

// ciPage is one page of a search response. Filler exists so a test can make a
// page large without inventing thousands of groups.
type ciPage struct {
	Memberships   []ciMembership `json:"memberships,omitempty"`
	NextPageToken string         `json:"nextPageToken,omitempty"`
	Filler        string         `json:"filler,omitempty"`
}

// ciError is an injected HTTP failure.
type ciError struct {
	status int
	body   string
}

// ciRequest is what the fake recorded about one call.
type ciRequest struct {
	path          string
	query         url.Values
	authorization string
}

// fakeCloudIdentity is a hermetic stand-in for cloudidentity.googleapis.com.
// It answers the one search method this fork pins, and nothing else. There is
// no searchTransitiveGroups handler, so a lookup that reached for the removed
// method would get a 404 from the mux rather than a plausible answer.
type fakeCloudIdentity struct {
	t      *testing.T
	server *httptest.Server

	mu         sync.Mutex
	directPage []ciPage
	directErr  *ciError
	// redirectTo, when set, answers every call with a redirect.
	redirectTo string
	requests   []ciRequest
}

func newFakeCloudIdentity(t *testing.T) *fakeCloudIdentity {
	t.Helper()

	f := &fakeCloudIdentity{t: t}
	mux := http.NewServeMux()
	mux.HandleFunc(directGroupsPath, f.serve)
	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeCloudIdentity) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.requests = append(f.requests, ciRequest{
		path:          r.URL.Path,
		query:         r.URL.Query(),
		authorization: r.Header.Get("Authorization"),
	})
	pages, failure := f.directPage, f.directErr
	redirect := f.redirectTo
	f.mu.Unlock()

	if redirect != "" {
		http.Redirect(w, r, redirect, http.StatusFound)
		return
	}

	// searchDirectGroups REFUSES a label clause in the query, however much the
	// generated client documents one as required. Sending it is what made
	// direct mode fail every login, so the fake enforces the real
	// contract and answers exactly as Google answers. Any mention of labels is
	// refused, not one spelling of the clause, so a reworded clause cannot slip
	// past the fake and look like it worked.
	if strings.Contains(r.URL.Query().Get("query"), "labels") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"code":400,` +
			`"message":"Request contains an invalid argument.",` +
			`"status":"INVALID_ARGUMENT"}}`))
		return
	}

	if failure != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(failure.status)
		_, _ = w.Write([]byte(failure.body))
		return
	}

	index := 0
	if token := r.URL.Query().Get("pageToken"); token != "" {
		parsed, err := strconv.Atoi(token)
		if err != nil {
			http.Error(w, `{"error":{"code":400}}`, http.StatusBadRequest)
			return
		}
		index = parsed
	}
	if index >= len(pages) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
		return
	}

	// Honour the field mask the way the real API does: a field that was not
	// asked for does not come back. Without this the fake would hand the
	// client labels it never requested, and the client-side label gate would
	// look like it worked while the real API returned nothing to gate on. The
	// gate is load bearing here, because this method cannot filter the group
	// kind server-side.
	page := pages[index]
	if !strings.Contains(r.URL.Query().Get("fields"), "memberships/labels") {
		stripped := make([]ciMembership, 0, len(page.Memberships))
		for _, membership := range page.Memberships {
			membership.Labels = nil
			stripped = append(stripped, membership)
		}
		page.Memberships = stripped
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(page)
}

// transport is the network hop to the fake. Every pin above it still sees the
// canonical https://cloudidentity.googleapis.com URL.
func (f *fakeCloudIdentity) transport() http.RoundTripper {
	target, err := url.Parse(f.server.URL)
	require.NoError(f.t, err)
	return rewriteRoundTripper{base: f.server.Client().Transport, target: target}
}

func (f *fakeCloudIdentity) recorded() []ciRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]ciRequest(nil), f.requests...)
}

func (f *fakeCloudIdentity) pathsCalled() []string {
	paths := []string{}
	for _, request := range f.recorded() {
		paths = append(paths, request.path)
	}
	return paths
}

// groupService builds a Service that can do nothing but look groups up.
func groupService(t *testing.T, ci *fakeCloudIdentity) *Service {
	t.Helper()

	return &Service{
		logger:                 logutils.NewPackageLogger("test", "google-oidc"),
		cloudIdentityTransport: ci.transport(),
	}
}

// groupPage builds one page from plain group addresses. Every membership
// carries the discussion forum label, which is what a real Google group
// carries. The fake removes it again when the field mask did not ask for it.
// A test that wants a group without the label builds the membership by hand.
func groupPage(nextPageToken string, ids ...string) ciPage {
	page := ciPage{NextPageToken: nextPageToken}
	for _, id := range ids {
		page.Memberships = append(page.Memberships, ciMembership{
			GroupKey: ciKey{ID: id},
			Labels:   map[string]string{discussionForumLabel: ""},
		})
	}
	return page
}

// directSettings is the only configured mode.
func directSettings() policy.GroupSettings {
	return policy.GroupSettings{
		Enabled:          true,
		Mode:             policy.MembershipDirect,
		WorkspaceDomains: []string{"example.com"},
	}
}

// forbiddenBody renders a Google 403 body that names a reason in both places a
// real error carries one.
func forbiddenBody(reason string) string {
	return fmt.Sprintf(`{"error":{"code":403,"message":"denied","status":"PERMISSION_DENIED",`+
		`"errors":[{"message":"denied","domain":"global","reason":%q}],`+
		`"details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":%q}]}}`, reason, reason)
}

// ---------------------------------------------------------------------------
// The four gates.
// ---------------------------------------------------------------------------

// forumRelation is a relation the way the API returns one for a Google group:
// no namespace, and the discussion forum label present. The label gate has its
// own test, so every other gate test starts from a relation that clears it.
func forumRelation(id string) groupRelation {
	return groupRelation{id: id, discussionForum: true}
}

// The critical group-namespace defect. EntityKey.id is a Google address only
// when EntityKey.namespace is empty. A relation that carries a namespace comes
// from an external identity source, which chooses the id freely, so it can
// name a real Google group and inherit its roles.
func TestGateRelationsRejectsNamespacedGroup(t *testing.T) {
	t.Parallel()

	relations := []groupRelation{
		forumRelation("engineering@example.com"),
		// The impersonation: an external identity source holding a group
		// whose id is the address of the real Google group above.
		{id: "engineering@example.com", namespace: "identitysources/1234", discussionForum: true},
		{id: "admins@example.com", namespace: "identitysources/1234", discussionForum: true},
	}

	groups, outcome, rejected := gateRelations(relations, []string{"example.com"})

	require.Equal(t, []string{"engineering@example.com"}, groups,
		"a namespaced relation must never reach a role mapping")
	require.NotContains(t, groups, "admins@example.com")
	require.Equal(t, groupOutcomeNamespaceRejected, outcome,
		"the rejection needs its own class, so a false rejection is legible")
	require.Equal(t, 2, rejected.Namespace)
	require.Zero(t, rejected.Syntax)
	require.Zero(t, rejected.Domain)
}

// The whole field mask matters as much as the check: a namespace that is never
// requested is always empty, which is how the prototype missed it.
func TestLookupRequestsTheNamespaceField(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com")}

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")
	require.Empty(t, result.Failure)

	requests := ci.recorded()
	require.Len(t, requests, 1)
	fields := requests[0].query.Get("fields")
	require.Contains(t, fields, "memberships/groupKey/namespace",
		"the namespace must be requested, or every relation looks Google-managed")
	require.Contains(t, fields, "memberships/groupKey/id")
	require.Contains(t, fields, "nextPageToken")
}

// The syntax gate. A group id is a single addr-spec, and nothing else reaches
// a trait or a role mapping.
func TestValidGroupAddress(t *testing.T) {
	t.Parallel()

	accepted := []string{
		"engineering@example.com",
		"eng-platform@example.com",
		"eng.platform@sub.example.com",
		"a@b.co",
		"user+tag@example.com",
		"o'brien@example.com",
	}
	for _, id := range accepted {
		require.True(t, validGroupAddress(id), "id %q must be accepted", id)
	}

	rejected := []string{
		"",
		"engineering",
		"engineering@",
		"@example.com",
		"engineering@example.com@evil.net",
		"engineering@@example.com",
		"eng ineering@example.com",
		"engineering @example.com",
		"engineering@example.com ",
		" engineering@example.com",
		"engineering\t@example.com",
		"engineering\n@example.com",
		"engineering@example.com,admins@example.com",
		"engineering,admins@example.com",
		"engineering@example.com\nadmins@example.com",
		"engineering\x00@example.com",
		"engineering@exam\x00ple.com",
		"engineering@example.com\x7f",
		"üser@example.com",
		"engineering@exämple.com",
		"\"eng ineering\"@example.com",
		".engineering@example.com",
		"engineering.@example.com",
		"eng..ineering@example.com",
		"engineering@example",
		"engineering@-example.com",
		"engineering@example-.com",
		"engineering@exa mple.com",
		"engineering@example..com",
		strings.Repeat("a", 65) + "@example.com",
	}
	for _, id := range rejected {
		require.False(t, validGroupAddress(id), "id %q must be rejected", id)
	}
}

// The gate must actually run inside gateRelations, not only exist.
func TestGateRelationsDropsMalformedIDs(t *testing.T) {
	t.Parallel()

	relations := []groupRelation{
		forumRelation("engineering@example.com"),
		forumRelation("admins@example.com,attacker@evil.net"),
		forumRelation("eng ineering@example.com"),
		forumRelation("engineering\n@example.com"),
		forumRelation("not-an-address"),
	}

	groups, outcome, rejected := gateRelations(relations, []string{"example.com"})

	require.Equal(t, []string{"engineering@example.com"}, groups)
	require.Equal(t, groupOutcomeFiltered, outcome)
	require.Equal(t, 4, rejected.Syntax)
	require.Zero(t, rejected.Namespace)
}

// The domain gate. A group outside the connector Workspace allow-list grants
// nothing, whatever Cloud Identity returned.
func TestGateRelationsDropsGroupsOutsideTheAllowList(t *testing.T) {
	t.Parallel()

	relations := []groupRelation{
		forumRelation("engineering@example.com"),
		forumRelation("ENGINEERING@EXAMPLE.COM"),
		forumRelation("attacker@evil.net"),
		forumRelation("attacker@example.com.evil.net"),
		forumRelation("attacker@sub.example.com"),
		forumRelation("attacker@notexample.com"),
	}

	groups, outcome, rejected := gateRelations(relations, []string{"example.com"})

	require.Equal(t, []string{"engineering@example.com"}, groups,
		"only a group inside the allow-list survives, and the address is lower-cased and de-duplicated")
	require.Equal(t, groupOutcomeFiltered, outcome)
	require.Equal(t, 4, rejected.Domain)
}

// The outcome classes. The prototype recorded an empty or partial 200 as
// succeeded, so an operator could not tell "in no group" from "cannot see the
// groups".
func TestGateRelationsOutcomes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		relations []groupRelation
		want      groupOutcome
		wantCount int
	}{
		{
			name:      "every relation survives",
			relations: []groupRelation{forumRelation("engineering@example.com")},
			want:      groupOutcomeSucceeded,
			wantCount: 1,
		},
		{
			name:      "nothing returned is not a success",
			relations: nil,
			want:      groupOutcomeNoGroupsVisible,
		},
		{
			name:      "empty page is not a success",
			relations: []groupRelation{},
			want:      groupOutcomeNoGroupsVisible,
		},
		{
			name: "a dropped relation is reported",
			relations: []groupRelation{
				forumRelation("engineering@example.com"),
				forumRelation("attacker@evil.net"),
			},
			want:      groupOutcomeFiltered,
			wantCount: 1,
		},
		{
			name: "the namespace class outranks the filter class",
			relations: []groupRelation{
				forumRelation("attacker@evil.net"),
				{id: "engineering@example.com", namespace: "identitysources/1", discussionForum: true},
			},
			want: groupOutcomeNamespaceRejected,
		},
		{
			name: "a relation without the forum label is dropped",
			relations: []groupRelation{
				forumRelation("engineering@example.com"),
				{id: "not-a-google-group@example.com"},
			},
			want:      groupOutcomeFiltered,
			wantCount: 1,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			groups, outcome, _ := gateRelations(test.relations, []string{"example.com"})
			require.Equal(t, test.want, outcome)
			require.Len(t, groups, test.wantCount)
		})
	}
}

// The empty result must survive the whole lookup as its own class, not only
// inside gateRelations.
func TestLookupReportsRestrictedVisibility(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{{}}

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")

	require.Empty(t, result.Failure)
	require.Empty(t, result.Groups)
	require.Equal(t, groupOutcomeNoGroupsVisible, result.Outcome,
		"an empty HTTP 200 is ambiguous and must not be recorded as a success")

	audit := newCallbackAudit()
	audit.setGroupLookup(result)
	require.Equal(t, string(groupOutcomeNoGroupsVisible), audit.groupAuditAttributes()["group_lookup_class"])
}

// ---------------------------------------------------------------------------
// The one mode.
// ---------------------------------------------------------------------------

// The lookup must call searchDirectGroups, the method confirmed against
// google.golang.org/api/cloudidentity/v1, and no other. It must also follow
// the page token, concatenate the pages, and drop the duplicates.
func TestLookupGroupsDirect(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{
		groupPage("1", "engineering@example.com", "platform@example.com"),
		groupPage("", "engineering@example.com", "security@example.com"),
	}

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "User@Example.com")

	require.Empty(t, result.Failure)
	require.Equal(t, groupOutcomeSucceeded, result.Outcome)
	require.Equal(t, policy.MembershipDirect, result.Mode)
	require.Equal(t, []string{"engineering@example.com", "platform@example.com", "security@example.com"},
		result.Groups, "pages are concatenated and duplicates are dropped")

	requests := ci.recorded()
	require.Len(t, requests, 2, "the lookup must follow the page token")
	require.Equal(t, []string{directGroupsPath, directGroupsPath}, ci.pathsCalled(),
		"searchDirectGroups is the only method this fork calls")
	require.Equal(t, "Bearer access-token", requests[0].authorization,
		"the lookup uses the access token of this login and no other credential")
	require.Equal(t, "member_key_id == 'User@Example.com'", requests[0].query.Get("query"))
	require.Equal(t, "1000", requests[0].query.Get("pageSize"))
	require.Equal(t, "1", requests[1].query.Get("pageToken"))
}

// The label-clause defect. The generated client documents searchDirectGroups as
// requiring a label clause in the query, and the live API answers its own
// example with 400 INVALID_ARGUMENT. Sending the clause made every group-gated
// login fail, in every deployment.
func TestDirectSearchQueryCarriesNoLabelClause(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com")}

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")

	require.Empty(t, result.Failure)
	require.Len(t, ci.recorded(), 1)
	request := ci.recorded()[0]
	query := request.query.Get("query")
	require.Equal(t, "member_key_id == 'user@example.com'", query,
		"the label clause makes the live API answer 400 INVALID_ARGUMENT")
	require.NotContains(t, query, "labels")
	require.NotContains(t, query, discussionForumLabel)

	// The label filter moves off the server, so it has to come back in the
	// response for the client gate to have anything to read.
	require.Contains(t, request.query.Get("fields"), "memberships/labels")
}

// The guard above is the whole reason that defect cannot come back, so
// it must not be dead code. Call the fake with a label clause by hand and
// confirm it answers the way the live API answered.
func TestFakeCloudIdentityRefusesALabelClause(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com")}

	query := url.Values{}
	query.Set("query", "member_key_id == 'user@example.com' && '"+discussionForumLabel+"' in labels")
	response, err := ci.server.Client().Get(ci.server.URL + directGroupsPath + "?" + query.Encode())
	require.NoError(t, err)
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, response.StatusCode)
	require.Contains(t, string(body), "INVALID_ARGUMENT")

	// The same call without the clause is served, so the 400 is the clause and
	// not the fake refusing everything.
	query.Set("query", "member_key_id == 'user@example.com'")
	ok, err := ci.server.Client().Get(ci.server.URL + directGroupsPath + "?" + query.Encode())
	require.NoError(t, err)
	defer ok.Body.Close()
	require.Equal(t, http.StatusOK, ok.StatusCode)
}

// The direct query cannot filter the group kind server-side, so the gate runs
// on the client. It is load bearing: without it the lookup would accept a kind
// of group a Workspace operator never meant to map to a role.
func TestDirectLookupDropsGroupsWithoutTheForumLabel(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{{Memberships: []ciMembership{
		{
			GroupKey: ciKey{ID: "engineering@example.com"},
			Labels:   map[string]string{discussionForumLabel: ""},
		},
		// No label: not a Google group, so not something a Workspace
		// connector maps to a role.
		{GroupKey: ciKey{ID: "not-a-google-group@example.com"}},
		// A label, but not the one that marks a Google group.
		{
			GroupKey: ciKey{ID: "other-kind@example.com"},
			Labels:   map[string]string{"cloudidentity.googleapis.com/groups.security": ""},
		},
	}}}

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")

	require.Empty(t, result.Failure)
	require.Equal(t, []string{"engineering@example.com"}, result.Groups)
	require.Equal(t, 2, result.Rejected.Label)
	require.Zero(t, result.Rejected.Namespace)
	require.Zero(t, result.Rejected.Syntax)
	require.Zero(t, result.Rejected.Domain)
	require.Equal(t, groupOutcomeFiltered, result.Outcome,
		"a dropped relation must not read as a clean success")
}

// ---------------------------------------------------------------------------
// The whole-lookup byte bound.
// ---------------------------------------------------------------------------

// The prototype bounded each HTTP response, so a paginated lookup could buffer
// pages times the bound. The budget is shared by the whole lookup.
func TestLookupGroupsBoundsTheWholeLookup(t *testing.T) {
	t.Parallel()

	// Two pages, each well under the bound, and together over it.
	half := groupLookupMaxBytes/2 + 1024
	ci := newFakeCloudIdentity(t)
	first := groupPage("1", "engineering@example.com")
	first.Filler = strings.Repeat("a", half)
	second := groupPage("", "platform@example.com")
	second.Filler = strings.Repeat("b", half)
	ci.directPage = []ciPage{first, second}

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")

	require.Equal(t, groupFailureResponseTooLarge, result.Failure,
		"the byte bound must cover the whole lookup, not one response")
	require.Empty(t, result.Groups, "a failed lookup grants no roles from group mappings")
	require.Len(t, ci.recorded(), 2, "the first page must be under the per-response size, or the test proves nothing")

	// The first page on a fresh budget must succeed, or the failure above
	// would prove only that one page is too big.
	fresh := newFakeCloudIdentity(t)
	only := groupPage("", "engineering@example.com")
	only.Filler = strings.Repeat("a", half)
	fresh.directPage = []ciPage{only}
	freshResult := groupService(t, fresh).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")
	require.Empty(t, freshResult.Failure)
	require.Equal(t, []string{"engineering@example.com"}, freshResult.Groups)
}

// A single over-long response is refused too.
func TestLookupGroupsRefusesAnOverlongResponse(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	page := groupPage("", "engineering@example.com")
	page.Filler = strings.Repeat("a", groupLookupMaxBytes+1)
	ci.directPage = []ciPage{page}

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")

	require.Equal(t, groupFailureResponseTooLarge, result.Failure)
}

func TestByteBudget(t *testing.T) {
	t.Parallel()

	budget := &byteBudget{remaining: 10}
	require.Equal(t, int64(10), budget.left())
	require.True(t, budget.consume(4))
	require.Equal(t, int64(6), budget.left())
	require.True(t, budget.consume(6))
	require.Equal(t, int64(0), budget.left())
	require.False(t, budget.consume(1))
}

// ---------------------------------------------------------------------------
// Failure classes.
// ---------------------------------------------------------------------------

// The prototype collapsed every 403 into one class. The cause must be named.
func TestClassifyForbiddenSplitsByReason(t *testing.T) {
	t.Parallel()

	tests := map[string]groupFailure{
		"ACCESS_TOKEN_SCOPE_INSUFFICIENT": groupFailureInsufficientScope,
		"insufficientPermissions":         groupFailureInsufficientScope,
		"customerNotLicensed":             groupFailureUnsupportedEdition,
		"NOT_LICENSED_FOR_FEATURE":        groupFailureUnsupportedEdition,
		"SERVICE_DISABLED":                groupFailureAPINotEnabled,
		"accessNotConfigured":             groupFailureAPINotEnabled,
		"forbidden":                       groupFailurePermissionDenied,
		"somethingNew":                    groupFailurePermissionDenied,
	}

	for reason, want := range tests {
		t.Run(reason, func(t *testing.T) {
			t.Parallel()

			ci := newFakeCloudIdentity(t)
			ci.directErr = &ciError{status: http.StatusForbidden, body: forbiddenBody(reason)}

			result := groupService(t, ci).lookupGroups(
				context.Background(), directSettings(), "access-token", "user@example.com")
			require.Equal(t, want, result.Failure)
		})
	}
}

// A 403 with no reason at all still lands in a named class.
func TestClassifyForbiddenWithoutAReason(t *testing.T) {
	t.Parallel()

	require.Equal(t, groupFailurePermissionDenied, classifyForbidden(&googleapi.Error{Code: 403}))
	require.Equal(t, groupFailureInsufficientScope, classifyForbidden(&googleapi.Error{
		Code:   403,
		Errors: []googleapi.ErrorItem{{Reason: "insufficientScope"}},
	}))
	require.Equal(t, groupFailureUnsupportedEdition, classifyForbidden(&googleapi.Error{
		Code:    403,
		Details: []any{map[string]any{"reason": "CUSTOMER_NOT_LICENSED"}},
	}))
}

func TestLookupGroupsFailureClasses(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		failure *ciError
		want    groupFailure
	}{
		{
			name:    "unauthenticated",
			failure: &ciError{status: http.StatusUnauthorized, body: `{"error":{"code":401}}`},
			want:    groupFailureUnauthenticated,
		},
		{
			name:    "rate limited",
			failure: &ciError{status: http.StatusTooManyRequests, body: `{"error":{"code":429}}`},
			want:    groupFailureRateLimited,
		},
		{
			name:    "unavailable",
			failure: &ciError{status: http.StatusServiceUnavailable, body: `{"error":{"code":503}}`},
			want:    groupFailureUnavailable,
		},
		{
			name:    "bad request",
			failure: &ciError{status: http.StatusBadRequest, body: `{"error":{"code":400}}`},
			want:    groupFailureRequestFailed,
		},
		{
			name:    "not json",
			failure: &ciError{status: http.StatusOK, body: `{"memberships":`},
			want:    groupFailureInvalidResponse,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			ci := newFakeCloudIdentity(t)
			ci.directErr = test.failure

			result := groupService(t, ci).lookupGroups(
				context.Background(), directSettings(), "access-token", "user@example.com")
			require.Equal(t, test.want, result.Failure)
			require.Empty(t, result.Groups)
		})
	}
}

// A cancelled callback and a slow Google are different causes, so they get
// different classes.
func TestLookupGroupsSeparatesCancellationFromTimeout(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com")}

	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	result := groupService(t, ci).lookupGroups(
		canceled, directSettings(), "access-token", "user@example.com")
	require.Equal(t, groupFailureCanceled, result.Failure)

	expired, expire := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer expire()
	result = groupService(t, ci).lookupGroups(
		expired, directSettings(), "access-token", "user@example.com")
	require.Equal(t, groupFailureTimeout, result.Failure)
}

// A lookup that would need more pages than the bound allows is a failure, not
// a truncated answer that silently drops roles.
func TestLookupGroupsRefusesAnEndlessPagination(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	pages := make([]ciPage, groupLookupMaxPages+2)
	for i := range pages {
		pages[i] = groupPage(strconv.Itoa(i+1), fmt.Sprintf("group%d@example.com", i))
	}
	ci.directPage = pages

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")

	require.Equal(t, groupFailurePageLimitExceeded, result.Failure)
	require.Empty(t, result.Groups)
	require.Len(t, ci.recorded(), groupLookupMaxPages)
}

// A lookup with nothing to work with must not reach the network.
func TestLookupGroupsRefusesAnIncompleteRequest(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	service := groupService(t, ci)
	settings := directSettings()

	for _, test := range []struct {
		name     string
		settings policy.GroupSettings
		token    string
		email    string
	}{
		{name: "disabled", settings: policy.GroupSettings{}, token: "t", email: "user@example.com"},
		{name: "no token", settings: settings, email: "user@example.com"},
		{name: "no email", settings: settings, token: "t"},
		{
			name: "no domain allow-list",
			settings: policy.GroupSettings{
				Enabled: true,
				Mode:    policy.MembershipDirect,
			},
			token: "t",
			email: "user@example.com",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			result := service.lookupGroups(context.Background(), test.settings, test.token, test.email)
			require.Equal(t, groupFailureRequestFailed, result.Failure)
		})
	}
	require.Empty(t, ci.recorded(), "a refused lookup must not call Google")
}

// ---------------------------------------------------------------------------
// The transport pin.
// ---------------------------------------------------------------------------

// The transport allows one host, one path and one method. The path is
// searchDirectGroups, so nothing the provider or a later client change does
// can move the bearer token to another host or another Cloud Identity method.
func TestCloudIdentityRoundTripperPinsOneMethod(t *testing.T) {
	t.Parallel()

	// The removed method, spelled out rather than referenced, because the
	// constant is gone and the pin still has to refuse the path.
	const removedTransitivePath = "/v1/groups/-/memberships:searchTransitiveGroups"

	called := false
	base := roundTripperFunc(func(*http.Request) (*http.Response, error) {
		called = true
		return nil, nil
	})
	transport := cloudIdentityRoundTripper{
		base:   base,
		path:   directGroupsPath,
		budget: &byteBudget{remaining: groupLookupMaxBytes},
	}

	refused := []*http.Request{
		mustRequest(t, http.MethodPost, "https://cloudidentity.googleapis.com"+directGroupsPath),
		mustRequest(t, http.MethodGet, "http://cloudidentity.googleapis.com"+directGroupsPath),
		mustRequest(t, http.MethodGet, "https://evil.example.net"+directGroupsPath),
		mustRequest(t, http.MethodGet, "https://cloudidentity.googleapis.com"+removedTransitivePath),
		mustRequest(t, http.MethodGet, "https://cloudidentity.googleapis.com/v1/groups/-/memberships"),
		mustRequest(t, http.MethodGet, "https://user:pass@cloudidentity.googleapis.com"+directGroupsPath),
	}
	for _, request := range refused {
		_, err := transport.RoundTrip(request)
		require.ErrorIs(t, err, errCloudIdentityRequest, "request to %s must be refused", request.URL)
	}
	require.False(t, called, "a refused request must never reach the network")
}

// A redirect is refused, so a provider response cannot move the lookup
// elsewhere and cannot carry the bearer token to another host.
func TestLookupGroupsRefusesARedirect(t *testing.T) {
	t.Parallel()

	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com")}
	ci.redirectTo = "https://evil.example.net/v1/groups"

	result := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")

	require.Equal(t, groupFailureRequestFailed, result.Failure)
	require.Empty(t, result.Groups)

	// Without the redirect the same fake answers normally, so the refusal is
	// the redirect and not the fake.
	ci.mu.Lock()
	ci.redirectTo = ""
	ci.mu.Unlock()
	ok := groupService(t, ci).lookupGroups(
		context.Background(), directSettings(), "access-token", "user@example.com")
	require.Empty(t, ok.Failure)
	require.Equal(t, []string{"engineering@example.com"}, ok.Groups)
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func mustRequest(t *testing.T, method, rawURL string) *http.Request {
	t.Helper()

	request, err := http.NewRequest(method, rawURL, nil)
	require.NoError(t, err)
	return request
}

// ---------------------------------------------------------------------------
// The access token never leaves the callback.
// ---------------------------------------------------------------------------

// The generated Google client logs every request with all of its headers, and
// every response with its body, to os.Stderr as soon as
// GOOGLE_SDK_GO_LOGGING_LEVEL is set. The fork installs a discard logger,
// which takes precedence over that variable.
//
// Two things must stay out of every log this path writes: the bearer token of
// the user, and the group membership the response carries. The response body
// is the part the SDK logger demonstrably writes, because the oauth2 transport
// adds the Authorization header after the request is logged. The token
// assertion is a regression guard for the day that order changes.
func TestLookupGroupsNeverLogsTheTokenOrTheMembership(t *testing.T) {
	t.Setenv("GOOGLE_SDK_GO_LOGGING_LEVEL", "debug")

	captured := &syncBuffer{}
	ci := newFakeCloudIdentity(t)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com")}

	service := &Service{
		logger:                 slog.New(slog.NewJSONHandler(captured, &slog.HandlerOptions{Level: slog.LevelDebug})),
		cloudIdentityTransport: ci.transport(),
	}

	stop, read := captureStderr(t)
	fmt.Fprintln(os.Stderr, "stderr-capture-probe")
	result := service.lookupGroups(
		context.Background(), directSettings(), "super-secret-access-token", "user@example.com")
	// The callback logs every lookup, so the fork logging path is exercised
	// here too.
	service.logGroupLookup(context.Background(), "google", result)
	stop()

	require.Empty(t, result.Failure)
	require.Contains(t, read(), "stderr-capture-probe",
		"the capture must work, or this test proves nothing")
	require.NotContains(t, read(), "engineering@example.com",
		"the Google client must not log the group membership of the user")
	require.NotContains(t, read(), "super-secret-access-token",
		"the Google client must not log the bearer token of the user")
	require.NotContains(t, captured.String(), "super-secret-access-token",
		"the fork must not log the bearer token of the user")
	require.Contains(t, captured.String(), "Google group lookup succeeded",
		"the fork logs the classes, so the fork logger is not simply silent")
}

// syncBuffer is a concurrency-safe log sink.
type syncBuffer struct {
	mu  sync.Mutex
	buf strings.Builder
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// captureStderr replaces os.Stderr with a pipe. The Google client builds its
// default logger over os.Stderr when GOOGLE_SDK_GO_LOGGING_LEVEL is set, so
// this is where an unredacted request header would land.
//
// It returns a function that stops the capture, and a function that reads what
// was captured.
func captureStderr(t *testing.T) (func(), func() string) {
	t.Helper()

	reader, writer, err := os.Pipe()
	require.NoError(t, err)

	original := os.Stderr
	os.Stderr = writer

	captured := &syncBuffer{}
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = io.Copy(captured, reader)
	}()

	var once sync.Once
	stop := func() {
		once.Do(func() {
			os.Stderr = original
			require.NoError(t, writer.Close())
			<-done
			require.NoError(t, reader.Close())
		})
	}
	t.Cleanup(stop)

	return stop, captured.String
}

// ---------------------------------------------------------------------------
// A whole login, gated by a group.
// ---------------------------------------------------------------------------

// onlyGroupMapping removes the email mapping, so a role can only come from a
// group.
func onlyGroupMapping(c *types.OIDCConnectorV3) {
	kept := make([]types.ClaimMapping, 0, len(c.Spec.ClaimsToRoles))
	for _, mapping := range c.Spec.ClaimsToRoles {
		if mapping.Claim == policy.GroupsClaim {
			kept = append(kept, mapping)
		}
	}
	c.Spec.ClaimsToRoles = kept
}

// newGroupLoginEnv builds a hermetic login environment whose connector is
// group-gated, with a hermetic Cloud Identity behind it.
// Direct membership is the only supported mode, so the connector always
// carries it and there is nothing else to configure.
func newGroupLoginEnv(
	t *testing.T,
	extra ...func(*types.OIDCConnectorV3),
) (*loginEnv, *fakeCloudIdentity) {
	t.Helper()

	ci := newFakeCloudIdentity(t)
	env := newLoginEnv(t, func(c *types.OIDCConnectorV3) {
		c.Spec.Scope = append(c.Spec.Scope, policy.CloudIdentityGroupsReadScope)
		c.Spec.ClaimsToRoles = append(c.Spec.ClaimsToRoles, types.ClaimMapping{
			Claim: policy.GroupsClaim,
			Value: "engineering@example.com",
			Roles: []string{"access"},
		})
		c.Metadata.Labels[policy.GroupMembershipLabel] = string(policy.MembershipDirect)
		for _, mutate := range extra {
			mutate(c)
		}
	})
	env.service.cloudIdentityTransport = ci.transport()
	return env, ci
}

// userTraits returns the traits stored on the Teleport user.
func userTraits(t *testing.T, env *loginEnv, username string) map[string][]string {
	t.Helper()

	user, err := env.auth.GetUser(context.Background(), username, false)
	require.NoError(t, err)
	return user.GetTraits()
}

// The goal of the whole feature: one group-gated Google login.
func TestLoginGrantsRolesFromAGroup(t *testing.T) {
	env, ci := newGroupLoginEnv(t, onlyGroupMapping)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com", "platform@example.com")}

	request := env.createRequest()
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.NoError(t, err, "a member of a mapped group must be able to log in")
	require.Equal(t, roleSourceGroups, audit.roleSource,
		"the role source must follow the mapping that matched")

	require.Equal(t, []string{"engineering@example.com", "platform@example.com"},
		userTraits(t, env, "user@example.com")[policy.GroupsClaim],
		"the verified groups are the stored trait")

	attributes := audit.groupAuditAttributes()
	require.Equal(t, string(groupOutcomeSucceeded), attributes["group_lookup_class"])
	require.Equal(t, string(policy.MembershipDirect), attributes["group_lookup_mode"])
	require.Equal(t, 2, attributes["group_count"])

	// The lookup used the access token of this login, and the connector scope
	// asked Google for it.
	require.Equal(t, "Bearer access-token", ci.recorded()[0].authorization)
}

// Both mapping families matching is the fourth role source value.
func TestLoginRoleSourceBoth(t *testing.T) {
	env, ci := newGroupLoginEnv(t)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com")}

	request := env.createRequest()
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.NoError(t, err)
	require.Equal(t, roleSourceBoth, audit.roleSource,
		"a login that matched an email mapping and a group mapping reports both")
}

// The recorded failure policy: a failed lookup grants no roles from group
// mappings, and the email mapping still applies.
func TestLoginWithAFailedGroupLookupKeepsTheEmailMapping(t *testing.T) {
	env, ci := newGroupLoginEnv(t)
	ci.directErr = &ciError{status: http.StatusForbidden, body: forbiddenBody("customerNotLicensed")}

	request := env.createRequest()
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.NoError(t, err, "a failed group lookup must not deny a login the email mapping allows")
	require.Equal(t, roleSourceEmail, audit.roleSource)

	require.NotContains(t, userTraits(t, env, "user@example.com"), policy.GroupsClaim,
		"a failed lookup must leave no groups trait")
	require.Equal(t, string(groupFailureUnsupportedEdition), audit.groupAuditAttributes()["group_lookup_class"])
}

// The same failure on a connector whose only mapping is a group mapping denies
// the login. Fail closed.
func TestLoginWithAFailedGroupLookupGrantsNoGroupRoles(t *testing.T) {
	env, ci := newGroupLoginEnv(t, onlyGroupMapping)
	ci.directErr = &ciError{status: http.StatusForbidden, body: forbiddenBody("customerNotLicensed")}

	request := env.createRequest()
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.Error(t, err)
	require.Contains(t, err.Error(), "did not match any configured roles")
	require.Equal(t, failureRoleMapping, audit.failureClass)
	env.requireNoUser("user@example.com")
}

// A groups claim in the ID token is never a fallback for the lookup. Google
// does not send one, and a provider that did must not be able to grant roles.
func TestLoginNeverTrustsAGroupsClaimFromTheToken(t *testing.T) {
	env, ci := newGroupLoginEnv(t, onlyGroupMapping)
	env.google.mutateClaims = func(claims map[string]any) {
		claims["groups"] = []string{"engineering@example.com"}
	}
	// Cloud Identity says the user is in no group.
	ci.directPage = []ciPage{{}}

	request := env.createRequest()
	_, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.Error(t, err, "a groups claim from the provider must grant nothing")
	require.Contains(t, err.Error(), "did not match any configured roles")
	env.requireNoUser("user@example.com")
}

// The same, with the lookup failing outright: the token claim must not step in.
func TestLoginNeverFallsBackToTheTokenGroupsClaim(t *testing.T) {
	env, ci := newGroupLoginEnv(t, onlyGroupMapping)
	env.google.mutateClaims = func(claims map[string]any) {
		claims["groups"] = []string{"engineering@example.com"}
	}
	ci.directErr = &ciError{status: http.StatusServiceUnavailable, body: `{"error":{"code":503}}`}

	request := env.createRequest()
	_, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.Error(t, err)
	require.Contains(t, err.Error(), "did not match any configured roles")
}

// A namespaced group must not grant roles through a whole login either.
func TestLoginRefusesANamespacedGroup(t *testing.T) {
	env, ci := newGroupLoginEnv(t, onlyGroupMapping)
	ci.directPage = []ciPage{{Memberships: []ciMembership{{
		GroupKey: ciKey{ID: "engineering@example.com", Namespace: "identitysources/1234"},
		Labels:   map[string]string{discussionForumLabel: ""},
	}}}}

	request := env.createRequest()
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.Error(t, err, "an external identity source must not inherit the roles of a Google group")
	require.Equal(t, string(groupOutcomeNamespaceRejected), audit.groupAuditAttributes()["group_lookup_class"])
	require.Equal(t, 1, audit.groupAuditAttributes()["group_lookup_rejected_namespace"])
	env.requireNoUser("user@example.com")
}

// A group outside the Workspace allow-list is dropped before it becomes a
// trait, so no later mapping and no role template can read it.
//
// The domain gate is the second of two layers: the connector grammar already
// refuses a mapping value outside the allow-list, so a dropped group cannot
// change an authorization decision on its own. The observable effect is the
// trait and the audit counter, and that is what this test asserts.
func TestLoginDropsAGroupOutsideTheAllowList(t *testing.T) {
	env, ci := newGroupLoginEnv(t)
	ci.directPage = []ciPage{groupPage("",
		"engineering@evil.example.net", "engineering@example.com.evil.net")}

	request := env.createRequest()
	audit, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.NoError(t, err, "the email mapping still grants the login")
	require.Equal(t, roleSourceEmail, audit.roleSource)

	require.NotContains(t, userTraits(t, env, "user@example.com"), policy.GroupsClaim,
		"a group outside the Workspace allow-list must not become a trait")
	require.Equal(t, 2, audit.groupAuditAttributes()["group_lookup_rejected_domain"])
	require.Equal(t, string(groupOutcomeFiltered), audit.groupAuditAttributes()["group_lookup_class"])
}

// A login rule must not invent group membership. The trait that is stored is
// the trait the lookup verified.
func TestLoginRuleCannotInventAGroup(t *testing.T) {
	env, ci := newGroupLoginEnv(t)
	ci.directPage = []ciPage{groupPage("", "engineering@example.com")}

	env.service.auth.SetLoginRuleEvaluator(fakeLoginRuleEvaluator{
		traits: map[string][]string{
			"email":              {"user@example.com"},
			policy.GroupsClaim:   {"admins@example.com"},
			"invented-by-a-rule": {"yes"},
		},
		rules: []string{"rule-1"},
	})

	request := env.createRequest()
	_, err := env.callbackWithAudit(request.StateToken, env.google.validCode)
	require.NoError(t, err)

	traits := userTraits(t, env, "user@example.com")
	require.Equal(t, []string{"engineering@example.com"}, traits[policy.GroupsClaim],
		"a login rule must not replace the verified group membership")
	require.Equal(t, []string{"yes"}, traits["invented-by-a-rule"],
		"every other trait a rule sets is kept, so the test is about groups only")
}

// The login must not ask Google for offline access. The fork holds no refresh
// token, and the access token lives only for the length of the callback.
func TestGroupLoginAsksForNoOfflineAccess(t *testing.T) {
	env, _ := newGroupLoginEnv(t)
	env.createRequest()

	query := env.google.authorizationValues()
	require.Empty(t, query.Get("access_type"), "the fork must never ask for offline access")
	require.Empty(t, query.Get("approval_prompt"))
	require.Contains(t, query.Get("scope"), policy.CloudIdentityGroupsReadScope,
		"the connector scope must reach the authorization request")
}
