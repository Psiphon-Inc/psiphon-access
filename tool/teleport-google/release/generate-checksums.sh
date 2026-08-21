#!/usr/bin/env bash
# Generate SHA256SUMS file for a given set of input files.
# The generator takes its file set as input so later architectures can extend it.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <file1> [file2 ...]" >&2
  exit 1
fi

OUT_FILE="${SHA256SUMS_FILE:-SHA256SUMS}"

TMP_FILE=$(mktemp)
trap 'rm -f "${TMP_FILE}"' EXIT

for file in "$@"; do
  if [ ! -f "${file}" ]; then
    echo "Error: file '${file}' does not exist" >&2
    exit 1
  fi
  dir=$(dirname "${file}")
  base=$(basename "${file}")
  (cd "${dir}" && sha256sum "${base}") >> "${TMP_FILE}"
done

sort -k2,2 "${TMP_FILE}" > "${OUT_FILE}"
echo "Generated ${OUT_FILE} covering $# files:"
cat "${OUT_FILE}"
