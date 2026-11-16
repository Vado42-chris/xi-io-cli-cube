from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PROFILE_SCHEMA="xiio-installer-runtime-profile-v1"
CONSENT_SCHEMA="xiio-installer-runtime-consent-v1"
UPDATE_REQUEST_SCHEMA="xiio-managed-update-request-v1"

ALLOWED_PERMISSIONS={
    "SERVICE_INSTALL",
    "SERVICE_START_STOP",
    "SERVER_CONFIG_UPDATE",
    "PRODUCT_UPDATE",
    "SECURITY_HOTPATCH",
    "CRITICAL_HOTPATCH",
    "FEATURE_UPDATE",
    "REMOTE_TASK_RECEIVE",
}
ALLOWED_UPDATE_POLICIES={"MANUAL","SECURITY_AUTO","MANAGED"}
SAFE_UNIT=re.compile(r"^[A-Za-z0-9_.@-]+\.service$")
SHA256=re.compile(r"^[0-9a-f]{64}$")

class RuntimeProfileError(RuntimeError):
    pass

@dataclass(frozen=True)
class RuntimeService:
    service_id:str
    unit:str
    health_url:str
    required_permissions:tuple[str,...]
    required:bool
    activation_permission:str|None

@dataclass(frozen=True)
class RuntimeDependency:
    dependency_id:str
    owner_repo:str
    accepted_generation:str
    materializer:str
    required_for_permissions:tuple[str,...]
    expected_unit:str|None

@dataclass(frozen=True)
class RuntimeProfile:
    profile_id:str
    generation:str
    product_id:str
    services:tuple[RuntimeService,...]
    dependencies:tuple[RuntimeDependency,...]
    default_permissions:tuple[str,...]
    optional_permissions:tuple[str,...]
    update_policy_default:str
    raw:dict[str,Any]

def _text(v:Any,label:str)->str:
    s=str(v or "").strip()
    if not s:
        raise RuntimeProfileError(f"{label}_REQUIRED")
    return s

def _permissions(values:Any,label:str)->tuple[str,...]:
    if not isinstance(values,list):
        raise RuntimeProfileError(f"{label}_ARRAY_REQUIRED")
    out=[]
    for raw in values:
        p=_text(raw,label)
        if p not in ALLOWED_PERMISSIONS:
            raise RuntimeProfileError(f"{label}_INVALID:{p}")
        if p not in out:
            out.append(p)
    return tuple(sorted(out))

def load_runtime_profile(path:Path)->RuntimeProfile:
    raw=json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema_version")!=PROFILE_SCHEMA:
        raise RuntimeProfileError("RUNTIME_PROFILE_SCHEMA_INVALID")
    profile_id=_text(raw.get("profile_id"),"PROFILE_ID")
    generation=_text(raw.get("generation"),"GENERATION")
    product_id=_text(raw.get("product_id"),"PRODUCT_ID")
    defaults=_permissions(raw.get("default_permissions",[]),"DEFAULT_PERMISSIONS")
    optional=_permissions(raw.get("optional_permissions",[]),"OPTIONAL_PERMISSIONS")
    if set(defaults)&set(optional):
        raise RuntimeProfileError("DEFAULT_OPTIONAL_PERMISSION_OVERLAP")
    policy=_text(raw.get("update_policy_default","MANUAL"),"UPDATE_POLICY_DEFAULT")
    if policy not in ALLOWED_UPDATE_POLICIES:
        raise RuntimeProfileError("UPDATE_POLICY_DEFAULT_INVALID")
    rows=raw.get("services")
    if not isinstance(rows,list):
        raise RuntimeProfileError("SERVICES_ARRAY_REQUIRED")
    dependencies=[]
    dep_ids=set()
    for i,row in enumerate(raw.get("dependencies",[])):
        if not isinstance(row,dict):
            raise RuntimeProfileError(f"DEPENDENCY_{i}_OBJECT_REQUIRED")
        did=_text(row.get("dependency_id"),f"DEPENDENCY_{i}_ID")
        owner=_text(row.get("owner_repo"),f"DEPENDENCY_{i}_OWNER")
        # Do not reuse name `generation` — that shadows profile.generation and
        # breaks CONSENT_PROFILE_GENERATION_STALE / hotpatch qualification.
        dep_generation=_text(row.get("accepted_generation"),f"DEPENDENCY_{i}_GENERATION")
        materializer=_text(row.get("materializer"),f"DEPENDENCY_{i}_MATERIALIZER")
        expected_unit=row.get("expected_unit")
        if expected_unit is not None:
            expected_unit=_text(expected_unit,f"DEPENDENCY_{i}_UNIT")
        if did in dep_ids:
            raise RuntimeProfileError("DUPLICATE_RUNTIME_DEPENDENCY")
        if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}",dep_generation):
            raise RuntimeProfileError(f"DEPENDENCY_{i}_GENERATION_INVALID")
        if expected_unit is not None and not SAFE_UNIT.fullmatch(expected_unit):
            raise RuntimeProfileError(f"DEPENDENCY_{i}_UNIT_INVALID")
        dep_ids.add(did)
        dependencies.append(RuntimeDependency(
            did,owner,dep_generation,materializer,
            _permissions(row.get("required_for_permissions",[]),f"DEPENDENCY_{i}_PERMISSIONS"),
            expected_unit,
        ))

    services=[]
    ids=set()
    units=set()
    for i,row in enumerate(rows):
        if not isinstance(row,dict):
            raise RuntimeProfileError(f"SERVICE_{i}_OBJECT_REQUIRED")
        sid=_text(row.get("service_id"),f"SERVICE_{i}_ID")
        unit=_text(row.get("unit"),f"SERVICE_{i}_UNIT")
        health=_text(row.get("health_url"),f"SERVICE_{i}_HEALTH_URL")
        if not SAFE_UNIT.fullmatch(unit):
            raise RuntimeProfileError(f"SERVICE_{i}_UNIT_INVALID")
        if not (health.startswith("http://127.0.0.1:") or health.startswith("https://127.0.0.1:")):
            raise RuntimeProfileError(f"SERVICE_{i}_HEALTH_MUST_BE_LOOPBACK")
        if sid in ids or unit in units:
            raise RuntimeProfileError("DUPLICATE_RUNTIME_SERVICE")
        ids.add(sid);units.add(unit)
        required=_permissions(row.get("required_permissions",[]),f"SERVICE_{i}_PERMISSIONS")
        activation_permission=row.get("activation_permission")
        if activation_permission is not None:
            activation_permission=_text(activation_permission,f"SERVICE_{i}_ACTIVATION_PERMISSION")
            if activation_permission not in ALLOWED_PERMISSIONS:
                raise RuntimeProfileError(f"SERVICE_{i}_ACTIVATION_PERMISSION_INVALID")
        services.append(RuntimeService(sid,unit,health,required,bool(row.get("required",False)),activation_permission))
    return RuntimeProfile(profile_id,generation,product_id,tuple(services),tuple(dependencies),defaults,optional,policy,raw)

def compile_user_consent(profile:RuntimeProfile,*,grants:list[str],update_policy:str|None=None,principal_ref:str="local-user")->dict[str,Any]:
    requested=set(_permissions(grants,"GRANT"))
    allowed=set(profile.default_permissions)|set(profile.optional_permissions)
    if not requested.issubset(allowed):
        raise RuntimeProfileError("GRANT_OUTSIDE_PROFILE")
    # Required default permissions are always visible in the consent receipt,
    # but still require the caller's explicit --approve at mutation time.
    effective=set(profile.default_permissions)|requested
    policy=update_policy or profile.update_policy_default
    if policy not in ALLOWED_UPDATE_POLICIES:
        raise RuntimeProfileError("UPDATE_POLICY_INVALID")
    if policy=="SECURITY_AUTO" and "SECURITY_HOTPATCH" not in effective:
        raise RuntimeProfileError("SECURITY_AUTO_REQUIRES_SECURITY_HOTPATCH_GRANT")
    if policy=="MANAGED" and not {"REMOTE_TASK_RECEIVE","PRODUCT_UPDATE"}.issubset(effective):
        raise RuntimeProfileError("MANAGED_POLICY_REQUIRES_REMOTE_TASK_AND_PRODUCT_UPDATE")
    semantic={
        "schema":CONSENT_SCHEMA,
        "profile_id":profile.profile_id,
        "profile_generation":profile.generation,
        "product_id":profile.product_id,
        "principal_ref":principal_ref,
        "permissions":sorted(effective),
        "update_policy":policy,
        "revocable":True,
        "authority_ceiling":"LOCAL_PROFILE_ONLY",
        "provider_effect":False,
    }
    semantic["consent_ref"]="consent:sha256:"+hashlib.sha256(json.dumps(semantic,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return semantic

def qualify_update_request(profile:RuntimeProfile,consent:dict[str,Any],request:dict[str,Any])->dict[str,Any]:
    deny=lambda code:{ "state":"DENIED", "first_red":code, "effect_allowed":False, "provider_effect":False }
    if consent.get("schema")!=CONSENT_SCHEMA:
        return deny("CONSENT_SCHEMA_INVALID")
    if consent.get("profile_id")!=profile.profile_id or consent.get("profile_generation")!=profile.generation:
        return deny("CONSENT_PROFILE_GENERATION_STALE")
    if request.get("schema")!=UPDATE_REQUEST_SCHEMA:
        return deny("UPDATE_REQUEST_SCHEMA_INVALID")
    if request.get("profile_id")!=profile.profile_id:
        return deny("UPDATE_PROFILE_MISMATCH")
    if request.get("from_generation")!=profile.generation:
        return deny("UPDATE_FROM_GENERATION_MISMATCH")
    target=str(request.get("to_generation") or "").strip()
    digest=str(request.get("payload_sha256") or "").strip()
    if not target or not SHA256.fullmatch(digest):
        return deny("UPDATE_IDENTITY_INVALID")
    kind=str(request.get("update_kind") or "").strip()
    permission={
        "SECURITY":"SECURITY_HOTPATCH",
        "CRITICAL":"CRITICAL_HOTPATCH",
        "FEATURE":"FEATURE_UPDATE",
        "PRODUCT":"PRODUCT_UPDATE",
        "CONFIG":"SERVER_CONFIG_UPDATE",
    }.get(kind)
    if not permission:
        return deny("UPDATE_KIND_UNKNOWN")
    granted=set(consent.get("permissions") or [])
    if permission not in granted:
        return deny("UPDATE_PERMISSION_NOT_GRANTED")
    policy=consent.get("update_policy")
    auto_allowed=(
        policy=="MANAGED"
        or (policy=="SECURITY_AUTO" and kind=="SECURITY")
    )
    fresh_user_approval_required=not auto_allowed
    return {
        "state":"ELIGIBLE_FOR_LOCAL_ADMISSION",
        "first_red":None,
        "required_permission":permission,
        "fresh_user_approval_required":fresh_user_approval_required,
        "ward_admission_required":True,
        "switchboard_admission_required":True,
        "idempotency_required":True,
        "rollback_required":True,
        "independent_readback_required":True,
        "effect_allowed":False,
        "provider_effect":False,
        "hard":[
            "CENTRAL_UPDATE_REQUEST!=LOCAL_EFFECT_AUTHORITY",
            "CONSENT_SCOPE!=WARD_ADMISSION",
            "WARD_ADMISSION!=SWITCHBOARD_ATTEMPT",
            "ATTEMPT!=READBACK",
            "UPDATE_FAILURE_REQUIRES_ROLLBACK_OR_UNKNOWN"
        ]
    }
