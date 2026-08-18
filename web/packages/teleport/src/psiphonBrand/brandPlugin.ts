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
 * The vite plugin. It rewrites a matching literal, template quasi or JSX text
 * node during the web build, so the committed source keeps upstream wording.
 *
 * IT MUST DECLARE `enforce: 'pre'`. Measured on 2026-08-19 with a real build:
 * the resolved plugin order places a `pre` plugin at `probe | vite:react-swc |
 * ...`, so the transform sees raw `.tsx` source and a JSX text node arrives as
 * text. Without `enforce: 'pre'` the same hook runs after `vite:react-swc` and
 * receives compiled `jsx(...)` calls instead.
 *
 * The plugin edits through `magic-string`, so the transform returns a source
 * map instead of a bare string. `guard-wasm.ts:45` returns a bare string for
 * one dependency module, which is acceptable there and is not acceptable
 * across the first-party modules this plugin touches.
 */

import MagicString from 'magic-string';
import type { Plugin } from 'vite';

import {
  BRAND_BASELINE,
  BRAND_CATALOG,
  type BrandBaselineEntry,
  type BrandPhrase,
} from './brandCatalog';
import {
  editsForRegion,
  matchNode,
  orderMatchRules,
  visitNodes,
} from './brandMatcher';
import {
  assertBundleBaselineHealth,
  formatBundleReport,
  isBundleGateStrict,
  scanBundleResidual,
  type BundleScanResult,
} from './bundleGate';

/** Roots the transform applies to. `web/packages/shared` has no `src`. */
const TRANSFORM_ROOTS = [
  'web/packages/teleport/src/',
  'web/packages/design/src/',
  'web/packages/shared/',
];

/** Strip a vite id down to a plain path, dropping any query or null prefix. */
export function normaliseId(id: string): string {
  const withoutQuery = id.split('?')[0];
  // Vite prefixes a virtual module id with a NUL. Strip it without a regex,
  // because a control character in a pattern is a lint error.
  const withoutNul = withoutQuery.startsWith('\u0000')
    ? withoutQuery.slice(1)
    : withoutQuery;
  return withoutNul.split('\\').join('/');
}

/** True when the transform applies to this module id. */
export function shouldTransform(id: string): boolean {
  const path = normaliseId(id);
  if (!/\.(ts|tsx)$/.test(path)) {
    return false;
  }
  if (/\.(test|story)\.tsx?$/.test(path)) {
    return false;
  }
  if (path.includes('/node_modules/')) {
    return false;
  }
  if (path.includes('/libs/ironrdp/pkg/')) {
    return false;
  }
  return TRANSFORM_ROOTS.some(root => path.includes(root));
}

export interface BrandTransformResult {
  readonly code: string;
  readonly map: ReturnType<MagicString['generateMap']>;
  readonly edits: number;
}

/**
 * Apply the catalog to one module. Returns null when nothing changed, which is
 * the common case and keeps the module untouched.
 */
export function applyBrandCatalog(
  code: string,
  filePath: string,
  catalog: readonly BrandPhrase[] = BRAND_CATALOG,
  baseline: readonly BrandBaselineEntry[] = BRAND_BASELINE
): BrandTransformResult | null {
  // The baseline joins the ordering, so the plugin and the gate agree on what
  // matched. ADR 0007 amendment 4. Without the baseline here the plugin would
  // rewrite part of a phrase that the gate treats as untouched, and the two
  // readers would stop producing the same counts.
  const sorted = orderMatchRules(catalog, baseline);
  const nodes = visitNodes(code, filePath);
  const magic = new MagicString(code);
  let edits = 0;

  for (const node of nodes) {
    const { regions } = matchNode(node, sorted);
    for (const region of regions) {
      for (const edit of editsForRegion(node, region)) {
        magic.overwrite(edit.start, edit.end, edit.text);
        edits++;
      }
    }
  }

  if (edits === 0) {
    return null;
  }
  return {
    code: magic.toString(),
    map: magic.generateMap({ source: filePath, hires: true }),
    edits,
  };
}

/**
 * The plugin. `transform` is layer 0, the rewrite. `generateBundle` is layer 2,
 * the residual scan of what actually ships.
 */
export function psiphonBrandPlugin(): Plugin {
  let transformedModules = 0;
  let appliedEdits = 0;

  return {
    name: 'psiphon-brand',
    // Required. See the module comment: without this the hook receives
    // compiled jsx() calls and a JSX text node is unreachable as text.
    enforce: 'pre',

    transform(code, id) {
      if (!shouldTransform(id)) {
        return undefined;
      }
      // Cheap reject. Parsing every module would cost far more than it saves.
      if (!/teleport/i.test(code)) {
        return undefined;
      }
      const result = applyBrandCatalog(code, normaliseId(id));
      if (!result) {
        return undefined;
      }
      transformedModules++;
      appliedEdits += result.edits;
      return { code: result.code, map: result.map };
    },

    generateBundle(_options, bundle) {
      const results: BundleScanResult[] = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk') {
          continue;
        }
        if (!fileName.endsWith('.js')) {
          continue;
        }
        results.push(scanBundleResidual(fileName, output.code));
      }

      const strict = isBundleGateStrict();
      // The bundle exclusion list has its own ratchet, and it runs in both
      // modes. A record that stopped matching fails the build here, before
      // anything else is judged, so the list can only shrink.
      const verdict = assertBundleBaselineHealth(results);
      const unaccounted = results.reduce(
        (n, r) => n + r.residualOccurrences,
        0
      );
      const report =
        `psiphon-brand: rewrote ${appliedEdits} occurrences in ${transformedModules} modules.\n` +
        formatBundleReport(results, strict, 25, verdict);

      if (strict && unaccounted > 0) {
        throw new Error(
          `psiphon-brand: the emitted bundle still holds ${unaccounted} unaccounted occurrences of the brand word. ` +
            'The source baseline is empty, so strict bundle enforcement is on. ' +
            'Add a catalog entry, or add an excluded host, for every run below.\n' +
            report
        );
      }

      if (transformedModules === 0 && BRAND_CATALOG.some(e => !e.immutable)) {
        throw new Error(
          'psiphon-brand: the catalog holds a mutable entry but the transform rewrote no module. ' +
            'The plugin did not run over the source tree, so the bundle would ship upstream wording silently.'
        );
      }

      // eslint-disable-next-line no-console
      console.log(report);
      if (BRAND_BASELINE.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `psiphon-brand: strict bundle enforcement is off because the source baseline still admits ${BRAND_BASELINE.length} phrases. It switches on by itself when that reaches zero.`
        );
      }
    },
  };
}
