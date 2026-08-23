# Repository layout and branch policy

This repository is not a fork of `gravitational/teleport` in the GitHub sense.
It is a standalone repository that keeps the full upstream history. ADR 0008
records why.

This document says what each branch is for, how the branches move, and how to
take work from upstream. Read it before you create a branch or a tag.

## Branches

| Branch | Holds | Moves by |
|---|---|---|
| `main` | The product. The default branch. Releases are tagged here. | Normal review and merge |
| `upstream-master` | A mirror of `gravitational/teleport` `master`. | Fast-forward only |
| `upstream-v19` | A mirror of `gravitational/teleport` `branch/v19`. Deferred. | Fast-forward only |

`upstream-v19` does not exist yet. See "The deferred v19 mirror" below.

Current state:

```
$ git branch -v
* main            <moves with every merge>
  upstream-master 05f8e349433 SSO MFA for Admin MFA docs (#67149)
```

The repository is `Psiphon-Inc/psiphon-access`. It was created on 2026-08-25 and
holds exactly these two branches and 168 tags.

## The mirror rule

One rule governs every branch whose name starts with `upstream-`:

> An upstream mirror holds zero fork commits. It moves only by fast-forward. It
> is never a base for work.

The rule needs no amendment when upstream starts a new major line. Add
`upstream-v20` when `gravitational/teleport` cuts `branch/v20`. Keep
`upstream-v19` for as long as upstream supports v19. The mirrors accumulate the
same way upstream's own release branches do.

## Where work starts

Start a feature branch from `main`. Do not start one from a mirror.

A branch cut from a mirror has no Google Workspace OIDC login and no Psiphon
Access rebranding. You cannot test such a branch against the product. Merging it
into `main` also drags the upstream commits along as a side effect of a feature
merge, which hides a base change inside an unrelated review.

Moving the fork to a newer upstream base is a separate act. It is deliberate, it
is rare, and it is a rebase of `main`. Do not combine it with a feature.

## Tags

Fork releases carry the `-psiphon.N` identifier, for example
`v19.0.0-psiphon.1`. Cut them from `main`.

This repository keeps 168 tags:

- The 167 upstream tags that are ancestors of `upstream-master`. They cost no
  extra objects, because the commits they name are already present. They let you
  see which upstream releases sit in the history.
- The fork release tags.

It does not keep upstream tags that live only on an upstream release branch.
Those pin history this repository does not carry.

Do not fetch upstream tags. The repository configuration prevents it:

```
$ git config --get remote.upstream.tagOpt
--no-tags
```

Without that setting a routine `git fetch upstream` adds more than seven
thousand tags and buries the release list.

Note that a fork tag such as `v19.0.0-psiphon.1` is a semver **prerelease** of
`19.0.0`. It sorts before `19.0.0`. A version range written as `>=19.0.0`
excludes it. Keep that in mind when you write a constraint against a fork
release.

## Verifying the lineage

The history is not shallow and it is not truncated, so upstream commit
identifiers are preserved exactly. Anyone can prove that this repository carries
genuine upstream history:

```
$ git merge-base --is-ancestor 05f8e349433 upstream-master
$ echo $?
0
```

The same check ties the product to the upstream commit it is built on:

```
$ git merge-base --is-ancestor e0d3c67924a main
$ echo $?
0
```

A truncated history cannot answer either question, because a rewrite gives the
root commit a new identifier. That is the main reason this repository keeps the
full history.

To compare against upstream directly, add the remote:

```
git remote add upstream https://github.com/gravitational/teleport
git fetch upstream
```

## Describing a commit

Always pass `--exclude 'api/*'`. The repository carries Go submodule tags under
`api/`, and they shadow the real release tags:

```
$ git describe --tags e0d3c67924a
api/v19.0.0-prealpha.2-1960-ge0d3c67924a

$ git describe --tags --exclude 'api/*' e0d3c67924a
v19.0.0-prealpha.2-1960-ge0d3c67924a
```

On a commit with a nearby fork tag the two agree, so the fault is easy to miss:

```
$ git describe --tags
v19.0.0-psiphon.1-1-g66c35d3db1d
```

## The deferred v19 mirror

`gravitational/teleport` has not cut `branch/v19`. Its `master` **is** the v19
line today, at version `19.0.0-prealpha.2`. A `upstream-v19` branch created now
would only duplicate `upstream-master`.

That duplication is the whole problem. If `upstream-v19` followed `master` and
then upstream cut `branch/v19`, the mirror would hold commits that
`branch/v19` never had. Moving it to the real branch would then be a
non-fast-forward reset of a shared branch. Creating the mirror late avoids that
completely.

### Creating it

Do this on the day upstream cuts `branch/v19`. These commands cannot run until
that branch exists.

```
git fetch upstream
git branch upstream-v19 upstream/branch/v19
git push origin upstream-v19
```

Then apply protection, and record the creation in this document.

### Protection, in two phases

A mirror is append-only only after its upstream counterpart exists.

| Phase | State | Protection |
|---|---|---|
| Before the cut | The branch does not exist | None |
| After the cut | The branch mirrors a real upstream line | Block force push. Block deletion. Require linear history. Restrict who may push. |

`upstream-master` is already in the second phase.

## Taking an upstream backport

An upstream release branch carries fixes that `master` does not. As an
illustration of the scale, `branch/v18` held 3,436 commits that `master` did not
have when this document was written.

Seeing them is what the mirror is for. Taking one is a separate decision.

To list what the product has not taken:

```
git log --oneline <the upstream commit main is based on>..upstream-v19
```

The current base is `e0d3c67924a`. `main` is 93 commits ahead of it and 97
commits behind `upstream-master`.

To take a fix, rebase `main` onto a newer point on the mirror, or cherry-pick
the single commit. Never merge a mirror into `main`. A merge makes the mirror an
ancestor of the product and destroys the property that the mirror holds zero
fork commits.

## Two standing invariants

These two rules are not style. Breaking either one floods the repository with
pull requests within minutes, and pull request numbers are permanent.

1. **`main` must never carry `.github/dependabot.yml`.** This fork deletes that
   file. Upstream ships it declaring 19 ecosystems.
2. **`upstream-master` must never become the default branch.** It carries
   upstream's copy of that file, and it always will, because a mirror takes
   upstream's content unchanged.

## Creating the repository on GitHub

This procedure is written from three failed attempts and one that worked.

Dependabot version updates read `.github/dependabot.yml` **from the default
branch and from nowhere else**. A non-default branch holding the same file does
not trigger them. That was measured during the successful push: the bulk of the
history sat on `upstream-master` with the real 19-ecosystem file present, the
default branch pointed elsewhere, and 15 minutes produced zero jobs and zero
pull requests against a known 2-minute latency.

An empty GitHub repository takes its default branch from **the first ref
pushed**. Two attempts pushed the upstream mirror first, because it carries the
bulk of the objects. That made upstream's `master` the default branch, and
Dependabot opened 33 and 69 pull requests before anyone could intervene.

Disabling Actions does not help. It is still correct, and it does stop the 51
upstream workflow files, but Dependabot is a separate service. Measured with
Actions disabled: 70 runs, every one a Dependabot job with `event: dynamic`, and
zero workflow runs.

The order that works:

1. Create the repository **empty**. No README, no licence, no gitignore.
2. Disable Actions and the security-update endpoints:

   ```sh
   gh api -X PUT repos/<owner>/<repo>/actions/permissions -F enabled=false
   gh api -X DELETE repos/<owner>/<repo>/vulnerability-alerts
   gh api -X DELETE repos/<owner>/<repo>/automated-security-fixes
   ```

3. Push a placeholder README commit as `main` **first**, so the default branch
   is clean from the first byte. Confirm `default_branch` is `main` before going
   on.
4. Push the history to `upstream-master` in batches. It is never the default
   branch, so its copy of the file is inert.
5. Force-update `main` to the real tip, with the lease pinned to the placeholder
   commit:

   ```sh
   git push <remote> main:refs/heads/main \
     --force-with-lease=refs/heads/main:<placeholder-sha>
   ```

6. Push the tags, then apply the branch and tag rulesets. Apply them **after**
   the pushes, not before, because a ruleset on the default branch rejects the
   force-update in step 5.
7. Make the repository public, then re-run the two `DELETE` calls from step 2.
   A public repository turns Dependabot alerts back on.

Enabling Actions later runs all 51 upstream workflows at once. Prune them before
you enable it.

## Contributing to upstream

You cannot open a pull request against `gravitational/teleport` from this
repository. GitHub requires a fork relationship for a pull request between two
repositories, and this repository is not a fork.

To send a patch upstream, fork `gravitational/teleport` separately and push the
branch there.
