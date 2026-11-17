from __future__ import annotations
import hashlib,json,os
from pathlib import Path
from typing import Any
class DependencyReceiptVerificationError(RuntimeError): pass
def _text(v:Any,code:str)->str:
 s=str(v or "").strip()
 if not s: raise DependencyReceiptVerificationError(code)
 return s
def _sha256(path:Path)->str:
 h=hashlib.sha256()
 with path.open("rb") as f:
  for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
 return h.hexdigest()
def verify_dependency_binding_receipt(path:Path,*,expected_dependency_id:str,expected_owner_repo:str,expected_generation:str)->dict[str,Any]:
 receipt_path=path.resolve(strict=True)
 st=os.lstat(receipt_path)
 if not os.path.isfile(receipt_path) or os.path.islink(receipt_path): raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_CUSTODY_INVALID")
 if st.st_mode & 0o077: raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_MODE_INVALID")
 try: r=json.loads(receipt_path.read_text(encoding="utf-8"))
 except Exception as exc: raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_JSON_INVALID") from exc
 if r.get("schema")!="xiio.installer-dependency-binding-receipt/v1" or r.get("state")!="BOUND" or r.get("provider_effect") is not False or r.get("effect_authority") is not False: raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_INVALID")
 if Path(_text(r.get("binding_receipt_path"),"DEPENDENCY_RECEIPT_SELF_PATH_REQUIRED")).resolve()!=receipt_path: raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_SELF_PATH_MISMATCH")
 if r.get("dependency_id")!=_text(expected_dependency_id,"DEPENDENCY_EXPECTED_ID_REQUIRED") or r.get("owner_repo")!=_text(expected_owner_repo,"DEPENDENCY_EXPECTED_OWNER_REQUIRED") or r.get("accepted_generation")!=_text(expected_generation,"DEPENDENCY_EXPECTED_GENERATION_REQUIRED"): raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_IDENTITY_MISMATCH")
 fields=r.get("fields");exports=r.get("runtime_exports")
 if not isinstance(fields,dict) or not isinstance(exports,dict) or not exports or set(fields)!=set(exports): raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_EXPORT_FIELDS_MISMATCH")
 verified={}
 for name,spec in exports.items():
  if not isinstance(spec,dict): raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_EXPORT_METADATA_INVALID")
  target=Path(_text(fields.get(name),"DEPENDENCY_RECEIPT_EXPORT_PATH_REQUIRED"))
  if not target.is_absolute(): raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_EXPORT_PATH_INVALID")
  try: ts=os.lstat(target)
  except OSError as exc: raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_EXPORT_CUSTODY_INVALID") from exc
  if not os.path.isfile(target) or os.path.islink(target): raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_EXPORT_CUSTODY_INVALID")
  expected_sha=_text(spec.get("sha256"),"DEPENDENCY_RECEIPT_EXPORT_SHA_REQUIRED");mode=_text(spec.get("mode"),"DEPENDENCY_RECEIPT_EXPORT_MODE_REQUIRED")
  try: expected_mode=int(mode,8)
  except ValueError as exc: raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_EXPORT_MODE_INVALID") from exc
  if (ts.st_mode & 0o777)!=expected_mode or _sha256(target)!=expected_sha: raise DependencyReceiptVerificationError("DEPENDENCY_RECEIPT_EXPORT_READBACK_MISMATCH")
  verified[name]=str(target.resolve())
 return {"schema":r["schema"],"state":"VERIFIED","dependency_id":r["dependency_id"],"owner_repo":r["owner_repo"],"accepted_generation":r["accepted_generation"],"binding_receipt_path":str(receipt_path),"runtime_exports":exports,"fields":verified,"provider_effect":False,"effect_authority":False,"custody_verified":True}
