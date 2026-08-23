# ADR 0004. Bundle Inter font assets for the Psiphon Access UI

**Status: accepted, 2026-08-19.**


## Question

Should the Psiphon Access fork bundle Inter font assets into its web build, or should it reference the font family name and rely on fonts installed on client host machines?


## Decision

The operator approved Option B on 2026-08-19. The fork bundles subsetted WOFF2 Inter font assets into the web UI build.

The coordinator proposed the option first, under the instruction to complete the typeface decision. The operator then read it and approved it.

This decision selects an option. It ships no font file. Implementation belongs to the theme implementation for the family stack and the `@font-face` rules, and to the release build for the assets.


## Options considered

### Option A. Reference only

Option A sets the CSS font family stack to Inter followed by system fallbacks.

Cost and mechanics:
Option A ships no font files. It adds no license tracking duty. It requires no Content Security Policy change. However, clients render the Psiphon visual identity only if the host system has Inter installed. Clients without Inter render generic system fonts.

### Option B. Bundle a font subset

Option B converts source font files into subsetted WOFF2 assets and bundles them into the web UI build.

Cost and mechanics:
Option B ships WOFF2 files in the web build. It requires `@font-face` definitions in CSS. It requires including the SIL Open Font License 1.1 text in the distribution. It requires `unicode-range` definitions to fall back to system fonts for characters outside the subset. It requires no Content Security Policy change because same-origin serving matches the existing `'self'` policy.

### Option C. Operator supplied

Option C relies on the operator to host font files on an external server.

Cost and mechanics:
Option C removes font file bundling from the repository. However, it requires the operator to manage CORS, CDN hosting, and license compliance. It creates inconsistent UI rendering across different deployments.


## Evidence that decided the choice

1. The product is an authentication front door. Users access the login page from unmanaged devices or public terminals that lack preinstalled custom fonts. A reference-only approach strips the Psiphon brand voice for those users.

2. Upstream Teleport proves that reference-only font stacks fail in practice. File `web/packages/design/src/theme/fonts.ts` at line 25 sets the font stack to `Ubuntu2, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`. The command `find web -iname "*woff*" -o -iname "*.ttf"` returns zero files. The command `git grep "@font-face" web/packages/` returns zero matches. Every upstream user on a machine without `Ubuntu2` installed sees a system fallback font instead of `Ubuntu2`. This failure is a measured fact in Teleport, not a prediction.

3. The source font files are in hand. They are held in the brand asset repository and not in this tree. That repository provides `Inter-VariableFont_opsz,wght.ttf` (874,708 bytes), `Inter-Italic-VariableFont_opsz,wght.ttf` (904,532 bytes), `OFL.txt` (4,470 bytes), `README.txt` (4,230 bytes), and a `static/` directory. Its sibling `DM_Mono/` and `Jura/` directories belong to the Conduit brand, not Psiphon.

4. Teleport has no byte budget blocking font bundling. The `psix` project chose reference-only under strict byte limits. Teleport carries no such byte constraint.


## Licence duty and notice requirements

This section records factual license requirements. It is not legal advice.

The Inter font is licensed under the SIL Open Font License 1.1 (OFL 1.1). The `OFL.txt` shipped with the Inter faces holds the license text, copyright 2020 The Inter Project Authors.

Clause 2 of the SIL Open Font License 1.1 states:
"2) Original or Modified Versions of the Font Software may be bundled, redistributed and/or sold with any software, provided that each copy contains the above copyright notice and this license. These can be included either as stand-alone text files, human-readable headers or in the appropriate machine-readable metadata fields within text or binary files as long as those fields can be easily viewed by the user."

Notice implementation requirements:
1. Copy `OFL.txt` to `web/packages/teleport/public/app/fonts/OFL.txt` during font asset setup.
2. The web build includes `OFL.txt` in `webassets/teleport/app/fonts/OFL.txt`.
3. The Go binary embeds `OFL.txt` alongside web assets through `//go:embed webassets/teleport` in `webassets_embed.go`.
4. Document the bundled OFL work in `docs/psiphon-access/source-provenance.md`.

The AGPL-3.0 notice on the login page does not discharge the OFL notice requirement. The OFL text must ship beside the web assets and inside the embedded asset filesystem.

Clause 5 keeps the font under the OFL. The fork is AGPL-3.0. The two licences apply to two separate works, and the AGPL does not extend over the font bytes.

The reserved font name rule does not bite here, and this was measured. Clause 3 forbids a Modified Version from using a Reserved Font Name. A subset is a Modified Version. Inter reserves no name: the copyright line of `OFL.txt` reads `Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)` with no `with Reserved Font Name` suffix, and the only match for that phrase in the file is the definition at line 33. So the subsetted face may keep the family name `Inter`. Re-check this if the font source is ever replaced, because most OFL fonts do reserve their name.


## Content Security Policy and unicode-range fallback plan

### Content Security Policy

Bundling font assets requires no Content Security Policy change.

File `lib/httplib/httpheaders.go` at line 50 defines `defaultFontSrc = CSPMap{"font-src": {"'self'", "data:"}}`. Function `getIndexContentSecurityPolicy` at line 157 puts `defaultFontSrc` into the index page policy at line 158. File `lib/httplib/httplib_test.go` at lines 291, 306, 322, 338, 354, 370, and 389 verifies that responses emit `font-src 'self' data:`.

Because bundled font assets serve from the same origin (`'self'`), the existing policy permits them without header modifications. A third-party CDN would require modifying `defaultFontSrc`, but same-origin bundling does not.

### Unicode-range fallback plan

Font assets will be subsetted to WOFF2 format. The Latin subset carries these ranges: `U+0000-00FF`, `U+0131`, `U+0152-0153`, `U+02BB-02BC`, `U+02C6`, `U+02DA`, `U+02DC`, `U+2000-206F`, `U+2074`, `U+20AC`, `U+2122`, `U+2191`, `U+2193`, `U+2212`, `U+2215`, `U+FEFF`, `U+FFFD`.

That list is the Latin subset only. It does not cover Latin Extended. The release build must decide whether to ship a second Latin Extended face, and it must take the exact ranges from the subsetting tool it runs. Do not copy a range list from this document without that measurement.

The `@font-face` rules will specify `unicode-range`. When the browser meets a character outside the declared `unicode-range`, it falls back to the system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`).


## Family stack and visual fallback consequences

Because Option B is chosen, font assets ship with the build.

If the fork had chosen Option A (referencing), the CSS font stack would be `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`. On client systems without Inter installed, browsers would display system fonts. Windows systems would display `Segoe UI`. macOS and iOS systems would display the system face that `-apple-system` selects. Linux systems have no entry in that stack before `Helvetica` and `Arial`, so fontconfig substitutes a local sans-serif face. The exact Linux face is not measured here. The UI would lose the Psiphon visual identity.


## Build and embedding entry points

1. Entry into `build-ui.sh`:
   File `tool/teleport-google/assets/build-ui.sh` runs the web build at line 87:
   `time MAKE=make bash ./build.assets/build-webassets-if-changed.sh \`
   The release build places subset WOFF2 font files and `OFL.txt` into `web/packages/teleport/public/app/fonts/`. That directory already ships assets by this route. It holds `logo-dark.svg`, `logo-light.svg`, `favicon-dark.png` and `favicon-light.png` today. Vite copies its public directory into the output directory unchanged, and `web/packages/teleport/vite.config.mts` line 24 sets that output directory (`const outputDirectory = resolve(rootDirectory, 'webassets/teleport');`). So `public/app/fonts/OFL.txt` arrives at `webassets/teleport/app/fonts/OFL.txt`.

2. Entry into Go binary:
   File `webassets_embed.go` line 1 uses build tags `//go:build webassets_embed && !webassets_ent`. Line 31 embeds assets:
   `//go:embed webassets/teleport`
   `var embedded embed.FS`
   Function `NewWebAssetsFilesystem()` at line 36 serves `webassets/teleport` via `fs.Sub(embedded, "webassets/teleport")`. The build command in `README.md` (`go build -tags webassets_embed -o build/teleport ./tool/teleport`) embeds the font files into the executable binary.


## Monospace family governance

This decision does not govern the monospace font family.

Psiphon defines no brand monospace font. The app sets `monospaceFontFamily = 'monospace'` with fallback list `['Courier New', 'Courier', 'monospace']` in `lib/design/tokens.dart` lines 61 to 62. The `DM_Mono/` and `Jura/` font directories in the brand asset repository belong to the Conduit brand, not Psiphon.

The terminal decision governs the monospace font selection. If it selects a custom monospace font with distribution license requirements, the bundling mechanics described in this decision apply. If it selects a system font stack, no font asset bundling is required for monospace.
