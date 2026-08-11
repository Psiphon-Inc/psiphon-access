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

import { UiThemeMode, type UiTheme } from '@gravitational/design-system';

import { lightTheme, type ThemeDefinition } from 'design/theme';

/**
 * PSIPHON_THEME_NAME is the value the Auth Service sends as
 * Features.CustomTheme, set by the fork modules wrapper in lib/googleoidc. The
 * proxy passes it to the browser as webConfig.customTheme, and ThemeProvider
 * selects a theme by that name.
 */
export const PSIPHON_THEME_NAME = 'psiphon';

/**
 * psiphonUiTheme is the modern, Chakra-based theme.
 *
 * Authored token set decided in ADR 0003 and the theme implementation. Source documents:
 * docs/psiphon-access/design/2026-08-17-theme-token-mapping.md and
 * docs/psiphon-access/design/2026-08-19-terminal-editor-values.md.
 *
 * Light mode only. ForcedColor prevents switching to dark mode.
 */
export const psiphonUiTheme: UiTheme = {
  mode: UiThemeMode.ForcedColor,
  forcedColorMode: 'light',
  name: PSIPHON_THEME_NAME,
  config: {
    theme: {
      semanticTokens: {
        colors: {
          brand: {
            value: { _light: '#FF703C' },
          },
          levels: {
            popout: { value: { _light: '#FFFFFF' } },
            elevated: { value: { _light: '#FFFFFF' } },
            surface: { value: { _light: '#FFFFFF' } },
            sunken: { value: { _light: '#F7F7F7' } },
            deep: { value: { _light: '#EDEDED' } },
          },
          text: {
            main: { value: { _light: '#000000' } },
            slightlyMuted: { value: { _light: '#5C5C5C' } },
            muted: { value: { _light: '#757575' } },
            disabled: { value: { _light: 'rgba(0, 0, 0, 0.38)' } },
            primaryInverse: { value: { _light: '#FFFFFF' } },
          },
          interactive: {
            solid: {
              primary: {
                default: { value: { _light: '#000000' } },
                hover: { value: { _light: '#262626' } },
                active: { value: { _light: '#404040' } },
              },
              danger: {
                default: { value: { _light: '#860A14' } },
                hover: { value: { _light: '#6B0810' } },
                active: { value: { _light: '#50060C' } },
              },
              success: {
                default: { value: { _light: '#03830E' } },
                hover: { value: { _light: '#02690B' } },
                active: { value: { _light: '#024F08' } },
              },
              alert: {
                default: { value: { _light: '#FFAB00' } },
                hover: { value: { _light: '#CC8900' } },
                active: { value: { _light: '#996700' } },
              },
              accent: {
                default: { value: { _light: '#0073BA' } },
                hover: { value: { _light: '#005C95' } },
                active: { value: { _light: '#004570' } },
              },
            },
            tonal: {
              primary: {
                '0': { value: { _light: 'rgba(255, 112, 60, 0.1)' } },
                '1': { value: { _light: 'rgba(255, 112, 60, 0.18)' } },
                '2': { value: { _light: 'rgba(255, 112, 60, 0.25)' } },
              },
              success: {
                '0': { value: { _light: 'rgba(3, 131, 14, 0.1)' } },
                '1': { value: { _light: 'rgba(3, 131, 14, 0.18)' } },
                '2': { value: { _light: 'rgba(3, 131, 14, 0.25)' } },
              },
              danger: {
                '0': { value: { _light: 'rgba(134, 10, 20, 0.1)' } },
                '1': { value: { _light: 'rgba(134, 10, 20, 0.18)' } },
                '2': { value: { _light: 'rgba(134, 10, 20, 0.25)' } },
              },
              alert: {
                '0': { value: { _light: 'rgba(255, 171, 0, 0.1)' } },
                '1': { value: { _light: 'rgba(255, 171, 0, 0.18)' } },
                '2': { value: { _light: 'rgba(255, 171, 0, 0.25)' } },
              },
              informational: {
                '0': { value: { _light: 'rgba(0, 115, 186, 0.1)' } },
                '1': { value: { _light: 'rgba(0, 115, 186, 0.18)' } },
                '2': { value: { _light: 'rgba(0, 115, 186, 0.25)' } },
              },
              neutral: {
                '0': { value: { _light: 'rgba(0, 0, 0, 0.06)' } },
                '1': { value: { _light: 'rgba(0, 0, 0, 0.13)' } },
                '2': { value: { _light: 'rgba(0, 0, 0, 0.18)' } },
              },
            },
          },
          buttons: {
            text: { value: { _light: '#000000' } },
            textDisabled: { value: { _light: 'rgba(0, 0, 0, 0.38)' } },
            bgDisabled: { value: { _light: 'rgba(0, 0, 0, 0.12)' } },
            primary: {
              text: { value: { _light: '#FFFFFF' } },
              default: { value: { _light: '#000000' } },
              hover: { value: { _light: '#262626' } },
              active: { value: { _light: '#404040' } },
            },
            secondary: {
              default: { value: { _light: 'rgba(0, 0, 0, 0.07)' } },
              hover: { value: { _light: 'rgba(0, 0, 0, 0.13)' } },
              active: { value: { _light: 'rgba(0, 0, 0, 0.18)' } },
            },
            border: {
              default: { value: { _light: 'rgba(255, 255, 255, 0)' } },
              hover: { value: { _light: 'rgba(0, 0, 0, 0.07)' } },
              active: { value: { _light: 'rgba(0, 0, 0, 0.13)' } },
              border: { value: { _light: 'rgba(0, 0, 0, 0.42)' } },
            },
            warning: {
              text: { value: { _light: '#FFFFFF' } },
              default: { value: { _light: '#860A14' } },
              hover: { value: { _light: '#6B0810' } },
              active: { value: { _light: '#50060C' } },
            },
            trashButton: {
              default: { value: { _light: 'rgba(0, 0, 0, 0.07)' } },
              hover: { value: { _light: 'rgba(0, 0, 0, 0.13)' } },
            },
            link: {
              default: { value: { _light: '#0073BA' } },
              hover: { value: { _light: '#005C95' } },
              active: { value: { _light: '#004570' } },
            },
          },
          tooltip: {
            background: {
              value: {
                _light: 'color-mix(in srgb, black 80%, {colors.levels.sunken})',
              },
            },
            inverseBackground: {
              value: {
                _light: 'color-mix(in srgb, white 50%, {colors.levels.sunken})',
              },
            },
            inverseLinkDefault: { value: { _light: '#0073BA' } },
          },
          progressBarColor: {
            value: { _light: '#03830E' },
          },
          error: {
            main: { value: { _light: '#860A14' } },
            hover: { value: { _light: '#6B0810' } },
            active: { value: { _light: '#50060C' } },
          },
          success: {
            main: { value: { _light: '#03830E' } },
            hover: { value: { _light: '#02690B' } },
            active: { value: { _light: '#024F08' } },
          },
          warning: {
            main: { value: { _light: '#996700' } },
            hover: { value: { _light: '#7A5200' } },
            active: { value: { _light: '#5C3E00' } },
          },
          accent: {
            main: { value: { _light: '#0073BA' } },
            hover: { value: { _light: '#005C95' } },
            active: { value: { _light: '#004570' } },
          },
          notice: {
            background: { value: { _light: '#E6F1F8' } },
          },
          action: {
            active: { value: { _light: '#FFFFFF' } },
            hover: { value: { _light: 'rgba(255, 255, 255, 0.1)' } },
            selected: { value: { _light: 'rgba(255, 255, 255, 0.2)' } },
            disabled: { value: { _light: 'rgba(255, 255, 255, 0.3)' } },
            disabledBackground: {
              value: { _light: 'rgba(255, 255, 255, 0.12)' },
            },
          },
          terminal: {
            background: { value: { _light: '#F7F7F7' } },
            foreground: { value: { _light: '#000000' } },
            black: { value: { _light: '#000000' } },
            brightBlack: { value: { _light: '#5C5C5C' } },
            white: { value: { _light: '#FFFFFF' } },
            brightWhite: { value: { _light: '#F7F7F7' } },
            red: { value: { _light: '#a91822' } },
            brightRed: { value: { _light: '#cc1729' } },
            green: { value: { _light: '#346d00' } },
            brightGreen: { value: { _light: '#3d8100' } },
            yellow: { value: { _light: '#765d00' } },
            brightYellow: { value: { _light: '#8c6e00' } },
            blue: { value: { _light: '#005cad' } },
            brightBlue: { value: { _light: '#006dce' } },
            magenta: { value: { _light: '#a03778' } },
            brightMagenta: { value: { _light: '#be418e' } },
            cyan: { value: { _light: '#006c63' } },
            brightCyan: { value: { _light: '#008075' } },
            cursor: { value: { _light: '#000000' } },
            cursorAccent: { value: { _light: '#F7F7F7' } },
            selectionBackground: {
              value: { _light: 'rgba(0, 0, 0, 0.18)' },
            },
            searchMatch: { value: { _light: '#FFD98C' } },
            activeSearchMatch: { value: { _light: '#FFAB00' } },
          },
          dataVisualisation: {
            primary: {
              purple: { value: { _light: '#5531D4' } },
              wednesdays: { value: { _light: '#A70DAF' } },
              picton: { value: { _light: '#006BB8' } },
              sunflower: { value: { _light: '#7A5200' } },
              caribbean: { value: { _light: '#007562' } },
              abbey: { value: { _light: '#BF372E' } },
              cyan: { value: { _light: '#007282' } },
            },
            secondary: {
              purple: { value: { _light: '#6F4CED' } },
              wednesdays: { value: { _light: '#DC37E5' } },
              picton: { value: { _light: '#005C95' } },
              sunflower: { value: { _light: '#B27800' } },
              caribbean: { value: { _light: '#02690B' } },
              abbey: { value: { _light: '#D4635B' } },
              cyan: { value: { _light: '#1792A3' } },
            },
            tertiary: {
              purple: { value: { _light: '#000000' } },
              wednesdays: { value: { _light: '#690274' } },
              picton: { value: { _light: '#004570' } },
              sunflower: { value: { _light: '#996700' } },
              caribbean: { value: { _light: '#03830E' } },
              abbey: { value: { _light: '#860A14' } },
              cyan: { value: { _light: '#015C6E' } },
            },
          },
          editor: {
            abbey: { value: { _light: '#860A14' } },
            purple: { value: { _light: '#000000' } },
            cyan: { value: { _light: '#015C6E' } },
            picton: { value: { _light: '#004570' } },
            sunflower: { value: { _light: '#996700' } },
            caribbean: { value: { _light: '#03830E' } },
          },
          sessionRecording: {
            player: {
              progressBar: {
                background: { value: { _light: 'rgba(0, 0, 0, 0.1)' } },
                seeking: { value: { _light: 'rgba(0, 0, 0, 0.15)' } },
                progress: { value: { _light: '#CC5A30' } },
              },
            },
            resource: { value: { _light: '#004570' } },
            user: { value: { _light: '#000000' } },
            riskLevels: {
              low: { value: { _light: '#03830E' } },
              medium: { value: { _light: '#7A5200' } },
              high: { value: { _light: '#860A14' } },
              critical: { value: { _light: '#000000' } },
            },
          },
          sessionRecordingTimeline: {
            background: { value: { _light: '#FFFFFF' } },
            headerBackground: { value: { _light: 'rgba(0, 0, 0, 0.05)' } },
            frameBorder: { value: { _light: 'rgba(0, 0, 0, 0.42)' } },
            progressLine: { value: { _light: '#CC5A30' } },
            border: {
              default: { value: { _light: '#949494' } },
              hover: { value: { _light: '#5C5C5C' } },
            },
            cursor: { value: { _light: 'rgba(0, 0, 0, 0.42)' } },
            events: {
              inactivity: {
                background: { value: { _light: 'rgba(0, 0, 0, 0.25)' } },
                text: { value: { _light: '#000000' } },
              },
              resize: {
                semiBackground: { value: { _light: 'rgba(0, 0, 0, 0.8)' } },
                background: { value: { _light: '#B2D5EA' } },
                border: { value: { _light: '#000000' } },
                text: { value: { _light: '#000000' } },
              },
              join: {
                background: { value: { _light: '#0073BA' } },
                text: { value: { _light: '#FFFFFF' } },
              },
              default: {
                background: { value: { _light: 'rgba(0, 0, 0, 0.54)' } },
                text: { value: { _light: '#000000' } },
              },
            },
            timeMarks: {
              primary: { value: { _light: 'rgba(0, 0, 0, 0.54)' } },
              secondary: { value: { _light: 'rgba(0, 0, 0, 0.42)' } },
              absolute: { value: { _light: 'rgba(0, 0, 0, 0.87)' } },
              text: { value: { _light: 'rgba(0, 0, 0, 0.87)' } },
            },
          },
          link: {
            value: { _light: '#0073BA' },
          },
          highlightedNavigationItem: {
            value: { _light: '#CCE3F1' },
          },
          spotBackground: {
            '0': { value: { _light: 'rgba(0, 0, 0, 0.06)' } },
            '1': { value: { _light: 'rgba(0, 0, 0, 0.13)' } },
            '2': { value: { _light: 'rgba(0, 0, 0, 0.18)' } },
          },
        },
      },
    },
  },
};

/**
 * psiphonLegacyTheme is the styled-components theme that older components still
 * read. isCustomTheme does double duty: it marks the theme as bespoke, and
 * UserMenuNav uses it to hide the light and dark switcher, which would otherwise
 * offer a mode this theme does not have.
 *
 * Font stacks name Inter and DM Mono first. Stacks end in system fallbacks.
 * The faces are served from /app/fonts/fonts.css, which index.html loads.
 */
export const psiphonLegacyTheme: ThemeDefinition = {
  ...lightTheme,
  isCustomTheme: true,
  font: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  fonts: {
    ...lightTheme.fonts,
    sansSerif:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    mono: 'DM Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
};
