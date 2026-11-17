import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
ADOPTION=json.loads((ROOT.parent.parent/'SOURCE-ADOPTION.json').read_text())
KERNEL=ROOT/'xiio_installer'
def git_blob(path):
 data=path.read_bytes();return hashlib.sha1(f"blob {len(data)}\\0".encode()+data).hexdigest()
def test_installer_38_dependency_service_generation_join_is_pinned():
 assert ADOPTION['kernel']['ref']=='be98452eea87b06a84396897f4c8090fb10d1f84'
 assert ADOPTION['kernel']['owner_pr']==38
 assert git_blob(KERNEL/'runtime_profile.py')==ADOPTION['kernel']['files_unchanged_git_blob']['runtime_profile.py']
 source=(KERNEL/'runtime_profile.py').read_text()
 assert 'DEPENDENCY_SERVICE_GENERATION_MISMATCH' in source
 assert 'DEPENDENCY_SERVICE_UNIT_UNDECLARED' in source
