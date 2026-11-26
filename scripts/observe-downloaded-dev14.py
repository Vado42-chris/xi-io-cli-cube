"""Receiver run for one immutable, already-built release candidate."""
import hashlib,importlib.util,json,os,subprocess,sys,tempfile
from pathlib import Path
root=Path.cwd()
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
ui=load('product_observation',root/'scripts/verify-installed-product-folders.py')
provider=load('provider',root/'scripts/verify-extracted-artcraft.py')
media=root/'archived'
identity=json.loads((media/'hex-native-frontend-identity.json').read_bytes())
package,=media.rglob('*.deb')
executable=Path('/usr/bin/xi-io-hex-dev')
build='45a24cc769eac13b0a777c1d20345888cd885042'
assert identity['source_commit']==identity['github_sha']==build
assert identity['github_run_id']=='45857250845' and identity['github_run_attempt']=='1'
assert identity['frontend_staged_match'] and identity['package_version']=='0.1.0-dev.14'
assert sha(package)==identity['debian_package_sha256']=='30085a934390c7a5a25350091d9c1ce211ae45eb10030100b638584377157651'
assert sha(executable)==identity['native_elf_sha256']=='224186da176beefed19684d1e2e074d9df164613f797dbe88cde44de272631ab'
assert sha(media/'hex-built-frontend.tgz')==identity['frontend_archive_sha256']
provider.installed_package_binding(executable,identity['package_version'])
proof=root/'archived-product-window-readback.json'
media_paths = [Path(arg).resolve(strict=True) for arg in sys.argv[1:]]
with tempfile.TemporaryDirectory(prefix="second-product-") as temp:
    if len(media_paths) == 1:
        sys.path.insert(0, str(root/'native/hex/adapter'))
        sys.path.insert(0, str(root/'native/hex/adapter/kernel'))
        media_paths.append(ui.sample_products(Path(temp))[1])
    ui.exercise_installed_window(root,provider,build,executable,sha(executable),identity,proof,media_paths or None)
report=json.loads(proof.read_bytes())
report.update(observer_run=os.environ['GITHUB_RUN_ID'],observer_sha=os.environ['GITHUB_SHA'],producer_run=identity['github_run_id'],producer_sha=build)
proof.write_text(json.dumps(report,indent=2)+'\n')
print(proof.read_text())
