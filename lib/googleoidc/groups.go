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
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
	"google.golang.org/api/cloudidentity/v1"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"

	"github.com/gravitational/teleport/lib/googleoidc/policy"
)

// The group lookup uses the access token of the user who is logging in, and
// nothing else. There is no domain-wide delegation, no Admin SDK, no
// service-account impersonation, and no Google credential the cluster holds.
// The token lives for the length of one callback: it is never written to the
// backend, never audited, and never logged.
const (
	// groupLookupTimeout bounds the whole lookup, both attempts included.
	groupLookupTimeout = 10 * time.Second

	// groupLookupPageSize is the page size asked for. 1000 is the documented
	// maximum of both search methods.
	groupLookupPageSize = 1000

	// groupLookupMaxPages bounds the number of pages of one attempt.
	groupLookupMaxPages = 10

	// groupLookupMaxRelations bounds the relations one attempt may return.
	groupLookupMaxRelations = 10_000

	// groupLookupMaxBytes bounds the WHOLE lookup, not one HTTP response.
	//
	// The prototype bounded each response, so a paginated lookup could buffer
	// pages times the bound, and a fallback could buffer it twice again. The
	// budget below is shared by every response of every attempt of one login.
	groupLookupMaxBytes = 4 << 20

	cloudIdentityEndpoint = "https://cloudidentity.googleapis.com/"
	cloudIdentityHost     = "cloudidentity.googleapis.com"

	// directGroupsPath is the only path the group transport allows. Direct
	// membership is the only supported mode, so searchTransitiveGroups is
	// neither called nor reachable. See policy.MembershipMode for why.
	// Confirmed against google.golang.org/api/cloudidentity/v1 v0.286.0:
	// GroupsMembershipsService.SearchDirectGroups, GET.
	directGroupsPath = "/v1/groups/-/memberships:searchDirectGroups"

	// groupsParent is the only parent either method accepts here: the search
	// runs across every group of the tenant for one member.
	groupsParent = "groups/-"

	// discussionForumLabel selects Google Groups, which is what a Workspace
	// operator maps to roles. Both methods require a label in the query.
	discussionForumLabel = "cloudidentity.googleapis.com/groups.discussion_forum"
)

// groupOutcome is the audit class of a lookup that reached the gates.
type groupOutcome string

const (
	// groupOutcomeSucceeded means Google returned at least one relation and
	// every relation survived the gates.
	//
	// It does NOT mean the list is complete. Both search methods drop a group
	// the caller may not view, and they do it silently, so no HTTP 200 can
	// prove completeness. It means "Google reported these groups".
	groupOutcomeSucceeded groupOutcome = "group_lookup_succeeded"

	// groupOutcomeNoGroupsVisible means Google returned an empty list. The
	// user may be in no group, or the caller may be unable to see the groups
	// they are in. The two are indistinguishable at the API, which is why
	// this is its own class and not a success. The prototype recorded both as
	// succeeded, so an operator could not tell an outage from an empty tenant.
	groupOutcomeNoGroupsVisible groupOutcome = "group_lookup_no_groups_visible"

	// groupOutcomeFiltered means Google returned relations and this fork
	// dropped one or more of them, by the address syntax gate or by the
	// Workspace domain gate. The rejection counters say which.
	groupOutcomeFiltered groupOutcome = "group_lookup_filtered"

	// groupOutcomeNamespaceRejected means at least one relation carried a
	// non-empty groupKey.namespace, so it named an external-identity-mapped
	// group rather than a Google group. That relation is dropped.
	//
	// This class outranks every other outcome, because a false rejection here
	// must be legible at once: an operator with an external identity source
	// sees this class instead of a generic result.
	groupOutcomeNamespaceRejected groupOutcome = "group_lookup_namespace_rejected"
)

// groupFailure is the audit class of a lookup that never reached the gates.
type groupFailure string

const (
	groupFailureTimeout groupFailure = "group_lookup_timeout"
	// groupFailureCanceled is the caller going away, usually the browser
	// dropping the callback. It is not a Google outage, so it is not a
	// timeout.
	groupFailureCanceled groupFailure = "group_lookup_canceled"
	// groupFailureUnauthenticated is a 401. The access token was refused.
	groupFailureUnauthenticated groupFailure = "group_lookup_unauthenticated"
	// groupFailureInsufficientScope is a 403 whose reason names the scope.
	// The user did not grant the Cloud Identity scope, or the connector never
	// asked for it.
	groupFailureInsufficientScope groupFailure = "group_lookup_insufficient_scope"
	// groupFailureUnsupportedEdition is a 403 whose reason names licensing.
	// Cloud Identity group search needs a Workspace edition that offers it.
	groupFailureUnsupportedEdition groupFailure = "group_lookup_unsupported_edition"
	// groupFailureAPINotEnabled is a 403 whose reason says the API is off in
	// the Google Cloud project of the OAuth client.
	groupFailureAPINotEnabled groupFailure = "group_lookup_api_not_enabled"
	// groupFailurePermissionDenied is every other 403, which includes a
	// visibility restriction on the groups themselves.
	groupFailurePermissionDenied groupFailure = "group_lookup_permission_denied"
	groupFailureRateLimited      groupFailure = "group_lookup_rate_limited"
	groupFailureUnavailable      groupFailure = "group_lookup_unavailable"
	groupFailureInvalidResponse  groupFailure = "group_lookup_invalid_response"
	// groupFailureResponseTooLarge means the whole-lookup byte budget ran out.
	groupFailureResponseTooLarge  groupFailure = "group_lookup_response_too_large"
	groupFailurePageLimitExceeded groupFailure = "group_lookup_page_limit_exceeded"
	groupFailureRelationLimit     groupFailure = "group_lookup_relation_limit_exceeded"
	groupFailureRequestFailed     groupFailure = "group_lookup_request_failed"
)

// groupRejections counts the relations each gate dropped.
type groupRejections struct {
	Namespace int
	Label     int
	Syntax    int
	Domain    int
}

func (r groupRejections) total() int { return r.Namespace + r.Label + r.Syntax + r.Domain }

// groupLookupResult is what one lookup reports to the callback and the audit
// event. It carries no provider text, no URL, and no credential.
type groupLookupResult struct {
	// Groups holds the gated, lower-cased, de-duplicated group addresses.
	Groups []string
	// Mode is the membership mode that produced Groups.
	Mode policy.MembershipMode
	// Outcome is set when the lookup reached the gates.
	Outcome groupOutcome
	// Failure is set when the lookup failed. Groups is then empty, and the
	// login grants no roles from group mappings.
	Failure groupFailure
	// Rejected counts the dropped relations.
	Rejected groupRejections
	// UnclassifiedReasons carries the Google error reason tokens of a 403
	// that matched no entry in forbiddenReasons. It is set only on that
	// catch-all path, so the operator can find out why a login was refused
	// and the token can be added to forbiddenReasons afterwards. A reason is
	// a fixed taxonomy string such as SERVICE_DISABLED, not user data and
	// not a credential.
	UnclassifiedReasons []string
}

// failed reports whether the lookup granted nothing because it failed.
func (r groupLookupResult) failed() bool { return r.Failure != "" }

var (
	errCloudIdentityRequest       = errors.New("cloud identity request rejected")
	errCloudIdentityRedirect      = errors.New("cloud identity redirect rejected")
	errCloudIdentityBody          = errors.New("cloud identity response rejected")
	errCloudIdentityBudget        = errors.New("cloud identity byte budget exhausted")
	errCloudIdentityPageLimit     = errors.New("cloud identity page limit exceeded")
	errCloudIdentityRelationLimit = errors.New("cloud identity relation limit exceeded")
)

// byteBudget is the shared byte allowance of one lookup. Every response body
// of every attempt draws on it.
type byteBudget struct {
	mu        sync.Mutex
	remaining int64
}

// left returns the bytes still allowed.
func (b *byteBudget) left() int64 {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.remaining
}

// consume takes n bytes, and reports whether they were within the budget.
func (b *byteBudget) consume(n int64) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if n > b.remaining {
		b.remaining = 0
		return false
	}
	b.remaining -= n
	return true
}

// cloudIdentityRoundTripper pins one Cloud Identity method. It refuses every
// other request, and it draws each response body from the lookup byte budget.
type cloudIdentityRoundTripper struct {
	base   http.RoundTripper
	path   string
	budget *byteBudget
}

func (t cloudIdentityRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if t.base == nil || t.budget == nil || req == nil || req.URL == nil ||
		req.Method != http.MethodGet ||
		req.URL.Scheme != "https" ||
		req.URL.Host != cloudIdentityHost ||
		req.URL.EscapedPath() != t.path ||
		req.URL.User != nil || req.URL.Opaque != "" ||
		(req.Host != "" && req.Host != cloudIdentityHost) {
		return nil, errCloudIdentityRequest
	}

	response, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	if response == nil || response.Body == nil {
		return nil, errCloudIdentityBody
	}

	// Read at most one byte more than the budget allows, so that an
	// over-long body is detected without buffering it.
	allowed := t.budget.left()
	body, err := io.ReadAll(io.LimitReader(response.Body, allowed+1))
	closeErr := response.Body.Close()
	if err != nil || closeErr != nil {
		return nil, errCloudIdentityBody
	}
	if !t.budget.consume(int64(len(body))) {
		return nil, errCloudIdentityBudget
	}

	response.Body = io.NopCloser(bytes.NewReader(body))
	response.ContentLength = int64(len(body))
	return response, nil
}

// newCloudIdentityService builds a Cloud Identity client for one attempt.
//
// The client is built from a static token source that holds the access token
// of the user who is logging in. It has no other credential, and it cannot
// obtain one: option.WithHTTPClient makes the library use this client as it
// is, so no default credential lookup happens.
//
// The logger is a discard logger on purpose. The generated client logs every
// request with all of its headers, and one of them is the bearer token of the
// user. option.WithLogger takes precedence over GOOGLE_SDK_GO_LOGGING_LEVEL,
// so this closes the only path by which the token could reach a log.
func newCloudIdentityService(
	ctx context.Context,
	accessToken string,
	path string,
	budget *byteBudget,
	baseTransport http.RoundTripper,
) (*cloudidentity.Service, error) {
	if baseTransport == nil {
		baseTransport = http.DefaultTransport
	}

	tokenSource := oauth2.StaticTokenSource(&oauth2.Token{
		AccessToken: accessToken,
		TokenType:   "Bearer",
	})

	client := oauth2.NewClient(ctx, tokenSource)
	transport, ok := client.Transport.(*oauth2.Transport)
	if !ok {
		return nil, errCloudIdentityRequest
	}
	transport.Base = cloudIdentityRoundTripper{
		base:   baseTransport,
		path:   path,
		budget: budget,
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error {
		return errCloudIdentityRedirect
	}

	return cloudidentity.NewService(ctx,
		option.WithHTTPClient(client),
		option.WithEndpoint(cloudIdentityEndpoint),
		option.WithLogger(slog.New(slog.DiscardHandler)),
	)
}

// groupRelation is the part of a Cloud Identity relation this fork reads. The
// two search methods return different message types, so both are narrowed to
// this shape before the gates run.
type groupRelation struct {
	// id is groupKey.id as Google returned it.
	id string
	// namespace is groupKey.namespace as Google returned it. An empty
	// namespace means a Google-managed group. Anything else means an
	// external-identity-mapped group, whose id an external identity source
	// chose.
	namespace string
	// discussionForum reports whether the relation is a Google group, the
	// kind a Workspace tenant means by "group". searchDirectGroups cannot
	// filter on it server-side, so the label is requested in the field mask
	// and read off the response here.
	discussionForum bool
}

// hasDiscussionForumLabel reports whether a relation carries the label that
// marks a Google group. The label value is an empty string, so presence of the
// key is the whole signal.
func hasDiscussionForumLabel(labels map[string]string) bool {
	_, ok := labels[discussionForumLabel]
	return ok
}

// lookupGroups resolves the group membership of one login. It never returns an
// error: a failure is a class in the result, the group list is then empty, and
// the login grants no roles from group mappings.
func (s *Service) lookupGroups(
	ctx context.Context,
	settings policy.GroupSettings,
	accessToken string,
	email string,
) groupLookupResult {
	result := groupLookupResult{Mode: settings.Mode}
	if !settings.Enabled {
		result.Failure = groupFailureRequestFailed
		return result
	}
	if accessToken == "" || strings.TrimSpace(email) == "" || len(settings.WorkspaceDomains) == 0 {
		result.Failure = groupFailureRequestFailed
		return result
	}

	ctx, cancel := context.WithTimeout(ctx, groupLookupTimeout)
	defer cancel()

	// One budget for the whole lookup, shared by every page.
	budget := &byteBudget{remaining: groupLookupMaxBytes}

	relations, err := s.searchGroups(ctx, accessToken, email, budget)
	if err != nil {
		result.Failure, result.UnclassifiedReasons = classifyGroupFailure(err)
		return result
	}

	result.Groups, result.Outcome, result.Rejected = gateRelations(relations, settings.WorkspaceDomains)
	return result
}

// logGroupLookup records the lookup in the service log. It logs the classes
// and the counters only: no access token, no address, and no provider text.
func (s *Service) logGroupLookup(ctx context.Context, connectorID string, result groupLookupResult) {
	attributes := []any{
		"connector", connectorID,
		"mode", string(result.Mode),
		"group_count", len(result.Groups),
		"rejected_namespace", result.Rejected.Namespace,
		"rejected_label", result.Rejected.Label,
		"rejected_syntax", result.Rejected.Syntax,
		"rejected_domain", result.Rejected.Domain,
	}

	switch {
	case result.failed():
		attributes = append(attributes, "class", string(result.Failure))
		// A 403 that matched no known reason is otherwise uninvestigable: the
		// class says only "denied". The reason tokens name the configuration
		// state, so log them here and nowhere else.
		if len(result.UnclassifiedReasons) > 0 {
			attributes = append(attributes, "google_reasons", result.UnclassifiedReasons)
		}
		s.logger.WarnContext(ctx, "Google group lookup failed, this login grants no roles from group mappings",
			attributes...)
	case result.Outcome != groupOutcomeSucceeded:
		attributes = append(attributes, "class", string(result.Outcome))
		s.logger.WarnContext(ctx, "Google group lookup needs attention", attributes...)
	default:
		attributes = append(attributes, "class", string(result.Outcome))
		s.logger.DebugContext(ctx, "Google group lookup succeeded", attributes...)
	}
}

// searchGroups resolves direct membership over every page.
func (s *Service) searchGroups(
	ctx context.Context,
	accessToken string,
	email string,
	budget *byteBudget,
) ([]groupRelation, error) {
	service, err := newCloudIdentityService(ctx, accessToken, directGroupsPath, budget, s.cloudIdentityTransport)
	if err != nil {
		return nil, err
	}

	// The query is a CEL expression. The member id is the address of the user
	// who is logging in, quoted as a CEL string literal.
	//
	// It must NOT carry a label clause. The generated client documents this
	// method as requiring one, and its own example returns 400 INVALID_ARGUMENT
	// from the live API.
	query := "member_key_id == " + celString(email)

	// groupKey.namespace comes back only when it is asked for. The prototype
	// asked for the id alone, so every relation looked like a Google-managed
	// group and an external identity source could impersonate one. See
	//
	// The labels come back for the same reason: this method cannot filter on
	// the group kind server-side, so gateRelations does it here instead.
	// Without the labels there would be nothing to gate on.
	fields := []googleapi.Field{
		"nextPageToken",
		"memberships/groupKey/id",
		"memberships/groupKey/namespace",
		"memberships/labels",
	}

	var relations []groupRelation
	pageToken := ""

	for page := range groupLookupMaxPages {
		response, err := service.Groups.Memberships.SearchDirectGroups(groupsParent).
			Query(query).
			PageSize(groupLookupPageSize).
			PageToken(pageToken).
			Fields(fields...).
			Context(ctx).
			Do()
		if err != nil {
			return nil, err
		}
		if response == nil {
			return nil, errCloudIdentityBody
		}

		pageRelations := make([]groupRelation, 0, len(response.Memberships))
		for _, relation := range response.Memberships {
			if relation == nil || relation.GroupKey == nil {
				return nil, errCloudIdentityBody
			}
			pageRelations = append(pageRelations, groupRelation{
				id:              relation.GroupKey.Id,
				namespace:       relation.GroupKey.Namespace,
				discussionForum: hasDiscussionForumLabel(relation.Labels),
			})
		}
		nextPageToken := response.NextPageToken

		relations = append(relations, pageRelations...)
		if len(relations) > groupLookupMaxRelations {
			return nil, errCloudIdentityRelationLimit
		}
		if nextPageToken == "" {
			return relations, nil
		}
		if page == groupLookupMaxPages-1 {
			return nil, errCloudIdentityPageLimit
		}
		pageToken = nextPageToken
	}

	return nil, errCloudIdentityPageLimit
}

// gateRelations applies the three gates, in order, and reports the outcome.
//
//  1. The namespace gate. A relation whose groupKey.namespace is not empty is
//     an external-identity-mapped group, whose id an external identity source
//     chose freely. Without this gate such a source can hold a group whose id
//     is the address of a real Google group and inherit its roles. See
//  2. The syntax gate. The id must be one plain address: exactly one @, no
//     whitespace, no comma, no control character.
//  3. The domain gate. The address must sit in a Workspace domain of the
//     connector.
func gateRelations(relations []groupRelation, domains []string) ([]string, groupOutcome, groupRejections) {
	var rejected groupRejections
	groups := make([]string, 0, len(relations))
	seen := make(map[string]struct{}, len(relations))

	for _, relation := range relations {
		if relation.namespace != "" {
			rejected.Namespace++
			continue
		}
		if !relation.discussionForum {
			rejected.Label++
			continue
		}
		if !validGroupAddress(relation.id) {
			rejected.Syntax++
			continue
		}

		group := strings.ToLower(relation.id)
		_, domain, _ := strings.Cut(group, "@")
		if !slices.Contains(domains, domain) {
			rejected.Domain++
			continue
		}

		if _, duplicate := seen[group]; duplicate {
			continue
		}
		seen[group] = struct{}{}
		groups = append(groups, group)
	}

	switch {
	case rejected.Namespace > 0:
		return groups, groupOutcomeNamespaceRejected, rejected
	case rejected.total() > 0:
		return groups, groupOutcomeFiltered, rejected
	case len(relations) == 0:
		return groups, groupOutcomeNoGroupsVisible, rejected
	default:
		return groups, groupOutcomeSucceeded, rejected
	}
}

// validGroupAddress reports whether id is a single RFC 5322 addr-spec in its
// dot-atom form.
//
// The quoted-string form of a local part is refused: it can hold whitespace, a
// comma and a control character, all of which would then reach a role mapping
// and a user trait. Every character outside RFC 5322 atext is refused with it,
// so no non-ASCII rune can arrive either.
func validGroupAddress(id string) bool {
	if id == "" || len(id) > 320 {
		return false
	}
	if strings.Count(id, "@") != 1 {
		return false
	}
	local, domain, _ := strings.Cut(id, "@")
	return validAddressLocalPart(local) && validAddressDomain(domain)
}

// validAddressLocalPart reports whether local is an RFC 5322 dot-atom.
func validAddressLocalPart(local string) bool {
	if local == "" || len(local) > 64 {
		return false
	}
	if strings.HasPrefix(local, ".") || strings.HasSuffix(local, ".") || strings.Contains(local, "..") {
		return false
	}
	for _, r := range local {
		if r == '.' || isAtext(r) {
			continue
		}
		return false
	}
	return true
}

// isAtext reports whether r is RFC 5322 atext.
func isAtext(r rune) bool {
	switch {
	case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		return true
	}
	return strings.ContainsRune("!#$%&'*+-/=?^_`{|}~", r)
}

// validAddressDomain reports whether domain is a dotted host name.
func validAddressDomain(domain string) bool {
	if domain == "" || len(domain) > 253 {
		return false
	}
	labels := strings.Split(domain, ".")
	if len(labels) < 2 {
		return false
	}
	for _, label := range labels {
		if label == "" || len(label) > 63 ||
			strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return false
		}
		for _, r := range label {
			switch {
			case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-':
			default:
				return false
			}
		}
	}
	return true
}

// celString renders a value as a CEL string literal.
func celString(value string) string {
	var literal strings.Builder
	literal.Grow(len(value) + 2)
	literal.WriteByte('\'')
	for _, r := range value {
		switch r {
		case '\\':
			literal.WriteString(`\\`)
		case '\'':
			literal.WriteString(`\'`)
		case '\r':
			literal.WriteString(`\r`)
		case '\n':
			literal.WriteString(`\n`)
		case '\t':
			literal.WriteString(`\t`)
		default:
			literal.WriteRune(r)
		}
	}
	literal.WriteByte('\'')
	return literal.String()
}

// classifyGroupFailure turns a lookup error into an audit class, and returns
// the Google reason tokens when a 403 matched no known reason.
//
// It keeps no provider message text, so a provider cannot write prose into the
// audit log. The reason tokens are the one exception, and only on the
// catch-all path: without them a refused login is uninvestigable. They are
// bounded and character-gated by sanitizeReasons before they reach a log.
func classifyGroupFailure(err error) (groupFailure, []string) {
	class, reasons := classifyGroupFailureInner(err)
	if class != groupFailurePermissionDenied {
		return class, nil
	}
	return class, sanitizeReasons(reasons)
}

// maxReasonTokens and maxReasonLength bound what a provider can put in a log
// line. A reason is a short enum in the Google error contract, so these are
// generous.
const (
	maxReasonTokens = 5
	maxReasonLength = 64
)

// sanitizeReasons keeps only short, plain tokens. A provider controls this
// string, so anything with whitespace, punctuation beyond the separators an
// enum uses, or any other character is dropped rather than escaped.
func sanitizeReasons(reasons []string) []string {
	clean := make([]string, 0, min(len(reasons), maxReasonTokens))
	for _, reason := range reasons {
		if len(clean) == maxReasonTokens {
			break
		}
		reason = strings.TrimSpace(reason)
		if reason == "" || len(reason) > maxReasonLength {
			continue
		}
		if strings.IndexFunc(reason, func(r rune) bool {
			switch {
			case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
				return false
			case r == '_' || r == '-' || r == '.':
				return false
			default:
				return true
			}
		}) >= 0 {
			continue
		}
		if !slices.Contains(clean, reason) {
			clean = append(clean, reason)
		}
	}
	if len(clean) == 0 {
		return nil
	}
	return clean
}

func classifyGroupFailureInner(err error) (groupFailure, []string) {
	switch {
	case errors.Is(err, errCloudIdentityBudget):
		return groupFailureResponseTooLarge, nil
	case errors.Is(err, errCloudIdentityPageLimit):
		return groupFailurePageLimitExceeded, nil
	case errors.Is(err, errCloudIdentityRelationLimit):
		return groupFailureRelationLimit, nil
	case errors.Is(err, errCloudIdentityBody):
		return groupFailureInvalidResponse, nil
	case errors.Is(err, errCloudIdentityRedirect), errors.Is(err, errCloudIdentityRequest):
		return groupFailureRequestFailed, nil
	case errors.Is(err, context.DeadlineExceeded):
		return groupFailureTimeout, nil
	case errors.Is(err, context.Canceled):
		return groupFailureCanceled, nil
	}

	var apiError *googleapi.Error
	if errors.As(err, &apiError) {
		switch {
		case apiError.Code == http.StatusUnauthorized:
			return groupFailureUnauthenticated, nil
		case apiError.Code == http.StatusForbidden:
			class := classifyForbidden(apiError)
			if class == groupFailurePermissionDenied {
				return class, forbiddenReasonsOf(apiError)
			}
			return class, nil
		case apiError.Code == http.StatusTooManyRequests:
			return groupFailureRateLimited, nil
		case apiError.Code >= http.StatusInternalServerError:
			return groupFailureUnavailable, nil
		default:
			return groupFailureRequestFailed, nil
		}
	}

	var syntaxError *json.SyntaxError
	var typeError *json.UnmarshalTypeError
	if errors.As(err, &syntaxError) || errors.As(err, &typeError) ||
		errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return groupFailureInvalidResponse, nil
	}

	return groupFailureRequestFailed, nil
}

// forbiddenReasons maps a Google error reason to a class. The prototype
// collapsed every 403 into one class, so an insufficient scope, an unsupported
// Workspace edition and a visibility restriction all looked alike and an
// operator could not act on any of them.
//
// The reasons below are read from the Google API error contract rather than
// from production, and an unknown reason falls through to
// groupFailurePermissionDenied instead of being guessed at. That fall-through
// is not hypothetical: the one 403 this fork has seen from a live tenant, on
// the removed transitive path, carried no reason token at all, so no entry here
// could have matched it.
var forbiddenReasons = map[string]groupFailure{
	"access_token_scope_insufficient": groupFailureInsufficientScope,
	"insufficientpermissions":         groupFailureInsufficientScope,
	"insufficientscope":               groupFailureInsufficientScope,
	"customernotlicensed":             groupFailureUnsupportedEdition,
	"customer_not_licensed":           groupFailureUnsupportedEdition,
	"not_licensed_for_feature":        groupFailureUnsupportedEdition,
	"unsupported_edition":             groupFailureUnsupportedEdition,
	"service_disabled":                groupFailureAPINotEnabled,
	"accessnotconfigured":             groupFailureAPINotEnabled,
}

// classifyForbidden splits a 403 by the reason Google gave.
func classifyForbidden(apiError *googleapi.Error) groupFailure {
	for _, reason := range forbiddenReasonsOf(apiError) {
		if class, ok := forbiddenReasons[strings.ToLower(strings.TrimSpace(reason))]; ok {
			return class
		}
	}
	return groupFailurePermissionDenied
}

// forbiddenReasonsOf collects every reason a Google error carries. A JSON error
// body puts one in error.errors[].reason and another in the ErrorInfo of
// error.details[], and the two do not always agree, so both are read.
func forbiddenReasonsOf(apiError *googleapi.Error) []string {
	reasons := make([]string, 0, len(apiError.Errors)+len(apiError.Details))
	for _, item := range apiError.Errors {
		reasons = append(reasons, item.Reason)
	}
	for _, detail := range apiError.Details {
		fields, ok := detail.(map[string]any)
		if !ok {
			continue
		}
		if reason, ok := fields["reason"].(string); ok {
			reasons = append(reasons, reason)
		}
	}
	return reasons
}
