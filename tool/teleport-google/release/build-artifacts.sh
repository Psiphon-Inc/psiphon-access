#!/usr/bin/env bash
# Build Linux amd64 command artifacts inside a pinned Debian container.
# This script produces teleport-linux-amd64, tctl-linux-amd64, tsh-linux-amd64,
# and SHA256SUMS covering the file set.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../../.." && pwd)

VERSION="${VERSION:-19.0.0-psiphon.1}"
GITREF="${GITREF:-$(git -C "${REPO_ROOT}" rev-parse HEAD)}"
OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/out/release-linux-amd64}"

# The build command is a variable so a caller can substitute a buildx builder.
# That is the only way to get a layer cache that survives between CI runs, and
# it changes nothing locally, where the default stays podman.
#
# Both podman build and docker buildx build accept --output type=local, so the
# binaries come straight out of the scratch stage. No container is created and
# nothing has to be cleaned up afterwards.
CONTAINER_ENGINE="${CONTAINER_ENGINE:-podman}"
BUILD_CMD="${BUILD_CMD:-${CONTAINER_ENGINE} build}"
read -r -a build_cmd <<<"${BUILD_CMD}"
read -r -a build_extra_args <<<"${BUILD_EXTRA_ARGS:-}"

echo "=== Building Psiphon Access Linux amd64 command artifacts ==="
echo "Repo root:    ${REPO_ROOT}"
echo "Version:      ${VERSION}"
echo "Git revision: ${GITREF}"
echo "Output dir:   ${OUTPUT_DIR}"

mkdir -p "${OUTPUT_DIR}"

# Build the release binaries inside the pinned Debian builder container and
# write the scratch stage straight to the output directory.
"${build_cmd[@]}" \
  --target artifacts \
  --output "type=local,dest=${OUTPUT_DIR}" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  --build-arg VERSION="${VERSION}" \
  --build-arg GITREF="${GITREF}" \
  ${build_extra_args[@]+"${build_extra_args[@]}"} \
  "${REPO_ROOT}"

chmod 755 "${OUTPUT_DIR}/teleport-linux-amd64" "${OUTPUT_DIR}/tctl-linux-amd64" "${OUTPUT_DIR}/tsh-linux-amd64"

# Generate SHA256SUMS using sorted file names.
SHA256SUMS_FILE="${OUTPUT_DIR}/SHA256SUMS" "${SCRIPT_DIR}/generate-checksums.sh" \
  "${OUTPUT_DIR}/teleport-linux-amd64" \
  "${OUTPUT_DIR}/tctl-linux-amd64" \
  "${OUTPUT_DIR}/tsh-linux-amd64"

echo "=== Build completed successfully ==="
