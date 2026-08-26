# Psiphon Access

Psiphon Access, based on Teleport by Gravitational, Inc. Not affiliated with or
endorsed by Gravitational, Inc.

Psiphon Access is Psiphon's internal fork of Teleport. It adds Google
Workspace login and Google group role mapping, and changes nothing else. It is
an internal service. It is not a product, and it is not offered to anyone
outside Psiphon.

## What this fork adds

Upstream Teleport keeps OIDC single sign-on for its Enterprise edition.
Psiphon Access adds one OIDC connector of its own, for Google Workspace only:

- Browser and CLI login through Google, with PKCE.
- Group role mapping through the Google Cloud Identity API, using the access
  token of the person logging in. There is no domain-wide delegation, no Admin
  SDK, no service account, and no stored Google credential.
- Logins are bound to a configured Workspace domain allow-list, so a personal
  Google account cannot log in even though Google serves every account from the
  same issuer.
- Local Teleport login stays enabled as the break-glass path, independent of
  Google.

Two limits worth knowing before you deploy it:

- Group membership is **direct only**. A group named in `claims_to_roles` must
  not contain another group, because members of the inner group inherit nothing.
  Keep mapped groups flat.
- SSO MFA through Google is not supported and is refused at configuration time.

## Branches

| Branch | Holds | Moves by |
|---|---|---|
| `main` | The product. The default branch. Releases are tagged here. | Normal review and merge |
| `upstream-master` | A mirror of `gravitational/teleport` `master`. | Fast-forward only |

An upstream mirror holds zero fork commits, moves only by fast-forward, and is
never a base for work. Start every feature branch from `main`. Moving the fork
to a newer upstream base is a separate, deliberate rebase of `main`, and it is
not combined with a feature.

`docs/psiphon-access/repository-layout.md` holds the full policy: the tag set,
how to verify the lineage against upstream, how to take an upstream backport,
when the deferred `upstream-v19` mirror gets created, and why this repository
cannot open a pull request against `gravitational/teleport`.

## How it stays close to upstream

The fork is deliberately small, so that following upstream stays cheap. Fork-
original code lives in `lib/googleoidc/` and `tool/teleport-google/assets/`.
The server entrypoint is `tool/teleport`, which calls `googleoidc.Activate`.
The feature attaches through seams upstream already provides: the
`modules.Modules` interface, the plugin registry, and the `auth.OIDCService`
interface.

Keeping the modified upstream surface small is a **standing goal, not a count**.
There is no cap. Grow that surface when the change buys something no seam can
buy, and justify it with two measurements: what the change removes or enables,
and how often upstream touches the file.

This repository is standalone. It is not a GitHub fork, so `upstream` is not
configured by a clone. Add it once, and keep upstream's 7,000 release tags out:

```bash
git remote add upstream https://github.com/gravitational/teleport
git config remote.upstream.tagOpt --no-tags
git fetch upstream
```

```bash
# the surface today, measured against the fork base
git diff --name-status e0d3c67924a..HEAD \
  | grep -v 'lib/googleoidc\|tool/teleport-google\|docs/psiphon-access'

# the churn of a file you propose to patch
git log --oneline --since=2023-01-01 -- <file> | wc -l
```

On 2026-08-25 the surface is 4 modified upstream Go files, 29 other modified
upstream files, 1 deleted upstream file, and 44 files added inside upstream
directories. `docs/psiphon-access/source-provenance.md` names every one of them
and says why. That document is the authoritative list; this paragraph is a
headline and goes stale. Prefer a low-churn file. Over the last three years `lib/versioncontrol/github/github.go`
took 5 commits and `lib/auth/oidc.go` took 11, while `lib/auth/auth.go` took 529
and `tool/teleport/common/teleport.go` took 140. A patch in a quiet file costs
less at every rebase than a clever trick that depends on construction order.

Names that software depends on are unchanged on purpose. The binary is still
`teleport` at `/usr/local/bin/teleport`, the clients are still `tsh` and `tctl`,
and the configuration keys, resource kinds and audit event types are upstream's.
Only what a person sees is renamed. Renaming the rest would break the Helm chart,
the configuration format and client compatibility, and would make every rebase a
conflict.

## Building

Requires Go and, for the web UI, Node with pnpm and a Rust toolchain for the
ironrdp WebAssembly package.

```bash
# The fork binary. Google login is compiled in but off by default.
go build -tags webassets_embed -o build/teleport ./tool/teleport

# The clients, unchanged from upstream.
go build -o build/tctl ./tool/tctl/
go build -o build/tsh  ./tool/tsh/
```

The web UI is built by `make ensure-webassets`. On NixOS that needs an unwrapped
clang and `NIX_HARDENING_ENABLE=""` for the WebAssembly step, because the
compiler wrapper injects host glibc headers and a hardening flag that clang
refuses for `wasm32`.

## Running

Google login is opt-in. Without the environment variable the binary behaves as
stock Teleport and refuses every OIDC connector as an Enterprise feature.

```bash
TELEPORT_ENABLE_GOOGLE_OIDC=true build/teleport start --config /etc/teleport/teleport.yaml
```

An unparseable value exits non-zero rather than defaulting to off quietly.

## Documents

The documents that belong to this fork are in
[`docs/psiphon-access/`](./docs/psiphon-access/README.md), which is their single
index. Everything else under `docs/` is upstream Teleport's.

Start with the [source provenance
record](./docs/psiphon-access/source-provenance.md). It says what the fork is
built from, names every upstream file the fork changes and why, and explains how
its licence notices work. The [repository
layout](./docs/psiphon-access/repository-layout.md) covers the branch roles and
the upstream sync policy.

Implementation plans are not kept here. They live in the issue tracker.

## Source

The corresponding source of any running build is at
<https://github.com/Psiphon-Inc/psiphon-access>, at the revision the build reports.

That revision must be published and reachable before anyone else is given access
to a deployment. The login page names a commit, and AGPL section 13 is only
satisfied if that commit is actually there.

## Licence

Psiphon Access is distributed under the same terms as Teleport, and this
section states facts rather than granting anything.

The API module, all code under `/api`, is available under the
[Apache 2.0 licence](./api/LICENSE).

The remainder of the source in this repository is available under the
[GNU Affero General Public License](./LICENSE). Anyone compiling it from source
must comply with that licence. Because Psiphon Access is a modified version
that users reach over a network, AGPL section 13 requires that those users be
offered its corresponding source; see [Source](#source) above.

Copyright (C) Gravitational, Inc., for Teleport.
Copyright (C) Psiphon Inc., for the modifications in this fork.

Modifications by Psiphon Inc. began in August 2026, forked from upstream
Teleport at commit `e0d3c67924a`.

"Teleport" and the Teleport logo are trademarks of Gravitational, Inc. They are
used here only to say truthfully what this software is derived from. Psiphon
Access, based on Teleport by Gravitational, Inc. Not affiliated with or endorsed
by Gravitational, Inc.
