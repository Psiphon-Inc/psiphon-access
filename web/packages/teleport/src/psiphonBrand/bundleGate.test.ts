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
 * Tests for layer 2 of the brand gate: the bundle exclusion list, its ratchet,
 * and the proof that the plugin carrying layer 2 is actually registered.
 *
 * THE LAST GROUP IS THE IMPORTANT ONE. The gate work measured that deleting
 * `psiphonBrandPlugin()` from the vite plugin array makes the build SUCCEED,
 * because a plugin that is not registered has no `generateBundle` hook to
 * throw from. A gate cannot detect its own absence from inside itself, so the
 * check has to live outside it, in a test that reads the resolved plugin list.
 */

import { execFileSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

import {
  BRAND_CATALOG,
  EXCLUDED_HOSTS,
  type BrandPhrase,
} from './brandCatalog';
import { isExcludedByHost } from './brandMatcher';
import { psiphonBrandPlugin } from './brandPlugin';
import {
  BUNDLE_CATEGORY_RULES,
  BUNDLE_EXCLUSIONS,
  BUNDLE_NAMESPACE_LITERALS,
  type BundleCategoryRule,
  type BundleExclusion,
  type BundleNamespaceLiteral,
} from './bundleBaseline';
import {
  assertBundleBaselineHealth,
  bundleExclusionKey,
  bundleNamespaceKey,
  decodeCharacterReferences,
  evaluateBundleBaseline,
  evidenceLength,
  evidenceOf,
  formatBundleReport,
  identifierAround,
  matchBoundedRegion,
  namespaceLiteralMatches,
  replacementShape,
  ruleMatches,
  runAround,
  scanBundleResidual,
  tokenAround,
  validateBundleBaseline,
} from './bundleGate';

/** A record shaped like a real one, so a test can vary one field at a time. */
function record(over: Partial<BundleExclusion> = {}): BundleExclusion {
  return {
    token: 'teleport-widget',
    shape: 'token',
    category: 'dependency-css-class',
    count: 1,
    reason: 'a reason',
    ...over,
  };
}

function rule(over: Partial<BundleCategoryRule> = {}): BundleCategoryRule {
  return {
    id: 'test-rule',
    category: 'generated-protobuf',
    shape: 'token',
    prefix: 'teleport.',
    tail: 'protobufTypePath',
    count: 1,
    reason: 'a reason',
    ...over,
  };
}

/** A catalog entry shaped like a real one, so a test can vary one field. */
function entry(over: Partial<BrandPhrase> = {}): BrandPhrase {
  return {
    source: 'teleport-placeholder',
    replacement: 'teleport-placeholder',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason: 'a reason',
    ...over,
  };
}

function literal(
  over: Partial<BundleNamespaceLiteral> = {}
): BundleNamespaceLiteral {
  return {
    id: 'test-literal',
    literal: 'teleport',
    anchor: 'cssVarsPrefix:',
    category: 'dependency-css-namespace',
    count: 1,
    site: 'a site',
    reason: 'a reason',
    ...over,
  };
}

describe('bundle exclusion list, validity', () => {
  it('the shipped list validates', () => {
    expect(validateBundleBaseline()).toEqual([]);
    expect(BUNDLE_EXCLUSIONS.length).toBeGreaterThan(0);
    expect(BUNDLE_CATEGORY_RULES.length).toBeGreaterThan(0);
    expect(BUNDLE_NAMESPACE_LITERALS.length).toBeGreaterThan(0);
  });

  it('every shipped record and rule states a reason', () => {
    for (const exclusion of BUNDLE_EXCLUSIONS) {
      expect(exclusion.reason.trim().length).toBeGreaterThan(0);
    }
    for (const r of BUNDLE_CATEGORY_RULES) {
      expect(r.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('rejects a record that is the bare brand word', () => {
    const problems = validateBundleBaseline(
      [record({ token: 'Teleport' })],
      []
    );
    expect(problems.join('\n')).toContain('not longer than the brand word');
  });

  it('rejects a record that does not hold the brand word at all', () => {
    const problems = validateBundleBaseline(
      [record({ token: 'psiphon-x' })],
      []
    );
    expect(problems.join('\n')).toContain('does not contain the brand word');
  });

  it('rejects the broad rule that ADR 0007 rejected', () => {
    // A rule whose prefix is the bare word would swallow every occurrence,
    // including copy. The length check makes that unexpressible.
    const problems = validateBundleBaseline(
      [],
      [rule({ prefix: 'teleport', tail: 'lowerKebab' })]
    );
    expect(problems.join('\n')).toContain('would swallow copy');
  });

  it('rejects an empty reason, a zero count and a duplicate', () => {
    const problems = validateBundleBaseline(
      [record({ reason: '  ' }), record({ count: 0 })],
      []
    );
    const text = problems.join('\n');
    expect(text).toContain('has no reason');
    expect(text).toContain('count below 1');
    expect(text).toContain('is a duplicate');
  });
});

/**
 * The namespace literal is the ONE key in this file that is as short as the
 * brand word, so it is the one place a phrase could get in. These tests are
 * the proof that it cannot.
 */
describe('the namespace literal, and why it cannot admit copy', () => {
  it('every shipped literal names one site, one reason and a cap', () => {
    for (const shipped of BUNDLE_NAMESPACE_LITERALS) {
      expect(shipped.literal).toBe('teleport');
      expect(shipped.site.trim().length).toBeGreaterThan(0);
      expect(shipped.reason.trim().length).toBeGreaterThan(0);
      expect(shipped.count).toBeGreaterThan(0);
    }
  });

  it('THE PROOF: no expressible literal can admit a phrase', () => {
    // Try, with the widest anchor the validator allows, to write a record that
    // takes `Welcome to Teleport`. There are only two levers, the literal and
    // the anchor, and both are tried here.
    const asPhrase = literal({ literal: 'Welcome to Teleport', anchor: '(' });
    expect(validateBundleBaseline([], [], [asPhrase]).join('\n')).toContain(
      'not the bare lower-case brand word'
    );
    const asCapital = literal({ literal: 'Teleport' });
    expect(validateBundleBaseline([], [], [asCapital]).join('\n')).toContain(
      'not the bare lower-case brand word'
    );
    const asSuffix = literal({ literal: 'teleport roles' });
    expect(validateBundleBaseline([], [], [asSuffix]).join('\n')).toContain(
      'not the bare lower-case brand word'
    );

    // The anchor is the only remaining lever, and it cannot name the tail of a
    // sentence, because it must end in a structural character.
    const asSentenceTail = literal({ anchor: 'Welcome to ' });
    expect(
      validateBundleBaseline([], [], [asSentenceTail]).join('\n')
    ).toContain('An anchor must end in one of');
    expect(validateBundleBaseline([], [], [literal({ anchor: '' })])).toEqual([
      expect.stringContaining('has no anchor'),
    ]);

    // And with a valid record, the phrase still does not match, because the
    // word has to be the WHOLE string between two identical quotes.
    const valid = literal({ anchor: '(' });
    for (const phrase of [
      'f("Welcome to Teleport")',
      'f("Welcome to teleport")',
      'f(`Please ask your Teleport administrator to update your role`)',
      'f(`teleport roles`)',
      'f(`the teleport binary`)',
    ]) {
      const at = phrase.toLowerCase().indexOf('teleport');
      expect(namespaceLiteralMatches(valid, phrase, at)).toBe(false);
    }

    // Nor does a bare word that is not quoted at all, nor one whose two sides
    // carry different quotes, nor a capitalised whole string.
    const unquoted = 'f(teleport)';
    expect(
      namespaceLiteralMatches(valid, unquoted, unquoted.indexOf('teleport'))
    ).toBe(false);
    const mixed = 'f(`teleport")';
    expect(
      namespaceLiteralMatches(valid, mixed, mixed.indexOf('teleport'))
    ).toBe(false);
    const capital = 'f(`Teleport`)';
    expect(
      namespaceLiteralMatches(valid, capital, capital.indexOf('Teleport'))
    ).toBe(false);

    // What it DOES take: a complete lower-case literal at the anchor.
    const wanted = 'f(`teleport`)';
    expect(
      namespaceLiteralMatches(valid, wanted, wanted.indexOf('teleport'))
    ).toBe(true);
  });

  it('rejects a nameless site, a zero count and a duplicate', () => {
    const problems = validateBundleBaseline(
      [],
      [],
      [literal({ site: '  ' }), literal({ count: 0 }), literal({ reason: '' })]
    );
    const text = problems.join('\n');
    expect(text).toContain('names no site');
    expect(text).toContain('count below 1');
    expect(text).toContain('has no reason');
    expect(text).toContain('is a duplicate');
  });

  it('the anchor pins a record to one position, not to a shape', () => {
    // The same complete literal at a different position is not admitted. This
    // is what stops the three design system records absorbing the five
    // first-party bare words that the gate work owns.
    const prefixed = literal({ anchor: 'cssVarsPrefix:' });
    const here = 'x={cssVarsPrefix:`teleport`}';
    expect(
      namespaceLiteralMatches(prefixed, here, here.indexOf('teleport'))
    ).toBe(true);
    const elsewhere = 'x={placeholder:`teleport`}';
    expect(
      namespaceLiteralMatches(
        prefixed,
        elsewhere,
        elsewhere.indexOf('teleport')
      )
    ).toBe(false);
  });

  it('the shipped literals take the three design system sites and no more', () => {
    // The three positions, as the minifier emits them, plus the five other
    // whole-string bare words the same build holds. Only the three are taken.
    const designSystem =
      'a=Yd({preflight:!0,cssVarsPrefix:`teleport`,cssVarsRoot:`:root`});' +
      'b={mode:1,name:`teleport`,config:c};' +
      'return t(e,[`teleport`,`colors`]);';
    const firstParty =
      'SNe=`teleport`;' +
      'x({placeholder:`teleport`});' +
      'y({children:`teleport`});' +
      'z=r.info?.repository||`teleport`;' +
      'w=r.info?.repository??`teleport`;';
    const result = scanBundleResidual(
      'app/app.js',
      designSystem + firstParty,
      [],
      []
    );
    expect(result.totalOccurrences).toBe(8);
    expect(result.accountedByNamespace).toBe(3);
    expect(result.accountedByExclusion).toBe(0);
    expect(result.residualOccurrences).toBe(5);
    for (const shipped of BUNDLE_NAMESPACE_LITERALS) {
      expect(result.exclusionHits[bundleNamespaceKey(shipped)]).toBe(1);
    }
  });

  it('THE CAP: a fourth match at an anchored position fails the build', () => {
    // The count on a record is a note. The count on a namespace literal is a
    // cap, because this is the only key that can reach a one-word string.
    const capped = literal({ count: 1 });
    const twice = 'a={cssVarsPrefix:`teleport`};b={cssVarsPrefix:`teleport`};';
    const result = scanBundleResidual(
      'app/app.js',
      twice,
      [],
      [],
      [],
      [],
      [capped]
    );
    expect(result.accountedByNamespace).toBe(2);
    const verdict = evaluateBundleBaseline([result], [], [], [capped]);
    expect(verdict.overflow).toHaveLength(1);
    expect(verdict.overflow[0]).toContain('BUNDLE_CAP_FAIL');
    expect(verdict.overflow[0]).toContain('records 1');
    expect(verdict.overflow[0]).toContain('matched 2');
    expect(() =>
      assertBundleBaselineHealth([result], [], [], [capped])
    ).toThrow(/BUNDLE_CAP_FAIL/);
  });

  it('the ratchet removes a namespace literal that stops matching', () => {
    const gone = literal({ anchor: 'goneAway:' });
    const result = scanBundleResidual(
      'app/app.js',
      'a={cssVarsPrefix:`teleport`};',
      [],
      [],
      [],
      [],
      [gone]
    );
    const verdict = evaluateBundleBaseline([result], [], [], [gone]);
    expect(verdict.obsolete).toHaveLength(1);
    expect(verdict.obsolete[0]).toContain('BUNDLE_RATCHET_FAIL');
    expect(verdict.obsolete[0]).toContain('The list can only shrink');
  });
});

describe('bundle exclusion list, the keys it is built on', () => {
  it('the token shape keeps a dotted name whole and drops a selector dot', () => {
    const css = ';}.ace-teleport{color:red}';
    expect(tokenAround(css, css.toLowerCase().indexOf('teleport'))).toBe(
      'ace-teleport'
    );
    const proto = 'x="teleport.desktop.v1.SharedDirectoryRequest.Create";';
    expect(tokenAround(proto, proto.indexOf('teleport'))).toBe(
      'teleport.desktop.v1.SharedDirectoryRequest.Create'
    );
    const cssVar = 'color:var(--teleport-colors-brand);';
    expect(tokenAround(cssVar, cssVar.indexOf('teleport'))).toBe(
      '--teleport-colors-brand'
    );
  });

  it('the identifier shape drops a minified member prefix', () => {
    // This is why the key is not the surrounding run. The run holds `e.`, and
    // `e` is a minified name that changes on an unrelated dependency bump.
    const code = 'a={...u,validTeleportConfig:e.validTeleportConfig??!1};';
    const at = code.indexOf('e.validTeleportConfig') + 2;
    expect(tokenAround(code, code.toLowerCase().indexOf('teleport', at))).toBe(
      'e.validTeleportConfig'
    );
    expect(
      identifierAround(code, code.toLowerCase().indexOf('teleport', at))
    ).toBe('validTeleportConfig');
  });

  it('a named tail alphabet accepts its category and refuses the rest', () => {
    const proto = rule();
    expect(ruleMatches(proto, 'teleport.mfa.v1.SSOChallenge')).toBe(true);
    expect(ruleMatches(proto, 'teleport.userpreferences.v1.ViewMode')).toBe(
      true
    );
    // Not a protobuf path: no version segment, or a slash, or nothing at all.
    expect(ruleMatches(proto, 'teleport.yaml')).toBe(false);
    expect(ruleMatches(proto, 'teleport.internal/resource-id')).toBe(false);
    expect(ruleMatches(proto, 'teleport')).toBe(false);
    expect(ruleMatches(proto, 'Teleport')).toBe(false);

    const kebab = rule({ prefix: '--teleport-colors-', tail: 'lowerKebab' });
    expect(ruleMatches(kebab, '--teleport-colors-brand')).toBe(true);
    expect(ruleMatches(kebab, '--teleport-colors-')).toBe(false);
    expect(ruleMatches(kebab, '--teleport-spacing-1')).toBe(false);
  });
});

describe('bundle exclusion list, what it admits', () => {
  it('admits a record and a rule, and counts each hit', () => {
    const code =
      'const a="ace-teleport";const b="teleport.desktop.v1.Ping";' +
      'const c="teleport.mfa.v1.SSOChallenge";';
    const result = scanBundleResidual(
      'app/app.js',
      code,
      [],
      [],
      [record({ token: 'ace-teleport', count: 1 })],
      [rule({ count: 2 })]
    );
    expect(result.totalOccurrences).toBe(3);
    expect(result.accountedByExclusion).toBe(3);
    expect(result.residualOccurrences).toBe(0);
    expect(result.exclusionHits['token:ace-teleport']).toBe(1);
    expect(result.exclusionHits['rule:test-rule']).toBe(2);
  });

  it('admits by identifier when the run holds a minified neighbour', () => {
    const code = 'x(e.validTeleportConfig,I.getAwsDeployTeleportServiceUrl);';
    const result = scanBundleResidual(
      'app/app.js',
      code,
      [],
      [],
      [
        record({ token: 'validTeleportConfig', shape: 'identifier' }),
        record({
          token: 'getAwsDeployTeleportServiceUrl',
          shape: 'identifier',
        }),
      ],
      []
    );
    expect(result.residualOccurrences).toBe(0);
    expect(result.accountedByExclusion).toBe(2);
  });

  it('IS NOT VACUOUS: the shipped list never admits a lone brand word', () => {
    // The whole list, exactly as shipped, against copy. If any record, rule or
    // namespace literal ever grew broad enough to swallow a bare occurrence,
    // this fails. The last three cases are the ones the namespace literal
    // could plausibly reach: a lone word assigned to a variable, a lone word
    // in lower case inside prose, and a capitalised whole string.
    const copy =
      'const a="Welcome to Teleport";const b=`Log in to Teleport`;' +
      'const c="this Teleport Cluster.";const d="teleport";' +
      'const e="Welcome to teleport";const f=`Teleport`;';
    const result = scanBundleResidual('app/app.js', copy, [], []);
    expect(result.accountedByExclusion).toBe(0);
    expect(result.accountedByNamespace).toBe(0);
    expect(result.residualOccurrences).toBe(6);
  });

  it('still reports an occurrence that no record names', () => {
    const code = 'const a="teleport-not-on-the-list";';
    const result = scanBundleResidual('app/app.js', code, [], [], [], []);
    expect(result.residualOccurrences).toBe(1);
    expect(result.residuals[0].token).toBe('teleport-not-on-the-list');
    expect(formatBundleReport([result], true)).toContain('1 unaccounted');
  });
});

/**
 * GAP 1. A template entry whose replacement keeps the brand word can never be
 * found by searching the chunk for the replacement text, because the catalog
 * holds `${moduleSrc}` and the minified chunk holds `${i}`. The quasis, the
 * literal spans between the expressions, are what survive.
 */
describe('a template entry, consumed by its quasis', () => {
  // Shaped like the two Terraform entries in the integrations-aws leaf: a
  // template whose expressions the minifier renames and whose literal spans
  // hold the upstream module variable names.
  const terraform =
    'module "aws_discovery" {\n  source  = ${moduleSrc}\n' +
    "  teleport_proxy_public_addr    = ${cfg.proxyCluster + ':443'}\n" +
    '  teleport_discovery_group_name = "cloud-discovery-group"\n}\n';
  const emitted =
    'var q=`module "aws_discovery" {\n  source  = ${i}\n' +
    '  teleport_proxy_public_addr    = ${e.p+":443"}\n' +
    '  teleport_discovery_group_name = "cloud-discovery-group"\n}\n`;';
  const template = entry({ source: terraform, replacement: terraform });

  it('splits a replacement into quasis, and keeps an escaped ${ as text', () => {
    const shape = replacementShape('a ${x} b ${y.z + `q`} c');
    expect(shape.quasis).toEqual(['a ', ' b ', ' c']);
    expect(shape.hasExpressions).toBe(true);

    // templates.ts embeds GitHub Actions syntax, where `\${` renders a literal
    // `${`. Babel records no expression span there, so neither does this.
    const actions = replacementShape('run: \\${{ env.TELEPORT_VERSION }}');
    expect(actions.hasExpressions).toBe(false);
    expect(actions.hasEscapedDollarBrace).toBe(true);
    expect(actions.quasis).toEqual(['run: \\${{ env.TELEPORT_VERSION }}']);

    // An unterminated span means the catalog holds text no source reader could
    // have produced. Reporting a residual would hide a broken entry.
    expect(() => replacementShape('a ${x')).toThrow(/never closes/);
  });

  it('accounts the real quasi after an escaped dollar-brace', () => {
    const shipped = BRAND_CATALOG.find(candidate =>
      candidate.replacement.includes('env.TELEPORT_PROXY_ADDR')
    );
    expect(shipped).toBeDefined();

    // The template rewrite escapes each backslash, backtick, and dollar-brace.
    // This is the source form that the emitted chunk keeps.
    const emittedReplacement = (shipped as BrandPhrase).replacement
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
    const code = `var q=\`${emittedReplacement}\`;`;
    const result = scanBundleResidual(
      'app/app.js',
      code,
      [shipped as BrandPhrase],
      []
    );

    expect(result.totalOccurrences).toBe(10);
    expect(result.accountedByCatalog).toBe(10);
    expect(result.residualOccurrences).toBe(0);
  });

  it('every shipped catalog replacement parses into quasis', () => {
    for (const shipped of BRAND_CATALOG) {
      expect(() => replacementShape(shipped.replacement)).not.toThrow();
    }
  });

  it('accounts the occurrences the minified template still holds', () => {
    const before = scanBundleResidual('app/app.js', emitted, [], []);
    expect(before.residualOccurrences).toBe(2);

    const after = scanBundleResidual('app/app.js', emitted, [template], []);
    expect(after.totalOccurrences).toBe(2);
    expect(after.accountedByCatalog).toBe(2);
    expect(after.residualOccurrences).toBe(0);
  });

  it('STILL REPORTS A GENUINE MISS of the same structural shape', () => {
    // The same template shape with one variable name changed is a DIFFERENT
    // string. No entry produced it, so it stays unaccounted. This is the
    // property the whole layer exists for.
    const miss = emitted.replace(
      'teleport_proxy_public_addr',
      'teleport_secret_backdoor'
    );
    const result = scanBundleResidual(
      'app/app.js',
      `${miss}var z="Welcome to Teleport";`,
      [template],
      []
    );
    expect(result.accountedByCatalog).toBe(0);
    expect(result.residualOccurrences).toBe(3);
    expect(result.residuals.map(r => r.token)).toContain(
      'teleport_secret_backdoor'
    );
  });

  it('consumes the quasi text only, never the minified expression', () => {
    // The catalog provably produced the quasis. It did not produce
    // `${e.teleportProxy}`, so an occurrence inside an expression is somebody
    // else's to account.
    const withExpression = entry({
      source:
        'proxy address = ${cfg.teleportProxy}\n  teleport_proxy_public_addr = ok\n',
      replacement:
        'proxy address = ${cfg.teleportProxy}\n  teleport_proxy_public_addr = ok\n',
    });
    const code =
      'var q=`proxy address = ${e.teleportProxy}\n  teleport_proxy_public_addr = ok\n`;';
    const result = scanBundleResidual('app/app.js', code, [withExpression], []);
    expect(result.totalOccurrences).toBe(2);
    expect(result.accountedByCatalog).toBe(1);
    expect(result.residualOccurrences).toBe(1);
    expect(result.residuals[0].identifier).toBe('teleportProxy');
  });

  it('refuses a region that is not a complete quoted string', () => {
    // The quasis appear, in order, with the right expression shape between
    // them, but inside a longer literal. The entry did not produce that.
    const inside = emitted
      .replace('var q=`', 'var q=`prefix ')
      .replace('}\n`;', '}\nsuffix`;');
    const result = scanBundleResidual('app/app.js', inside, [template], []);
    expect(result.accountedByCatalog).toBe(0);
    expect(result.residualOccurrences).toBe(2);
  });

  it('matchBoundedRegion needs the same quote on both ends', () => {
    const shape = replacementShape('ab ${x} cd');
    const good = 'q=`ab ${i} cd`;';
    // A span stops at the last character that is evidence, so the trailing
    // space of the first quasi is outside it.
    expect(matchBoundedRegion(good, shape.quasis, good.indexOf('ab'))).toEqual([
      { start: 3, end: 5 },
      { start: 10, end: 13 },
    ]);
    const mixed = 'q=`ab ${i} cd";';
    expect(matchBoundedRegion(mixed, shape.quasis, mixed.indexOf('ab'))).toBe(
      null
    );
    const unquoted = 'q=(ab ${i} cd);';
    expect(
      matchBoundedRegion(unquoted, shape.quasis, unquoted.indexOf('ab'))
    ).toBe(null);
    // A symmetric delimiter that is not a quote does not bound a region
    // either. Only a quote makes the match a complete string literal, which
    // is what proves the entry produced the whole of it.
    const symmetric = 'q=|ab ${i} cd|;';
    expect(
      matchBoundedRegion(symmetric, shape.quasis, symmetric.indexOf('ab'))
    ).toBe(null);
    // A gap that is neither `${...}` nor an array element boundary.
    const noSpan = 'q=`ab XX cd`;';
    expect(matchBoundedRegion(noSpan, shape.quasis, noSpan.indexOf('ab'))).toBe(
      null
    );
  });
});

/**
 * A TAGGED template is lowered to a call over an array of its quasis, and the
 * styled-components transform MINIFIES the CSS on the way. Neither the whole
 * replacement nor a single quasi survives byte for byte, so this shape has to
 * be matched by its evidence: the non-whitespace characters, in order, inside
 * one complete quoted string.
 */
describe('a tagged template, lowered to an array of quasis', () => {
  // Shaped like design/src/RadioButton/RadioButton.tsx.
  const css =
    '\n  transition: all 150ms;\n\n' +
    '  input:enabled:hover + &,\n' +
    '  .teleport-radio-button__force-hover input + & {\n' +
    '    background-color: ${props => props.theme.colors.hover};\n  }\n';
  const styled = entry({ source: css, replacement: css });
  const emitted =
    'Lze=H.span([`transition:all 150ms;' +
    'input:enabled:hover + &,.teleport-radio-button__force-hover input + &' +
    '{background-color:`,`;}`],Rze);';

  it('accounts the occurrence the minified CSS still holds', () => {
    const before = scanBundleResidual('app/app.js', emitted, [], []);
    expect(before.residualOccurrences).toBe(1);

    const after = scanBundleResidual('app/app.js', emitted, [styled], []);
    expect(after.accountedByCatalog).toBe(1);
    expect(after.residualOccurrences).toBe(0);
  });

  it('STILL REPORTS A GENUINE MISS that differs in a real character', () => {
    // Whitespace is not evidence. Everything else is. One changed class name
    // is a different string and stays unaccounted.
    const miss = emitted.replace('force-hover', 'force-hoverx');
    const result = scanBundleResidual('app/app.js', miss, [styled], []);
    expect(result.accountedByCatalog).toBe(0);
    expect(result.residualOccurrences).toBe(1);
    expect(result.residuals[0].token).toBe(
      'teleport-radio-button__force-hoverx'
    );
  });

  it('needs the array element boundary, not just the two quasis', () => {
    // Drop the `,` that separates the two array elements and the shape is no
    // longer a lowered tagged template.
    const joined = emitted.replace('`,`;}`]', '`;}`]');
    const result = scanBundleResidual('app/app.js', joined, [styled], []);
    expect(result.accountedByCatalog).toBe(0);
    expect(result.residualOccurrences).toBe(1);
  });

  it('evidenceLength counts characters, not whitespace', () => {
    expect(evidenceLength('   \n\t  ')).toBe(0);
    expect(evidenceLength(' teleport ')).toBe(8);
    expect(evidenceLength(' teleport! ')).toBe(9);
  });

  it('a comment is not evidence, and the // of a URL still is', () => {
    // The transform deletes a CSS comment outright, so no source text could
    // ever match the chunk byte for byte.
    expect(evidenceOf('\n  // reset the appearance\n  color: red;\n')).toBe(
      'color:red;'
    );
    expect(evidenceOf('a /* gone */ b')).toBe('ab');
    // A `//` counts only at the start of a line, so a link keeps every
    // character it has. Without this rule a quasi holding a documentation URL
    // would lose its tail and could match text the entry never produced.
    expect(evidenceOf('see https://goteleport.com/docs now')).toBe(
      'seehttps://goteleport.com/docsnow'
    );
  });

  it('accounts a styled block whose comments the transform deleted', () => {
    const commented = entry({
      source:
        '\n  // Note: the "force" classes are required for Storybook.\n' +
        '  &:hover,\n  .teleport-checkbox__force-hover & {\n' +
        '    background-color: ${props => props.theme.hover};\n  }\n',
      replacement:
        '\n  // Note: the "force" classes are required for Storybook.\n' +
        '  &:hover,\n  .teleport-checkbox__force-hover & {\n' +
        '    background-color: ${props => props.theme.hover};\n  }\n',
    });
    const emittedCss =
      'wTe=H.input([`&:hover,.teleport-checkbox__force-hover &' +
      '{background-color:`,`;}`],Rze);';
    const before = scanBundleResidual('app/app.js', emittedCss, [], []);
    expect(before.residualOccurrences).toBe(1);

    const after = scanBundleResidual('app/app.js', emittedCss, [commented], []);
    expect(after.accountedByCatalog).toBe(1);
    expect(after.residualOccurrences).toBe(0);

    // And a real character change is still a miss.
    const changed = emittedCss.replace('&:hover', '&:focus');
    const missed = scanBundleResidual('app/app.js', changed, [commented], []);
    expect(missed.accountedByCatalog).toBe(0);
    expect(missed.residualOccurrences).toBe(1);
  });
});

/**
 * A JSX text node reaches the chunk with its character references DECODED, and
 * the layer 1 scanner reads the raw text, because the raw text is what the
 * transform rewrites. The entry provably produced both forms.
 */
describe('a JSX text entry that carries a character reference', () => {
  it('decodes a named reference and a numeric one', () => {
    expect(decodeCharacterReferences('we&apos;ll')).toBe("we'll");
    expect(decodeCharacterReferences('didn&#39;t')).toBe("didn't");
    expect(decodeCharacterReferences('a&#x27;b')).toBe("a'b");
    expect(decodeCharacterReferences('plain text')).toBe('plain text');
    // An unknown reference decodes to itself, so the occurrence is reported.
    expect(decodeCharacterReferences('a&notarealref;b')).toBe(
      'a&notarealref;b'
    );
  });

  it('accounts the decoded phrase the chunk actually holds', () => {
    const raw =
      'After running the command above, we&apos;ll automatically detect your new Teleport instance.';
    const jsx = entry({ source: raw, replacement: raw });
    const code =
      "J,{children:`After running the command above, we'll automatically detect your new Teleport instance.`}";
    const before = scanBundleResidual('app/app.js', code, [], []);
    expect(before.residualOccurrences).toBe(1);

    const after = scanBundleResidual('app/app.js', code, [jsx], []);
    expect(after.accountedByCatalog).toBe(1);
    expect(after.residualOccurrences).toBe(0);
  });

  it('STILL REPORTS a phrase the decoded form does not produce', () => {
    const raw = 'we&apos;ll detect your new Teleport instance.';
    const jsx = entry({ source: raw, replacement: raw });
    const code = "`we'll detect your old Teleport instance.`";
    const result = scanBundleResidual('app/app.js', code, [jsx], []);
    expect(result.accountedByCatalog).toBe(0);
    expect(result.residualOccurrences).toBe(1);
  });
});

/**
 * THE SHORT AND EMPTY QUASI. A quasi is the only thing this mechanism proves,
 * so a quasi carrying no more than the brand word proves nothing.
 */
describe('a short or empty quasi', () => {
  it('A QUASI NO LONGER THAN THE BRAND WORD TAKES NOTHING', () => {
    // The whole literal content is an expression, the bare word, an
    // expression. Two different templates could have that shape, so consuming
    // it would let one entry swallow another module's miss.
    const bare = entry({
      source: '${a}teleport${b}',
      replacement: '${a}teleport${b}',
    });
    const code = 'var q=`${i}teleport${o}`;';
    const result = scanBundleResidual('app/app.js', code, [bare], []);
    expect(result.accountedByCatalog).toBe(0);
    expect(result.residualOccurrences).toBe(1);
    expect(formatBundleReport([result], true)).toContain('1 unaccounted');
  });

  it('an empty quasi is not a special case: it forces its neighbours', () => {
    // Leading and trailing empty quasis. The region must open with a quote
    // immediately followed by `${`, and close with `}` immediately followed by
    // the same quote. The one long quasi in the middle is what gets consumed.
    const edged = entry({
      source: '${a} the Teleport cluster name ${b}',
      replacement: '${a} the Teleport cluster name ${b}',
    });
    const shape = replacementShape(edged.replacement);
    expect(shape.quasis).toEqual(['', ' the Teleport cluster name ', '']);

    const exact = 'var q=`${i} the Teleport cluster name ${o}`;';
    const hit = scanBundleResidual('app/app.js', exact, [edged], []);
    expect(hit.accountedByCatalog).toBe(1);
    expect(hit.residualOccurrences).toBe(0);

    // The same quasi inside a longer literal is refused, because the empty
    // quasi puts the quote right against the first `${`.
    const padded = 'var q=`prefix ${i} the Teleport cluster name ${o} tail`;';
    const missed = scanBundleResidual('app/app.js', padded, [edged], []);
    expect(missed.accountedByCatalog).toBe(0);
    expect(missed.residualOccurrences).toBe(1);
  });

  it('an empty replacement still yields one quasi', () => {
    expect(replacementShape('').quasis).toEqual(['']);
    expect(replacementShape('${a}${b}').quasis).toEqual(['', '', '']);
  });
});

/**
 * GAP 2. `sortLongestFirst` drops a whole-node entry, and that filter must
 * stay: an immutable bare-word entry matched as a substring would account
 * every lower-case occurrence in the product in one sweep. The chunk-side
 * analogue of a whole node is a COMPLETE QUOTED STRING, which is the shape
 * amendment 8 already uses for the namespace literal.
 */
describe('a whole-node entry, consumed as a complete quoted string', () => {
  const wholeNode = entry({
    source: 'teleport',
    replacement: 'teleport',
    match: 'wholeNode',
  });

  it('takes a complete quoted word and NOTHING inside a longer string', () => {
    const code =
      'a={subKind:`teleport`};b=`gravitational/teleport`;' +
      'c="Welcome to teleport";d=`teleport`;e="teleport-kube-agent";';
    const result = scanBundleResidual('app/app.js', code, [wholeNode], []);
    expect(result.totalOccurrences).toBe(5);
    expect(result.accountedByCatalog).toBe(2);
    expect(result.residualOccurrences).toBe(3);
    expect(result.residuals.map(r => r.token).sort()).toEqual([
      'gravitational/teleport',
      'teleport',
      'teleport-kube-agent',
    ]);
  });

  it('STILL REPORTS EVERY OCCURRENCE when no whole literal is present', () => {
    // The measured hazard: the gate work found that a substring reading of
    // this entry hid 401 unaccounted runs. With no complete quoted word in the
    // chunk the entry accounts nothing at all.
    const code = 'a=`gravitational/teleport`;b="teleport-kube-agent";';
    const result = scanBundleResidual('app/app.js', code, [wholeNode], []);
    expect(result.accountedByCatalog).toBe(0);
    expect(result.residualOccurrences).toBe(2);
  });

  it('DOES NOT TAKE A NAMESPACE LITERAL SITE, so that ratchet stays quiet', () => {
    // Both mechanisms can reach a complete `teleport` literal. The namespace
    // literal is the narrower key, it names its site and it carries a hard
    // cap, so it keeps the position it was measured against. Without this the
    // three design system records would match nothing and demand removal.
    const code = 'a=Yd({cssVarsPrefix:`teleport`});b={subKind:`teleport`};';
    const result = scanBundleResidual(
      'app/app.js',
      code,
      [wholeNode],
      [],
      [],
      [],
      [literal()]
    );
    expect(result.accountedByNamespace).toBe(1);
    expect(result.accountedByCatalog).toBe(1);
    expect(result.residualOccurrences).toBe(0);
    const verdict = evaluateBundleBaseline([result], [], [], [literal()]);
    expect(verdict.obsolete).toEqual([]);
    expect(verdict.overflow).toEqual([]);
  });

  it('the five accounting figures add up to the total', () => {
    const code =
      'a=Yd({cssVarsPrefix:`teleport`});b={subKind:`teleport`};' +
      'c="https://goteleport.com/docs";d="ace-teleport";' +
      'e="Welcome to Teleport";';
    const result = scanBundleResidual(
      'app/app.js',
      code,
      [wholeNode],
      EXCLUDED_HOSTS,
      [record({ token: 'ace-teleport' })],
      [],
      [literal()]
    );
    expect(
      result.accountedByCatalog +
        result.accountedByHost +
        result.accountedByExclusion +
        result.accountedByNamespace +
        result.residualOccurrences
    ).toBe(result.totalOccurrences);
    expect(result.accountedByCatalog).toBe(1);
    expect(result.accountedByHost).toBe(1);
    expect(result.accountedByExclusion).toBe(1);
    expect(result.accountedByNamespace).toBe(1);
    expect(result.residualOccurrences).toBe(1);
  });
});

describe('bundle exclusion list, the ratchet', () => {
  const stale = record({ token: 'teleport-gone-away', count: 3 });

  it('fails the run when a record stops matching', () => {
    const result = scanBundleResidual(
      'app/app.js',
      'const a="nothing here";',
      [],
      [],
      [stale],
      []
    );
    const verdict = evaluateBundleBaseline([result], [stale], [], []);
    expect(verdict.obsolete).toHaveLength(1);
    expect(verdict.obsolete[0]).toContain('BUNDLE_RATCHET_FAIL');
    expect(verdict.obsolete[0]).toContain(bundleExclusionKey(stale));
    expect(verdict.obsolete[0]).toContain('The list can only shrink');
  });

  it('fails the run when a rule stops matching', () => {
    const result = scanBundleResidual(
      'app/app.js',
      'const a="nothing here";',
      [],
      [],
      [],
      [rule()]
    );
    const verdict = evaluateBundleBaseline([result], [], [rule()], []);
    expect(verdict.obsolete).toHaveLength(1);
    expect(verdict.obsolete[0]).toContain('rule "rule:test-rule"');
  });

  it('throws in report mode too, because the list is its own concern', () => {
    const result = scanBundleResidual(
      'app/app.js',
      'const a="nothing here";',
      [],
      [],
      [stale],
      []
    );
    expect(() => assertBundleBaselineHealth([result], [stale], [], [])).toThrow(
      /BUNDLE_RATCHET_FAIL/
    );
  });

  it('reports a moved count without failing, so a bump does not cry wolf', () => {
    const keep = record({ token: 'teleport-widget', count: 5 });
    const result = scanBundleResidual(
      'app/app.js',
      'const a="teleport-widget";',
      [],
      [],
      [keep],
      []
    );
    const verdict = assertBundleBaselineHealth([result], [keep], [], []);
    expect(verdict.obsolete).toEqual([]);
    expect(verdict.drift.join('\n')).toContain('recorded 5, found 1');
    expect(formatBundleReport([result], false, 25, verdict)).toContain(
      'recorded 5, found 1'
    );
  });

  it('passes a healthy list, and admits every occurrence it names', () => {
    const keep = record({ token: 'teleport-widget', count: 1 });
    const result = scanBundleResidual(
      'app/app.js',
      'const a="teleport-widget";',
      [],
      [],
      [keep],
      []
    );
    const verdict = assertBundleBaselineHealth([result], [keep], [], []);
    expect(verdict.invalid).toEqual([]);
    expect(verdict.obsolete).toEqual([]);
    expect(verdict.overflow).toEqual([]);
    expect(verdict.drift).toEqual([]);
    expect(verdict.admitted).toBe(1);
  });
});

/**
 * WHAT WATCHES THE COPY THAT LIVES OUTSIDE THE CATALOG.
 *
 * A `?raw` import puts an asset's text straight into the bundle. The layer 1
 * scan set does not cover a `.yaml`, and neither does `shouldTransform`, so
 * the catalog cannot reach a phrase inside one. The gate work measured the
 * family on 2026-08-19: 17 `?raw` imports across 4 modules, every one of them
 * a `.yaml`, 2 assets holding the brand word, and 1 of those 2 holding it only
 * inside `goteleport.com`. One file and one line, so the fork edited the line
 * at `AuthConnectors/templates/github.yaml:16` instead of growing the
 * transform for a family of one.
 *
 * THIS IS WHAT REPLACES THE CATALOG FOR THAT LINE. It discovers the imports by
 * reading the source, so a NEW `?raw` import is covered the day it lands, and
 * it applies the same host exclusion the bundle gate applies, so a docs URL
 * stays legal. Layer 2 watches the same text in the emitted bundle once strict
 * mode is on, but it can only say a run is unaccounted. This test names the
 * file and the line.
 */
describe('every ?raw asset that ships is free of the brand word', () => {
  const packagesRoot = resolve(__dirname, '..', '..', '..');
  const skip = new Set(['node_modules', 'dist', 'build']);

  /** Every `<importer, resolved asset path>` pair the source declares. */
  function rawImports(): { importer: string; asset: string }[] {
    const found: { importer: string; asset: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx|mts|mjs)$/.test(entry.name)) {
          continue;
        }
        const source = readFileSync(path, 'utf8');
        const pattern = /from\s+['"]([^'"]+\?raw)['"]/g;
        let match = pattern.exec(source);
        while (match) {
          found.push({
            importer: path,
            asset: resolve(dirname(path), match[1].split('?')[0]),
          });
          match = pattern.exec(source);
        }
      }
    };
    walk(packagesRoot);
    return found;
  }

  it('finds the ?raw family, so this test cannot pass by finding nothing', () => {
    const imports = rawImports();
    expect(imports.length).toBeGreaterThanOrEqual(17);
    expect(imports.every(i => i.asset.endsWith('.yaml'))).toBe(true);
    expect(
      imports.some(i =>
        i.asset.endsWith('AuthConnectors/templates/github.yaml')
      )
    ).toBe(true);
  });

  it('NO ?raw ASSET HOLDS THE BRAND WORD outside an excluded host', () => {
    const offences: string[] = [];
    for (const { asset } of rawImports()) {
      const text = readFileSync(asset, 'utf8');
      const lower = text.toLowerCase();
      let at = lower.indexOf('teleport');
      while (at >= 0) {
        const { run } = runAround(text, at);
        if (!isExcludedByHost(run, EXCLUDED_HOSTS)) {
          const line = text.slice(0, at).split('\n').length;
          offences.push(
            `${relative(packagesRoot, asset)}:${line}: ${JSON.stringify(run)}`
          );
        }
        at = lower.indexOf('teleport', at + 1);
      }
    }
    // A ?raw asset ships its text verbatim. No catalog entry can reach it, so
    // the only fix is to edit the asset.
    expect(offences).toEqual([]);
  });

  it('the GitHub connector template still says what it has to say', () => {
    // Option 2 of ADR 0007 amendment 6 traded one line of upstream divergence
    // for the machinery a family of one did not justify. This is the line, and
    // this test is what keeps it correct rather than merely brand-free.
    const template = readFileSync(
      resolve(__dirname, '..', 'AuthConnectors', 'templates', 'github.yaml'),
      'utf8'
    );
    expect(template).toContain(
      '# mapping of GitHub team memberships to Psiphon Access roles'
    );
    expect(template).toContain('teams_to_roles:');
  });
});

/**
 * A gate cannot detect its own absence. These tests read the plugin list the
 * real build resolves, so removing `psiphonBrandPlugin()` from
 * `web/packages/build/vite/config.ts` fails here even though the build would
 * happily succeed.
 */
describe('the brand plugin is registered in the real vite config', () => {
  /**
   * Ask vite itself to resolve `web/packages/teleport/vite.config.mts`, and
   * report the plugin list it produced. This is the list the build runs, after
   * vite has flattened every nested array and sorted on `enforce`.
   *
   * It runs in a child process because the config is ESM and several of its
   * imports publish no CommonJS entry point, so jest cannot load them.
   */
  function resolvedPlugins(): { name: string; enforce?: string }[] {
    const packageRoot = resolve(__dirname, '..', '..');
    const script = [
      "import { resolveConfig } from 'vite';",
      "const c = await resolveConfig({ configFile: 'vite.config.mts' }, 'build', 'production', 'production');",
      'console.log(JSON.stringify(c.plugins.map(p => ({ name: p.name, enforce: p.enforce }))));',
    ].join('\n');
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd: packageRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return JSON.parse(out.trim().split('\n').pop() as string);
  }

  it('the plugin the fork ships declares enforce: pre', () => {
    // Without this the transform hook runs after vite:react-swc and receives
    // compiled jsx() calls, so a JSX text node is unreachable as text.
    expect(psiphonBrandPlugin().enforce).toBe('pre');
    expect(psiphonBrandPlugin().name).toBe('psiphon-brand');
  });

  it('psiphon-brand IS in the resolved plugin list', () => {
    const names = resolvedPlugins().map(p => p.name);
    expect(names).toContain('psiphon-brand');
  });

  it('psiphon-brand carries enforce: pre in the resolved plugin list', () => {
    const found = resolvedPlugins().find(p => p.name === 'psiphon-brand');
    expect(found).toBeDefined();
    expect(found?.enforce).toBe('pre');
  });

  it('psiphon-brand is ordered ahead of vite:react-swc', () => {
    const names = resolvedPlugins().map(p => p.name);
    const brand = names.indexOf('psiphon-brand');
    const react = names.indexOf('vite:react-swc');
    expect(brand).toBeGreaterThanOrEqual(0);
    expect(react).toBeGreaterThan(brand);
  });
});
