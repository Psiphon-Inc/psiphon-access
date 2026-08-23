# ADR 0001. Prefer the upstream OIDC connector model over a GitHub-style clone

**Status: accepted. The decision holds. The supporting text is historical.**

This record was written before the code existed, so it argues in the future tense
and names files that were never built. The decision it records is the one the
fork implements today, and that is why the record is kept.

What the fork built, and where to check the decision against the code:

- The fork reuses the upstream OIDC connector resource. It adds no Google
  connector type.
- The runtime lives in the fork-owned package `lib/googleoidc`.
- Exactly two upstream Go files are modified: `lib/auth/oidc.go` and
  `tool/teleport/common/teleport.go`.
- The seams that made this possible are recorded in
  `../source-provenance.md`, which supersedes this record on
  every question of mechanism.

Two statements below are now wrong. Group membership uses DIRECT Cloud Identity
lookup only, because transitive lookup and its fallback were removed. The `tctl`
Google preset was never built and does not exist.

> **Amendment, 2026-08-17.** The third bullet above is superseded. The fork
> modifies three upstream Go files, not two. The third is
> `lib/versioncontrol/github/github.go`, which now refuses the request the auth
> server made to the upstream github releases api about every 24 hours.
>
> The count is also no longer a rule. The operator replaced the cap with a
> standing goal: keep the modified upstream surface small, and justify each
> addition with a churn measurement. The decision this record holds, to reuse
> the upstream OIDC connector, is unaffected. See the root
> `README.md`.

---


## Decision statement

For this fork, the most maintainable long-term approach appears to be:

1. keep Google support on top of the existing **OIDC** abstraction
2. reuse the existing **OIDC connector resource model** and `tctl` workflow
3. add only the missing **server-side OIDC runtime and route wiring** in as few existing files as possible
4. keep most fork-specific logic in **new files**
5. defer full OIDC/SAML web CRUD UI unless it later proves worth the maintenance cost

## What problem we are actually solving

The problem is **not** only “how do we make Google login work?”

The problem is:

- how do we make Google login work in a fork
- while keeping the rebase surface small
- while minimizing duplicated security-critical code
- while staying aligned with upstream abstractions where possible
- while avoiding a fork-only subsystem that must be carried forever

Those constraints strongly affect what counts as a “good” implementation.

## Design principles used for this decision

These are the principles that drove the conclusion.

### 1. Prefer existing abstractions over fork-only ones

If the codebase already has a stable abstraction that matches the protocol or behavior we need, the default should be to extend or complete that abstraction rather than create a parallel one.

### 2. Prefer protocol-level modeling over provider-level cloning

Google Workspace login is fundamentally an **OIDC** problem with some Google-specific enrichment behavior.
That is a better conceptual fit for the existing OIDC model than for the GitHub-specific model.

### 3. Concentrate fork-specific behavior in new files and narrow seams

The best fork changes are the ones where:

- core logic lives in new files
- existing-file edits are mostly route registration, startup wiring, or narrow gates
- upstream refactors remain easier to merge

### 4. Avoid duplicating security-sensitive logic unless there is no alternative

SSO login flows are full of security-critical behavior:

- redirect handling
- CSRF/state validation
- callback validation
- certificate/session issuance
- claim validation
- role mapping

Duplicating these behaviors into a second path increases the odds that future fixes land in one path but not the other.

### 5. Separate admin UX scope from auth runtime scope

Getting login to work and getting a polished OSS web admin UI for OIDC connectors are different problems.
If the goal is minimal maintenance, those problems should not be coupled unnecessarily.

## Practical consequence for implementation planning

If a human were to plan the smallest-maintenance implementation, the preferred shape would be:

### Narrow edits to existing files

Likely only for:

- route registration
- auth/server startup wiring
- narrow OIDC entitlement/gate decisions

### Most fork logic in new files

Candidate examples:

- `lib/web/oidc.go`
- `lib/auth/apiserver_oidc.go`
- `lib/auth/oidc_local.go`
- `lib/auth/oidc_google.go`

Whether those exact filenames are right is less important than the principle:

- put the bulk of the new runtime in new files
- avoid large edits to unrelated existing code

## Final rationale

The core reason for the choice is simple:

> **GitHub is the best reference for how to wire a provider into Teleport, but OIDC is the right abstraction for how Google should live in this fork.**

That leads to the most learnable, least surprising, and least divergent design:

- use GitHub as a **pattern reference**
- keep Google on **OIDC semantics**
- minimize edits to existing files
- keep fork logic localized
- avoid unnecessary UI/admin expansion in v1

That is why the current recommendation is not “copy GitHub and rename it.”
It is “complete the OIDC path locally, and use GitHub only to guide the wiring.”
