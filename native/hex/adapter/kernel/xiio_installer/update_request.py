from __future__ import annotations
import json, re
from pathlib import Path
from typing import Any
from .consent import authorize

SHA256_RE=re.compile(r"^[a-f0-9]{64}$")
KINDS={
  "security_hotpatch":"automatic_security_hotpatch",
  "product_update":"automatic_product_updates",
  "server_config_update":"central_update_requests",
}

class UpdateRequestError(RuntimeError): pass

def load_update_request(path:Path)->dict[str,Any]:
    raw=json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema")!="xiio-installer-update-request-v1":
        raise UpdateRequestError("UPDATE_REQUEST_SCHEMA_INVALID")
    for key in ("request_id","product_id","update_kind","source_generation","target_generation","artifact_sha256"):
        if not isinstance(raw.get(key),str) or not raw[key].strip():
            raise UpdateRequestError("UPDATE_REQUEST_FIELD_MISSING:"+key)
    if raw["update_kind"] not in KINDS:
        raise UpdateRequestError("UPDATE_KIND_INVALID")
    if not SHA256_RE.fullmatch(raw["artifact_sha256"]):
        raise UpdateRequestError("UPDATE_ARTIFACT_DIGEST_INVALID")
    services=raw.get("service_ids",[])
    if not isinstance(services,list) or not all(isinstance(x,str) and x.strip() for x in services):
        raise UpdateRequestError("UPDATE_SERVICE_IDS_INVALID")
    if raw["source_generation"]==raw["target_generation"]:
        raise UpdateRequestError("UPDATE_GENERATION_NOT_ADVANCING")
    return raw

def authorize_update(request:dict[str,Any],receipt:dict[str,Any],*,principal_ref:str,device_ref:str)->dict[str,Any]:
    scope=KINDS[request["update_kind"]]
    service_results=[]
    service_ids=request.get("service_ids") or [None]
    for service_id in service_ids:
        result=authorize(
          receipt,scope=scope,principal_ref=principal_ref,device_ref=device_ref,
          product_id=request["product_id"],service_id=service_id
        )
        service_results.append({"service_id":service_id,"state":result["state"],"reason":result.get("reason")})
    denied=[x for x in service_results if x["state"]!="CONSENTED"]
    return {
      "schema":"xiio-installer-update-authorization/v1",
      "request_id":request["request_id"],
      "product_id":request["product_id"],
      "update_kind":request["update_kind"],
      "source_generation":request["source_generation"],
      "target_generation":request["target_generation"],
      "artifact_sha256":request["artifact_sha256"],
      "consent_sha256":receipt.get("consent_sha256"),
      "state":"DENIED" if denied else "AUTHORIZED_FOR_WARD_ADMISSION",
      "service_results":service_results,
      "effect_authority":False,
      "hard":[
        "CENTRAL_UPDATE_REQUEST!=LOCAL_AUTHORITY",
        "LOCAL_CONSENT!=WARD_ADMISSION",
        "WARD_ADMISSION!=EFFECT_READBACK",
        "UPDATE_APPLY_REQUIRES_ROLLBACK_PLAN",
        "UPDATE_RESULT!=APPLY_RETURN",
      ],
    }
