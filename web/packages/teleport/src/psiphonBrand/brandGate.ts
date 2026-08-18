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
 * Layer 1 of the brand gate. It reads source, needs no build, and runs on every
 * test run. It measures the wrong artefact and ADR 0007 states that cost
 * rather than hiding it: it cannot see a phrase that only exists after
 * composition. Layer 2, in `bundleGate.ts`, reads what ships.
 *
 * This module never runs in a browser. Only `brandGate.test.ts` imports it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import {
  BRAND_AREAS,
  BRAND_BASELINE_BY_AREA,
  BRAND_CATALOG,
  BRAND_ENTRIES_BY_AREA,
  EXCLUDED_HOSTS,
  PROTOCOL_ENTRIES,
  isBareBrandWord,
  isWholeNodeEntry,
  type BrandArea,
  type BrandBaselineEntry,
  type BrandPhrase,
  type ExcludedHost,
} from './brandCatalog';
import {
  matchNode,
  orderMatchRules,
  visitNodes,
  type VisitedNode,
} from './brandMatcher';

/** Repository root, five levels above this directory. */
export const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

/**
 * The scan set roots. `web/packages/shared` HAS NO `src` DIRECTORY, so the
 * package directory itself is the root.
 */
export const SCAN_ROOTS: readonly string[] = [
  'web/packages/teleport/src',
  'web/packages/design/src',
  'web/packages/shared',
];

const EXCLUDED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '__snapshots__',
  'dist',
  'build',
]);

/** True when a repository-relative path belongs to the scan set. */
export function isScanned(relativePath: string): boolean {
  const posix = relativePath.split(sep).join('/');
  if (!SCAN_ROOTS.some(root => posix.startsWith(root + '/'))) {
    return false;
  }
  if (!posix.endsWith('.ts') && !posix.endsWith('.tsx')) {
    return false;
  }
  if (posix.endsWith('.d.ts')) {
    return false;
  }
  if (/\.test\.tsx?$/.test(posix) || /\.story\.tsx?$/.test(posix)) {
    return false;
  }
  if (posix.split('/').some(part => EXCLUDED_DIRECTORY_NAMES.has(part))) {
    return false;
  }
  // Generated wasm bindings. Absent from a fresh worktree, present after a
  // build, and never copy either way.
  if (posix.includes('/libs/ironrdp/pkg/')) {
    return false;
  }
  // The catalog and the gate hold the phrases as data. Scanning them would
  // count every catalog entry as an occurrence of itself.
  if (posix.includes('/psiphonBrand/')) {
    return false;
  }
  return true;
}

/** Every file in the scan set, repository-relative, sorted. */
export function collectScanSet(root: string = REPO_ROOT): string[] {
  const out: string[] = [];
  const walk = (absolute: string) => {
    let names: string[];
    try {
      names = readdirSync(absolute);
    } catch {
      return;
    }
    for (const name of names) {
      const child = join(absolute, name);
      let stats;
      try {
        stats = statSync(child);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        if (!EXCLUDED_DIRECTORY_NAMES.has(name)) {
          walk(child);
        }
        continue;
      }
      const rel = relative(root, child);
      if (isScanned(rel)) {
        out.push(rel.split(sep).join('/'));
      }
    }
  };
  for (const scanRoot of SCAN_ROOTS) {
    walk(join(root, scanRoot));
  }
  return out.sort();
}

/**
 * Which area owns a file. The mapping is by path and is deliberately total: a
 * file that matches no rule belongs to `account-support`, so a phrase can never
 * fall outside every leaf. The rules are ordered and the first match wins.
 */
const AREA_RULES: ReadonlyArray<{ area: BrandArea; test: RegExp }> = [
  { area: 'discover-enrolment', test: /\/Discover\// },
  {
    area: 'integrations-aws',
    test: /\/(Integrations|IntegrationEnroll)\/|\/services\/integrations\//,
  },
  {
    area: 'bots-workload-identity',
    test: /\/(Bots|BotInstances|WorkloadIdentity|MachineId)\/|\/services\/(bot|joinToken)\//,
  },
  {
    area: 'roles-users-tokens',
    test: /\/(Roles|Users|JoinTokens|AccessRequests|AccessLists|AccessMonitoring|Locks|TrustedClusters)\/|\/services\/(resources|user|accessRequests)\//,
  },
  {
    area: 'audit-sessions-recordings',
    test: /\/(Audit|Sessions|Recordings|Player|Console|Desktops|DesktopSession)\/|\/services\/(audit|recordings|session)\//,
  },
  {
    area: 'navigation-empty-dialogs',
    test: /\/(Navigation|Empty|Dialogs|Main|TopBar|Welcome|Login|Support|Assist|components|UnifiedResources)\/|^web\/packages\/design\/|^web\/packages\/shared\//,
  },
];

export function areaForPath(relativePath: string): BrandArea {
  const posix = '/' + relativePath.split(sep).join('/');
  for (const rule of AREA_RULES) {
    if (rule.test.test(posix.slice(1)) || rule.test.test(posix)) {
      return rule.area;
    }
  }
  return 'account-support';
}

/** Where one match or one residual was found. */
export interface PhraseSite {
  readonly file: string;
  readonly line: number;
  readonly kind: VisitedNode['kind'];
}

/** Per-entry outcome. */
export interface EntryResult {
  readonly entry: BrandPhrase;
  readonly found: number;
  readonly sites: readonly PhraseSite[];
  readonly verdict: 'PASS' | 'COUNT_MISMATCH' | 'DEAD_ENTRY';
  readonly failureMessage?: string;
}

/** One unaccounted phrase, keyed on the whole visited node text. */
export interface ResidualPhrase {
  readonly source: string;
  readonly count: number;
  readonly area: BrandArea;
  readonly sites: readonly PhraseSite[];
}

/** Per-baseline-entry outcome. */
export interface BaselineResult {
  readonly area: BrandArea;
  readonly entry: BrandBaselineEntry;
  readonly found: number;
  readonly verdict: 'BASELINE' | 'RATCHET_FAIL' | 'COUNT_MISMATCH';
  readonly failureMessage?: string;
}

export interface BrandGateEvaluation {
  readonly fileCount: number;
  readonly nodeCount: number;
  readonly entryResults: readonly EntryResult[];
  readonly baselineResults: readonly BaselineResult[];
  readonly residuals: readonly ResidualPhrase[];
  readonly invalidEntries: readonly string[];
  readonly countMismatches: readonly string[];
  readonly deadEntries: readonly string[];
  readonly unknownPhrases: readonly string[];
  readonly ratchetFailures: readonly string[];
  readonly counts: {
    readonly catalogEntries: number;
    readonly baselineEntries: number;
    readonly pass: number;
    readonly invalidEntry: number;
    readonly countMismatch: number;
    readonly deadEntry: number;
    readonly unknownPhrase: number;
    readonly ratchetFail: number;
    readonly baselined: number;
  };
}

/**
 * Step 1 of the algorithm. Validate the catalog before reading a file, so a
 * malformed entry never reaches the scanner.
 */
export function validateCatalog(
  catalog: readonly BrandPhrase[]
): readonly string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  catalog.forEach((entry, index) => {
    const label = `entry ${index} (${JSON.stringify(entry.source.slice(0, 60))})`;
    if (entry.source.length === 0) {
      problems.push(`INVALID_ENTRY: ${label} has an empty source.`);
    }
    const previous = seen.get(entry.source);
    if (previous !== undefined) {
      problems.push(
        `INVALID_ENTRY: ${label} duplicates the source of entry ${previous}. A source is the catalog key and must be unique.`
      );
    } else {
      seen.set(entry.source, index);
    }
    if (!Number.isInteger(entry.count) || entry.count < 1) {
      problems.push(
        `INVALID_ENTRY: ${label} declares count ${entry.count}. The format requires an integer count >= 1.`
      );
    }
    if (entry.immutable !== (entry.replacement === entry.source)) {
      problems.push(
        `INVALID_ENTRY: ${label} sets immutable=${entry.immutable} but replacement ${entry.replacement === entry.source ? 'equals' : 'differs from'} source. The two must agree.`
      );
    }
    if (entry.tier === 'protocol' && !entry.immutable) {
      problems.push(
        `INVALID_ENTRY: ${label} is protocol tier and must be immutable.`
      );
    }
    if (entry.reason.trim().length === 0) {
      problems.push(`INVALID_ENTRY: ${label} has an empty reason.`);
    }
    // The narrowed bare-word ban. ADR 0007 decision 2 forbids the bare word as
    // a catalog source because a SUBSTRING rewrite of it would corrupt an
    // identifier, an import path and a documentation link. A whole-node exact
    // match cannot reach any of those, because the whole visited node is the
    // word and nothing else. So the ban narrows to the substring mode, and it
    // stays absolute there.
    if (isBareBrandWord(entry.source) && !isWholeNodeEntry(entry)) {
      problems.push(
        `INVALID_ENTRY: ${label} is the bare brand word under substring matching. ADR 0007 decision 2 forbids that, because a substring rewrite of the bare word reaches inside an identifier, an import path and a documentation link. Declare match: 'wholeNode' to key the entry on a node that holds the word and nothing else.`
      );
    }
  });
  return problems;
}

function truncate(text: string, max = 120): string {
  return text.length <= max ? text : text.slice(0, max) + '...';
}

/** The verdict when step 1 already failed and no file was read. */
function emptyEvaluation(
  catalog: readonly BrandPhrase[],
  baselineByArea: Readonly<Record<BrandArea, readonly BrandBaselineEntry[]>>,
  invalidEntries: readonly string[]
): BrandGateEvaluation {
  return {
    fileCount: 0,
    nodeCount: 0,
    entryResults: [],
    baselineResults: [],
    residuals: [],
    invalidEntries,
    countMismatches: [],
    deadEntries: [],
    unknownPhrases: [],
    ratchetFailures: [],
    counts: {
      catalogEntries: catalog.length,
      baselineEntries: BRAND_AREAS.reduce(
        (n, area) => n + baselineByArea[area].length,
        0
      ),
      pass: 0,
      invalidEntry: invalidEntries.length,
      countMismatch: 0,
      deadEntry: 0,
      unknownPhrase: 0,
      ratchetFail: 0,
      baselined: 0,
    },
  };
}

/**
 * Run layer 1. Pass a catalog and a baseline to exercise a failure mode.
 */
export function evaluateBrandGate(
  catalog: readonly BrandPhrase[] = BRAND_CATALOG,
  baselineByArea: Readonly<
    Record<BrandArea, readonly BrandBaselineEntry[]>
  > = BRAND_BASELINE_BY_AREA,
  hosts: readonly ExcludedHost[] = EXCLUDED_HOSTS,
  root: string = REPO_ROOT
): BrandGateEvaluation {
  const invalidEntries = validateCatalog(catalog);
  if (invalidEntries.length > 0) {
    // ADR 0007 step 1: validate the catalog BEFORE reading a file. Stopping
    // here also keeps the report readable when an entry is one the rule builder
    // refuses to construct, such as the bare word under substring matching.
    // `orderMatchRules` throws on that entry, and a throw would report one
    // problem where the gate exists to report all of them.
    return emptyEvaluation(catalog, baselineByArea, invalidEntries);
  }
  // The baseline joins the same longest-match-first ordering as the catalog.
  // ADR 0007 amendment 4. Without this a short catalog entry in one leaf
  // consumes a region inside a longer phrase baselined in a different leaf, and
  // the gate raises RATCHET_FAIL against a leaf whose author never touched it.
  const flatBaseline = BRAND_AREAS.flatMap(area => [...baselineByArea[area]]);
  const sorted = orderMatchRules(catalog, flatBaseline);

  const files = collectScanSet(root);
  const foundByEntry = new Map<string, PhraseSite[]>();
  for (const entry of catalog) {
    foundByEntry.set(entry.source, []);
  }
  const residualsByText = new Map<
    string,
    { area: BrandArea; sites: PhraseSite[] }
  >();
  let nodeCount = 0;

  for (const file of files) {
    const code = readFileSync(join(root, file), 'utf8');
    if (!/teleport/i.test(code)) {
      continue;
    }
    const nodes = visitNodes(code, file);
    nodeCount += nodes.length;
    const area = areaForPath(file);
    for (const node of nodes) {
      const { regions, residuals } = matchNode(node, sorted, hosts);
      for (const region of regions) {
        foundByEntry
          .get(region.entry.source)
          ?.push({ file, line: node.line, kind: node.kind });
      }
      if (residuals.length > 0) {
        const key = node.matchText;
        const bucket = residualsByText.get(key) ?? { area, sites: [] };
        bucket.sites.push({ file, line: node.line, kind: node.kind });
        residualsByText.set(key, bucket);
      }
    }
  }

  const entryResults: EntryResult[] = [];
  const countMismatches: string[] = [];
  const deadEntries: string[] = [];
  let pass = 0;
  for (const entry of catalog) {
    const sites = foundByEntry.get(entry.source) ?? [];
    const found = sites.length;
    if (found === 0) {
      const failureMessage = `DEAD_ENTRY: catalog entry ${JSON.stringify(truncate(entry.source))} matches nothing in the scan set. Remove it or fix it.`;
      deadEntries.push(failureMessage);
      entryResults.push({
        entry,
        found,
        sites,
        verdict: 'DEAD_ENTRY',
        failureMessage,
      });
      continue;
    }
    if (found !== entry.count) {
      const where = sites.map(formatSiteWithArea).join(', ');
      const failureMessage = `COUNT_MISMATCH: catalog entry ${JSON.stringify(truncate(entry.source))} expects count ${entry.count} but the scanner found ${found}. Sites: ${where}.`;
      countMismatches.push(failureMessage);
      entryResults.push({
        entry,
        found,
        sites,
        verdict: 'COUNT_MISMATCH',
        failureMessage,
      });
      continue;
    }
    pass++;
    entryResults.push({ entry, found, sites, verdict: 'PASS' });
  }

  const catalogSources = new Set(catalog.map(e => e.source));
  const baselineResults: BaselineResult[] = [];
  const ratchetFailures: string[] = [];
  const baselineSources = new Set<string>();
  let baselined = 0;
  for (const area of BRAND_AREAS) {
    for (const entry of baselineByArea[area]) {
      baselineSources.add(entry.source);
      const bucket = residualsByText.get(entry.source);
      const found = bucket ? bucket.sites.length : 0;
      if (catalogSources.has(entry.source)) {
        const failureMessage = `RATCHET_FAIL: baselined phrase ${JSON.stringify(truncate(entry.source))} in area "${area}" is now a catalog entry. Remove it from ${area.toUpperCase().replace(/-/g, '_')}_BASELINE.`;
        ratchetFailures.push(failureMessage);
        baselineResults.push({
          area,
          entry,
          found,
          verdict: 'RATCHET_FAIL',
          failureMessage,
        });
        continue;
      }
      if (found === 0) {
        const failureMessage = `RATCHET_FAIL: baselined phrase ${JSON.stringify(truncate(entry.source))} in area "${area}" no longer appears in the scan set. Remove it from ${area.toUpperCase().replace(/-/g, '_')}_BASELINE.`;
        ratchetFailures.push(failureMessage);
        baselineResults.push({
          area,
          entry,
          found,
          verdict: 'RATCHET_FAIL',
          failureMessage,
        });
        continue;
      }
      if (found !== entry.count) {
        const where = bucket?.sites.map(formatSiteWithArea).join(', ') ?? '';
        const failureMessage = `COUNT_MISMATCH: baselined phrase ${JSON.stringify(truncate(entry.source))} in area "${area}" expects count ${entry.count} but the scanner found ${found}. Sites: ${where}. Upstream changed how often this phrase appears, so a human must look at the new site.`;
        countMismatches.push(failureMessage);
        baselineResults.push({
          area,
          entry,
          found,
          verdict: 'COUNT_MISMATCH',
          failureMessage,
        });
        continue;
      }
      baselined++;
      baselineResults.push({ area, entry, found, verdict: 'BASELINE' });
    }
  }

  const residuals: ResidualPhrase[] = [];
  const unknownPhrases: string[] = [];
  for (const [source, bucket] of [...residualsByText].sort((a, b) =>
    a[0] < b[0] ? -1 : 1
  )) {
    residuals.push({
      source,
      count: bucket.sites.length,
      area: bucket.area,
      sites: bucket.sites,
    });
    if (!baselineSources.has(source)) {
      const where = bucket.sites.map(s => `${s.file}:${s.line}`).join(', ');
      unknownPhrases.push(
        `UNKNOWN_PHRASE: ${JSON.stringify(truncate(source))} holds the brand word, no catalog entry covers it, and no excluded host explains it. Area "${bucket.area}". Sites: ${where}. Add a catalog entry, or add a baseline entry to the "${bucket.area}" leaf.`
      );
    }
  }

  return {
    fileCount: files.length,
    nodeCount,
    entryResults,
    baselineResults,
    residuals,
    invalidEntries,
    countMismatches,
    deadEntries,
    unknownPhrases,
    ratchetFailures,
    counts: {
      catalogEntries: catalog.length,
      baselineEntries: BRAND_AREAS.reduce(
        (n, area) => n + baselineByArea[area].length,
        0
      ),
      pass,
      invalidEntry: invalidEntries.length,
      countMismatch: countMismatches.length,
      deadEntry: deadEntries.length,
      unknownPhrase: unknownPhrases.length,
      ratchetFail: ratchetFailures.length,
      baselined,
    },
  };
}

function formatSiteWithArea(site: PhraseSite): string {
  return `${site.file}:${site.line} [${areaForPath(site.file)}]`;
}

function catalogOwner(
  source: string
): BrandArea | 'protocol-machinery' | 'unassigned' {
  for (const area of BRAND_AREAS) {
    if (BRAND_ENTRIES_BY_AREA[area].some(entry => entry.source === source)) {
      return area;
    }
  }
  if (PROTOCOL_ENTRIES.some(entry => entry.source === source)) {
    return 'protocol-machinery';
  }
  return 'unassigned';
}

function crossAreaLines(evaluation: BrandGateEvaluation): string[] {
  const rows: Array<{
    kind: 'baseline' | 'catalog';
    owner: BrandArea | 'protocol-machinery' | 'unassigned';
    source: string;
    sites: readonly PhraseSite[];
  }> = [];

  for (const result of evaluation.entryResults) {
    rows.push({
      kind: 'catalog',
      owner: catalogOwner(result.entry.source),
      source: result.entry.source,
      sites: result.sites,
    });
  }
  for (const result of evaluation.baselineResults) {
    const residual = evaluation.residuals.find(
      candidate => candidate.source === result.entry.source
    );
    rows.push({
      kind: 'baseline',
      owner: result.area,
      source: result.entry.source,
      sites: residual?.sites ?? [],
    });
  }

  const lines: string[] = [];
  for (const row of rows
    .filter(
      row => new Set(row.sites.map(site => areaForPath(site.file))).size > 1
    )
    .sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source)
    )) {
    lines.push(
      `${row.kind} owner=${row.owner} total=${row.sites.length} source=${JSON.stringify(row.source)}`
    );
    for (const area of BRAND_AREAS) {
      const sites = row.sites.filter(site => areaForPath(site.file) === area);
      if (sites.length === 0) {
        continue;
      }
      lines.push(
        `  ${area} x${sites.length}: ${sites.map(site => `${site.file}:${site.line}`).join(', ')}`
      );
    }
  }
  return lines;
}

export function formatBrandReport(evaluation: BrandGateEvaluation): string {
  const lines: string[] = [];
  lines.push('=== Psiphon brand gate, layer 1 (source) ===');
  lines.push(`files scanned:      ${evaluation.fileCount}`);
  lines.push(`nodes visited:      ${evaluation.nodeCount}`);
  lines.push(`catalog entries:    ${evaluation.counts.catalogEntries}`);
  lines.push(`  pass:             ${evaluation.counts.pass}`);
  lines.push(`  count mismatch:   ${evaluation.counts.countMismatch}`);
  lines.push(`  dead:             ${evaluation.counts.deadEntry}`);
  lines.push(`  invalid:          ${evaluation.counts.invalidEntry}`);
  lines.push(`baseline entries:   ${evaluation.counts.baselineEntries}`);
  lines.push(`  admitted:         ${evaluation.counts.baselined}`);
  lines.push(`  ratchet failures: ${evaluation.counts.ratchetFail}`);
  lines.push(`unknown phrases:    ${evaluation.counts.unknownPhrase}`);
  lines.push('--- per area ---');
  for (const area of BRAND_AREAS) {
    const entries = BRAND_ENTRIES_BY_AREA[area].length;
    const baseline = evaluation.baselineResults.filter(
      r => r.area === area
    ).length;
    lines.push(
      `${area.padEnd(28)} entries=${String(entries).padStart(4)} baseline=${String(baseline).padStart(4)}`
    );
  }
  lines.push('--- cross-area ownership and sites ---');
  const crossArea = crossAreaLines(evaluation);
  lines.push(...(crossArea.length > 0 ? crossArea : ['none']));
  for (const message of [
    ...evaluation.invalidEntries,
    ...evaluation.deadEntries,
    ...evaluation.countMismatches,
    ...evaluation.ratchetFailures,
    ...evaluation.unknownPhrases,
  ]) {
    lines.push(message);
  }
  return lines.join('\n');
}
