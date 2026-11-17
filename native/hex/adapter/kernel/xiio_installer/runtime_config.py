from __future__ import annotations
import hashlib,json,os,re,tempfile
from pathlib import Path,PurePosixPath
from typing import Any
from .runtime_profile import RuntimeProfile,compile_user_consent
KEY=re.compile(r"^[A-Z][A-Z0-9_]{0,95}$")
class RuntimeConfigError(RuntimeError): pass
def materialize_runtime_config(profile:RuntimeProfile,*,bindings:dict[str,str],destination:str,grants:list[str],xdg_config_home:Path,principal_ref:str="local-user")->dict[str,Any]:
 consent=compile_user_consent(profile,grants=grants,principal_ref=principal_ref)
 if "SERVER_CONFIG_UPDATE" not in set(consent["permissions"]): raise RuntimeConfigError("SERVER_CONFIG_UPDATE_NOT_GRANTED")
 if not isinstance(bindings,dict) or not bindings: raise RuntimeConfigError("RUNTIME_CONFIG_BINDINGS_REQUIRED")
 rows=[]
 for key,value in sorted(bindings.items()):
  if not isinstance(key,str) or not KEY.fullmatch(key): raise RuntimeConfigError("RUNTIME_CONFIG_KEY_INVALID")
  if not isinstance(value,str) or not value or "\n" in value or "\r" in value or "\x00" in value: raise RuntimeConfigError("RUNTIME_CONFIG_VALUE_INVALID")
  rows.append(f"{key}={value}")
 rel=PurePosixPath(destination)
 if rel.is_absolute() or ".." in rel.parts or str(rel) in ("","."): raise RuntimeConfigError("RUNTIME_CONFIG_DESTINATION_INVALID")
 root=Path(xdg_config_home).resolve();target=root/str(rel);parent=target.parent.resolve(strict=False)
 if root!=parent and root not in parent.parents: raise RuntimeConfigError("RUNTIME_CONFIG_DESTINATION_ESCAPES")
 parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if target.is_symlink() or (target.exists() and not target.is_file()): raise RuntimeConfigError("RUNTIME_CONFIG_TARGET_UNTRUSTED")
 body=("\n".join(rows)+"\n").encode();fd,tmp=tempfile.mkstemp(prefix="."+target.name+".",suffix=".tmp",dir=parent);os.close(fd);p=Path(tmp)
 try:p.write_bytes(body);os.chmod(p,0o600);os.replace(p,target)
 finally:
  if p.exists():p.unlink()
 reopened=target.read_bytes()
 if reopened!=body: raise RuntimeConfigError("RUNTIME_CONFIG_READBACK_MISMATCH")
 return {"schema":"xiio.installer.runtime-config-receipt/v1","profile_id":profile.profile_id,"profile_generation":profile.generation,"product_id":profile.product_id,"destination":str(rel),"binding_keys":sorted(bindings),"sha256":hashlib.sha256(reopened).hexdigest(),"readback_verified":True,"effect_authority":False,"provider_effect":False}
