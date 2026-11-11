#!/usr/bin/env bash
# Native runtime verification, or independent exact-set checksum verification.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=tool/teleport-google/release/build-artifacts.sh
source "$SCRIPT_DIR/build-artifacts.sh"
[[ $# == 2 ]] || release_die 'Usage: verify-artifacts.sh --native|--manifest DIRECTORY'
[[ "${GITREF:-}" =~ ^[0-9a-f]{40}$ && "${VERSION:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-psiphon\.[0-9]+$ ]] || release_die 'Explicit version and full source SHA are required.'
OUTPUT_DIR=$(cd "$2" && pwd -P)
if [[ "$1" == --manifest ]]; then
  # Python is a fresh process. Read the bytes, not only the manifest names.
  python3 - "$OUTPUT_DIR" <<'PY'
import hashlib, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
names = sorted([f'{t}-linux-{a}' for a in ('amd64', 'arm64') for t in ('teleport', 'tctl', 'tsh')] + ['tctl-darwin-arm64', 'tsh-darwin-arm64'])
assert sorted(p.name for p in root.iterdir()) == sorted(names + ['SHA256SUMS']), 'Unexpected artifact file set'
lines = (root / 'SHA256SUMS').read_text().splitlines()
assert len(lines) == 8, 'Manifest must have eight entries'
for name, line in zip(names, lines):
    assert re.fullmatch(r'[0-9a-f]{64}  ' + re.escape(name), line), 'Manifest order or entry mismatch'
    path = root / name
    assert path.is_file() and not path.is_symlink(), 'Artifact must be a regular file'
    assert hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() == line[:64], 'Artifact checksum mismatch'
print('Independent exact-set checksum verification passed (8 files).')
PY
  exit 0
fi
[[ "$1" == --native ]] || release_die 'Unknown verification mode.'
scratch=$(mktemp -d "$(dirname "$OUTPUT_DIR")/.runtime-check.XXXXXX")
image_id=''
container_id=''
cleanup() {
  if [[ -n "$container_id" ]]; then docker rm -f "$container_id" >/dev/null; fi
  if [[ -n "$image_id" ]]; then docker image rm "$image_id" >/dev/null; fi
  rm -rf "$scratch"
}
trap cleanup EXIT
mkdir "$scratch/home" "$scratch/tmp"
if [[ "$(uname -s)" == Darwin ]]; then
  [[ "$(uname -m)" == arm64 ]] || release_die 'A native Darwin arm64 host is required.'
  platform=darwin-arm64
  tools=(tctl tsh)
else
  linux_platform
  platform=linux-$ARCH
  tools=(teleport tctl tsh)
fi
for tool in "${tools[@]}"; do
  binary="$tool-$platform"
  [[ -f "$OUTPUT_DIR/$binary" && ! -L "$OUTPUT_DIR/$binary" ]] || release_die 'Missing regular command artifact.'
  chmod 755 "$OUTPUT_DIR/$binary"
  args=(version)
  [[ "$tool" != tsh ]] || args+=(--client)
  if [[ "$platform" == darwin-arm64 ]]; then
    format=$(file "$OUTPUT_DIR/$binary")
    [[ "$format" == *'Mach-O 64-bit executable arm64'* && "$(lipo -archs "$OUTPUT_DIR/$binary")" == arm64 ]] || release_die 'Mach-O architecture mismatch.'
    deps=$(otool -L "$OUTPUT_DIR/$binary")
    printf '%s\n%s\n' "$format" "$deps" >> "$OUTPUT_DIR/PROVENANCE.txt"
    # Only system frameworks and system libraries are valid runtime dependencies.
    while IFS= read -r dep; do
      [[ -z "$dep" || "$dep" == /usr/lib/* || "$dep" == /System/Library/* ]] || release_die 'Non-system Darwin dependency.'
    done < <(printf '%s\n' "$deps" | tail -n +2 | awk '{print $1}')
    result=$(env -i HOME="$scratch/home" TMPDIR="$scratch/tmp" PATH=/usr/bin:/bin:/usr/sbin:/sbin "$OUTPUT_DIR/$binary" "${args[@]}")
  else
    header=$(readelf -h "$OUTPUT_DIR/$binary")
    machine='Advanced Micro Devices X86-64'
    [[ "$ARCH" != arm64 ]] || machine=AArch64
    [[ "$header" == *ELF64* && "$header" == *"$machine"* ]] || release_die 'ELF architecture mismatch.'
    program=$(readelf -l "$OUTPUT_DIR/$binary")
    dynamic=$(readelf -d "$OUTPUT_DIR/$binary")
    if [[ "$program" == *INTERP* || "$dynamic" == *NEEDED* ]]; then
      printf '%s\n%s\n' "$program" "$dynamic" >&2
      release_die 'Measured dynamic dependency. Static release gate failed. No fallback is allowed.'
    fi
    mkdir "$scratch/context"
    cp "$OUTPUT_DIR/$binary" "$scratch/context/binary"
    printf 'FROM scratch\nCOPY binary /binary\nENTRYPOINT ["/binary"]\n' > "$scratch/context/Dockerfile"
    docker build --platform "linux/$ARCH" --iidfile "$scratch/iid" "$scratch/context"
    image_id=$(cat "$scratch/iid")
    container_id=$(docker create --network none --read-only --cap-drop ALL --security-opt no-new-privileges "$image_id" "${args[@]}")
    result=$(docker start -a "$container_id")
    [[ "$(docker inspect --format '{{.State.ExitCode}}' "$container_id")" == 0 ]] || release_die 'Scratch runtime failed.'
    docker rm "$container_id"; container_id=''
    docker image rm "$image_id"; image_id=''
    rm -rf "$scratch/context" "$scratch/iid"
  fi
  [[ " $result " == *" v$VERSION "* && " $result " == *" git:$GITREF "* ]] || release_die 'Runtime version or full source revision mismatch.'
  printf '%s\n%s\n' "$binary" "$result" >> "$OUTPUT_DIR/PROVENANCE.txt"
done
echo 'Native architecture, linkage, runtime and metadata gates passed.'
