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
 * Brand catalog leaf: roles, users, join tokens and access requests.
 *
 * One authoring child owns this file. Add an entry to `ROLES_USERS_TOKENS_ENTRIES` and
 * remove the matching entry from `ROLES_USERS_TOKENS_BASELINE` in the same commit. The
 * gate raises RATCHET_FAIL when a phrase is in both, and UNKNOWN_PHRASE when a
 * phrase is in neither.
 */

import type { BrandBaselineEntry, BrandPhrase } from '../brandCatalog';

/** Catalog entries for this area. Empty until an authoring child fills it. */
export const ROLES_USERS_TOKENS_ENTRIES: readonly BrandPhrase[] = [
  {
    source: 'Teleport',
    replacement: 'Psiphon Access',
    count: 5,
    tier: 'render',
    immutable: false,
    match: 'wholeNode',
    reason:
      'The product name standing alone in copy, at five visited nodes that hold the word and nothing else: the <BrandName> label in shared/components/AccessRequests/ReviewRequests/RequestView/RequestView.tsx, the diagram label in shared/components/LatencyDiagnostic/LatencyDiagnostic.tsx, the info-guide sentence in teleport/src/WorkloadIdentity/WorkloadIdentities.tsx, and the non-Beams branch of productName in teleport/src/Welcome/Welcome.tsx and teleport/src/components/Passkeys/PasskeyBlurb.tsx. Whole-node matching keeps it out of every longer phrase, which is why it cannot reach Welcome to Teleport',
  },
  {
    source:
      '\n  .teleport-resourcekind__value--unknown {\n    background: ${props => props.theme.colors.interactive.solid.alert.default};\n    .react-select__multi-value__label,\n    .react-select__multi-value__remove {\n      color: ${props => props.theme.colors.text.primaryInverse};\n    }\n  }\n',
    replacement:
      '\n  .teleport-resourcekind__value--unknown {\n    background: ${props => props.theme.colors.interactive.solid.alert.default};\n    .react-select__multi-value__label,\n    .react-select__multi-value__remove {\n      color: ${props => props.theme.colors.text.primaryInverse};\n    }\n  }\n',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This styled CSS block contains the brand word only in a selector, not in user-visible copy, and changing it would break the matching class contract',
  },
  {
    source:
      '\n  position: absolute;\n  // This z-index must be a higher value than the top bar z-index defined for\n  // Teleport web UI navigation found in teleport/src/Navigation/zIndexMap.ts.\n  // It prevents this SidePanel from rendering underneath the navigation bits.\n  z-index: 100;\n  top: 0px;\n  right: 0px;\n  background: ${({ theme }) => theme.colors.levels.sunken};\n  min-height: 100%;\n  width: 500px;\n  padding: 20px;\n\n  &.entering {\n    right: -500px;\n  }\n\n  &.entered {\n    right: 0px;\n    transition: right 300ms ease-out;\n  }\n\n  &.exiting {\n    right: -500px;\n    transition: right 300ms ease-out;\n  }\n\n  &.exited {\n    right: -500px;\n  }\n',
    replacement:
      '\n  position: absolute;\n  // This z-index must be a higher value than the top bar z-index defined for\n  // Teleport web UI navigation found in teleport/src/Navigation/zIndexMap.ts.\n  // It prevents this SidePanel from rendering underneath the navigation bits.\n  z-index: 100;\n  top: 0px;\n  right: 0px;\n  background: ${({ theme }) => theme.colors.levels.sunken};\n  min-height: 100%;\n  width: 500px;\n  padding: 20px;\n\n  &.entering {\n    right: -500px;\n  }\n\n  &.entered {\n    right: 0px;\n    transition: right 300ms ease-out;\n  }\n\n  &.exiting {\n    right: -500px;\n    transition: right 300ms ease-out;\n  }\n\n  &.exited {\n    right: -500px;\n  }\n',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'The only brand occurrence is in a source comment that identifies the upstream web UI, so the styled template must remain byte-identical',
  },
  {
    source: 'Add Teleport Resource Access',
    replacement: 'Add Resource Access',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The action names the access being added, so dropping the redundant product name produces natural copy',
  },
  {
    source: 'Rules that allow connecting to resources controlled by Teleport',
    replacement:
      'Rules that allow connecting to resources controlled by Psiphon Access',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source:
      'Rules that give this role administrative rights to Teleport resources',
    replacement:
      'Rules that give this role administrative rights to Psiphon Access resources',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source:
      'Screenshot of a graph that visualizes access to Teleport resources',
    replacement:
      'Screenshot of a graph that visualizes access to Psiphon Access resources',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source: 'Teleport Documentation.',
    replacement: 'Teleport Documentation.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This is the title of the upstream documentation reached by the adjacent link, so renaming it would mislabel the destination',
  },
  {
    source: 'Teleport Preset Roles',
    replacement: 'Psiphon Access Preset Roles',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source: 'Teleport Resources',
    replacement: 'Psiphon Access Resources',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source: 'Teleport Role Templates',
    replacement: 'Psiphon Access Role Templates',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source:
      'Teleport Role-based access control (RBAC) provides fine-grained control over who can access resources and in which contexts. A Teleport role can be assigned automatically based on user identity when used with single sign-on (SSO).',
    replacement:
      'Psiphon Access Role-based access control (RBAC) provides fine-grained control over who can access resources and in which contexts. A Psiphon Access role can be assigned automatically based on user identity when used with single sign-on (SSO).',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source: 'Teleport Users',
    replacement: 'Psiphon Access Users',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source: 'Teleport allows for two kinds of',
    replacement: 'Psiphon Access supports two kinds of',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The sentence is rewritten to use the fork product name and natural wording',
  },
  {
    source: 'Teleport predicate language',
    replacement: 'Teleport predicate language',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This is the established name of the upstream predicate language documented by the linked reference',
  },
  {
    source:
      'The database service labels control which Database Services (Teleport Agents) are visible to the user, which is required when adding Databases in the Enroll New Resource wizard. Access to Databases themselves is controlled by the Database Labels field.',
    replacement:
      'The database service labels control which Database Services (Psiphon Access agents) are visible to the user, which is required when adding Databases in the Enroll New Resource wizard. Access to Databases themselves is controlled by the Database Labels field.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The description names running-service agents and uses lowercase for the generic agent noun',
  },
  {
    source:
      'There are Join Tokens for most types of infrastructure you can connect to Teleport that establish an identity for that infrastructure using metadata, such as AWS role, GitHub organization or TPM hash. These are called',
    replacement:
      'There are Join Tokens for most types of infrastructure you can connect to Psiphon Access that establish an identity for that infrastructure using metadata, such as AWS role, GitHub organization or TPM hash. These are called',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source: 'This token is managed by Teleport Cloud.',
    replacement: 'This token is managed by Teleport Cloud.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Cloud is the upstream service identified by the isCloudSystem flag, so changing its name would misstate who manages the token',
  },
  {
    source: 'To take any action in Teleport, users must have at least one',
    replacement:
      'To take any action in Psiphon Access, users must have at least one',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source:
      'Trusted Clusters allow Teleport administrators to connect multiple clusters together and establish trust between them. Users of Trusted Clusters can seamlessly access the resources of the leaf cluster from the root cluster.',
    replacement:
      'Trusted Clusters allow Psiphon Access administrators to connect multiple clusters together and establish trust between them. Users of Trusted Clusters can seamlessly access the resources of the leaf cluster from the root cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source: 'Unlock Access Requests With Teleport Enterprise',
    replacement: 'Unlock Access Requests With Teleport Enterprise',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Enterprise is an upstream edition name, and Psiphon Access has no equivalent edition to advertise',
  },
  {
    source:
      'You cannot configure or delete static tokens via the web UI. Static tokens should be removed from your Teleport configuration file.',
    replacement:
      'You cannot configure or delete static tokens via the web UI. Static tokens should be removed from your Psiphon Access configuration file.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
  {
    source:
      'are how a Teleport agent authenticates itself to the Teleport cluster.',
    replacement:
      'are how a Psiphon Access agent authenticates itself to the Psiphon Access cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The description names the running service and keeps agent and cluster as lowercase generic nouns',
  },
  {
    source: 'gravitational/teleport',
    replacement: 'gravitational/teleport',
    count: 2,
    tier: 'protocol',
    immutable: true,
    match: 'wholeNode',
    reason:
      'This is the upstream GitHub repository identifier used by a repository example placeholder and a bot-instance fixture. Whole-node matching keeps immutable repository URLs under the URL exclusion, and changing the identifier would target a different or nonexistent repository',
  },
  {
    source: 'teleport-resourcekind__value--unknown',
    replacement: 'teleport-resourcekind__value--unknown',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This CSS class is an internal selector contract between rendered markup and styling, so changing it would break unknown-resource styling',
  },
  {
    source:
      'users are created and managed in Teleport and stored in the Auth Service backend.',
    replacement:
      'users are created and managed in Psiphon Access and stored in the Auth Service backend.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'Running-service copy uses the fork product name',
  },
];

/**
 * Phrases in this area that reach a user and that no catalog entry covers yet.
 * Measured against the catalog baseline recorded on 2026-08-19 by `brandGate.ts`.
 * The baseline can only shrink (ratchet rule).
 */
export const ROLES_USERS_TOKENS_BASELINE: readonly BrandBaselineEntry[] = [];
