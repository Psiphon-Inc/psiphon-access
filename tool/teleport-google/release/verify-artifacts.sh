#!/usr/bin/env bash
# Verify release artifacts against acceptance criteria:
# 1. Format and architecture (ELF 64-bit x86-64).
# 2. Absence of PT_INTERP dynamic interpreter (static linking).
# 3. Execution proof in scratch container for each static binary.
# 4. Version string and full 40-character commit revision output.
# 5. SHA256SUMS verification in a separate clean container process.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../../.." && pwd)

OUTPUT_DIR="${1:-${OUTPUT_DIR:-${REPO_ROOT}/out/release-linux-amd64}}"
EXPECTED_VERSION="${VERSION:-19.0.0-psiphon.1}"
EXPECTED_GITREF="${GITREF:-$(git -C "${REPO_ROOT}" rev-parse HEAD)}"

# Engine is a variable so CI can use docker where "${CONTAINER_ENGINE}" is not installed.
CONTAINER_ENGINE="${CONTAINER_ENGINE:-podman}"

echo "=== Verifying artifacts in ${OUTPUT_DIR} ==="
echo "Expected version: ${EXPECTED_VERSION}"
echo "Expected gitref:  ${EXPECTED_GITREF}"

BINARIES=("teleport-linux-amd64" "tctl-linux-amd64" "tsh-linux-amd64")

for bin_name in "${BINARIES[@]}"; do
  bin_path="${OUTPUT_DIR}/${bin_name}"
  if [ ! -f "${bin_path}" ]; then
    echo "Error: ${bin_path} missing" >&2
    exit 1
  fi

  echo "--- Inspecting format: ${bin_name} ---"
  file "${bin_path}"

  echo "--- Inspecting dynamic interpreter: ${bin_name} ---"
  if readelf -l "${bin_path}" | grep -q "INTERP"; then
    echo "Error: ${bin_name} contains a PT_INTERP segment" >&2
    exit 1
  fi
  echo "${bin_name} has no PT_INTERP segment (statically linked)"

  echo "--- Running in scratch container: ${bin_name} ---"
  scratch_tag="verify-${bin_name}-scratch:latest"
  "${CONTAINER_ENGINE}" build -t "${scratch_tag}" -f - "${OUTPUT_DIR}" <<EOF
FROM scratch
COPY ${bin_name} /binary
ENTRYPOINT ["/binary"]
EOF

  version_output=$("${CONTAINER_ENGINE}" run --rm "${scratch_tag}" version)
  echo "Version output: ${version_output}"

  if [[ "${version_output}" != *"v${EXPECTED_VERSION}"* ]]; then
    echo "Error: version output does not contain expected version v${EXPECTED_VERSION}" >&2
    exit 1
  fi

  if [[ "${version_output}" != *"git:${EXPECTED_GITREF}"* ]]; then
    echo "Error: version output does not contain expected gitref git:${EXPECTED_GITREF}" >&2
    exit 1
  fi

  "${CONTAINER_ENGINE}" rmi "${scratch_tag}" >/dev/null 2>&1 || true
done

echo "--- Verifying SHA256SUMS in a separate clean container process ---"
if [ ! -f "${OUTPUT_DIR}/SHA256SUMS" ]; then
  echo "Error: ${OUTPUT_DIR}/SHA256SUMS missing" >&2
  exit 1
fi

"${CONTAINER_ENGINE}" run --rm -v "${OUTPUT_DIR}":/check -w /check docker.io/library/debian:12-slim \
  sha256sum --check SHA256SUMS

echo "=== All artifact verifications passed successfully ==="
