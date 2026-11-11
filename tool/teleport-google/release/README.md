# Psiphon Access Release Tooling

This directory stages and verifies commands, runtime images, and charts before publication.
Build outputs stay outside the source and tooling checkouts. Do not commit them.

## Command Artifacts

The release contains eight commands and one sorted, eight-entry `SHA256SUMS`:

- Linux amd64 and arm64: `teleport`, `tctl`, and `tsh`.
- Darwin arm64: `tctl` and `tsh`.

Linux builds use matching native runners and digest-pinned Go 1.26.5 Debian images.
Static binaries must pass ELF inspection and run in scratch containers.
A dynamic dependency stops the build and reports the measured dependency. There is no fallback.
Darwin builds use native ARM64, Go 1.26.5, CGO, and the installed Apple SDK.
Mach-O, system-library, version, and full source revision checks must pass.
Darwin evidence records the runner image, Xcode, and SDK versions.

### Command Tooling Usage

Supply a clean source checkout and a new output directory outside both checkouts.
The tooling checkout must also be clean. Supply its full SHA separately.
The source SHA is a candidate commit, not the current public tag target.
A build does not require moving a tag.

```bash
export VERSION=19.0.0-psiphon.2
export GITREF="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
export TOOLING_SHA="$(git rev-parse HEAD)"
bash tool/teleport-google/release/build-artifacts.sh "$SOURCE_DIR" "$OUTPUT_PARENT/linux"
```

Use `build-darwin-arm64.sh SOURCE NEW_OUTPUT_DIRECTORY` on native macOS ARM64.
Neither script changes tracked source. Darwin metadata generation uses a temporary source copy.
`generate-checksums.sh` takes an explicit list of the eight binaries.
`verify-artifacts.sh --manifest DIRECTORY` checks the exact set, order, and byte hashes in a new process.
Downloaded release commands need `chmod +x`.

## Helm Charts

`build-charts.sh SOURCE NEW_OUTPUT_DIRECTORY` packages all three charts offline.
It checks package metadata, nested versions, source content, and source-to-package rendering.
The standalone Operator must render exactly 31 CRDs and no other resources.
The cluster and agent charts must render resources without CRDs.
No dependency upgrade, registry read, or cluster operation occurs during staging.
The source repository is `https://github.com/Psiphon-Inc/psiphon-access`.
The existing `verify-charts.sh` includes remote checks with recorded stops.
It is not the candidate gate and is not evidence of an offline verification pass.

## Candidate and Publication Workflows

One push of the completed tooling directly to `main` starts the build-only `release-arm64.yml` workflow.
This CI must pass before the human moves the `.2` tag or publishes `.2` assets.
There is no path filter or preliminary probe.
The same workflow is reusable by `release.yml`. Manual calls require explicit full source and tooling SHAs.
The consolidated workflow requires both SHAs to equal the workflow commit.
It still records them separately. It cannot label another source tree as that commit.

Native Linux and Darwin jobs validate each platform before uploading intermediate staging artifacts.
Image and chart jobs also verify before upload. These artifacts are not public release assets.
The final `release-candidate` artifact exists only after every staging job passes.
It contains commands, chart packages, two Docker transport archives, and separate evidence.
A receipt binds every output byte to the source, tooling, version, and workflow run.
The two runtime images remain Linux amd64 only.
Image gates inspect OCI labels, build revision, license and notice bytes, and native execution.
The Operator has no version command, so its gate uses build metadata, OCI labels, and `-h` execution.
A temporary image recipe limits Go parallelism. Evidence includes that recipe. Runtime Dockerfiles stay unchanged.

All build jobs have read-only repository permissions and no publication token.
Only the dependent publisher job has contents and packages write permissions.
Normal publication refuses existing release, image, or chart versions.
Only an authenticated `MANIFEST_UNKNOWN` response proves registry absence.
Permission errors and unknown errors stop publication without dumping response bodies.

### Prelaunch Reset of `.2`

Automatic tag publication always skips `v19.0.0-psiphon.2`.
A human tag move therefore cannot race the explicit reset job.
No workflow changes settings, moves tags, deletes packages, or deletes a release.
The human controls backups, the exact-lease tag push, and protection restoration.
Do not run another registry writer during reset. Registry tags have no compare-and-swap operation.

Before reset, retain a local recovery snapshot of the old annotated tag, release metadata,
all old asset bytes, both image manifests, and all three chart manifests and packages.
Keep it outside Git. Confirm that it can restore those exact identities.
The workflow does not create or upload this local snapshot.

The reset dispatch requires `reset_existing=true`, the candidate source SHA, the tooling SHA,
and `version=19.0.0-psiphon.2`. Supply `expected_baseline` as JSON with these fields:

| Field | Required value |
|---|---|
| `candidate_source`, `candidate_tooling` | Full candidate SHAs |
| `old_tag_object`, `old_source` | Expected old annotated tag object and peeled source SHA |
| `release_id` | Existing GitHub release ID |
| `assets` | Exact seven old asset names, each mapped to `id`, `size`, `updated_at`, and `digest` |
| `images` | `psiphon-access` and `teleport-operator`, each mapped to its old `sha256:` manifest digest |
| `charts` | `charts/teleport-cluster`, `charts/teleport-kube-agent`, and `charts/teleport-operator`, each mapped to its old manifest digest |
| `protection_sha256` | SHA256 of the canonical JSON array of restored ruleset details |
| `recovery_sha256` | SHA256 identity of the local recovery snapshot |

Use `recovery_confirmation=local-snapshot-sha256:<recovery_sha256>` to confirm local recovery readiness.
Read old assets through `/releases/{release_id}/assets?per_page=100`.
The protection input covers `/rulesets?includes_parents=true&per_page=100` in returned order.
Read each listed ruleset through `/rulesets/{id}?includes_parents=true`.
Hash the detail array as UTF-8 JSON with sorted keys and separators `(',', ':')`.
Reads are bounded to fewer than 100 assets and rulesets. The workflow refuses larger results.

Before dispatch, the human must move the `.2` tag to the candidate and restore protections.
The publisher checks the current tag, old tag object, old assets, and all five old registry digests.
It also checks the restored protection fingerprint and effective tag update and deletion rules.
Those rules must be active and have no bypass actors.
Missing ruleset details, hidden bypass data, or insufficient read permissions stop the reset.
Do not grant the workflow settings-write permission to bypass this gate.

All checks run again immediately before the first publication write.
The reset replaces only the approved `.2` version. Other versions have no overwrite path.
The final GitHub set is exactly 12 assets: eight commands, `SHA256SUMS`, and three chart packages.
Consumer checks compare image digests, pulled chart bytes, and release asset hashes.

Publication is not transactional across GitHub and GHCR.
If a write fails, stop. Retain the job evidence and compare live identities with the local snapshot.
A human must approve a bounded repair or restoration from that snapshot.
Do not rerun reset with a stale baseline. There is no destructive automatic rollback.
Native CI, registry consumption, and live deployment proof remain separate from local syntax checks.
