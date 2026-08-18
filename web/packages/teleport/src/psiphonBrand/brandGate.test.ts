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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  BRAND_AREAS,
  BRAND_BASELINE,
  BRAND_BASELINE_BY_AREA,
  BRAND_CATALOG,
  BRAND_ENTRIES_BY_AREA,
  EXCLUDED_HOSTS,
  PROTOCOL_ENTRIES,
  type BrandArea,
  type BrandBaselineEntry,
  type BrandPhrase,
} from './brandCatalog';
import {
  areaForPath,
  collectScanSet,
  evaluateBrandGate,
  formatBrandReport,
  isScanned,
  validateCatalog,
} from './brandGate';
import {
  editsForRegion,
  matchNode,
  orderMatchRules,
  sortLongestFirst,
  visitNodes,
} from './brandMatcher';
import { applyBrandCatalog, shouldTransform } from './brandPlugin';
import {
  formatBundleReport,
  isBundleGateStrict,
  scanBundleResidual,
} from './bundleGate';

const EMPTY_BASELINE: Record<BrandArea, readonly BrandBaselineEntry[]> = {
  'discover-enrolment': [],
  'integrations-aws': [],
  'roles-users-tokens': [],
  'bots-workload-identity': [],
  'audit-sessions-recordings': [],
  'navigation-empty-dialogs': [],
  'account-support': [],
};

/**
 * Build a throwaway repository shaped like the real one, so a mutation test
 * runs in milliseconds instead of rescanning 1600 files.
 */
function fixtureRepo(files: Record<string, string>): {
  root: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'brand-gate-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = join(root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function baselineOf(
  area: BrandArea,
  entries: BrandBaselineEntry[]
): Record<BrandArea, readonly BrandBaselineEntry[]> {
  return { ...EMPTY_BASELINE, [area]: entries };
}

/**
 * The measured cross-leaf case. The immutable identifier belongs in the
 * integrations-aws leaf. The enclosing phrase is baselined in the
 * discover-enrolment leaf, and no integrations author ever touches it.
 */
const KUBE_AGENT = 'teleport-kube-agent';
const KUBE_AGENT_PHRASE = `${KUBE_AGENT} is already installed on the cluster`;

const phrase = (over: Partial<BrandPhrase> = {}): BrandPhrase => ({
  source: 'Teleport Fixture',
  replacement: 'Psiphon Access Fixture',
  count: 1,
  tier: 'render',
  immutable: false,
  reason: 'fixture',
  ...over,
});

describe('psiphonBrand catalog shape', () => {
  // NO ASSERTION IN THIS FILE PINS AN ENTRY COUNT. A count is a one-time
  // measurement and every authoring child moves it. An assertion that pins
  // today's count is a tripwire for tomorrow's work, so each assertion below
  // pins a RELATIONSHIP that must hold at every catalog size, including the
  // empty one this machinery shipped and the full one the seven leaves reach.

  it('ships seven leaves, and both maps carry exactly those leaves', () => {
    expect(BRAND_AREAS).toHaveLength(7);
    expect(new Set(BRAND_AREAS).size).toBe(BRAND_AREAS.length);
    expect(Object.keys(BRAND_ENTRIES_BY_AREA).sort()).toEqual(
      [...BRAND_AREAS].sort()
    );
    expect(Object.keys(BRAND_BASELINE_BY_AREA).sort()).toEqual(
      [...BRAND_AREAS].sort()
    );
    for (const area of BRAND_AREAS) {
      expect(Array.isArray(BRAND_ENTRIES_BY_AREA[area])).toBe(true);
      expect(Array.isArray(BRAND_BASELINE_BY_AREA[area])).toBe(true);
    }
  });

  it('aggregates to exactly the protocol entries plus every leaf', () => {
    const leafTotal = BRAND_AREAS.reduce(
      (n, area) => n + BRAND_ENTRIES_BY_AREA[area].length,
      0
    );
    expect(BRAND_CATALOG).toHaveLength(PROTOCOL_ENTRIES.length + leafTotal);
    expect(BRAND_CATALOG).toEqual([
      ...PROTOCOL_ENTRIES,
      ...BRAND_AREAS.flatMap(area => [...BRAND_ENTRIES_BY_AREA[area]]),
    ]);

    const baselineTotal = BRAND_AREAS.reduce(
      (n, area) => n + BRAND_BASELINE_BY_AREA[area].length,
      0
    );
    expect(BRAND_BASELINE).toHaveLength(baselineTotal);
  });

  it('holds no two entries with the same source', () => {
    const sources = BRAND_CATALOG.map(e => e.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('holds only valid entries, and protocol tier always implies immutable', () => {
    expect(validateCatalog(BRAND_CATALOG)).toEqual([]);
    for (const entry of BRAND_CATALOG.filter(e => e.tier === 'protocol')) {
      expect(entry.immutable).toBe(true);
      expect(entry.replacement).toBe(entry.source);
    }
    for (const entry of BRAND_CATALOG) {
      expect(entry.immutable).toBe(entry.replacement === entry.source);
      expect(entry.count).toBeGreaterThanOrEqual(1);
      expect(entry.reason.trim()).not.toBe('');
    }
  });

  it('holds the five immutable entries and no pattern field', () => {
    expect(PROTOCOL_ENTRIES.map(e => e.source)).toEqual([
      'TeleportDatabaseAccess_${props.agentMeta.resourceName}',
      'TeleportDatabaseAccess',
      'TeleportDatabaseName',
      'Teleport-Mfa-Response',
      'X-Teleport-TokenName',
    ]);
    for (const entry of PROTOCOL_ENTRIES) {
      expect(entry.tier).toBe('protocol');
      expect(entry.immutable).toBe(true);
      expect(entry.replacement).toBe(entry.source);
      expect(typeof entry.source).toBe('string');
      expect(entry).not.toHaveProperty('pattern');
      expect(entry).not.toHaveProperty('regex');
    }
  });

  it('never holds the bare brand word as a SUBSTRING entry source', () => {
    // NARROWED on 2026-08-19, and not weakened. ADR 0007 decision 2 bans the
    // bare word because a SUBSTRING rewrite of it corrupts an identifier, an
    // import path and a documentation link. A whole-node exact match cannot
    // reach any of those, because the visited node is the word and nothing
    // else. So the ban keeps its full force in substring mode, which is the
    // mode every entry is in unless it says otherwise, and a bare-word entry
    // is legal only when it declares match: 'wholeNode'.
    for (const entry of BRAND_CATALOG) {
      if (entry.match === 'wholeNode') {
        continue;
      }
      expect(entry.source.trim().toLowerCase()).not.toBe('teleport');
    }
    for (const entry of BRAND_CATALOG.filter(
      e => e.source.trim().toLowerCase() === 'teleport'
    )) {
      expect(entry.match).toBe('wholeNode');
    }
  });

  it('rejects a bare-word entry that is allowed to match as a substring', () => {
    // The ban test above states the property. This one proves the property is
    // enforced and not merely declared, in the two places that could apply
    // such an entry: the validator, and the rule builder every rewriter uses.
    const banned = phrase({
      source: 'Teleport',
      replacement: 'Psiphon Access',
    });
    expect(validateCatalog([banned]).join('\n')).toMatch(
      /bare brand word under substring matching/
    );
    expect(() => orderMatchRules([banned], [])).toThrow(
      /does not declare match: 'wholeNode'/
    );

    // Lower case, and an entry that pads the word with whitespace, are the
    // same entry as far as the ban is concerned.
    expect(
      validateCatalog([
        phrase({
          source: 'teleport',
          replacement: 'teleport',
          immutable: true,
        }),
      ]).join('\n')
    ).toMatch(/bare brand word under substring matching/);
    expect(() =>
      orderMatchRules(
        [phrase({ source: ' Teleport ', replacement: 'Psiphon Access' })],
        []
      )
    ).toThrow(/bare brand word/);

    // The same entry under whole-node matching is accepted by both.
    const permitted = phrase({
      source: 'Teleport',
      replacement: 'Psiphon Access',
      match: 'wholeNode',
    });
    expect(validateCatalog([permitted])).toEqual([]);
    expect(orderMatchRules([permitted], []).map(rule => rule.source)).toEqual([
      'Teleport',
    ]);
  });
});

describe('psiphonBrand scan set', () => {
  it('covers all three packages and excludes tests, stories and itself', () => {
    expect(isScanned('web/packages/teleport/src/Login/Login.tsx')).toBe(true);
    expect(isScanned('web/packages/design/src/constants.ts')).toBe(true);
    // web/packages/shared HAS NO src directory.
    expect(
      isScanned('web/packages/shared/components/UnifiedResources/x.tsx')
    ).toBe(true);
    expect(isScanned('web/packages/teleport/src/Login/Login.test.tsx')).toBe(
      false
    );
    expect(isScanned('web/packages/teleport/src/Login/Login.story.tsx')).toBe(
      false
    );
    expect(
      isScanned('web/packages/teleport/src/psiphonBrand/brandCatalog.ts')
    ).toBe(false);
    expect(isScanned('web/packages/teleterm/src/x.ts')).toBe(false);
  });

  it('sorts the scan set before ownership uses its first file', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/Z.tsx': "export const Z = 'z';\n",
      'web/packages/design/src/A.ts': "export const A = 'a';\n",
      'web/packages/teleport/src/Discover/M.tsx': "export const M = 'm';\n",
    });
    try {
      const files = collectScanSet(root);
      expect(files).toEqual([...files].sort());
    } finally {
      cleanup();
    }
  });

  it('maps every file to exactly one area, with a total fallback', () => {
    expect(areaForPath('web/packages/teleport/src/Discover/x.tsx')).toBe(
      'discover-enrolment'
    );
    expect(areaForPath('web/packages/teleport/src/Integrations/x.tsx')).toBe(
      'integrations-aws'
    );
    expect(areaForPath('web/packages/teleport/src/Bots/x.tsx')).toBe(
      'bots-workload-identity'
    );
    expect(areaForPath('web/packages/teleport/src/Roles/x.tsx')).toBe(
      'roles-users-tokens'
    );
    expect(areaForPath('web/packages/teleport/src/Sessions/x.tsx')).toBe(
      'audit-sessions-recordings'
    );
    expect(areaForPath('web/packages/design/src/constants.ts')).toBe(
      'navigation-empty-dialogs'
    );
    expect(areaForPath('web/packages/teleport/src/config.ts')).toBe(
      'account-support'
    );
  });
});

describe('psiphonBrand matcher', () => {
  it('visits a string, a whole template and a JSX text node, and nothing else', () => {
    const code = [
      "import { thing } from './Teleport/path';",
      '// A comment naming Teleport must not be visited.',
      "const teleportIdentifier = 'Teleport Alpha';",
      'const t = `Resource [${name}] joined this Teleport Cluster.`;',
      'const e = <div title="Teleport Attribute">Join Teleport Now</div>;',
    ].join('\n');
    const nodes = visitNodes(code, 'x.tsx');
    const texts = nodes.map(n => `${n.kind}:${n.matchText}`);
    expect(texts).toContain('string:Teleport Alpha');
    expect(texts).toContain(
      'template:Resource [${name}] joined this Teleport Cluster.'
    );
    expect(texts).toContain('string:Teleport Attribute');
    expect(texts).toContain('jsxText:Join Teleport Now');
    // The import specifier and the comment are unreachable as visited nodes.
    expect(texts.some(t => t.includes('./Teleport/path'))).toBe(false);
    expect(texts.some(t => t.includes('must not be visited'))).toBe(false);
  });

  it('normalises a JSX text node that the formatter wrapped over three lines', () => {
    const code =
      'const e = <p>\n      Once you have downloaded\n      Teleport Connect, run it.\n    </p>;';
    const nodes = visitNodes(code, 'x.tsx').filter(n => n.kind === 'jsxText');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].matchText).toBe(
      'Once you have downloaded Teleport Connect, run it.'
    );
  });

  it('matches longest source first and consumes the region', () => {
    const code = 'const a = `TeleportDatabaseAccess_${props.name}`;';
    const node = visitNodes(code, 'x.ts')[0];
    const catalog = [
      phrase({
        source: 'TeleportDatabaseAccess_${props.name}',
        replacement: 'TeleportDatabaseAccess_${props.name}',
        immutable: true,
        tier: 'protocol',
      }),
      phrase({
        source: 'TeleportDatabaseAccess',
        replacement: 'TeleportDatabaseAccess',
        immutable: true,
        tier: 'protocol',
      }),
    ];
    const { regions, residuals } = matchNode(
      node,
      orderMatchRules(catalog, [])
    );
    expect(regions).toHaveLength(1);
    expect(regions[0].entry.source).toBe(
      'TeleportDatabaseAccess_${props.name}'
    );
    expect(residuals).toHaveLength(0);
  });

  it('orders entries the same way with or without a baseline in the list', () => {
    // `bundleGate.ts` reads a bundle, which has no baseline, so it keeps the
    // entry-only ordering. The two must not drift apart on the entries.
    const entries = [
      phrase({ source: 'Teleport A' }),
      phrase({ source: 'Teleport Longer B' }),
      phrase({ source: 'Teleport C' }),
    ];
    expect(orderMatchRules(entries, []).map(rule => rule.source)).toEqual(
      sortLongestFirst(entries).map(entry => entry.source)
    );
  });

  it('orders a baselined phrase and a catalog entry by length, longest first', () => {
    // DEFECT 2. The short immutable entry belongs to one leaf. The long phrase
    // is baselined in another. Without a shared ordering the short entry
    // consumes inside the long phrase, the phrase loses its residual, and the
    // other leaf takes a RATCHET_FAIL its author never caused.
    const code = `const e = <p>${KUBE_AGENT_PHRASE}</p>;`;
    const node = visitNodes(code, 'x.tsx').filter(n => n.kind === 'jsxText')[0];
    const entry = phrase({
      source: KUBE_AGENT,
      replacement: KUBE_AGENT,
      immutable: true,
      tier: 'protocol',
    });
    const { regions, shields, residuals } = matchNode(
      node,
      orderMatchRules(
        [entry],
        [{ source: KUBE_AGENT_PHRASE, count: 1, reason: 'not yet authored' }]
      )
    );
    expect(regions).toEqual([]);
    expect(shields.map(s => s.source)).toEqual([KUBE_AGENT_PHRASE]);
    // A shield consumes, and it deliberately does NOT suppress the residual.
    // ADR 0007 step 4 defines a residual as an occurrence that no CATALOG entry
    // consumed, so the baseline still has to account for this phrase.
    expect(residuals.map(r => r.run)).toEqual([KUBE_AGENT]);
  });

  it('lets a catalog entry win when it is at least as long as a baselined phrase', () => {
    const code = `const e = <p>${KUBE_AGENT_PHRASE}</p>;`;
    const node = visitNodes(code, 'x.tsx').filter(n => n.kind === 'jsxText')[0];
    const shield = [
      { source: KUBE_AGENT_PHRASE, count: 1, reason: 'not yet authored' },
    ];

    // Equal length: the catalog rule sorts first, so the owning child that
    // catalogues the whole phrase takes the region back from its own baseline.
    const exact = phrase({
      source: KUBE_AGENT_PHRASE,
      replacement: `${KUBE_AGENT} is already installed on the cluster.`,
    });
    const sameLength = matchNode(node, orderMatchRules([exact], shield));
    expect(sameLength.regions.map(r => r.entry.source)).toEqual([
      KUBE_AGENT_PHRASE,
    ]);
    expect(sameLength.shields).toEqual([]);
    expect(sameLength.residuals).toEqual([]);

    // Longer: the same, by length alone.
    const longerNode = visitNodes(
      `const e = <p>${KUBE_AGENT_PHRASE} already</p>;`,
      'x.tsx'
    ).filter(n => n.kind === 'jsxText')[0];
    const longer = phrase({
      source: `${KUBE_AGENT_PHRASE} already`,
      replacement: 'nothing branded',
    });
    const longerResult = matchNode(
      longerNode,
      orderMatchRules([longer], shield)
    );
    expect(longerResult.regions.map(r => r.entry.source)).toEqual([
      `${KUBE_AGENT_PHRASE} already`,
    ]);
    expect(longerResult.shields).toEqual([]);
  });

  it('never matches a whole-node entry inside a longer phrase', () => {
    // THE PROOF THAT MATTERS. If this regresses, the fork rewrites the bare
    // word inside every phrase it does not own, including the hundreds still
    // sitting in another leaf's baseline.
    const bare = phrase({
      source: 'Teleport',
      replacement: 'Psiphon Access',
      match: 'wholeNode',
      count: 5,
    });
    const rules = orderMatchRules([bare], []);

    const longer = [
      'Welcome to Teleport',
      'Teleport Users',
      'to evaluate and use Teleport.',
      'TeleportDatabaseAccess',
      'Teleport-Mfa-Response',
    ];
    for (const text of longer) {
      const node = visitNodes(`const a = ${JSON.stringify(text)};`, 'x.ts')[0];
      expect(node.matchText).toBe(text);
      const { regions, residuals } = matchNode(node, rules);
      expect(regions).toEqual([]);
      // Unmatched, so the phrase is still a residual its own leaf must account
      // for. The whole-node entry neither rewrites it nor hides it.
      expect(residuals).toHaveLength(1);
    }

    // And it does match the node that holds the word and nothing else, in each
    // of the three visited kinds. These are the five real sites in miniature.
    const exact: Array<[string, string]> = [
      ['string', "const productName = beams ? 'Beams' : 'Teleport';"],
      ['template', 'const t = `Teleport`;'],
      ['jsxText', 'const e = <BrandName>Teleport</BrandName>;'],
      // A JSX text node normalises to the bare word even when the formatter
      // wrapped it and a {' '} follows, which is WorkloadIdentities.tsx:244.
      [
        'jsxText',
        "const e = <p>\n      Teleport{' '}\n      <a>x</a>\n    </p>;",
      ],
    ];
    for (const [kind, code] of exact) {
      const node = visitNodes(code, 'x.tsx').filter(
        n => n.kind === kind && n.matchText === 'Teleport'
      )[0];
      expect(node).toBeDefined();
      const { regions, residuals } = matchNode(node, rules);
      expect(regions.map(r => r.entry.source)).toEqual(['Teleport']);
      expect(residuals).toEqual([]);
      const edits = editsForRegion(node, regions[0]);
      expect(edits).toHaveLength(1);
      const out =
        code.slice(0, edits[0].start) +
        edits[0].text +
        code.slice(edits[0].end);
      expect(out).toContain('Psiphon Access');
      expect(out).not.toContain('Teleport');
    }

    // The 'Beams' branch of the productName ternary is its own visited node,
    // it holds no brand word, and nothing touches it.
    const ternary = visitNodes(
      "const productName = beams ? 'Beams' : 'Teleport';",
      'x.ts'
    );
    expect(ternary.map(n => n.matchText)).toEqual(['Beams', 'Teleport']);
    expect(matchNode(ternary[0], rules).regions).toEqual([]);
  });

  it('sorts a whole-node rule last by length and still lets it win its own node', () => {
    // ADR 0007 amendment 4 orders every rule longest source first. A whole-node
    // source is short, so it sorts at the end, which is what we want: any
    // longer phrase that contains the word is claimed by its own rule first,
    // and the whole-node rule can only ever take a node no other rule wanted.
    const long = phrase({
      source: 'Welcome to Teleport',
      replacement: 'Welcome to Psiphon Access',
    });
    const bare = phrase({
      source: 'Teleport',
      replacement: 'Psiphon Access',
      match: 'wholeNode',
    });
    const rules = orderMatchRules(
      [bare, long],
      [{ source: 'Teleport Users', count: 1, reason: 'another leaf' }]
    );
    expect(rules.map(r => `${r.source}|${r.kind}|${r.whole}`)).toEqual([
      'Welcome to Teleport|catalog|false',
      'Teleport Users|baseline|false',
      'Teleport|catalog|true',
    ]);

    // The long entry takes its whole node, and the short rule gets nothing.
    const longNode = visitNodes("const a = 'Welcome to Teleport';", 'x.ts')[0];
    const longResult = matchNode(longNode, rules);
    expect(longResult.regions.map(r => r.entry.source)).toEqual([
      'Welcome to Teleport',
    ]);

    // A phrase another leaf baselined keeps its shield, and the whole-node rule
    // does not reach inside it either.
    const shielded = visitNodes("const a = 'Teleport Users';", 'x.ts')[0];
    const shieldedResult = matchNode(shielded, rules);
    expect(shieldedResult.regions).toEqual([]);
    expect(shieldedResult.shields.map(s => s.source)).toEqual([
      'Teleport Users',
    ]);

    // The bare node is still the whole-node rule's, even though it sorted last.
    const bareNode = visitNodes("const a = 'Teleport';", 'x.ts')[0];
    expect(matchNode(bareNode, rules).regions.map(r => r.entry.source)).toEqual(
      ['Teleport']
    );
  });

  it('keeps a whole-node entry out of the entry-only bundle ordering', () => {
    // `bundleGate.ts` consumes a bundle by matching a replacement as a
    // SUBSTRING, and a bundle has no nodes. An immutable whole-node entry whose
    // replacement is the bare word would therefore account for every occurrence
    // of the word in the bundle at once and hide hundreds of unaccounted
    // phrases, which is the substring rewrite ADR 0007 decision 2 forbids.
    const substring = phrase({ source: 'Teleport Users' });
    const whole = phrase({
      source: 'teleport',
      replacement: 'teleport',
      immutable: true,
      tier: 'protocol',
      match: 'wholeNode',
    });
    expect(sortLongestFirst([substring, whole]).map(e => e.source)).toEqual([
      'Teleport Users',
    ]);
    // The source reader keeps it, because a source reader can see a node.
    expect(orderMatchRules([substring, whole], []).map(r => r.source)).toEqual([
      'Teleport Users',
      'teleport',
    ]);
  });

  it('reports a residual and excludes an occurrence inside an excluded host', () => {
    const code = [
      "const a = 'Welcome to Teleport';",
      "const b = 'https://goteleport.com/docs/x';",
    ].join('\n');
    const nodes = visitNodes(code, 'x.ts');
    const runs = nodes.flatMap(n => matchNode(n, []).residuals.map(r => r.run));
    expect(runs).toEqual(['Teleport']);
  });

  it('rewrites only the quasis of a template and never an expression span', () => {
    const code =
      'const m = `You were logged out of Teleport, but not out of ${connectorNameText}. See the Teleport logs.`;';
    const node = visitNodes(code, 'x.ts')[0];
    const entry = phrase({
      source:
        'You were logged out of Teleport, but not out of ${connectorNameText}. See the Teleport logs.',
      replacement:
        'You were logged out of Psiphon Access, but not out of ${connectorNameText}. See the Psiphon Access logs.',
    });
    const { regions } = matchNode(node, orderMatchRules([entry], []));
    expect(regions).toHaveLength(1);
    const edits = editsForRegion(node, regions[0]);
    // Two edits, one per quasi. The ${...} span is untouched.
    expect(edits).toHaveLength(2);
    let out = code;
    for (const edit of [...edits].reverse()) {
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    }
    expect(out).toContain('${connectorNameText}');
    expect(out).toContain('logged out of Psiphon Access');
    expect(out).toContain('See the Psiphon Access logs');
    expect(out).not.toContain('Teleport');
  });

  it('refuses a replacement that drops a template expression span', () => {
    const code = 'const m = `Added to ${name} Teleport Cluster.`;';
    const node = visitNodes(code, 'x.ts')[0];
    const entry = phrase({
      source: 'Added to ${name} Teleport Cluster.',
      replacement: 'Added to this Psiphon Access cluster.',
    });
    const { regions } = matchNode(node, orderMatchRules([entry], []));
    expect(() => editsForRegion(node, regions[0])).toThrow(
      /drops the template expression/
    );
  });

  it('refuses a JSX replacement that would inject markup', () => {
    const code = 'const e = <p>Join Teleport</p>;';
    const node = visitNodes(code, 'x.tsx').filter(n => n.kind === 'jsxText')[0];
    const entry = phrase({
      source: 'Join Teleport',
      replacement: 'Join <b>Psiphon Access</b>',
    });
    const { regions } = matchNode(node, orderMatchRules([entry], []));
    expect(() => editsForRegion(node, regions[0])).toThrow(
      /must not contain <, >, \{ or \}/
    );
  });

  it('escapes a replacement for the quote character it lands in', () => {
    const code = "const a = 'Teleport Home';";
    const node = visitNodes(code, 'x.ts')[0];
    const entry = phrase({
      source: 'Teleport Home',
      replacement: "Psiphon's Home",
    });
    const { regions } = matchNode(node, orderMatchRules([entry], []));
    const edits = editsForRegion(node, regions[0]);
    expect(edits[0].text).toBe("Psiphon\\'s Home");
  });
});

describe('psiphonBrand transform', () => {
  it('applies to all three packages and skips tests, stories and node_modules', () => {
    expect(
      shouldTransform('/repo/web/packages/teleport/src/Login/Login.tsx')
    ).toBe(true);
    expect(shouldTransform('/repo/web/packages/design/src/constants.ts')).toBe(
      true
    );
    expect(
      shouldTransform('/repo/web/packages/shared/components/X.tsx?used')
    ).toBe(true);
    expect(
      shouldTransform('/repo/web/packages/teleport/src/Login/Login.test.tsx')
    ).toBe(false);
    expect(
      shouldTransform('/repo/node_modules/x/web/packages/shared/a.ts')
    ).toBe(false);
    expect(shouldTransform('/repo/web/packages/teleterm/src/a.ts')).toBe(false);
  });

  it('rewrites a module and returns a source map rather than a bare string', () => {
    const code = "export const title = 'Teleport Fixture';\n";
    const result = applyBrandCatalog(code, 'x.ts', [phrase()]);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(
      "export const title = 'Psiphon Access Fixture';\n"
    );
    expect(result!.map).toBeTruthy();
    expect(result!.map.mappings.length).toBeGreaterThan(0);
    expect(result!.map.sources).toContain('x.ts');
  });

  it('does not rewrite inside a phrase another leaf has baselined', () => {
    // The plugin and the gate must agree on what matched. If the plugin skipped
    // the baseline it would half-rewrite a phrase the gate treats as untouched,
    // and the shipped bundle would hold a sentence no catalog entry describes.
    const sentence = 'Download and install Teleport Connect now';
    const code = `const e = <p>${sentence}</p>;\n`;
    const entry = phrase({
      source: 'Teleport Connect',
      replacement: 'Psiphon Access Connect',
    });

    const unshielded = applyBrandCatalog(code, 'x.tsx', [entry], []);
    expect(unshielded!.code).toContain('Psiphon Access Connect');

    const shielded = applyBrandCatalog(
      code,
      'x.tsx',
      [entry],
      [{ source: sentence, count: 1, reason: 'owned by another leaf' }]
    );
    expect(shielded).toBeNull();
  });

  it('rewrites a bare-word node and leaves every longer phrase alone', () => {
    const code = [
      "const productName = beams ? 'Beams' : 'Teleport';",
      "const welcome = 'Welcome to Teleport';",
      "const scheme = 'teleport';",
      "const kind = { subKind: 'teleport' };",
      'const e = <BrandName>Teleport</BrandName>;',
      '',
    ].join('\n');
    const result = applyBrandCatalog(
      code,
      'x.tsx',
      [
        phrase({
          source: 'Teleport',
          replacement: 'Psiphon Access',
          count: 2,
          match: 'wholeNode',
        }),
        phrase({
          source: 'teleport',
          replacement: 'teleport',
          count: 2,
          tier: 'protocol',
          immutable: true,
          match: 'wholeNode',
        }),
      ],
      []
    );
    expect(result!.code).toBe(
      [
        "const productName = beams ? 'Beams' : 'Psiphon Access';",
        // Owned by another leaf, and still carrying upstream wording.
        "const welcome = 'Welcome to Teleport';",
        // Immutable. The deep-link scheme and the resource subKind must survive
        // the build byte for byte.
        "const scheme = 'teleport';",
        "const kind = { subKind: 'teleport' };",
        'const e = <BrandName>Psiphon Access</BrandName>;',
        '',
      ].join('\n')
    );
    expect(result!.edits).toBe(2);
  });

  it('leaves a module alone when nothing matches', () => {
    expect(
      applyBrandCatalog("const a = 'nothing';\n", 'x.ts', [phrase()])
    ).toBeNull();
  });

  it('never rewrites an immutable entry, whatever the leaves hold', () => {
    // RENAMED on 2026-08-19. The old name was "leaves the real committed source
    // alone, because every leaf is empty". That reason expires the moment an
    // authoring child fills a leaf. The property that does not expire is that
    // an immutable entry produces no edit, because its replacement equals its
    // source, so this module keeps upstream wording at every catalog size.
    const code = "export const MFA_HEADER = 'Teleport-Mfa-Response';\n";
    expect(applyBrandCatalog(code, 'api.ts')).toBeNull();
    for (const entry of BRAND_CATALOG.filter(e => e.immutable)) {
      const module = `export const x = ${JSON.stringify(entry.source)};\n`;
      expect(applyBrandCatalog(module, 'x.ts', [entry])).toBeNull();
    }
  });
});

describe('psiphonBrand catalog validation', () => {
  it('accepts the shipped catalog', () => {
    expect(validateCatalog(BRAND_CATALOG)).toEqual([]);
  });

  it.each([
    [
      'an empty source',
      phrase({ source: '', replacement: 'x' }),
      /empty source/,
    ],
    ['count below one', phrase({ count: 0 }), /requires an integer count >= 1/],
    [
      'immutable disagreeing with replacement',
      phrase({ immutable: true }),
      /but replacement differs from source/,
    ],
    [
      'protocol tier that is not immutable',
      phrase({ tier: 'protocol' }),
      /protocol tier and must be immutable/,
    ],
    ['an empty reason', phrase({ reason: '   ' }), /empty reason/],
  ])('rejects %s', (_label, entry, pattern) => {
    const problems = validateCatalog([entry]);
    expect(problems.join('\n')).toMatch(pattern);
  });

  it('rejects a duplicate source', () => {
    const problems = validateCatalog([phrase(), phrase()]);
    expect(problems.join('\n')).toMatch(/duplicates the source of entry 0/);
  });
});

describe('psiphonBrand gate, layer 1', () => {
  it('passes against the committed tree and prints the full report', () => {
    const evaluation = evaluateBrandGate();
    // eslint-disable-next-line no-console
    console.log(formatBrandReport(evaluation));

    expect(evaluation.invalidEntries).toEqual([]);
    expect(evaluation.deadEntries).toEqual([]);
    expect(evaluation.countMismatches).toEqual([]);
    expect(evaluation.ratchetFailures).toEqual([]);
    expect(evaluation.unknownPhrases).toEqual([]);

    // Derived from the data, never a literal. Every entry the aggregate holds
    // reaches the gate, and every one of them passes.
    expect(evaluation.counts.catalogEntries).toBe(BRAND_CATALOG.length);
    expect(evaluation.counts.pass).toBe(evaluation.counts.catalogEntries);
    expect(evaluation.entryResults).toHaveLength(BRAND_CATALOG.length);
    expect(evaluation.entryResults.every(r => r.verdict === 'PASS')).toBe(true);
    expect(evaluation.counts.baselineEntries).toBe(BRAND_BASELINE.length);
    expect(evaluation.counts.baselined).toBe(BRAND_BASELINE.length);
    expect(evaluation.fileCount).toBeGreaterThan(1000);
  });

  it('passes for an AUTHORED leaf holding a render entry and a protocol entry', () => {
    // The gate must be able to say yes. A machinery that only ever proves the
    // empty catalog clean proves nothing about the work it exists to admit.
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Integrations/Enroll/Aws.tsx':
        'export const A = () => <p>Add Teleport Resource Access</p>;\n',
      'web/packages/teleport/src/Integrations/Enroll/policy.ts':
        "export const NAME = 'TeleportDatabaseAccess';\n" +
        "export const DOCS = 'https://goteleport.com/docs/aws';\n",
    });
    const authoredLeaf: readonly BrandPhrase[] = [
      phrase({
        source: 'Add Teleport Resource Access',
        replacement: 'Add Psiphon Access Resource Access',
        count: 1,
        tier: 'render',
        immutable: false,
        reason: 'Button label a user reads on the AWS enrolment step',
      }),
      phrase({
        source: 'TeleportDatabaseAccess',
        replacement: 'TeleportDatabaseAccess',
        count: 1,
        tier: 'protocol',
        immutable: true,
        reason:
          'IAM role name in the customer AWS account, a rename orphans it',
      }),
    ];
    try {
      expect(validateCatalog(authoredLeaf)).toEqual([]);
      const evaluation = evaluateBrandGate(
        authoredLeaf,
        EMPTY_BASELINE,
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.invalidEntries).toEqual([]);
      expect(evaluation.deadEntries).toEqual([]);
      expect(evaluation.countMismatches).toEqual([]);
      expect(evaluation.ratchetFailures).toEqual([]);
      expect(evaluation.unknownPhrases).toEqual([]);
      expect(evaluation.counts.pass).toBe(authoredLeaf.length);
      expect(evaluation.counts.baselineEntries).toBe(0);

      // And the transform actually rewrites the render entry while leaving the
      // protocol entry and the excluded host alone.
      const rewritten = applyBrandCatalog(
        'export const A = () => <p>Add Teleport Resource Access</p>;\n',
        'Aws.tsx',
        authoredLeaf,
        []
      );
      expect(rewritten!.code).toContain('Add Psiphon Access Resource Access');
      expect(
        applyBrandCatalog(
          "export const NAME = 'TeleportDatabaseAccess';\n",
          'policy.ts',
          authoredLeaf,
          []
        )
      ).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('lets a baselined phrase in one leaf outrank a shorter entry in another', () => {
    // DEFECT 2, at gate level. Before the shared ordering this raised
    // RATCHET_FAIL against discover-enrolment, whose author never touched
    // either file, so two children editing disjoint leaves broke each other.
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Discover/Kubernetes/Installed.tsx': `export const I = () => <p>${KUBE_AGENT_PHRASE}</p>;\n`,
      'web/packages/teleport/src/Integrations/Enroll/chart.ts': `export const CHART = '${KUBE_AGENT}';\n`,
    });
    const integrationsLeaf = [
      phrase({
        source: KUBE_AGENT,
        replacement: KUBE_AGENT,
        count: 1,
        tier: 'protocol',
        immutable: true,
        reason: 'Upstream helm chart name, a rename breaks the install command',
      }),
    ];
    try {
      const evaluation = evaluateBrandGate(
        integrationsLeaf,
        baselineOf('discover-enrolment', [
          { source: KUBE_AGENT_PHRASE, count: 1, reason: 'not yet authored' },
        ]),
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.ratchetFailures).toEqual([]);
      expect(evaluation.countMismatches).toEqual([]);
      expect(evaluation.unknownPhrases).toEqual([]);
      expect(evaluation.deadEntries).toEqual([]);
      expect(evaluation.counts.baselined).toBe(1);

      // The entry still counts every site where it legitimately wins, and only
      // those. The site inside the baselined phrase belongs to the other leaf.
      const result = evaluation.entryResults.find(
        r => r.entry.source === KUBE_AGENT
      );
      expect(result!.verdict).toBe('PASS');
      expect(result!.found).toBe(1);
      expect(result!.sites.map(s => s.file)).toEqual([
        'web/packages/teleport/src/Integrations/Enroll/chart.ts',
      ]);
    } finally {
      cleanup();
    }
  });

  it('does not let a baseline shield hide a phrase upstream has just added', () => {
    // The ordering must not become an exemption. A shield consumes, but it
    // never suppresses a residual, so a NEW node that merely contains a
    // baselined source is still UNKNOWN_PHRASE.
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Integrations/Enroll/chart.ts': `export const CHART = '${KUBE_AGENT}';\n`,
      'web/packages/teleport/src/Integrations/Enroll/New.tsx': `export const N = () => <p>Now install ${KUBE_AGENT} on every cluster</p>;\n`,
    });
    try {
      const evaluation = evaluateBrandGate(
        [],
        baselineOf('integrations-aws', [
          { source: KUBE_AGENT, count: 1, reason: 'not yet authored' },
        ]),
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.counts.unknownPhrase).toBe(1);
      expect(evaluation.unknownPhrases[0]).toContain(
        `Now install ${KUBE_AGENT} on every cluster`
      );
      expect(evaluation.counts.baselined).toBe(1);
      expect(evaluation.ratchetFailures).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('reports INVALID_ENTRY for a banned entry without reading a file', () => {
    // ADR 0007 step 1 validates before it reads. The rule builder throws on
    // this entry, so without the early return the gate would report one
    // problem where it exists to report all of them.
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/Fixture.tsx':
        'export const F = () => <p>Welcome to Teleport</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [phrase({ source: 'Teleport', replacement: 'Psiphon Access' })],
        EMPTY_BASELINE,
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.counts.invalidEntry).toBe(1);
      expect(evaluation.invalidEntries[0]).toContain(
        'bare brand word under substring matching'
      );
      expect(evaluation.fileCount).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('passes a whole-node entry and still demands the longer phrase', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/Bare.tsx':
        'export const B = () => <BrandName>Teleport</BrandName>;\n',
      'web/packages/teleport/src/Roles/Long.tsx':
        'export const L = () => <p>Welcome to Teleport</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [
          phrase({
            source: 'Teleport',
            replacement: 'Psiphon Access',
            match: 'wholeNode',
          }),
        ],
        EMPTY_BASELINE,
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.invalidEntries).toEqual([]);
      expect(evaluation.counts.pass).toBe(1);
      // The longer phrase is untouched, so it is still UNKNOWN_PHRASE and its
      // own leaf must account for it.
      expect(evaluation.counts.unknownPhrase).toBe(1);
      expect(evaluation.unknownPhrases[0]).toContain('Welcome to Teleport');
    } finally {
      cleanup();
    }
  });

  it('reports each cross-area source with its owner and every site', () => {
    const baselineSource = 'Cross-area Teleport phrase';
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Discover/Baseline.tsx': `export const A = () => <p>${baselineSource}</p>;\n`,
      'web/packages/teleport/src/Roles/Baseline.tsx': `export const B = () => <p>${baselineSource}</p>;\n`,
      'web/packages/shared/components/Catalog.tsx':
        'export const C = () => <BrandName>Teleport</BrandName>;\n',
      'web/packages/teleport/src/WorkloadIdentity/Catalog.tsx':
        'export const D = () => <BrandName>Teleport</BrandName>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [
          phrase({
            source: 'Teleport',
            replacement: 'Psiphon Access',
            count: 2,
            match: 'wholeNode',
          }),
        ],
        baselineOf('discover-enrolment', [
          { source: baselineSource, count: 2, reason: 'not yet authored' },
        ]),
        EXCLUDED_HOSTS,
        root
      );
      const report = formatBrandReport(evaluation);
      expect(report).toContain(
        'catalog owner=roles-users-tokens total=2 source="Teleport"\n' +
          '  bots-workload-identity x1: web/packages/teleport/src/WorkloadIdentity/Catalog.tsx:1\n' +
          '  navigation-empty-dialogs x1: web/packages/shared/components/Catalog.tsx:1'
      );
      expect(report).toContain(
        'baseline owner=discover-enrolment total=2 source="Cross-area Teleport phrase"\n' +
          '  discover-enrolment x1: web/packages/teleport/src/Discover/Baseline.tsx:1\n' +
          '  roles-users-tokens x1: web/packages/teleport/src/Roles/Baseline.tsx:1'
      );
    } finally {
      cleanup();
    }
  });

  it('is not vacuous: an unbaselined unbranded phrase raises UNKNOWN_PHRASE', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/Fixture.tsx':
        'export const F = () => <p>Add Teleport Resource Access</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [],
        EMPTY_BASELINE,
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.counts.unknownPhrase).toBe(1);
      const message = evaluation.unknownPhrases[0];
      expect(message).toContain('UNKNOWN_PHRASE');
      expect(message).toContain('Add Teleport Resource Access');
      expect(message).toContain('Roles/Fixture.tsx:1');
      expect(message).toContain('roles-users-tokens');
    } finally {
      cleanup();
    }
  });

  it('admits the same phrase once its area baseline holds it', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/Fixture.tsx':
        'export const F = () => <p>Add Teleport Resource Access</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [],
        baselineOf('roles-users-tokens', [
          {
            source: 'Add Teleport Resource Access',
            count: 1,
            reason: 'fixture',
          },
        ]),
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.unknownPhrases).toEqual([]);
      expect(evaluation.counts.baselined).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('raises RATCHET_FAIL when a baselined phrase stops appearing', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/Fixture.tsx':
        'export const F = () => <p>nothing branded here</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [],
        baselineOf('roles-users-tokens', [
          { source: 'Add Teleport Resource Access', count: 1, reason: 'x' },
        ]),
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.counts.ratchetFail).toBe(1);
      expect(evaluation.ratchetFailures[0]).toContain(
        'no longer appears in the scan set'
      );
      expect(evaluation.ratchetFailures[0]).toContain(
        'ROLES_USERS_TOKENS_BASELINE'
      );
    } finally {
      cleanup();
    }
  });

  it('raises RATCHET_FAIL when a phrase is in both the catalog and the baseline', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/Fixture.tsx':
        'export const F = () => <p>Add Teleport Resource Access</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [
          phrase({
            source: 'Add Teleport Resource Access',
            replacement: 'Add Resource Access',
          }),
        ],
        baselineOf('roles-users-tokens', [
          { source: 'Add Teleport Resource Access', count: 1, reason: 'x' },
        ]),
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.counts.ratchetFail).toBe(1);
      expect(evaluation.ratchetFailures[0]).toContain('is now a catalog entry');
    } finally {
      cleanup();
    }
  });

  it('raises DEAD_ENTRY for a catalog entry that matches nothing', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/Fixture.tsx':
        'export const F = () => <p>nothing branded here</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [phrase({ source: 'Teleport Ghost Phrase' })],
        EMPTY_BASELINE,
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.counts.deadEntry).toBe(1);
      expect(evaluation.deadEntries[0]).toContain('matches nothing');
      expect(evaluation.deadEntries[0]).toContain('Teleport Ghost Phrase');
    } finally {
      cleanup();
    }
  });

  it('raises COUNT_MISMATCH when upstream adds another copy of a phrase', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/A.tsx':
        'export const A = () => <p>Add Teleport Resource Access</p>;\n',
      'web/packages/teleport/src/Roles/B.tsx':
        'export const B = () => <p>Add Teleport Resource Access</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [
          phrase({
            source: 'Add Teleport Resource Access',
            replacement: 'Add Resource Access',
            count: 1,
          }),
        ],
        EMPTY_BASELINE,
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.counts.countMismatch).toBe(1);
      expect(evaluation.countMismatches[0]).toContain('expects count 1');
      expect(evaluation.countMismatches[0]).toContain('found 2');
      expect(evaluation.countMismatches[0]).toContain(
        'Roles/A.tsx:1 [roles-users-tokens]'
      );
      expect(evaluation.countMismatches[0]).toContain(
        'Roles/B.tsx:1 [roles-users-tokens]'
      );
    } finally {
      cleanup();
    }
  });

  it('raises COUNT_MISMATCH when a baselined phrase drifts', () => {
    const { root, cleanup } = fixtureRepo({
      'web/packages/teleport/src/Roles/A.tsx':
        'export const A = () => <p>Add Teleport Resource Access</p>;\n',
      'web/packages/teleport/src/Discover/B.tsx':
        'export const B = () => <p>Add Teleport Resource Access</p>;\n',
    });
    try {
      const evaluation = evaluateBrandGate(
        [],
        baselineOf('roles-users-tokens', [
          { source: 'Add Teleport Resource Access', count: 1, reason: 'x' },
        ]),
        EXCLUDED_HOSTS,
        root
      );
      expect(evaluation.counts.countMismatch).toBe(1);
      expect(evaluation.countMismatches[0]).toContain(
        'Discover/B.tsx:1 [discover-enrolment]'
      );
      expect(evaluation.countMismatches[0]).toContain(
        'Roles/A.tsx:1 [roles-users-tokens]'
      );
      expect(evaluation.countMismatches[0]).toContain('a human must look');
    } finally {
      cleanup();
    }
  });
});

describe('psiphonBrand gate, layer 2', () => {
  it('switches strict enforcement on by itself when the baseline empties', () => {
    expect(isBundleGateStrict([])).toBe(true);
    expect(isBundleGateStrict([{ source: 'x', count: 1, reason: 'y' }])).toBe(
      false
    );
    // Today the shipped baseline is not empty, so the build reports instead of
    // throwing. No further commit turns this on.
    expect(isBundleGateStrict()).toBe(BRAND_BASELINE.length === 0);
  });

  it('is not vacuous: an unbranded phrase in an emitted chunk is a residual', () => {
    const result = scanBundleResidual(
      'app/app.js',
      'const a="Welcome to Teleport";',
      []
    );
    expect(result.residualOccurrences).toBe(1);
    expect(result.residuals[0].run).toBe('Teleport');
    expect(formatBundleReport([result], true)).toContain('1 unaccounted');
  });

  it('accounts for an immutable entry and for an excluded host', () => {
    const code =
      'const h="Teleport-Mfa-Response";const u="https://goteleport.com/docs/x";';
    const result = scanBundleResidual('app/app.js', code, PROTOCOL_ENTRIES);
    expect(result.totalOccurrences).toBe(2);
    expect(result.accountedByCatalog).toBe(1);
    expect(result.accountedByHost).toBe(1);
    expect(result.residualOccurrences).toBe(0);
  });

  it('would fail a bundle that shipped upstream copy under an empty catalog', () => {
    const clean = scanBundleResidual('app/app.js', 'const a="hello";', []);
    expect(clean.residualOccurrences).toBe(0);
    const dirty = scanBundleResidual(
      'app/app.js',
      'const a="Welcome to Teleport";const b="Teleport Identity Security";',
      []
    );
    expect(dirty.residualOccurrences).toBe(2);
  });
});
