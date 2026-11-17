from __future__ import annotations
import json,re
from pathlib import Path
from typing import Any
from .discovery import xdg_roots
from .manifest import ProductManifest,sha256_file
from .transaction import apply_install,TransactionError
SHA1=re.compile(r"^[0-9a-f]{40}$");SHA256=re.compile(r"^[0-9a-f]{64}$")
class DependencyBindingError(RuntimeError): pass
def _dep(manifest:ProductManifest)->tuple[str,str,str,dict[str,Any]]:
 raw=manifest.raw;dependency_id=str(raw.get("dependency_id","")).strip();owner_repo=str(raw.get("owner_repo","")).strip();generation=str(raw.get("accepted_generation","")).strip();exports=raw.get("runtime_exports")
 if not dependency_id or not re.fullmatch(r"[A-Za-z0-9_.-]+",dependency_id): raise DependencyBindingError("DEPENDENCY_ID_INVALID")
 if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",owner_repo): raise DependencyBindingError("DEPENDENCY_OWNER_REPO_INVALID")
 if not (SHA1.fullmatch(generation) or SHA256.fullmatch(generation)): raise DependencyBindingError("DEPENDENCY_ACCEPTED_GENERATION_INVALID")
 if not isinstance(exports,dict) or not exports: raise DependencyBindingError("DEPENDENCY_RUNTIME_EXPORTS_REQUIRED")
 payload={(e.destination_scope,e.destination):e for e in manifest.entries}
 for name,value in exports.items():
  if not re.fullmatch(r"[A-Za-z0-9_.-]+",str(name)) or not isinstance(value,dict): raise DependencyBindingError("DEPENDENCY_RUNTIME_EXPORT_INVALID")
  key=(str(value.get("destination_scope","")),str(value.get("destination","")))
  if key not in payload: raise DependencyBindingError("DEPENDENCY_RUNTIME_EXPORT_NOT_IN_PAYLOAD")
 return dependency_id,owner_repo,generation,exports
def bind_dependency_manifest(manifest:ProductManifest,payload_root:Path,install_receipt:Path,binding_receipt:Path,*,expected_dependency_id:str,expected_owner_repo:str,expected_generation:str,env:dict[str,str]|None=None)->dict[str,Any]:
 dep,owner,generation,exports=_dep(manifest)
 if dep!=expected_dependency_id or owner!=expected_owner_repo or generation!=expected_generation: raise DependencyBindingError("DEPENDENCY_BINDING_EXPECTATION_MISMATCH")
 if binding_receipt.exists() or binding_receipt.is_symlink(): raise DependencyBindingError("DEPENDENCY_BINDING_RECEIPT_OCCUPIED")
 install=apply_install(manifest,payload_root,install_receipt,env)
 roots=xdg_roots(env);projected={};fields={}
 for name,value in exports.items():
  scope=value["destination_scope"];rel=value["destination"];target=roots[scope]/rel
  entry=next(e for e in manifest.entries if e.destination_scope==scope and e.destination==rel)
  if target.is_symlink() or not target.is_file() or sha256_file(target)!=entry.sha256: raise DependencyBindingError("DEPENDENCY_RUNTIME_EXPORT_READBACK_MISMATCH")
  projected[name]={"destination_scope":scope,"destination":rel,"sha256":entry.sha256,"mode":f"{entry.mode:04o}"}
  fields[name]=str(target.resolve())
 receipt={"schema":"xiio.installer-dependency-binding-receipt/v1","state":"BOUND","dependency_id":dep,"owner_repo":owner,"accepted_generation":generation,"product_id":manifest.product_id,"install_receipt":str(install_receipt),"binding_receipt_path":str(binding_receipt.resolve()),"runtime_exports":projected,"fields":fields,"effect_authority":False,"provider_effect":False}
 binding_receipt.parent.mkdir(parents=True,exist_ok=True);tmp=binding_receipt.with_name(binding_receipt.name+".tmp");tmp.write_text(json.dumps(receipt,sort_keys=True,indent=2)+"\n",encoding="utf-8");tmp.chmod(0o600);tmp.replace(binding_receipt)
 reopened=json.loads(binding_receipt.read_text(encoding="utf-8"))
 if reopened!=receipt: raise DependencyBindingError("DEPENDENCY_BINDING_RECEIPT_READBACK_MISMATCH")
 return receipt
