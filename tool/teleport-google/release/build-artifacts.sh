#!/usr/bin/env bash
# Build only from explicit, clean source and tooling revisions.
set -euo pipefail
export PYTHONOPTIMIZE=0
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
TOOLING_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)

release_die() { echo "$*" >&2; exit 1; }
release_source() {
  [[ "${GITREF:-}" =~ ^[0-9a-f]{40}$ ]] || release_die 'GITREF must be a full source SHA.'
  [[ "$(git -C "$1" rev-parse HEAD)" == "$GITREF" ]] || release_die 'Source revision mismatch.'
  [[ -z "$(git -C "$1" status --porcelain --untracked-files=all)" ]] || release_die 'Source checkout is not clean.'
}
release_init() {
  [[ $# == 2 ]] || release_die 'Supply SOURCE and NEW_OUTPUT_DIRECTORY.'
  VERSION=${VERSION:-19.0.0-psiphon.2}
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-psiphon\.[0-9]+$ ]] || release_die 'Invalid release version.'
  [[ "${TOOLING_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || release_die 'TOOLING_SHA must be a full SHA.'
  [[ "$(git -C "$TOOLING_ROOT" rev-parse HEAD)" == "$TOOLING_SHA" &&
      -z "$(git -C "$TOOLING_ROOT" status --porcelain --untracked-files=all)" ]] || release_die 'Tooling revision is not clean or does not match.'
  SOURCE_DIR=$(cd "$1" && pwd -P)
  release_source "$SOURCE_DIR"
  OUTPUT_DIR=$(cd "$(dirname "$2")" && pwd -P)/$(basename "$2")
  case "$OUTPUT_DIR/" in
    "$SOURCE_DIR/"*|"$TOOLING_ROOT/"*) release_die 'Output must be outside both checkouts.' ;;
  esac
  [[ ! -e "$OUTPUT_DIR" && ! -L "$OUTPUT_DIR" ]] || release_die 'Output must not exist.'
  export VERSION GITREF TOOLING_SHA
}
release_provenance() {
  printf 'Version: %s\nSource: %s\nTooling: %s\n' "$VERSION" "$GITREF" "$TOOLING_SHA"
  printf 'Runner: %s %s %s %s\n' "${RUNNER_OS:-unknown}" "${RUNNER_ARCH:-unknown}" "${ImageOS:-unknown}" "${ImageVersion:-unknown}"
}
linux_platform() {
  [[ "$(uname -s)" == Linux ]] || release_die 'A native Linux runner is required.'
  case "$(uname -m)" in x86_64) NATIVE_ARCH=amd64 ;; aarch64|arm64) NATIVE_ARCH=arm64 ;; *) release_die 'Unsupported native architecture.' ;; esac
  [[ "${ARCH:-$NATIVE_ARCH}" == "$NATIVE_ARCH" ]] || release_die 'Cross compilation and emulation are not allowed.'
  ARCH=$NATIVE_ARCH
  case "$ARCH" in
    amd64) GO_IMAGE=docker.io/library/golang@sha256:0d327c83532d3cdeeeebab56ce85962bf09cb89545355b10207c7771b0c3713f ;;
    arm64) GO_IMAGE=docker.io/library/golang@sha256:b1a0cc29a7e13e0595e21087eeb930dc494976b18ba68279bf52c665f3170aa0 ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ "${1:-}" == --check-source ]]; then
    [[ $# == 2 ]] || release_die 'Supply --check-source SOURCE.'
    release_source "$2"
    exit 0
  fi
  mode=--linux
  if [[ "${1:-}" == --images ]]; then mode=$1; shift; fi
  release_init "$@"
  linux_platform
  scratch=$(mktemp -d "$(dirname "$OUTPUT_DIR")/.linux-build.XXXXXX")
  trap 'rm -rf "$scratch"' EXIT
  mkdir "$scratch/artifacts"
  if [[ "$mode" == --images ]]; then
    [[ "$ARCH" == amd64 ]] || release_die 'Runtime images remain Linux amd64 only.'
    image_id=''; container_id=''
    # shellcheck disable=SC2329 # Invoked by the EXIT trap.
    cleanup_images() {
      if [[ -n "$container_id" ]]; then docker rm -f "$container_id" >/dev/null; fi
      if [[ -n "$image_id" ]]; then docker image rm "$image_id" >/dev/null; fi
      rm -rf "$scratch"
    }
    trap cleanup_images EXIT
    for kind in auth operator; do
      recipe=tool/teleport-google/Dockerfile
      binary=/usr/local/bin/teleport
      notice=THIRD_PARTY_NOTICES
      if [[ "$kind" == operator ]]; then
        recipe+=.operator; binary=/teleport-operator; notice=THIRD_PARTY_NOTICES_OPERATOR
      fi
      # Limit compiler parallelism in a temporary recipe. Product source is unchanged.
      python3 - "$SOURCE_DIR/$recipe" "$scratch/Dockerfile" <<'PYCODE'
import pathlib, sys
text = pathlib.Path(sys.argv[1]).read_text()
assert text.count('ENV GOFLAGS=-buildvcs=false') == 1
text = text.replace('ENV GOFLAGS=-buildvcs=false', 'ENV GOFLAGS="-buildvcs=false -p=2" GOMAXPROCS=2 GOTOOLCHAIN=local')
# Omit -trimpath only here to retain linker flags in build metadata for the Gitref check.
assert text.count('go build -trimpath') == 1
text = text.replace('go build -trimpath', 'go build')
pathlib.Path(sys.argv[2]).write_text(text)
PYCODE
      docker buildx build --platform linux/amd64 --load --provenance=false \
        --iidfile "$scratch/iid" -f "$scratch/Dockerfile" \
        --label org.opencontainers.image.source=https://github.com/Psiphon-Inc/psiphon-access \
        --label "org.psiphon.tooling.revision=$TOOLING_SHA" \
        --build-arg "VERSION=$VERSION" --build-arg "GITREF=$GITREF" "$SOURCE_DIR"
      image_id=$(cat "$scratch/iid")
      docker image inspect "$image_id" > "$scratch/inspect.json"
      python3 - "$scratch/inspect.json" <<'PYCODE'
import json, os, sys
x = json.load(open(sys.argv[1]))[0]
assert x['Os'] == 'linux' and x['Architecture'] == 'amd64', 'Image platform mismatch'
l = x['Config']['Labels']
assert l['org.opencontainers.image.version'] == os.environ['VERSION'], 'Image version mismatch'
assert l['org.opencontainers.image.revision'] == os.environ['GITREF'], 'Image source mismatch'
assert l['org.opencontainers.image.source'] == 'https://github.com/Psiphon-Inc/psiphon-access'
assert l['org.opencontainers.image.licenses'] == 'AGPL-3.0'
assert l['org.psiphon.tooling.revision'] == os.environ['TOOLING_SHA']
PYCODE
      container_id=$(docker create --network none --entrypoint "$binary" "$image_id")
      mkdir "$scratch/files"
      docker cp "$container_id:$binary" "$scratch/files/binary"
      docker cp "$container_id:/usr/local/share/licenses/teleport/LICENSE" "$scratch/files/LICENSE"
      cmp "$SOURCE_DIR/LICENSE" "$scratch/files/LICENSE"
      docker cp "$container_id:/usr/local/share/licenses/teleport/THIRD_PARTY_NOTICES" "$scratch/files/$notice"
      cmp "$SOURCE_DIR/$notice" "$scratch/files/$notice"
      docker rm "$container_id"; container_id=''
      docker run --rm --network none -v "$scratch/files:/check:ro" "$GO_IMAGE" go version -m /check/binary > "$scratch/buildinfo"
      grep -F -- "github.com/gravitational/teleport.Gitref=$GITREF" "$scratch/buildinfo"
      if [[ "$kind" == auth ]]; then
        result=$(docker run --rm --network none --read-only --entrypoint "$binary" "$image_id" version)
        [[ " $result " == *" v$VERSION "* && " $result " == *" git:$GITREF "* ]] || release_die 'Image runtime metadata mismatch.'
      else
        docker run --rm --network none --read-only --entrypoint "$binary" "$image_id" -h > "$scratch/help" 2>&1
        grep -F 'Usage' "$scratch/help"
      fi
      docker save "$image_id" -o "$scratch/artifacts/$kind.tar"
      cp "$scratch/inspect.json" "$scratch/artifacts/$kind.inspect.json"
      cp "$scratch/buildinfo" "$scratch/artifacts/$kind.buildinfo.txt"
      cp "$scratch/Dockerfile" "$scratch/artifacts/$kind.Dockerfile"
      docker image rm "$image_id"; image_id=''
      rm -rf "$scratch/files" "$scratch/iid"
    done
    release_provenance > "$scratch/artifacts/PROVENANCE.txt"
    release_source "$SOURCE_DIR"
    mv "$scratch/artifacts" "$OUTPUT_DIR"
    exit 0
  fi
  docker buildx build --platform "linux/$ARCH" --target artifacts \
    --output "type=local,dest=$scratch/artifacts" -f "$SCRIPT_DIR/Dockerfile" \
    --build-arg "VERSION=$VERSION" --build-arg "GITREF=$GITREF" \
    --build-arg "GO_IMAGE=$GO_IMAGE" "$SOURCE_DIR"
  release_provenance > "$scratch/artifacts/PROVENANCE.txt"
  printf 'Builder: %s\n' "$GO_IMAGE" >> "$scratch/artifacts/PROVENANCE.txt"
  ARCH=$ARCH bash "$SCRIPT_DIR/verify-artifacts.sh" --native "$scratch/artifacts"
  release_source "$SOURCE_DIR"
  mv "$scratch/artifacts" "$OUTPUT_DIR"
fi
