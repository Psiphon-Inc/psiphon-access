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
 * The dated bundle-side exclusion list for layer 2 of the brand gate.
 *
 * WHY IT EXISTS. Layer 1 reads source and accounts a phrase with a catalog
 * entry. Layer 2 reads the emitted bundle. Some occurrences in the bundle have
 * no source-side representation that a content-keyed catalog entry can ever
 * reach, so layer 1 cannot account them and layer 2 would fail forever. This
 * file names those occurrences, with a reason each, and it carries its own
 * ratchet so it can only shrink.
 *
 * WHAT MAY GO IN IT. An occurrence belongs here only when a catalog entry
 * cannot address it. Measured on 2026-08-19 there are exactly two such
 * reasons, and every record below states which one applies.
 *
 *   1. The occurrence is an identifier or a property name. ADR 0007 "The
 *      algorithm" step 2 forbids the scanner from visiting an identifier, so
 *      no `source` string can ever name one.
 *   2. The occurrence comes from a module outside the layer 1 scan set and
 *      outside `shouldTransform`. That set is `.ts` and `.tsx` under
 *      `web/packages/teleport/src`, `web/packages/design/src` and
 *      `web/packages/shared`. A dependency, a generated protobuf module and a
 *      `.jsx` module all sit outside it.
 *
 * WHAT MAY NOT GO IN IT. Copy. An unbranded phrase that a user reads belongs
 * in a catalog leaf or, until an authoring child reaches it, in that leaf's
 * source baseline. Two structural guards enforce this, and `bundleGate.test.ts`
 * asserts both: no record may hold the bare brand word, and every record must
 * be strictly longer than it. A record or a rule that could match a lone
 * `Teleport` is rejected before any bundle is read.
 *
 * THE RATCHET. Every record and every rule must match at least one occurrence
 * in the emitted bundle. One that matches nothing fails the build until
 * somebody removes it. The ratchet does not wait for strict mode, because it
 * measures the health of this file and not the state of the rebrand.
 *
 * The ratchet is on presence, not on count. `count` records what was measured
 * and the report prints the drift, but a changed count never fails the build.
 * Keying a hard failure on an occurrence count would fire on any dependency
 * bump that adds one CSS selector, and a gate that cries wolf gets deleted.
 *
 * A THIRD MECHANISM SITS BELOW, and it is deliberately separate. Three
 * occurrences in the bundle are a WHOLE string equal to the bare lower-case
 * brand word, so no record can name them: the structural guard above forbids a
 * record as short as the brand word, and that guard is what keeps copy out.
 * All three are the `@gravitational/design-system` CSS variable namespace, and
 * the operator decided on 2026-08-19 to keep that namespace as `teleport`,
 * because it is a dependency boundary. `BUNDLE_NAMESPACE_LITERALS` is their
 * home. Read the comment on that constant before you add to it.
 *
 * ONE MEASURED GAP IS DELIBERATELY NOT IN THIS FILE, and never will be. It was
 * user-visible copy at `AuthConnectors/templates/github.yaml:16`, which the
 * GitHub connector editor shows to a user. It reached the bundle through
 * `?raw`, so neither the layer 1 scan set nor `shouldTransform` saw it. It is
 * copy, so it could not come here. The gate work measured the family it
 * belongs to: 17 `?raw` imports in the tree, all of them `.yaml?raw`, of which
 * 2 files hold the brand word and 1 of those 2 holds it only inside
 * `goteleport.com`, which `EXCLUDED_HOSTS` already accounts. One file and one
 * line, so the fork edits that line rather than growing the transform for it.
 * `bundleGate.test.ts` reads every `?raw` asset in the tree and fails when any
 * of them holds the brand word outside an excluded host.
 */

/**
 * Which derived shape of an occurrence a record inspects.
 *
 * - `token`: the longest run of `[A-Za-z0-9_$./@-]` around the occurrence,
 *   trimmed of leading and trailing `.`, `/` and `@`. This keeps a dotted
 *   protobuf name, a kebab CSS class and a slashed path whole.
 * - `identifier`: the longest run of `[A-Za-z0-9_$]` around the occurrence.
 *   Use this when the token would drag in a neighbouring minified name, as
 *   `e.validTeleportConfig` does. The identifier is `validTeleportConfig`,
 *   which the minifier preserves because it is a property name.
 */
export type BundleShape = 'token' | 'identifier';

/** Why an occurrence is out of reach of a catalog entry. */
export type BundleCategory =
  /** A `.jsx` module. Neither the scan set nor the transform covers one. */
  | 'jsx-only-module'
  /** A class name emitted by the `@gravitational/design-system` dependency. */
  | 'dependency-css-class'
  /** A CSS custom property emitted from the design system `cssVarsPrefix`. */
  | 'dependency-css-var'
  /** The design system CSS variable namespace itself, as a whole string. */
  | 'dependency-css-namespace'
  /** A message type name in generated protobuf code under `gen/proto/ts`. */
  | 'generated-protobuf'
  /** An identifier or property name, which the scanner never visits. */
  | 'source-identifier';

/**
 * A named alphabet for the tail of a category rule. The data names the
 * alphabet, and `bundleGate.ts` holds the matcher. A rule therefore cannot
 * express an arbitrary pattern, which is the same discipline ADR 0007 applies
 * to the catalog.
 */
export type BundleTail =
  /** `[a-z0-9-]+`, one character or more. A kebab CSS name. */
  | 'lowerKebab'
  /** `pkg(.pkg)*.vN.Type(.Type)*`. A protobuf message type path. */
  | 'protobufTypePath';

/** One excluded occurrence, keyed on a single exact token or identifier. */
export interface BundleExclusion {
  /** The exact token or identifier. Never the bare brand word. */
  readonly token: string;
  /** Which derived shape `token` is compared against. */
  readonly shape: BundleShape;
  /** Why a catalog entry cannot reach it. */
  readonly category: BundleCategory;
  /** Occurrences measured at the baseline. A note, not a ratchet input. */
  readonly count: number;
  /** One sentence naming the emitter and what breaks on a rename. */
  readonly reason: string;
}

/**
 * A named category rule. It stands in for a set of records whose membership
 * churns with a code generator rather than with a human decision, so listing
 * the members one by one would fail the build on a regeneration that changed
 * nothing a reader can see.
 */
export interface BundleCategoryRule {
  /** Unique id, used in the report and in a ratchet message. */
  readonly id: string;
  /** Why a catalog entry cannot reach the members. */
  readonly category: BundleCategory;
  /** Which derived shape the rule is compared against. */
  readonly shape: BundleShape;
  /**
   * The token must start with this exact literal. It must contain the brand
   * word and be strictly longer than it, so no rule can match a lone
   * `Teleport`.
   */
  readonly prefix: string;
  /** Every character after `prefix` must satisfy this named alphabet. */
  readonly tail: BundleTail;
  /** Occurrences measured at the baseline. A note, not a ratchet input. */
  readonly count: number;
  /** Why a rule is right here instead of one record per member. */
  readonly reason: string;
}

/**
 * One whole string literal in the bundle whose entire content is the bare
 * lower-case brand word.
 *
 * WHY THIS TYPE EXISTS AT ALL. `BundleExclusion` cannot express one of these,
 * and it must not learn how. Its guard rejects any token that is not strictly
 * longer than the brand word, and that guard is the only thing standing
 * between the exclusion list and a record that swallows every `Teleport` in
 * the product. So the three occurrences get a separate type with a separate
 * guard, rather than a loosened shared one.
 *
 * WHY IT CANNOT ADMIT COPY. Three conditions must hold at once, and the first
 * two are not configurable.
 *
 *   1. The matched text is exactly `teleport`, in lower case. `literal` is
 *      validated against `BRAND_WORD` for equality, so the set of literals a
 *      record can name has exactly one member. `Teleport` is unexpressible,
 *      and so is every phrase.
 *   2. The character before the match and the character after it are the SAME
 *      quote character. The match is therefore a complete string literal, not
 *      a word inside one. `"Welcome to Teleport"` fails on condition 1 and on
 *      condition 2. `"Welcome to teleport"` passes condition 1 on the word but
 *      fails condition 2, because the character before it is a space.
 *   3. The exact text in `anchor` immediately precedes the opening quote, and
 *      `anchor` ends in a structural character. This pins each record to one
 *      code position instead of to a shape, so the mechanism cannot quietly
 *      absorb an occurrence it was not written for.
 *
 * WHAT IT COULD ADMIT THAT IT SHOULD NOT, stated plainly: a user-visible
 * string whose WHOLE text is the single lower-case word `teleport`, sitting at
 * one of the three anchored positions. A one-word label, placeholder or
 * tooltip is the realistic case. Two things bound that risk. Each record names
 * its site in `site`, so a reader can check it. And `count` is a HARD CAP:
 * `evaluateBundleBaseline` fails the build when a record matches more times
 * than it records, unlike the count on a `BundleExclusion`, which only drifts.
 * A fourth occurrence at an anchored position therefore stops the build
 * instead of being absorbed.
 */
export interface BundleNamespaceLiteral {
  /** Unique id, used in the report and in a ratchet message. */
  readonly id: string;
  /** Must equal `BRAND_WORD` exactly. No other value validates. */
  readonly literal: string;
  /**
   * The exact text that must immediately precede the opening quote. It is
   * compared for equality, never as a pattern, and its last character must be
   * one of `:`, `[`, `,`, `(` or `=`, so a record names a code position and
   * cannot name the tail of a sentence.
   */
  readonly anchor: string;
  /** Why a catalog entry cannot reach it. */
  readonly category: BundleCategory;
  /** A HARD CAP. More matches than this fails the build. */
  readonly count: number;
  /** Where in the emitting module this occurrence comes from. */
  readonly site: string;
  /** One sentence naming the emitter and what breaks on a rename. */
  readonly reason: string;
}

/** The commit the list below was measured against. */
export const BUNDLE_BASELINE_COMMIT = 'baseline-2026-08-19';

/** The date the list below was measured. */
export const BUNDLE_BASELINE_DATE = '2026-08-19';

/**
 * Named category rules. Measured against the bundle baseline recorded on 2026-08-19.
 *
 * TWO rules, and the bar for a third is high. A rule is right only when the
 * membership of the category is decided by a generator. Everything else is a
 * record, because a record names one thing and a reader can check it.
 */
export const BUNDLE_CATEGORY_RULES: readonly BundleCategoryRule[] = [
  {
    id: 'generated-protobuf-type-name',
    category: 'generated-protobuf',
    shape: 'token',
    prefix: 'teleport.',
    tail: 'protobufTypePath',
    count: 66,
    reason:
      'A protobuf message type path emitted by protobuf-ts into gen/proto/ts, which sits outside the layer 1 scan set. The path is the wire type name that the proxy matches on, so a rename breaks desktop access, MFA and user preferences. A rule rather than 66 records because protoc decides the membership: regenerating from an upstream .proto adds or removes type names without any human touching the fork',
  },
  {
    id: 'design-system-css-var',
    category: 'dependency-css-var',
    shape: 'token',
    prefix: '--teleport-colors-',
    tail: 'lowerKebab',
    count: 2,
    reason:
      'A CSS custom property that @gravitational/design-system emits from its cssVarsPrefix of "teleport". A rule rather than records because the surviving set is whatever tree shaking keeps: any component change alters which colour tokens reach the bundle, so a record list would go stale on a change that a reader cannot see',
  },
];

/**
 * Whole-string bare brand words. Measured against the bundle baseline recorded on
 * 2026-08-19, when the operator decided to keep the design system CSS variable
 * namespace as `teleport`.
 *
 * THREE RECORDS, AND THE BAR FOR A FOURTH IS THE HIGHEST IN THIS FILE. Every
 * one of these is the same dependency's namespace, reached from a different
 * position in its emitted code. A fourth record needs a reason why the string
 * is not copy, and it needs the operator, because the only reason that has
 * ever qualified is a decision not to rename a dependency boundary.
 *
 * The same build holds five OTHER whole-string bare words, at
 * `placeholder:`, `children:`, `SNe=`, `repository||` and `repository??`.
 * None of them is here. They come from first-party modules inside the layer 1
 * scan set, they are part of the 22 bare lower-case source sites that
 * the gate work owns, and the anchors below are what keeps this mechanism
 * from taking that decision on its behalf.
 */
export const BUNDLE_NAMESPACE_LITERALS: readonly BundleNamespaceLiteral[] = [
  {
    id: 'design-system-css-vars-prefix',
    literal: 'teleport',
    anchor: 'cssVarsPrefix:',
    category: 'dependency-css-namespace',
    count: 1,
    site: 'The `cssVarsPrefix` of the base system config that @gravitational/design-system passes to createSystem',
    reason:
      'It is the namespace of every CSS custom property the design system emits, so it is the prefix that --teleport-colors-* is built from. The fork does not build that dependency, and the operator decided on 2026-08-19 to leave the namespace alone because renaming it is a dependency boundary change whose cost is not worth it',
  },
  {
    id: 'design-system-preset-name',
    literal: 'teleport',
    anchor: 'name:',
    category: 'dependency-css-namespace',
    count: 1,
    site: 'The `name` of the design system preset object, beside its `mode` and `config`',
    reason:
      'The preset name the design system registers on globalThis.__system. It selects the same namespace as the cssVarsPrefix above and is not shown to a user. Same dependency, same decision',
  },
  {
    id: 'design-system-token-path-root',
    literal: 'teleport',
    anchor: ',[',
    category: 'dependency-css-namespace',
    count: 1,
    site: 'The root of the token path array the design system walks to build a var(--...) reference for a colour token',
    reason:
      'The first segment of the token path, which the design system joins with hyphens to produce the CSS custom property name. It must equal the cssVarsPrefix above or every colour reference breaks. Same dependency, same decision',
  },
];

/**
 * Individual exclusions. Measured against the bundle baseline recorded on 2026-08-19.
 *
 * 30 records. Each names one token or one identifier, so a reader can check it
 * against the bundle without running anything.
 */
export const BUNDLE_EXCLUSIONS: readonly BundleExclusion[] = [
  // --- jsx-only-module: 2 records, 45 occurrences ---
  {
    token: 'ace-teleport',
    shape: 'token',
    category: 'jsx-only-module',
    count: 44,
    reason:
      'The ace editor theme class. TextEditor.jsx:120 passes it to setTheme and StyledTextEditor.jsx repeats it in every themed selector. Both are .jsx, so neither the layer 1 scan set nor shouldTransform reaches them, and the class name must match the value ace receives',
  },
  {
    token: 'ace-teleport.ace_multiselect',
    shape: 'token',
    category: 'jsx-only-module',
    count: 1,
    reason:
      'The same ace theme class with the ace_multiselect state class appended, from the compound selector at StyledTextEditor.jsx:61. Same .jsx module, same reason',
  },

  // --- dependency-css-class: 24 records, 24 occurrences ---
  {
    token: 'teleport-alert',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/feedback/alert/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-banner',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/feedback/banner/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-button',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/button recipe. design/src/Button/Button.tsx names the same prefix in its own force-state classes, but this occurrence is the dependency copy and no catalog entry reaches it',
  },
  {
    token: 'teleport-checkbox',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/forms/checkbox recipe. design/src/Checkbox/Checkbox.tsx names the same prefix in its own force-state classes, but this occurrence is the dependency copy and no catalog entry reaches it',
  },
  {
    token: 'teleport-blockquote',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/blockquote/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-card',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/layout/card/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-code',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/code/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-container',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/container/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-date-picker',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/forms/datePicker/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-dialog',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/overlays/dialog/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-field',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/forms/field/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-heading',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/typography/heading/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-icon',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/button/IconButton.recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-icon-button',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/button/IconButton.recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-input',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/forms/input/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-link',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/link/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-menu',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/overlays/menu/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-popover',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/overlays/popover/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-radio-group',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/forms/radio/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-shimmer-box',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/feedback/shimmerBox/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-spinner',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/spinner/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-table',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/table/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-toggle',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/forms/toggle/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },
  {
    token: 'teleport-tooltip',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason:
      'Class name from @gravitational/design-system components/overlays/tooltip/recipe.js. The fork does not build that dependency, so no catalog entry can reach the string',
  },

  // --- source-identifier: 7 records, 21 occurrences ---
  {
    token: 'teleport_id',
    shape: 'identifier',
    category: 'source-identifier',
    count: 10,
    reason:
      'The audit event field name, read as an unquoted destructuring key in services/audit/makeEvent.ts. It is the wire field the audit log emits, and the scanner never visits a destructuring pattern',
  },
  {
    token: 'awsDeployTeleportServicePath',
    shape: 'identifier',
    category: 'source-identifier',
    count: 2,
    reason:
      'An api config property name declared at teleport/src/config.ts:545 and read at line 1773. ADR 0007 forbids the scanner from visiting an identifier, so no catalog entry can name it',
  },
  {
    token: 'getAwsDeployTeleportServiceUrl',
    shape: 'identifier',
    category: 'source-identifier',
    count: 2,
    reason:
      'A method name declared at teleport/src/config.ts:1770 and called from services/integrations/integrations.ts. ADR 0007 forbids the scanner from visiting an identifier, so no catalog entry can name it',
  },
  {
    token: 'installTeleport',
    shape: 'identifier',
    category: 'source-identifier',
    count: 2,
    reason:
      'A discovery config field name in services/discovery/discovery.ts. ADR 0007 forbids the scanner from visiting an identifier, so no catalog entry can name it',
  },
  {
    token: 'install_teleport',
    shape: 'identifier',
    category: 'source-identifier',
    count: 1,
    reason:
      'The wire field name the discovery API reads, written as an unquoted object key at services/discovery/discovery.ts:82. It is a protocol name that must not change, and the scanner never visits an object key',
  },
  {
    token: 'validTeleportConfig',
    shape: 'identifier',
    category: 'source-identifier',
    count: 2,
    reason:
      'The wire field name in the deployed database service response, declared at services/integrations/types.ts:909. It is a protocol name that must not change, and the scanner never visits an identifier',
  },
  {
    token: 'TeleportSetUp',
    shape: 'identifier',
    category: 'source-identifier',
    count: 2,
    reason:
      'A guide reference link key declared at Integrations/Enroll/AwsConsole/Guide.tsx:49 and read at line 67. It names no user-visible text, and the scanner never visits an object key',
  },
];
