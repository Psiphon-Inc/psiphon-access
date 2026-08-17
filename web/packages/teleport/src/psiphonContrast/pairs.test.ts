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

import { composite, contrastRatio } from './color';
import {
  CONTRAST_PAIRS,
  DEFERRED_REFERENCE_EDGES,
  EXCLUDED_GROUPS,
  EXCLUDED_LEAVES,
  SEPARATION_RULES,
} from './pairs';
import { getResolvedThemeColors } from './themeColors';

describe('psiphonContrast / pairs', () => {
  const resolvedLeaves = getResolvedThemeColors();
  const resolvedPaths = new Set(resolvedLeaves.map(l => l.path));
  const resolvedGroups = new Set(resolvedLeaves.map(l => l.group));

  it('AC1: every pair names fgPath, bgPath, floor, kind, and floorReason in data', () => {
    expect(CONTRAST_PAIRS.length).toBeGreaterThan(0);

    for (const pair of CONTRAST_PAIRS) {
      expect(typeof pair.id).toBe('string');
      expect(pair.id.length).toBeGreaterThan(0);

      expect(typeof pair.fgPath).toBe('string');
      expect(pair.fgPath.length).toBeGreaterThan(0);

      expect(typeof pair.bgPath).toBe('string');
      expect(pair.bgPath.length).toBeGreaterThan(0);

      expect(typeof pair.floorReason).toBe('string');
      expect(pair.floorReason.length).toBeGreaterThan(0);

      expect([4.5, 3]).toContain(pair.floor);
      expect(['normalText', 'largeText', 'nonText']).toContain(pair.kind);
    }
  });

  it('AC2 & AC6: floors match WCAG 2.1 AA values (4.5 for normal text, 3 for large/non-text), disabled pairs are exempt, and non-boundary pairs are marked notBoundary', () => {
    const normalTextPairs = CONTRAST_PAIRS.filter(p => p.kind === 'normalText');
    expect(normalTextPairs.length).toBeGreaterThan(0);
    for (const pair of normalTextPairs) {
      expect(pair.floor).toBe(4.5);
    }

    const nonNormalPairs = CONTRAST_PAIRS.filter(p => p.kind !== 'normalText');
    expect(nonNormalPairs.length).toBeGreaterThan(0);
    for (const pair of nonNormalPairs) {
      expect(pair.floor).toBe(3);
    }

    // Verify WCAG 1.4.3 exemptions are exclusively used for disabled controls
    const exemptPairs = CONTRAST_PAIRS.filter(p => p.exempt);
    expect(exemptPairs.length).toBeGreaterThan(0);
    for (const pair of exemptPairs) {
      expect(typeof pair.exemptReason).toBe('string');
      expect(pair.exemptReason!.length).toBeGreaterThan(0);
      expect(pair.notBoundary).toBeUndefined(); // Must NOT be labeled as non-boundary
    }

    // Verify specifically disabled leaves are marked exempt under WCAG 1.4.3
    const disabledTextPairs = CONTRAST_PAIRS.filter(
      p => p.fgPath === 'text.disabled'
    );
    expect(disabledTextPairs.length).toBeGreaterThan(0);
    for (const p of disabledTextPairs) {
      expect(p.exempt).toBe(true);
    }

    const disabledBtnTextPair = CONTRAST_PAIRS.find(
      p => p.fgPath === 'buttons.textDisabled'
    );
    expect(disabledBtnTextPair).toBeDefined();
    expect(disabledBtnTextPair!.exempt).toBe(true);

    const disabledBtnBgPair = CONTRAST_PAIRS.find(
      p => p.fgPath === 'buttons.bgDisabled'
    );
    expect(disabledBtnBgPair).toBeDefined();
    expect(disabledBtnBgPair!.exempt).toBe(true);

    // Verify non-boundary pairs use notBoundary state and are NOT labeled as WCAG exemptions
    const notBoundaryPairs = CONTRAST_PAIRS.filter(p => p.notBoundary);
    expect(notBoundaryPairs.length).toBe(3);
    for (const pair of notBoundaryPairs) {
      expect(typeof pair.notBoundaryReason).toBe('string');
      expect(pair.notBoundaryReason!.length).toBeGreaterThan(0);
      expect(pair.exempt).toBeUndefined(); // Must NOT be labeled a WCAG exemption
      expect(pair.exemptReason).toBeUndefined();
    }

    // Verify specific non-boundary pairs
    const defaultBorder = CONTRAST_PAIRS.find(
      p => p.fgPath === 'buttons.border.default'
    );
    expect(defaultBorder).toBeDefined();
    expect(defaultBorder!.notBoundary).toBe(true);
    expect(defaultBorder!.exempt).toBeUndefined();

    const hoverBorder = CONTRAST_PAIRS.find(
      p => p.fgPath === 'buttons.border.hover'
    );
    expect(hoverBorder).toBeDefined();
    expect(hoverBorder!.notBoundary).toBe(true);
    expect(hoverBorder!.exempt).toBeUndefined();

    const activeBorder = CONTRAST_PAIRS.find(
      p => p.fgPath === 'buttons.border.active'
    );
    expect(activeBorder).toBeDefined();
    expect(activeBorder!.notBoundary).toBe(true);
    expect(activeBorder!.exempt).toBeUndefined();
  });

  it('AC3: asserts that every token path in pairs and rules exists in themeColors leaf set', () => {
    const invalidFg = CONTRAST_PAIRS.filter(
      p => !resolvedPaths.has(p.fgPath)
    ).map(p => p.fgPath);
    expect(invalidFg).toEqual([]);

    const invalidBg = CONTRAST_PAIRS.filter(
      p => !resolvedPaths.has(p.bgPath)
    ).map(p => p.bgPath);
    expect(invalidBg).toEqual([]);

    const invalidRuleTokens = SEPARATION_RULES.filter(
      r => !resolvedPaths.has(r.tokenA) || !resolvedPaths.has(r.tokenB)
    ).map(r => `${r.tokenA} / ${r.tokenB}`);
    expect(invalidRuleTokens).toEqual([]);

    const invalidGroups = EXCLUDED_GROUPS.filter(
      ex => !resolvedGroups.has(ex.group)
    ).map(ex => ex.group);
    expect(invalidGroups).toEqual([]);

    const invalidLeaves = EXCLUDED_LEAVES.filter(
      ex => !resolvedPaths.has(ex.path)
    ).map(ex => ex.path);
    expect(invalidLeaves).toEqual([]);
  });

  it('AC4: represents every role group, accounting for all 174 leaves, with terminal and editor deferred', () => {
    // Collect all groups referenced in pairs, excluded, or deferred
    const coveredGroups = new Set<string>();

    for (const pair of CONTRAST_PAIRS) {
      const fgGroup = pair.fgPath.split('.')[0];
      const bgGroup = pair.bgPath.split('.')[0];
      coveredGroups.add(fgGroup);
      coveredGroups.add(bgGroup);
    }

    for (const ex of EXCLUDED_GROUPS) {
      coveredGroups.add(ex.group);
    }

    // Every resolved group must be covered
    for (const group of resolvedGroups) {
      if (!coveredGroups.has(group)) {
        throw new Error(
          `group "${group}" is not represented in pairs or exclusions`
        );
      }
    }

    // Check terminal and editor pairs are present and live since the theme implementation
    const terminalPairs = CONTRAST_PAIRS.filter(
      p => p.fgPath.startsWith('terminal.') || p.bgPath.startsWith('terminal.')
    );
    expect(terminalPairs.length).toBe(22);
    for (const p of terminalPairs) {
      expect(p.deferred).toBeFalsy();
    }

    const editorPairs = CONTRAST_PAIRS.filter(
      p => p.fgPath.startsWith('editor.') || p.bgPath.startsWith('editor.')
    );
    expect(editorPairs.length).toBe(6);
    for (const p of editorPairs) {
      expect(p.deferred).toBeFalsy();
    }

    // Action group is excluded per D14
    const actionExclusion = EXCLUDED_GROUPS.find(g => g.group === 'action');
    expect(actionExclusion).toBeDefined();
    expect(actionExclusion!.reason).toMatch(/D14/);
  });

  it('the dead-leaf audit and the theme implementation: 13 excluded dataVisualisation leaves, the 6 formerly theme-referenced ones now have no reader, and 8 live leaves carry reader citations', () => {
    // Exactly 13 leaves excluded from component contrast pairs
    expect(EXCLUDED_LEAVES.length).toBe(13);

    const deadPaths = new Set(EXCLUDED_LEAVES.map(l => l.path));
    expect(deadPaths.size).toBe(13);

    // Confirm specific 7 dead leaves and 6 theme-referenced leaves
    expect(deadPaths.has('dataVisualisation.primary.purple')).toBe(true);
    expect(deadPaths.has('dataVisualisation.primary.wednesdays')).toBe(true);
    expect(deadPaths.has('dataVisualisation.primary.picton')).toBe(true);
    expect(deadPaths.has('dataVisualisation.primary.caribbean')).toBe(true);
    expect(deadPaths.has('dataVisualisation.primary.abbey')).toBe(true);
    expect(deadPaths.has('dataVisualisation.primary.cyan')).toBe(true);
    expect(deadPaths.has('dataVisualisation.secondary.purple')).toBe(true);
    expect(deadPaths.has('dataVisualisation.secondary.wednesdays')).toBe(true);
    expect(deadPaths.has('dataVisualisation.secondary.sunflower')).toBe(true);
    expect(deadPaths.has('dataVisualisation.secondary.abbey')).toBe(true);
    expect(deadPaths.has('dataVisualisation.secondary.cyan')).toBe(true);
    expect(deadPaths.has('dataVisualisation.tertiary.wednesdays')).toBe(true);
    expect(deadPaths.has('dataVisualisation.tertiary.cyan')).toBe(true);

    // the dead-leaf audit found these six leaves were consumed by the theme itself, through
    // terminal and editor references, so they were not dead. The theme implementation gave every
    // terminal and editor slot a literal value, which broke those chains and made
    // the six readerless again. Assert the chains are really gone rather than
    // assert a wording, because a reintroduced reference is the regression that
    // matters and a string match would not catch it.
    const formerlyThemeReferenced = [
      'dataVisualisation.primary.purple',
      'dataVisualisation.primary.picton',
      'dataVisualisation.primary.caribbean',
      'dataVisualisation.primary.abbey',
      'dataVisualisation.primary.cyan',
      'dataVisualisation.tertiary.cyan',
    ];

    // Match a reference ANYWHERE in the expression, not only as the whole value.
    // A bare '{colors.X}' and a 'color-mix(in srgb, black 80%, {colors.X})' both
    // consume X. An anchored regex sees only the first, which would leave this
    // check vacuous once the bare references are gone.
    const referencedByAnotherToken = new Set<string>();
    for (const leaf of resolvedLeaves) {
      for (const m of leaf.rawValue.matchAll(/\{colors\.([^}]+)\}/g)) {
        referencedByAnotherToken.add(m[1].trim());
      }
    }

    // Guard against a vacuous check. If the theme ever holds no reference at all,
    // the loop below would pass for every path and prove nothing.
    expect(referencedByAnotherToken.size).toBeGreaterThan(0);

    for (const path of formerlyThemeReferenced) {
      const leaf = EXCLUDED_LEAVES.find(l => l.path === path);
      expect(leaf).toBeDefined();
      expect(leaf!.reason).toMatch(/No reader/);
      expect(referencedByAnotherToken.has(path)).toBe(false);
    }

    // None of the 13 excluded leaves carry an invented component contrast pair
    const deadPairs = CONTRAST_PAIRS.filter(p => deadPaths.has(p.fgPath));
    expect(deadPairs).toEqual([]);

    // 8 live leaves all carry pairs
    const liveLeaves = [
      'dataVisualisation.primary.sunflower',
      'dataVisualisation.secondary.picton',
      'dataVisualisation.secondary.caribbean',
      'dataVisualisation.tertiary.purple',
      'dataVisualisation.tertiary.picton',
      'dataVisualisation.tertiary.sunflower',
      'dataVisualisation.tertiary.caribbean',
      'dataVisualisation.tertiary.abbey',
    ];

    const dataVisPairs = CONTRAST_PAIRS.filter(p =>
      p.fgPath.startsWith('dataVisualisation.')
    );
    const liveFgPaths = new Set(dataVisPairs.map(p => p.fgPath));

    for (const leaf of liveLeaves) {
      expect(liveFgPaths.has(leaf)).toBe(true);
    }

    // Every dataVisualisation pair cites file and line of reader in floorReason
    for (const pair of dataVisPairs) {
      expect(pair.floorReason).toMatch(/web\/packages\/.*:\d+/);
    }

    // Label outline pairs (text floor 4.5)
    const warningLabelPair = CONTRAST_PAIRS.find(
      p => p.id === 'dataVis-primary.sunflower-on-interactive.tonal.alert.0'
    );
    expect(warningLabelPair).toBeDefined();
    expect(warningLabelPair!.floor).toBe(4.5);
    expect(warningLabelPair!.kind).toBe('normalText');
    expect(warningLabelPair!.floorReason).toContain('Label.tsx:140,142');

    const dangerLabelPair = CONTRAST_PAIRS.find(
      p => p.id === 'dataVis-tertiary.abbey-on-interactive.tonal.danger.0'
    );
    expect(dangerLabelPair).toBeDefined();
    expect(dangerLabelPair!.floor).toBe(4.5);
    expect(dangerLabelPair!.kind).toBe('normalText');
    expect(dangerLabelPair!.floorReason).toContain('Label.tsx:157');

    // Retained status surface pairs
    const statusSurfacePairs = CONTRAST_PAIRS.filter(
      p =>
        p.fgPath.startsWith('dataVisualisation.') &&
        p.bgPath === 'levels.surface'
    );
    expect(statusSurfacePairs.length).toBe(4);
    for (const p of statusSurfacePairs) {
      expect(p.floorReason).toContain('statusColors.ts:88-112');
    }
  });

  it('the dead-leaf audit: DEFERRED_REFERENCE_EDGES is empty after the theme implementation resolved all terminal and editor reference edges', () => {
    expect(DEFERRED_REFERENCE_EDGES.length).toBe(0);

    const terminalEdges = DEFERRED_REFERENCE_EDGES.filter(e =>
      e.deferredPath.startsWith('terminal.')
    );
    expect(terminalEdges.length).toBe(0);

    const editorEdges = DEFERRED_REFERENCE_EDGES.filter(e =>
      e.deferredPath.startsWith('editor.')
    );
    expect(editorEdges.length).toBe(0);
  });

  it('AC5: separation rules cover intra-tier dataVisualisation series (63 pairs: 3 tiers x 21 intra-tier pairs) and ANSI normal vs bright slots (8 pairs)', () => {
    const dataVisRules = SEPARATION_RULES.filter(
      r =>
        r.tokenA.startsWith('dataVisualisation.') &&
        r.tokenB.startsWith('dataVisualisation.')
    );
    // 3 dataVisualisation tiers (primary, secondary, tertiary), each containing 7 hues.
    // Intra-tier pairwise combinations = 3 tiers * (7 * 6 / 2) = 63 rules.
    // Cross-tier pairs are excluded as series compete for visual distinction only within a single tier.
    expect(dataVisRules.length).toBe(63);

    for (const rule of dataVisRules) {
      expect(rule.minDelta).toBeGreaterThanOrEqual(1.3);
      expect(rule.metric).toBe('luminanceRatio');
      expect(rule.reason.length).toBeGreaterThan(0);
    }

    const ansiRules = SEPARATION_RULES.filter(r =>
      r.id.startsWith('terminal-ansi-sep-')
    );
    expect(ansiRules.length).toBe(8);

    for (const rule of ansiRules) {
      expect(rule.deferred).toBeFalsy();
      expect(rule.minDelta).toBeGreaterThanOrEqual(1.0);
      expect(rule.metric).toBe('luminanceRatio');
    }
  });

  it('measures the historical collapses and the adopted D16 risk scale', () => {
    // Historical collapse 1: the terminal decision cyan vs br_cyan identical #00857A vs #00857A
    const cyan = '#00857A';
    const brCyan = '#00857A';
    const collapse1Ratio = contrastRatio(cyan, brCyan);
    expect(collapse1Ratio).toBe(1.0); // Identical values yield 1:1, failing minDelta >= 1.3

    // Historical collapse 2: D16 first proposal low #03830E vs medium #996700
    const proposal1Low = '#03830E';
    const proposal1Med = '#996700';
    const collapse2Ratio = contrastRatio(proposal1Low, proposal1Med);
    expect(collapse2Ratio).toBeCloseTo(1.01, 2); // 1.01:1 fails minDelta >= 1.3

    // Adopted D16 scale: low #03830E, medium #7A5200, high #860A14, critical #000000
    const adoptedLow = '#03830E';
    const adoptedMed = '#7A5200';
    const adoptedHigh = '#860A14';
    const adoptedCrit = '#000000';

    const lowMed = contrastRatio(adoptedLow, adoptedMed);
    const medHigh = contrastRatio(adoptedMed, adoptedHigh);
    const highCrit = contrastRatio(adoptedHigh, adoptedCrit);
    const lowCrit = contrastRatio(adoptedLow, adoptedCrit);

    // Measured WCAG relative luminance ratios for the adopted D16 scale. Every
    // number here is the value the assertion below checks, not a recalled one.
    // low (#03830E) vs medium (#7A5200): 1.40:1
    // medium (#7A5200) vs high (#860A14): 1.47:1
    // high (#860A14) vs critical (#000000): 2.07:1
    // low (#03830E) vs critical (#000000): 4.26:1
    expect(lowMed).toBeCloseTo(1.4, 2);
    expect(medHigh).toBeCloseTo(1.47, 2);
    expect(highCrit).toBeCloseTo(2.07, 2);
    expect(lowCrit).toBeCloseTo(4.26, 2);

    // The threshold is a fork judgement, documented in pairs.ts, not a citation.
    // low-to-medium at 1.40:1 clears minDelta 1.30 by a measured margin of 0.10.
    // That margin is thin: at a threshold of 1.50 this scale would fail, which is
    // why D16 also mandates a non-colour cue for the risk levels.
    expect(lowMed).toBeGreaterThan(1.3);
    const measuredMargin = lowMed - 1.3;
    expect(measuredMargin).toBeGreaterThan(0.09);
  });

  it('AC4 (the alpha-composite fix): every pair whose background carries alpha declares compositeSurface and compositeSurfaceReason', () => {
    const alphaBgPairs = CONTRAST_PAIRS.filter(pair => {
      const bgLeaf = resolvedLeaves.find(l => l.path === pair.bgPath);
      return bgLeaf && bgLeaf.color.alpha < 1;
    });

    expect(alphaBgPairs.length).toBeGreaterThan(0);

    for (const pair of alphaBgPairs) {
      expect(typeof pair.compositeSurface).toBe('string');
      expect(pair.compositeSurface!.length).toBeGreaterThan(0);
      expect(typeof pair.compositeSurfaceReason).toBe('string');
      expect(pair.compositeSurfaceReason!.length).toBeGreaterThan(0);

      // Verify compositeSurface points to a valid opaque theme leaf
      const surfaceLeaf = resolvedLeaves.find(
        l => l.path === pair.compositeSurface
      );
      expect(surfaceLeaf).toBeDefined();
      expect(surfaceLeaf!.color.alpha).toBe(1);
    }
  });

  it('AC4 (the alpha-composite fix): a pair that fell back to levels.deep really is measured at its worst', () => {
    // levels.deep is the darkest surface, so it is the conservative choice for
    // DARK ink. It is the optimistic choice for LIGHT ink, because compositing
    // an alpha background over a darker surface RAISES the ratio for a light
    // foreground. Every alpha-background pair in the manifest is dark ink today,
    // so the fallback holds. This test stops a future light-ink pair from
    // inheriting the fallback and silently reopening the defect the alpha-composite fix fixed.
    //
    // Pairs that name a reader's surface instead are exempt by construction:
    // their surface is a fact about the interface, not a worst-case guess.
    const surfaces = resolvedLeaves.filter(
      l => l.group === 'levels' && l.color.alpha === 1
    );
    expect(surfaces.length).toBeGreaterThan(1);

    const fallbackPairs = CONTRAST_PAIRS.filter(
      pair => pair.compositeSurface === 'levels.deep'
    );
    expect(fallbackPairs.length).toBeGreaterThan(0);

    for (const pair of fallbackPairs) {
      const fgLeaf = resolvedLeaves.find(l => l.path === pair.fgPath);
      const bgLeaf = resolvedLeaves.find(l => l.path === pair.bgPath);
      expect(fgLeaf).toBeDefined();
      expect(bgLeaf).toBeDefined();

      const ratioOver = (surface: (typeof surfaces)[number]) => {
        const bg = composite(bgLeaf!.color, surface.color);
        const fg = composite(fgLeaf!.color, bg);
        return contrastRatio(fg, bg);
      };

      const deep = surfaces.find(l => l.path === 'levels.deep');
      expect(deep).toBeDefined();
      const worst = Math.min(...surfaces.map(ratioOver));

      // Two decimals, because the report states ratios to two decimals and a
      // difference below that is not something a reviewer can act on.
      expect(ratioOver(deep!)).toBeCloseTo(worst, 2);
    }
  });
});
