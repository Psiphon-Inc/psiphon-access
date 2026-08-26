# AGENTS.md

## This repository is a fork

Psiphon Access is Psiphon's fork of Teleport. It is a standalone repository, not
a GitHub fork. Two branches carry meaning:

- `main` is the product and the default branch. Start every feature branch here.
- `upstream-master` mirrors `gravitational/teleport` `master`. It holds zero fork
  commits, moves only by fast-forward, and is never a base for work.

`main` must never carry `.github/dependabot.yml`, and `upstream-master` must
never become the default branch. `docs/psiphon-access/repository-layout.md`
explains why, and holds the upstream sync policy, the tag set, and the backport
procedure. Read it before you touch a branch, a tag, or a repository setting.

Keep the modified upstream surface small. `docs/psiphon-access/source-provenance.md`
lists every divergent file and the reason for it. Add to that list when you add
to the surface.

## Review Guidelines
- Focus only on critical security, reliability, performance, and scalability issues.
- Ignore style, performance micro-optimizations, and readability nits unless they are tied to a significant failure

### What to Look For
- Authentication/authorization bypasses
- Secret leakage, unsafe logging, or credential exposure
- Unsafe defaults in security-sensitive areas
- Injection risks (SQL, command, template, path traversal, SSRF)
- Insecure crypto usage or key handling
- Privilege escalation or sandbox escapes
- Data corruption, durability failures, or irreversible loss scenarios
- Concurrency hazards that can cause outages or data races
- Reliability regressions: crash loops, panics, deadlocks, unbounded retries, nil pointer dereferences
- Adherence to the guidelines defined in [RFD 153](./rfd/0153-resource-guidelines.md) of Teleport resource definitations, gRPC, backend storage, and cache APIs.

### Documentation

When you are looking at a given product area find the relevant documentation in the docs/ directory to ensure you understand the context in which the code is used.
