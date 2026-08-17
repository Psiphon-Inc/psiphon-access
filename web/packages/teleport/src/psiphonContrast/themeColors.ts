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

import { createThemeSystem } from '@gravitational/design-system';

import { psiphonUiTheme } from '../psiphonTheme';
import { parseColor, type Color } from './color';

export interface ThemeColorLeaf {
  path: string;
  group: string;
  color: Color;
  rawValue: string;
}

/**
 * baseSystems memoises one Chakra system per theme config object.
 *
 * The base palette must come from the fork's own config rather than from
 * Chakra's defaults. Two leaves reference it, notice.background through
 * {colors.blue.50} and highlightedNavigationItem through {colors.blue.200}.
 * A system built without the config would keep answering with the Chakra
 * default once the fork authors its own palette, so the gate would report a
 * ratio for a colour the interface does not use.
 *
 * Construction is lazy, and a failure is not fatal. Chakra expands every
 * reference in the config when it builds a system, so a config that Chakra
 * cannot expand throws from inside Chakra. Only a leaf that references outside
 * semanticTokens needs the palette at all, so a theme whose references all
 * resolve locally never builds a system. When construction does fail, the base
 * palette is simply unavailable, and the caller reports the missing reference
 * target against the token path that asked for it.
 */
const baseSystems = new WeakMap<
  object,
  ReturnType<typeof createThemeSystem> | null
>();

function baseSystemFor(
  config: object
): ReturnType<typeof createThemeSystem> | null {
  if (baseSystems.has(config)) {
    return baseSystems.get(config) ?? null;
  }
  let system: ReturnType<typeof createThemeSystem> | null = null;
  try {
    system = createThemeSystem(config as never);
  } catch {
    system = null;
  }
  baseSystems.set(config, system);
  return system;
}

function getRawLightValue(node: any): string | undefined {
  if (node === null || typeof node !== 'object') {
    if (typeof node === 'string') {
      return node;
    }
    return undefined;
  }
  if ('value' in node) {
    const val = node.value;
    if (val !== null && typeof val === 'object') {
      if ('_light' in val) {
        return val._light;
      }
    } else if (typeof val === 'string') {
      return val;
    }
  }
  return undefined;
}

function lookupInSemanticTokens(
  colorsObj: any,
  tokenPath: string
): string | undefined {
  const parts = tokenPath.split('.');
  let curr = colorsObj;
  for (const part of parts) {
    if (curr === null || typeof curr !== 'object' || !(part in curr)) {
      return undefined;
    }
    curr = curr[part];
  }
  return getRawLightValue(curr);
}

function lookupInBasePalette(
  tokenPath: string,
  config: object
): string | undefined {
  const system = baseSystemFor(config);
  if (system === null) {
    return undefined;
  }
  const token =
    system.tokens.getByName(`colors.${tokenPath}`) ??
    system.tokens.getByName(tokenPath);
  if (token && typeof token.value === 'string') {
    return token.value;
  }
  return undefined;
}

function resolveValue(
  expr: string,
  tokenPath: string,
  colorsObj: any,
  visited: Set<string>,
  config: object
): Color {
  const trimmed = expr.trim();

  // Reference syntax: {colors.PATH}
  const refMatch = /^\{colors\.([^}]+)\}$/.exec(trimmed);
  if (refMatch) {
    const targetPath = refMatch[1].trim();
    if (visited.has(targetPath)) {
      throw new Error(
        `Reference cycle detected for token path "${tokenPath}" at "${targetPath}"`
      );
    }
    const nextVisited = new Set(visited);
    nextVisited.add(targetPath);

    const rawVal =
      lookupInSemanticTokens(colorsObj, targetPath) ??
      lookupInBasePalette(targetPath, config);
    if (rawVal === undefined) {
      throw new Error(
        `Missing reference target "${targetPath}" for token path "${tokenPath}"`
      );
    }
    return resolveValue(rawVal, tokenPath, colorsObj, nextVisited, config);
  }

  // color-mix syntax: color-mix(in srgb, <color1> <pct1>%, <color2>)
  const mixMatch =
    /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+?)\s*\)$/i.exec(
      trimmed
    );
  if (mixMatch) {
    const color1Expr = mixMatch[1].trim();
    const pct1 = Number(mixMatch[2]);
    const part2Raw = mixMatch[3].trim();

    let color2Expr = part2Raw;
    let pct2 = 100 - pct1;

    const part2PctMatch = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(part2Raw);
    if (part2PctMatch) {
      color2Expr = part2PctMatch[1].trim();
      pct2 = Number(part2PctMatch[2]);
    }

    const c1 = resolveValue(color1Expr, tokenPath, colorsObj, visited, config);
    const c2 = resolveValue(color2Expr, tokenPath, colorsObj, visited, config);

    const totalPct = pct1 + pct2;
    const w1 = totalPct > 0 ? pct1 / totalPct : 0.5;
    const w2 = totalPct > 0 ? pct2 / totalPct : 0.5;

    const alpha = c1.alpha * w1 + c2.alpha * w2;
    if (alpha === 0) {
      return { r: 0, g: 0, b: 0, alpha: 0 };
    }

    const r = Math.round((c1.r * c1.alpha * w1 + c2.r * c2.alpha * w2) / alpha);
    const g = Math.round((c1.g * c1.alpha * w1 + c2.g * c2.alpha * w2) / alpha);
    const b = Math.round((c1.b * c1.alpha * w1 + c2.b * c2.alpha * w2) / alpha);

    return alpha === 1 ? { r, g, b, alpha: 1 } : { r, g, b, alpha };
  }

  // Direct color string parsing
  try {
    return parseColor(trimmed);
  } catch (e) {
    throw new Error(
      `Unhandled expression "${trimmed}" for token path "${tokenPath}"`,
      { cause: e }
    );
  }
}

export function getResolvedThemeColors(
  theme: any = psiphonUiTheme
): ThemeColorLeaf[] {
  const colorsObj = theme?.config?.theme?.semanticTokens?.colors;
  if (!colorsObj || typeof colorsObj !== 'object') {
    throw new Error(
      'Invalid theme: missing config.theme.semanticTokens.colors'
    );
  }

  const leaves: ThemeColorLeaf[] = [];

  function walk(node: any, pathParts: string[]) {
    if (node === null || typeof node !== 'object') {
      return;
    }

    if ('value' in node) {
      const fullPath = pathParts.join('.');
      const group = pathParts[0];
      const rawLight = getRawLightValue(node);

      if (rawLight === undefined) {
        throw new Error(`Missing value for token path "${fullPath}"`);
      }

      const visited = new Set<string>([fullPath]);
      const color = resolveValue(
        rawLight,
        fullPath,
        colorsObj,
        visited,
        theme.config
      );
      leaves.push({
        path: fullPath,
        group,
        color,
        rawValue: rawLight,
      });
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      walk(child, [...pathParts, key]);
    }
  }

  walk(colorsObj, []);
  return leaves;
}
