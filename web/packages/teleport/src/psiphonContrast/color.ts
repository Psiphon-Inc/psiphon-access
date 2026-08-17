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
 * Represents an opaque RGB color (alpha = 1).
 */
export interface OpaqueColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: 1;
}

/**
 * Represents a color with an alpha channel that may be non-opaque (0 <= alpha <= 1).
 */
export interface ColorWithAlpha {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

/**
 * Any valid color value, either opaque or with alpha.
 */
export type Color = OpaqueColor | ColorWithAlpha;

/**
 * Input accepted where an opaque color is required:
 * either an OpaqueColor object or a string that parses to an OpaqueColor.
 */
export type OpaqueColorInput = OpaqueColor | string;

/**
 * Input accepted where any color is allowed:
 * either a Color object or any valid color string.
 */
export type ColorInput = Color | string;

/**
 * Type guard checking if a color is completely opaque.
 */
export function isOpaque(color: Color): color is OpaqueColor {
  return color.alpha === 1;
}

/**
 * Parses a color input (string or object) into a Color structure.
 * Supports #rgb, #rrggbb, rgb(r,g,b), rgba(r,g,b,a) with inconsistent whitespace,
 * and named colors ('white', 'black', 'transparent').
 *
 * Throws an error naming the offending input if malformed.
 */
export function parseColor(input: ColorInput): Color {
  if (typeof input === 'object' && input !== null) {
    if (
      typeof input.r === 'number' &&
      typeof input.g === 'number' &&
      typeof input.b === 'number' &&
      typeof input.alpha === 'number' &&
      input.r >= 0 &&
      input.r <= 255 &&
      input.g >= 0 &&
      input.g <= 255 &&
      input.b >= 0 &&
      input.b <= 255 &&
      !isNaN(input.alpha) &&
      input.alpha >= 0 &&
      input.alpha <= 1
    ) {
      if (input.alpha === 1) {
        return {
          r: Math.round(input.r),
          g: Math.round(input.g),
          b: Math.round(input.b),
          alpha: 1,
        };
      }
      return {
        r: Math.round(input.r),
        g: Math.round(input.g),
        b: Math.round(input.b),
        alpha: input.alpha,
      };
    }
    throw new Error(`Invalid color object: ${JSON.stringify(input)}`);
  }

  if (typeof input !== 'string') {
    throw new Error(`Invalid color input: ${String(input)}`);
  }

  const str = input.trim().toLowerCase();

  if (str === 'white') {
    return { r: 255, g: 255, b: 255, alpha: 1 };
  }
  if (str === 'black') {
    return { r: 0, g: 0, b: 0, alpha: 1 };
  }
  if (str === 'transparent') {
    return { r: 0, g: 0, b: 0, alpha: 0 };
  }

  // #rgb (3 hex digits)
  const hex3Match = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(str);
  if (hex3Match) {
    const r = parseInt(hex3Match[1] + hex3Match[1], 16);
    const g = parseInt(hex3Match[2] + hex3Match[2], 16);
    const b = parseInt(hex3Match[3] + hex3Match[3], 16);
    return { r, g, b, alpha: 1 };
  }

  // #rrggbb (6 hex digits)
  const hex6Match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(str);
  if (hex6Match) {
    const r = parseInt(hex6Match[1], 16);
    const g = parseInt(hex6Match[2], 16);
    const b = parseInt(hex6Match[3], 16);
    return { r, g, b, alpha: 1 };
  }

  // rgb(r, g, b)
  const rgbMatch =
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(str);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if (r <= 255 && g <= 255 && b <= 255) {
      return { r, g, b, alpha: 1 };
    }
  }

  // rgba(r, g, b, a)
  const rgbaMatch =
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([0-9.]+)\s*\)$/i.exec(
      str
    );
  if (rgbaMatch) {
    const r = Number(rgbaMatch[1]);
    const g = Number(rgbaMatch[2]);
    const b = Number(rgbaMatch[3]);
    const alpha = Number(rgbaMatch[4]);
    if (
      r <= 255 &&
      g <= 255 &&
      b <= 255 &&
      !isNaN(alpha) &&
      alpha >= 0 &&
      alpha <= 1
    ) {
      if (alpha === 1) {
        return { r, g, b, alpha: 1 };
      }
      return { r, g, b, alpha };
    }
  }

  throw new Error(`Invalid color string: "${input}"`);
}

/**
 * Parses a color input that must be opaque (alpha = 1).
 * Throws an error naming the input if it carries non-opaque alpha.
 */
export function parseOpaqueColor(input: OpaqueColorInput): OpaqueColor {
  const color = parseColor(input);
  if (!isOpaque(color)) {
    const name = typeof input === 'string' ? input : toHex(color);
    throw new Error(
      `Cannot use color with alpha ${color.alpha} as an opaque color without compositing over a surface first: "${name}"`
    );
  }
  return color;
}

/**
 * Converts sRGB channel [0..255] to linearized sRGB value [0..1].
 */
function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Calculates WCAG 2.1 sRGB relative luminance for an opaque color.
 */
export function relativeLuminance(input: OpaqueColorInput): number {
  const c = parseOpaqueColor(input);
  const r = linearize(c.r);
  const g = linearize(c.g);
  const b = linearize(c.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates WCAG 2.1 contrast ratio between two opaque colors.
 */
export function contrastRatio(
  colorA: OpaqueColorInput,
  colorB: OpaqueColorInput
): number {
  const lA = relativeLuminance(colorA);
  const lB = relativeLuminance(colorB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Composites a foreground color (with or without alpha) over an opaque background surface.
 * Returns an OpaqueColor.
 */
export function composite(fg: ColorInput, bg: OpaqueColorInput): OpaqueColor {
  const fgColor = parseColor(fg);
  const bgColor = parseOpaqueColor(bg);

  const a = fgColor.alpha;
  const r = Math.round(fgColor.r * a + bgColor.r * (1 - a));
  const g = Math.round(fgColor.g * a + bgColor.g * (1 - a));
  const b = Math.round(fgColor.b * a + bgColor.b * (1 - a));

  return { r, g, b, alpha: 1 };
}

/**
 * Scales each channel of a color by a factor (Teleport hover/active pattern).
 * Clamps channels to [0, 255].
 */
export function scaleChannel(color: ColorInput, factor: number): Color {
  const c = parseColor(color);
  const r = Math.min(255, Math.max(0, Math.round(c.r * factor)));
  const g = Math.min(255, Math.max(0, Math.round(c.g * factor)));
  const b = Math.min(255, Math.max(0, Math.round(c.b * factor)));

  if (c.alpha === 1) {
    return { r, g, b, alpha: 1 };
  }
  return { r, g, b, alpha: c.alpha };
}

/**
 * Returns a new Color with a modified alpha value [0..1].
 */
export function withAlpha(color: ColorInput, alpha: number): Color {
  const c = parseColor(color);
  if (isNaN(alpha) || alpha < 0 || alpha > 1) {
    throw new Error(`Invalid alpha value: ${alpha}`);
  }
  if (alpha === 1) {
    return { r: c.r, g: c.g, b: c.b, alpha: 1 };
  }
  return { r: c.r, g: c.g, b: c.b, alpha };
}

/**
 * Formats a color object or string as an uppercase 6-digit hex string (#RRGGBB).
 */
export function toHex(color: ColorInput): string {
  const c = parseColor(color);
  const hexR = c.r.toString(16).padStart(2, '0').toUpperCase();
  const hexG = c.g.toString(16).padStart(2, '0').toUpperCase();
  const hexB = c.b.toString(16).padStart(2, '0').toUpperCase();
  return `#${hexR}${hexG}${hexB}`;
}
