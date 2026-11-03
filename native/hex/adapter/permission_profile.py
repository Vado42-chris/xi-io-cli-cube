"""User-owned HEX installation/update permission profile.

This module does not perform effects. It compiles and validates the durable
authorization ceiling that installer/service/hotpatch operations must consume.

Hard:
ACTION_ALLOWED != ACTION_APPROVED
ACTION_APPROVED != EFFECT_AUTHORIZED
CENTRAL_REQUEST != LOCAL_AUTHORITY
PROFILE_GRANTED != IRREVOCABLE
"""
from __future__ import annotations
import hashlib, json

SCHEMA='xiio.hex.permission-profile/v1'
UPDATE_POLICIES={'off','notify','review_each','auto_security'}
CAPABILITIES={
 'install_files',
 'configure_services',
 'start_services',
 'stop_services',
 'receive_central_updates',
 'apply_hotpatches',
 'manage_local_models',
 'configure_remote_access',
}
DEFAULT_PROFILE={
 'schema':SCHEMA,
 'profile_id':'local-standard',
 'capabilities':['install_files'],
 'service_scopes':[],
 'update_policy':'notify',
 'central_updates':False,
 'remote_access':False,
 'revoked':False,
}

def _canon(v):
 return json.dumps(v,sort_keys=True,separators=(',',':')).encode()

def digest(v):
 return hashlib.sha256(_canon(v)).hexdigest()

def compile_profile(raw=None):
 raw=dict(raw or {})
 allowed={'schema','profile_id','capabilities','service_scopes','update_policy',
          'central_updates','remote_access','revoked'}
 if set(raw)-allowed: raise ValueError('PERMISSION_PROFILE_FIELDS_INVALID')
 out=dict(DEFAULT_PROFILE)
 out.update(raw)
 if out.get('schema')!=SCHEMA: raise ValueError('PERMISSION_PROFILE_SCHEMA_INVALID')
 pid=out.get('profile_id')
 if not isinstance(pid,str) or not pid or len(pid)>96: raise ValueError('PERMISSION_PROFILE_ID_INVALID')
 caps=out.get('capabilities')
 if not isinstance(caps,list) or len(caps)!=len(set(caps)) or any(x not in CAPABILITIES for x in caps):
  raise ValueError('PERMISSION_CAPABILITIES_INVALID')
 scopes=out.get('service_scopes')
 if not isinstance(scopes,list) or len(scopes)!=len(set(scopes)) or any(not isinstance(x,str) or not x or len(x)>96 for x in scopes):
  raise ValueError('PERMISSION_SERVICE_SCOPES_INVALID')
 if out.get('update_policy') not in UPDATE_POLICIES: raise ValueError('PERMISSION_UPDATE_POLICY_INVALID')
 for key in ['central_updates','remote_access','revoked']:
  if not isinstance(out.get(key),bool): raise ValueError('PERMISSION_BOOLEAN_INVALID:'+key)
 if out['central_updates'] and 'receive_central_updates' not in caps:
  raise ValueError('CENTRAL_UPDATES_CAPABILITY_REQUIRED')
 if 'apply_hotpatches' in caps and not out['central_updates']:
  raise ValueError('HOTPATCH_REQUIRES_CENTRAL_UPDATE_OPT_IN')
 if out['remote_access'] and 'configure_remote_access' not in caps:
  raise ValueError('REMOTE_ACCESS_CAPABILITY_REQUIRED')
 if out['revoked'] and caps:
  # Revocation is represented as a zero-capability profile.
  raise ValueError('REVOKED_PROFILE_MUST_HAVE_ZERO_CAPABILITIES')
 out['capabilities']=sorted(caps)
 out['service_scopes']=sorted(scopes)
 out['permission_digest']=digest({k:v for k,v in out.items() if k!='permission_digest'})
 return out

def require_capability(profile,capability,service_id=None):
 p=compile_profile({k:v for k,v in profile.items() if k!='permission_digest'})
 if profile.get('permission_digest')!=p['permission_digest']:
  raise ValueError('PERMISSION_PROFILE_DIGEST_MISMATCH')
 if p['revoked']: raise ValueError('PERMISSION_PROFILE_REVOKED')
 if capability not in p['capabilities']: raise ValueError('CAPABILITY_NOT_GRANTED:'+capability)
 if service_id is not None and service_id not in p['service_scopes']:
  raise ValueError('SERVICE_SCOPE_NOT_GRANTED:'+service_id)
 return p

def authorize_central_request(profile,request):
 """Return an authorization decision only, never perform the patch."""
 p=require_capability(profile,'receive_central_updates')
 if not isinstance(request,dict): raise ValueError('CENTRAL_REQUEST_INVALID')
 allowed={'request_id','kind','service_id','severity','target_generation',
          'signed','rollback_available','requires_restart'}
 if set(request)-allowed: raise ValueError('CENTRAL_REQUEST_FIELDS_INVALID')
 kind=request.get('kind')
 if kind not in {'update','hotpatch'}: raise ValueError('CENTRAL_REQUEST_KIND_INVALID')
 service=request.get('service_id')
 if not isinstance(service,str) or not service: raise ValueError('CENTRAL_REQUEST_SERVICE_REQUIRED')
 if service not in p['service_scopes']: raise ValueError('SERVICE_SCOPE_NOT_GRANTED:'+service)
 if request.get('signed') is not True: raise ValueError('CENTRAL_REQUEST_SIGNATURE_REQUIRED')
 if request.get('rollback_available') is not True: raise ValueError('CENTRAL_REQUEST_ROLLBACK_REQUIRED')
 if kind=='hotpatch': require_capability(profile,'apply_hotpatches',service)
 policy=p['update_policy']
 auto=(policy=='auto_security' and request.get('severity')=='security' and kind=='hotpatch')
 return {
  'schema':'xiio.hex.central-update-decision/v1',
  'request_id':request.get('request_id'),
  'service_id':service,
  'kind':kind,
  'allowed_by_profile':True,
  'approval_required':not auto,
  'effect_authorized':False,
  'auto_eligible':auto,
  'permission_digest':p['permission_digest'],
  'hard':['CENTRAL_REQUEST!=LOCAL_AUTHORITY','PROFILE_ALLOW!=EFFECT_AUTHORITY',
          'AUTO_ELIGIBLE!=EFFECT_EXECUTED','ROLLBACK_REQUIRED'],
 }


def _grant_path(base,plan_id):
 from pathlib import Path
 if not isinstance(plan_id,str) or len(plan_id)!=32 or any(c not in '0123456789abcdef' for c in plan_id):
  raise ValueError('PERMISSION_PLAN_ID_INVALID')
 root=Path(base)/'permissions'
 root.mkdir(parents=True,exist_ok=True,mode=0o700)
 return root/(plan_id+'.json')

def save_grant(base,plan_id,profile):
 """Persist a reviewed permission ceiling atomically. No effect is performed."""
 import os, tempfile
 p=compile_profile({k:v for k,v in profile.items() if k!='permission_digest'})
 target=_grant_path(base,plan_id)
 payload=json.dumps(p,sort_keys=True,separators=(',',':')).encode()+b'\n'
 fd,tmp=tempfile.mkstemp(dir=target.parent,prefix='.permission-')
 try:
  with os.fdopen(fd,'wb') as out:
   out.write(payload);out.flush();os.fsync(out.fileno())
  os.chmod(tmp,0o600);os.replace(tmp,target)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
 if target.read_bytes()!=payload: raise ValueError('PERMISSION_GRANT_READBACK_MISMATCH')
 return p

def load_grant(base,plan_id):
 p=_grant_path(base,plan_id)
 try: raw=p.read_bytes()
 except FileNotFoundError: raise ValueError('PERMISSION_GRANT_NOT_FOUND')
 try: doc=json.loads(raw)
 except ValueError: raise ValueError('PERMISSION_GRANT_INVALID')
 checked=compile_profile({k:v for k,v in doc.items() if k!='permission_digest'})
 if doc.get('permission_digest')!=checked['permission_digest']:
  raise ValueError('PERMISSION_GRANT_DIGEST_MISMATCH')
 return checked

def replace_grant(base,plan_id,current_digest,new_profile,approved):
 if approved is not True: raise ValueError('EXPLICIT_PERMISSION_CHANGE_APPROVAL_REQUIRED')
 current=load_grant(base,plan_id)
 if current['permission_digest']!=current_digest: raise ValueError('PERMISSION_CURRENTNESS_CHANGED')
 new=compile_profile(new_profile)
 return save_grant(base,plan_id,new)
