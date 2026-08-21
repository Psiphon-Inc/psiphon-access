# Psiphon Access Release Tooling

This directory contains release build tooling for command artifacts and Helm charts.

## Command Artifacts

The release tooling builds static Linux amd64 binaries for `teleport`, `tctl`, and `tsh`.
A pinned Debian builder container compiles all binaries.
No build artifact originates on the host.

### Command Tooling Files

- `Dockerfile`: Defines the pinned builder container and artifact stages.
- `generate-checksums.sh`: Generates sorted `SHA256SUMS` from an input file list.
- `build-artifacts.sh`: Builds release binaries and checksums into `out/release-linux-amd64`.
- `verify-artifacts.sh`: Verifies binary format, static linking, scratch execution, version, revision, and checksums.

### Command Tooling Usage

Build release artifacts:

```bash
VERSION="19.0.0-psiphon.1" GITREF="$(git rev-parse HEAD)" ./tool/teleport-google/release/build-artifacts.sh
```

Verify release artifacts:

```bash
./tool/teleport-google/release/verify-artifacts.sh
```

## Helm Charts

The release tooling packages `teleport-cluster`, `teleport-kube-agent`, and `teleport-operator`.
The `teleport-operator` chart is packaged standalone as well as remaining a subchart.

### Helm Chart Files

- `build-charts.sh`: Packages the three Helm charts into `out/release-helm-charts` and generates `SHA256SUMS` and `PROVENANCE.md`.
- `publish-charts.sh`: Checks existing release tags and publishes Helm chart OCI packages to `ghcr.io/psiphon-inc/charts`.
- `verify-charts.sh`: Verifies chart versions, checksums, unpacked reproducibility, template rendering, and OCI pull state.

### Helm Chart Usage

Package release Helm charts:

```bash
VERSION="19.0.0-psiphon.1" GITREF="$(git rev-parse HEAD)" ./tool/teleport-google/release/build-charts.sh
```

Publish release Helm charts:

```bash
VERSION="19.0.0-psiphon.1" REGISTRY="ghcr.io/psiphon-inc/charts" ./tool/teleport-google/release/publish-charts.sh
```

Verify release Helm charts:

```bash
VERSION="19.0.0-psiphon.1" GITREF="$(git rev-parse HEAD)" ./tool/teleport-google/release/verify-charts.sh
```
