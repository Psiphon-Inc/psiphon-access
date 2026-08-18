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
 * The matcher. It parses a module, visits only the nodes that can hold copy,
 * matches catalog entries longest source first, reports residual occurrences,
 * and produces the byte edits that rewrite a match in place.
 *
 * Both readers use this module. `brandGate.ts` uses it to decide the jest gate.
 * `brandPlugin.ts` uses it to rewrite a module during the vite build. They
 * therefore always agree on what matched and on what counts.
 */

import { parse } from '@babel/parser';

import {
  BRAND_BASELINE,
  BRAND_WORD,
  EXCLUDED_HOSTS,
  isBareBrandWord,
  isWholeNodeEntry,
  type BrandBaselineEntry,
  type BrandPhrase,
  type ExcludedHost,
} from './brandCatalog';

/** Kind of node the scanner visits. Nothing else is ever visited. */
export type VisitedKind = 'string' | 'template' | 'jsxText';

/** A `${...}` span inside a template, in `raw` coordinates. */
export interface ExpressionSpan {
  readonly start: number;
  readonly end: number;
}

/** One visited node, with everything the matcher and the rewriter need. */
export interface VisitedNode {
  readonly kind: VisitedKind;
  /** Exact source text of the node content, with no delimiter. */
  readonly raw: string;
  /** Absolute offset in the module of `raw[0]`. */
  readonly rawStart: number;
  /** Text the matcher compares. Equal to `raw` unless the kind is jsxText. */
  readonly matchText: string;
  /**
   * `indexMap[i]` is the `raw` offset of `matchText[i]`. It has length
   * `matchText.length + 1`, and the last element is the exclusive end.
   */
  readonly indexMap: readonly number[];
  /** `'` or `"` for a string, '`' for a template, '' for JSX text. */
  readonly delimiter: string;
  /** Template expression spans, in `raw` coordinates. Empty otherwise. */
  readonly expressionSpans: readonly ExpressionSpan[];
  /** 1-based line of the node start. */
  readonly line: number;
}

/** A catalog entry matched inside one visited node, in `matchText` coordinates. */
export interface MatchRegion {
  readonly entry: BrandPhrase;
  readonly start: number;
  readonly end: number;
}

/**
 * A baselined phrase matched inside one visited node, in `matchText`
 * coordinates. A shield consumes its region and rewrites nothing.
 */
export interface ShieldRegion {
  readonly source: string;
  readonly start: number;
  readonly end: number;
}

/** A catalog entry, as one rule in the match ordering. */
export interface CatalogRule {
  readonly kind: 'catalog';
  readonly source: string;
  /** True when the rule matches only a node whose whole text is the source. */
  readonly whole: boolean;
  readonly entry: BrandPhrase;
}

/** A baselined phrase, as one rule in the match ordering. */
export interface BaselineRule {
  readonly kind: 'baseline';
  readonly source: string;
  /** Always false. A baseline rule shields a region inside a node. */
  readonly whole: false;
}

/**
 * One rule in the match ordering. A catalog rule can be rewritten. A baseline
 * rule only consumes, so a shorter catalog entry cannot reach inside a phrase
 * that another leaf has baselined.
 */
export type MatchRule = CatalogRule | BaselineRule;

/** An occurrence of the brand word that no catalog entry consumed. */
export interface ResidualOccurrence {
  /** Offset in `matchText`. */
  readonly index: number;
  /** The surrounding run of non-whitespace, non-quote characters. */
  readonly run: string;
}

/** The result of matching one visited node. */
export interface NodeMatchResult {
  readonly regions: readonly MatchRegion[];
  /** Regions a baselined phrase took. Never rewritten, never a residual. */
  readonly shields: readonly ShieldRegion[];
  readonly residuals: readonly ResidualOccurrence[];
}

/** A byte edit against the module text. */
export interface BrandEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const WALK_SKIP_KEYS = new Set([
  'loc',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'extra',
  'tokens',
  'comments',
]);

/**
 * Node types the walker refuses to descend into, because nothing inside them
 * is copy and rewriting inside them would break the module.
 */
const WALK_SKIP_TYPES = new Set([
  // An import or export path is a module specifier, never copy.
  'ImportDeclaration',
  'ExportAllDeclaration',
  'ExportNamedDeclaration',
  'TSImportType',
  'TSImportEqualsDeclaration',
  // Type space. A string literal type is a type, not copy.
  'TSLiteralType',
  'TSTypeReference',
  'TSTypeQuery',
  'TSModuleDeclaration',
]);

function isNode(value: unknown): value is { type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function parseModule(code: string, filePath: string) {
  const jsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
  return parse(code, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    errorRecovery: false,
    plugins: jsx ? ['typescript', 'jsx'] : ['typescript'],
  });
}

/** Collapse each run of whitespace to one space and trim both ends. */
function normaliseJsxText(raw: string): {
  text: string;
  indexMap: number[];
} {
  const chars: string[] = [];
  const indexMap: number[] = [];
  let i = 0;
  // Drop leading whitespace.
  while (i < raw.length && /\s/.test(raw[i])) {
    i++;
  }
  let lastNonSpace = -1;
  while (i < raw.length) {
    if (/\s/.test(raw[i])) {
      const runStart = i;
      while (i < raw.length && /\s/.test(raw[i])) {
        i++;
      }
      if (i < raw.length) {
        chars.push(' ');
        indexMap.push(runStart);
      }
      continue;
    }
    chars.push(raw[i]);
    indexMap.push(i);
    lastNonSpace = i;
    i++;
  }
  indexMap.push(lastNonSpace + 1);
  return { text: chars.join(''), indexMap };
}

function identityIndexMap(length: number): number[] {
  const map = new Array<number>(length + 1);
  for (let i = 0; i <= length; i++) {
    map[i] = i;
  }
  return map;
}

/**
 * Visit a module and return every node that can hold copy: a string literal, a
 * whole template expression, and a JSX text node. An identifier, an import
 * specifier, a JSX attribute name and a comment are never visited, because the
 * walker never reaches them as one of these three node types.
 *
 * A TEMPLATE IS VISITED WHOLE, NOT QUASI BY QUASI. ADR 0007 amendment 1. The
 * `${...}` spans are part of the matched text and are recorded so the rewriter
 * can leave them alone.
 */
export function visitNodes(code: string, filePath: string): VisitedNode[] {
  const ast = parseModule(code, filePath);
  const out: VisitedNode[] = [];

  const lineStarts: number[] = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }
  const lineOf = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  };

  const push = (node: VisitedNode) => {
    if (node.matchText.length > 0) {
      out.push(node);
    }
  };

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (!isNode(value)) {
      return;
    }
    const node = value as {
      type: string;
      start?: number | null;
      end?: number | null;
      quasis?: Array<{ start?: number | null; end?: number | null }>;
      [key: string]: unknown;
    };

    if (WALK_SKIP_TYPES.has(node.type)) {
      // An export declaration can hold a real declaration, so descend into the
      // declaration but never into the module specifier.
      if (node.type === 'ExportNamedDeclaration' && node.declaration) {
        walk(node.declaration);
      }
      return;
    }

    const start = node.start ?? -1;
    const end = node.end ?? -1;

    if (node.type === 'StringLiteral' && start >= 0) {
      const raw = code.slice(start + 1, end - 1);
      push({
        kind: 'string',
        raw,
        rawStart: start + 1,
        matchText: raw,
        indexMap: identityIndexMap(raw.length),
        delimiter: code[start],
        expressionSpans: [],
        line: lineOf(start),
      });
      return;
    }

    if (node.type === 'TemplateLiteral' && start >= 0) {
      const rawStart = start + 1;
      const raw = code.slice(rawStart, end - 1);
      const quasis = node.quasis ?? [];
      const spans: ExpressionSpan[] = [];
      for (let i = 0; i + 1 < quasis.length; i++) {
        const spanStart = (quasis[i].end ?? 0) - rawStart;
        const spanEnd = (quasis[i + 1].start ?? 0) - rawStart;
        if (spanEnd > spanStart) {
          spans.push({ start: spanStart, end: spanEnd });
        }
      }
      push({
        kind: 'template',
        raw,
        rawStart,
        matchText: raw,
        indexMap: identityIndexMap(raw.length),
        delimiter: '`',
        expressionSpans: spans,
        line: lineOf(start),
      });
      // Descend into the expressions, which can hold their own literals.
      walk(node.expressions);
      return;
    }

    if (node.type === 'JSXText' && start >= 0) {
      const raw = code.slice(start, end);
      const { text, indexMap } = normaliseJsxText(raw);
      push({
        kind: 'jsxText',
        raw,
        rawStart: start,
        matchText: text,
        indexMap,
        delimiter: '',
        expressionSpans: [],
        line: lineOf(start),
      });
      return;
    }

    for (const key of Object.keys(node)) {
      if (WALK_SKIP_KEYS.has(key)) {
        continue;
      }
      walk(node[key]);
    }
  };

  walk(ast.program);
  return out;
}

/**
 * Sort entries longest source first, so a shorter entry never matches inside a
 * region a longer entry already took.
 *
 * This is the entry-only ordering. `bundleGate.ts` uses it, because a bundle
 * holds replacement text and has no baseline. A reader that scans SOURCE must
 * use `orderMatchRules` instead, so the baseline joins the ordering.
 *
 * A WHOLE-NODE ENTRY IS DROPPED HERE, and that is not an exemption. A bundle is
 * one concatenated chunk with no nodes in it, so "the whole node equals the
 * source" has no meaning there and the only thing the reader could do with such
 * an entry is match it as a substring. For the bare word that is exactly the
 * rewrite ADR 0007 decision 2 forbids, and it would let one immutable entry
 * account for every occurrence of the word in the bundle at once, which would
 * hide hundreds of unaccounted phrases. An occurrence a whole-node entry covers
 * in source therefore stays unaccounted in the bundle until the bundle layer
 * grows a reader that can see a node boundary.
 */
export function sortLongestFirst(
  entries: readonly BrandPhrase[]
): readonly BrandPhrase[] {
  return [...entries]
    .filter(entry => !isWholeNodeEntry(entry))
    .sort((a, b) => b.source.length - a.source.length || compareSource(a, b));
}

function compareSource(
  a: { readonly source: string },
  b: { readonly source: string }
): number {
  return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
}

/**
 * Build the match ordering over a source tree: longest source first, so a
 * shorter rule never matches inside a region a longer rule already took. Both
 * source readers call this, so both produce the same counts.
 *
 * BASELINE ENTRIES PARTICIPATE IN THE SAME ORDERING AS CATALOG ENTRIES. ADR
 * 0007 amendment 4. Without this, a short catalog entry in one leaf consumes a
 * region inside a longer phrase baselined in a DIFFERENT leaf, that phrase
 * loses its residual, and the gate raises RATCHET_FAIL against a leaf whose
 * author never touched it. The measured case is the immutable identifier
 * `teleport-kube-agent`, which sits inside the discover-enrolment baselined
 * phrase `teleport-kube-agent is already installed on the cluster`.
 *
 * A baseline rule consumes and nothing else. It is never rewritten, and it
 * never suppresses a residual, because ADR 0007 step 4 defines a residual as an
 * occurrence THAT NO CATALOG ENTRY CONSUMED. A shield that suppressed a
 * residual would let a brand-new upstream phrase through unnoticed.
 *
 * At equal source length a catalog rule sorts before a baseline rule, so a
 * phrase that is in both wins as a catalog entry and the gate can report the
 * RATCHET_FAIL that demands the baseline entry be removed.
 *
 * THIS FUNCTION IS THE CHOKE POINT FOR THE BARE-WORD BAN. Every reader that can
 * rewrite source text builds its rules here, so refusing to CONSTRUCT a
 * substring rule over the bare word is what makes the banned rule unreachable,
 * rather than merely discouraged. An entry whose source is the bare word and
 * that does not declare `match: 'wholeNode'` throws here, before a single file
 * is read.
 */
export function orderMatchRules(
  entries: readonly BrandPhrase[],
  baseline: readonly BrandBaselineEntry[] = BRAND_BASELINE
): readonly MatchRule[] {
  const rules: MatchRule[] = entries.map(entry => {
    const whole = isWholeNodeEntry(entry);
    if (!whole && isBareBrandWord(entry.source)) {
      throw new Error(
        `Brand entry ${JSON.stringify(entry.source)} is the bare brand word and does not declare match: 'wholeNode'. ` +
          'ADR 0007 decision 2 forbids a substring rule over the bare word, because it would rewrite inside an identifier, an import path and a documentation link. ' +
          "Declare match: 'wholeNode', which matches only a visited node whose entire text is the word, or key the entry on a longer phrase."
      );
    }
    return { kind: 'catalog', source: entry.source, whole, entry };
  });
  const seen = new Set<string>();
  for (const entry of baseline) {
    if (seen.has(entry.source)) {
      continue;
    }
    seen.add(entry.source);
    rules.push({ kind: 'baseline', source: entry.source, whole: false });
  }
  return rules.sort((a, b) => {
    if (b.source.length !== a.source.length) {
      return b.source.length - a.source.length;
    }
    if (a.kind !== b.kind) {
      return a.kind === 'catalog' ? -1 : 1;
    }
    return compareSource(a, b);
  });
}

function runAround(text: string, index: number): string {
  const isRunChar = (c: string) => !/[\s'"`]/.test(c);
  let lo = index;
  while (lo > 0 && isRunChar(text[lo - 1])) {
    lo--;
  }
  let hi = index;
  while (hi < text.length && isRunChar(text[hi])) {
    hi++;
  }
  return text.slice(lo, hi);
}

/** True when this occurrence sits inside a URL for an excluded host. */
export function isExcludedByHost(
  run: string,
  hosts: readonly ExcludedHost[] = EXCLUDED_HOSTS
): boolean {
  const lower = run.toLowerCase();
  return hosts.some(h => lower.includes(h.host.toLowerCase()));
}

/**
 * Match a visited node against the ordering, then report every occurrence of
 * the brand word that no CATALOG entry consumed and that no excluded host
 * explains. A baseline rule takes its region out of reach of a shorter catalog
 * rule, and it deliberately does not take the occurrence out of the residual
 * set.
 *
 * `sortedRules` must come from `orderMatchRules`.
 */
export function matchNode(
  node: VisitedNode,
  sortedRules: readonly MatchRule[],
  hosts: readonly ExcludedHost[] = EXCLUDED_HOSTS
): NodeMatchResult {
  const text = node.matchText;
  /** Taken by any rule. Decides what a later, shorter rule may still match. */
  const consumed = new Array<boolean>(text.length).fill(false);
  /** Taken by a catalog rule. Decides what counts as a residual. */
  const catalogConsumed = new Array<boolean>(text.length).fill(false);
  const regions: MatchRegion[] = [];
  const shields: ShieldRegion[] = [];

  for (const rule of sortedRules) {
    if (rule.source.length === 0) {
      continue;
    }
    let from = 0;
    for (;;) {
      const at = text.indexOf(rule.source, from);
      if (at < 0) {
        break;
      }
      const end = at + rule.source.length;
      // A whole-node rule matches only when the source IS the node. This is
      // what confines a bare-word entry to the 5 nodes that hold nothing else,
      // and it is why `Welcome to Teleport` is out of its reach.
      if (rule.whole && (at !== 0 || end !== text.length)) {
        from = at + 1;
        continue;
      }
      let free = true;
      for (let i = at; i < end; i++) {
        if (consumed[i]) {
          free = false;
          break;
        }
      }
      if (free) {
        for (let i = at; i < end; i++) {
          consumed[i] = true;
        }
        if (rule.kind === 'catalog') {
          for (let i = at; i < end; i++) {
            catalogConsumed[i] = true;
          }
          regions.push({ entry: rule.entry, start: at, end });
        } else {
          shields.push({ source: rule.source, start: at, end });
        }
      }
      from = at + 1;
    }
  }

  const residuals: ResidualOccurrence[] = [];
  const lower = text.toLowerCase();
  let at = lower.indexOf(BRAND_WORD);
  while (at >= 0) {
    if (!catalogConsumed[at]) {
      const run = runAround(text, at);
      if (!isExcludedByHost(run, hosts)) {
        residuals.push({ index: at, run });
      }
    }
    at = lower.indexOf(BRAND_WORD, at + 1);
  }

  regions.sort((a, b) => a.start - b.start);
  shields.sort((a, b) => a.start - b.start);
  return { regions, shields, residuals };
}

/** Escape a replacement so it is safe inside the node it lands in. */
function escapeForNode(node: VisitedNode, text: string): string {
  if (node.kind === 'jsxText') {
    if (/[<>{}]/.test(text)) {
      throw new Error(
        `Brand replacement for a JSX text node must not contain <, >, { or }: ${JSON.stringify(text)}`
      );
    }
    return text;
  }
  let out = text.replace(/\\/g, '\\\\');
  if (node.kind === 'template') {
    out = out.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return out;
  }
  out = out.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  if (node.delimiter === "'") {
    return out.replace(/'/g, "\\'");
  }
  return out.replace(/"/g, '\\"');
}

/**
 * Turn one matched region into byte edits against the module text.
 *
 * For a template the region is split on the `${...}` spans it covers, and only
 * the quasi parts are rewritten. An expression span holds code, never copy, so
 * the rewriter never touches one. The replacement must therefore carry the same
 * expression spans, in the same order, as the source.
 */
export function editsForRegion(
  node: VisitedNode,
  region: MatchRegion
): BrandEdit[] {
  const { entry } = region;
  if (entry.replacement === entry.source) {
    return [];
  }

  const rawStart = node.indexMap[region.start];
  const rawEnd = node.indexMap[region.end];
  const absolute = (offset: number) => node.rawStart + offset;

  if (node.kind !== 'template') {
    return [
      {
        start: absolute(rawStart),
        end: absolute(rawEnd),
        text: escapeForNode(node, entry.replacement),
      },
    ];
  }

  const covered = node.expressionSpans.filter(
    span => span.end > rawStart && span.start < rawEnd
  );
  for (const span of covered) {
    if (span.start < rawStart || span.end > rawEnd) {
      throw new Error(
        `Brand entry ${JSON.stringify(entry.source)} matches across only part of a template expression span. Widen the entry to cover the whole \${...} span.`
      );
    }
  }

  const sourceSegments: Array<{ start: number; end: number }> = [];
  let cursor = rawStart;
  const expressionTexts: string[] = [];
  for (const span of covered) {
    sourceSegments.push({ start: cursor, end: span.start });
    expressionTexts.push(node.raw.slice(span.start, span.end));
    cursor = span.end;
  }
  sourceSegments.push({ start: cursor, end: rawEnd });

  // Split the replacement on the same expression texts, in order.
  const replacementSegments: string[] = [];
  let rest = entry.replacement;
  for (const expressionText of expressionTexts) {
    const at = rest.indexOf(expressionText);
    if (at < 0) {
      throw new Error(
        `Brand entry ${JSON.stringify(entry.source)} drops the template expression ${JSON.stringify(expressionText)} from its replacement. A replacement must carry every \${...} span of its source, in the same order.`
      );
    }
    replacementSegments.push(rest.slice(0, at));
    rest = rest.slice(at + expressionText.length);
  }
  replacementSegments.push(rest);

  const edits: BrandEdit[] = [];
  for (let i = 0; i < sourceSegments.length; i++) {
    const segment = sourceSegments[i];
    const text = escapeForNode(node, replacementSegments[i]);
    if (node.raw.slice(segment.start, segment.end) === text) {
      continue;
    }
    edits.push({
      start: absolute(segment.start),
      end: absolute(segment.end),
      text,
    });
  }
  return edits;
}
