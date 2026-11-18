from __future__ import annotations

import json
import hashlib
import os
import subprocess
import tempfile
import re
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from .runtime_profile import RuntimeProfile, RuntimeProfileError, compile_user_consent
from .running_generation import verify_running_generation, RunningGenerationError
from .dependency_receipt_verification import verify_dependency_binding_receipt, DependencyReceiptVerificationError

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

def _materialize_dependency(dep)->None:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",dep.owner_repo):
        raise RuntimeActivationError("RUNTIME_DEPENDENCY_OWNER_INVALID:"+dep.dependency_id)
    materializer=Path(dep.materializer)
    if materializer.is_absolute() or ".." in materializer.parts or not materializer.parts:
        raise RuntimeActivationError("RUNTIME_DEPENDENCY_MATERIALIZER_INVALID:"+dep.dependency_id)
    with tempfile.TemporaryDirectory(prefix="xiio-runtime-dependency-") as td:
        root=Path(td)/"source"
        clone=_run(["git","clone","--no-checkout","--filter=blob:none","--quiet",f"https://github.com/{dep.owner_repo}.git",str(root)],timeout=120)
        if clone.returncode!=0:
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_CLONE_FAILED:"+dep.dependency_id)
        fetch=_run(["git","-C",str(root),"fetch","origin",dep.accepted_generation,"--depth=1","--quiet"],timeout=120)
        if fetch.returncode!=0:
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_GENERATION_FETCH_FAILED:"+dep.dependency_id)
        checkout=_run(["git","-C",str(root),"checkout","--detach","--quiet",dep.accepted_generation],timeout=30)
        if checkout.returncode!=0:
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_GENERATION_CHECKOUT_FAILED:"+dep.dependency_id)
        head=_run(["git","-C",str(root),"rev-parse","HEAD"],timeout=10)
        if head.returncode!=0 or head.stdout.strip()!=dep.accepted_generation:
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_GENERATION_READBACK_FAILED:"+dep.dependency_id)
        executable=root/materializer
        try:
            resolved=executable.resolve(strict=True)
            resolved.relative_to(root.resolve())
        except Exception as exc:
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_MATERIALIZER_MISSING:"+dep.dependency_id) from exc
        if not resolved.is_file() or not os.access(resolved,os.X_OK):
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_MATERIALIZER_NOT_EXECUTABLE:"+dep.dependency_id)
        run=_run([str(resolved),"--ref",dep.accepted_generation],timeout=300)
        if run.returncode!=0:
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_MATERIALIZATION_FAILED:"+dep.dependency_id)

def activate_runtime_profile(
    profile:RuntimeProfile,
    *,
    grants:list[str],
    update_policy:str|None,
    consent_receipt_path:Path,
    activation_receipt_path:Path,
    principal_ref:str="local-user",
)->dict[str,Any]:
    consent=compile_user_consent(profile,grants=grants,update_policy=update_policy,principal_ref=principal_ref)
    allowed=set(consent["permissions"])
    roots_env=os.environ.copy()
    state_home=Path(roots_env.get("XDG_STATE_HOME") or (Path.home()/".local/state"))
    for dep in profile.dependencies:
        if dep.required_for_permissions and not set(dep.required_for_permissions).intersection(allowed):
            continue
        if dep.materializer=="xiio.installer-dependency-binding-receipt/v1":
            receipt_path=state_home/"xi-io/installer/dependencies"/(dep.dependency_id+".binding.json")
            try:
                receipt=verify_dependency_binding_receipt(
                    receipt_path,
                    expected_dependency_id=dep.dependency_id,
                    expected_owner_repo=dep.owner_repo,
                    expected_generation=dep.accepted_generation,
                )
            except (DependencyReceiptVerificationError,OSError,ValueError) as exc:
                raise RuntimeActivationError("RUNTIME_DEPENDENCY_BINDING_UNVERIFIED:"+dep.dependency_id) from exc
            if receipt.get("state")!="VERIFIED" or receipt.get("custody_verified") is not True:
                raise RuntimeActivationError("RUNTIME_DEPENDENCY_BINDING_UNVERIFIED:"+dep.dependency_id)
            continue
        if dep.expected_unit is None:
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_UNIT_REQUIRED:"+dep.dependency_id)
        unit=_run(["systemctl","--user","cat",dep.expected_unit],timeout=5)
        if unit.returncode!=0:
            _materialize_dependency(dep)
            unit=_run(["systemctl","--user","cat",dep.expected_unit],timeout=5)
        if unit.returncode!=0:
            raise RuntimeActivationError("RUNTIME_DEPENDENCY_NOT_INSTALLED:"+dep.dependency_id)
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
            try:
                generation_readback=verify_running_generation(declared_generation=service.declared_generation or profile.generation,health=health,generation_field=service.generation_field)
            except RunningGenerationError as exc:
                raise RuntimeActivationError(str(exc)) from exc
            activated.append({
                "service_id":service.service_id,
                "unit":service.unit,
                "health_url":service.health_url,
                "health":health,
                "profile_generation":profile.generation,
                "declared_component_generation":service.declared_generation or profile.generation,
                "generation_readback":generation_readback,
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
        "readback_verified":all(row["active"] and row["generation_readback"]["state"]=="CURRENT" for row in activated),
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


def verify_runtime_activation_receipt(
    activation_receipt_path:Path,
    *,
    expected_profile_id:str,
    expected_product_id:str,
    expected_profile_generation:str,
)->dict[str,Any]:
    path=Path(activation_receipt_path)
    if not path.is_absolute():
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_PATH_ABSOLUTE_REQUIRED")
    try:
        resolved=path.resolve(strict=True)
        stat=path.lstat()
    except OSError as exc:
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_UNREADABLE") from exc
    if resolved!=path or path.is_symlink() or not path.is_file():
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_CUSTODY_INVALID")
    if os.name!="nt" and (stat.st_mode & 0o077)!=0:
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_MODE_INVALID")
    try:
        raw=path.read_bytes()
    except OSError as exc:
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_UNREADABLE") from exc
    if len(raw)>1024*1024:
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_OVERSIZE")
    try:
        receipt=json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_JSON_INVALID") from exc
    if not isinstance(receipt,dict) or receipt.get("schema")!="xiio-installer-runtime-activation-receipt-v1":
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_SCHEMA_INVALID")
    profile_id=str(expected_profile_id or "").strip()
    product_id=str(expected_product_id or "").strip()
    profile_generation=str(expected_profile_generation or "").strip()
    if not profile_id or not product_id or not profile_generation:
        raise RuntimeActivationError("RUNTIME_ACTIVATION_EXPECTATION_REQUIRED")
    if receipt.get("profile_id")!=profile_id or receipt.get("product_id")!=product_id or receipt.get("profile_generation")!=profile_generation:
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_IDENTITY_MISMATCH")
    if receipt.get("readback_verified") is not True or receipt.get("provider_effect") is not False:
        raise RuntimeActivationError("RUNTIME_ACTIVATION_RECEIPT_NOT_VERIFIED")
    rows=receipt.get("services")
    if not isinstance(rows,list):
        raise RuntimeActivationError("RUNTIME_ACTIVATION_SERVICES_ARRAY_REQUIRED")
    seen_services=set()
    seen_units=set()
    verified=[]
    for index,row in enumerate(rows):
        if not isinstance(row,dict):
            raise RuntimeActivationError(f"RUNTIME_ACTIVATION_SERVICE_{index}_OBJECT_REQUIRED")
        service_id=str(row.get("service_id") or "").strip()
        unit=str(row.get("unit") or "").strip()
        health_url=str(row.get("health_url") or "").strip()
        declared=str(row.get("declared_component_generation") or "").strip()
        if not service_id or not unit or not health_url or not declared:
            raise RuntimeActivationError(f"RUNTIME_ACTIVATION_SERVICE_{index}_IDENTITY_INCOMPLETE")
        if service_id in seen_services or unit in seen_units:
            raise RuntimeActivationError("RUNTIME_ACTIVATION_SERVICE_DUPLICATE")
        seen_services.add(service_id);seen_units.add(unit)
        if not (health_url.startswith("http://127.0.0.1:") or health_url.startswith("https://127.0.0.1:")):
            raise RuntimeActivationError("RUNTIME_ACTIVATION_SERVICE_HEALTH_NOT_LOOPBACK")
        if row.get("profile_generation")!=profile_generation or row.get("active") is not True:
            raise RuntimeActivationError("RUNTIME_ACTIVATION_SERVICE_NOT_CURRENT")
        stored=row.get("generation_readback")
        if not isinstance(stored,dict) or stored.get("schema")!="xiio.installer-running-generation-readback/v1" or stored.get("state")!="CURRENT":
            raise RuntimeActivationError("RUNTIME_ACTIVATION_GENERATION_READBACK_INVALID")
        if stored.get("provider_effect") is not False or stored.get("effect_authority") is not False:
            raise RuntimeActivationError("RUNTIME_ACTIVATION_GENERATION_READBACK_EFFECTFUL")
        generation_field=str(stored.get("generation_field") or "").strip()
        if not generation_field or stored.get("declared_generation")!=declared or stored.get("running_generation")!=declared:
            raise RuntimeActivationError("RUNTIME_ACTIVATION_GENERATION_READBACK_MISMATCH")
        live_health=_probe(health_url)
        try:
            live=verify_running_generation(
                declared_generation=declared,
                health=live_health,
                generation_field=generation_field,
            )
        except RunningGenerationError as exc:
            raise RuntimeActivationError(str(exc)) from exc
        verified.append({
            "service_id":service_id,
            "unit":unit,
            "health_url":health_url,
            "profile_generation":profile_generation,
            "declared_component_generation":declared,
            "generation_readback":live,
            "health_schema":live_health.get("schema") if isinstance(live_health,dict) else None,
            "active":True,
        })
    return {
        "schema":"xiio.installer-runtime-activation-verification/v1",
        "state":"VERIFIED",
        "profile_id":profile_id,
        "profile_generation":profile_generation,
        "product_id":product_id,
        "activation_receipt_path":str(resolved),
        "activation_receipt_sha256":hashlib.sha256(raw).hexdigest(),
        "services":verified,
        "custody_verified":True,
        "provider_effect":False,
        "effect_authority":False,
    }

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