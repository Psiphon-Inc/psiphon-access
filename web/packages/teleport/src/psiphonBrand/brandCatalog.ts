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

/**
 * Content-keyed brand catalog. See
 * docs/psiphon-access/adr/0007-content-keyed-brand-catalog.md.
 *
 * This module holds the types, the machinery-owned data, and the aggregate
 * export. It holds no copy that an authoring child owns.
 *
 * ONE LOGICAL CATALOG, SEVEN LEAF MODULES. `catalog/` holds one leaf per UI
 * area. Each leaf exports its own entries array and its own dated baseline
 * array. This aggregator imports all seven and concatenates them. An authoring
 * child edits its own leaf and nothing else.
 */

import {
  ACCOUNT_SUPPORT_BASELINE,
  ACCOUNT_SUPPORT_ENTRIES,
} from './catalog/account-support';
import {
  AUDIT_SESSIONS_RECORDINGS_BASELINE,
  AUDIT_SESSIONS_RECORDINGS_ENTRIES,
} from './catalog/audit-sessions-recordings';
import {
  BOTS_WORKLOAD_IDENTITY_BASELINE,
  BOTS_WORKLOAD_IDENTITY_ENTRIES,
} from './catalog/bots-workload-identity';
import {
  DISCOVER_ENROLMENT_BASELINE,
  DISCOVER_ENROLMENT_ENTRIES,
} from './catalog/discover-enrolment';
import {
  INTEGRATIONS_AWS_BASELINE,
  INTEGRATIONS_AWS_ENTRIES,
} from './catalog/integrations-aws';
import {
  NAVIGATION_EMPTY_DIALOGS_BASELINE,
  NAVIGATION_EMPTY_DIALOGS_ENTRIES,
} from './catalog/navigation-empty-dialogs';
import {
  ROLES_USERS_TOKENS_BASELINE,
  ROLES_USERS_TOKENS_ENTRIES,
} from './catalog/roles-users-tokens';

/**
 * Tier of a catalog entry.
 * - render: user-visible copy, rename freely.
 * - interface: CLI names, flags and help text, rename only with an alias.
 * - protocol: wire and external-system identifiers, never rename.
 */
export type BrandTier = 'render' | 'interface' | 'protocol';

/**
 * How a source is matched against a visited node.
 *
 * - `substring`, the default: the source may match anywhere inside a node.
 * - `wholeNode`: the source matches ONLY when it is the entire node text.
 *
 * ADR 0007 decision 2 forbids the bare word as a catalog source. That reasoning
 * is a reasoning about SUBSTRING matching: a substring rewrite of the bare word
 * would reach inside an identifier, an import path and a documentation link.
 * The reasoning does not hold for a whole-node exact match, where the visited
 * node is the bare word and nothing else, so the rewrite cannot reach anything
 * the node does not already own. `wholeNode` is the narrow permission, and it
 * is the ONLY way a bare-word source can enter the catalog.
 */
export type BrandMatch = 'substring' | 'wholeNode';

/**
 * One catalog entry. The entry is keyed on string content and never on a file,
 * a line or a context. The type declares no `pattern` field and no `regex`
 * field, and `source` has the type `string`, so no entry can hold a pattern.
 */
export interface BrandPhrase {
  /** The exact phrase, as the scanner reads it. Unique across the catalog. */
  readonly source: string;
  /** The exact text that replaces it. Equal to `source` when immutable. */
  readonly replacement: string;
  /** Expected occurrence count in the scan set. The drift detector. >= 1. */
  readonly count: number;
  /** What else must change with the phrase. */
  readonly tier: BrandTier;
  /** Cross-check on `replacement === source`. */
  readonly immutable: boolean;
  /** One sentence. Mandatory on every entry. */
  readonly reason: string;
  /**
   * How the source is matched. Absent means `substring`, which is what every
   * entry written before 2026-08-19 is. TypeScript cannot subtract a literal
   * from `string`, so this field cannot by itself make a bare-word substring
   * entry unrepresentable. `orderMatchRules` completes the guard: it refuses to
   * BUILD a substring rule over the bare word, and every reader that can
   * rewrite source text builds its rules there.
   */
  readonly match?: BrandMatch;
}

/**
 * True when a source is the bare brand word and nothing else. Such a source is
 * legal ONLY under `match: 'wholeNode'`. `validateCatalog` reports it and
 * `orderMatchRules` refuses to build a substring rule from it, so the illegal
 * combination cannot reach a rewriter by any path.
 */
export function isBareBrandWord(source: string): boolean {
  return source.trim().toLowerCase() === BRAND_WORD;
}

/** True when this entry matches only the whole visited node. */
export function isWholeNodeEntry(entry: BrandPhrase): boolean {
  return entry.match === 'wholeNode';
}

/**
 * One baseline entry. It admits a phrase that reaches a user and that no
 * catalog entry covers yet, so the gate can be strict about everything else
 * while the authoring work is still open.
 *
 * The baseline can only shrink. A baselined phrase that stops appearing, or
 * that a catalog entry starts covering, raises RATCHET_FAIL until someone
 * removes the baseline entry.
 */
export interface BrandBaselineEntry {
  /**
   * The exact text of the whole visited node that holds the unaccounted
   * occurrence. Raw source text for a string literal or a template. Whitespace
   * normalised text for a JSX text node.
   */
  readonly source: string;
  /** Number of visited nodes with this exact text, measured at the baseline. */
  readonly count: number;
  /** Why the phrase is admitted rather than covered. */
  readonly reason: string;
}

/** A host whose occurrences of the word are a URL and not copy. */
export interface ExcludedHost {
  readonly host: string;
  readonly reason: string;
}

/**
 * Hosts excluded from residual detection. This is a substring test against an
 * explicit host, not a pattern over the bare word. ADR 0007 decision 5 keeps
 * the upstream documentation URLs as they are, because the fork will not host
 * a documentation site and a broken link is worse than an upstream-branded one.
 */
export const EXCLUDED_HOSTS: readonly ExcludedHost[] = [
  {
    host: 'goteleport.com',
    reason:
      'ADR 0007 decision 5: upstream documentation and marketing URLs stay as they are, because the fork hosts no documentation site',
  },
  {
    host: 'teleport.dev',
    reason:
      'Upstream download and Helm chart host (cdn.teleport.dev, charts.releases.teleport.dev). A rewrite would break a real download',
  },
  {
    host: 'github.com/gravitational/teleport',
    reason:
      'Upstream source repository URL. A rewrite would point a user at a repository that does not exist',
  },
];

/**
 * The five immutable entries, owned by the machinery and not by any authoring
 * child. ADR 0007 rejected the proposal to drop the two protocol headers: the
 * bundle layer meets them in the emitted bundle, and without an entry it cannot
 * tell a header it must leave alone from a phrase somebody forgot.
 *
 * DO NOT EDIT THIS ARRAY FROM AN AUTHORING CHILD. Every entry here is
 * `protocol` tier and `immutable`, so none of it is copy.
 */
export const PROTOCOL_ENTRIES: readonly BrandPhrase[] = [
  {
    source: 'TeleportDatabaseAccess_${props.agentMeta.resourceName}',
    replacement: 'TeleportDatabaseAccess_${props.agentMeta.resourceName}',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The IAM policy name in the customer AWS account, built at Discover/Database/IamPolicy/useIamPolicy.ts. A rename orphans an existing deployed policy',
  },
  {
    source: 'TeleportDatabaseAccess',
    replacement: 'TeleportDatabaseAccess',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'The default IAM role name the deploy step writes into the customer AWS account. A rename orphans an existing deployed role',
  },
  {
    source: 'TeleportDatabaseName',
    replacement: 'TeleportDatabaseName',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The AWS RDS tag key the discovery service reads. A rename stops the fork from finding a tagged RDS instance',
  },
  {
    source: 'Teleport-Mfa-Response',
    replacement: 'Teleport-Mfa-Response',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The MFA response header name at services/api/api.ts. The proxy reads this header name, and a rename breaks MFA',
  },
  {
    source: 'X-Teleport-TokenName',
    replacement: 'X-Teleport-TokenName',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The join token header name at services/joinToken/joinToken.ts. The proxy reads this header name, and a rename breaks token enrolment',
  },
];

/** The seven UI areas. One leaf module per area, one authoring owner per area. */
export const BRAND_AREAS = [
  'discover-enrolment',
  'integrations-aws',
  'roles-users-tokens',
  'bots-workload-identity',
  'audit-sessions-recordings',
  'navigation-empty-dialogs',
  'account-support',
] as const;

export type BrandArea = (typeof BRAND_AREAS)[number];

/** Per-area entries, keyed by area. The aggregate is the concatenation. */
export const BRAND_ENTRIES_BY_AREA: Readonly<
  Record<BrandArea, readonly BrandPhrase[]>
> = {
  'discover-enrolment': DISCOVER_ENROLMENT_ENTRIES,
  'integrations-aws': INTEGRATIONS_AWS_ENTRIES,
  'roles-users-tokens': ROLES_USERS_TOKENS_ENTRIES,
  'bots-workload-identity': BOTS_WORKLOAD_IDENTITY_ENTRIES,
  'audit-sessions-recordings': AUDIT_SESSIONS_RECORDINGS_ENTRIES,
  'navigation-empty-dialogs': NAVIGATION_EMPTY_DIALOGS_ENTRIES,
  'account-support': ACCOUNT_SUPPORT_ENTRIES,
};

/** Per-area baselines, keyed by area. Each later child empties its own. */
export const BRAND_BASELINE_BY_AREA: Readonly<
  Record<BrandArea, readonly BrandBaselineEntry[]>
> = {
  'discover-enrolment': DISCOVER_ENROLMENT_BASELINE,
  'integrations-aws': INTEGRATIONS_AWS_BASELINE,
  'roles-users-tokens': ROLES_USERS_TOKENS_BASELINE,
  'bots-workload-identity': BOTS_WORKLOAD_IDENTITY_BASELINE,
  'audit-sessions-recordings': AUDIT_SESSIONS_RECORDINGS_BASELINE,
  'navigation-empty-dialogs': NAVIGATION_EMPTY_DIALOGS_BASELINE,
  'account-support': ACCOUNT_SUPPORT_BASELINE,
};

/** The whole catalog: the machinery-owned protocol entries plus seven leaves. */
export const BRAND_CATALOG: readonly BrandPhrase[] = [
  ...PROTOCOL_ENTRIES,
  ...BRAND_AREAS.flatMap(area => [...BRAND_ENTRIES_BY_AREA[area]]),
];

/**
 * The whole baseline. When this reaches zero, strict bundle enforcement
 * switches itself on with no further commit. See `bundleGate.ts`.
 */
export const BRAND_BASELINE: readonly BrandBaselineEntry[] =
  BRAND_AREAS.flatMap(area => [...BRAND_BASELINE_BY_AREA[area]]);

/**
 * The brand word, case-insensitive. Residual detection looks for this and
 * nothing else. It is not a rewrite rule: no code path ever replaces a bare
 * occurrence of it.
 */
export const BRAND_WORD = 'teleport';
