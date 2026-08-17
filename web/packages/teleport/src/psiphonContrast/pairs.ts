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
 * Kind of element being evaluated for WCAG 2.1 AA contrast.
 * - normalText: WCAG 1.4.3 floor of 4.5:1
 * - largeText: WCAG 1.4.3 floor of 3.0:1 (>=18pt or >=14pt bold)
 * - nonText: WCAG 1.4.11 floor of 3.0:1 (UI components, borders, icons, chart ink)
 */
export type ContrastKind = 'normalText' | 'largeText' | 'nonText';

/**
 * Manifest record defining a single contrast pair evaluation.
 */
export interface ContrastPair {
  /** Unique descriptor for the evaluation pair */
  readonly id: string;
  /** Foreground / ink token path */
  readonly fgPath: string;
  /** Surface / background token path */
  readonly bgPath: string;
  /** WCAG 2.1 AA contrast floor: 4.5 for normal text, 3 for large/non-text */
  readonly floor: 4.5 | 3;
  /** Kind of contrast element */
  readonly kind: ContrastKind;
  /** Stated reason for why this floor applies */
  readonly floorReason: string;
  /** Whether the pair is exempt under WCAG 1.4.3 (specifically for disabled controls) */
  readonly exempt?: boolean;
  /** Reason for WCAG exemption */
  readonly exemptReason?: string;
  /** Whether the token is judged not a structural boundary/component boundary (fork decision, not a WCAG exemption) */
  readonly notBoundary?: boolean;
  /** Reason why token is judged not a structural boundary */
  readonly notBoundaryReason?: string;
  /** Whether evaluation is deferred to the terminal decision (e.g. terminal / editor) */
  readonly deferred?: boolean;
  /** Reason for deferral */
  readonly deferredReason?: string;
  /** Surface token path that an alpha-carrying background composites over */
  readonly compositeSurface?: string;
  /** Stated reason for why this composite surface applies (reader citation or worst plausible surface statement) */
  readonly compositeSurfaceReason?: string;
}

/**
 * Record for an excluded role group.
 */
export interface ExcludedGroup {
  readonly group: string;
  readonly reason: string;
}

/**
 * Record for a separation rule requiring a minimum delta between two tokens.
 */
export interface SeparationRule {
  /** Unique descriptor for the separation rule */
  readonly id: string;
  /** First token path */
  readonly tokenA: string;
  /** Second token path */
  readonly tokenB: string;
  /** Minimum required separation delta */
  readonly minDelta: number;
  /** Metric measured (luminanceRatio = relative luminance ratio (L1+0.05)/(L2+0.05)) */
  readonly metric: 'luminanceRatio';
  /** Stated reason for the threshold and metric */
  readonly reason: string;
  /** Whether rule evaluation is deferred (e.g., terminal ANSI before the terminal decision) */
  readonly deferred?: boolean;
  /** Reason for deferral */
  readonly deferredReason?: string;
}

export const EXCLUDED_GROUPS: readonly ExcludedGroup[] = [
  {
    group: 'action',
    reason:
      'Decision D14: action group (5 leaves: active, hover, selected, disabled, disabledBackground) has no reader anywhere in web/packages',
  },
];

/**
 * Record for an excluded / unused theme leaf with no live reader in the shipped UI.
 */
export interface ExcludedLeaf {
  readonly path: string;
  readonly reason: string;
}

export const EXCLUDED_LEAVES: readonly ExcludedLeaf[] = [
  {
    path: 'dataVisualisation.primary.purple',
    reason:
      'No reader. terminal.brightMagenta referenced it until the theme implementation gave that slot a literal value, which broke the chain',
  },
  {
    path: 'dataVisualisation.primary.wednesdays',
    reason:
      'No reader anywhere in web/packages (seven leaves used only by teleterm, which the fork does not ship)',
  },
  {
    path: 'dataVisualisation.primary.picton',
    reason:
      'No reader. terminal.brightBlue referenced it until the theme implementation gave that slot a literal value, which broke the chain',
  },
  {
    path: 'dataVisualisation.primary.caribbean',
    reason:
      'No reader. terminal.brightGreen referenced it until the theme implementation gave that slot a literal value, which broke the chain',
  },
  {
    path: 'dataVisualisation.primary.abbey',
    reason:
      'No reader. terminal.brightRed referenced it until the theme implementation gave that slot a literal value, which broke the chain',
  },
  {
    path: 'dataVisualisation.primary.cyan',
    reason:
      'No reader. terminal.brightCyan referenced it until the theme implementation gave that slot a literal value, which broke the chain',
  },
  {
    path: 'dataVisualisation.secondary.purple',
    reason:
      'No reader anywhere in web/packages (seven leaves used only by teleterm, which the fork does not ship)',
  },
  {
    path: 'dataVisualisation.secondary.wednesdays',
    reason:
      'No reader anywhere in web/packages (seven leaves used only by teleterm, which the fork does not ship)',
  },
  {
    path: 'dataVisualisation.secondary.sunflower',
    reason: 'No reader anywhere in web/packages',
  },
  {
    path: 'dataVisualisation.secondary.abbey',
    reason: 'No reader anywhere in web/packages',
  },
  {
    path: 'dataVisualisation.secondary.cyan',
    reason:
      'No reader anywhere in web/packages (seven leaves used only by teleterm, which the fork does not ship)',
  },
  {
    path: 'dataVisualisation.tertiary.wednesdays',
    reason:
      'No reader anywhere in web/packages (seven leaves used only by teleterm, which the fork does not ship)',
  },
  {
    path: 'dataVisualisation.tertiary.cyan',
    reason:
      'No reader. terminal.cyan and editor.cyan referenced it until the theme implementation gave both slots literal values, which broke the chains',
  },
];

const LEVEL_SURFACES = [
  'levels.surface',
  'levels.sunken',
  'levels.deep',
  'levels.elevated',
  'levels.popout',
] as const;

const DATA_VIS_TIERS = [
  {
    tier: 'primary',
    tokens: [
      'dataVisualisation.primary.purple',
      'dataVisualisation.primary.wednesdays',
      'dataVisualisation.primary.picton',
      'dataVisualisation.primary.sunflower',
      'dataVisualisation.primary.caribbean',
      'dataVisualisation.primary.abbey',
      'dataVisualisation.primary.cyan',
    ],
  },
  {
    tier: 'secondary',
    tokens: [
      'dataVisualisation.secondary.purple',
      'dataVisualisation.secondary.wednesdays',
      'dataVisualisation.secondary.picton',
      'dataVisualisation.secondary.sunflower',
      'dataVisualisation.secondary.caribbean',
      'dataVisualisation.secondary.abbey',
      'dataVisualisation.secondary.cyan',
    ],
  },
  {
    tier: 'tertiary',
    tokens: [
      'dataVisualisation.tertiary.purple',
      'dataVisualisation.tertiary.wednesdays',
      'dataVisualisation.tertiary.picton',
      'dataVisualisation.tertiary.sunflower',
      'dataVisualisation.tertiary.caribbean',
      'dataVisualisation.tertiary.abbey',
      'dataVisualisation.tertiary.cyan',
    ],
  },
] as const;

const ANSI_SLOTS = [
  { normal: 'terminal.black', bright: 'terminal.brightBlack', name: 'black' },
  { normal: 'terminal.red', bright: 'terminal.brightRed', name: 'red' },
  { normal: 'terminal.green', bright: 'terminal.brightGreen', name: 'green' },
  {
    normal: 'terminal.yellow',
    bright: 'terminal.brightYellow',
    name: 'yellow',
  },
  { normal: 'terminal.blue', bright: 'terminal.brightBlue', name: 'blue' },
  {
    normal: 'terminal.magenta',
    bright: 'terminal.brightMagenta',
    name: 'magenta',
  },
  { normal: 'terminal.cyan', bright: 'terminal.brightCyan', name: 'cyan' },
  { normal: 'terminal.white', bright: 'terminal.brightWhite', name: 'white' },
] as const;

const TERMINAL_DEFERRED_TOKENS = [
  'terminal.foreground',
  'terminal.red',
  'terminal.green',
  'terminal.yellow',
  'terminal.blue',
  'terminal.magenta',
  'terminal.cyan',
  'terminal.white',
  'terminal.brightBlack',
  'terminal.black',
  'terminal.brightRed',
  'terminal.brightGreen',
  'terminal.brightYellow',
  'terminal.brightBlue',
  'terminal.brightMagenta',
  'terminal.brightCyan',
  'terminal.brightWhite',
  'terminal.cursor',
  'terminal.cursorAccent',
  'terminal.selectionBackground',
  'terminal.searchMatch',
  'terminal.activeSearchMatch',
] as const;

const EDITOR_DEFERRED_TOKENS = [
  'editor.abbey',
  'editor.purple',
  'editor.cyan',
  'editor.picton',
  'editor.sunflower',
  'editor.caribbean',
] as const;

/**
 * Record for a deferred token whose theme definition references another token path.
 * Tracks both the inherited resolved value in the baseline theme and the value
 * assigned by design decisions (D20-D26).
 */
export interface DeferredReferenceEdge {
  /** Deferred token path (e.g., 'terminal.red') */
  readonly deferredPath: string;
  /** Target token path referenced in theme (e.g., 'dataVisualisation.tertiary.abbey') */
  readonly sourcePath: string;
  /** Mapping decision ID for source token if decided (e.g., 'D23'), or 'D27' / 'None' */
  readonly decision: string;
  /** Measured inherited resolved hex value in baseline theme (e.g., '#9D0A00') */
  readonly inheritedHex: string;
  /** Decided resolved hex value given by design decision (e.g., '#860A14') */
  readonly decidedHex: string;
}

export const DEFERRED_REFERENCE_EDGES: readonly DeferredReferenceEdge[] = [];

function buildContrastPairs(): ContrastPair[] {
  const pairs: ContrastPair[] = [];

  // 1. Body text on every surface it appears on (levels ramp)
  for (const surface of LEVEL_SURFACES) {
    const surfName = surface.replace('levels.', '');

    pairs.push({
      id: `text-main-on-${surfName}`,
      fgPath: 'text.main',
      bgPath: surface,
      floor: 4.5,
      kind: 'normalText',
      floorReason: 'WCAG 2.1 AA 1.4.3 primary body text floor',
    });

    pairs.push({
      id: `text-slightlyMuted-on-${surfName}`,
      fgPath: 'text.slightlyMuted',
      bgPath: surface,
      floor: 4.5,
      kind: 'normalText',
      floorReason: 'WCAG 2.1 AA 1.4.3 secondary body text floor',
    });

    pairs.push({
      id: `text-muted-on-${surfName}`,
      fgPath: 'text.muted',
      bgPath: surface,
      floor: 4.5,
      kind: 'normalText',
      floorReason:
        surface === 'levels.deep'
          ? 'WCAG 2.1 AA 1.4.3 tertiary text floor (forbidden pairing in D4)'
          : 'WCAG 2.1 AA 1.4.3 tertiary body text floor',
    });

    pairs.push({
      id: `text-disabled-on-${surfName}`,
      fgPath: 'text.disabled',
      bgPath: surface,
      floor: 4.5,
      kind: 'normalText',
      floorReason: 'WCAG 2.1 AA 1.4.3 normal text floor for disabled state',
      exempt: true,
      exemptReason:
        'Disabled text is exempt under WCAG 1.4.3 (app uses opacity 0.38)',
    });
  }

  // Inverse body text on dark fills
  pairs.push({
    id: 'text-primaryInverse-on-primarySolid',
    fgPath: 'text.primaryInverse',
    bgPath: 'interactive.solid.primary.default',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 inverse text on solid primary control',
  });

  pairs.push({
    id: 'text-primaryInverse-on-tooltipBg',
    fgPath: 'text.primaryInverse',
    bgPath: 'tooltip.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 inverse text on dark tooltip surface',
  });

  // 2. On-accent label against accent (the pair most likely to fail per D2)
  pairs.push({
    id: 'text-primaryInverse-on-brand',
    fgPath: 'text.primaryInverse',
    bgPath: 'brand',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'WCAG 2.1 AA 1.4.3 white label on brand accent (refused in D2)',
    exempt: true,
    // THIS IS NOT A WCAG 1.4.3 EXEMPTION, and the `exempt` field is overloaded
    // here. D2 forbids the COMBINATION rather than granting relief from a floor.
    // D2 states it plainly: "It must not carry a label. White on #FF703C is
    // 2.75:1 and fails." So the measured failure is the expected result, and the
    // pair is kept as a watchdog for a combination the interface must never use.
    // A contrast floor cannot express "never render this", so the gate needs a
    // category of its own for a forbidden combination. Not yet implemented.
    exemptReason:
      'D2 forbids this combination: the brand accent must not carry a label. White on #FF703C measures 2.75:1. The pair stays in the manifest as a watchdog, and it is not a WCAG 1.4.3 relief.',
  });

  pairs.push({
    id: 'text-main-on-brand',
    fgPath: 'text.main',
    bgPath: 'brand',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 black label on brand accent per D2',
  });

  pairs.push({
    id: 'text-primaryInverse-on-accentMain',
    fgPath: 'text.primaryInverse',
    bgPath: 'accent.main',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 on-accent white label on accent.main',
  });

  pairs.push({
    id: 'text-primaryInverse-on-interactiveAccentDefault',
    fgPath: 'text.primaryInverse',
    bgPath: 'interactive.solid.accent.default',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'WCAG 2.1 AA 1.4.3 on-accent white label on solid accent default',
  });

  pairs.push({
    id: 'text-primaryInverse-on-interactiveAccentHover',
    fgPath: 'text.primaryInverse',
    bgPath: 'interactive.solid.accent.hover',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'WCAG 2.1 AA 1.4.3 on-accent white label on solid accent hover',
  });

  pairs.push({
    id: 'text-primaryInverse-on-interactiveAccentActive',
    fgPath: 'text.primaryInverse',
    bgPath: 'interactive.solid.accent.active',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'WCAG 2.1 AA 1.4.3 on-accent white label on solid accent active',
  });

  // 3. Interactive controls (solid and tonal ramps)
  const solidFamilies = [
    { name: 'primary', label: 'text.primaryInverse' },
    { name: 'success', label: 'text.primaryInverse' },
    { name: 'danger', label: 'text.primaryInverse' },
    { name: 'alert', label: 'text.main' }, // Black label per D7
  ] as const;

  for (const family of solidFamilies) {
    for (const state of ['default', 'hover', 'active'] as const) {
      pairs.push({
        id: `interactive-solid-${family.name}-${state}`,
        fgPath: family.label,
        bgPath: `interactive.solid.${family.name}.${state}`,
        floor: 4.5,
        kind: 'normalText',
        floorReason: `WCAG 2.1 AA 1.4.3 text label on solid ${family.name} ${state} fill`,
      });
    }
  }

  const tonalFamilies = [
    'primary',
    'success',
    'danger',
    'alert',
    'informational',
    'neutral',
  ] as const;

  for (const family of tonalFamilies) {
    for (const step of [0, 1, 2] as const) {
      pairs.push({
        id: `interactive-tonal-${family}-${step}`,
        fgPath: 'text.main',
        bgPath: `interactive.tonal.${family}.${step}`,
        floor: 4.5,
        kind: 'normalText',
        floorReason: `WCAG 2.1 AA 1.4.3 text label on tonal ${family} step ${step} fill`,
        compositeSurface: 'levels.deep',
        compositeSurfaceReason:
          'No reader is known; chosen worst plausible surface levels.deep',
      });
    }
  }

  // 4. Buttons family
  pairs.push({
    id: 'buttons-text-on-surface',
    fgPath: 'buttons.text',
    bgPath: 'levels.surface',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 button text floor',
  });

  pairs.push({
    id: 'buttons-textDisabled-on-surface',
    fgPath: 'buttons.textDisabled',
    bgPath: 'levels.surface',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 disabled button text floor',
    exempt: true,
    exemptReason: 'Disabled button text exempt under WCAG 1.4.3 per D5',
  });

  pairs.push({
    id: 'buttons-bgDisabled-on-surface',
    fgPath: 'buttons.bgDisabled',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason: 'WCAG 2.1 AA 1.4.11 disabled button background fill floor',
    exempt: true,
    exemptReason: 'Disabled button background exempt under WCAG 1.4.3',
  });

  for (const state of ['default', 'hover', 'active'] as const) {
    pairs.push({
      id: `buttons-primary-${state}`,
      fgPath: 'buttons.primary.text',
      bgPath: `buttons.primary.${state}`,
      floor: 4.5,
      kind: 'normalText',
      floorReason: `WCAG 2.1 AA 1.4.3 primary button label on ${state} fill`,
    });

    pairs.push({
      id: `buttons-secondary-${state}`,
      fgPath: 'buttons.text',
      bgPath: `buttons.secondary.${state}`,
      floor: 4.5,
      kind: 'normalText',
      floorReason: `WCAG 2.1 AA 1.4.3 secondary button label on ${state} fill`,
      compositeSurface: 'levels.deep',
      compositeSurfaceReason:
        'No reader is known; chosen worst plausible surface levels.deep',
    });

    pairs.push({
      id: `buttons-warning-${state}`,
      fgPath: 'buttons.warning.text',
      bgPath: `buttons.warning.${state}`,
      floor: 4.5,
      kind: 'normalText',
      floorReason: `WCAG 2.1 AA 1.4.3 destructive button white label on red ${state} fill`,
    });
  }

  pairs.push({
    id: 'buttons-border-border-on-surface',
    fgPath: 'buttons.border.border',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'WCAG 2.1 AA 1.4.11 non-text control boundary floor on surface per D10',
  });

  pairs.push({
    id: 'buttons-border-border-on-deep',
    fgPath: 'buttons.border.border',
    bgPath: 'levels.deep',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'WCAG 2.1 AA 1.4.11 non-text control boundary floor on deep surface per D10',
  });

  pairs.push({
    id: 'buttons-border-hover-on-surface',
    fgPath: 'buttons.border.hover',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason: 'Button border hover tint',
    notBoundary: true,
    notBoundaryReason:
      'Subtle fill tint, not a structural component boundary (not applicable)',
  });

  pairs.push({
    id: 'buttons-border-active-on-surface',
    fgPath: 'buttons.border.active',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason: 'Button border active tint',
    notBoundary: true,
    notBoundaryReason:
      'Subtle fill tint, not a structural component boundary (not applicable)',
  });

  pairs.push({
    id: 'buttons-border-default-on-surface',
    fgPath: 'buttons.border.default',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason: 'Button border default transparent fill',
    notBoundary: true,
    notBoundaryReason:
      'Transparent border fill, not a structural component boundary (not applicable)',
  });

  pairs.push({
    id: 'buttons-trashButton-default-on-surface',
    fgPath: 'text.main',
    bgPath: 'buttons.trashButton.default',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 trash button label on default fill',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'buttons-trashButton-hover-on-surface',
    fgPath: 'text.main',
    bgPath: 'buttons.trashButton.hover',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 trash button label on hover fill',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  for (const state of ['default', 'hover', 'active'] as const) {
    pairs.push({
      id: `buttons-link-${state}-on-surface`,
      fgPath: `buttons.link.${state}`,
      bgPath: 'levels.surface',
      floor: 4.5,
      kind: 'normalText',
      floorReason: `WCAG 2.1 AA 1.4.3 button link ${state} text floor per D8`,
    });
  }

  // 5. Tooltip group
  pairs.push({
    id: 'tooltip-text-on-background',
    fgPath: 'text.primaryInverse',
    bgPath: 'tooltip.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 text on tooltip background',
  });

  pairs.push({
    id: 'tooltip-text-on-inverseBackground',
    fgPath: 'text.main',
    bgPath: 'tooltip.inverseBackground',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 text on inverse tooltip background',
  });

  pairs.push({
    id: 'tooltip-inverseLinkDefault-on-inverseBackground',
    fgPath: 'tooltip.inverseLinkDefault',
    bgPath: 'tooltip.inverseBackground',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'WCAG 2.1 AA 1.4.3 link text on inverse tooltip background per D12',
  });

  // 6. ProgressBarColor group
  pairs.push({
    id: 'progressBarColor-on-surface',
    fgPath: 'progressBarColor',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason: 'WCAG 2.1 AA 1.4.11 progress bar graphic indicator floor',
  });

  // 7. Error, Success, Warning text against surfaces
  for (const family of ['error', 'success', 'warning'] as const) {
    for (const state of ['main', 'hover', 'active'] as const) {
      const reasonExtra =
        family === 'warning' ? ' per D11' : family === 'error' ? ' per D1' : '';
      pairs.push({
        id: `${family}-${state}-on-surface`,
        fgPath: `${family}.${state}`,
        bgPath: 'levels.surface',
        floor: 4.5,
        kind: 'normalText',
        floorReason: `WCAG 2.1 AA 1.4.3 ${family} ${state} ink floor on surface${reasonExtra}`,
      });

      pairs.push({
        id: `${family}-${state}-on-deep`,
        fgPath: `${family}.${state}`,
        bgPath: 'levels.deep',
        floor: 4.5,
        kind: 'normalText',
        floorReason: `WCAG 2.1 AA 1.4.3 ${family} ${state} ink floor on deep surface${reasonExtra}`,
      });
    }
  }

  // 8. Accent functional ink
  for (const state of ['main', 'hover', 'active'] as const) {
    pairs.push({
      id: `accent-${state}-on-surface`,
      fgPath: `accent.${state}`,
      bgPath: 'levels.surface',
      floor: 3,
      kind: 'nonText',
      floorReason: `WCAG 2.1 AA 1.4.11 functional accent ink ${state} floor per D3`,
    });

    pairs.push({
      id: `accent-${state}-on-deep`,
      fgPath: `accent.${state}`,
      bgPath: 'levels.deep',
      floor: 3,
      kind: 'nonText',
      floorReason: `WCAG 2.1 AA 1.4.11 functional accent ink ${state} floor on deep surface per D3`,
    });
  }

  // 9. Notice, Link, Navigation, SpotBackground
  pairs.push({
    id: 'text-main-on-noticeBackground',
    fgPath: 'text.main',
    bgPath: 'notice.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 text on notice background per D13',
  });

  pairs.push({
    id: 'link-on-surface',
    fgPath: 'link',
    bgPath: 'levels.surface',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 link text floor on surface per D8',
  });

  pairs.push({
    id: 'link-on-deep',
    fgPath: 'link',
    bgPath: 'levels.deep',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 link text floor on deep surface per D8',
  });

  pairs.push({
    id: 'text-main-on-highlightedNavigationItem',
    fgPath: 'text.main',
    bgPath: 'highlightedNavigationItem',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'WCAG 2.1 AA 1.4.3 text on highlighted navigation item per D13',
  });

  for (const spot of [0, 1, 2] as const) {
    pairs.push({
      id: `text-main-on-spotBackground-${spot}`,
      fgPath: 'text.main',
      bgPath: `spotBackground.${spot}`,
      floor: 4.5,
      kind: 'normalText',
      floorReason: `WCAG 2.1 AA 1.4.3 text on spot background ${spot}`,
      compositeSurface: 'levels.deep',
      compositeSurfaceReason:
        'No reader is known; chosen worst plausible surface levels.deep',
    });
  }

  // 10. SessionRecording group
  pairs.push({
    id: 'sessionRecording-progress-on-trackBg',
    fgPath: 'sessionRecording.player.progressBar.progress',
    bgPath: 'sessionRecording.player.progressBar.background',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'WCAG 2.1 AA 1.4.11 session recording progress fill against track background per D15',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'sessionRecording-seeking-on-surface',
    fgPath: 'sessionRecording.player.progressBar.seeking',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason: 'Seeking bar fill floor',
  });

  pairs.push({
    id: 'sessionRecording-resource-on-surface',
    fgPath: 'sessionRecording.resource',
    bgPath: 'levels.surface',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 resource indicator text floor per D8',
  });

  pairs.push({
    id: 'sessionRecording-user-on-surface',
    fgPath: 'sessionRecording.user',
    bgPath: 'levels.surface',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 user indicator text floor per D1',
  });

  for (const risk of ['low', 'medium', 'high', 'critical'] as const) {
    pairs.push({
      id: `sessionRecording-risk-${risk}-on-surface`,
      fgPath: `sessionRecording.riskLevels.${risk}`,
      bgPath: 'levels.surface',
      floor: 4.5,
      kind: 'normalText',
      floorReason: `WCAG 2.1 AA 1.4.3 risk level ${risk} text floor per D16`,
    });
  }

  // 11. SessionRecordingTimeline group
  pairs.push({
    id: 'timeline-frameBorder-on-background',
    fgPath: 'sessionRecordingTimeline.frameBorder',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 3,
    kind: 'nonText',
    floorReason: 'WCAG 2.1 AA 1.4.11 timeline frame border floor per D17',
  });

  pairs.push({
    id: 'timeline-progressLine-on-background',
    fgPath: 'sessionRecordingTimeline.progressLine',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 3,
    kind: 'nonText',
    floorReason: 'WCAG 2.1 AA 1.4.11 timeline progress line floor per D15',
  });

  pairs.push({
    id: 'timeline-border-default-on-background',
    fgPath: 'sessionRecordingTimeline.border.default',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 3,
    kind: 'nonText',
    floorReason: 'WCAG 2.1 AA 1.4.11 timeline default border floor per D17',
  });

  pairs.push({
    id: 'timeline-border-hover-on-background',
    fgPath: 'sessionRecordingTimeline.border.hover',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 3,
    kind: 'nonText',
    floorReason: 'WCAG 2.1 AA 1.4.11 timeline hover border floor per D17',
  });

  pairs.push({
    id: 'timeline-cursor-on-background',
    fgPath: 'sessionRecordingTimeline.cursor',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 3,
    kind: 'nonText',
    floorReason: 'WCAG 2.1 AA 1.4.11 timeline cursor floor per D17',
  });

  pairs.push({
    id: 'timeline-events-inactivity-text-on-bg',
    fgPath: 'sessionRecordingTimeline.events.inactivity.text',
    bgPath: 'sessionRecordingTimeline.events.inactivity.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 inactivity event text floor per D18',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'timeline-events-resize-text-on-bg',
    fgPath: 'sessionRecordingTimeline.events.resize.text',
    bgPath: 'sessionRecordingTimeline.events.resize.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 resize event text floor',
  });

  pairs.push({
    id: 'timeline-events-join-text-on-bg',
    fgPath: 'sessionRecordingTimeline.events.join.text',
    bgPath: 'sessionRecordingTimeline.events.join.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 join event text floor per D18',
  });

  pairs.push({
    id: 'timeline-events-default-text-on-bg',
    fgPath: 'sessionRecordingTimeline.events.default.text',
    bgPath: 'sessionRecordingTimeline.events.default.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 default event text floor',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'timeline-timeMarks-primary-on-bg',
    fgPath: 'sessionRecordingTimeline.timeMarks.primary',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 time mark primary floor',
  });

  pairs.push({
    id: 'timeline-timeMarks-secondary-on-bg',
    fgPath: 'sessionRecordingTimeline.timeMarks.secondary',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 3,
    kind: 'nonText',
    floorReason: 'WCAG 2.1 AA 1.4.11 time mark secondary tick floor per D17',
  });

  pairs.push({
    id: 'timeline-timeMarks-absolute-on-bg',
    fgPath: 'sessionRecordingTimeline.timeMarks.absolute',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 time mark absolute text floor',
  });

  pairs.push({
    id: 'timeline-timeMarks-text-on-bg',
    fgPath: 'sessionRecordingTimeline.timeMarks.text',
    bgPath: 'sessionRecordingTimeline.background',
    floor: 4.5,
    kind: 'normalText',
    floorReason: 'WCAG 2.1 AA 1.4.3 time mark text floor',
  });

  // 12. DataVisualisation live reader pairs
  // The pair manifest originally assigned floors and backgrounds by group against chart surface.
  // Recon proved this product draws no chart; live readers use these tokens as borders, icons,
  // fills, and text on tonal or elevated backgrounds. Surface pairs are retained for status accent
  // tokens because statusColors.ts border variant renders on transparent bg over plain surface.

  // 12a. Label.tsx outline variants (text floor 4.5)
  pairs.push({
    id: 'dataVis-primary.sunflower-on-interactive.tonal.alert.0',
    fgPath: 'dataVisualisation.primary.sunflower',
    bgPath: 'interactive.tonal.alert.0',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'web/packages/design/src/Label/Label.tsx:140,142 outline-warning label text',
    compositeSurface: 'levels.surface',
    compositeSurfaceReason:
      'web/packages/design/src/Label/Label.tsx:140,142 outline-warning label renders on page surface levels.surface',
  });

  pairs.push({
    id: 'dataVis-tertiary.abbey-on-interactive.tonal.danger.0',
    fgPath: 'dataVisualisation.tertiary.abbey',
    bgPath: 'interactive.tonal.danger.0',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'web/packages/design/src/Label/Label.tsx:157 outline-danger label text',
    compositeSurface: 'levels.surface',
    compositeSurfaceReason:
      'web/packages/design/src/Label/Label.tsx:157 outline-danger label renders on page surface levels.surface',
  });

  // 12b. ManagedUpdates/shared.tsx ProgressBar fills (non-text fill floor 3)
  pairs.push({
    id: 'dataVis-secondary.picton-on-interactive.tonal.neutral.2',
    fgPath: 'dataVisualisation.secondary.picton',
    bgPath: 'interactive.tonal.neutral.2',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/teleport/src/ManagedUpdates/shared.tsx:264 ProgressBar fill on tonal neutral',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'dataVis-secondary.caribbean-on-interactive.tonal.neutral.2',
    fgPath: 'dataVisualisation.secondary.caribbean',
    bgPath: 'interactive.tonal.neutral.2',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/teleport/src/ManagedUpdates/shared.tsx:259 ProgressBar fill on tonal neutral',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  // 12c. StatusColors.ts status accents (non-text border/icon floor 3 on tonal bg & plain surface)
  pairs.push({
    id: 'dataVis-tertiary.purple-on-interactive.tonal.primary.0',
    fgPath: 'dataVisualisation.tertiary.purple',
    bgPath: 'interactive.tonal.primary.0',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/design/src/Status/statusColors.ts:67,88-112 primary status border/icon on tonal primary',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'dataVis-tertiary.purple-on-surface',
    fgPath: 'dataVisualisation.tertiary.purple',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/design/src/Status/statusColors.ts:88-112 primary status border variant on surface',
  });

  pairs.push({
    id: 'dataVis-tertiary.picton-on-interactive.tonal.informational.2',
    fgPath: 'dataVisualisation.tertiary.picton',
    bgPath: 'interactive.tonal.informational.2',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/design/src/Status/statusColors.ts:52,88-112 info status border/icon on tonal informational',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'dataVis-tertiary.picton-on-surface',
    fgPath: 'dataVisualisation.tertiary.picton',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/design/src/Status/statusColors.ts:88-112 info status border variant on surface',
  });

  pairs.push({
    id: 'dataVis-tertiary.sunflower-on-interactive.tonal.alert.2',
    fgPath: 'dataVisualisation.tertiary.sunflower',
    bgPath: 'interactive.tonal.alert.2',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/design/src/Status/statusColors.ts:46,88-112 warning status border/icon on tonal alert',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'dataVis-tertiary.sunflower-on-surface',
    fgPath: 'dataVisualisation.tertiary.sunflower',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/design/src/Status/statusColors.ts:88-112 warning status border variant on surface',
  });

  pairs.push({
    id: 'dataVis-tertiary.caribbean-on-interactive.tonal.success.1',
    fgPath: 'dataVisualisation.tertiary.caribbean',
    bgPath: 'interactive.tonal.success.1',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/design/src/Status/statusColors.ts:40,88-112 success status border/icon on tonal success',
    compositeSurface: 'levels.deep',
    compositeSurfaceReason:
      'No reader is known; chosen worst plausible surface levels.deep',
  });

  pairs.push({
    id: 'dataVis-tertiary.caribbean-on-surface',
    fgPath: 'dataVisualisation.tertiary.caribbean',
    bgPath: 'levels.surface',
    floor: 3,
    kind: 'nonText',
    floorReason:
      'web/packages/design/src/Status/statusColors.ts:88-112 success status border variant on surface',
  });

  // 12d. LatencyDiagnostic.tsx text usages (text floor 4.5 on levels.elevated)
  pairs.push({
    id: 'dataVis-tertiary.sunflower-on-levels.elevated',
    fgPath: 'dataVisualisation.tertiary.sunflower',
    bgPath: 'levels.elevated',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'web/packages/shared/components/LatencyDiagnostic/LatencyDiagnostic.tsx:33 Error latency text on elevated surface',
  });

  pairs.push({
    id: 'dataVis-tertiary.caribbean-on-levels.elevated',
    fgPath: 'dataVisualisation.tertiary.caribbean',
    bgPath: 'levels.elevated',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'web/packages/shared/components/LatencyDiagnostic/LatencyDiagnostic.tsx:31 Ok latency text on elevated surface',
  });

  pairs.push({
    id: 'dataVis-tertiary.abbey-on-levels.elevated',
    fgPath: 'dataVisualisation.tertiary.abbey',
    bgPath: 'levels.elevated',
    floor: 4.5,
    kind: 'normalText',
    floorReason:
      'web/packages/shared/components/LatencyDiagnostic/LatencyDiagnostic.tsx:32 Warn latency text on elevated surface',
  });

  // 13. Terminal group - live since the theme implementation
  for (const termToken of TERMINAL_DEFERRED_TOKENS) {
    const shortName = termToken.replace('terminal.', '');
    const isExemptSurface = ['white', 'brightWhite'].includes(shortName);

    if (shortName === 'cursorAccent') {
      pairs.push({
        id: 'terminal-cursorAccent-on-bg',
        fgPath: 'terminal.cursorAccent',
        bgPath: 'terminal.cursor',
        floor: 4.5,
        kind: 'normalText',
        floorReason: 'WCAG 2.1 AA 1.4.3 cursor accent text inside cursor block',
      });
    } else if (shortName === 'selectionBackground') {
      pairs.push({
        id: 'terminal-selectionBackground-on-bg',
        fgPath: 'terminal.foreground',
        bgPath: 'terminal.selectionBackground',
        floor: 4.5,
        kind: 'normalText',
        floorReason: 'WCAG 2.1 AA 1.4.3 text on terminal selection background',
        compositeSurface: 'terminal.background',
        compositeSurfaceReason:
          'Selection background alpha composites over terminal.background',
      });
    } else if (shortName === 'searchMatch') {
      pairs.push({
        id: 'terminal-searchMatch-on-bg',
        fgPath: 'terminal.foreground',
        bgPath: 'terminal.searchMatch',
        floor: 4.5,
        kind: 'normalText',
        floorReason:
          'WCAG 2.1 AA 1.4.3 text on terminal search match background',
      });
    } else if (shortName === 'activeSearchMatch') {
      pairs.push({
        id: 'terminal-activeSearchMatch-on-bg',
        fgPath: 'terminal.foreground',
        bgPath: 'terminal.activeSearchMatch',
        floor: 4.5,
        kind: 'normalText',
        floorReason:
          'WCAG 2.1 AA 1.4.3 text on terminal active search match background',
      });
    } else {
      const isNonText = shortName === 'cursor';
      pairs.push({
        id: `terminal-${shortName}-on-bg`,
        fgPath: termToken,
        bgPath: 'terminal.background',
        floor: isNonText ? 3 : 4.5,
        kind: isNonText ? 'nonText' : 'normalText',
        floorReason: isExemptSurface
          ? 'Rule 2 & ADR 0005: terminal.white and terminal.brightWhite carry surface step / light fill roles and are exempt from body text floor'
          : isNonText
            ? 'WCAG 2.1 AA 1.4.11 non-text terminal UI component floor'
            : 'WCAG 2.1 AA 1.4.3 terminal text floor',
        ...(isExemptSurface
          ? {
              exempt: true,
              exemptReason:
                'Rule 2 & ADR 0005: white text on light terminal background is exempt from body text floor',
            }
          : {}),
      });
    }
  }

  // 14. Editor group - live since the theme implementation
  for (const edToken of EDITOR_DEFERRED_TOKENS) {
    const shortName = edToken.replace('editor.', '');
    pairs.push({
      id: `editor-${shortName}-on-surface`,
      fgPath: edToken,
      bgPath: 'levels.surface',
      floor: 4.5,
      kind: 'normalText',
      floorReason: 'WCAG 2.1 AA 1.4.3 editor syntax text floor',
    });
  }

  return pairs;
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = buildContrastPairs();

/**
 * Generates relative luminance separation rules.
 *
 * Why luminance and not hue:
 * The metric is the WCAG relative luminance ratio, (L1 + 0.05) / (L2 + 0.05), applied between
 * two inks rather than between ink and surface. It is deliberately blind to hue, because a
 * hue-only difference at equal luminance measures 1.00:1 and is the case a dichromat reader
 * and a greyscale print both lose. Both historical collapses in this epic are caught by it:
 * cyan against br_cyan at #00857A and #00857A measures 1.00:1, and the rejected first D16 risk
 * proposal, #03830E against #996700, measures 1.01:1.
 *
 * Why 1.3, and what that number is worth:
 * No standard defines a separation floor between two categorical inks. WCAG 1.4.11 does set
 * 3:1 for a graphical object against its ADJACENT colour, which is a stricter and different
 * question, and adopting it here would fail almost every categorical palette in use.
 * 1.3 is therefore a FORK JUDGEMENT, not a citation. Its measured meaning: across the mid
 * range of this theme it is a CIE lightness difference of about 7.1 to 8.7 delta L*, computed
 * from the ratio at background luminances of 0.05 through 0.40. Treat it as the weakest
 * separation this gate will accept, not as a target, and revisit it when the token mapping derives
 * real dataVisualisation values.
 *
 * Measured margin against the adopted D16 risk scale, stated so a reader can judge the choice:
 * the tightest adjacent step, low #03830E against medium #7A5200, measures 1.40:1. The
 * threshold clears it by 0.10. That margin is thin. A stricter threshold would fail the
 * adopted scale, which D16 already anticipates: it records that four steps cannot separate by
 * colour alone and adds a mandatory non-colour cue for exactly that reason.
 *
 * Intra-tier scope:
 * Separation rules are generated WITHIN each dataVisualisation tier (primary, secondary,
 * tertiary; 3 tiers * 21 pairs = 63 rules). A chart draws its series from a single tier.
 * Two series compete for visual distinction only within that tier. Cross-tier pairs (e.g.
 * primary.purple vs secondary.purple) represent the same hue at different lightnesses
 * across distinct chart styles and never appear in the same chart series, making them
 * invalid separation candidates.
 */
function generateSeparationRules(): SeparationRule[] {
  const rules: SeparationRule[] = [];

  const separationReason =
    'Data visualization series must separate in relative luminance, minimum 1.3:1. ' +
    'The metric is blind to hue on purpose: a hue-only difference at equal luminance measures ' +
    '1.00:1 and is what a dichromat reader and a greyscale print both lose. ' +
    'The threshold is a fork judgement, not a citation. No standard sets a floor between two ' +
    'categorical inks, and WCAG 1.4.11 answers a different, stricter question. Measured, 1.3:1 ' +
    'is about 7.1 to 8.7 delta L* across this theme. ' +
    'Margin: the tightest adopted D16 step, low against medium, measures 1.40:1 and clears it by 0.10.';

  // 1. Intra-tier dataVisualisation series separation (3 tiers x 21 pairs = 63 rules)
  for (const group of DATA_VIS_TIERS) {
    const tokens = group.tokens;
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i];
        const tokenB = tokens[j];
        const nameA = tokenA.replace('dataVisualisation.', '');
        const nameB = tokenB.replace('dataVisualisation.', '');

        rules.push({
          id: `dataVis-sep-${nameA}-${nameB}`,
          tokenA,
          tokenB,
          minDelta: 1.3,
          metric: 'luminanceRatio',
          reason: separationReason,
        });
      }
    }
  }

  // 2. ANSI normal slot against bright form (8 pairs) - live since the theme implementation
  for (const slot of ANSI_SLOTS) {
    const isWhite = slot.name === 'white';
    rules.push({
      id: `terminal-ansi-sep-${slot.name}`,
      tokenA: slot.normal,
      tokenB: slot.bright,
      minDelta: isWhite ? 1.0 : 1.3,
      metric: 'luminanceRatio',
      reason: isWhite
        ? 'Named Exception in Rule 1: terminal.white and terminal.brightWhite carry surface roles and are exempt from the 1.3:1 text separation floor.'
        : 'ANSI normal slot must separate from its bright variant in relative luminance to maintain visual hierarchy in terminal text.',
    });
  }

  return rules;
}

export const SEPARATION_RULES: readonly SeparationRule[] =
  generateSeparationRules();
