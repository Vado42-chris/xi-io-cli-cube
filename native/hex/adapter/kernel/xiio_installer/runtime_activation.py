from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from .runtime_profile import RuntimeProfile, RuntimeProfileError, compile_user_consent
from .runtime_binding import materialize_runtime_bindings

class RuntimeActivationError(RuntimeError):
    pass

def _run(args:list[str],timeout:int=15)->subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(args,capture_output=True,text=True,check=False,timeout=timeout)
    except (OSError,subprocess.TimeoutExpired) as exc:
        raise RuntimeActivationError("SYSTEMD_COMMAND_UNAVAILABLE") from exc

def _probe(url:str,timeout:float=3.0)->dict[str,Any]:
    try:
        with urlopen(url,timeout=timeout) as r:
            body=r.read(256*1024)
            if r.status!=200:
                raise RuntimeActivationError("SERVICE_HEALTH_HTTP_FAILED")
            try:
                return json.loads(body.decode("utf-8"))
            except Exception as exc:
                raise RuntimeActivationError("SERVICE_HEALTH_JSON_INVALID") from exc
    except RuntimeActivationError:
        raise
    except Exception as exc:
        raise RuntimeActivationError("SERVICE_HEALTH_UNREACHABLE") from exc

def _atomic_json(path:Path,value:dict[str,Any])->None:
    if path.is_symlink():
        raise RuntimeActivationError("RECEIPT_SYMLINK_FORBIDDEN")
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix=f".{path.name}.",suffix=".tmp",dir=path.parent)
    os.close(fd)
    p=Path(tmp)
    try:
        p.write_text(json.dumps(value,indent=2,sort_keys=True)+"\n",encoding="utf-8")
        os.chmod(p,0o600)
        os.replace(p,path)
    finally:
        if p.exists():
            p.unlink()

def activate_runtime_profile(
    profile:RuntimeProfile,
    *,
    grants:list[str],
    update_policy:str|None,
    consent_receipt_path:Path,
    activation_receipt_path:Path,
    principal_ref:str="local-user",
    runtime_binding_profile:dict[str,Any]|None=None,
    dependency_binding_receipts:dict[str,dict[str,Any]]|None=None,
    runtime_binding_destination:Path|None=None,
)->dict[str,Any]:
    consent=compile_user_consent(profile,grants=grants,update_policy=update_policy,principal_ref=principal_ref)
    allowed=set(consent["permissions"])
    for dep in profile.dependencies:
        if not set(dep.required_for_permissions).intersection(allowed):
            continue
        if dep.expected_unit is not None:
            unit=_run(["systemctl","--user","cat",dep.expected_unit],timeout=5)
            if unit.returncode!=0:
                raise RuntimeActivationError("RUNTIME_DEPENDENCY_NOT_INSTALLED:"+dep.dependency_id)
    binding_receipt=None
    if runtime_binding_profile is not None:
        if dependency_binding_receipts is None or runtime_binding_destination is None:
            raise RuntimeActivationError("RUNTIME_BINDING_INPUTS_REQUIRED")
        try:
            binding_receipt=materialize_runtime_bindings(profile,runtime_binding_profile,dependency_binding_receipts,runtime_binding_destination)
        except Exception as exc:
            raise RuntimeActivationError("RUNTIME_BINDING_MATERIALIZATION_FAILED:"+str(exc)) from exc

    selected=[]
    for service in profile.services:
        if not set(service.required_permissions).issubset(allowed):
            if service.required:
                raise RuntimeActivationError("REQUIRED_SERVICE_PERMISSION_NOT_GRANTED:"+service.service_id)
            continue
        if service.required:
            selected.append(service)
            continue
        if service.activation_permission and service.activation_permission in allowed:
            selected.append(service)

    pre={}
    for service in selected:
        r=_run(["systemctl","--user","is-active",service.unit],timeout=5)
        pre[service.unit]={
            "active":r.returncode==0 and r.stdout.strip()=="active",
            "state":r.stdout.strip() or "unknown",
        }

    activated=[]
    try:
        reload_result=_run(["systemctl","--user","daemon-reload"],timeout=10)
        if reload_result.returncode!=0:
            raise RuntimeActivationError("USER_SYSTEMD_RELOAD_FAILED")
        for service in selected:
            enable=_run(["systemctl","--user","enable","--now",service.unit],timeout=20)
            if enable.returncode!=0:
                raise RuntimeActivationError("SERVICE_ENABLE_START_FAILED:"+service.service_id)
            state=_run(["systemctl","--user","is-active",service.unit],timeout=5)
            if state.returncode!=0 or state.stdout.strip()!="active":
                raise RuntimeActivationError("SERVICE_NOT_ACTIVE:"+service.service_id)
            health=_probe(service.health_url)
            activated.append({
                "service_id":service.service_id,
                "unit":service.unit,
                "health_url":service.health_url,
                "health":health,
                "active":True,
            })
    except Exception:
        for row in reversed(activated):
            unit=row["unit"]
            if not pre.get(unit,{}).get("active",False):
                _run(["systemctl","--user","disable","--now",unit],timeout=15)
        raise

    receipt={
        "schema":"xiio-installer-runtime-activation-receipt-v1",
        "profile_id":profile.profile_id,
        "profile_generation":profile.generation,
        "product_id":profile.product_id,
        "consent_ref":consent["consent_ref"],
        "permissions":consent["permissions"],
        "update_policy":consent["update_policy"],
        "services":activated,
        "runtime_binding":binding_receipt,
        "readback_verified":all(row["active"] for row in activated),
        "provider_effect":False,
        "hard":[
            "RUNTIME_PROFILE!=GENERAL_MACHINE_AUTHORITY",
            "CONSENT!=REMOTE_EFFECT_AUTHORITY",
            "SERVICE_STARTED!=SERVICE_QUALIFIED_FOR_EXTERNAL_EFFECT",
            "CENTRAL_UPDATE_REQUEST!=LOCAL_EFFECT_AUTHORITY",
        ],
    }
    _atomic_json(consent_receipt_path,consent)
    _atomic_json(activation_receipt_path,receipt)
    readback=json.loads(activation_receipt_path.read_text(encoding="utf-8"))
    if readback!=receipt:
        raise RuntimeActivationError("ACTIVATION_RECEIPT_READBACK_MISMATCH")
    return receipt

def revoke_runtime_consent(consent_receipt_path:Path)->dict[str,Any]:
    if not consent_receipt_path.exists():
        return {"schema":"xiio-installer-runtime-consent-revocation/v1","state":"ALREADY_ABSENT"}
    if consent_receipt_path.is_symlink():
        raise RuntimeActivationError("CONSENT_SYMLINK_FORBIDDEN")
    current=json.loads(consent_receipt_path.read_text(encoding="utf-8"))
    consent_receipt_path.unlink()
    return {
        "schema":"xiio-installer-runtime-consent-revocation/v1",
        "state":"REVOKED",
        "consent_ref":current.get("consent_ref"),
        "note":"Revocation stops future managed-update eligibility. It does not silently stop currently running services.",
    }
