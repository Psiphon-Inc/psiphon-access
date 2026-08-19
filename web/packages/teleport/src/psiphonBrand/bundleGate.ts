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
 * Layer 2 of the brand gate. It reads the emitted bundle, so it measures what
 * ships. It is the step that proves the plugin actually ran, and it is what
 * makes the build-time transform safe: a build that skipped the plugin cannot
 * pass it.
 *
 * ENFORCEMENT SWITCHES ITSELF ON. While the source baseline still admits a
 * phrase, the bundle necessarily still holds unbranded copy, so the gate
 * reports and does not throw. When the aggregate source baseline reaches zero,
 * `isBundleGateStrict` becomes true on its own, with no further commit.
 *
 * FOUR THINGS ACCOUNT FOR AN OCCURRENCE, and nothing else does.
 *
 *   1. A catalog entry, matched by its replacement text.
 *   2. An excluded host from `EXCLUDED_HOSTS`.
 *   3. A record or a named rule in `bundleBaseline.ts`, for the occurrences a
 *      source-keyed catalog entry can never reach.
 *   4. A namespace literal in `bundleBaseline.ts`, for the three occurrences
 *      where the WHOLE string is the bare lower-case word. A record cannot be
 *      that short, by a guard this file must not weaken, so those three get a
 *      separate type with a narrower key and a HARD CAP on how many
 *      occurrences it may take.
 *
 * The third and fourth lists have THEIR OWN RATCHET, in
 * `evaluateBundleBaseline`, and that ratchet does not wait for strict mode. A
 * record that stops matching fails the build until somebody removes it, so
 * both lists can only shrink.
 */

import {
  BRAND_BASELINE,
  BRAND_CATALOG,
  BRAND_WORD,
  EXCLUDED_HOSTS,
  isWholeNodeEntry,
  type BrandBaselineEntry,
  type BrandPhrase,
  type ExcludedHost,
} from './brandCatalog';
import { isExcludedByHost, sortLongestFirst } from './brandMatcher';
import {
  BUNDLE_BASELINE_COMMIT,
  BUNDLE_BASELINE_DATE,
  BUNDLE_CATEGORY_RULES,
  BUNDLE_EXCLUSIONS,
  BUNDLE_NAMESPACE_LITERALS,
  type BundleCategoryRule,
  type BundleExclusion,
  type BundleNamespaceLiteral,
  type BundleTail,
} from './bundleBaseline';

/** One group of unaccounted occurrences in the emitted bundle. */
export interface BundleResidual {
  /** The surrounding run of non-whitespace, non-quote characters. */
  readonly run: string;
  /** How many times that run holds an unaccounted occurrence. */
  readonly count: number;
  /** Offset of the first occurrence, so a human can find it. */
  readonly firstIndex: number;
  /** The token the exclusion list would have to name to admit this run. */
  readonly token: string;
  /** The identifier the exclusion list would have to name instead. */
  readonly identifier: string;
}

export interface BundleScanResult {
  readonly chunk: string;
  readonly totalOccurrences: number;
  readonly accountedByCatalog: number;
  readonly accountedByHost: number;
  /** Occurrences a record or a rule in `bundleBaseline.ts` admitted. */
  readonly accountedByExclusion: number;
  /** Occurrences a whole-string namespace literal admitted. */
  readonly accountedByNamespace: number;
  /** Hits per exclusion key in this chunk. The ratchet reads this. */
  readonly exclusionHits: Readonly<Record<string, number>>;
  readonly residuals: readonly BundleResidual[];
  readonly residualOccurrences: number;
}

/**
 * True when the bundle gate throws rather than reports. It is derived, never
 * configured, so nobody has to remember to turn it on.
 */
export function isBundleGateStrict(
  baseline: readonly BrandBaselineEntry[] = BRAND_BASELINE
): boolean {
  return baseline.length === 0;
}

/** Stable key for one record, used in the report and in a ratchet message. */
export function bundleExclusionKey(exclusion: BundleExclusion): string {
  return `${exclusion.shape}:${exclusion.token}`;
}

/** Stable key for one named rule. */
export function bundleRuleKey(rule: BundleCategoryRule): string {
  return `rule:${rule.id}`;
}

/** Stable key for one whole-string namespace literal. */
export function bundleNamespaceKey(literal: BundleNamespaceLiteral): string {
  return `namespace:${literal.id}`;
}

/**
 * The quote characters a complete string literal can be wrapped in. The
 * minifier rewrites most literals as template strings, so the backtick is not
 * optional.
 */
const QUOTE_CHARACTERS: readonly string[] = ['"', "'", '`'];

/**
 * The characters an `anchor` may end with. Each one puts the literal in a code
 * position: a property value, an array element, an argument or an assignment.
 * An anchor that ended in a letter would name the tail of a sentence, and this
 * mechanism must never be able to do that.
 */
const ANCHOR_TERMINATORS: readonly string[] = [':', '[', ',', '(', '='];

/**
 * True when the occurrence at `index` is a COMPLETE string literal equal to
 * the bare lower-case brand word, sitting immediately after `literal.anchor`.
 *
 * Read the three conditions together. The word must match in lower case, so a
 * capitalised `Teleport` never reaches here. The characters on both sides must
 * be the same quote, so the match is a whole literal and not a word inside
 * one. And the anchor must precede the opening quote, so the record names one
 * position rather than a shape.
 */
export function namespaceLiteralMatches(
  literal: BundleNamespaceLiteral,
  code: string,
  index: number
): boolean {
  const end = index + literal.literal.length;
  if (code.slice(index, end) !== literal.literal) {
    return false;
  }
  const before = code[index - 1];
  const after = code[end];
  if (
    before === undefined ||
    after === undefined ||
    before !== after ||
    !QUOTE_CHARACTERS.includes(before)
  ) {
    return false;
  }
  const anchorStart = index - 1 - literal.anchor.length;
  if (anchorStart < 0) {
    return false;
  }
  return code.startsWith(literal.anchor, anchorStart);
}

/**
 * THE BOUNDED LITERAL REGION.
 *
 * A catalog entry is normally consumed here by searching the chunk for
 * `entry.replacement` as a plain substring. Two kinds of entry defeat that
 * search, and both defeat it for the same reason: the chunk does not hold the
 * replacement text byte for byte.
 *
 *   1. A TEMPLATE ENTRY. When the source is a template literal WITH `${...}`
 *      expressions and the replacement keeps the brand word, the catalog holds
 *      author-written expression text such as `${moduleSrc}` and the minified
 *      chunk holds `${i}`. The literal spans between the expressions, the
 *      QUASIS, are what can be matched.
 *   2. AN ESCAPED DOLLAR-BRACE. The catalog holds one backslash before `${`.
 *      The template rewrite escapes the backslash and `${`. The chunk holds
 *      three backslashes, but babel still records all of this text as a quasi.
 *   3. A WHOLE-NODE ENTRY. `sortLongestFirst` drops one, and that filter is
 *      correct: a chunk has no AST nodes, so the only thing a substring reader
 *      could do with an immutable bare-word entry is account every lower-case
 *      occurrence in the product in one sweep. The gate work measured that it
 *      would hide 401 unaccounted runs. The chunk-side analogue of a whole node
 *      is a COMPLETE QUOTED STRING, which is the same idea
 *      `namespaceLiteralMatches` already uses for amendment 8.
 *
 * ONE MECHANISM SERVES ALL THREE. Match the entry's quasi sequence, in order,
 * against a complete quoted string: the character before the first quasi and
 * the character after the last quasi must be the SAME quote, and every gap
 * between two quasis must be an expression span. A whole-node entry has one
 * quasi and no gap, so it degenerates to "a complete quoted string equal to the
 * replacement", which is amendment 8's shape without the anchor.
 *
 * WHAT IS CONSUMED IS ONLY THE QUASI TEXT, never the expression text. The
 * catalog provably produced the quasis. It did not produce the minified
 * expression, so an occurrence inside one is still reported unless an
 * identifier record accounts it.
 *
 * TWO SHAPES OF GAP, because two transforms lower a template two ways.
 *
 *   `${...}`, when the template reached the chunk as a template literal.
 *   `` `,` ``, when the template was TAGGED and the transform lowered it to a
 *   call over an array of its quasis, which is what every styled-components
 *   block in `web/packages/design/src` becomes. The quasis are then adjacent
 *   array elements, so the gap is a closing quote, a comma and an opening
 *   quote, with the same quote character on both sides.
 *
 * THE SHORT-QUASI RULE, and why it is the rule the exclusion list already uses.
 * A quasi is consumed only when its non-whitespace length is STRICTLY GREATER
 * than the brand word, so a quasi that is the bare word and nothing else
 * carries no context and takes nothing. The one exception is an entry that
 * DECLARES `match: 'wholeNode'`, which amendment 7 guards at four separate
 * places in the source readers. That declaration, and not a length, is what
 * admits the bare word here. The pair of rules mirrors
 * `validateBundleBaseline`: a record must be longer than the brand word, a
 * namespace literal must BE it, and neither is a relaxation of the other.
 *
 * AN EMPTY QUASI IS SAFE AND IS NOT A SPECIAL CASE. It requires nothing of its
 * own, and its neighbours become adjacent: a leading empty quasi forces the
 * region to open with `` `${ ``, a trailing one forces it to close with
 * `` }` ``, and one between two expressions forces `}${`. Its evidence length
 * is zero, so it can never take an occurrence either.
 *
 * WHAT COUNTS AS EVIDENCE INSIDE A BOUNDED REGION, and only inside one. The
 * styled-components transform MINIFIES the CSS it lowers. Two things it
 * deletes therefore cannot be compared at all, and a byte comparison would
 * fail a strict build for ever on both.
 *
 *   WHITESPACE. `input:enabled:hover + &,\n  .teleport-x` reaches the chunk as
 *   `input:enabled:hover + &,.teleport-x`.
 *   A COMMENT. `\n  // reset the appearance so we can style the background`
 *   reaches the chunk as nothing at all.
 *
 * The quasi comparison therefore compares EVIDENCE: the characters that are
 * neither whitespace nor inside a comment, in order. A `//` comment counts
 * only at the start of a line, so a `//` inside a URL stays evidence. A
 * genuine miss differs in an evidence character and is still reported, which
 * `bundleGate.test.ts` proves for both a changed class name and a changed
 * word. The tolerance is confined to a region already pinned at both ends by a
 * quote, and the plain substring pass below stays byte exact.
 */

/** The literal spans of a replacement, and whether it holds an expression. */
export interface ReplacementShape {
  /** The text between the `${...}` spans. Always at least one element. */
  readonly quasis: readonly string[];
  /** True when the replacement holds at least one `${...}` expression. */
  readonly hasExpressions: boolean;
  /** True when a quasi holds `${` escaped by a backslash. */
  readonly hasEscapedDollarBrace: boolean;
}

/** True when the `${` at `index` is escaped, so it is literal text. */
function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && text[i] === '\\') {
    backslashes++;
    i--;
  }
  return backslashes % 2 === 1;
}

/** Index just after the closing quote of the string that opens at `open`. */
function skipQuoted(text: string, open: number): number {
  const quote = text[open];
  let i = open + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return -1;
}

/** Index just after the backtick that closes the template opening at `open`. */
function skipTemplateLiteral(text: string, open: number): number {
  let i = open + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === '`') {
      return i + 1;
    }
    if (text[i] === '$' && text[i + 1] === '{') {
      const after = skipExpression(text, i);
      if (after < 0) {
        return -1;
      }
      i = after;
      continue;
    }
    i++;
  }
  return -1;
}

/**
 * Index just after the `}` that closes the `${` at `open`, or -1 when the text
 * holds no balanced close. A caller that gets -1 refuses the match, so the
 * occurrence is reported rather than swallowed.
 */
function skipExpression(text: string, open: number): number {
  let i = open + 2;
  let depth = 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const after = skipQuoted(text, i);
      if (after < 0) {
        return -1;
      }
      i = after;
      continue;
    }
    if (c === '`') {
      const after = skipTemplateLiteral(text, i);
      if (after < 0) {
        return -1;
      }
      i = after;
      continue;
    }
    if (c === '{') {
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      i++;
      if (depth === 0) {
        return i;
      }
      continue;
    }
    i++;
  }
  return -1;
}

/**
 * Split a replacement into its quasis, the literal spans between its `${...}`
 * expressions.
 *
 * `\${` IS LITERAL TEXT, not the start of an expression. The GitHub Actions
 * templates embed `\${{ env.TELEPORT_* }}` so the rendered workflow carries a
 * literal `${`, and babel records no expression span there either.
 *
 * It THROWS on an unterminated expression, because that means the catalog holds
 * text no source reader could have produced. Reporting a residual instead would
 * hide a broken entry behind a run somebody would try to explain.
 */
export function replacementShape(replacement: string): ReplacementShape {
  const quasis: string[] = [];
  let hasEscapedDollarBrace = false;
  let cursor = 0;
  let i = 0;
  while (i < replacement.length) {
    if (replacement[i] === '$' && replacement[i + 1] === '{') {
      if (isEscaped(replacement, i)) {
        hasEscapedDollarBrace = true;
        i += 2;
        continue;
      }
      const after = skipExpression(replacement, i);
      if (after < 0) {
        throw new Error(
          `psiphon-brand: the catalog replacement ${JSON.stringify(replacement.slice(0, 80))} opens an expression at offset ${i} that it never closes. ` +
            'A replacement must carry its expression spans exactly as the source reader records them.'
        );
      }
      quasis.push(replacement.slice(cursor, i));
      cursor = after;
      i = after;
      continue;
    }
    i++;
  }
  quasis.push(replacement.slice(cursor));
  return {
    quasis,
    hasExpressions: quasis.length > 1,
    hasEscapedDollarBrace,
  };
}

/** Convert a rewritten template quasi to the source form in the chunk. */
function escapeRewrittenTemplateQuasi(quasi: string): string {
  return quasi
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/**
 * The character references a JSX text node can carry. The layer 1 scanner reads
 * the RAW text of the node, because the raw text is what the transform rewrites,
 * so a catalog source holds `we&apos;ll`. The JSX transform decodes the
 * reference, so the chunk holds `we'll`. The two texts are the same phrase and
 * this entry provably produced both, which is why the substring pass searches
 * for each of them.
 *
 * An unknown reference decodes to itself, so the occurrence stays reported. The
 * failure direction is the loud one.
 */
const CHARACTER_REFERENCES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  bull: '\u2022',
  copy: '\u00a9',
  deg: '\u00b0',
  gt: '>',
  hellip: '\u2026',
  laquo: '\u00ab',
  ldquo: '\u201c',
  lsquo: '\u2018',
  lt: '<',
  mdash: '\u2014',
  middot: '\u00b7',
  nbsp: '\u00a0',
  ndash: '\u2013',
  quot: '"',
  raquo: '\u00bb',
  rdquo: '\u201d',
  reg: '\u00ae',
  rsquo: '\u2019',
  times: '\u00d7',
  trade: '\u2122',
};

/**
 * Decode the character references in a JSX text node. Returns the text
 * unchanged when it holds none, so a caller can compare by identity.
 */
export function decodeCharacterReferences(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  return text.replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole: string, body: string) => {
      if (body[0] !== '#') {
        return CHARACTER_REFERENCES[body] ?? whole;
      }
      const digits = body.slice(1);
      const hex = digits[0] === 'x' || digits[0] === 'X';
      const value = Number.parseInt(
        hex ? digits.slice(1) : digits,
        hex ? 16 : 10
      );
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : whole;
    }
  );
}

/** One consumable literal span of a matched bounded region. */
interface RegionSpan {
  readonly start: number;
  readonly end: number;
}

const WHITESPACE = /\s/;

/**
 * The characters of a quasi that are evidence: everything that is neither
 * whitespace nor inside a comment the CSS transform deletes.
 *
 * A `//` run counts as a comment ONLY when nothing but whitespace precedes it
 * on its line. That keeps the `//` of a URL as evidence, which matters because
 * a quasi can hold a documentation link.
 */
export function evidenceOf(quasi: string): string {
  const out: string[] = [];
  let atLineStart = true;
  let i = 0;
  while (i < quasi.length) {
    const c = quasi[i];
    if (WHITESPACE.test(c)) {
      if (c === '\n') {
        atLineStart = true;
      }
      i++;
      continue;
    }
    if (c === '/' && quasi[i + 1] === '/' && atLineStart) {
      const nl = quasi.indexOf('\n', i);
      i = nl < 0 ? quasi.length : nl;
      continue;
    }
    if (c === '/' && quasi[i + 1] === '*') {
      const close = quasi.indexOf('*/', i + 2);
      i = close < 0 ? quasi.length : close + 2;
      continue;
    }
    out.push(c);
    atLineStart = false;
    i++;
  }
  return out.join('');
}

/** How many characters of a quasi are evidence. */
export function evidenceLength(quasi: string): number {
  return evidenceOf(quasi).length;
}

/** Index of the first character at or after `at` that is not whitespace. */
function skipWhitespace(code: string, at: number): number {
  let i = at;
  while (i < code.length && WHITESPACE.test(code[i])) {
    i++;
  }
  return i;
}

/**
 * Match one quasi's evidence at `at`. Returns the offset just after the last
 * matched character, or -1. The caller passes evidence rather than the raw
 * quasi so the extraction happens once per entry, not once per candidate.
 */
function matchEvidence(code: string, evidence: string, at: number): number {
  let i = at;
  let end = at;
  for (let j = 0; j < evidence.length; j++) {
    while (i < code.length && WHITESPACE.test(code[i])) {
      i++;
    }
    if (code[i] !== evidence[j]) {
      return -1;
    }
    i++;
    end = i;
  }
  return end;
}

/**
 * Match `quasis` in order at `start`, as a COMPLETE quoted string. Returns the
 * matched quasi spans, or null when the code does not hold that shape.
 */
export function matchBoundedRegion(
  code: string,
  quasis: readonly string[],
  start: number,
  evidence: readonly string[] = quasis.map(evidenceOf)
): RegionSpan[] | null {
  const opening = code[start - 1];
  if (opening === undefined || !QUOTE_CHARACTERS.includes(opening)) {
    return null;
  }
  const spans: RegionSpan[] = [];
  let cursor = start;
  for (let i = 0; i < quasis.length; i++) {
    const end = matchEvidence(code, evidence[i], cursor);
    if (end < 0) {
      return null;
    }
    spans.push({ start: cursor, end });
    // The quasi may end in whitespace the minifier removed, or the chunk may
    // carry whitespace the quasi does not. Neither is evidence, so neither
    // decides whether the next gap is where it should be.
    cursor = skipWhitespace(code, end);
    if (i === quasis.length - 1) {
      break;
    }
    if (code[cursor] === '$' && code[cursor + 1] === '{') {
      const after = skipExpression(code, cursor);
      if (after < 0) {
        return null;
      }
      cursor = after;
      continue;
    }
    if (
      code[cursor] === opening &&
      code[cursor + 1] === ',' &&
      code[cursor + 2] === opening
    ) {
      cursor += 3;
      continue;
    }
    return null;
  }
  if (code[cursor] !== opening) {
    return null;
  }
  return spans;
}

/**
 * The named tail alphabets. The data in `bundleBaseline.ts` names one of
 * these, so a rule cannot express an arbitrary pattern. This mirrors the way
 * ADR 0007 keeps a pattern out of the catalog by giving the entry no field
 * that could hold one.
 */
const TAIL_MATCHERS: Readonly<Record<BundleTail, (tail: string) => boolean>> = {
  // A kebab CSS name: lower case letters, digits and hyphens.
  lowerKebab: tail => /^[a-z0-9-]+$/.test(tail),
  // A protobuf message type path: one or more lower-case package segments, a
  // version segment, then one or more capitalised type segments.
  protobufTypePath: tail =>
    /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*\.v[0-9]+(\.[A-Za-z][A-Za-z0-9]*)+$/.test(
      tail
    ),
};

/**
 * The surrounding run of non-whitespace, non-quote characters. It is what the
 * host exclusion is tested against, and it is exported so a test can apply the
 * same host rule to an asset that never reaches a chunk as code.
 */
export function runAround(
  text: string,
  index: number
): { run: string; start: number } {
  const isRunChar = (c: string) => !/[\s'"`]/.test(c);
  let lo = index;
  while (lo > 0 && isRunChar(text[lo - 1])) {
    lo--;
  }
  let hi = index;
  while (hi < text.length && isRunChar(text[hi])) {
    hi++;
  }
  return { run: text.slice(lo, hi), start: lo };
}

function spanAround(
  text: string,
  index: number,
  isMember: (c: string) => boolean
): string {
  let lo = index;
  while (lo > 0 && isMember(text[lo - 1])) {
    lo--;
  }
  let hi = index;
  while (hi < text.length && isMember(text[hi])) {
    hi++;
  }
  return text.slice(lo, hi);
}

/**
 * The `token` shape. It keeps a dotted protobuf name, a kebab CSS class and a
 * slashed path whole, and it stops at any character a minifier would put
 * between two unrelated names.
 *
 * Leading and trailing `.`, `/` and `@` are trimmed, because a CSS selector
 * writes `.ace-teleport` and a path writes a trailing slash, and neither
 * belongs to the name. A hyphen is NOT trimmed, because `--teleport-colors-x`
 * is a CSS custom property whose name starts with the two hyphens.
 */
export function tokenAround(text: string, index: number): string {
  const raw = spanAround(text, index, c => /[A-Za-z0-9_$./@-]/.test(c));
  return raw.replace(/^[./@]+/, '').replace(/[./@]+$/, '');
}

/**
 * The `identifier` shape. Use it when the token would drag in a neighbouring
 * minified name, as `e.validTeleportConfig` does.
 */
export function identifierAround(text: string, index: number): string {
  return spanAround(text, index, c => /[A-Za-z0-9_$]/.test(c));
}

/** True when a named rule admits this token. */
export function ruleMatches(
  rule: BundleCategoryRule,
  subject: string
): boolean {
  if (!subject.startsWith(rule.prefix)) {
    return false;
  }
  const tail = subject.slice(rule.prefix.length);
  if (tail.length === 0) {
    return false;
  }
  return TAIL_MATCHERS[rule.tail](tail);
}

/**
 * Validate the exclusion list before any bundle is read. The two length rules
 * are the structural guard that keeps copy out: no record and no rule can be
 * the bare brand word, so none of them can ever admit a lone `Teleport`.
 */
export function validateBundleBaseline(
  exclusions: readonly BundleExclusion[] = BUNDLE_EXCLUSIONS,
  rules: readonly BundleCategoryRule[] = BUNDLE_CATEGORY_RULES,
  literals: readonly BundleNamespaceLiteral[] = BUNDLE_NAMESPACE_LITERALS
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const exclusion of exclusions) {
    const key = bundleExclusionKey(exclusion);
    const lower = exclusion.token.toLowerCase();
    if (!lower.includes(BRAND_WORD)) {
      problems.push(
        `INVALID_EXCLUSION: record "${key}" does not contain the brand word, so it excludes nothing this gate looks for.`
      );
    }
    if (exclusion.token.length <= BRAND_WORD.length) {
      problems.push(
        `INVALID_EXCLUSION: record "${key}" is not longer than the brand word. A record that short could admit a lone occurrence of it, which is copy.`
      );
    }
    if (exclusion.reason.trim().length === 0) {
      problems.push(`INVALID_EXCLUSION: record "${key}" has no reason.`);
    }
    if (exclusion.count < 1) {
      problems.push(
        `INVALID_EXCLUSION: record "${key}" records a count below 1, so it was never measured.`
      );
    }
    if (seen.has(key)) {
      problems.push(`INVALID_EXCLUSION: record "${key}" is a duplicate.`);
    }
    seen.add(key);
  }

  for (const rule of rules) {
    const key = bundleRuleKey(rule);
    const lower = rule.prefix.toLowerCase();
    if (!lower.includes(BRAND_WORD)) {
      problems.push(
        `INVALID_EXCLUSION: rule "${key}" has a prefix that does not contain the brand word, so it is not narrow.`
      );
    }
    if (rule.prefix.length <= BRAND_WORD.length) {
      problems.push(
        `INVALID_EXCLUSION: rule "${key}" has a prefix no longer than the brand word. That rule would swallow copy, which ADR 0007 rejected.`
      );
    }
    if (rule.reason.trim().length === 0) {
      problems.push(`INVALID_EXCLUSION: rule "${key}" has no reason.`);
    }
    if (rule.count < 1) {
      problems.push(
        `INVALID_EXCLUSION: rule "${key}" records a count below 1, so it was never measured.`
      );
    }
    if (seen.has(key)) {
      problems.push(`INVALID_EXCLUSION: rule "${key}" is a duplicate.`);
    }
    seen.add(key);
  }

  // The namespace literals get the OPPOSITE length rule to the one above, and
  // that is deliberate. A record must be longer than the brand word so it can
  // never match a lone occurrence. A namespace literal must BE the brand word
  // and nothing else, so the set of literals it can name has exactly one
  // member. Neither rule is a relaxation of the other: together they leave no
  // way to express a key that matches a phrase.
  for (const literal of literals) {
    const key = bundleNamespaceKey(literal);
    if (literal.literal !== BRAND_WORD) {
      problems.push(
        `INVALID_EXCLUSION: namespace literal "${key}" names ${JSON.stringify(literal.literal)}, not the bare lower-case brand word. This mechanism exists for one string and can express no other.`
      );
    }
    if (literal.anchor.length === 0) {
      problems.push(
        `INVALID_EXCLUSION: namespace literal "${key}" has no anchor, so it would match the bare word at any position.`
      );
    } else if (
      !ANCHOR_TERMINATORS.includes(literal.anchor[literal.anchor.length - 1])
    ) {
      problems.push(
        `INVALID_EXCLUSION: namespace literal "${key}" has an anchor ending in ${JSON.stringify(literal.anchor[literal.anchor.length - 1])}. An anchor must end in one of ${ANCHOR_TERMINATORS.join(' ')} so it names a code position and not the tail of a sentence.`
      );
    }
    if (literal.reason.trim().length === 0) {
      problems.push(
        `INVALID_EXCLUSION: namespace literal "${key}" has no reason.`
      );
    }
    if (literal.site.trim().length === 0) {
      problems.push(
        `INVALID_EXCLUSION: namespace literal "${key}" names no site. Every admitted occurrence must be named by a human.`
      );
    }
    if (literal.count < 1) {
      problems.push(
        `INVALID_EXCLUSION: namespace literal "${key}" records a count below 1, so it was never measured.`
      );
    }
    if (seen.has(key)) {
      problems.push(
        `INVALID_EXCLUSION: namespace literal "${key}" is a duplicate.`
      );
    }
    seen.add(key);
  }

  return problems;
}

/**
 * Find every occurrence of the brand word in one emitted chunk that neither a
 * catalog entry, nor an excluded host, nor the bundle exclusion list explains.
 *
 * The bundle holds the REPLACEMENT text, not the source text, so the catalog is
 * consumed by replacement. In practice only an immutable entry keeps the word,
 * which is exactly why ADR 0007 keeps all five immutable entries: without them
 * this layer cannot tell a header it must leave alone from a phrase somebody
 * forgot.
 *
 * THE CATALOG IS READ IN TWO PASSES, and the narrower claim goes first.
 *
 *   Pass A, the bounded literal region. A template entry and a whole-node entry
 *   are matched by their quasi sequence inside a complete quoted string. See
 *   "THE BOUNDED LITERAL REGION" above for why a plain substring search cannot
 *   reach either of them.
 *
 *   Pass B, the plain substring search, longest replacement first, byte exact,
 *   as before. It also searches for the character-reference-decoded form of a
 *   replacement, because a JSX text node reaches the chunk decoded. A template
 *   entry stays in this pass too, because an unminified build holds the
 *   replacement verbatim and the pass costs nothing.
 *
 * A NAMESPACE LITERAL OUTRANKS PASS A. `BUNDLE_NAMESPACE_LITERALS` names three
 * anchored sites whose whole string is the bare lower-case word, and each one
 * carries a HARD CAP. The whole-node catalog entry for the same word would take
 * them first and leave those records matching nothing, which is
 * `BUNDLE_RATCHET_FAIL`. Pass A therefore refuses any region holding an
 * occurrence a namespace literal has claimed, so each mechanism keeps the sites
 * it was measured against.
 */
export function scanBundleResidual(
  chunk: string,
  code: string,
  catalog: readonly BrandPhrase[] = BRAND_CATALOG,
  hosts: readonly ExcludedHost[] = EXCLUDED_HOSTS,
  exclusions: readonly BundleExclusion[] = BUNDLE_EXCLUSIONS,
  rules: readonly BundleCategoryRule[] = BUNDLE_CATEGORY_RULES,
  literals: readonly BundleNamespaceLiteral[] = BUNDLE_NAMESPACE_LITERALS
): BundleScanResult {
  const consumed = new Uint8Array(code.length);
  const holdsBrand = (text: string) => /teleport/i.test(text);
  const lower = code.toLowerCase();

  // Every offset a namespace literal claims. Pass A must not take one, or the
  // three anchored design system records would match nothing and the ratchet
  // would demand their removal for a reason that is not true.
  const claimedByNamespace = new Set<number>();
  for (
    let at = lower.indexOf(BRAND_WORD);
    at >= 0;
    at = lower.indexOf(BRAND_WORD, at + 1)
  ) {
    const claimed = literals.some(candidate =>
      namespaceLiteralMatches(candidate, code, at)
    );
    if (claimed) {
      claimedByNamespace.add(at);
    }
  }

  // Pass A. A template entry and a whole-node entry, by bounded literal region.
  const bounded = catalog
    .filter(entry => holdsBrand(entry.replacement))
    .map(entry => {
      const shape = replacementShape(entry.replacement);
      const quasis =
        entry.source === entry.replacement
          ? shape.quasis
          : shape.quasis.map(escapeRewrittenTemplateQuasi);
      return { entry, shape, quasis, evidence: quasis.map(evidenceOf) };
    })
    .filter(
      candidate =>
        candidate.shape.hasExpressions ||
        candidate.shape.hasEscapedDollarBrace ||
        isWholeNodeEntry(candidate.entry)
    )
    .sort(
      (a, b) =>
        b.entry.replacement.length - a.entry.replacement.length ||
        (a.entry.replacement < b.entry.replacement ? -1 : 1)
    );
  if (bounded.length > 0) {
    // A bounded region opens right after a quote, and a quasi may begin with
    // whitespace the minifier removed, so the candidate starts are the
    // positions after every quote in the chunk rather than the offsets of any
    // one needle.
    const candidates: number[] = [];
    for (let i = 0; i < code.length; i++) {
      if (QUOTE_CHARACTERS.includes(code[i])) {
        candidates.push(i + 1);
      }
    }
    for (const { entry, quasis, evidence } of bounded) {
      const whole = isWholeNodeEntry(entry);
      for (const at of candidates) {
        const spans = matchBoundedRegion(code, quasis, at, evidence);
        if (!spans) {
          continue;
        }
        const last = spans[spans.length - 1];
        let claimed = false;
        for (const offset of claimedByNamespace) {
          if (offset >= spans[0].start && offset < last.end) {
            claimed = true;
            break;
          }
        }
        if (claimed) {
          continue;
        }
        for (let s = 0; s < spans.length; s++) {
          // The short-quasi rule. A quasi with no more evidence than the brand
          // word proves nothing, so it takes nothing. A declared whole-node
          // entry is the one narrow exception.
          if (!whole && evidence[s].length <= BRAND_WORD.length) {
            continue;
          }
          for (let i = spans[s].start; i < spans[s].end; i++) {
            consumed[i] = 1;
          }
        }
      }
    }
  }

  // Pass B. Every other entry, by plain byte-exact substring, longest first.
  const surviving = sortLongestFirst(
    catalog.filter(entry => holdsBrand(entry.replacement))
  );
  for (const entry of surviving) {
    const decoded = decodeCharacterReferences(entry.replacement);
    const needles =
      decoded === entry.replacement
        ? [entry.replacement]
        : [entry.replacement, decoded];
    for (const needle of needles) {
      if (needle.length === 0) {
        continue;
      }
      let from = 0;
      for (;;) {
        const at = code.indexOf(needle, from);
        if (at < 0) {
          break;
        }
        const end = at + needle.length;
        let free = true;
        for (let i = at; i < end; i++) {
          if (consumed[i]) {
            free = false;
            break;
          }
        }
        if (free) {
          for (let i = at; i < end; i++) {
            consumed[i] = 1;
          }
        }
        from = at + 1;
      }
    }
  }

  const byToken = new Map<string, BundleExclusion>();
  const byIdentifier = new Map<string, BundleExclusion>();
  for (const exclusion of exclusions) {
    const target = exclusion.shape === 'token' ? byToken : byIdentifier;
    target.set(exclusion.token, exclusion);
  }
  const exclusionHits: Record<string, number> = {};
  for (const exclusion of exclusions) {
    exclusionHits[bundleExclusionKey(exclusion)] = 0;
  }
  for (const rule of rules) {
    exclusionHits[bundleRuleKey(rule)] = 0;
  }
  for (const literal of literals) {
    exclusionHits[bundleNamespaceKey(literal)] = 0;
  }

  const grouped = new Map<
    string,
    { count: number; firstIndex: number; token: string; identifier: string }
  >();
  let total = 0;
  // Counted as OCCURRENCES, not as matches, so the five accounting figures in
  // the report add up to `totalOccurrences`.
  let accountedByCatalog = 0;
  let accountedByHost = 0;
  let accountedByExclusion = 0;
  let accountedByNamespace = 0;
  let residualOccurrences = 0;
  let at = lower.indexOf(BRAND_WORD);
  while (at >= 0) {
    total++;
    if (consumed[at]) {
      accountedByCatalog++;
    } else {
      const { run, start } = runAround(code, at);
      const namespace = literals.find(candidate =>
        namespaceLiteralMatches(candidate, code, at)
      );
      if (isExcludedByHost(run, hosts)) {
        accountedByHost++;
      } else if (namespace) {
        const key = bundleNamespaceKey(namespace);
        exclusionHits[key] = (exclusionHits[key] ?? 0) + 1;
        accountedByNamespace++;
      } else {
        const token = tokenAround(code, at);
        const identifier = identifierAround(code, at);
        const record = byToken.get(token) ?? byIdentifier.get(identifier);
        const rule = record
          ? undefined
          : rules.find(candidate =>
              candidate.shape === 'token'
                ? ruleMatches(candidate, token)
                : ruleMatches(candidate, identifier)
            );
        if (record || rule) {
          const key = record
            ? bundleExclusionKey(record)
            : bundleRuleKey(rule as BundleCategoryRule);
          exclusionHits[key] = (exclusionHits[key] ?? 0) + 1;
          accountedByExclusion++;
        } else {
          residualOccurrences++;
          const existing = grouped.get(run);
          if (existing) {
            existing.count++;
          } else {
            grouped.set(run, {
              count: 1,
              firstIndex: start,
              token,
              identifier,
            });
          }
        }
      }
    }
    at = lower.indexOf(BRAND_WORD, at + 1);
  }

  const residuals: BundleResidual[] = [...grouped]
    .map(([run, v]) => ({
      run,
      count: v.count,
      firstIndex: v.firstIndex,
      token: v.token,
      identifier: v.identifier,
    }))
    .sort((a, b) => b.count - a.count || (a.run < b.run ? -1 : 1));

  return {
    chunk,
    totalOccurrences: total,
    accountedByCatalog,
    accountedByHost,
    accountedByExclusion,
    accountedByNamespace,
    exclusionHits,
    residuals,
    residualOccurrences,
  };
}

/** What the exclusion ratchet found across every emitted chunk. */
export interface BundleBaselineVerdict {
  /** Messages from `validateBundleBaseline`. Any one of these fails a build. */
  readonly invalid: readonly string[];
  /** Records and rules that matched nothing. Each fails a build. */
  readonly obsolete: readonly string[];
  /**
   * Namespace literals that matched more often than they record. Each fails a
   * build, because that list is the only one whose key can reach a one-word
   * string, so its count is a cap rather than a note.
   */
  readonly overflow: readonly string[];
  /** Records whose measured count moved. Reported, never fatal. */
  readonly drift: readonly string[];
  /** Total occurrences the list admitted. */
  readonly admitted: number;
}

/**
 * The ratchet. A record or a rule that matched nothing in the whole bundle is
 * obsolete, and it fails the build until somebody removes it. Without this
 * rule the list would rot into a permanent exemption, which is the failure
 * mode the gate exists to prevent.
 *
 * The ratchet is on presence, not on count. A count that moved is printed and
 * is not fatal, because keying a failure on an occurrence count would fire on
 * any dependency bump that added one CSS selector.
 */
export function evaluateBundleBaseline(
  results: readonly BundleScanResult[],
  exclusions: readonly BundleExclusion[] = BUNDLE_EXCLUSIONS,
  rules: readonly BundleCategoryRule[] = BUNDLE_CATEGORY_RULES,
  literals: readonly BundleNamespaceLiteral[] = BUNDLE_NAMESPACE_LITERALS
): BundleBaselineVerdict {
  const invalid = validateBundleBaseline(exclusions, rules, literals);

  const totals = new Map<string, number>();
  for (const exclusion of exclusions) {
    totals.set(bundleExclusionKey(exclusion), 0);
  }
  for (const rule of rules) {
    totals.set(bundleRuleKey(rule), 0);
  }
  for (const literal of literals) {
    totals.set(bundleNamespaceKey(literal), 0);
  }
  for (const result of results) {
    for (const [key, hits] of Object.entries(result.exclusionHits)) {
      totals.set(key, (totals.get(key) ?? 0) + hits);
    }
  }

  const obsolete: string[] = [];
  const overflow: string[] = [];
  const drift: string[] = [];
  let admitted = 0;
  for (const exclusion of exclusions) {
    const key = bundleExclusionKey(exclusion);
    const found = totals.get(key) ?? 0;
    admitted += found;
    if (found === 0) {
      obsolete.push(
        `BUNDLE_RATCHET_FAIL: exclusion "${key}" matched nothing in the emitted bundle. ` +
          `It was recorded against ${BUNDLE_BASELINE_COMMIT} on ${BUNDLE_BASELINE_DATE} with ${exclusion.count} occurrences. ` +
          'Delete it from BUNDLE_EXCLUSIONS. The list can only shrink.'
      );
    } else if (found !== exclusion.count) {
      drift.push(
        `  drift  ${key}: recorded ${exclusion.count}, found ${found}. Update the count when you next touch this record.`
      );
    }
  }
  for (const rule of rules) {
    const key = bundleRuleKey(rule);
    const found = totals.get(key) ?? 0;
    admitted += found;
    if (found === 0) {
      obsolete.push(
        `BUNDLE_RATCHET_FAIL: rule "${key}" matched nothing in the emitted bundle. ` +
          `It was recorded against ${BUNDLE_BASELINE_COMMIT} on ${BUNDLE_BASELINE_DATE} with ${rule.count} occurrences. ` +
          'Delete it from BUNDLE_CATEGORY_RULES. The list can only shrink.'
      );
    } else if (found !== rule.count) {
      drift.push(
        `  drift  ${key}: recorded ${rule.count}, found ${found}. Update the count when you next touch this rule.`
      );
    }
  }
  for (const literal of literals) {
    const key = bundleNamespaceKey(literal);
    const found = totals.get(key) ?? 0;
    admitted += found;
    if (found === 0) {
      obsolete.push(
        `BUNDLE_RATCHET_FAIL: namespace literal "${key}" matched nothing in the emitted bundle. ` +
          `It was recorded on ${BUNDLE_BASELINE_DATE} with ${literal.count} occurrences at ${literal.site}. ` +
          'Delete it from BUNDLE_NAMESPACE_LITERALS. The list can only shrink.'
      );
    } else if (found > literal.count) {
      // A CAP, NOT A DRIFT NOTE. This is the only key short enough to reach a
      // one-word string, so an extra match is exactly the case where copy
      // could be absorbed without anybody seeing it. Fail, and make a human
      // look at the new occurrence.
      overflow.push(
        `BUNDLE_CAP_FAIL: namespace literal "${key}" records ${literal.count} occurrences at ${literal.site} but matched ${found}. ` +
          'This list names one whole string equal to the bare brand word, so its count is a cap. ' +
          'Check whether the new occurrence is copy before you raise it.'
      );
    } else if (found < literal.count) {
      drift.push(
        `  drift  ${key}: recorded ${literal.count}, found ${found}. Lower the count when you next touch this record.`
      );
    }
  }

  return { invalid, obsolete, overflow, drift, admitted };
}

/**
 * Throw when the exclusion list is invalid or has gone stale. The plugin calls
 * this on every build, in both report mode and strict mode, because the health
 * of this list does not depend on how far the rebrand has got.
 */
export function assertBundleBaselineHealth(
  results: readonly BundleScanResult[],
  exclusions: readonly BundleExclusion[] = BUNDLE_EXCLUSIONS,
  rules: readonly BundleCategoryRule[] = BUNDLE_CATEGORY_RULES,
  literals: readonly BundleNamespaceLiteral[] = BUNDLE_NAMESPACE_LITERALS
): BundleBaselineVerdict {
  const verdict = evaluateBundleBaseline(results, exclusions, rules, literals);
  const fatal = [...verdict.invalid, ...verdict.obsolete, ...verdict.overflow];
  if (fatal.length > 0) {
    throw new Error(
      `psiphon-brand: the bundle exclusion list in bundleBaseline.ts is not healthy.\n${fatal.join('\n')}`
    );
  }
  return verdict;
}

export function formatBundleReport(
  results: readonly BundleScanResult[],
  strict: boolean,
  sampleSize = 25,
  verdict?: BundleBaselineVerdict
): string {
  const lines: string[] = [];
  lines.push('=== Psiphon brand gate, layer 2 (emitted bundle) ===');
  lines.push(
    `mode: ${strict ? 'STRICT (throws)' : 'REPORT (source baseline is not empty yet)'}`
  );
  for (const result of results) {
    lines.push(
      `${result.chunk}: ${result.totalOccurrences} occurrences, ${result.accountedByCatalog} accounted by catalog, ${result.accountedByHost} accounted by an excluded host, ${result.accountedByExclusion} accounted by the bundle exclusion list, ${result.accountedByNamespace} accounted by a namespace literal, ${result.residualOccurrences} unaccounted in ${result.residuals.length} distinct runs`
    );
    for (const residual of result.residuals.slice(0, sampleSize)) {
      lines.push(
        `  x${String(residual.count).padStart(4)}  ${JSON.stringify(residual.run.slice(0, 100))}  token=${JSON.stringify(residual.token)}`
      );
    }
    if (result.residuals.length > sampleSize) {
      lines.push(`  ... and ${result.residuals.length - sampleSize} more runs`);
    }
  }
  if (verdict) {
    lines.push(
      `bundle exclusion list (${BUNDLE_BASELINE_COMMIT}, ${BUNDLE_BASELINE_DATE}): ${BUNDLE_EXCLUSIONS.length} records, ${BUNDLE_CATEGORY_RULES.length} rules and ${BUNDLE_NAMESPACE_LITERALS.length} namespace literals admitted ${verdict.admitted} occurrences`
    );
    lines.push(...verdict.drift);
  }
  return lines.join('\n');
}
