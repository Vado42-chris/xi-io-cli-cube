from __future__ import annotations
import hashlib, json, os, tempfile
from pathlib import Path
from typing import Any

SCHEMA="xiio-installer-consent-v1"
SCOPES=(
 "install_local_servers",
 "start_local_services",
 "central_update_requests",
 "automatic_security_hotpatch",
 "automatic_product_updates",
 "network_exposure_changes",
)

class ConsentError(RuntimeError): pass

def compile_policy(raw:dict[str,Any])->dict[str,Any]:
    if not isinstance(raw,dict): raise ConsentError("CONSENT_OBJECT_REQUIRED")
    scopes=raw.get("scopes",{})
    if not isinstance(scopes,dict): raise ConsentError("CONSENT_SCOPES_INVALID")
    unknown=set(scopes)-set(SCOPES)
    if unknown: raise ConsentError("CONSENT_SCOPE_UNKNOWN")
    normalized={}
    for name in SCOPES:
        value=scopes.get(name,False)
        if not isinstance(value,bool): raise ConsentError("CONSENT_SCOPE_NOT_BOOLEAN")
        normalized[name]=value
    principal=str(raw.get("principal_ref") or "").strip()
    device=str(raw.get("device_ref") or "").strip()
    if not principal or not device: raise ConsentError("CONSENT_IDENTITY_REQUIRED")
    products=raw.get("approved_products",[])
    services=raw.get("approved_services",[])
    if not isinstance(products,list) or not all(isinstance(x,str) and x.strip() for x in products):
        raise ConsentError("APPROVED_PRODUCTS_INVALID")
    if not isinstance(services,list) or not all(isinstance(x,str) and x.strip() for x in services):
        raise ConsentError("APPROVED_SERVICES_INVALID")
    return {
      "schema":SCHEMA,
      "principal_ref":principal,
      "device_ref":device,
      "scopes":normalized,
      "approved_products":sorted(set(x.strip() for x in products)),
      "approved_services":sorted(set(x.strip() for x in services)),
      "source":"user",
    }

def digest(body:dict[str,Any])->str:
    return hashlib.sha256(json.dumps(body,sort_keys=True,separators=(",",":")).encode()).hexdigest()

def write_receipt(policy:dict[str,Any],path:Path)->dict[str,Any]:
    if path.is_symlink() or path.exists(): raise ConsentError("CONSENT_RECEIPT_PATH_INVALID")
    path.parent.mkdir(parents=True,exist_ok=True)
    body=compile_policy(policy)
    receipt={**body,"consent_sha256":digest(body)}
    fd,tmp_name=tempfile.mkstemp(prefix=".xiio-consent-",dir=path.parent); os.close(fd)
    tmp=Path(tmp_name)
    try:
        tmp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n",encoding="utf-8")
        os.chmod(tmp,0o600)
        # Publish insert-only: the absence check above is not an atomic lease.
        # A concurrent consent writer must never be silently overwritten.
        try:
            os.link(tmp,path)
        except FileExistsError:
            raise ConsentError("CONSENT_RECEIPT_PATH_INVALID") from None
    finally:
        if tmp.exists(): tmp.unlink()
    return receipt

def read_receipt(path:Path)->dict[str,Any]:
    if path.is_symlink() or not path.is_file(): raise ConsentError("CONSENT_RECEIPT_UNREADABLE")
    if os.name!="nt" and path.stat().st_mode & 0o077: raise ConsentError("CONSENT_PERMISSIONS_UNSAFE")
    raw=json.loads(path.read_text(encoding="utf-8"))
    body={k:raw[k] for k in ("schema","principal_ref","device_ref","scopes","approved_products","approved_services","source")}
    if raw.get("schema")!=SCHEMA or raw.get("consent_sha256")!=digest(body):
        raise ConsentError("CONSENT_RECEIPT_INVALID")
    compile_policy(body)
    return raw

def authorize(receipt:dict[str,Any],*,scope:str,principal_ref:str,device_ref:str,product_id:str|None=None,service_id:str|None=None)->dict[str,Any]:
    if scope not in SCOPES: raise ConsentError("CONSENT_SCOPE_UNKNOWN")
    if receipt.get("principal_ref")!=principal_ref: raise ConsentError("CONSENT_PRINCIPAL_MISMATCH")
    if receipt.get("device_ref")!=device_ref: raise ConsentError("CONSENT_DEVICE_MISMATCH")
    if receipt.get("scopes",{}).get(scope) is not True:
        return {"state":"DENIED","reason":"CONSENT_SCOPE_DENIED","scope":scope}
    if receipt.get("approved_products") and product_id not in receipt["approved_products"]:
        return {"state":"DENIED","reason":"PRODUCT_NOT_APPROVED","scope":scope}
    if receipt.get("approved_services") and service_id not in receipt["approved_services"]:
        return {"state":"DENIED","reason":"SERVICE_NOT_APPROVED","scope":scope}
    return {"state":"CONSENTED","scope":scope,"consent_sha256":receipt["consent_sha256"],"effect_authority":False}


def replace_receipt(policy:dict[str,Any],path:Path,expected_consent_sha256:str)->dict[str,Any]:
    lock=path.parent/(path.name+".update.lock")
    try:
        fd=os.open(lock,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    except FileExistsError:
        raise ConsentError("CONSENT_UPDATE_BUSY") from None
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as handle:
            handle.write(str(os.getpid())+"\n")
            handle.flush(); os.fsync(handle.fileno())
        current=read_receipt(path)
        if current.get("consent_sha256")!=expected_consent_sha256:
            raise ConsentError("CONSENT_COMPARE_AND_SWAP_MISMATCH")
        body=compile_policy(policy)
        receipt={**body,"consent_sha256":digest(body)}
        archive=path.parent/(path.name+"."+current["consent_sha256"]+".previous")
        archive_bytes=(json.dumps(current,indent=2,sort_keys=True)+"\n").encode("utf-8")
        if archive.is_symlink():
            raise ConsentError("CONSENT_ARCHIVE_COLLISION")
        if archive.exists():
            if not archive.is_file() or archive.read_bytes()!=archive_bytes:
                raise ConsentError("CONSENT_ARCHIVE_COLLISION")
        else:
            afd=os.open(archive,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(afd,"wb") as out:
                out.write(archive_bytes); out.flush(); os.fsync(out.fileno())
        fd2,tmp_name=tempfile.mkstemp(prefix=".xiio-consent-update-",dir=path.parent); os.close(fd2)
        tmp=Path(tmp_name)
        try:
            tmp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n",encoding="utf-8")
            os.chmod(tmp,0o600); os.replace(tmp,path)
        finally:
            if tmp.exists(): tmp.unlink()
        return {**receipt,"previous_receipt":archive.name}
    finally:
        try: lock.unlink()
        except FileNotFoundError: pass
