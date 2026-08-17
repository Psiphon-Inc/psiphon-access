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

import {
  composite,
  contrastRatio,
  isOpaque,
  toHex,
  type Color,
  type OpaqueColor,
} from './color';
import {
  CONTRAST_PAIRS,
  DEFERRED_REFERENCE_EDGES,
  SEPARATION_RULES,
  type ContrastPair,
  type DeferredReferenceEdge,
  type SeparationRule,
} from './pairs';
import { getResolvedThemeColors } from './themeColors';

/**
 * Record for a known contrast or separation failure baseline entry.
 * The floor never moves; this records an existing defect that will be fixed by
 * a specific design decision from docs/psiphon-access/design/2026-08-17-theme-token-mapping.md.
 */
export interface BaselineEntry {
  /** Unique descriptor matching ContrastPair.id or SeparationRule.id */
  readonly id: string;
  /** Foreground / first token path */
  readonly tokenA: string;
  /** Surface / second token path */
  readonly tokenB: string;
  /** Measured contrast ratio or separation ratio at baseline recording */
  readonly measuredRatio: number;
  /** Required WCAG floor or separation minDelta */
  readonly floor: number;
  /** Mapping document decision that fixes this defect (e.g., 'D4', 'D12', 'D17'), or 'None' */
  readonly decision: string;
  /** Stated reason for the baseline entry */
  readonly reason: string;
}

/**
 * Explicit, dated baseline of known contrast and separation failures in the un-adapted Teleport inherited theme.
 * Measured against the contrast baseline recorded on 2026-08-18.
 * The baseline can only shrink over time (ratchet rule).
 */
export const CONTRAST_BASELINE: readonly BaselineEntry[] = [
  // --- CONTRAST PAIR KNOWN FAILURES (10 entries) ---
  {
    id: 'text-muted-on-sunken',
    tokenA: 'text.muted',
    tokenB: 'levels.sunken',
    measuredRatio: 4.3,
    floor: 4.5,
    decision: 'D4',
    reason: 'Text muted on sunken surface fails 4.5:1 body text floor',
  },
  {
    id: 'text-muted-on-deep',
    tokenA: 'text.muted',
    tokenB: 'levels.deep',
    measuredRatio: 3.94,
    floor: 4.5,
    decision: 'D4',
    reason:
      'Text muted on deep surface fails 4.5:1 floor (forbidden pairing in D4)',
  },
  {
    id: 'interactive-solid-alert-active',
    tokenA: 'text.main',
    tokenB: 'interactive.solid.alert.active',
    measuredRatio: 4.29,
    floor: 4.5,
    decision: 'D7',
    reason: 'Black text on active alert fill #996700 fails 4.5:1 floor',
  },
  {
    id: 'buttons-border-border-on-deep',
    tokenA: 'buttons.border.border',
    tokenB: 'levels.deep',
    measuredRatio: 2.99,
    floor: 3,
    decision: 'D10',
    reason: 'Button border alpha 0.42 on deep surface fails 3:1 non-text floor',
  },
  {
    id: 'success-main-on-deep',
    tokenA: 'success.main',
    tokenB: 'levels.deep',
    measuredRatio: 4.21,
    floor: 4.5,
    decision: 'None',
    reason: 'Success main ink #03830E on deep surface fails 4.5:1 floor',
  },
  {
    id: 'warning-main-on-deep',
    tokenA: 'warning.main',
    tokenB: 'levels.deep',
    measuredRatio: 4.18,
    floor: 4.5,
    decision: 'D11',
    reason: 'Warning main ink #996700 on deep surface fails 4.5:1 floor',
  },
  {
    id: 'link-on-deep',
    tokenA: 'link',
    tokenB: 'levels.deep',
    measuredRatio: 4.31,
    floor: 4.5,
    decision: 'D8',
    reason: 'Link ink #0073BA on deep surface fails 4.5:1 floor',
  },
  {
    id: 'sessionRecording-progress-on-trackBg',
    tokenA: 'sessionRecording.player.progressBar.progress',
    tokenB: 'sessionRecording.player.progressBar.background',
    measuredRatio: 2.82,
    floor: 3,
    decision: 'D15',
    reason:
      'Progress bar fill #CC5A30 on track background over deep surface fails 3:1 non-text floor',
  },
  {
    id: 'sessionRecording-seeking-on-surface',
    tokenA: 'sessionRecording.player.progressBar.seeking',
    tokenB: 'levels.surface',
    measuredRatio: 1.41,
    floor: 3,
    decision: 'None',
    reason: 'Seeking bar fill #D9D9D9 on surface fails 3:1 non-text floor',
  },
  {
    id: 'timeline-events-default-text-on-bg',
    tokenA: 'sessionRecordingTimeline.events.default.text',
    tokenB: 'sessionRecordingTimeline.events.default.background',
    measuredRatio: 4.06,
    floor: 4.5,
    decision: 'None',
    reason:
      'Black text on translucent default event background over deep surface fails 4.5:1 floor',
  },

  // --- SEPARATION RULE KNOWN FAILURES (29 entries) ---
  // Primary tier dataVisualisation series separation failures (17 rules)
  {
    id: 'dataVis-sep-primary.purple-primary.wednesdays',
    tokenA: 'dataVisualisation.primary.purple',
    tokenB: 'dataVisualisation.primary.wednesdays',
    measuredRatio: 1.2,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary purple vs wednesdays fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.purple-primary.sunflower',
    tokenA: 'dataVisualisation.primary.purple',
    tokenB: 'dataVisualisation.primary.sunflower',
    measuredRatio: 1.09,
    floor: 1.3,
    decision: 'D25',
    reason:
      'NEW, not inherited. D25 moved primary.sunflower to #7A5200 and that created this separation failure. It is accepted because primary.purple has no reader, so the two inks cannot appear together. Remove this entry if primary.purple ever gains a reader.',
  },
  {
    id: 'dataVis-sep-primary.wednesdays-primary.picton',
    tokenA: 'dataVisualisation.primary.wednesdays',
    tokenB: 'dataVisualisation.primary.picton',
    measuredRatio: 1.14,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary wednesdays vs picton fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.wednesdays-primary.sunflower',
    tokenA: 'dataVisualisation.primary.wednesdays',
    tokenB: 'dataVisualisation.primary.sunflower',
    measuredRatio: 1.09,
    floor: 1.3,
    decision: 'D25',
    reason: 'DataVis primary wednesdays vs sunflower fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.wednesdays-primary.caribbean',
    tokenA: 'dataVisualisation.primary.wednesdays',
    tokenB: 'dataVisualisation.primary.caribbean',
    measuredRatio: 1.12,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary wednesdays vs caribbean fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.wednesdays-primary.abbey',
    tokenA: 'dataVisualisation.primary.wednesdays',
    tokenB: 'dataVisualisation.primary.abbey',
    measuredRatio: 1.15,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary wednesdays vs abbey fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.wednesdays-primary.cyan',
    tokenA: 'dataVisualisation.primary.wednesdays',
    tokenB: 'dataVisualisation.primary.cyan',
    measuredRatio: 1.12,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary wednesdays vs cyan fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.picton-primary.sunflower',
    tokenA: 'dataVisualisation.primary.picton',
    tokenB: 'dataVisualisation.primary.sunflower',
    measuredRatio: 1.25,
    floor: 1.3,
    decision: 'D25',
    reason: 'DataVis primary picton vs sunflower fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.picton-primary.caribbean',
    tokenA: 'dataVisualisation.primary.picton',
    tokenB: 'dataVisualisation.primary.caribbean',
    measuredRatio: 1.02,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary picton vs caribbean fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.picton-primary.abbey',
    tokenA: 'dataVisualisation.primary.picton',
    tokenB: 'dataVisualisation.primary.abbey',
    measuredRatio: 1.0,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary picton vs abbey fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.picton-primary.cyan',
    tokenA: 'dataVisualisation.primary.picton',
    tokenB: 'dataVisualisation.primary.cyan',
    measuredRatio: 1.02,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary picton vs cyan fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.sunflower-primary.caribbean',
    tokenA: 'dataVisualisation.primary.sunflower',
    tokenB: 'dataVisualisation.primary.caribbean',
    measuredRatio: 1.23,
    floor: 1.3,
    decision: 'D25',
    reason: 'DataVis primary sunflower vs caribbean fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.sunflower-primary.abbey',
    tokenA: 'dataVisualisation.primary.sunflower',
    tokenB: 'dataVisualisation.primary.abbey',
    measuredRatio: 1.25,
    floor: 1.3,
    decision: 'D25',
    reason: 'DataVis primary sunflower vs abbey fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.sunflower-primary.cyan',
    tokenA: 'dataVisualisation.primary.sunflower',
    tokenB: 'dataVisualisation.primary.cyan',
    measuredRatio: 1.23,
    floor: 1.3,
    decision: 'D25',
    reason: 'DataVis primary sunflower vs cyan fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.caribbean-primary.abbey',
    tokenA: 'dataVisualisation.primary.caribbean',
    tokenB: 'dataVisualisation.primary.abbey',
    measuredRatio: 1.02,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary caribbean vs abbey fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.caribbean-primary.cyan',
    tokenA: 'dataVisualisation.primary.caribbean',
    tokenB: 'dataVisualisation.primary.cyan',
    measuredRatio: 1.0,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary caribbean vs cyan fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-primary.abbey-primary.cyan',
    tokenA: 'dataVisualisation.primary.abbey',
    tokenB: 'dataVisualisation.primary.cyan',
    measuredRatio: 1.02,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis primary abbey vs cyan fails 1.3:1 separation',
  },

  // Secondary tier dataVisualisation series separation failures (7 rules)
  {
    id: 'dataVis-sep-secondary.wednesdays-secondary.sunflower',
    tokenA: 'dataVisualisation.secondary.wednesdays',
    tokenB: 'dataVisualisation.secondary.sunflower',
    measuredRatio: 1.03,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis secondary wednesdays vs sunflower fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-secondary.wednesdays-secondary.abbey',
    tokenA: 'dataVisualisation.secondary.wednesdays',
    tokenB: 'dataVisualisation.secondary.abbey',
    measuredRatio: 1.0,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis secondary wednesdays vs abbey fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-secondary.wednesdays-secondary.cyan',
    tokenA: 'dataVisualisation.secondary.wednesdays',
    tokenB: 'dataVisualisation.secondary.cyan',
    measuredRatio: 1.01,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis secondary wednesdays vs cyan fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-secondary.picton-secondary.caribbean',
    tokenA: 'dataVisualisation.secondary.picton',
    tokenB: 'dataVisualisation.secondary.caribbean',
    measuredRatio: 1.02,
    floor: 1.3,
    decision: 'D24/D26',
    reason: 'DataVis secondary picton vs caribbean fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-secondary.sunflower-secondary.abbey',
    tokenA: 'dataVisualisation.secondary.sunflower',
    tokenB: 'dataVisualisation.secondary.abbey',
    measuredRatio: 1.03,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis secondary sunflower vs abbey fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-secondary.sunflower-secondary.cyan',
    tokenA: 'dataVisualisation.secondary.sunflower',
    tokenB: 'dataVisualisation.secondary.cyan',
    measuredRatio: 1.02,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis secondary sunflower vs cyan fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-secondary.abbey-secondary.cyan',
    tokenA: 'dataVisualisation.secondary.abbey',
    tokenB: 'dataVisualisation.secondary.cyan',
    measuredRatio: 1.01,
    floor: 1.3,
    decision: 'None',
    reason: 'DataVis secondary abbey vs cyan fails 1.3:1 separation',
  },

  // Tertiary tier dataVisualisation series separation failures (5 rules)
  {
    id: 'dataVis-sep-tertiary.wednesdays-tertiary.picton',
    tokenA: 'dataVisualisation.tertiary.wednesdays',
    tokenB: 'dataVisualisation.tertiary.picton',
    measuredRatio: 1.12,
    floor: 1.3,
    decision: 'D24',
    reason: 'DataVis tertiary wednesdays vs picton fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-tertiary.wednesdays-tertiary.abbey',
    tokenA: 'dataVisualisation.tertiary.wednesdays',
    tokenB: 'dataVisualisation.tertiary.abbey',
    // NEW, not inherited. D23 moved tertiary.abbey to #860A14 and that created
    // this separation failure. It is accepted because tertiary.wednesdays has no
    // reader, so the two inks cannot appear together. Remove this entry if
    // tertiary.wednesdays ever gains a reader.
    measuredRatio: 1.11,
    floor: 1.3,
    decision: 'D23',
    reason: 'DataVis tertiary wednesdays vs abbey fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-tertiary.picton-tertiary.abbey',
    tokenA: 'dataVisualisation.tertiary.picton',
    tokenB: 'dataVisualisation.tertiary.abbey',
    measuredRatio: 1.01,
    floor: 1.3,
    decision: 'D23/D24',
    reason: 'DataVis tertiary picton vs abbey fails 1.3:1 separation',
  },
  {
    id: 'dataVis-sep-tertiary.sunflower-tertiary.caribbean',
    tokenA: 'dataVisualisation.tertiary.sunflower',
    tokenB: 'dataVisualisation.tertiary.caribbean',
    measuredRatio: 1.01,
    floor: 1.3,
    decision: 'D20/D21',
    reason: 'DataVis tertiary sunflower vs caribbean fails 1.3:1 separation',
  },
];

export type PairVerdict =
  | 'PASS'
  | 'FAIL'
  | 'BASELINE'
  | 'RATCHET_FAIL'
  | 'EXEMPT'
  | 'NOT_BOUNDARY'
  | 'DEFERRED';

export interface PairResult {
  readonly pair: ContrastPair;
  readonly fgHex: string;
  readonly bgHex: string;
  readonly measuredRatio: number;
  readonly floor: number;
  readonly verdict: PairVerdict;
  readonly failureMessage?: string;
}

export type SeparationVerdict =
  | 'PASS'
  | 'FAIL'
  | 'BASELINE'
  | 'RATCHET_FAIL'
  | 'DEFERRED';

export interface SeparationResult {
  readonly rule: SeparationRule;
  readonly tokenAHex: string;
  readonly tokenBHex: string;
  readonly measuredRatio: number;
  readonly minDelta: number;
  readonly verdict: SeparationVerdict;
  readonly failureMessage?: string;
}

export type DeferredEdgeVerdict =
  | 'PASS'
  | 'MOVED_FAIL'
  | 'ABSENT_FAIL'
  | 'EXTRA_FAIL'
  | 'MISMATCH_FAIL';

export interface DeferredEdgeResult {
  readonly edge: DeferredReferenceEdge;
  readonly measuredSourcePath?: string;
  readonly measuredInheritedHex?: string;
  readonly verdict: DeferredEdgeVerdict;
  readonly failureMessage?: string;
}

export interface GateEvaluation {
  readonly leafCount: number;
  readonly pairResults: PairResult[];
  readonly separationResults: SeparationResult[];
  readonly deferredEdgeResults: DeferredEdgeResult[];
  readonly unhandledFailures: string[];
  readonly ratchetFailures: string[];
  readonly separationFailures: string[];
  readonly deferredReferenceFailures: string[];
  readonly counts: {
    readonly totalLeaves: number;
    readonly totalPairs: number;
    readonly pass: number;
    readonly baseline: number;
    readonly exempt: number;
    readonly notBoundary: number;
    readonly deferred: number;
    readonly fail: number;
    readonly ratchetFail: number;
    readonly separationTotal: number;
    readonly separationPass: number;
    readonly separationBaseline: number;
    readonly separationFail: number;
    readonly separationRatchetFail: number;
    readonly separationDeferred: number;
    readonly deferredEdgeTotal: number;
    readonly deferredEdgePass: number;
    readonly deferredEdgeFail: number;
  };
}

function resolveOpaqueFg(fgColor: Color, bgOpaque: OpaqueColor): OpaqueColor {
  if (isOpaque(fgColor)) {
    return fgColor;
  }
  return composite(fgColor, bgOpaque);
}

export function evaluateContrastGate(
  theme?: any,
  baseline: readonly BaselineEntry[] = CONTRAST_BASELINE,
  declaredEdges: readonly DeferredReferenceEdge[] = DEFERRED_REFERENCE_EDGES
): GateEvaluation {
  const leaves = getResolvedThemeColors(theme);
  const colorMap = new Map<string, Color>();
  for (const leaf of leaves) {
    colorMap.set(leaf.path, leaf.color);
  }

  const baselineMap = new Map<string, BaselineEntry>();
  for (const entry of baseline) {
    baselineMap.set(entry.id, entry);
  }

  const pairResults: PairResult[] = [];
  const unhandledFailures: string[] = [];
  const ratchetFailures: string[] = [];

  let passCount = 0;
  let baselineCount = 0;
  let exemptCount = 0;
  let notBoundaryCount = 0;
  let deferredCount = 0;
  let failCount = 0;
  let ratchetFailCount = 0;

  for (const pair of CONTRAST_PAIRS) {
    const fgColor = colorMap.get(pair.fgPath);
    if (!fgColor) {
      throw new Error(`Missing leaf color for fgPath "${pair.fgPath}"`);
    }
    const bgColor = colorMap.get(pair.bgPath);
    if (!bgColor) {
      throw new Error(`Missing leaf color for bgPath "${pair.bgPath}"`);
    }

    let bgOpaque: OpaqueColor;
    if (isOpaque(bgColor)) {
      bgOpaque = bgColor;
    } else {
      if (!pair.compositeSurface || !pair.compositeSurfaceReason) {
        throw new Error(
          `Pair "${pair.id}" has alpha-carrying background "${pair.bgPath}" (alpha=${bgColor.alpha}) but does not declare compositeSurface and compositeSurfaceReason.`
        );
      }
      const surfaceColor = colorMap.get(pair.compositeSurface);
      if (!surfaceColor) {
        throw new Error(
          `Missing leaf color for compositeSurface "${pair.compositeSurface}" in pair "${pair.id}"`
        );
      }
      if (!isOpaque(surfaceColor)) {
        throw new Error(
          `compositeSurface "${pair.compositeSurface}" for pair "${pair.id}" is not opaque (alpha=${surfaceColor.alpha})`
        );
      }
      bgOpaque = composite(bgColor, surfaceColor);
    }
    const fgOpaque = resolveOpaqueFg(fgColor, bgOpaque);

    const rawRatio = contrastRatio(fgOpaque, bgOpaque);
    const measuredRatio = Math.round(rawRatio * 100) / 100;
    const fgHex = toHex(fgOpaque);
    const bgHex = toHex(bgOpaque);

    let verdict: PairVerdict;
    let failureMessage: string | undefined;

    if (pair.exempt) {
      verdict = 'EXEMPT';
      exemptCount++;
    } else if (pair.notBoundary) {
      verdict = 'NOT_BOUNDARY';
      notBoundaryCount++;
    } else if (pair.deferred) {
      verdict = 'DEFERRED';
      deferredCount++;
    } else {
      const meetsFloor = measuredRatio >= pair.floor;
      const isBaselined = baselineMap.has(pair.id);

      if (meetsFloor) {
        if (isBaselined) {
          verdict = 'RATCHET_FAIL';
          ratchetFailCount++;
          failureMessage = `Baselined pair "${pair.id}" now meets its floor (${measuredRatio}:1 >= ${pair.floor}:1) and must be removed from the baseline. Token paths: fg=${pair.fgPath} (${fgHex}), bg=${pair.bgPath} (${bgHex}).`;
          ratchetFailures.push(failureMessage);
        } else {
          verdict = 'PASS';
          passCount++;
        }
      } else {
        if (isBaselined) {
          verdict = 'BASELINE';
          baselineCount++;
        } else {
          verdict = 'FAIL';
          failCount++;
          failureMessage = `Contrast failure for pair "${pair.id}": fg=${pair.fgPath} (${fgHex}) on bg=${pair.bgPath} (${bgHex}) measured ratio ${measuredRatio}:1 below floor ${pair.floor}:1.`;
          unhandledFailures.push(failureMessage);
        }
      }
    }

    pairResults.push({
      pair,
      fgHex,
      bgHex,
      measuredRatio,
      floor: pair.floor,
      verdict,
      failureMessage,
    });
  }

  const separationResults: SeparationResult[] = [];
  const separationFailures: string[] = [];
  let separationPass = 0;
  let separationBaseline = 0;
  let separationFail = 0;
  let separationRatchetFail = 0;
  let separationDeferred = 0;

  for (const rule of SEPARATION_RULES) {
    const colorA = colorMap.get(rule.tokenA);
    if (!colorA) {
      throw new Error(`Missing leaf color for tokenA "${rule.tokenA}"`);
    }
    const colorB = colorMap.get(rule.tokenB);
    if (!colorB) {
      throw new Error(`Missing leaf color for tokenB "${rule.tokenB}"`);
    }

    if (!isOpaque(colorA)) {
      throw new Error(
        `Separation rule "${rule.id}" tokenA "${rule.tokenA}" carries alpha (${colorA.alpha}) without a surface.`
      );
    }
    if (!isOpaque(colorB)) {
      throw new Error(
        `Separation rule "${rule.id}" tokenB "${rule.tokenB}" carries alpha (${colorB.alpha}) without a surface.`
      );
    }
    const opaqueA = colorA;
    const opaqueB = colorB;

    const rawRatio = contrastRatio(opaqueA, opaqueB);
    const measuredRatio = Math.round(rawRatio * 100) / 100;
    const tokenAHex = toHex(opaqueA);
    const tokenBHex = toHex(opaqueB);

    let verdict: SeparationVerdict;
    let failureMessage: string | undefined;

    if (rule.deferred) {
      verdict = 'DEFERRED';
      separationDeferred++;
    } else {
      const meetsFloor = measuredRatio >= rule.minDelta;
      const isBaselined = baselineMap.has(rule.id);

      if (meetsFloor) {
        if (isBaselined) {
          verdict = 'RATCHET_FAIL';
          separationRatchetFail++;
          failureMessage = `Baselined separation rule "${rule.id}" now meets its minDelta (${measuredRatio}:1 >= ${rule.minDelta}:1) and must be removed from the baseline. Tokens: tokenA=${rule.tokenA} (${tokenAHex}), tokenB=${rule.tokenB} (${tokenBHex}).`;
          ratchetFailures.push(failureMessage);
        } else {
          verdict = 'PASS';
          separationPass++;
        }
      } else {
        if (isBaselined) {
          verdict = 'BASELINE';
          separationBaseline++;
        } else {
          verdict = 'FAIL';
          separationFail++;
          failureMessage = `Separation failure for rule "${rule.id}": tokenA=${rule.tokenA} (${tokenAHex}) vs tokenB=${rule.tokenB} (${tokenBHex}) measured ratio ${measuredRatio}:1 below minDelta ${rule.minDelta}:1.`;
          separationFailures.push(failureMessage);
        }
      }
    }

    separationResults.push({
      rule,
      tokenAHex,
      tokenBHex,
      measuredRatio,
      minDelta: rule.minDelta,
      verdict,
      failureMessage,
    });
  }

  // --- DEFERRED REFERENCE EDGE GUARD ---
  const deferredEdgeResults: DeferredEdgeResult[] = [];
  const deferredReferenceFailures: string[] = [];
  let deferredEdgePass = 0;
  let deferredEdgeFail = 0;

  const themeEdgeMap = new Map<
    string,
    { deferredPath: string; sourcePath: string; inheritedHex: string }
  >();

  for (const leaf of leaves) {
    if (leaf.rawValue) {
      const match = /^\{colors\.([^}]+)\}$/.exec(leaf.rawValue.trim());
      if (match) {
        const sourcePath = match[1].trim();
        const inheritedHex = toHex(leaf.color);
        themeEdgeMap.set(leaf.path, {
          deferredPath: leaf.path,
          sourcePath,
          inheritedHex,
        });
      }
    }
  }

  const declaredMap = new Map<string, DeferredReferenceEdge>();
  for (const edge of declaredEdges) {
    declaredMap.set(edge.deferredPath, edge);
  }

  for (const edge of declaredEdges) {
    const themeEdge = themeEdgeMap.get(edge.deferredPath);
    if (!themeEdge) {
      const failureMessage = `Declared deferred reference edge "${edge.deferredPath}" -> "${edge.sourcePath}" is absent from theme.`;
      deferredReferenceFailures.push(failureMessage);
      deferredEdgeFail++;
      deferredEdgeResults.push({
        edge,
        verdict: 'ABSENT_FAIL',
        failureMessage,
      });
    } else if (themeEdge.sourcePath !== edge.sourcePath) {
      const failureMessage = `Deferred reference edge source mismatch for "${edge.deferredPath}": declared source "${edge.sourcePath}" but theme has "${themeEdge.sourcePath}".`;
      deferredReferenceFailures.push(failureMessage);
      deferredEdgeFail++;
      deferredEdgeResults.push({
        edge,
        measuredSourcePath: themeEdge.sourcePath,
        measuredInheritedHex: themeEdge.inheritedHex,
        verdict: 'MISMATCH_FAIL',
        failureMessage,
      });
    } else if (themeEdge.inheritedHex !== edge.inheritedHex) {
      const failureMessage = `Deferred reference edge value moved for "${edge.deferredPath}": measured resolved value ${themeEdge.inheritedHex} no longer matches declared inherited value ${edge.inheritedHex} (moved by ${edge.decision} decision on ${edge.sourcePath} to ${edge.decidedHex}).`;
      deferredReferenceFailures.push(failureMessage);
      deferredEdgeFail++;
      deferredEdgeResults.push({
        edge,
        measuredSourcePath: themeEdge.sourcePath,
        measuredInheritedHex: themeEdge.inheritedHex,
        verdict: 'MOVED_FAIL',
        failureMessage,
      });
    } else {
      deferredEdgePass++;
      deferredEdgeResults.push({
        edge,
        measuredSourcePath: themeEdge.sourcePath,
        measuredInheritedHex: themeEdge.inheritedHex,
        verdict: 'PASS',
      });
    }
  }

  for (const [deferredPath, themeEdge] of themeEdgeMap) {
    if (
      (deferredPath.startsWith('terminal.') ||
        deferredPath.startsWith('editor.')) &&
      !declaredMap.has(deferredPath)
    ) {
      const failureMessage = `Undeclared deferred reference edge present in theme: "${deferredPath}" -> "${themeEdge.sourcePath}".`;
      deferredReferenceFailures.push(failureMessage);
      deferredEdgeFail++;
      deferredEdgeResults.push({
        edge: {
          deferredPath,
          sourcePath: themeEdge.sourcePath,
          decision: 'None',
          inheritedHex: themeEdge.inheritedHex,
          decidedHex: themeEdge.inheritedHex,
        },
        measuredSourcePath: themeEdge.sourcePath,
        measuredInheritedHex: themeEdge.inheritedHex,
        verdict: 'EXTRA_FAIL',
        failureMessage,
      });
    }
  }

  return {
    leafCount: leaves.length,
    pairResults,
    separationResults,
    deferredEdgeResults,
    unhandledFailures,
    ratchetFailures,
    separationFailures,
    deferredReferenceFailures,
    counts: {
      totalLeaves: leaves.length,
      totalPairs: CONTRAST_PAIRS.length,
      pass: passCount,
      baseline: baselineCount,
      exempt: exemptCount,
      notBoundary: notBoundaryCount,
      deferred: deferredCount,
      fail: failCount,
      ratchetFail: ratchetFailCount,
      separationTotal: SEPARATION_RULES.length,
      separationPass,
      separationBaseline,
      separationFail,
      separationRatchetFail,
      separationDeferred,
      deferredEdgeTotal: declaredEdges.length,
      deferredEdgePass,
      deferredEdgeFail,
    },
  };
}

export function formatContrastReport(evaluation: GateEvaluation): string {
  const lines: string[] = [];

  lines.push('====================================================');
  lines.push('PSIPHON ACCESS THEME CONTRAST & SEPARATION REPORT');
  lines.push('====================================================');
  lines.push(`Total Theme Leaves Resolved: ${evaluation.leafCount}`);
  lines.push(`Total Pairs Evaluated: ${evaluation.counts.totalPairs}`);
  lines.push(`  - PASS: ${evaluation.counts.pass}`);
  lines.push(`  - BASELINE (Known Failures): ${evaluation.counts.baseline}`);
  lines.push(`  - EXEMPT: ${evaluation.counts.exempt}`);
  lines.push(`  - NOT_BOUNDARY: ${evaluation.counts.notBoundary}`);
  lines.push(`  - DEFERRED: ${evaluation.counts.deferred}`);
  lines.push(`  - UNHANDLED FAIL: ${evaluation.counts.fail}`);
  lines.push(`  - RATCHET FAIL: ${evaluation.counts.ratchetFail}`);
  lines.push('');
  lines.push('--- CONTRAST PAIR RESULTS ---');

  for (const res of evaluation.pairResults) {
    const { pair, fgHex, bgHex, measuredRatio, floor, verdict } = res;
    lines.push(
      `[${verdict}] ${pair.id}: fg=${pair.fgPath} (${fgHex}) on bg=${pair.bgPath} (${bgHex}) -> ${measuredRatio.toFixed(
        2
      )}:1 (floor: ${floor}:1, kind: ${pair.kind})`
    );
  }

  lines.push('');
  lines.push('--- SEPARATION RULE RESULTS ---');
  lines.push(`Total Separation Rules: ${evaluation.counts.separationTotal}`);
  lines.push(`  - PASS: ${evaluation.counts.separationPass}`);
  lines.push(
    `  - BASELINE (Known Failures): ${evaluation.counts.separationBaseline}`
  );
  lines.push(`  - UNHANDLED FAIL: ${evaluation.counts.separationFail}`);
  lines.push(`  - RATCHET FAIL: ${evaluation.counts.separationRatchetFail}`);
  lines.push(`  - DEFERRED: ${evaluation.counts.separationDeferred}`);

  for (const res of evaluation.separationResults) {
    const { rule, tokenAHex, tokenBHex, measuredRatio, minDelta, verdict } =
      res;
    lines.push(
      `[${verdict}] ${rule.id}: tokenA=${rule.tokenA} (${tokenAHex}) vs tokenB=${rule.tokenB} (${tokenBHex}) -> ${measuredRatio.toFixed(
        2
      )}:1 (minDelta: ${minDelta}:1)`
    );
  }

  lines.push('');
  lines.push('--- DEFERRED REFERENCE EDGE RESULTS ---');
  lines.push(
    `Total Deferred Reference Edges: ${evaluation.counts.deferredEdgeTotal}`
  );
  lines.push(`  - PASS: ${evaluation.counts.deferredEdgePass}`);
  lines.push(`  - FAIL: ${evaluation.counts.deferredEdgeFail}`);

  for (const res of evaluation.deferredEdgeResults) {
    const { edge, measuredInheritedHex, verdict, failureMessage } = res;
    if (verdict === 'PASS') {
      const decInfo =
        edge.decision !== 'D27' && edge.decision !== 'None'
          ? ` (${edge.decision} -> ${edge.decidedHex})`
          : '';
      lines.push(
        `[PASS] ${edge.deferredPath}: ${edge.deferredPath} (${measuredInheritedHex}) -> ${edge.sourcePath}${decInfo}`
      );
    } else {
      lines.push(`[${verdict}] ${edge.deferredPath}: ${failureMessage}`);
    }
  }

  lines.push('====================================================');
  return lines.join('\n');
}
