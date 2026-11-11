#!/usr/bin/env bash
# Publish only a complete, verified candidate. Reset is limited to the prelaunch .2 release.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=tool/teleport-google/release/build-artifacts.sh
source "$SCRIPT_DIR/build-artifacts.sh"
[[ $# == 2 ]] || release_die 'Usage: publish-charts.sh --check-inputs|--preflight|--publish CANDIDATE'
[[ "$1" == --check-inputs || "$1" == --preflight || "$1" == --publish ]] || release_die 'Unknown publication mode.'
if [[ "$1" != --check-inputs ]]; then
  [[ "$(git -C "$TOOLING_ROOT" rev-parse HEAD)" == "${TOOLING_SHA:-}" &&
      -z "$(git -C "$TOOLING_ROOT" status --porcelain --untracked-files=all)" ]] || release_die 'Publishing tooling must be clean and match its full SHA.'
  release_source "${SOURCE_DIR:?SOURCE_DIR is required}"
fi
# Validate reset consent before any credential or network access.
python3 - "$1" "$2" "$SCRIPT_DIR" <<'PY'
import base64, fnmatch, hashlib, json, os, pathlib, re, subprocess, sys, tempfile, urllib.error, urllib.parse, urllib.request

def need(ok, message):
    if not ok: raise SystemExit(message)

def sha(text): return bool(re.fullmatch('[0-9a-f]{40}', text))
def digest(text): return bool(re.fullmatch('sha256:[0-9a-f]{64}', text))
def filehash(path):
    with path.open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()

def command(args, **kwargs):
    # Do not expose registry or API error bodies. Never pass a token as an argument.
    p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    need(p.returncode == 0, 'Publication command failed: ' + args[0])
    return p.stdout

mode, root = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
version, source, tooling = (os.environ.get(k, '') for k in ('VERSION', 'GITREF', 'TOOLING_SHA'))
need(sha(source) and sha(tooling), 'Full source and tooling SHAs are required.')
need(re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+-psiphon\.[0-9]+', version), 'Invalid release version.')
reset = os.environ.get('RESET_EXISTING', 'false')
need(reset in ('true', 'false'), 'Invalid reset mode.')
baseline = None
if reset == 'true':
    need(version == '19.0.0-psiphon.2', 'Reset is allowed only for v19.0.0-psiphon.2.')
    try: baseline = json.loads(os.environ.get('EXPECTED_BASELINE', ''))
    except ValueError: raise SystemExit('An explicit reset baseline is required.')
    need(set(baseline) == {'old_tag_object', 'old_source', 'release_id', 'assets', 'images', 'charts', 'protection_sha256', 'recovery_sha256', 'candidate_source', 'candidate_tooling'}, 'Incomplete reset baseline.')
    need(sha(baseline['old_tag_object']) and sha(baseline['old_source']), 'Invalid old tag identity.')
    need(baseline['candidate_source'] == source and baseline['candidate_tooling'] == tooling, 'Reset candidate identity mismatch.')
    for field in ('protection_sha256', 'recovery_sha256'):
        need(re.fullmatch('[0-9a-f]{64}', baseline[field]), 'Missing protection or recovery identity.')
    need(os.environ.get('RECOVERY_CONFIRMATION') == 'local-snapshot-sha256:' + baseline['recovery_sha256'], 'Confirm the local recovery snapshot before reset.')
receipt = json.loads((root / 'candidate.json').read_text())
need((receipt['version'], receipt['source'], receipt['tooling']) == (version, source, tooling), 'Candidate metadata mismatch.')
bins = sorted([f'{t}-linux-{a}' for a in ('amd64', 'arm64') for t in ('teleport', 'tctl', 'tsh')] + ['tctl-darwin-arm64', 'tsh-darwin-arm64'])
charts = ['teleport-cluster', 'teleport-kube-agent', 'teleport-operator']
assets = [root / 'commands' / n for n in bins + ['SHA256SUMS']] + [root / 'charts' / f'{c}-{version}.tgz' for c in charts]
need(len(assets) == 12 and all(p.is_file() and not p.is_symlink() for p in assets), 'The complete 12-asset set is required.')
required = {'commands/' + n for n in bins + ['SHA256SUMS']} | {'charts/' + c + '-' + version + '.tgz' for c in charts} | {'charts/PROVENANCE.txt', 'images/PROVENANCE.txt'} | {'evidence/' + p + '.txt' for p in ('linux-amd64', 'linux-arm64', 'darwin-arm64')} | {'images/' + k + ext for k in ('auth', 'operator') for ext in ('.tar', '.inspect.json', '.buildinfo.txt', '.Dockerfile')}
need(set(receipt['files']) == required, 'Complete image, chart and native evidence is required.')
for name in ['charts/PROVENANCE.txt', 'images/PROVENANCE.txt'] + ['evidence/' + p + '.txt' for p in ('linux-amd64', 'linux-arm64', 'darwin-arm64')]:
    need((root / name).read_text().splitlines()[:3] == ['Version: ' + version, 'Source: ' + source, 'Tooling: ' + tooling], 'Staged provenance mismatch.')
for kind in ('auth', 'operator'):
    image = json.loads((root / 'images' / (kind + '.inspect.json')).read_text())[0]
    labels = image['Config']['Labels']
    need(image['Os'] == 'linux' and image['Architecture'] == 'amd64', 'Staged image platform mismatch.')
    need(labels['org.opencontainers.image.version'] == version and labels['org.opencontainers.image.revision'] == source and labels['org.psiphon.tooling.revision'] == tooling, 'Staged image metadata mismatch.')
    need(labels['org.opencontainers.image.source'] == 'https://github.com/Psiphon-Inc/psiphon-access' and labels['org.opencontainers.image.licenses'] == 'AGPL-3.0', 'Staged image source or license mismatch.')
    need('github.com/gravitational/teleport.Gitref=' + source in (root / 'images' / (kind + '.buildinfo.txt')).read_text(), 'Staged image build revision mismatch.')
actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
need(not any(p.is_symlink() for p in root.rglob('*')), 'Candidate symlinks are not allowed.')
need(actual == set(receipt['files']) | {'candidate.json'}, 'Candidate file set changed.')
for name, expected in receipt['files'].items():
    need(not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts, 'Invalid candidate path.')
    need(filehash(root / name) == expected, 'Staged output checksum mismatch.')
command(['bash', str(pathlib.Path(sys.argv[3]) / 'verify-artifacts.sh'), '--manifest', str(root / 'commands')])
if mode == '--check-inputs':
    print('Candidate identities, complete assets and staged byte hashes passed.')
    sys.exit(0)

need(os.environ.get('GITHUB_REPOSITORY') == 'Psiphon-Inc/psiphon-access', 'Publication repository mismatch.')
token = os.environ.get('GH_TOKEN', '')
need(bool(token), 'A bounded publication token is required.')
repo = 'https://api.github.com/repos/Psiphon-Inc/psiphon-access'
os.environ['GH_REPO'] = 'Psiphon-Inc/psiphon-access'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SystemExit('Authenticated identity reads must not redirect.')

reader = urllib.request.build_opener(NoRedirect())

def request(url, headers=None, absent=False):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with reader.open(req, timeout=30) as response:
            body = response.read(4 * 1024 * 1024 + 1)
            need(len(body) <= 4 * 1024 * 1024, 'Remote response exceeded the read bound.')
            return response.status, dict(response.headers), body
    except urllib.error.HTTPError as e:
        if absent and e.code == 404:
            return e.code, {}, e.read(65536)
        raise SystemExit('Remote identity or permission read failed.')
    except (OSError, ValueError): raise SystemExit('Remote identity read failed.')

def github(path, absent=False):
    status, _, body = request(repo + path, {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}, absent)
    return None if status == 404 else json.loads(body)

def registry(name):
    scope = urllib.parse.urlencode({'service': 'ghcr.io', 'scope': 'repository:psiphon-inc/' + name + ':pull'})
    basic = base64.b64encode(('token:' + token).encode()).decode()
    _, _, body = request('https://ghcr.io/token?' + scope, {'Authorization': 'Basic ' + basic})
    access = json.loads(body)['token']
    status, headers, body = request('https://ghcr.io/v2/psiphon-inc/' + name + '/manifests/' + version,
        {'Authorization': 'Bearer ' + access, 'Accept': 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json'}, True)
    if status == 404:
        need([x['code'] for x in json.loads(body).get('errors', [])] == ['MANIFEST_UNKNOWN'], 'Registry absence was not proven.')
        return None
    value = next((v for k, v in headers.items() if k.lower() == 'docker-content-digest'), '')
    need(digest(value), 'Registry digest is missing.')
    return value

def preflight():
    tag = github('/git/ref/tags/v' + version)
    obj = tag['object']
    if obj['type'] == 'tag': obj = github('/git/tags/' + obj['sha'])['object']
    need(obj['type'] == 'commit' and obj['sha'] == source, 'Human-controlled release tag must point to the candidate source.')
    release = github('/releases/tags/v' + version, True)
    if reset == 'false':
        need(release is None, 'Refusing to replace an existing GitHub release.')
    else:
        old = github('/git/tags/' + baseline['old_tag_object'])
        need(old['tag'] == 'v' + version and old['object']['sha'] == baseline['old_source'] and old['object']['type'] == 'commit', 'Old tag baseline mismatch.')
        need(release is not None and release['id'] == baseline['release_id'] and not release['immutable'], 'Old release identity or mutability mismatch.')
        previous = github('/releases/' + str(release['id']) + '/assets?per_page=100')
        need(len(previous) < 100, 'Release asset read exceeded the bound.')
        observed = {x['name']: {k: x.get(k) for k in ('id', 'size', 'updated_at', 'digest')} for x in previous}
        old_names = {f'{t}-linux-amd64' for t in ('teleport', 'tctl', 'tsh')} | {'SHA256SUMS'} | {f'{c}-{version}.tgz' for c in charts}
        need(set(observed) == old_names and observed == baseline['assets'], 'Old release asset baseline mismatch.')
        rules = github('/rulesets?includes_parents=true&per_page=100')
        need(len(rules) < 100 and rules, 'Protection read is missing or exceeds the bound.')
        details = [github('/rulesets/' + str(x['id']) + '?includes_parents=true') for x in rules]
        fingerprint = hashlib.sha256(json.dumps(details, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        need(fingerprint == baseline['protection_sha256'], 'Restored protection fingerprint mismatch.')
        protected = set()
        for rule in details:
            if rule['target'] != 'tag' or rule['enforcement'] != 'active': continue
            need('bypass_actors' in rule, 'Protection bypass visibility is required.')
            condition = rule.get('conditions', {}).get('ref_name', {})
            ref = 'refs/tags/v' + version
            include = any(p == '~ALL' or fnmatch.fnmatchcase(ref, p) for p in condition.get('include', []))
            exclude = any(p == '~ALL' or fnmatch.fnmatchcase(ref, p) for p in condition.get('exclude', []))
            if include and not exclude and not rule.get('bypass_actors'):
                protected.update(x['type'] for x in rule['rules'])
        need({'deletion', 'update'} <= protected, 'Tag update and deletion protection must be restored without bypass actors.')
    names = {'images': ['psiphon-access', 'teleport-operator'], 'charts': ['charts/' + c for c in charts]}
    for group, repositories in names.items():
        if baseline:
            need(set(baseline[group]) == set(repositories), 'Incomplete registry baseline.')
        for name in repositories:
            current = registry(name)
            if reset == 'false': need(current is None, 'Refusing to replace an existing registry version.')
            else: need(digest(baseline[group][name]) and current == baseline[group][name], 'Old registry identity mismatch.')
    return release

release = preflight()
if mode == '--preflight':
    print('Publication preconditions passed. No writes performed.')
    sys.exit(0)
# All preconditions passed before the first external write. No tag or setting mutation occurs here.
command(['docker', 'login', 'ghcr.io', '--username', os.environ['GITHUB_ACTOR'], '--password-stdin'], input=token.encode())
command(['helm', 'registry', 'login', 'ghcr.io', '--username', os.environ['GITHUB_ACTOR'], '--password-stdin'], input=token.encode())
try:
    published = {}
    for kind, name in [('auth', 'psiphon-access'), ('operator', 'teleport-operator')]:
        expected = json.loads((root / 'images' / (kind + '.inspect.json')).read_text())[0]
        image_id = expected['Id']
        need(re.fullmatch('sha256:[0-9a-f]{64}', image_id), 'Invalid staged image identity.')
        command(['docker', 'load', '-i', str(root / 'images' / (kind + '.tar'))])
        observed = json.loads(command(['docker', 'inspect', image_id]))[0]
        need(observed['Config'] == expected['Config'] and observed['Architecture'] == 'amd64' and observed['Os'] == 'linux', 'Loaded image identity mismatch.')
        target = 'ghcr.io/psiphon-inc/' + name + ':' + version
        command(['docker', 'tag', image_id, target])
        command(['docker', 'push', target])
        published[name] = registry(name)
        local = json.loads(command(['docker', 'inspect', target]))[0]['RepoDigests']
        need('ghcr.io/psiphon-inc/' + name + '@' + published[name] in local, 'Published image digest mismatch.')
        command(['docker', 'image', 'rm', target])
    with tempfile.TemporaryDirectory(dir=root.parent) as pull:
        for chart in charts:
            path = root / 'charts' / f'{chart}-{version}.tgz'
            command(['helm', 'push', str(path), 'oci://ghcr.io/psiphon-inc/charts'])
            command(['helm', 'pull', 'oci://ghcr.io/psiphon-inc/charts/' + chart, '--version', version, '--destination', pull])
            need(filehash(pathlib.Path(pull) / path.name) == filehash(path), 'Published chart payload mismatch.')
            published['charts/' + chart] = registry('charts/' + chart)
    if reset == 'false':
        command(['gh', 'release', 'create', 'v' + version, '--verify-tag', '--title', 'Psiphon Access ' + version, '--notes', 'Source: https://github.com/Psiphon-Inc/psiphon-access/tree/' + source] + [str(p) for p in assets])
    else:
        command(['gh', 'release', 'upload', 'v' + version, '--clobber'] + [str(p) for p in assets])
        command(['gh', 'release', 'edit', 'v' + version, '--notes', 'Source: https://github.com/Psiphon-Inc/psiphon-access/tree/' + source])
    final = github('/releases/tags/v' + version)
    remote = github('/releases/' + str(final['id']) + '/assets?per_page=100')
    need({x['name']: x['size'] for x in remote} == {p.name: p.stat().st_size for p in assets}, 'Published release asset set mismatch.')
    for entry in remote:
        path = next(p for p in assets if p.name == entry['name'])
        need(entry.get('digest') == 'sha256:' + filehash(path), 'Published release asset digest mismatch.')
    (root.parent / 'published-identities.json').write_text(json.dumps(published, sort_keys=True) + '\n')
    print('Publication and consumer identity checks passed.')
finally:
    command(['docker', 'logout', 'ghcr.io'])
    command(['helm', 'registry', 'logout', 'ghcr.io'])
PY
