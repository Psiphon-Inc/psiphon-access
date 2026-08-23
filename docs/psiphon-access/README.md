# Psiphon Access fork documents

Everything in this directory belongs to the fork. Everything else under `docs/`
is upstream Teleport's.

Four documents carry the whole fork. Read them in this order.

| Document | Holds |
|---|---|
| [`repository-layout.md`](repository-layout.md) | Branch roles, the upstream mirror rule, the tag set, how to take an upstream backport, and the two standing invariants that govern repository settings. Read this before you touch a branch, a tag or a setting. |
| [`source-provenance.md`](source-provenance.md) | What the fork is built from, every divergent file and why, the licence position, the third-party dependency audit, release identity, the public artifact list, and Helm chart provenance. It carries a self-check. Run it whenever you change it. |
| [`adr/`](adr/) | The decisions, in the order they were taken. |
| [`../../AGENTS.md`](../../AGENTS.md) | The short version, for an agent starting work here. |

## Decisions

| Record | Subject |
|---|---|
| [`adr/0001`](adr/0001-prefer-the-oidc-connector-model.md) | Build Google support on the upstream OIDC connector model rather than cloning the GitHub connector. The design principles in it still govern where fork code goes. |
| [`adr/0002`](adr/0002-oidc-runtime-scope-and-approach.md) | Scope of the OIDC runtime. Reuse the connector model, add the missing server-side runtime in new files, use `tctl` for administration. |
| [`adr/0003`](adr/0003-author-a-full-token-set.md) | Author all 174 theme leaves explicitly. No value inherits from Teleport, so a reference chain cannot silently move an unrelated role. |
| [`adr/0004`](adr/0004-bundle-inter-font-assets.md) | Bundle the Inter faces with the application rather than fetching them at runtime. |
| [`adr/0005`](adr/0005-terminal-rule-set.md) | The rules that derive every terminal and editor colour. A derivation may apply these rules and may not add one. |
| [`adr/0007`](adr/0007-content-keyed-brand-catalog.md) | The content-keyed brand catalog, its format, its three tiers, and the build-time transform that applies it. Amendments 5 to 8 are part of the rule set. |
| [`adr/0008`](adr/0008-standalone-repository.md) | Standalone repository, branch structure, and where the AGPL section 13 source offer resolves. |

Numbers 0006 and any record not listed here were removed once the decision they
held was fully superseded or fully implemented. The tree is the record.
