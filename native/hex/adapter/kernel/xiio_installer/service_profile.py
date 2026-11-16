from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from .consent import authorize

SCHEMA="xiio-installer-service-profile-v1"

class ServiceProfileError(RuntimeError): pass

def load_service_profile(path:Path)->dict[str,Any]:
    raw=json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema")!=SCHEMA: raise ServiceProfileError("SERVICE_PROFILE_SCHEMA_INVALID")
    product_id=str(raw.get("product_id") or "").strip()
    if not product_id: raise ServiceProfileError("SERVICE_PROFILE_PRODUCT_ID_REQUIRED")
    raw["product_id"]=product_id
    services=raw.get("services")
    if not isinstance(services,list) or not services: raise ServiceProfileError("SERVICE_PROFILE_SERVICES_REQUIRED")
    seen=set()
    for row in services:
        if not isinstance(row,dict): raise ServiceProfileError("SERVICE_PROFILE_ENTRY_INVALID")
        sid=str(row.get("service_id") or "").strip()
        unit=str(row.get("unit_name") or "").strip()
        if not sid or sid in seen: raise ServiceProfileError("SERVICE_ID_INVALID")
        seen.add(sid)
        if not unit.startswith("xi-io-") or not unit.endswith(".service") or "/" in unit:
            raise ServiceProfileError("SERVICE_UNIT_INVALID")
        if row.get("start_on_install") not in (True,False):
            raise ServiceProfileError("SERVICE_START_POLICY_INVALID")
        health=row.get("health_url")
        if health is not None:
            p=urlparse(str(health))
            if p.scheme not in ("http","https") or p.hostname not in ("127.0.0.1","localhost") or p.username or p.password:
                raise ServiceProfileError("SERVICE_HEALTH_URL_NOT_LOOPBACK")
    return raw

def compile_service_activation(profile:dict[str,Any],receipt:dict[str,Any],*,principal_ref:str,device_ref:str)->dict[str,Any]:
    rows=[]
    for svc in profile["services"]:
        consent=authorize(
            receipt,scope="start_local_services",principal_ref=principal_ref,device_ref=device_ref,
            product_id=profile.get("product_id"),service_id=svc["service_id"]
        )
        requested=svc["start_on_install"] is True
        rows.append({
            "service_id":svc["service_id"],
            "unit_name":svc["unit_name"],
            "requested":requested,
            "consent_state":consent["state"],
            "health_url":svc.get("health_url"),
            "action":"START_AND_ENABLE" if requested and consent["state"]=="CONSENTED" else "NO_EFFECT",
        })
    return {
      "schema":"xiio-installer-service-activation/v1",
      "product_id":profile.get("product_id"),
      "profile_id":profile.get("profile_id"),
      "consent_sha256":receipt.get("consent_sha256"),
      "services":rows,
      "execution_owner":"XIIO_CLI_SWITCHBOARD_WARD",
      "effect_authority":False,
      "hard":[
        "INSTALLER_ACTIVATION_PACKET!=EFFECT_AUTHORITY",
        "CENTRAL_REQUEST!=LOCAL_CONSENT",
        "LOCAL_CONSENT!=WARD_AUTHORITY",
        "SERVICE_START!=HEALTH_READBACK",
        "HEALTH_READBACK!=RETURN_CONSUMED",
      ],
    }
