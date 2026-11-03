"""Bounded user-service administration for HEX.

Only existing systemd --user units declared by the packaged XI-IO service
catalog are eligible. This module never uses sudo, never installs system units,
never accepts arbitrary unit names, and never treats central requests as local
effect authority.
"""
from __future__ import annotations
import json, subprocess
from pathlib import Path
import permission_profile

SCHEMA='xiio.hex.user-service-admin/v1'

def load_catalog(source_root):
 p=Path(source_root)/'config/service-catalog.json'
 doc=json.loads(p.read_text())
 if doc.get('schema')!='xiio.cli.service-catalog/v1' or not isinstance(doc.get('services'),list):
  raise ValueError('SERVICE_CATALOG_INVALID')
 return doc

def _service(catalog,service_id):
 matches=[x for x in catalog['services'] if x.get('id')==service_id]
 if len(matches)!=1: raise ValueError('SERVICE_ID_NOT_UNIQUE:'+str(service_id))
 return matches[0]

def _run(args):
 r=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                  timeout=20,env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'})
 return r

def observe_user_unit(unit):
 if not isinstance(unit,str) or not unit.endswith('.service') or '/' in unit:
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

def compile_service_plan(catalog,permissions,service_ids):
 if not isinstance(service_ids,list) or not service_ids or len(service_ids)!=len(set(service_ids)):
  raise ValueError('SERVICE_SELECTION_INVALID')
 rows=[]
 for sid in service_ids:
  permission_profile.require_capability(permissions,'start_services',sid)
  svc=_service(catalog,sid)
  candidates=svc.get('systemd_candidates') or []
  if not isinstance(candidates,list) or not candidates:
   rows.append({'service_id':sid,'state':'NO_DECLARED_UNIT','candidate_units':[],'selected_unit':None})
   continue
  observed=[observe_user_unit(x) for x in candidates]
  present=[x for x in observed if x['observed']]
  state='READY_EXISTING_USER_UNIT' if len(present)==1 else ('AMBIGUOUS_USER_UNITS' if len(present)>1 else 'USER_UNIT_NOT_INSTALLED')
  rows.append({
   'service_id':sid,
   'state':state,
   'candidate_units':observed,
   'selected_unit':present[0]['unit'] if len(present)==1 else None,
   'declared_probe':svc.get('probe'),
  })
 return {
  'schema':SCHEMA,
  'permission_digest':permissions['permission_digest'],
  'services':rows,
  'effect_authorized':False,
  'can_start':all(x['state']=='READY_EXISTING_USER_UNIT' for x in rows),
  'first_red':next((x['state'] for x in rows if x['state']!='READY_EXISTING_USER_UNIT'),None),
  'hard':['CATALOG_ENTRY!=INSTALLED_UNIT','UNIT_PRESENT!=SERVICE_HEALTHY',
          'START_ALLOWED!=START_APPROVED','CENTRAL_REQUEST!=LOCAL_EFFECT_AUTHORITY',
          'SYSTEM_SERVICE!=USER_SERVICE'],
 }

def apply_service_action(plan,permissions,action,approved):
 if action not in {'start','stop'}: raise ValueError('SERVICE_ACTION_INVALID')
 if approved is not True: raise ValueError('EXPLICIT_SERVICE_APPROVAL_REQUIRED')
 if plan.get('schema')!=SCHEMA: raise ValueError('SERVICE_PLAN_SCHEMA_INVALID')
 if plan.get('permission_digest')!=permissions.get('permission_digest'):
  raise ValueError('SERVICE_PERMISSION_DIGEST_CHANGED')
 capability='start_services' if action=='start' else 'stop_services'
 results=[]
 for row in plan.get('services',[]):
  sid=row.get('service_id')
  permission_profile.require_capability(permissions,capability,sid)
  if row.get('state')!='READY_EXISTING_USER_UNIT' or not row.get('selected_unit'):
   raise ValueError('SERVICE_PLAN_NOT_READY:'+str(sid))
  unit=row['selected_unit']
  before=observe_user_unit(unit)
  r=_run(['systemctl','--user',action,unit])
  if r.returncode!=0: raise ValueError('SERVICE_'+action.upper()+'_FAILED:'+sid)
  after=observe_user_unit(unit)
  expected='active' if action=='start' else 'inactive'
  if after['active_state']!=expected:
   raise ValueError('SERVICE_'+action.upper()+'_READBACK_FAILED:'+sid)
  results.append({'service_id':sid,'unit':unit,'before':before,'after':after})
 return {
  'schema':'xiio.hex.user-service-effect/v1',
  'action':action,
  'state':'READBACK_VERIFIED',
  'results':results,
  'permission_digest':permissions['permission_digest'],
  'effect_authorized':True,
  'central_authority':False,
 }
