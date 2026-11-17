from __future__ import annotations
from typing import Any
class RunningGenerationError(RuntimeError): pass
def _text(value:Any,code:str)->str:
 out=str(value or "").strip()
 if not out: raise RunningGenerationError(code)
 return out
def verify_running_generation(*,declared_generation:str,health:dict[str,Any],generation_field:str="generation")->dict[str,Any]:
 declared=_text(declared_generation,"RUNNING_GENERATION_DECLARED_REQUIRED")
 if not isinstance(health,dict): raise RunningGenerationError("RUNNING_GENERATION_HEALTH_OBJECT_REQUIRED")
 running=_text(health.get(generation_field),"RUNNING_GENERATION_READBACK_REQUIRED")
 if running!=declared: raise RunningGenerationError("RUNNING_GENERATION_MISMATCH")
 return {"schema":"xiio.installer-running-generation-readback/v1","state":"CURRENT","declared_generation":declared,"running_generation":running,"generation_field":generation_field,"provider_effect":False,"effect_authority":False}
