#!/usr/bin/env bash
# Usage: build-darwin-arm64.sh PRISTINE_SOURCE NEW_OUTPUT_DIRECTORY
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=tool/teleport-google/release/build-artifacts.sh
source "$SCRIPT_DIR/build-artifacts.sh"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || release_die 'A native Darwin arm64 host is required.'
release_init "$@"
export GOTOOLCHAIN=local GOENV=off CGO_ENABLED=1 GOOS=darwin GOARCH=arm64
export GOFLAGS=-buildvcs=false GOMAXPROCS=2
[[ "$(go env GOVERSION)" == go1.26.5 && "$(go env GOHOSTOS)" == darwin &&
   "$(go env GOHOSTARCH)" == arm64 ]] || release_die 'Native Go 1.26.5 is required.'
scratch=$(mktemp -d "$(dirname "$OUTPUT_DIR")/.darwin-build.XXXXXX")
cleanup() { chmod -R u+w "$scratch"; rm -rf "$scratch"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$scratch/source" "$scratch/artifacts" "$scratch/tmp"
git -C "$SOURCE_DIR" archive "$GITREF" | tar -x -C "$scratch/source"
export GOCACHE="$scratch/cache" GOMODCACHE="$scratch/modules" GOTMPDIR="$scratch/tmp" TMPDIR="$scratch/tmp"
{
  release_provenance
  uname -srm
  sw_vers
  go version
  go env CGO_ENABLED GOOS GOARCH GOFLAGS GOTOOLCHAIN
  xcodebuild -version
  xcrun --sdk macosx --show-sdk-version
  xcrun --sdk macosx --show-sdk-path
  xcrun --sdk macosx clang --version
} > "$scratch/artifacts/PROVENANCE.txt"
go -C "$scratch/source/build.assets/tooling" run -mod=readonly ./cmd/apiversion "$VERSION" > "$scratch/source/api/version.go"
for tool in tctl tsh; do
  go -C "$scratch/source" build -mod=readonly -p 2 -trimpath \
    -ldflags "-w -s -X github.com/gravitational/teleport.Gitref=${GITREF}" \
    -o "$scratch/artifacts/$tool-darwin-arm64" "./tool/$tool"
done
bash "$SCRIPT_DIR/verify-artifacts.sh" --native "$scratch/artifacts"
release_source "$SOURCE_DIR"
mv "$scratch/artifacts" "$OUTPUT_DIR"
