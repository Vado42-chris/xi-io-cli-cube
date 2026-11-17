from __future__ import annotations
import hashlib, os, re, tempfile
from pathlib import Path

SAFE_UNIT=re.compile(r"^[A-Za-z0-9_.@-]+\.service$")
SHA256=re.compile(r"^[0-9a-f]{64}$")
class ServiceUnitMaterializationError(RuntimeError): pass

def materialize_user_service_unit(*,source:Path,expected_sha256:str,unit_name:str,user_unit_dir:Path)->dict:
    if not SAFE_UNIT.fullmatch(str(unit_name or "")): raise ServiceUnitMaterializationError("SERVICE_UNIT_NAME_INVALID")
    if not SHA256.fullmatch(str(expected_sha256 or "")): raise ServiceUnitMaterializationError("SERVICE_UNIT_SHA256_INVALID")
    src=source.resolve(strict=True)
    if source.is_symlink() or not src.is_file(): raise ServiceUnitMaterializationError("SERVICE_UNIT_SOURCE_UNTRUSTED")
    body=src.read_bytes()
    if hashlib.sha256(body).hexdigest()!=expected_sha256: raise ServiceUnitMaterializationError("SERVICE_UNIT_SOURCE_DIGEST_MISMATCH")
    if b"\x00" in body or b"[Service]" not in body: raise ServiceUnitMaterializationError("SERVICE_UNIT_CONTENT_INVALID")
    root=user_unit_dir.resolve(strict=False);root.mkdir(parents=True,exist_ok=True,mode=0o700)
    target=root/unit_name
    if target.is_symlink() or (target.exists() and not target.is_file()): raise ServiceUnitMaterializationError("SERVICE_UNIT_TARGET_UNTRUSTED")
    fd,tmp=tempfile.mkstemp(prefix="."+unit_name+".",suffix=".tmp",dir=root);os.close(fd);p=Path(tmp)
    try:
        p.write_bytes(body);os.chmod(p,0o600);os.replace(p,target)
    finally:
        if p.exists(): p.unlink()
    reopened=target.read_bytes()
    if reopened!=body or hashlib.sha256(reopened).hexdigest()!=expected_sha256: raise ServiceUnitMaterializationError("SERVICE_UNIT_READBACK_MISMATCH")
    if (target.stat().st_mode & 0o777)!=0o600: raise ServiceUnitMaterializationError("SERVICE_UNIT_MODE_MISMATCH")
    return {"schema":"xiio.installer.service-unit-materialization-receipt/v1","unit_name":unit_name,"destination":str(target),"sha256":expected_sha256,"size":len(reopened),"mode":"0600","readback_verified":True,"effect_authority":False,"provider_effect":False}
