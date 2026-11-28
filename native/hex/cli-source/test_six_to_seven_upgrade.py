#!/usr/bin/env python3
"""Exact offline six-file PR15 -> seven-file CLI receipt migration and rollback.

No machine services, external auth, network, or historical receipt rewriting.
The six source files come from the already pinned exact owner archive in this
repository. This is a disposable installation, not actual HEX acceptance.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PR15 = REPO / 'tests' / 'fixtures' / 'cli-launcher-repair-pr15'
LEGACY_SHA = '0f2b444abbe8f7a99c5f4520b1222c568eba6dd1'
MANIFEST_SHA = 'd1615b50e0b9de8a462a5b7606aa32d1c24adeee8d3148e4ac4f743a1655503e'
PR15_FILES = {
    'src/xiio.mjs': '561ca051ad26a41e27d3465191a7e7cf3e3a27c523a6411f632e6a8562bb028b',
    'src/file-edit-cas.mjs': 'f96a15c095ef043d862e6ba77bb2b0ac1dcde90c040c414a68331b4b8e4e88f3',
    'src/runtime-integrity.mjs': 'de15e26e26ad52c1bab3fd3fc7a0a389bec3c8dbe6a06666f51de075a0dd4912',
    'config/service-catalog.json': '8f9c4c8efb77c36242a81fdcf8c821e05a2ce253d320c34ce27f4b67b2a19a88',
    'scripts/service-inventory.mjs': '4711d6603f759607e79cadc1031f8668ef27b393f25b408b9ecd5516ebc18204',
    'scripts/reconcile-service-inventory.mjs': 'eb20d7ef9cc8d50ca7c3cd1af016f76e4c2a7ddea4afb30d47d1695237a6845e',
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def changed(root):
    return {
        str(p.relative_to(root)): (digest(p.read_bytes()), p.stat().st_mode & 0o777)
        for p in sorted(root.rglob('*')) if p.is_file()
    }

def run(args, env, timeout=75):
    return subprocess.run(args, env=env, text=True, capture_output=True, timeout=timeout)

def require_ok(process, label):
    assert process.returncode == 0, label + ': ' + process.stdout + '\n' + process.stderr
    return json.loads(process.stdout)

def main():
    node = shutil.which('node')
    assert node, 'NODE_22_REQUIRED'
    manifest_path = HERE / 'packaged-source.json'
    assert digest(manifest_path.read_bytes()) == MANIFEST_SHA, 'PACKAGED_MANIFEST_PIN_CHANGED'
    manifest = json.loads(manifest_path.read_bytes())
    source_sha = manifest['source_sha']
    assert len(manifest['files']) == 7, 'SEVEN_FILE_SUCCESSOR_REQUIRED'
    assert 'src/runtime-gate.mjs' in manifest['files'], 'RUNTIME_GATE_MISSING'
    assert 'src/runtime-gate.mjs' not in PR15_FILES, 'PR15_PREDECESSOR_UNEXPECTED'
    for relative, expected in PR15_FILES.items():
        assert digest((PR15 / relative).read_bytes()) == expected, 'PR15_SOURCE_DRIFT:' + relative

    platform = require_ok(run([node, '-p', 'JSON.stringify({platform:process.platform,node:process.versions.node})'], os.environ.copy()), 'node platform')
    with tempfile.TemporaryDirectory(prefix='xiio-cli-six-to-seven-') as temp:
        root = Path(temp)
        prefix, bin_dir, home, config = (root / n for n in ('installed', 'bin', 'home', 'config'))
        home.mkdir(); config.mkdir()
        config_file = config / 'settings.json'
        config_file.write_text('{"retain":"user-preferences"}\n')
        legacy_name = LEGACY_SHA[:12] + '-20261128T140000Z-pr15'
        previous = prefix / 'versions' / legacy_name
        previous.mkdir(parents=True)
        for relative in PR15_FILES:
            out = previous / relative
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PR15 / relative, out)
            out.chmod(0o600)
        node_detail = json.loads(run([node, '-p', 'JSON.stringify({platform:process.platform,node:process.versions.node})'], os.environ.copy()).stdout)
        receipt = {
            'schema': 'xiio.cli.install-receipt/v2', 'repo': 'Vado42-chris/xi-io-cli',
            'ref': LEGACY_SHA, 'source_sha': LEGACY_SHA,
            'generation': legacy_name, 'prefix': str(prefix),
            'platform': node_detail['platform'], 'node': node_detail['node'],
            'files': PR15_FILES,
        }
        receipt_path = previous / 'install-receipt.json'
        receipt_path.write_text(json.dumps(receipt, sort_keys=True) + '\n')
        receipt_path.chmod(0o600)
        pointer = prefix / 'current'
        pointer.write_text(legacy_name + '\n'); pointer.chmod(0o600)
        original = changed(previous)
        user_original = config_file.read_bytes()
        env = {**os.environ, 'HOME': str(home), 'XIIO_CONFIG_DIR': str(config), 'NODE_OPTIONS': ''}
        command = [node, str(HERE / 'install.mjs'),
            '--packaged-source', str(HERE),
            '--expect-packaged-manifest-sha256', MANIFEST_SHA,
            '--ref', source_sha, '--prefix', str(prefix), '--bin-dir', str(bin_dir)]
        first = require_ok(run(command, env), 'six-to-seven first install')
        assert first['state'] == 'PASS', first
        next_generation = pointer.read_text().strip()
        assert next_generation != legacy_name
        assert (prefix / 'previous').read_text().strip() == legacy_name
        new_receipt = json.loads((prefix / 'versions' / next_generation / 'install-receipt.json').read_bytes())
        assert new_receipt['source_sha'] == source_sha
        assert set(new_receipt['files']) == set(manifest['files'])
        assert changed(previous) == original, 'PR15_GENERATION_MUTATED_ON_UPGRADE'
        assert config_file.read_bytes() == user_original

        launcher = bin_dir / ('xi-io-cli.cmd' if os.name == 'nt' else 'xi-io-cli')
        back = require_ok(run([str(launcher), 'rollback'], env), 'rollback to PR15')
        assert back['state'] == 'PASS'
        assert pointer.read_text().strip() == legacy_name
        assert (prefix / 'previous').read_text().strip() == next_generation
        assert changed(previous) == original, 'PR15_GENERATION_MUTATED_ON_ROLLBACK'

        # Refuse a modified, self-certified predecessor before any new
        # generation/pointer/launcher changes. Restore only disposable bytes.
        prior = (previous / 'src/file-edit-cas.mjs').read_bytes()
        (previous / 'src/file-edit-cas.mjs').write_bytes(prior + b'\nTAMPERED\n')
        try:
            preexisting = (pointer.read_bytes(), (prefix / 'previous').read_bytes())
            blocked = run(command, env)
            assert blocked.returncode == 2, blocked.stdout + blocked.stderr
            refusal = json.loads(blocked.stdout)
            assert refusal['first_red'] == 'EXISTING_GENERATION_PREFLIGHT_FAILED', refusal
            assert refusal['modified'] is False
            assert (pointer.read_bytes(), (prefix / 'previous').read_bytes()) == preexisting
        finally:
            (previous / 'src/file-edit-cas.mjs').write_bytes(prior)
        assert changed(previous) == original

        # The historical CLI cannot be assumed to support a newer generation's
        # rollback contract. Re-upgrade through the qualified installer rather
        # than rewriting historical runtime or switching pointers by hand.
        again = require_ok(run(command, env), 're-upgrade from preserved PR15')
        third_generation = pointer.read_text().strip()
        assert third_generation not in (legacy_name, next_generation)
        assert (prefix / 'previous').read_text().strip() == legacy_name
        assert changed(previous) == original
        assert (prefix / 'versions' / next_generation).is_dir()
        assert config_file.read_bytes() == user_original
        print(json.dumps({
            'schema': 'xiio.hex.cli-six-to-seven-upgrade/v1',
            'state': 'PASS', 'source_sha': source_sha, 'previous_source_sha': LEGACY_SHA,
            'predecessor_file_count': 6, 'successor_file_count': 7,
            'old_generation_bytes_unchanged': True, 'rollback_to_old': True,
            'tampered_old_bytes_refused_before_mutation': True,
            'reupgrade_without_rewriting_old': True,
            'user_config_preserved': True,
            'installed_on': 'DISPOSABLE_TEST_ONLY',
        }, sort_keys=True))

if __name__ == '__main__':
    main()
