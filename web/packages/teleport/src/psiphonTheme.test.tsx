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
  createThemeSystem,
  LEGACY_THEME_COLORS,
} from '@gravitational/design-system';
import { render, screen } from '@testing-library/react';

import Box from 'design/Box';
import { Button } from 'design/Button';
import { resolveTheme } from 'design/theme';
import { ConfiguredThemeProvider } from 'design/ThemeProvider';

import { psiphonLegacyTheme, psiphonUiTheme } from './psiphonTheme';

const PRIMARY_DEFAULT_VARIABLE =
  '--teleport-colors-interactive-solid-primary-default';

type CssVariables = Record<string, string>;

function getLightCssVariables(config: object): CssVariables {
  const system = createThemeSystem(config as never);
  const variableMaps = system.tokens.cssVarMap as Map<
    string,
    Map<string, string>
  >;

  return Object.fromEntries([
    ...(variableMaps.get('base') ?? new Map()),
    ...(variableMaps.get('_light') ?? new Map()),
  ]);
}

function getLegacyLeaves(
  node: unknown,
  path: string[] = []
): Array<{ path: string; value: string }> {
  if (typeof node === 'string') {
    return [{ path: path.join('.'), value: node }];
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }

  return Object.entries(node).flatMap(([key, value]) =>
    getLegacyLeaves(value, [...path, key])
  );
}

function findMissingVariables(
  leaves: Array<{ path: string; value: string }>,
  variables: CssVariables
): string[] {
  return leaves.flatMap(leaf => {
    const match = /^var\((--teleport-[^)]+)\)$/.exec(leaf.value);
    if (!match) {
      return [`${leaf.path}: ${leaf.value}`];
    }
    if (!variables[match[1]]) {
      return [`${leaf.path}: ${match[1]}`];
    }
    return [];
  });
}

describe('Psiphon legacy theme indirection', () => {
  it('changes the styled Button color when the Chakra token changes', () => {
    const legacyTheme = resolveTheme(psiphonLegacyTheme);
    render(
      <ConfiguredThemeProvider theme={legacyTheme}>
        <Button>Continue</Button>
      </ConfiguredThemeProvider>
    );

    const pointer = legacyTheme.colors.interactive.solid.primary.default;
    expect(pointer).toBe(`var(${PRIMARY_DEFAULT_VARIABLE})`);
    expect(getComputedStyle(screen.getByRole('button')).backgroundColor).toBe(
      pointer
    );

    const originalVariables = getLightCssVariables(psiphonUiTheme.config);
    expect(originalVariables[PRIMARY_DEFAULT_VARIABLE]).toBe('#000000');

    const changedConfig = structuredClone(psiphonUiTheme.config);
    changedConfig.theme.semanticTokens.colors.interactive.solid.primary.default.value._light =
      '#123456';
    const changedVariables = getLightCssVariables(changedConfig);
    expect(changedVariables[PRIMARY_DEFAULT_VARIABLE]).toBe('#123456');
  });

  it('keeps colors out of the Psiphon legacy theme definition', () => {
    expect(psiphonLegacyTheme).not.toHaveProperty('colors');
  });

  it('identifies each legacy pointer that Chakra does not emit', () => {
    const leaves = getLegacyLeaves(LEGACY_THEME_COLORS);
    const variables = getLightCssVariables(psiphonUiTheme.config);
    const missing = findMissingVariables(leaves, variables);

    // Measured on 2026-08-21: 476 leaves and 76 missing pointers, across the
    // A100, A200, A400 and A700 shades of 19 Material groups. Those two counts
    // are NOT asserted. A design-system bump moves them, and a test that pins
    // today's count fails tomorrow for a reason that is not a defect. Assert
    // the RELATIONSHIP instead, which is the real invariant.
    expect(leaves.length).toBeGreaterThan(0);
    expect(missing).toEqual(
      expect.arrayContaining([
        'amber.A100: --teleport-colors-amber-a100',
        'yellow.A700: --teleport-colors-yellow-a700',
      ])
    );
    // every() passes vacuously on an empty array, so non-vacuity is asserted
    // separately. Without it, this whole check would go quiet if the emitted
    // variable names ever changed shape.
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every(item => /\.A(100|200|400|700):/.test(item))).toBe(
      true
    );

    render(
      <ConfiguredThemeProvider theme={resolveTheme(psiphonLegacyTheme)}>
        <Box data-testid="material-a-surface" bg="amber.A100" />
      </ConfiguredThemeProvider>
    );
    expect(
      getComputedStyle(screen.getByTestId('material-a-surface')).backgroundColor
    ).toBe('var(--teleport-colors-amber-a100)');
    expect(variables['--teleport-colors-amber-a100']).toBeUndefined();

    const brokenVariables = { ...variables };
    delete brokenVariables[PRIMARY_DEFAULT_VARIABLE];
    expect(findMissingVariables(leaves, brokenVariables)).toContain(
      `interactive.solid.primary.default: ${PRIMARY_DEFAULT_VARIABLE}`
    );
  });
});
