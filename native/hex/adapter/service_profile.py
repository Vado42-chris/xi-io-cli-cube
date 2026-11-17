"""Bounded user-service administration for HEX.

Only existing systemd --user units declared by the packaged XI-IO service
catalog are eligible. This module never uses sudo, never installs system units,
never accepts arbitrary unit names, and never treats central requests as local
effect authority.
"""
from __future__ import annotations
import hashlib, json, os, re, stat, subprocess
from pathlib import Path
import permission_profile

SCHEMA='xiio.hex.user-service-admin/v1'
CATALOG_SCHEMA='xiio.cli.service-catalog/v1'
UNIT=re.compile(r'^[A-Za-z0-9_.@:-]+\.service$')
MAX_CATALOG_BYTES=1024*1024

def _canon(value):
 return json.dumps(value,sort_keys=True,separators=(',',':')).encode()

def _digest(value):
 return hashlib.sha256(_canon(value)).hexdigest()

def _validate_catalog_document(doc):
 if not isinstance(doc,dict) or doc.get('schema')!=CATALOG_SCHEMA or not isinstance(doc.get('services'),list):
  raise ValueError('SERVICE_CATALOG_INVALID')
 seen_ids=set();seen_units=set()
 for row in doc['services']:
  if not isinstance(row,dict): raise ValueError('SERVICE_CATALOG_ROW_INVALID')
  sid=row.get('id')
  if not isinstance(sid,str) or not sid or len(sid)>96 or sid in seen_ids:
   raise ValueError('SERVICE_CATALOG_ID_INVALID:'+str(sid))
  seen_ids.add(sid)
  candidates=row['systemd_candidates'] if 'systemd_candidates' in row else []
  if (not isinstance(candidates,list) or len(candidates)!=len(set(candidates))
      or any(not isinstance(unit,str) or not UNIT.fullmatch(unit) for unit in candidates)):
   raise ValueError('SERVICE_CATALOG_UNITS_INVALID:'+sid)
  for unit in candidates:
   if unit in seen_units: raise ValueError('SERVICE_CATALOG_UNIT_IDENTITY_DUPLICATE:'+unit)
   seen_units.add(unit)
 return doc

def _trusted_directory(fd,code):
 st=os.fstat(fd)
 if (not stat.S_ISDIR(st.st_mode) or st.st_uid not in {0,os.getuid()}
     or stat.S_IMODE(st.st_mode)&0o022):
  raise ValueError(code)

def _read_catalog_bytes(source_root):
 root=Path(source_root)
 if not root.is_absolute(): raise ValueError('SERVICE_CATALOG_ROOT_UNTRUSTED')
 flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC
 try: root_fd=os.open(root,flags)
 except OSError as exc: raise ValueError('SERVICE_CATALOG_ROOT_UNTRUSTED') from exc
 try:
  _trusted_directory(root_fd,'SERVICE_CATALOG_ROOT_UNTRUSTED')
  try: config_fd=os.open('config',flags,dir_fd=root_fd)
  except OSError as exc: raise ValueError('SERVICE_CATALOG_CONFIG_UNTRUSTED') from exc
  try:
   _trusted_directory(config_fd,'SERVICE_CATALOG_CONFIG_UNTRUSTED')
   try:
    fd=os.open('service-catalog.json',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=config_fd)
   except OSError as exc: raise ValueError('SERVICE_CATALOG_FILE_UNTRUSTED') from exc
   try:
    st=os.fstat(fd)
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink!=1
        or st.st_uid not in {0,os.getuid()} or stat.S_IMODE(st.st_mode)&0o022):
     raise ValueError('SERVICE_CATALOG_FILE_UNTRUSTED')
    if st.st_size>MAX_CATALOG_BYTES: raise ValueError('SERVICE_CATALOG_FILE_TOO_LARGE')
    chunks=[];total=0
    while True:
     chunk=os.read(fd,min(65536,MAX_CATALOG_BYTES+1-total))
     if not chunk: break
     chunks.append(chunk);total+=len(chunk)
     if total>MAX_CATALOG_BYTES: raise ValueError('SERVICE_CATALOG_FILE_TOO_LARGE')
    return b''.join(chunks)
   finally: os.close(fd)
  finally: os.close(config_fd)
 finally: os.close(root_fd)

def load_catalog(source_root):
 raw=_read_catalog_bytes(source_root)
 try: doc=json.loads(raw)
 except (ValueError,UnicodeError) as exc: raise ValueError('SERVICE_CATALOG_INVALID') from exc
 _validate_catalog_document(doc)
 return {'document':doc,'catalog_sha256':hashlib.sha256(raw).hexdigest()}

def _catalog_binding(catalog):
 if (not isinstance(catalog,dict) or set(catalog)!={'document','catalog_sha256'}
     or not isinstance(catalog.get('catalog_sha256'),str)
     or not re.fullmatch(r'[a-f0-9]{64}',catalog['catalog_sha256'])):
  raise ValueError('SERVICE_CATALOG_BINDING_REQUIRED')
 return _validate_catalog_document(catalog['document']),catalog['catalog_sha256']

def _service(catalog,service_id):
 matches=[x for x in catalog['services'] if x.get('id')==service_id]
 if len(matches)!=1: raise ValueError('SERVICE_ID_NOT_UNIQUE:'+str(service_id))
 return matches[0]

def _run(args):
 return subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                       timeout=20,env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'})

def observe_user_unit(unit):
 if not isinstance(unit,str) or not UNIT.fullmatch(unit):
  raise ValueError('SERVICE_UNIT_INVALID')
 r=_run(['systemctl','--user','show',unit,'-p','LoadState','-p','ActiveState','-p','SubState'])
 values={}
 for line in r.stdout.splitlines():
  if '=' in line:
   k,v=line.split('=',1);values[k]=v
 return {
  'unit':unit,
  'observed':r.returncode==0 and values.get('LoadState') not in (None,'not-found'),
  'load_state':values.get('LoadState','UNKNOWN'),
  'active_state':values.get('ActiveState','UNKNOWN'),
  'sub_state':values.get('SubState','UNKNOWN'),
 }

def _compile_service_row(catalog,service_id):
 svc=_service(catalog,service_id)
 candidates=svc['systemd_candidates'] if 'systemd_candidates' in svc else []
 if not candidates:
  return {'service_id':service_id,'state':'NO_DECLARED_UNIT','candidate_units':[],
          'selected_unit':None,'declared_probe':svc.get('probe')}
 observed=[observe_user_unit(unit) for unit in candidates]
 present=[row for row in observed if row['observed']]
 state='READY_EXISTING_USER_UNIT' if len(present)==1 else ('AMBIGUOUS_USER_UNITS' if len(present)>1 else 'USER_UNIT_NOT_INSTALLED')
 return {
  'service_id':service_id,'state':state,'candidate_units':observed,
  'selected_unit':present[0]['unit'] if len(present)==1 else None,
  'declared_probe':svc.get('probe'),
 }

def _plan_digest(plan):
 if not isinstance(plan,dict): raise ValueError('SERVICE_PLAN_SCHEMA_INVALID')
 return _digest({key:value for key,value in plan.items() if key!='plan_digest'})

def compile_service_plan(catalog,permissions,service_ids):
 document,catalog_sha256=_catalog_binding(catalog)
 if (not isinstance(service_ids,list) or not service_ids
     or len(service_ids)!=len(set(service_ids))
     or any(not isinstance(sid,str) or not sid for sid in service_ids)):
  raise ValueError('SERVICE_SELECTION_INVALID')
 rows=[]
 for sid in service_ids:
  # Either action can require the inverse action for compensation.
  permission_profile.require_capability(permissions,'start_services',sid)
  permission_profile.require_capability(permissions,'stop_services',sid)
  rows.append(_compile_service_row(document,sid))
 plan={
  'schema':SCHEMA,'catalog_sha256':catalog_sha256,
  'permission_digest':permissions['permission_digest'],'service_ids':list(service_ids),
  'services':rows,'effect_authorized':False,
  'can_start':all(row['state']=='READY_EXISTING_USER_UNIT' for row in rows),
  'first_red':next((row['state'] for row in rows if row['state']!='READY_EXISTING_USER_UNIT'),None),
  'hard':['CATALOG_ENTRY!=INSTALLED_UNIT','UNIT_PRESENT!=SERVICE_HEALTHY',
          'START_ALLOWED!=START_APPROVED','CENTRAL_REQUEST!=LOCAL_EFFECT_AUTHORITY',
          'SYSTEM_SERVICE!=USER_SERVICE','PLAN_REVIEW!=LIVE_CATALOG'],
 }
 plan['plan_digest']=_plan_digest(plan)
 return plan

def _restore_attempts(attempts,permissions):
 failures=[]
 for row in reversed(attempts):
  sid=row['service_id'];unit=row['unit'];wanted=row['before'].get('active_state')
  try:
   current=observe_user_unit(unit)
   if wanted=='active' and (current.get('observed') is not True or current.get('active_state')!='active'):
    permission_profile.require_capability(permissions,'start_services',sid)
    result=_run(['systemctl','--user','start',unit])
    if result.returncode!=0: raise ValueError('SERVICE_COMPENSATION_START_FAILED:'+sid)
    current=observe_user_unit(unit)
   elif wanted=='inactive' and (current.get('observed') is not True or current.get('active_state')!='inactive'):
    permission_profile.require_capability(permissions,'stop_services',sid)
    result=_run(['systemctl','--user','stop',unit])
    if result.returncode!=0: raise ValueError('SERVICE_COMPENSATION_STOP_FAILED:'+sid)
    current=observe_user_unit(unit)
   if current.get('observed') is not True or current.get('active_state')!=wanted:
    raise ValueError('SERVICE_COMPENSATION_READBACK_FAILED:'+sid)
   row['compensation']={'state':'RESTORED','after':current}
  except Exception as exc:
   failures.append((sid,exc))
 if failures:
  raise ValueError('SERVICE_ACTION_PARTIAL_EFFECT_UNCERTAIN:'+','.join(sid for sid,_ in failures)) from failures[0][1]

def _validate_apply_plan(source_root,plan,permissions):
 if not isinstance(plan,dict) or plan.get('schema')!=SCHEMA:
  raise ValueError('SERVICE_PLAN_SCHEMA_INVALID')
 if plan.get('plan_digest')!=_plan_digest(plan):
  raise ValueError('SERVICE_PLAN_DIGEST_MISMATCH')
 if plan.get('permission_digest')!=permissions.get('permission_digest'):
  raise ValueError('SERVICE_PERMISSION_DIGEST_CHANGED')
 catalog=load_catalog(source_root)
 document,catalog_sha256=_catalog_binding(catalog)
 if plan.get('catalog_sha256')!=catalog_sha256:
  raise ValueError('SERVICE_CATALOG_CHANGED_SINCE_REVIEW')
 ids=plan.get('service_ids');rows=plan.get('services')
 if (not isinstance(ids,list) or not ids or len(ids)!=len(set(ids))
     or not isinstance(rows,list) or len(rows)!=len(ids)):
  raise ValueError('SERVICE_PLAN_SERVICES_INVALID')
 live=[]
 for sid,row in zip(ids,rows):
  if not isinstance(row,dict) or row.get('service_id')!=sid:
   raise ValueError('SERVICE_PLAN_SERVICE_IDENTITY_INVALID')
  permission_profile.require_capability(permissions,'start_services',sid)
  permission_profile.require_capability(permissions,'stop_services',sid)
  current=_compile_service_row(document,sid)
  if current!=row: raise ValueError('SERVICE_PLAN_STALE_OR_CATALOG_MISMATCH:'+sid)
  if current.get('state')!='READY_EXISTING_USER_UNIT' or not current.get('selected_unit'):
   raise ValueError('SERVICE_PLAN_NOT_READY:'+sid)
  live.append(current)
 return live

def apply_service_action(plan,permissions,action,approved,*,catalog_source_root=None):
 if action not in {'start','stop'}: raise ValueError('SERVICE_ACTION_INVALID')
 if approved is not True: raise ValueError('EXPLICIT_SERVICE_APPROVAL_REQUIRED')
 if catalog_source_root is None: raise ValueError('SERVICE_CATALOG_SOURCE_REQUIRED')
 rows=_validate_apply_plan(catalog_source_root,plan,permissions)
 expected='active' if action=='start' else 'inactive'
 attempts=[]
 try:
  for row in rows:
   sid=row['service_id'];unit=row['selected_unit']
   before=observe_user_unit(unit)
   if before.get('observed') is not True or before.get('active_state') not in {'active','inactive'}:
    raise ValueError('SERVICE_PRE_ACTION_STATE_UNVERIFIED:'+sid)
   attempt={'service_id':sid,'unit':unit,'before':before,'after':None,'returncode':None}
   attempts.append(attempt)
   result=_run(['systemctl','--user',action,unit]);attempt['returncode']=result.returncode
   after=observe_user_unit(unit);attempt['after']=after
   if result.returncode!=0: raise ValueError('SERVICE_'+action.upper()+'_FAILED:'+sid)
   if after.get('observed') is not True or after.get('active_state')!=expected:
    raise ValueError('SERVICE_'+action.upper()+'_READBACK_FAILED:'+sid)
 except Exception:
  try:_restore_attempts(attempts,permissions)
  except Exception as compensation:
   raise ValueError('SERVICE_ACTION_PARTIAL_EFFECT_UNCERTAIN') from compensation
  raise
 return {
  'schema':'xiio.hex.user-service-effect/v1','action':action,
  'state':'READBACK_VERIFIED','results':attempts,
  'catalog_sha256':plan['catalog_sha256'],'plan_digest':plan['plan_digest'],
  'permission_digest':permissions['permission_digest'],
  'effect_authorized':True,'central_authority':False,
 }
