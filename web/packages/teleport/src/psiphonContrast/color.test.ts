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
  parseColor,
  parseOpaqueColor,
  isOpaque,
  relativeLuminance,
  contrastRatio,
  composite,
  scaleChannel,
  withAlpha,
  toHex,
} from './color';

describe('psiphonContrast/color', () => {
  describe('parseColor and parseOpaqueColor', () => {
    test('parses 6-digit hex colors', () => {
      const c = parseColor('#FF703C');
      expect(c).toEqual({ r: 255, g: 112, b: 60, alpha: 1 });
      expect(isOpaque(c)).toBe(true);
    });

    test('parses 3-digit short hex colors', () => {
      const c = parseColor('#000');
      expect(c).toEqual({ r: 0, g: 0, b: 0, alpha: 1 });
      expect(isOpaque(c)).toBe(true);
    });

    test('parses rgb() with varying internal whitespace', () => {
      const c1 = parseColor('rgb(255, 112, 60)');
      const c2 = parseColor('rgb(255,112,60)');
      const c3 = parseColor('rgb( 255 ,  112 , 60 )');
      expect(c1).toEqual({ r: 255, g: 112, b: 60, alpha: 1 });
      expect(c2).toEqual(c1);
      expect(c3).toEqual(c1);
    });

    test('parses rgba() with varying internal whitespace', () => {
      const c1 = parseColor('rgba(81,47,201, 0.1)');
      const c2 = parseColor('rgba(0, 125, 107, 0.1)');
      const c3 = parseColor('rgba(0,0,0,0.54)');
      expect(c1).toEqual({ r: 81, g: 47, b: 201, alpha: 0.1 });
      expect(c2).toEqual({ r: 0, g: 125, b: 107, alpha: 0.1 });
      expect(c3).toEqual({ r: 0, g: 0, b: 0, alpha: 0.54 });
    });

    test('parses named colors white, black, transparent', () => {
      expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, alpha: 1 });
      expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, alpha: 1 });
      expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
    });

    test('throws error naming the offending input for malformed/unsupported color strings', () => {
      expect(() => parseColor('invalid-color')).toThrow('invalid-color');
      expect(() => parseColor('#12345')).toThrow('#12345');
      expect(() => parseColor('rgb(300, 0, 0)')).toThrow('rgb(300, 0, 0)');
      expect(() => parseColor('rgba(0, 0, 0, 1.5)')).toThrow(
        'rgba(0, 0, 0, 1.5)'
      );
      expect(() => parseColor('#gggggg')).toThrow('#gggggg');
    });

    test('parseOpaqueColor throws error naming input when given a color with alpha', () => {
      expect(() => parseOpaqueColor('rgba(0, 0, 0, 0.54)')).toThrow(
        'rgba(0, 0, 0, 0.54)'
      );
    });
  });

  describe('relativeLuminance', () => {
    test('calculates relative luminance for white and black', () => {
      expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1.0, 5);
      expect(relativeLuminance('#000000')).toBeCloseTo(0.0, 5);
    });
  });

  describe('contrastRatio', () => {
    test('reproduces mapping document ratios to two decimal places', () => {
      // 1. white on #FF703C is 2.75:1
      expect(contrastRatio('#FFFFFF', '#FF703C').toFixed(2)).toBe('2.75');

      // 2. black on #FF703C is 7.63:1
      expect(contrastRatio('#000000', '#FF703C').toFixed(2)).toBe('7.63');

      // 3. #757575 on #EDEDED is 3.94:1
      expect(contrastRatio('#757575', '#EDEDED').toFixed(2)).toBe('3.94');

      // 4. black on #FFAB00 is 11.08:1
      expect(contrastRatio('#000000', '#FFAB00').toFixed(2)).toBe('11.08');

      // 5. #5C5C5C on #EDEDED is 5.71:1
      expect(contrastRatio('#5C5C5C', '#EDEDED').toFixed(2)).toBe('5.71');

      // 6. #D95F33 on #FFFFFF is 3.73:1
      expect(contrastRatio('#D95F33', '#FFFFFF').toFixed(2)).toBe('3.73');
    });

    test('is commutative', () => {
      const r1 = contrastRatio('#FFFFFF', '#FF703C');
      const r2 = contrastRatio('#FF703C', '#FFFFFF');
      expect(r1).toBe(r2);
    });
  });

  describe('composite', () => {
    test('reproduces documented identities', () => {
      // rgba(0,0,0,0.54) over #FFFFFF is exactly #757575
      const c1 = composite('rgba(0,0,0,0.54)', '#FFFFFF');
      expect(toHex(c1)).toBe('#757575');

      // black at 0.38 over #FFFFFF is #9E9E9E
      const black038 = withAlpha('#000000', 0.38);
      const c2 = composite(black038, '#FFFFFF');
      expect(toHex(c2)).toBe('#9E9E9E');
    });

    test('throws when background carries alpha', () => {
      expect(() => composite('#000000', 'rgba(255, 255, 255, 0.5)')).toThrow(
        'rgba(255, 255, 255, 0.5)'
      );
    });
  });

  describe('scaleChannel', () => {
    test('scales each channel of #FF703C by 0.85 to get #D95F33', () => {
      const scaled = scaleChannel('#FF703C', 0.85);
      expect(toHex(scaled)).toBe('#D95F33');
    });

    test('clamps channels to [0, 255]', () => {
      const scaledUp = scaleChannel('#808080', 2.0);
      expect(toHex(scaledUp)).toBe('#FFFFFF');

      const scaledDown = scaleChannel('#FF703C', -0.5);
      expect(toHex(scaledDown)).toBe('#000000');
    });
  });

  describe('toHex', () => {
    test('formats color objects to uppercase hex', () => {
      expect(toHex({ r: 255, g: 112, b: 60, alpha: 1 })).toBe('#FF703C');
      expect(toHex({ r: 117, g: 117, b: 117, alpha: 1 })).toBe('#757575');
    });
  });
});
