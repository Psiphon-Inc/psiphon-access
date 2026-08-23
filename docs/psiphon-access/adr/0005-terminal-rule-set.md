# ADR 0005. Terminal and editor theme rules for Psiphon Access

**Status: accepted, 2026-08-19.**

The operator approved all seven rules on 2026-08-19, including the white pair exception in rule 1. The operator also settled `terminal.foreground` by accepting the recommendation in rule 3.


## Question

What rules must govern the re-derivation of terminal and editor theme tokens (`terminal.*` and `editor.*`) for the Psiphon Access fork on a light background, and how are structural slots, font weights, fallback stacks, readerless editor leaves, and colour vision deficiency requirements defined?


## Decision

Seven rules govern the re-derivation of terminal and editor theme tokens in Psiphon Access. The operator approved them on 2026-08-19. This decision derives no colour values and writes no hex table. It states a small number of measured ratios where a rule needs one as its reason.

The derivation work applies these rules and proves the font metric behind rule 4. It may not add a rule. If a rule is missing, it stops and reports it.

1. **The Separation Rule**: A minimum relative luminance ratio delta of 1.3:1 is required between each ANSI normal slot and its corresponding bright variant. On a light background, separation is achieved by moving the normal variant darker toward higher contrast while keeping the bright variant near the surface floor.

   The rule covers 8 pairs. It binds the 6 chromatic pairs and the `black` pair. It does NOT bind the `white` pair, which is a named exception. `terminal.white` and `terminal.brightWhite` are both surface roles on a light theme, and the D6 ramp holds them 1.07:1 apart. No value can separate them by 1.3:1 while both stay surfaces. One of the two would have to become grey ink, which is the role `brightBlack` already fills. The `black` pair needs no exception: `#000000` against `#5C5C5C` measures 3.14:1, which clears the minimum without any move.

2. **Structural Slot Test**: The four structural slots (`terminal.black`, `terminal.brightBlack`, `terminal.white`, `terminal.brightWhite`) carry surface, inverse, and secondary UI roles in a light theme rather than body text roles. `terminal.black` is tested as primary terminal ink against the terminal surface under the 4.5:1 text floor. `terminal.brightBlack` is tested as secondary UI text against the surface under the 4.5:1 text floor. `terminal.white` and `terminal.brightWhite` carry surface steps and light fill roles; they are evaluated as non-text surface boundaries under the 3.0:1 non-text floor or as inverse text on dark fills, while acknowledging that ANSI white text on a light terminal background is inherently close to invisible.

   Two consequences of this mapping are recorded, not measured away. `terminal.brightWhite` and `terminal.background` both take `levels.sunken` `#F7F7F7`, so they are the same colour and their ratio is 1.00:1. Text written in ANSI bright white is invisible on this terminal. `terminal.white` `#FFFFFF` is also LIGHTER than `terminal.brightWhite` `#F7F7F7`, which inverts the usual convention that a bright slot is the lighter of the pair. Both facts follow from a light theme, and neither is a defect in the derivation. A reader who expects a dark terminal will find them surprising, so they are stated here rather than discovered later.

3. **Slot Origins and Foreground Recommendation**: All structural slot origins derive from numbered fork decisions D1, D4, or D6:
   - `terminal.background`: `levels.sunken` (`#F7F7F7`) from decision D6.
   - `terminal.black`: `#000000` from decision D1.
   - `terminal.brightBlack`: app grey `#5C5C5C` from decision D4 (`text.slightlyMuted` / `onSurfaceVariant`).
   - `terminal.white`: `levels.surface` (`#FFFFFF`) from decision D6.
   - `terminal.brightWhite`: `levels.sunken` (`#F7F7F7`) from decision D6.
   - `terminal.foreground`: `text.main` (`#000000`) from decision D1. The operator settled this on 2026-08-19, accepting the recommendation over Selenized `fg_0` (`#53676d`). Decision D1 establishes black as the primary ink of the fork, and taking it here removes a foreign value. It measures 19.60:1 on `levels.sunken` (`#F7F7F7`). The rejected candidate measures 5.56:1 on that same background, not the 5.95:1 recorded in the parent issue notes, because that figure was measured against `#FFFFFF`. Both candidates clear the 4.5:1 text floor, so the choice was one of voice and provenance, not of legibility.

4. **The Bold Mapping**: Terminal bold text maps to font weight 500 (Medium). DM Mono ships Light 300, Regular 400, and Medium 500 (each with an italic) and carries no weight 700 (Bold). The fork never requests font weight 700 for the terminal face. This prevents browser synthetic bolding that distorts character metrics and breaks monospace grid alignment.

5. **Family Stack Contract**: The monospace font stack specifies `DM Mono` first, followed by platform monospace fallbacks (`ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, `"Liberation Mono"`, `"Courier New"`, `monospace`). Proportional font fallbacks are prohibited because proportional rendering breaks terminal grid layout.

6. **The Editor Answer**: The six `editor.*` leaves are resolved without further deferral. The two leaves with live readers in shipped UI code—`editor.abbey` and `editor.sunflower` at `web/packages/teleport/src/Instances/InstancesList.tsx:225,233`—are retained by decision using their established tertiary references: `editor.abbey` uses decision D23 (`#860A14`) and `editor.sunflower` uses decision D21 (`#996700`). The remaining four leaves (`editor.purple`, `editor.cyan`, `editor.picton`, `editor.caribbean`) have no live reader in shipped UI code and are recorded as excluded/unused leaves using the same evidence standard as decision D27 (`EXCLUDED_LEAVES` in `web/packages/teleport/src/psiphonContrast/pairs.ts`).

7. **Colour Vision Deficiency (CVD) Status**: CVD evaluation is a recorded measurement paired with mandatory non-colour cues (WCAG SC 1.4.1), not a gate threshold. No numeric CVD ratio or gate threshold is created.


## Options considered

### Option A. Defer terminal and editor rules further or derive ANSI colors without explicit rules

Option A leaves terminal and editor rules unstated or produces collapsed normal/bright pairs (such as the collapsed initial derivation). Deferring editor leaves leaves six deferred pairs with no owner. Relying on implicit assumptions creates fake contrast failures on structural slots and risks synthetic font rendering.

### Option B. Adopt explicit structural, separation, font, and editor rules (Chosen)

Option B establishes seven explicit rules grounded in numbered fork decisions D1, D4, and D6. It resolves all 29 deferred terminal and editor leaves, protects monospace grid alignment, and provides a clear proposal for operator approval.


## Evidence that decided the choice

1. **ANSI Normal vs Bright Separation Minimum**:
   - The separation minimum threshold between an ANSI normal slot and its bright variant is set at a relative luminance ratio delta of 1.3:1.
   - **Fork Judgement**: The 1.3:1 relative luminance delta is a fork judgement of this repository. No standard defines an inter-ink separation floor between two categorical inks.
   - **Standard Distinction**: WCAG SC 1.4.11 specifies a 3.0:1 contrast ratio for a graphical object against its adjacent background. WCAG SC 1.4.11 answers a different and stricter question regarding component boundary visibility, not inter-ink separation.
   - **Consequence Justification**: A 1.3:1 relative luminance delta corresponds to about 7.2 to 8.7 delta L* in CIE L*a*b*. That range is COMPUTED, not cited. Take the separation metric `(Y1 + 0.05) / (Y2 + 0.05) = 1.3`, solve for `Y1` at background luminances `Y2` of 0.05 and 0.40, then convert each luminance pair with `L* = 116 * Y^(1/3) - 16`. At `Y2 = 0.05` the delta is 7.2. At `Y2 = 0.40` it is 8.7. Anyone can repeat that calculation from these two formulas. No standard is claimed for it.
   - On a light background, separation is achieved by driving the normal variant darker toward higher contrast while the bright variant remains near the background floor.
   - **Rejected Rules**:
     - *Rejected 3.0:1 inter-ink floor*: Applying WCAG SC 1.4.11's 3.0:1 floor between normal and bright ink pairs was rejected because it would fail nearly all categorical color palettes and force extreme, unnatural darkening.
     - *Rejected lightened bright variants*: Pushing bright variants lighter on a light background was rejected because a lighter bright ink reduces contrast against a light background, rendering bright text unreadable.
     - *Rejected hue-only separation*: Relying on hue differences without luminance delta (1.00:1 ratio) was rejected because equal-luminance hues fail completely for dichromat readers and greyscale displays.

2. **Structural Slot Test Replacement**:
   - The four structural slots (`terminal.black`, `terminal.brightBlack`, `terminal.white`, `terminal.brightWhite`) serve surface, inverse, and secondary UI roles on a light theme rather than body text roles.
   - Testing them against the 4.5:1 text floor produces fake failures.
   - `terminal.black` serves as primary dark terminal ink and is tested against `levels.sunken` (`#F7F7F7`) under the 4.5:1 text floor (achieving 19.60:1 contrast with `#000000`).
   - `terminal.brightBlack` serves as secondary UI text (mapped to D4 app grey `#5C5C5C`) and is tested against `levels.sunken` under the 4.5:1 text floor (measured 6.24:1).
   - `terminal.white` (`levels.surface` `#FFFFFF`) and `terminal.brightWhite` (`levels.sunken` `#F7F7F7`) serve as surface steps and light fill roles. They are tested as non-text surface boundaries under the 3.0:1 non-text floor (WCAG SC 1.4.11) or as inverse text on dark fills (where white on black achieves 21.00:1 contrast). On a light terminal surface, ANSI white text is acknowledged as inherently low-contrast and recorded as such, rather than measured away with fake failures.

3. **Origin of Structural Slots and Terminal Background/Foreground**:
   - `terminal.background`: Sourced from decision D6 as `levels.sunken` (`#F7F7F7`). The existing theme reference to `levels.sunken` is retained at zero cost. Selenized `bg_0` (`#fbf3db`, a warm cream) is rejected because decision D6 establishes pure neutral as the fork's surface ramp.
   - `terminal.black`: Sourced from decision D1 as `#000000` (primary fork ink).
   - `terminal.brightBlack`: Sourced from decision D4 as `#5C5C5C` (app secondary text / `onSurfaceVariant`).
   - `terminal.white`: Sourced from decision D6 as `levels.surface` (`#FFFFFF`).
   - `terminal.brightWhite`: Sourced from decision D6 as `levels.sunken` (`#F7F7F7`).
   - `terminal.foreground`: decided as `text.main` (`#000000`) from decision D1. Candidate 2 was Selenized `fg_0` (`#53676d`). Candidate 1 won because D1 makes black the primary ink of the fork, and it removes an external foreign value. Candidate 1 measures 19.60:1 on `levels.sunken` (`#F7F7F7`) and candidate 2 measures 5.56:1 on the same background. The 5.95:1 figure in the parent issue notes was measured against `#FFFFFF`, so it does not apply to the decided background. Both candidates clear the 4.5:1 text floor.

4. **Monospace Font Weight and Monospace Stack**:
   - DM Mono font assets ship Light 300, Regular 400, and Medium 500 weights (with italic variants) under the SIL Open Font License 1.1, with no weight 700 (Bold).
   - Terminal bold text maps to Medium 500.
   - Weight 700 is never requested for DM Mono in CSS or Chakra configuration, preventing browsers from synthesizing artificial bolding that distorts character bounding boxes and breaks monospace grid alignment.
   - Monospace family stack specifies DM Mono first (`DM Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`). Proportional fallbacks are strictly prohibited because non-monospace text breaks terminal grid layout.

5. **Editor Group Resolution**:
   - Inspection of shipped UI code in `web/packages/` confirms that only two `editor.*` leaves have live readers:
     - `editor.abbey` at `web/packages/teleport/src/Instances/InstancesList.tsx:225`
     - `editor.sunflower` at `web/packages/teleport/src/Instances/InstancesList.tsx:233`
   - Both leaves render as status text on page surfaces.
   - Both leaves keep their established values from data visualization decisions: `editor.abbey` uses decision D23 (`#860A14`, app failure red) and `editor.sunflower` uses decision D21 (`#996700`, D11 warning ink).
   - The remaining four leaves (`editor.purple`, `editor.cyan`, `editor.picton`, `editor.caribbean`) have no live reader in shipped UI code and are recorded as excluded/unused leaves using the same evidence standard as decision D27 (`EXCLUDED_LEAVES` in `web/packages/teleport/src/psiphonContrast/pairs.ts`).
   - Resolving these six leaves eliminates all deferred editor items.

6. **Colour Vision Deficiency (CVD) Requirements**:
   - CVD evaluation is recorded as an informational measurement combined with mandatory non-colour cues under WCAG SC 1.4.1 (use of color).
   - CVD measurement is not a gate rule. No artificial numeric CVD threshold is created.
   - Non-colour cues (such as text labels, icons, or visual markers) are required wherever color carries semantic meaning, satisfying WCAG SC 1.4.1.

7. **Psiphon ANSI Palette Derivation vs psix Case**:
   - Deriving an ANSI palette for Psiphon Access is legitimate because Psiphon brand guidelines and Flutter app sources define no brand ANSI palette. Derivation creates functional terminal tokens without altering brand primitives.
   - This contrasts with the `psix` project, where the official brand accent `#FF703C` was silently darkened to `#D95F33` to pass a chart contrast gate and then misidentified as the true brand value. In Psiphon Access, brand accent `#FF703C` remains unchanged under decision D2, and derived functional values are explicitly recorded as separate tokens.


## Upstream Selenized Licence Notice

This section records licence requirements for the upstream Selenized color palette source. It is not legal advice.

- **Licence Name**: MIT License
- **Copyright**: Copyright (c) 2021 Jan Warchoł
- **Source File URL**: `https://raw.githubusercontent.com/jan-warchol/selenized/master/LICENSE.txt`

The MIT License permits free use, modification, and distribution provided that the copyright notice and permission notice are included in copies or substantial portions of the software.
