from __future__ import annotations
import hashlib, json, os, sys, tempfile
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

def _sync_directory(path:Path)->None:
    # Directory-entry durability is distinct from flushing the receipt bytes.
    fd=os.open(path,os.O_RDONLY | getattr(os,"O_DIRECTORY",0))
    try: os.fsync(fd)
    finally: os.close(fd)

def _prepare_receipt_directory(path:Path)->None:
    missing=[]
    current=path
    while not current.exists():
        missing.append(current)
        current=current.parent
    # Probe support before creating receipt state. Unsupported filesystems fail closed.
    _sync_directory(current)
    for directory in reversed(missing):
        directory.mkdir(exist_ok=True)
        _sync_directory(directory)
        _sync_directory(directory.parent)

def _write_receipt_temp(receipt:dict[str,Any],parent:Path,prefix:str)->Path:
    fd,name=tempfile.mkstemp(prefix=prefix,dir=parent)
    tmp=Path(name)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as out:
            os.fchmod(out.fileno(),0o600)
            out.write(json.dumps(receipt,indent=2,sort_keys=True)+"\n")
            out.flush()
            os.fsync(out.fileno())
        return tmp
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise

def write_receipt(policy:dict[str,Any],path:Path)->dict[str,Any]:
    if path.is_symlink() or path.exists(): raise ConsentError("CONSENT_RECEIPT_PATH_INVALID")
    body=compile_policy(policy)
    _prepare_receipt_directory(path.parent)
    receipt={**body,"consent_sha256":digest(body)}
    tmp=_write_receipt_temp(receipt,path.parent,".xiio-consent-")
    try:
        # Publish insert-only: the absence check above is not an atomic lease.
        # A concurrent consent writer must never be silently overwritten.
        try:
            os.link(tmp,path)
            try: _sync_directory(path.parent)
            except OSError as exc:
                raise ConsentError("CONSENT_PUBLISHED_DURABILITY_UNCONFIRMED") from exc
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
    _sync_directory(path.parent)
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
        _sync_directory(path.parent)  # Persist archive before replacing current policy.
        tmp=_write_receipt_temp(receipt,path.parent,".xiio-consent-update-")
        try:
            os.replace(tmp,path)
            try: _sync_directory(path.parent)
            except OSError as exc:
                raise ConsentError("CONSENT_PUBLISHED_DURABILITY_UNCONFIRMED") from exc
        finally:
            if tmp.exists(): tmp.unlink()
        return {**receipt,"previous_receipt":archive.name}
    finally:
        error_in_flight=sys.exc_info()[0] is not None
        try:
            lock.unlink()
            _sync_directory(path.parent)
        except FileNotFoundError: pass
        except OSError as exc:
            if not error_in_flight:
                raise ConsentError("CONSENT_PUBLISHED_DURABILITY_UNCONFIRMED") from exc
