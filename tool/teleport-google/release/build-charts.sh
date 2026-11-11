#!/usr/bin/env bash
# Package and verify charts offline. Never upgrade dependencies or contact a cluster.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=tool/teleport-google/release/build-artifacts.sh
source "$SCRIPT_DIR/build-artifacts.sh"
release_init "$@"
scratch=$(mktemp -d "$(dirname "$OUTPUT_DIR")/.chart-build.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
mkdir "$scratch/artifacts" "$scratch/source"
git -C "$SOURCE_DIR" archive "$GITREF" examples/chart | tar -x -C "$scratch/source"
for chart in teleport-cluster teleport-kube-agent teleport-operator; do
  path="$scratch/source/examples/chart/$chart"
  if [[ "$chart" == teleport-operator ]]; then path="$scratch/source/examples/chart/teleport-cluster/charts/$chart"; fi
  helm package "$path" -d "$scratch/artifacts"
  package="$scratch/artifacts/$chart-$VERSION.tgz"
  [[ -f "$package" ]] || release_die 'Chart package version mismatch.'
  helm show chart "$package" > "$scratch/metadata"
  python3 - "$scratch/metadata" "$chart" <<'PY'
import os, sys, yaml
x = yaml.safe_load(open(sys.argv[1]))
assert x['name'] == sys.argv[2] and x['version'] == x['appVersion'] == os.environ['VERSION'], 'Chart metadata mismatch'
PY
  mkdir "$scratch/unpacked"
  tar -xzf "$package" -C "$scratch/unpacked"
  # All packaged files must match the clean source, including nested chart metadata.
  python3 - "$path" "$scratch/unpacked/$chart" <<'PY'
import os, pathlib, subprocess, sys, yaml
src, pkg = map(pathlib.Path, sys.argv[1:])
for p in pkg.rglob('*'):
    assert not p.is_symlink(), 'Chart symlink is not allowed'
    if not p.is_file(): continue
    q = src / p.relative_to(pkg)
    assert q.is_file(), 'Packaged file has no source'
    if p.name == 'Chart.yaml':
        a = yaml.safe_load(p.read_text())
        b = yaml.safe_load(subprocess.check_output(['helm', 'show', 'chart', str(q.parent)], text=True))
        assert a == b, 'Packaged metadata differs from source'
        assert a['version'] == os.environ['VERSION'], 'Nested chart version mismatch'
    else:
        assert p.read_bytes() == q.read_bytes(), 'Packaged content differs from source'
PY
  values=()
  case "$chart" in
    teleport-cluster) values=(--set clusterName=teleport.example.com --set operator.installCRDs=never) ;;
    teleport-kube-agent) values=(--set proxyAddr=teleport.example.com:443 --set authToken=offline-fixture --set kubeClusterName=offline) ;;
    teleport-operator) values=(--set enabled=false --set installCRDs=always) ;;
  esac
  helm template verify "$path" "${values[@]}" > "$scratch/source.yaml"
  helm template verify "$package" "${values[@]}" > "$scratch/package.yaml"
  cmp "$scratch/source.yaml" "$scratch/package.yaml"
  python3 - "$scratch/package.yaml" "$chart" <<'PY'
import sys, yaml
resources = [x for x in yaml.safe_load_all(open(sys.argv[1])) if x]
crds = [x for x in resources if x['kind'] == 'CustomResourceDefinition']
if sys.argv[2] == 'teleport-operator':
    assert len(crds) == len(resources) == 31, 'Standalone CRD ownership mismatch'
else:
    assert resources and not crds, 'Consumer chart must not own CRDs'
PY
  rm -rf "$scratch/unpacked"
done
release_provenance > "$scratch/artifacts/PROVENANCE.txt"
printf 'Source repository: https://github.com/Psiphon-Inc/psiphon-access\n' >> "$scratch/artifacts/PROVENANCE.txt"
release_source "$SOURCE_DIR"
mv "$scratch/artifacts" "$OUTPUT_DIR"
echo 'Chart metadata, source content, offline rendering and CRD gates passed.'
