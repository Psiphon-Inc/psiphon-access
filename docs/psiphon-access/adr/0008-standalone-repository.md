# ADR 0008. Standalone repository setup and source offer URL

**Status: accepted, 2026-08-24.**

This record also settles the fork naming that an earlier, now removed, record held.


## Question

How is the repository configured as a standalone repository, how are its branches structured, and where does the AGPL section 13 source offer resolve?


## Decision

1. **Standalone repository.** The GitHub repository becomes `Psiphon-Inc/psiphon-access` and is no longer a fork of `gravitational/teleport`. A non-fork repository cannot open a pull request against `gravitational/teleport`. An upstream contribution needs a separate personal fork.
2. **Default branch.** The default branch is `main`. The old repository's `master` branch was byte-identical to upstream master. Making `master` hold product code would change the meaning of an identical name while the two lineages share 27,874 commits. Most operations would succeed and return a wrong answer.
3. **Upstream master mirror.** The `upstream-master` branch mirrors `gravitational/teleport` master. The general rule: an upstream mirror holds zero fork commits, moves only by fast-forward, and is never a base for work.
4. **Deferred upstream v19 branch.** Creation of `upstream-v19` is deferred until `gravitational/teleport` cuts `branch/v19`. Upstream master is the v19 line today at version `19.0.0-prealpha.2`. Creating `upstream-v19` now would duplicate `upstream-master`. That duplication is the only thing that would force a non-fast-forward reset at the cut.
5. **Source offer URL.** The AGPL section 13 source offer resolves to `https://github.com/Psiphon-Inc/psiphon-access`.
6. **Full git history preservation.** History is kept in full rather than shallow or truncated. A push from a shallow clone is refused with `shallow update not allowed` unless the receiving side sets `receive.shallowUpdate`, which GitHub does not expose. Truncation by rewrite gives the root a new commit SHA, so the first upstream fetch re-downloads the full history anyway. Full history preserves upstream commit SHAs and keeps history verifiable.


## Context and consequences

### Standalone repository transition

Detaching the repository from `gravitational/teleport` isolates the product lineage. A user cannot open a pull request directly against `gravitational/teleport` from `Psiphon-Inc/psiphon-access`. Contributors must use a personal fork to submit pull requests upstream.


### Default branch choice

The default branch is `main`. The `master` branch in earlier repository states matched upstream master. Using `main` prevents confusion between product code and upstream `master`.


### Upstream mirror rules

The `upstream-master` branch mirrors upstream development. It holds zero fork commits and moves only by fast-forward. It is never used as a base for work.


### Upstream v19 branch deferral

Upstream master is currently at version `19.0.0-prealpha.2`. Creating `upstream-v19` now would duplicate `upstream-master`. Deferring `upstream-v19` until upstream cuts `branch/v19` avoids a non-fast-forward reset.


### AGPL section 13 source offer URL

The AGPL section 13 source offer URL on the login page points to `https://github.com/Psiphon-Inc/psiphon-access`.


### Git history preservation

Preserving full history avoids shallow push errors on GitHub. It avoids re-downloading history after a history rewrite and preserves upstream commit SHAs for verification.


## Legal status

This record states facts. It is not legal advice.
