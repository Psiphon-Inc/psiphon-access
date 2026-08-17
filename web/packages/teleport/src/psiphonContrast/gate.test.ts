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

import { psiphonUiTheme } from '../psiphonTheme';
import {
  CONTRAST_BASELINE,
  evaluateContrastGate,
  formatContrastReport,
  type BaselineEntry,
} from './gate';

describe('psiphonContrast gate', () => {
  it('evaluates contrast gate and prints full report', () => {
    const evaluation = evaluateContrastGate();
    const report = formatContrastReport(evaluation);

    // Print report so evidence is recorded in test output
    // eslint-disable-next-line no-console
    console.log(report);

    expect(evaluation.unhandledFailures).toEqual([]);
    expect(evaluation.ratchetFailures).toEqual([]);
    expect(evaluation.separationFailures).toEqual([]);
    expect(evaluation.deferredReferenceFailures).toEqual([]);
    expect(evaluation.counts.fail).toBe(0);
    expect(evaluation.counts.ratchetFail).toBe(0);
    expect(evaluation.counts.separationFail).toBe(0);
    expect(evaluation.counts.deferredEdgeFail).toBe(0);

    // Verify expected counts
    expect(evaluation.leafCount).toBe(174);
    expect(evaluation.counts.totalPairs).toBe(179);
    expect(evaluation.counts.pass).toBe(156);
    expect(evaluation.counts.baseline).toBe(10);
    expect(evaluation.counts.exempt).toBe(10);
    expect(evaluation.counts.notBoundary).toBe(3);
    expect(evaluation.counts.deferred).toBe(0);

    expect(evaluation.counts.separationTotal).toBe(71);
    expect(evaluation.counts.separationPass).toBe(43);
    expect(evaluation.counts.separationBaseline).toBe(28);
    expect(evaluation.counts.separationDeferred).toBe(0);

    expect(evaluation.counts.deferredEdgeTotal).toBe(0);
    expect(evaluation.counts.deferredEdgePass).toBe(0);
  });

  it('fails with detailed message when a pair below floor is not in baseline', () => {
    // Evaluate with an empty baseline (simulating an un-baselined failure)
    const evaluation = evaluateContrastGate(psiphonUiTheme, []);

    expect(evaluation.unhandledFailures.length).toBeGreaterThan(0);
    const failureMsg = evaluation.unhandledFailures.find(msg =>
      msg.includes('text-muted-on-deep')
    );
    expect(failureMsg).toBeDefined();

    // Verify failure message names both token paths, resolved colours, measured ratio, and floor
    expect(failureMsg).toContain('fg=text.muted');
    expect(failureMsg).toContain('bg=levels.deep');
    expect(failureMsg).toContain('(#757575)');
    expect(failureMsg).toContain('(#EDEDED)');
    expect(failureMsg).toContain('3.94:1');
    expect(failureMsg).toContain('floor 4.5:1');
  });

  it('fails with ratchet error when a baselined pair now meets its floor', () => {
    // Create a mock baseline where a passing pair (text-main-on-elevated) is falsely marked as failing
    const mockBaseline: BaselineEntry[] = [
      ...CONTRAST_BASELINE,
      {
        id: 'text-main-on-elevated',
        tokenA: 'text.main',
        tokenB: 'levels.elevated',
        measuredRatio: 21,
        floor: 4.5,
        decision: 'None',
        reason: 'Mock baseline entry that should trigger ratchet failure',
      },
    ];

    const evaluation = evaluateContrastGate(psiphonUiTheme, mockBaseline);

    expect(evaluation.ratchetFailures.length).toBe(1);
    const ratchetMsg = evaluation.ratchetFailures[0];
    expect(ratchetMsg).toContain(
      'Baselined pair "text-main-on-elevated" now meets its floor'
    );
    expect(ratchetMsg).toContain('fg=text.main');
    expect(ratchetMsg).toContain('bg=levels.elevated');
  });

  it('proves gate is not vacuous: weakening a theme leaf produces a named failure', () => {
    // Clone theme and weaken text.main from black to light grey #B0B0B0 on levels.surface
    const modifiedTheme = JSON.parse(JSON.stringify(psiphonUiTheme));
    modifiedTheme.config.theme.semanticTokens.colors.text.main = {
      value: { _light: '#B0B0B0' },
    };

    const evaluation = evaluateContrastGate(modifiedTheme);

    // Weakening text.main must cause previously passing pairs (like text-main-on-surface) to fail
    expect(evaluation.unhandledFailures.length).toBeGreaterThan(0);
    const weakenedFailure = evaluation.unhandledFailures.find(msg =>
      msg.includes('text-main-on-surface')
    );
    expect(weakenedFailure).toBeDefined();
    expect(weakenedFailure).toContain('fg=text.main');
    expect(weakenedFailure).toContain('bg=levels.surface');
    expect(weakenedFailure).toContain('floor 4.5:1');
  });

  it('proves deferred reference edge guard is not vacuous: mutating a declared entry produces a named failure', () => {
    // Synthetic edge list to prove the edge guard
    const syntheticEdges = [
      {
        deferredPath: 'terminal.background',
        sourcePath: 'levels.sunken',
        decision: 'D6',
        inheritedHex: '#F7F7F7',
        decidedHex: '#F7F7F7',
      },
    ];
    const mutatedEdges = syntheticEdges.map(edge => ({
      ...edge,
      inheritedHex: '#000000',
    }));

    const evaluation = evaluateContrastGate(
      psiphonUiTheme,
      CONTRAST_BASELINE,
      mutatedEdges
    );

    expect(evaluation.deferredReferenceFailures.length).toBe(1);
    const failureMsg = evaluation.deferredReferenceFailures[0];
    expect(failureMsg).toContain('terminal.background');
    expect(failureMsg).toContain(
      'Declared deferred reference edge "terminal.background" -> "levels.sunken" is absent from theme.'
    );
  });
});
