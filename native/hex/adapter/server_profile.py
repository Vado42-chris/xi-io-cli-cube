"""Transactional HEX server-profile package adapter.

A server package is a reviewed, hash-pinned set of user-owned files plus
systemd --user service identities and loopback probes. The existing installer
kernel owns file mutation/rollback. This module owns only package qualification,
user-service activation and independent local readback.

No sudo. No system units. No arbitrary shell. No central authority.
"""
from __future__ import annotations
import hashlib, json, os, re, urllib.request, urllib.error
from pathlib import Path
from xiio_installer.manifest import load_manifest, verify_payload
from xiio_installer.transaction import plan_install, apply_install, rollback
import permission_profile
import service_profile

SCHEMA='xiio.hex.server-package/v1'
UNIT=re.compile(r'^[A-Za-z0-9_.@:-]+\.service$')
LOOPBACK={'127.0.0.1','localhost','::1','[::1]'}

def sha(b): return hashlib.sha256(b).hexdigest()
def _read(p):
 p=Path(p)
 if p.is_symlink() or not p.is_file() or p.stat().st_nlink!=1: raise ValueError('SERVER_PACKAGE_FILE_UNTRUSTED')
 return p.read_bytes()
def _roots(home):
 h=Path(home)
 return {'HOME':str(h),'XDG_CONFIG_HOME':str(h/'config'),'XDG_DATA_HOME':str(h/'data'),
         'XDG_STATE_HOME':str(h/'state'),'XDG_CACHE_HOME':str(h/'cache')}

def load_server_package(root):
 root=Path(root)
 if not root.is_absolute() or root.is_symlink() or not root.is_dir(): raise ValueError('SERVER_PACKAGE_ROOT_UNTRUSTED')
 manifest_path=root/'server-package.json'
 doc=json.loads(_read(manifest_path))
 allowed={'schema','package_id','version','channel','source_ref','payload_manifest','services'}
 if set(doc)-allowed or doc.get('schema')!=SCHEMA: raise ValueError('SERVER_PACKAGE_SCHEMA_INVALID')
 if not isinstance(doc.get('package_id'),str) or not doc['package_id']: raise ValueError('SERVER_PACKAGE_ID_INVALID')
 if not isinstance(doc.get('version'),str) or not doc['version']: raise ValueError('SERVER_PACKAGE_VERSION_INVALID')
 rel=doc.get('payload_manifest')
 if not isinstance(rel,str) or '/' in rel or rel in ('','.','..'): raise ValueError('SERVER_PAYLOAD_MANIFEST_INVALID')
 payload_manifest=root/rel
 manifest=load_manifest(payload_manifest)
 verify_payload(manifest,root)
 services=doc.get('services')
 if not isinstance(services,list) or not services: raise ValueError('SERVER_SERVICES_REQUIRED')
 seen=set()
 for row in services:
  if not isinstance(row,dict) or set(row)-{'service_id','unit','probe','required'}: raise ValueError('SERVER_SERVICE_FIELDS_INVALID')
  sid=row.get('service_id');unit=row.get('unit');probe=row.get('probe')
  if not isinstance(sid,str) or not sid or sid in seen: raise ValueError('SERVER_SERVICE_ID_INVALID')
  seen.add(sid)
  if not isinstance(unit,str) or not UNIT.fullmatch(unit): raise ValueError('SERVER_USER_UNIT_INVALID')
  # User units must be installed by this exact payload under systemd/user.
  matches=[e for e in manifest.entries if e.destination_scope=='xdg_config' and e.destination=='systemd/user/'+unit]
  if len(matches)!=1: raise ValueError('SERVER_USER_UNIT_NOT_IN_PAYLOAD:'+sid)
  if probe is not None:
   try:u=urllib.parse.urlparse(probe)
   except Exception: raise ValueError('SERVER_PROBE_INVALID')
   if u.scheme not in ('http','https') or u.hostname not in LOOPBACK or u.username or u.password or u.fragment:
    raise ValueError('SERVER_PROBE_NOT_LOOPBACK:'+sid)
 return {'document':doc,'manifest':manifest,'manifest_path':payload_manifest,
         'package_sha256':sha(_read(manifest_path)),'root':root}

def prepare_server_package(package_root,home,permissions):
 pkg=load_server_package(package_root)
 doc=pkg['document']
 service_ids=[x['service_id'] for x in doc['services']]
 for sid in service_ids:
  permission_profile.require_capability(permissions,'configure_services',sid)
  permission_profile.require_capability(permissions,'start_services',sid)
 roots=_roots(home)
 plan=[x.__dict__ for x in plan_install(pkg['manifest'],pkg['root'],roots)]
 return {
  'schema':'xiio.hex.server-package-plan/v1',
  'package_id':doc['package_id'],'version':doc['version'],'source_ref':doc.get('source_ref'),
  'package_sha256':pkg['package_sha256'],'permission_digest':permissions['permission_digest'],
  'services':doc['services'],'file_plan':plan,
  'payload_files':len(plan),'effect_authorized':False,
  'first_red':None,
  'hard':['PACKAGE_PRESENT!=INSTALLED','INSTALL_PLAN!=INSTALL_APPLY',
          'START_ALLOWED!=START_APPROVED','CENTRAL_REQUEST!=LOCAL_AUTHORITY',
          'USER_SERVICE_ONLY','ROLLBACK_REQUIRED'],
 }

def _probe(url):
 if url is None:return {'state':'NO_PROBE_DECLARED'}
 try:
  with urllib.request.urlopen(url,timeout=3) as r:
   body=r.read(4097)
   if len(body)>4096:return {'state':'PROBE_RESPONSE_TOO_LARGE','status':r.status}
   return {'state':'PASS','status':r.status}
 except urllib.error.HTTPError as e:return {'state':'HTTP_FAIL','status':e.code}
 except Exception:return {'state':'UNREACHABLE'}

def apply_server_package(package_root,home,permissions,reviewed_plan,receipt_path,approved):
 if approved is not True: raise ValueError('EXPLICIT_SERVER_PACKAGE_APPROVAL_REQUIRED')
 live=prepare_server_package(package_root,home,permissions)
 if live!=reviewed_plan: raise ValueError('SERVER_PACKAGE_PLAN_CHANGED_SINCE_REVIEW')
 pkg=load_server_package(package_root)
 receipt=apply_install(pkg['manifest'],pkg['root'],Path(receipt_path),_roots(home))
 started=[]
 try:
  r=service_profile._run(['systemctl','--user','daemon-reload'])
  if r.returncode!=0: raise ValueError('SYSTEMD_USER_DAEMON_RELOAD_FAILED')
  for row in live['services']:
   sid=row['service_id'];unit=row['unit']
   permission_profile.require_capability(permissions,'start_services',sid)
   before=service_profile.observe_user_unit(unit)
   r=service_profile._run(['systemctl','--user','start',unit])
   if r.returncode!=0: raise ValueError('SERVER_SERVICE_START_FAILED:'+sid)
   after=service_profile.observe_user_unit(unit)
   if after['active_state']!='active': raise ValueError('SERVER_SERVICE_ACTIVE_READBACK_FAILED:'+sid)
   probe=_probe(row.get('probe'))
   if row.get('required',True) is not False and row.get('probe') and probe['state']!='PASS':
    raise ValueError('SERVER_SERVICE_PROBE_FAILED:'+sid)
   started.append({'service_id':sid,'unit':unit,'before':before,'after':after,'probe':probe})
  return {'schema':'xiio.hex.server-package-effect/v1','state':'INSTALLED_STARTED_READBACK_VERIFIED',
          'package_id':live['package_id'],'package_sha256':live['package_sha256'],
          'permission_digest':permissions['permission_digest'],'services':started,
          'installer_receipt':str(receipt_path),'effect_authorized':True}
 except Exception:
  for row in reversed(started):
   try:service_profile._run(['systemctl','--user','stop',row['unit']])
   except Exception:pass
  try:
   rollback(Path(receipt_path),_roots(home))
   service_profile._run(['systemctl','--user','daemon-reload'])
  except Exception as rb:
   raise ValueError('SERVER_PACKAGE_APPLY_FAILED_ROLLBACK_UNCERTAIN') from rb
  raise

def rollback_server_package(home,permissions,reviewed_plan,receipt_path,approved):
 if approved is not True: raise ValueError('EXPLICIT_SERVER_ROLLBACK_APPROVAL_REQUIRED')
 for row in reviewed_plan.get('services',[]):
  permission_profile.require_capability(permissions,'stop_services',row['service_id'])
  service_profile._run(['systemctl','--user','stop',row['unit']])
 rollback(Path(receipt_path),_roots(home))
 r=service_profile._run(['systemctl','--user','daemon-reload'])
 if r.returncode!=0: raise ValueError('SYSTEMD_USER_DAEMON_RELOAD_FAILED')
 return {'schema':'xiio.hex.server-package-effect/v1','state':'ROLLED_BACK_READBACK_REQUIRED',
         'package_id':reviewed_plan.get('package_id'),'effect_authorized':True}
