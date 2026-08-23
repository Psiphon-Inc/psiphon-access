# ADR 0003. Author a full token set for the Psiphon theme

**Status: accepted, 2026-08-18.**


## Question

Should the Psiphon Access fork author a complete token set for its Chakra theme, or should it deep-merge its customized values over Teleport default configuration?


## Decision

The operator decided Option B on 2026-08-18. The fork authors a full token set rather than deep-merging values over Teleport configuration.


## Options considered

### Option A. Deep-merge customized values over Teleport configuration

Option A merges fork token overrides onto the default Teleport theme configuration (`TELEPORT_THEME.config`).

Cost and mechanics:
Option A inherits unmentioned upstream tokens automatically. It retains upstream token reference chains between role groups. However, it silently accepts upstream token value changes.

### Option B. Author a complete token set

Option B defines every semantic token explicitly using `defineSemanticTokens.colors({...})`.

Cost and mechanics:
Option B requires authoring all 174 leaves across 21 groups. This includes the 29 terminal and editor leaves that were undecided when this record was written. Option B removes all value inheritance from Teleport.


## Evidence that decided the choice

1. The token ratio did not decide the choice. The token mapping reports 72 leaves change and 73 keep Teleport values out of 145 mapped leaves, with 29 deferred to the terminal decision. The issue expected a small ratio to favour merging and a large ratio to favour authoring. The split of 72 versus 73 favours neither option. The decision rests on mechanism differences instead.

2. The test gate makes new upstream tokens loud for both options. The test `web/packages/teleport/src/psiphonContrast/themeColors.test.ts` asserts exactly 174 leaves across 21 groups. An added or removed upstream token fails that test under both options. This removes what the issue treated as the decisive weakness of Option A. However, the count test cannot detect a changed upstream token value because the leaf count stays 174. Under Option A, a changed upstream value silently becomes the value of the fork. Under Option B, a changed upstream value is inert because the fork defines its own value.

3. The theme references itself. Twelve `dataVisualisation` leaves feed the terminal and editor groups through `{colors.PATH}` references. The tokens `terminal.red`, `green`, `yellow`, `blue`, `magenta`, and `cyan` reference `dataVisualisation.tertiary.*` tokens. The tokens `terminal.brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightMagenta`, and `brightCyan` reference `dataVisualisation.primary.*` tokens. The `editor.*` tokens reference `dataVisualisation.tertiary.*` tokens. A decision about a status accent silently moves an ANSI terminal slot. Decisions D20 to D26 changed six ANSI slots and made `terminal.magenta` identical to `terminal.black`. Under Option A, the reference chain survives and keeps coupling unrelated roles. Under Option B, every leaf holds an explicit value, reference chains disappear, and that class of accident cannot recur.

4. Option B is a supported shape. File `node_modules/@gravitational/design-system/themes/bblp/colors.js` authors a complete set with `defineSemanticTokens.colors({...})`. The design system package exercises this path itself.

5. The cost is stated plainly and not softened. All 174 leaves must be authored, including the 29 terminal and editor leaves that were undecided when this record was written. The terminal decision became a hard prerequisite for the theme implementation and moved onto the critical path. Merging could have shipped before it. Authoring cannot. A new upstream role will also break the build of the fork until the fork fills it. Loud breakage is preferred over silent inheritance.


## Where the authored values come from

The values are authored in `web/packages/teleport/src/psiphonTheme.ts`, which is now the record of every value. Nothing else is a source.

`psix-v2` is a forbidden source. It darkened the brand accent `#FF703C` by 15 percent to `#D95F33` to pass a chart gate, then propagated the darkened value as the brand. The mapping document keeps the brand accent at `#FF703C` under decision D2, and it gives functional accent ink its own separate token under decision D3. Authoring a full set makes this rule easy to break by accident, because 174 values must be found somewhere. Take every one of them from the mapping document.


## How a reviewer tells a deliberate value from an inherited one

Under Option B, there is no inheritance. Every value in the file is deliberate by construction. That is the mechanism. The authored theme file is the record of every value. The 73 mapped leaves that match Teleport values hold those values by deliberate choice rather than inheritance.

## Behaviour at the next upstream rebase

- A new upstream token: The `themeColors` leaf-count test fails at 174. The authored set does not contain the token, so the fork must decide it. This failure is loud.
- A removed upstream token: The `themeColors` leaf-count test fails at 174. This failure is loud.
- A changed upstream value: Inert. The fork authors its own value. Option A lacks this protection.


## Ordering consequence

The terminal decision is a hard prerequisite for the theme implementation.
