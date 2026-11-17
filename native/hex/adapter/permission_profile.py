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
import fcntl, hashlib, json, os, re, secrets, stat
from pathlib import Path

SCHEMA='xiio.hex.permission-profile/v1'
GRANT_SCHEMA='xiio.hex.permission-grant/v1'
UPDATE_POLICIES={'off','notify','review_each','auto_security'}
CAPABILITIES={
 'install_files','configure_services','start_services','stop_services',
 'receive_central_updates','apply_hotpatches','manage_local_models',
 'configure_remote_access',
}
DEFAULT_PROFILE={
 'schema':SCHEMA,'profile_id':'local-standard','capabilities':['install_files'],
 'service_scopes':[],'update_policy':'notify','central_updates':False,
 'remote_access':False,'revoked':False,
}
MAX_GRANT_BYTES=64*1024
SHA256=re.compile(r'^[a-f0-9]{64}$')

def _canon(v):
 return json.dumps(v,sort_keys=True,separators=(',',':')).encode()

def digest(v):
 return hashlib.sha256(_canon(v)).hexdigest()

def compile_profile(raw=None):
 raw=dict(raw or {})
 allowed={'schema','profile_id','capabilities','service_scopes','update_policy',
          'central_updates','remote_access','revoked'}
 if set(raw)-allowed: raise ValueError('PERMISSION_PROFILE_FIELDS_INVALID')
 out=dict(DEFAULT_PROFILE);out.update(raw)
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
 if out['revoked'] and caps: raise ValueError('REVOKED_PROFILE_MUST_HAVE_ZERO_CAPABILITIES')
 out['capabilities']=sorted(caps);out['service_scopes']=sorted(scopes)
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
 auto=(p['update_policy']=='auto_security' and request.get('severity')=='security' and kind=='hotpatch')
 return {
  'schema':'xiio.hex.central-update-decision/v1','request_id':request.get('request_id'),
  'service_id':service,'kind':kind,'allowed_by_profile':True,
  'approval_required':not auto,'effect_authorized':False,'auto_eligible':auto,
  'permission_digest':p['permission_digest'],
  'hard':['CENTRAL_REQUEST!=LOCAL_AUTHORITY','PROFILE_ALLOW!=EFFECT_AUTHORITY',
          'AUTO_ELIGIBLE!=EFFECT_EXECUTED','ROLLBACK_REQUIRED'],
 }

def _plan_name(plan_id):
 if not isinstance(plan_id,str) or len(plan_id)!=32 or any(c not in '0123456789abcdef' for c in plan_id):
  raise ValueError('PERMISSION_PLAN_ID_INVALID')
 return plan_id+'.json'

def _trusted_base(fd):
 st=os.fstat(fd)
 if (not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid()
     or stat.S_IMODE(st.st_mode)&0o022):
  raise ValueError('PERMISSION_BASE_UNTRUSTED')

def _open_permissions_root(base,create):
 root=Path(base)
 if not root.is_absolute(): raise ValueError('PERMISSION_BASE_UNTRUSTED')
 flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC
 try: base_fd=os.open(root,flags)
 except OSError as exc: raise ValueError('PERMISSION_BASE_UNTRUSTED') from exc
 try:
  _trusted_base(base_fd)
  try: permissions_fd=os.open('permissions',flags,dir_fd=base_fd)
  except FileNotFoundError:
   if not create: raise ValueError('PERMISSION_GRANT_NOT_FOUND')
   try:
    os.mkdir('permissions',0o700,dir_fd=base_fd);os.fsync(base_fd)
   except FileExistsError: pass
   try: permissions_fd=os.open('permissions',flags,dir_fd=base_fd)
   except OSError as exc: raise ValueError('PERMISSION_ROOT_UNTRUSTED') from exc
  except OSError as exc: raise ValueError('PERMISSION_ROOT_UNTRUSTED') from exc
  st=os.fstat(permissions_fd)
  if (not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid()
      or stat.S_IMODE(st.st_mode)!=0o700):
   os.close(permissions_fd);raise ValueError('PERMISSION_ROOT_UNTRUSTED')
  return permissions_fd
 finally: os.close(base_fd)

def _open_grant_lock(root_fd,name):
 lock_name='.'+name+'.lock'
 try:
  fd=os.open(lock_name,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=root_fd)
 except OSError as exc: raise ValueError('PERMISSION_GRANT_LOCK_UNTRUSTED') from exc
 try:
  st=os.fstat(fd)
  if (not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid()
      or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)!=0o600):
   raise ValueError('PERMISSION_GRANT_LOCK_UNTRUSTED')
  fcntl.flock(fd,fcntl.LOCK_EX)
  return fd
 except Exception:
  os.close(fd);raise

def _read_file(root_fd,name,missing_code='PERMISSION_GRANT_NOT_FOUND'):
 try: fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=root_fd)
 except FileNotFoundError: raise ValueError(missing_code)
 except OSError as exc: raise ValueError('PERMISSION_GRANT_UNTRUSTED') from exc
 try:
  st=os.fstat(fd)
  if (not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid()
      or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)!=0o600):
   raise ValueError('PERMISSION_GRANT_UNTRUSTED')
  if st.st_size>MAX_GRANT_BYTES: raise ValueError('PERMISSION_GRANT_TOO_LARGE')
  chunks=[];total=0
  while True:
   chunk=os.read(fd,min(8192,MAX_GRANT_BYTES+1-total))
   if not chunk: break
   chunks.append(chunk);total+=len(chunk)
   if total>MAX_GRANT_BYTES: raise ValueError('PERMISSION_GRANT_TOO_LARGE')
  return b''.join(chunks)
 finally: os.close(fd)

def _grant_document(plan_id,profile):
 core={'schema':GRANT_SCHEMA,'plan_id':plan_id,'profile':profile}
 return {**core,'grant_digest':digest(core)}

def _validated_grant(raw,plan_id):
 try: doc=json.loads(raw)
 except (ValueError,UnicodeError) as exc: raise ValueError('PERMISSION_GRANT_INVALID') from exc
 if not isinstance(doc,dict) or set(doc)!={'schema','plan_id','profile','grant_digest'}:
  raise ValueError('PERMISSION_GRANT_INVALID')
 if doc.get('schema')!=GRANT_SCHEMA: raise ValueError('PERMISSION_GRANT_INVALID')
 if doc.get('plan_id')!=plan_id: raise ValueError('PERMISSION_GRANT_PLAN_MISMATCH')
 profile=doc.get('profile')
 if not isinstance(profile,dict): raise ValueError('PERMISSION_GRANT_INVALID')
 checked=compile_profile({k:v for k,v in profile.items() if k!='permission_digest'})
 if profile!=checked: raise ValueError('PERMISSION_GRANT_PROFILE_INVALID')
 core={'schema':GRANT_SCHEMA,'plan_id':plan_id,'profile':checked}
 if doc.get('grant_digest')!=digest(core):
  raise ValueError('PERMISSION_GRANT_ENVELOPE_DIGEST_MISMATCH')
 return checked

def _read_grant(root_fd,name,plan_id):
 return _validated_grant(_read_file(root_fd,name),plan_id)

def _write_grant(root_fd,name,plan_id,profile,replace):
 document=_grant_document(plan_id,profile);payload=_canon(document)+b'\n'
 tmp='.'+name+'.'+secrets.token_hex(8)+'.tmp';linked=False
 try:
  fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=root_fd)
  try:
   view=memoryview(payload)
   while view:
    written=os.write(fd,view)
    if written<=0: raise OSError('short permission grant write')
    view=view[written:]
   os.fsync(fd)
  finally: os.close(fd)
  if replace:
   os.replace(tmp,name,src_dir_fd=root_fd,dst_dir_fd=root_fd)
  else:
   try:
    os.link(tmp,name,src_dir_fd=root_fd,dst_dir_fd=root_fd,follow_symlinks=False);linked=True
   except FileExistsError as exc:
    raise ValueError('PERMISSION_GRANT_ALREADY_EXISTS') from exc
   os.unlink(tmp,dir_fd=root_fd);linked=False
  os.fsync(root_fd)
 except Exception:
  try: os.unlink(tmp,dir_fd=root_fd)
  except OSError: pass
  if linked:
   try: os.unlink(name,dir_fd=root_fd)
   except OSError: pass
  raise
 reread=_read_grant(root_fd,name,plan_id)
 if reread!=profile: raise ValueError('PERMISSION_GRANT_READBACK_MISMATCH')
 return reread

def _compiled_input(profile):
 if not isinstance(profile,dict): raise ValueError('PERMISSION_PROFILE_FIELDS_INVALID')
 return compile_profile({k:v for k,v in profile.items() if k!='permission_digest'})

def save_grant(base,plan_id,profile,approved=False):
 """Create one explicitly approved permission ceiling. Existing grants require replacement."""
 if approved is not True: raise ValueError('EXPLICIT_PERMISSION_GRANT_APPROVAL_REQUIRED')
 name=_plan_name(plan_id);compiled=_compiled_input(profile)
 root_fd=_open_permissions_root(base,True)
 try:
  lock_fd=_open_grant_lock(root_fd,name)
  try:
   try: _read_file(root_fd,name)
   except ValueError as exc:
    if str(exc)!='PERMISSION_GRANT_NOT_FOUND': raise
   else: raise ValueError('PERMISSION_GRANT_ALREADY_EXISTS')
   return _write_grant(root_fd,name,plan_id,compiled,False)
  finally:
   fcntl.flock(lock_fd,fcntl.LOCK_UN);os.close(lock_fd)
 finally: os.close(root_fd)

def load_grant(base,plan_id):
 name=_plan_name(plan_id);root_fd=_open_permissions_root(base,False)
 try: return _read_grant(root_fd,name,plan_id)
 finally: os.close(root_fd)

def replace_grant(base,plan_id,current_digest,new_profile,approved):
 if approved is not True: raise ValueError('EXPLICIT_PERMISSION_CHANGE_APPROVAL_REQUIRED')
 if not isinstance(current_digest,str) or not SHA256.fullmatch(current_digest):
  raise ValueError('PERMISSION_CURRENT_DIGEST_INVALID')
 name=_plan_name(plan_id);new=_compiled_input(new_profile)
 root_fd=_open_permissions_root(base,False)
 try:
  lock_fd=_open_grant_lock(root_fd,name)
  try:
   current=_read_grant(root_fd,name,plan_id)
   if current['permission_digest']!=current_digest:
    raise ValueError('PERMISSION_CURRENTNESS_CHANGED')
   if new['permission_digest']==current_digest: return current
   return _write_grant(root_fd,name,plan_id,new,True)
  finally:
   fcntl.flock(lock_fd,fcntl.LOCK_UN);os.close(lock_fd)
 finally: os.close(root_fd)

def require_effect_authorization(decision,authorization,approved=False):
 """Join provider proposal to local XI-IO authority. Refs are receipts, not secrets."""
 if not isinstance(decision,dict) or decision.get('schema')!='xiio.hex.central-update-decision/v1':
  raise ValueError('CENTRAL_DECISION_INVALID')
 if decision.get('allowed_by_profile') is not True or decision.get('effect_authorized') is not False:
  raise ValueError('CENTRAL_DECISION_NOT_ADMISSIBLE')
 if not isinstance(authorization,dict): raise ValueError('EFFECT_AUTHORIZATION_REQUIRED')
 allowed={'ward_admission','ward_admission_ref','work_ref','assignment_ref','attempt_ref',
          'generation_ref','currentness_ref','effect_authorization_ref','permission_digest'}
 if set(authorization)-allowed: raise ValueError('EFFECT_AUTHORIZATION_FIELDS_INVALID')
 required=['ward_admission_ref','work_ref','assignment_ref','attempt_ref','generation_ref',
           'currentness_ref','effect_authorization_ref','permission_digest']
 for key in required:
  value=authorization.get(key)
  if not isinstance(value,str) or not value.strip():
   raise ValueError('EFFECT_AUTHORIZATION_REF_REQUIRED:'+key)
 if authorization.get('ward_admission') is not True: raise ValueError('WARD_ADMISSION_REQUIRED')
 if authorization['permission_digest']!=decision.get('permission_digest'):
  raise ValueError('EFFECT_PERMISSION_DIGEST_MISMATCH')
 if decision.get('approval_required') is True and approved is not True:
  raise ValueError('EXPLICIT_HOTPATCH_APPROVAL_REQUIRED')
 return {
  'schema':'xiio.hex.effect-authorization/v1',**authorization,
  'central_request_id':decision.get('request_id'),'service_id':decision.get('service_id'),
  'kind':decision.get('kind'),'authorized':True,
  'hard':['CENTRAL_REQUEST!=WARD_AUTHORITY','PROFILE_ALLOW!=EFFECT_AUTHORITY',
          'WARD_RECEIPT_REQUIRED','CURRENTNESS_RECEIPT_REQUIRED'],
 }
