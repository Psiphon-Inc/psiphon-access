#!/usr/bin/env bash
# Package Psiphon Access Helm charts at version 19.0.0-psiphon.1.
# This script packages teleport-cluster, teleport-kube-agent, and
# teleport-operator (standalone), then generates SHA256SUMS and PROVENANCE.md.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../../.." && pwd)

VERSION="${VERSION:-19.0.0-psiphon.1}"
GITREF="${GITREF:-$(git -C "${REPO_ROOT}" rev-parse HEAD)}"
OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/out/release-helm-charts}"

echo "=== Building Psiphon Access Helm Chart Packages ==="
echo "Repo root:    ${REPO_ROOT}"
echo "Version:      ${VERSION}"
echo "Git revision: ${GITREF}"
echo "Output dir:   ${OUTPUT_DIR}"

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

# Package the three required charts.
helm package "${REPO_ROOT}/examples/chart/teleport-cluster" -d "${OUTPUT_DIR}"
helm package "${REPO_ROOT}/examples/chart/teleport-kube-agent" -d "${OUTPUT_DIR}"
helm package "${REPO_ROOT}/examples/chart/teleport-cluster/charts/teleport-operator" -d "${OUTPUT_DIR}"

CLUSTER_TARBALL="${OUTPUT_DIR}/teleport-cluster-${VERSION}.tgz"
AGENT_TARBALL="${OUTPUT_DIR}/teleport-kube-agent-${VERSION}.tgz"
OPERATOR_TARBALL="${OUTPUT_DIR}/teleport-operator-${VERSION}.tgz"

for tarball in "${CLUSTER_TARBALL}" "${AGENT_TARBALL}" "${OPERATOR_TARBALL}"; do
  if [ ! -f "${tarball}" ]; then
    echo "Error: Expected packaged chart ${tarball} was not created." >&2
    exit 1
  fi
done

# Reuse the existing generate-checksums.sh with positional arguments.
SHA256SUMS_FILE="${OUTPUT_DIR}/SHA256SUMS" "${SCRIPT_DIR}/generate-checksums.sh" \
  "${CLUSTER_TARBALL}" \
  "${AGENT_TARBALL}" \
  "${OPERATOR_TARBALL}"

# Write provenance record into the output directory.
cat <<EOF > "${OUTPUT_DIR}/PROVENANCE.md"
# Helm Chart Release Provenance

- Version: ${VERSION}
- Git Tag: v${VERSION}
- Git Commit: ${GITREF}
- Source Repository: https://github.com/psiphon/teleport

## AGPL Publication Statement

The public Git tag v${VERSION} in this repository is the publication and source of record.
The source code of all Helm charts is public in this repository at the public tag.
This includes operator-crds, which comes from AGPL fork Go source code.
The OCI registry at ghcr.io/psiphon-inc/charts is a distribution convenience only.
The registry is not the source of record.

## Packaged Artifacts

EOF

cat "${OUTPUT_DIR}/SHA256SUMS" >> "${OUTPUT_DIR}/PROVENANCE.md"

echo "=== Helm chart packaging completed successfully ==="
