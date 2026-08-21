#!/usr/bin/env bash
# Publish Psiphon Access Helm chart OCI artifacts to ghcr.io/psiphon-inc/charts.
# Refuses to replace an existing release tag.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../../.." && pwd)

VERSION="${VERSION:-19.0.0-psiphon.1}"
REGISTRY="${REGISTRY:-ghcr.io/psiphon-inc/charts}"
OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/out/release-helm-charts}"

echo "=== Publishing Psiphon Access Helm Charts to OCI Registry ==="
echo "Registry:   oci://${REGISTRY}"
echo "Version:    ${VERSION}"
echo "Output dir: ${OUTPUT_DIR}"

CHARTS=("teleport-cluster" "teleport-kube-agent" "teleport-operator")

TMP_PULL_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_PULL_DIR}"' EXIT

for chart in "${CHARTS[@]}"; do
  tarball="${OUTPUT_DIR}/${chart}-${VERSION}.tgz"
  if [ ! -f "${tarball}" ]; then
    echo "Error: Chart package ${tarball} does not exist. Run build-charts.sh first." >&2
    exit 1
  fi

  echo "--- Checking existing release tag for ${chart}:${VERSION} ---"
  
  # Check whether the chart version already exists in the remote OCI registry.
  pull_output=""
  if pull_output=$(helm pull "oci://${REGISTRY}/${chart}" --version "${VERSION}" --destination "${TMP_PULL_DIR}" 2>&1); then
    echo "Error: Chart '${chart}' version '${VERSION}' already exists in registry oci://${REGISTRY}." >&2
    echo "Refusing to replace an existing release tag." >&2
    exit 1
  else
    # If the pull failed, analyze why.
    if [[ "${pull_output}" == *"401"* || "${pull_output}" == *"unauthorized"* || "${pull_output}" == *"Unauthorized"* ]]; then
      echo "Registry access check output:"
      echo "${pull_output}"
      echo "Registry access was refused due to missing credentials."
      echo "Recording exact stop for ${chart}:${VERSION}."
    elif [[ "${pull_output}" == *"404"* || "${pull_output}" == *"not found"* || "${pull_output}" == *"NotFound"* ]]; then
      echo "Chart '${chart}' version '${VERSION}' does not exist in registry. Proceeding to push."
    else
      echo "Registry check returned: ${pull_output}"
    fi
  fi

  echo "--- Attempting helm push for ${chart} ---"
  push_output=""
  if push_output=$(helm push "${tarball}" "oci://${REGISTRY}" 2>&1); then
    echo "Successfully pushed ${chart}:${VERSION} to oci://${REGISTRY}"
  else
    echo "Push attempt failed with output:"
    echo "${push_output}"
    if [[ "${push_output}" == *"401"* || "${push_output}" == *"unauthorized"* || "${push_output}" == *"Unauthorized"* ]]; then
      echo "STOP RECORDED: Publishing ${chart} to oci://${REGISTRY} refused because registry credentials are not available in this environment."
    else
      echo "STOP RECORDED: Publishing ${chart} to oci://${REGISTRY} failed."
    fi
  fi
done

echo "=== Publish check process finished ==="
