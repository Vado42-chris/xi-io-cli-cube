import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
KERNEL=ROOT/"xiio_installer"
ADOPTION=json.loads((ROOT.parent.parent/"SOURCE-ADOPTION.json").read_text())
def git_blob(path:Path)->str:
 data=path.read_bytes();return hashlib.sha1(f"blob {len(data)}\0".encode()+data).hexdigest()

def test_latest_installer_custody_and_currentness_are_pinned():
 assert ADOPTION["kernel"]["ref"]=="6567f0b135d7a08971c6fa48fde1c6045dc037d1"
 expected=ADOPTION["kernel"]["files_unchanged_git_blob"]
 for name in ["runtime_profile.py","runtime_binding.py","runtime_activation.py","running_generation.py","dependency_receipt_verification.py"]:
  assert git_blob(KERNEL/name)==expected[name]

def test_runtime_binding_consumes_persisted_verifier_and_activation_requires_component_generation():
 binding=(KERNEL/"runtime_binding.py").read_text();activation=(KERNEL/"runtime_activation.py").read_text();profile=(KERNEL/"runtime_profile.py").read_text()
 assert "verify_dependency_binding_receipt" in binding
 assert "RUNTIME_BINDING_RECEIPT_UNVERIFIED" in binding
 assert "verify_running_generation" in activation
 assert "service.declared_generation or profile.generation" in activation
 assert '"profile_generation":profile.generation' in activation
 assert '"declared_component_generation":service.declared_generation or profile.generation' in activation
 assert "declared_generation:str|None" in profile
 assert 'row.get("declared_generation")' in profile
