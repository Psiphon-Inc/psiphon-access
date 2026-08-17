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
import { toHex } from './color';
import { getResolvedThemeColors } from './themeColors';

describe('themeColors', () => {
  it('AC1: returns exactly 174 leaves across exactly 21 groups', () => {
    const leaves = getResolvedThemeColors();
    expect(leaves).toHaveLength(174);

    const groups = new Set(leaves.map(l => l.group));
    expect(groups.size).toBe(21);
  });

  it('AC2: resolves every leaf to valid sRGB or color-with-alpha, checking tooltip values', () => {
    const leaves = getResolvedThemeColors();

    for (const leaf of leaves) {
      expect(typeof leaf.path).toBe('string');
      expect(typeof leaf.group).toBe('string');
      expect(typeof leaf.color.r).toBe('number');
      expect(typeof leaf.color.g).toBe('number');
      expect(typeof leaf.color.b).toBe('number');
      expect(typeof leaf.color.alpha).toBe('number');

      expect(leaf.color.r).toBeGreaterThanOrEqual(0);
      expect(leaf.color.r).toBeLessThanOrEqual(255);
      expect(leaf.color.g).toBeGreaterThanOrEqual(0);
      expect(leaf.color.g).toBeLessThanOrEqual(255);
      expect(leaf.color.b).toBeGreaterThanOrEqual(0);
      expect(leaf.color.b).toBeLessThanOrEqual(255);
      expect(leaf.color.alpha).toBeGreaterThanOrEqual(0);
      expect(leaf.color.alpha).toBeLessThanOrEqual(1);
    }

    const tooltipBg = leaves.find(l => l.path === 'tooltip.background');
    expect(tooltipBg).toBeDefined();
    // tooltip.background is color-mix(in srgb, black 80%, {colors.levels.sunken}) where levels.sunken = #F7F7F7
    // Resolves to { r: 49, g: 49, b: 49, alpha: 1 } -> #313131
    expect(toHex(tooltipBg!.color)).toBe('#313131');

    const tooltipInverseBg = leaves.find(
      l => l.path === 'tooltip.inverseBackground'
    );
    expect(tooltipInverseBg).toBeDefined();
    // tooltip.inverseBackground is color-mix(in srgb, white 50%, {colors.levels.sunken}) where levels.sunken = #F7F7F7
    // Resolves to { r: 251, g: 251, b: 251, alpha: 1 } -> #FBFBFB
    expect(toHex(tooltipInverseBg!.color)).toBe('#FBFBFB');
  });

  it('AC3: throws errors for unhandled expressions, missing targets, or reference cycles naming path and expression', () => {
    // Unhandled expression
    const badExprTheme = {
      config: {
        theme: {
          semanticTokens: {
            colors: {
              testGroup: {
                badToken: { value: { _light: 'unhandled-color-fn(123)' } },
              },
            },
          },
        },
      },
    };
    expect(() => getResolvedThemeColors(badExprTheme)).toThrow(
      /unhandled-color-fn\(123\).*testGroup\.badToken/
    );

    // Missing reference target
    const missingRefTheme = {
      config: {
        theme: {
          semanticTokens: {
            colors: {
              testGroup: {
                missingToken: { value: { _light: '{colors.does.not.exist}' } },
              },
            },
          },
        },
      },
    };
    expect(() => getResolvedThemeColors(missingRefTheme)).toThrow(
      /does\.not\.exist.*testGroup\.missingToken/
    );

    // Reference cycle
    const cycleTheme = {
      config: {
        theme: {
          semanticTokens: {
            colors: {
              testGroup: {
                tokenA: { value: { _light: '{colors.testGroup.tokenB}' } },
                tokenB: { value: { _light: '{colors.testGroup.tokenA}' } },
              },
            },
          },
        },
      },
    };
    expect(() => getResolvedThemeColors(cycleTheme)).toThrow(
      /Reference cycle.*testGroup\.tokenA/
    );
  });

  it('AC4: reads only _light and ignores _dark', () => {
    const leavesBefore = getResolvedThemeColors();
    const noticeBefore = leavesBefore.find(l => l.path === 'notice.background');
    expect(noticeBefore).toBeDefined();

    // Clone semanticTokens.colors with altered _dark value
    const customTheme = {
      config: {
        theme: {
          semanticTokens: {
            colors: {
              ...psiphonUiTheme.config.theme.semanticTokens.colors,
              notice: {
                background: {
                  value: {
                    _light: '{colors.blue.50}',
                    _dark: '#FF00FF', // Sentinel dark value
                  },
                },
              },
            },
          },
        },
      },
    };

    const leavesCustom = getResolvedThemeColors(customTheme);
    const noticeCustom = leavesCustom.find(l => l.path === 'notice.background');
    expect(noticeCustom).toBeDefined();
    expect(toHex(noticeCustom!.color)).not.toBe('#FF00FF');
    expect(toHex(noticeCustom!.color)).toBe('#E3F2FD');
  });

  it('AC5: reads psiphonUiTheme dynamically so overriding a leaf changes output', () => {
    const originalLight =
      psiphonUiTheme.config.theme.semanticTokens.colors.notice.background.value
        ._light;

    try {
      // Override leaf on psiphonUiTheme directly
      psiphonUiTheme.config.theme.semanticTokens.colors.notice.background.value._light =
        '#123456';

      const leavesAltered = getResolvedThemeColors();
      const noticeAltered = leavesAltered.find(
        l => l.path === 'notice.background'
      );
      expect(noticeAltered).toBeDefined();
      expect(toHex(noticeAltered!.color)).toBe('#123456');
    } finally {
      // Restore original theme object
      psiphonUiTheme.config.theme.semanticTokens.colors.notice.background.value._light =
        originalLight;
    }

    // Verify restored
    const leavesRestored = getResolvedThemeColors();
    const noticeRestored = leavesRestored.find(
      l => l.path === 'notice.background'
    );
    expect(noticeRestored).toBeDefined();
    expect(toHex(noticeRestored!.color)).toBe('#E6F1F8');
  });

  it('AC6: resolves notice.background (#E6F1F8) and highlightedNavigationItem (#CCE3F1) per D13', () => {
    const leaves = getResolvedThemeColors();

    const noticeBg = leaves.find(l => l.path === 'notice.background');
    expect(noticeBg).toBeDefined();
    expect(toHex(noticeBg!.color)).toBe('#E6F1F8');

    const navItem = leaves.find(l => l.path === 'highlightedNavigationItem');
    expect(navItem).toBeDefined();
    expect(toHex(navItem!.color)).toBe('#CCE3F1');
  });

  it('AC6: takes the base palette from the theme config, not from Chakra defaults', () => {
    // The two base palette references must follow the fork's own config. A
    // system built without it would keep answering #E3F2FD once the fork
    // authors its own blue, so the gate would report a ratio for a colour the
    // interface does not use.
    const forkedTheme = {
      config: {
        theme: {
          tokens: { colors: { blue: { 50: { value: '#010203' } } } },
          semanticTokens: {
            colors: {
              notice: {
                background: { value: { _light: '{colors.blue.50}' } },
              },
            },
          },
        },
      },
    };

    const leaves = getResolvedThemeColors(forkedTheme);
    const noticeBg = leaves.find(l => l.path === 'notice.background');
    expect(noticeBg).toBeDefined();
    expect(toHex(noticeBg!.color)).toBe('#010203');

    // The inherited theme is unaffected, so the per-config memo does not leak.
    const inherited = getResolvedThemeColors().find(
      l => l.path === 'notice.background'
    );
    expect(toHex(inherited!.color)).toBe('#E6F1F8');
  });
});
