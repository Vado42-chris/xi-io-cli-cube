from __future__ import annotations
from pathlib import Path
from typing import Any
from .manifest import ProductManifest
from .transaction import xdg_roots

class DependencyBindingError(RuntimeError): pass

def compile_dependency_binding_receipt(manifest:ProductManifest,install_receipt:dict[str,Any],env:dict[str,str]|None=None)->dict[str,Any]:
    raw=manifest.raw
    owner=str(raw.get("owner_repo") or "").strip();generation=str(raw.get("accepted_generation") or "").strip()
    exports=raw.get("runtime_exports")
    if not owner or not generation or not isinstance(exports,dict) or not exports: raise DependencyBindingError("DEPENDENCY_BINDING_METADATA_REQUIRED")
    if install_receipt.get("schema_version")!="xiio-installer-receipt-v1" or install_receipt.get("product_id")!=manifest.product_id or install_receipt.get("version")!=manifest.version:
        raise DependencyBindingError("DEPENDENCY_BINDING_INSTALL_RECEIPT_MISMATCH")
    entries={(e.destination_scope,e.destination):e for e in manifest.entries}
    installed={(e.get("destination_scope"),e.get("destination")):e for e in install_receipt.get("entries",[]) if isinstance(e,dict)}
    roots=xdg_roots(env);fields={}
    for name,spec in exports.items():
        if not isinstance(name,str) or not name or not isinstance(spec,dict): raise DependencyBindingError("DEPENDENCY_BINDING_EXPORT_INVALID")
        scope=str(spec.get("destination_scope") or "");destination=str(spec.get("destination") or "")
        key=(scope,destination)
        if key not in entries or key not in installed: raise DependencyBindingError("DEPENDENCY_BINDING_EXPORT_NOT_INSTALLED:"+name)
        row=installed[key];expected=entries[key]
        if row.get("installed_sha256")!=expected.sha256 or row.get("installed_mode")!=expected.mode:
            raise DependencyBindingError("DEPENDENCY_BINDING_EXPORT_READBACK_MISMATCH:"+name)
        target=(roots[scope]/destination).resolve()
        if not target.is_file() or target.is_symlink(): raise DependencyBindingError("DEPENDENCY_BINDING_EXPORT_FILE_MISSING:"+name)
        fields[name]=str(target)
    return {"schema":"xiio.installer-dependency-binding-receipt/v1","dependency_id":manifest.product_id,"owner_repo":owner,"accepted_generation":generation,"fields":fields,"provider_effect":False,"effect_authority":False}
