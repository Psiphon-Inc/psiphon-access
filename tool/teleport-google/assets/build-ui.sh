#!/usr/bin/env bash
#
# Psiphon Access
# Copyright (C) 2026  Psiphon Inc.
#
# Build the web UI for this fork.
#
# Use this instead of calling `make ensure-webassets` directly. It does two
# things the upstream target cannot: it refreshes the build stamp the login page
# reads, and it works around four NixOS problems without modifying the
# repository or the shared devShell.
#
# Run it inside the devShell with an unwrapped clang and rsvg-convert available:
#
#   nix develop path:$HOME/.facets/nix --command \
#     nix shell nixpkgs#llvmPackages.clang-unwrapped nixpkgs#llvmPackages.bintools \
#                nixpkgs#librsvg \
#     --command tool/teleport-google/assets/build-ui.sh
#
# librsvg supplies rsvg-convert, which derive-logo.py --favicons needs to raster
# the favicon from the brand SVG. Leave it out and the script stops before vite
# runs.
#
# If the devShell itself will not evaluate, for example because an unrelated
# package in it is rebuilding, direnv's last good environment can stand in for
# the `nix develop` half:
#
#   source ~/.direnv/flake-profile-*.rc
#
# That carries the same cargo, rustc and binaryen. Use it only to get unblocked,
# because it is whatever was cached, not what the flake says today.
#
# WHY THE STAMP IS REFRESHED HERE, and not left to the committed file.
# accessBuild.ts is generated, and it carries the revision the AGPL section 13
# offer on the login page points at. A committed value goes stale the moment the
# next commit lands, and a stale value is worse than no value: the page would
# offer Corresponding Source for a build nobody is running. Regenerating on every
# build is what keeps the offer true, so this step is not optional and must run
# before vite reads the module.
#
# THE FOUR NIXOS PROBLEMS, in the order they appear:
#   1. build-webassets-if-changed.sh has a #!/bin/bash shebang and NixOS has no
#      /bin/bash, so it is invoked through bash explicitly. The arguments are
#      copied verbatim from the ensure-webassets target.
#   2. The ironrdp crate pulls in zstd-sys, which compiles C for wasm32. cc-rs
#      otherwise falls back to gcc, which cannot emit wasm. Only the underscored
#      spelling of the target variables works, because a shell variable name
#      cannot contain a dash.
#   3. The NixOS compiler wrapper injects -fzero-call-used-regs=used-gpr, which
#      clang refuses for wasm32.
#   4. The same wrapper injects host glibc include paths into a wasm compile,
#      which fails on gnu/stubs-32.h. An UNWRAPPED clang injects neither, which
#      is why the invocation above asks for clang-unwrapped rather than clang.
set -euo pipefail

cd "$(dirname "$0")/../../.."
repo="$PWD"

echo "=== toolchain ==="
missing=0
for t in node pnpm cargo rustc wasm-opt clang llvm-ar; do
  path="$(command -v "$t" || true)"
  printf '%-10s %s\n' "$t" "${path:-MISSING}"
  [ -n "$path" ] || missing=1
done
if [ "$missing" -ne 0 ]; then
  echo "A tool above is missing. Read the header of this script for the invocation." >&2
  exit 1
fi

echo
echo "=== refreshing the build stamp ==="
python3 tool/teleport-google/assets/stamp-build.py

echo
echo "=== staging brand assets ==="
python3 tool/teleport-google/assets/derive-logo.py --favicons

echo
echo "=== building ==="
# cc-rs reads the target-suffixed variables; see note 2 above.
export CC_wasm32_unknown_unknown=clang
export AR_wasm32_unknown_unknown=llvm-ar
# See notes 3 and 4 above.
export NIX_HARDENING_ENABLE=""

time MAKE=make bash ./build.assets/build-webassets-if-changed.sh \
  OSS webassets/oss-sha build-ui web

echo
echo "=== done ==="
echo "Stamped revision:"
grep -oE "ACCESS_(REVISION|BUILD) = '[^']+'" web/packages/teleport/src/accessBuild.ts | sed 's/^/  /'
