# ADR 0007. Content-keyed brand catalog for Psiphon Access

**Status: accepted, 2026-08-19.**

The operator accepted the catalog, the failing gate and the scope of 196
reachable phrases on 2026-08-19. Later the same day the operator chose option 1,
the build-time transform. The committed source keeps upstream wording.

Three corrections are pending against this record. A planning pass found them
within an hour of it being written. See "Corrections" at the end.

This record specifies a format and a gate. It writes no catalog data, no
plugin and no test.


## Question

The web UI shows 232 distinct phrases that contain the word `Teleport`. 196 of
them reach a user. How does the fork replace them, in a way that survives an
upstream rebase, and what build step fails when the replacement is incomplete?


## Decision

### Accepted on 2026-08-19

1. The fork holds one **content-keyed catalog**. Each entry names an exact
   source phrase and its replacement. No entry names a file, a line or a
   context.
2. The catalog **never holds a regular expression**, and never holds the bare
   word `Teleport`. The entry type has no pattern field, so no entry can
   express such a rule.
3. A **failing gate** proves the catalog stays complete and honest. The gate
   fails on an unknown phrase, on a count mismatch and on a catalog entry that
   matches nothing.
4. Bucket B is in scope. The admin, Discover and Integrations routes count as
   reachable.
5. The 136 `goteleport.com` documentation URLs stay as they are. The fork will
   not host a documentation site. A broken link is worse than an
   upstream-branded one.

### Also accepted on 2026-08-19

6. The substitution happens at **build time**, in a vite plugin. The committed
   source keeps upstream wording. The
   operator chose this option after reading the measured rebase exposure: about
   97 modified upstream files and 190 upstream commits a year under committed
   source edits, against 1 file and 12 commits a year under the transform.


## The three tiers

The parent epic set these tiers. Every catalog entry carries one.

| Tier | Covers | Rule |
|---|---|---|
| `render` | User-visible copy. | Rename freely. |
| `interface` | CLI names, flags and help text. | Rename only with a compatibility alias. |
| `protocol` | Resource kinds, audit event types, certificate and CA fields, config keys, Go import paths. | Never rename. |

This record extends `protocol` to cover an identifier that names a resource in
an external system. Three visible strings fall under that extension, and a
user reads all three:

- The AWS RDS tag key `TeleportDatabaseName`, cited at
  `web/packages/teleport/src/Discover/Database/CreateDatabase/useCreateDatabase.ts:275`.
- The generated IAM policy name `TeleportDatabaseAccess`, cited at
  `web/packages/teleport/src/Discover/Database/DeployService/AutoDeploy/AutoDeploy.tsx:75`
  and at line 445 of the same file.
- The generated IAM policy name `TeleportDatabaseAccess_${resourceName}`,
  cited at
  `web/packages/teleport/src/Discover/Database/IamPolicy/useIamPolicy.ts:62`.

The two protocol headers above are also `protocol` tier. A user can read them
in a browser network panel, so this record re-opened both lines and confirmed
them. Neither is copy.

The catalog carries all five as explicit immutable entries. It does not omit
them. The gate must be able to tell "deliberately unchanged" from "forgotten".


## The catalog format

### File format

The catalog is TypeScript, beside the gate. It is ONE LOGICAL CATALOG HELD IN
SEVERAL FILES. `brandCatalog.ts` holds the types and the aggregate export.
`catalog/` holds seven leaf modules, one per UI area, and each leaf exports its
own entries and its own dated baseline. The aggregator imports all seven and
concatenates them.

The first draft of this record said one physical module. That was corrected on
2026-08-19, as amendment 2. A single 196-entry module puts every authoring
child in one serial domain, which serialises the largest part of the work for
no benefit. Seven leaves let four authoring children run in parallel on
disjoint files. The cost is seven fixed imports in the aggregator, which the
machinery child writes once and no authoring child touches.

Each leaf exports a `readonly` array of typed records. This copies the house
pattern in
`web/packages/teleport/src/psiphonContrast/pairs.ts`, which declares
`ContrastPair` at line 30 and exports typed `readonly` arrays such as
`EXCLUDED_GROUPS` at line 91 and `EXCLUDED_LEAVES` at line 107.

Four reasons choose TypeScript over JSON, YAML or TOML.

1. **The phrases carry every awkward character at once.** A phrase carries a
   backtick, a `${...}` placeholder, an apostrophe and a non-ASCII character.
   A TypeScript **single-quoted** string literal needs no escape for a
   backtick, none for `${`, and none for a non-ASCII character. It escapes
   only `'` and `\`. A template literal would break on a backtick and on
   `${`, so the format bans template literals in the catalog.
2. **The type system enforces the ban on patterns.** `source: string` cannot
   hold a `RegExp`. A JSON file cannot express that constraint at all.
3. **One aggregator serves both readers.** The vite plugin and the jest gate
   import `brandCatalog.ts`, so both see the same seven leaves. A data file
   would need a loader in two runtimes.
4. **The house already does this.** A second format in the same tree costs a
   reader an extra thing to learn.

### The entry

```ts
export interface BrandPhrase {
  readonly source: string;
  readonly replacement: string;
  readonly count: number;
  readonly tier: 'render' | 'interface' | 'protocol';
  readonly immutable: boolean;
  readonly reason: string;
}
```

**`source`.** The exact phrase, as the scanner reads it. This is the key. It is
unique across the catalog, and the gate asserts that.

**`replacement`.** The exact text that replaces it. For an immutable entry the
replacement equals the source.

**`count`.** The expected number of occurrences in the scanned file set. This
field is the drift detector. When upstream adds a fourth copy of a phrase, the
count moves and the gate fails, so a human looks at the new site before the
rewrite reaches it. When upstream deletes the last occurrence, the count falls
to zero and the gate fails, so the entry cannot rot into a stale string. The
format requires `count >= 1`.

**`tier`.** The tier decides what else must change with the phrase. A `render`
phrase changes alone. An `interface` phrase needs a compatibility alias, and
the alias is other work that the tier makes visible. A `protocol` phrase must
never change, so the gate asserts that `tier === 'protocol'` implies
`immutable === true`.

**`immutable`.** This field looks redundant, because `replacement === source`
already says the same thing. It earns its place as a cross-check. A typo that
made a replacement identical to its source would otherwise read as a
deliberate decision. The gate asserts
`immutable === (replacement === source)` and fails when the two disagree.

**`reason`.** One sentence for every entry. The house makes a reason mandatory
on all 179 contrast pairs through `floorReason`, and the same discipline
applies here. For an ordinary rebrand the reason is short. For an immutable
entry the reason states what breaks on a rename. For a replacement that is not
a simple product-name swap the reason states why.

### Fields rejected

- **`id`.** The source phrase is already a unique key. A second key can drift
  out of step with the first. A failure message can truncate a long phrase.
- **`file`, `path`, `line`, `context`.** These are the patch-stack key that
  the parent rejected. The `count` field bounds how many sites a phrase has
  without naming any of them.
- **`pattern`, `regex`.** Forbidden. Their absence is the enforcement.
- **`caseInsensitive`.** Measured evidence forbids it.
  `web/packages/teleport/src/Sessions/Sessions.tsx:79` reads
  `Join Active Sessions With Teleport Enterprise` and
  `web/packages/teleport/src/Sessions/SessionList/SessionJoinBtn.tsx:70` reads
  `Join Active Sessions with Teleport Enterprise`. The two differ by one
  letter. A case-insensitive match would merge them into one entry, and the
  fork would lose the ability to treat them apart or to notice that upstream
  is inconsistent.
- **`kind`, to separate a string literal from a JSX text node.** The scanner
  knows the node kind at each site, so the entry does not need to repeat it.
- **`bucket`, holding the A, B, C or D partition.** The partition sized the
  work once. Nothing reads it after that, and a field nobody reads goes stale.
- **`since` or a date.** `git blame` already carries it.

### Two match modes, and why

The scanner compares a **string literal** exactly. Whitespace inside a literal
is part of the literal.
`web/packages/teleport/src/Discover/Shared/Finished/Finished.tsx:53` opens a
template literal that line 54 closes, and the newline and the six leading
spaces sit inside the string. An entry for that phrase writes the newline and
the spaces as `\n      `.

The scanner **normalises a JSX text node** before it compares. It collapses
each run of whitespace to one space and trims the ends. The rewriter then puts
the original leading and trailing whitespace back.
`web/packages/teleport/src/Discover/ConnectMyComputer/SetupConnect/SetupConnect.tsx:192`
to line 194 hold one JSX text node that the formatter wrapped across three
lines. Without normalisation, any change to the line width would break the
entry. That would reintroduce the position dependence that the catalog exists
to remove.

### Longest match first

One catalog source can be a prefix of another. `TeleportDatabaseAccess` at
`AutoDeploy.tsx:75` is a prefix of `TeleportDatabaseAccess_${props.agentMeta.resourceName}`
at `useIamPolicy.ts:62`.

The scanner therefore sorts entries by source length, longest first, and it
consumes each matched region. A shorter entry never matches inside a region
that a longer entry already took. Both the plugin and the gate use the same
sort, so both produce the same counts.

**A BASELINE ENTRY JOINS THE SAME ORDERING.** This is amendment 4, made on
2026-08-19. The first draft ordered catalog entries only, and that made the
seven leaves depend on each other.

The measured case: the immutable identifier `teleport-kube-agent` belongs in
the integrations-aws leaf. It sits inside three phrases that the
discover-enrolment leaf has baselined, one of which is
`teleport-kube-agent is already installed on the cluster`. Under the first
draft the short entry consumed the identifier inside the long phrase, the long
phrase lost its residual, and the gate raised `RATCHET_FAIL` against
discover-enrolment. The author of that leaf had touched neither file. Two
children editing disjoint files broke each other, and the branch
An authoring agent stopped on exactly this.

A baseline rule consumes and does nothing else. It is never rewritten, and it
never suppresses a residual, because step 4 of the algorithm below defines a
residual as an occurrence THAT NO CATALOG ENTRY CONSUMED. Keeping that
definition is what stops the ordering from becoming an exemption: a phrase that
upstream adds tomorrow still raises `UNKNOWN_PHRASE`, even when it contains a
baselined source.

At equal source length a catalog rule sorts before a baseline rule. A phrase
that is in both therefore wins as a catalog entry, and the gate reports the
`RATCHET_FAIL` that demands the baseline entry be removed.

**What this does to a count.** A `count` is the number of sites where the entry
is the longest winning rule. A site inside a baselined phrase belongs to the
leaf that baselined the phrase, so it does not count for the shorter entry. The
count is stable across the baseline-to-catalog transition, because the catalog
entry that later replaces a baseline entry carries the same source text, so it
has the same length and the same precedence. Nothing an authoring child
measures today moves when another child catalogues its own phrase. Measured on
2026-08-19 against an authoring branch at `179905d467d`: 67 of its 68 entries
keep the count their author measured, and `teleport-kube-agent` falls from 6 to
3, which is the three sites that belong to discover-enrolment.

Two alternatives were considered and rejected.

- **Forbid a catalog entry shorter than a baselined phrase that contains it.**
  This blocks a legitimate immutable identifier. `teleport-kube-agent` is the
  upstream Helm chart name, and the catalog must hold it so the bundle layer
  can tell it apart from a phrase somebody forgot.
- **Let `RATCHET_FAIL` tolerate a consumed phrase.** This weakens the ratchet,
  which is the only thing that stops the baseline rotting into a permanent
  exemption.


## Amendment 5. A dated bundle-side exclusion list, made on 2026-08-19

Layer 2 reads the emitted bundle. Some occurrences there have no source-side
representation that a content-keyed catalog entry can reach, so layer 1 cannot
account them and layer 2 would fail for ever once strict enforcement switched
itself on. The gate work measured the size of that problem on a real build at
the 2026-08-19 baseline. The bundle holds 819 occurrences of the word. The catalog
accounts 6 and an excluded host accounts 170. Of the 643 that remain, 497 come
from a phrase that a source baseline entry already admits, and an authoring
child converts each of those to a catalog entry. The other 146 cannot be
reached from source.

This record therefore adds a third accounting mechanism to layer 2, in
`web/packages/teleport/src/psiphonBrand/bundleBaseline.ts`. It is a dated list
with a reason for every record, in the shape of the `psiphonContrast` baseline,
and it has ITS OWN RATCHET.

**What may go in it.** Exactly two reasons admit a record, and every record
states which one applies.

1. The occurrence is an identifier or a property name. The algorithm above
   forbids the scanner from visiting an identifier, so no `source` string can
   ever name one.
2. The occurrence comes from a module outside the layer 1 scan set and outside
   the plugin transform. A dependency, a generated protobuf module and a `.jsx`
   module all sit outside it.

**What may not go in it.** Copy. An unbranded phrase that a user reads belongs
in a catalog leaf, or in that leaf's source baseline until an authoring child
reaches it.

**The key.** A record names a `token`, which is the longest run of
`[A-Za-z0-9_$./@-]` around the occurrence with any leading or trailing `.`, `/`
and `@` trimmed, or an `identifier`, which is the longest run of
`[A-Za-z0-9_$]`. It never names the surrounding run. A run in a minified bundle
holds neighbouring generated names such as `e` and `DLe`, and those change on an
unrelated dependency bump. Run keying produced 237 groups and token keying
produced 200, and every one of the 37 that merged had swallowed minified code.

**Records and rules.** The list holds 33 records and 2 named category rules,
admitting 158 occurrences. A rule stands in for a category whose membership a
generator decides, so that listing the members one by one would fail the build
on a regeneration that changed nothing a reader can see. Two categories qualify:
the protobuf message type paths under `gen/proto/ts`, which protoc decides, and
the design system CSS custom properties, whose surviving set is whatever tree
shaking keeps. Everything else is a record, because a record names one thing and
a reader can check it.

**Two structural guards keep copy out**, and `bundleGate.test.ts` asserts both.
No record and no rule prefix may omit the brand word, and each must be strictly
longer than it. A rule with the prefix `teleport` is therefore unexpressible,
which is the narrower restatement of the ban this record already places on a
regular expression over the bare word.

**The ratchet.** A record or a rule that matches nothing in the emitted bundle
raises `BUNDLE_RATCHET_FAIL` and fails the build until somebody removes it, so
the list can only shrink. The ratchet runs in report mode as well as in strict
mode, because the health of the list does not depend on how far the rebrand has
got. It fires on presence and not on count. A count that moved is printed and is
not fatal, because keying a failure on an occurrence count would fire on any
dependency bump that added one CSS selector, and a gate that cries wolf gets
deleted.

**Two alternatives were rejected.** A narrower layer 2 rule that inspected only
string-shaped regions would weaken the guarantee, because a minified property
name is not in a string. Permanent report mode is a gate that cannot fail, and
therefore is not a gate.


## Amendment 6. What the exclusion list does not close, measured on 2026-08-19

The gate work built the tree with every source baseline emptied and every
catalog leaf filled, which is the state that turns strict enforcement on. Four
occurrences survived, and neither the catalog nor the exclusion list can take
them.

- Three occurrences where the whole string is the bare lower-case word, all of
  them the design system CSS variable namespace: `cssVarsPrefix`, the preset
  `name`, and the token path lookup. A record cannot name them, because the
  structural guard forbids a record as short as the brand word, and that guard
  is what keeps copy out. They need a decision about the namespace, not an
  exclusion.
- One occurrence of user-visible copy at
  `web/packages/teleport/src/AuthConnectors/templates/github.yaml:16`, which the
  auth connector editor shows to a user. It reaches the bundle through `?raw`,
  so neither the layer 1 scan set nor the transform sees it. It is copy, so it
  must not enter the exclusion list. Either the transform grows to cover a
  `?raw` template, or the fork edits that one committed line.

A SEPARATE OBSTACLE STOPS STRICT MODE TODAY, and it is not in the list above.
A later measurement showed that two source baseline entries hold the bare word on
its own, `Teleport` at 5 sites and `teleport` at 22. Decision 2 of this record
forbids the bare word as a catalog source, and a test enforces that ban, so no
authoring child can move those 27 sites out of the baseline. The source baseline
therefore cannot reach zero, and strict enforcement cannot switch itself on.
Both facts are true at the same time and both need an answer before the last
authoring child lands.


## Amendment 7. The bare word, permitted under a whole-node exact match, made on 2026-08-19

Amendment 6 named an obstacle that stops the source baseline reaching zero. Two
baseline entries hold the bare word on its own, `Teleport` at 5 sites and
`teleport` at 22. Decision 2 forbids the bare word as a catalog source, so no
authoring child could move those 27 sites. This amendment removes the obstacle.

**What decision 2 actually forbids.** The reasoning behind it is a reasoning
about SUBSTRING matching. A substring rewrite of the bare word reaches inside
an identifier, an import path and a documentation link, and the three measured
examples in "Why no regular expression over the bare word" are all of that
shape. The reasoning does not hold for a WHOLE-NODE EXACT MATCH, where the
entire visited node is the word and nothing else. Such a rewrite cannot reach
outside the node, because the node holds nothing else to reach.

**The decision.** A bare-word source is legal in the catalog under whole-node
matching, and under nothing else. Decision 2 keeps its full force everywhere
else.

**The mechanism.** `BrandPhrase` gains one optional field, `match`, with the
values `substring` and `wholeNode`. An entry that omits it is a substring entry,
so every entry written before this amendment keeps its meaning. Four guards make
the banned combination unreachable.

1. `validateCatalog` reports `INVALID_ENTRY` for a bare-word source that does
   not declare `wholeNode`. `evaluateBrandGate` returns that verdict before it
   reads a file, which is what step 1 of the algorithm asks for.
2. `orderMatchRules` THROWS on the same entry. This is the choke point. Every
   reader that can rewrite source text builds its rules there, so the banned
   rule cannot be constructed, let alone applied.
3. `matchNode` accepts a whole-node rule only when the match starts at offset 0
   and ends at the end of the node text.
4. `sortLongestFirst` drops a whole-node entry. That ordering serves the bundle
   reader, a bundle has no nodes, and the only thing the bundle reader could do
   with such an entry is match it as a substring. An immutable bare-word entry
   used that way would account for every occurrence of the word in the bundle at
   once and hide hundreds of unaccounted phrases.

The type system carries the discriminant and no more. TypeScript cannot subtract
a string literal from the type `string`, so the field alone cannot make the
wrong entry unrepresentable. Guard 2 completes the job at the only place that
turns an entry into a rule.

**The ban test narrows and does not weaken.** It still fails for a bare-word
entry that is allowed to match as a substring. A second test proves the
validator and the rule builder both refuse that entry, so the property is
enforced and not merely declared.

**Interaction with amendment 4.** A whole-node source is short, so it sorts at
the end of the longest-match-first ordering. That is the wanted position. Every
longer phrase, catalog or baseline, claims its region first, and the whole-node
rule can only take a node that no other rule wanted. The position is not what
confines the rule. Guard 3 confines it, and a node whose whole text is the word
is too short for any longer rule to fit inside. Measured: with the two entries
landed, all 349 remaining baseline entries still match, and no leaf count moved.
No catalog source is shorter than the bare word, so removing the two bare-word
baseline shields freed no other rule.

**The 27 sites, re-opened one by one on 2026-08-19.** The split is 5 and 22.

The 5 capital-T sites are all copy, and they become one `render` entry with the
replacement `Psiphon Access`. They are the `<BrandName>` label in
`shared/components/AccessRequests/ReviewRequests/RequestView/RequestView.tsx`,
the diagram label in `shared/components/LatencyDiagnostic/LatencyDiagnostic.tsx`,
the info-guide sentence in `teleport/src/WorkloadIdentity/WorkloadIdentities.tsx`,
and the non-Beams branch of `productName` in `teleport/src/Welcome/Welcome.tsx`
and `teleport/src/components/Passkeys/PasskeyBlurb.tsx`. The `Beams` branch is a
separate visited node, it holds no brand word, and nothing touches it.

The 22 lower-case sites are none of them copy, and they become one `protocol`
entry whose replacement equals its source. They carry six distinct uses, not
three. The deep-link URL scheme `CUSTOM_PROTOCOL` in `shared/deepLinks.ts`. The
resource subKind of an SSH node, at 14 fixtures in
`teleport/src/Nodes/fixtures/index.ts` and 1 in
`shared/hooks/useInfiniteScroll/testUtils.ts`, which is 15 and not the 19 an
earlier count reported. The default GitHub repository name at two sites in
`teleport/src/Bots/Add/GitHubActionsK8s/useGitHubK8sFlow.tsx`, which completes
`gravitational/teleport`. The binary name in `<Mark>teleport</Mark>` at
`teleport/src/Bots/InfoGuide.tsx`, which a user types. The default Kubernetes
namespace placeholder at
`teleport/src/Discover/Kubernetes/SelfHosted/HelmChart/HelmChart.tsx`, which
matches the upstream chart default. The mock cluster name in
`teleport/src/SessionRecordings/mock.ts` and
`teleport/src/SessionRecordings/list/mock.ts`. The last three uses were not in
the earlier count. The entry is `protocol` tier because that is the strictest
tier and it forces immutability on all six uses at once. One of the six, the
binary name, is `interface` tier by the table above. A content-keyed entry
carries one tier, and the stricter tier is the safe one.

**Measured on a real build.** The build ran with
`tool/teleport-google/assets/build-ui.sh` and exited 0. Strict mode stays off,
because 349 source baseline entries remain. The transform rewrote 54 occurrences
in 30 modules, against 50 in 26 before, so the 5 render sites added 4 edits in 4
modules. The fifth, `RequestView.tsx`, is absent from the OSS app bundle, and it
held no occurrence in that bundle before the change either. In the emitted
`app/app.js` the count of `Psiphon Access` rose from 59 to 63 and the count of
the brand word fell from 763 to 759. `Welcome to Teleport` still appears once,
because it belongs to another leaf and is still baselined. Every one of the 349
lower-case occurrence contexts in the bundle is byte for byte identical before
and after.

**What this amendment does not close.** The three CSS-namespace occurrences and
the `?raw` YAML template in amendment 6 are still open, and 349 baseline entries
remain, so strict enforcement is still off. This amendment removes one blocker
and not the rest.


## Amendment 8. The last four occurrences, closed on 2026-08-19

Amendment 6 named four occurrences that survive when every source baseline is
empty and every catalog leaf is full. The gate work closed all four. The
faithful simulation, which empties all seven baselines and generates one catalog
entry per baseline source, measured 14 unaccounted occurrences before the change
and 10 after. The four this record names are the difference.

**The three CSS namespace occurrences.** THE OPERATOR DECIDED ON 2026-08-19 TO
KEEP THE NAMESPACE AS `teleport`. It is a `@gravitational/design-system`
dependency boundary and the cost of a rename is not worth it. The three are
therefore permanently accepted and need a home.

They cannot go in `BUNDLE_EXCLUSIONS`. That type rejects any token no longer than
the brand word, and that guard is the only thing standing between the exclusion
list and a record that swallows every `Teleport` in the product. The guard stays.
Instead `bundleBaseline.ts` gains a third list, `BUNDLE_NAMESPACE_LITERALS`, with
the OPPOSITE length rule. Neither rule is a relaxation of the other, and together
they leave no way to express a key that matches a phrase.

Three conditions must hold at once, and the first two are not configurable.

1. `literal` must EQUAL the bare lower-case brand word. The set of literals a
   record can express has exactly one member, so `Teleport` is unexpressible and
   so is every phrase.
2. The character before the match and the character after it must be the SAME
   quote. The match is a complete string literal, never a word inside one.
   `"Welcome to teleport"` fails this, because the character before the word is a
   space. This condition is load-bearing: a rule keyed on token equality alone
   WOULD have admitted that phrase, because the token scan stops at whitespace.
3. An exact `anchor` must immediately precede the opening quote, and the anchor
   must end in one of `:` `[` `,` `(` `=`. It is compared for equality and is
   never a pattern. An anchor cannot end in a letter, so a record cannot name the
   tail of a sentence.

The anchor also keeps the mechanism from taking another record's decision. The
same build holds five OTHER whole-string bare words, at `placeholder:`,
`children:`, `SNe=`, `repository||` and `repository??`. They come from
first-party modules in the layer 1 scan set, and amendment 7 accounts for them as
part of the 22 bare-word source sites. The three shipped anchors,
`cssVarsPrefix:`, `name:` and `,[`, each match exactly one occurrence and none of
those five.

WHAT THIS MECHANISM COULD ADMIT THAT IT SHOULD NOT, stated plainly: a
user-visible string whose whole text is the single lower-case word `teleport`, at
one of the three anchored positions. A one-word label, placeholder or tooltip is
the realistic case. Two things bound it. Every record names its site, so a reader
can check it. And `count` is a HARD CAP, unlike the count on a `BundleExclusion`:
a record that matches more often than it records raises `BUNDLE_CAP_FAIL` and
stops the build. Overflow is fatal in both report mode and strict mode, for the
same reason the presence ratchet is.

**The one line of copy.** `AuthConnectors/templates/github.yaml:16` reaches the
bundle through `?raw`, so neither the layer 1 scan set nor the transform sees it.
It is copy, so it could never enter an exclusion list. The choice was to grow the
transform or to edit the line, and the family was measured first: 17 `?raw`
imports across 4 modules, every one of them a `.yaml`, 2 assets holding the brand
word, and 1 of those 2 holding it only inside `goteleport.com`, which
`EXCLUDED_HOSTS` already accounts. One file and one line. The fork edits the line.
Growing the transform would also have needed a text-matching path in the matcher
and authored replacement copy in a catalog leaf, which is machinery and copy for a
family of one.

TWO THINGS WATCH THAT LINE. Layer 2 already did: a `?raw` asset ships its text
verbatim, so the word returning raises an unaccounted run in strict mode. What
layer 2 cannot do is name the file. `bundleGate.test.ts` therefore reads every
`?raw` asset the source declares, applies the same host exclusion, and fails with
the path and the line number. It discovers the imports by reading the source, so a
new `?raw` import is covered the day it lands.

**WHAT STILL STOPS STRICT MODE, and it is none of the above.** The simulation
leaves 10 unaccounted occurrences, and all 10 are one class.
`scanBundleResidual` consumes a catalog occurrence by searching the bundle for
`entry.replacement`. When an entry's source is a template literal WITH `${...}`
expressions and its replacement RETAINS the brand word, that search cannot
succeed, because the catalog holds `${moduleSrc}` and the minified bundle holds
`${i}`. The `integrations-aws` leaf, which landed at a later revision after amendment
6 was measured, has 20 entries of 64 whose replacement keeps the word, correctly:
they are upstream Terraform module variable names and an AWS IAM trust-policy
audience. Layer 2 must learn to consume such an entry by its quasis rather than by
its whole replacement text. That is the last known bundle-side obstacle, and it is
tracked separately. The other obstacle amendment 6 recorded, the 27 bare-word
source sites, was closed by amendment 7.

## Relationship to other records

ADR 0006 fixes the names. The branding identifier is `psiphon` and the product
name is `Psiphon Access`. Every `render` replacement uses the product name
where a human reads it. This record does not restate the reasoning in ADR 0006.
