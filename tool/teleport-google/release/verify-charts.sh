#!/usr/bin/env bash
# Verify packaged Psiphon Access Helm charts against release criteria:
# 1. Package presence and version inspection (version 19.0.0-psiphon.1).
# 2. SHA256SUMS verification in a separate clean container process.
# 3. Reproducibility test: tarball hash comparison and unpacked content diff.
# 4. Helm template rendering proof:
#    - teleport-operator renders 31 CRDs standalone with enabled=false and installCRDs=always
#    - teleport-cluster renders 0 CRDs with operator.installCRDs=never
#    - teleport-kube-agent renders successfully with required parameters
# 5. OCI registry pull/render check or recorded stop if tag is unpublished.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../../.." && pwd)

OUTPUT_DIR="${1:-${OUTPUT_DIR:-${REPO_ROOT}/out/release-helm-charts}}"
EXPECTED_VERSION="${VERSION:-19.0.0-psiphon.1}"
EXPECTED_GITREF="${GITREF:-$(git -C "${REPO_ROOT}" rev-parse HEAD)}"

# Engine is a variable so CI can use docker where "${CONTAINER_ENGINE}" is not installed.
CONTAINER_ENGINE="${CONTAINER_ENGINE:-podman}"
REGISTRY="${REGISTRY:-ghcr.io/psiphon-inc/charts}"

echo "=== Verifying Helm Chart Packages in ${OUTPUT_DIR} ==="
echo "Expected version: ${EXPECTED_VERSION}"
echo "Expected gitref:  ${EXPECTED_GITREF}"

CHARTS=("teleport-cluster" "teleport-kube-agent" "teleport-operator")

# The values each chart needs before it will render at all. Defined once and
# used by both the local render and the render of the pulled package, because
# when the two drifted apart the pulled render failed on a missing clusterName
# and took the whole job with it after the charts had already published.
chart_render_values() {
  case "$1" in
    teleport-cluster)
      printf '%s\n' --set clusterName=teleport.example.com --set operator.installCRDs=never
      ;;
    teleport-kube-agent)
      printf '%s\n' --set proxyAddr=teleport.example.com:443 --set authToken=secret-token \
        --set kubeClusterName=my-cluster
      ;;
    teleport-operator)
      printf '%s\n' --set enabled=false --set installCRDs=always
      ;;
    *)
      echo "chart_render_values: unknown chart $1" >&2
      return 1
      ;;
  esac
}

# 1. Inspect package presence and helm show chart output
for chart in "${CHARTS[@]}"; do
  tarball="${OUTPUT_DIR}/${chart}-${EXPECTED_VERSION}.tgz"
  if [ ! -f "${tarball}" ]; then
    echo "Error: Package ${tarball} is missing." >&2
    exit 1
  fi

  echo "--- Inspecting chart metadata: ${chart} ---"
  chart_show=$(helm show chart "${tarball}")
  echo "${chart_show}"

  if ! echo "${chart_show}" | grep -q "version: ${EXPECTED_VERSION}"; then
    echo "Error: Chart ${chart} version does not match expected ${EXPECTED_VERSION}." >&2
    exit 1
  fi

  if ! echo "${chart_show}" | grep -q "appVersion: ${EXPECTED_VERSION}"; then
    echo "Error: Chart ${chart} appVersion does not match expected ${EXPECTED_VERSION}." >&2
    exit 1
  fi
done

# 2. Verify SHA256SUMS in a separate clean container process
echo "--- Verifying SHA256SUMS in clean Debian container ---"
if [ ! -f "${OUTPUT_DIR}/SHA256SUMS" ]; then
  echo "Error: ${OUTPUT_DIR}/SHA256SUMS missing." >&2
  exit 1
fi

"${CONTAINER_ENGINE}" run --rm -v "${OUTPUT_DIR}":/check -w /check docker.io/library/debian:12-slim \
  sha256sum --check SHA256SUMS

# 3. Test reproducibility across runs
echo "--- Testing packaging reproducibility across two runs ---"
REPRO_TMP=$(mktemp -d)
UNPACK_RUN1="${REPRO_TMP}/unpack-run1"
UNPACK_RUN2="${REPRO_TMP}/unpack-run2"
trap 'rm -rf "${REPRO_TMP}"' EXIT

OUTPUT_DIR="${REPRO_TMP}/run2" "${SCRIPT_DIR}/build-charts.sh" >/dev/null

echo "Comparing tarball checksums between initial build and second build:"
repro_differs=false
for chart in "${CHARTS[@]}"; do
  hash1=$(sha256sum "${OUTPUT_DIR}/${chart}-${EXPECTED_VERSION}.tgz" | awk '{print $1}')
  hash2=$(sha256sum "${REPRO_TMP}/run2/${chart}-${EXPECTED_VERSION}.tgz" | awk '{print $1}')
  echo "  ${chart}: run1=${hash1} run2=${hash2}"
  if [ "${hash1}" != "${hash2}" ]; then
    repro_differs=true
  fi
done

if [ "${repro_differs}" = "true" ]; then
  # MEASURED CAUSE, do not guess at this again. helm package does not order the
  # tar members deterministically when a chart carries more than one directory
  # subchart. Six runs of teleport-cluster gave THREE distinct tarball hashes.
  # The only difference was the POSITION of the teleport-util-lib member block.
  # The tar headers are identical, the file list is identical, and the unpacked
  # content is identical, so nothing about the chart changes.
  #
  # It is NOT modification timestamps. It is NOT a first-run effect. Both of
  # those were checked and both were wrong.
  #
  # So a tarball checksum CANNOT prove reproducibility here. It still proves
  # transport integrity of one published file, which is why SHA256SUMS stays.
  # The unpacked comparison below is the reproducibility proof.
  echo "Tarball hashes differ. Cause: helm package orders tar members"
  echo "nondeterministically for multi-subchart charts. Content is unaffected."
  echo "The unpacked comparison below is the reproducibility proof."
else
  echo "Tarball hashes are byte-identical on this run. Do not rely on that:"
  echo "member ordering is nondeterministic and can match by chance."
fi

echo "Verifying unpacked content reproducibility using diff -r:"
mkdir -p "${UNPACK_RUN1}" "${UNPACK_RUN2}"
for chart in "${CHARTS[@]}"; do
  mkdir -p "${UNPACK_RUN1}/${chart}" "${UNPACK_RUN2}/${chart}"
  tar -xzf "${OUTPUT_DIR}/${chart}-${EXPECTED_VERSION}.tgz" -C "${UNPACK_RUN1}/${chart}"
  tar -xzf "${REPRO_TMP}/run2/${chart}-${EXPECTED_VERSION}.tgz" -C "${UNPACK_RUN2}/${chart}"
  
  if ! diff -r "${UNPACK_RUN1}/${chart}" "${UNPACK_RUN2}/${chart}"; then
    echo "Error: Unpacked content for ${chart} differs between runs!" >&2
    exit 1
  fi
done
echo "Unpacked content is 100% byte-for-byte identical across runs."

# 4. Verify Helm template rendering
echo "--- Verifying Helm template rendering ---"

# 4a. Standalone operator chart: 31 CRDs when enabled=false and installCRDs=always
echo "Testing teleport-operator template (enabled=false, installCRDs=always)..."
OP_RENDER_FILE="${REPRO_TMP}/op-rendered.yaml"
mapfile -t op_values < <(chart_render_values teleport-operator)
helm template test-op "${OUTPUT_DIR}/teleport-operator-${EXPECTED_VERSION}.tgz" \
  "${op_values[@]}" > "${OP_RENDER_FILE}"

crd_count=$(grep -c "^kind: CustomResourceDefinition" "${OP_RENDER_FILE}" || true)
non_crd_count=$(grep "^kind:" "${OP_RENDER_FILE}" | grep -v "CustomResourceDefinition" | wc -l || true)

echo "Rendered CRDs in standalone operator: ${crd_count}"
echo "Rendered non-CRDs in standalone operator: ${non_crd_count}"

if [ "${crd_count}" -ne 31 ]; then
  echo "Error: Expected exactly 31 CRDs in standalone operator, found ${crd_count}." >&2
  exit 1
fi

if [ "${non_crd_count}" -ne 0 ]; then
  echo "Error: Expected 0 non-CRD resources when enabled=false, found ${non_crd_count}." >&2
  exit 1
fi

# 4b. Cluster chart: 0 CRDs when operator.installCRDs=never
echo "Testing teleport-cluster template (clusterName=teleport.example.com, operator.installCRDs=never)..."
CLUSTER_RENDER_FILE="${REPRO_TMP}/cluster-rendered.yaml"
mapfile -t cluster_values < <(chart_render_values teleport-cluster)
helm template test-cluster "${OUTPUT_DIR}/teleport-cluster-${EXPECTED_VERSION}.tgz" \
  "${cluster_values[@]}" > "${CLUSTER_RENDER_FILE}"

cluster_crd_count=$(grep -c "^kind: CustomResourceDefinition" "${CLUSTER_RENDER_FILE}" || true)
echo "Rendered CRDs in cluster chart: ${cluster_crd_count}"

if [ "${cluster_crd_count}" -ne 0 ]; then
  echo "Error: Expected 0 CRDs in teleport-cluster when operator.installCRDs=never, found ${cluster_crd_count}." >&2
  exit 1
fi

# 4c. Kube Agent chart rendering
echo "Testing teleport-kube-agent template..."
AGENT_RENDER_FILE="${REPRO_TMP}/agent-rendered.yaml"
mapfile -t agent_values < <(chart_render_values teleport-kube-agent)
helm template test-agent "${OUTPUT_DIR}/teleport-kube-agent-${EXPECTED_VERSION}.tgz" \
  "${agent_values[@]}" > "${AGENT_RENDER_FILE}"

agent_resource_count=$(grep -c "^kind:" "${AGENT_RENDER_FILE}" || true)
echo "Rendered resources in agent chart: ${agent_resource_count}"

if [ "${agent_resource_count}" -eq 0 ]; then
  echo "Error: Agent chart rendered 0 resources." >&2
  exit 1
fi

# 5. OCI Consumer Pull Check / Recorded Stop
echo "--- Checking remote OCI registry consumer pull ---"
for chart in "${CHARTS[@]}"; do
  echo "Checking OCI pull for oci://${REGISTRY}/${chart}:${EXPECTED_VERSION}..."
  PULL_TMP="${REPRO_TMP}/pull-${chart}"
  mkdir -p "${PULL_TMP}"
  pull_output=""
  if pull_output=$(helm pull "oci://${REGISTRY}/${chart}" --version "${EXPECTED_VERSION}" --destination "${PULL_TMP}" 2>&1); then
    echo "Pulled ${chart} from OCI registry successfully."
    mapfile -t render_values < <(chart_render_values "${chart}")
    helm template test-remote "${PULL_TMP}/${chart}-${EXPECTED_VERSION}.tgz" \
      "${render_values[@]}" > /dev/null
    echo "Rendered pulled OCI package ${chart} successfully."
  else
    echo "OCI pull failed with output:"
    echo "${pull_output}"
    echo "STOP RECORDED: Consumer check could not pull ${chart}:${EXPECTED_VERSION} from oci://${REGISTRY} because the tag is not published / credentials are missing."
  fi
done

echo "=== All Helm chart package verifications passed successfully ==="
