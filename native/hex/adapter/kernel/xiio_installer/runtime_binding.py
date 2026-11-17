from __future__ import annotations
import json,os,re,tempfile
from pathlib import Path
from typing import Any
from .runtime_profile import RuntimeProfile
BINDING_SCHEMA="xiio.product-runtime-binding-profile/v1";RECEIPT_SCHEMA="xiio.installer-dependency-binding-receipt/v1";ENV_KEY=re.compile(r"^[A-Z][A-Z0-9_]{0,127}$")
class RuntimeBindingError(RuntimeError): pass
def _text(value:Any,code:str)->str:
 out=str(value or "").strip()
 if not out: raise RuntimeBindingError(code)
 if "\x00" in out or "\n" in out or "\r" in out: raise RuntimeBindingError(code+"_UNSAFE")
 return out
def load_runtime_binding_profile(path:Path)->dict[str,Any]:
 raw=json.loads(path.read_text(encoding="utf-8"))
 if raw.get("schema_version")!=BINDING_SCHEMA: raise RuntimeBindingError("RUNTIME_BINDING_SCHEMA_INVALID")
 if not isinstance(raw.get("bindings"),list) or not raw["bindings"]: raise RuntimeBindingError("RUNTIME_BINDINGS_REQUIRED")
 destination=_text(raw.get("destination"),"RUNTIME_BINDING_DESTINATION_REQUIRED")
 if destination.startswith("/") or ".." in Path(destination).parts: raise RuntimeBindingError("RUNTIME_BINDING_DESTINATION_UNSAFE")
 seen=set()
 for i,row in enumerate(raw["bindings"]):
  if not isinstance(row,dict): raise RuntimeBindingError(f"RUNTIME_BINDING_{i}_OBJECT_REQUIRED")
  key=_text(row.get("key"),f"RUNTIME_BINDING_{i}_KEY_REQUIRED")
  if not ENV_KEY.fullmatch(key) or key in seen: raise RuntimeBindingError("RUNTIME_BINDING_KEY_INVALID")
  seen.add(key);_text(row.get("source_role"),f"RUNTIME_BINDING_{i}_ROLE_REQUIRED");_text(row.get("source_field"),f"RUNTIME_BINDING_{i}_FIELD_REQUIRED")
 return raw
def runtime_binding_destination(binding_profile:dict[str,Any],env:dict[str,str]|None=None)->Path:
 env=env or os.environ;home=Path(env.get("HOME") or str(Path.home())).resolve();root=Path(env.get("XDG_CONFIG_HOME") or home/".config").resolve();destination=Path(_text(binding_profile.get("destination"),"RUNTIME_BINDING_DESTINATION_REQUIRED"))
 if destination.is_absolute() or ".." in destination.parts: raise RuntimeBindingError("RUNTIME_BINDING_DESTINATION_UNSAFE")
 target=(root/destination).resolve()
 if target==root or root not in target.parents: raise RuntimeBindingError("RUNTIME_BINDING_DESTINATION_OUTSIDE_CONFIG")
 return target
def materialize_runtime_bindings(profile:RuntimeProfile,binding_profile:dict[str,Any],dependency_receipts:dict[str,dict[str,Any]],destination:Path)->dict[str,Any]:
 if binding_profile.get("product_id")!=profile.product_id: raise RuntimeBindingError("RUNTIME_BINDING_PRODUCT_MISMATCH")
 deps={d.dependency_id:d for d in profile.dependencies};lines=[];resolved=[]
 for row in binding_profile["bindings"]:
  role=row["source_role"]
  if role not in deps: raise RuntimeBindingError("RUNTIME_BINDING_DEPENDENCY_UNDECLARED:"+role)
  receipt=dependency_receipts.get(role)
  if not isinstance(receipt,dict) or receipt.get("schema")!=RECEIPT_SCHEMA: raise RuntimeBindingError("RUNTIME_BINDING_RECEIPT_REQUIRED:"+role)
  dep=deps[role]
  if receipt.get("dependency_id")!=dep.dependency_id or receipt.get("owner_repo")!=dep.owner_repo or receipt.get("accepted_generation")!=dep.accepted_generation: raise RuntimeBindingError("RUNTIME_BINDING_RECEIPT_IDENTITY_MISMATCH:"+role)
  fields=receipt.get("fields")
  if not isinstance(fields,dict) or row["source_field"] not in fields: raise RuntimeBindingError("RUNTIME_BINDING_SOURCE_FIELD_MISSING:"+role+":"+row["source_field"])
  value=_text(fields[row["source_field"]],"RUNTIME_BINDING_SOURCE_VALUE_INVALID");lines.append(f'{row["key"]}={value}');resolved.append({"key":row["key"],"dependency_id":role,"source_field":row["source_field"],"accepted_generation":dep.accepted_generation})
 if destination.is_symlink(): raise RuntimeBindingError("RUNTIME_BINDING_DESTINATION_SYMLINK_FORBIDDEN")
 destination.parent.mkdir(parents=True,exist_ok=True);fd,tmp=tempfile.mkstemp(prefix="."+destination.name+".",suffix=".tmp",dir=destination.parent);os.close(fd);p=Path(tmp)
 try:p.write_text("\n".join(lines)+"\n",encoding="utf-8");os.chmod(p,0o600);os.replace(p,destination)
 finally:
  if p.exists():p.unlink()
 if destination.stat().st_mode & 0o777 != 0o600 or destination.read_text(encoding="utf-8")!="\n".join(lines)+"\n": raise RuntimeBindingError("RUNTIME_BINDING_READBACK_FAILED")
 return {"schema":"xiio.installer-runtime-binding-materialization-receipt/v1","state":"MATERIALIZED","product_id":profile.product_id,"profile_generation":profile.generation,"destination":binding_profile["destination"],"bindings":resolved,"mode":"0600","provider_effect":False,"effect_authority":False}
