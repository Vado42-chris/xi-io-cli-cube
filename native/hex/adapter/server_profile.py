"""Transactional HEX server-profile package adapter.

A server package is a reviewed, hash-pinned set of user-owned files plus
systemd --user service identities and loopback probes. The existing installer
kernel owns file mutation/rollback. This module owns only package qualification,
user-service activation and independent local readback.

No sudo. No system units. No arbitrary shell. No central authority.
"""
from __future__ import annotations
import hashlib, json, os, re, urllib.request, urllib.error, urllib.parse
from pathlib import Path
from xiio_installer.manifest import load_manifest, verify_payload
from xiio_installer.transaction import plan_install, apply_install, rollback
import permission_profile
import service_profile

SCHEMA='xiio.hex.server-package/v1'
PLAN_SCHEMA='xiio.hex.server-package-plan/v1'
INSTALLER_RECEIPT_SCHEMA='xiio-installer-receipt-v1'
UNIT=re.compile(r'^[A-Za-z0-9_.@:-]+\.service$')
LOOPBACK={'127.0.0.1','localhost','::1','[::1]'}

def sha(b): return hashlib.sha256(b).hexdigest()
def _read(p):
 p=Path(p)
 if p.is_symlink() or not p.is_file() or p.stat().st_nlink!=1: raise ValueError('SERVER_PACKAGE_FILE_UNTRUSTED')
 return p.read_bytes()
def _roots(home):
 h=Path(home)
 # The reviewed server plan binds deterministic user-owned destinations.
 # Ambient process XDG variables may differ between prepare/apply contexts and
 # must not silently redirect a consequential install.
 return {'HOME':str(h),
         'XDG_CONFIG_HOME':str(h/'.config'),
         'XDG_DATA_HOME':str(h/'.local/share'),
         'XDG_STATE_HOME':str(h/'.local/state'),
         'XDG_CACHE_HOME':str(h/'.cache')}

def _manifest_identity(manifest):
 return {'product_id':manifest.product_id,'profile_id':manifest.profile_id,
         'version':manifest.version,'channel':manifest.channel,'fixture':manifest.fixture}

def load_server_package(root):
 root=Path(root)
 if not root.is_absolute() or root.is_symlink() or not root.is_dir(): raise ValueError('SERVER_PACKAGE_ROOT_UNTRUSTED')
 manifest_path=root/'server-package.json'
 descriptor_bytes=_read(manifest_path)
 doc=json.loads(descriptor_bytes)
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
 seen=set();seen_units=set()
 for row in services:
  if not isinstance(row,dict) or set(row)-{'service_id','unit','probe','required'}: raise ValueError('SERVER_SERVICE_FIELDS_INVALID')
  sid=row.get('service_id');unit=row.get('unit');probe=row.get('probe')
  if not isinstance(sid,str) or not sid or sid in seen: raise ValueError('SERVER_SERVICE_ID_INVALID')
  seen.add(sid)
  if not isinstance(unit,str) or not UNIT.fullmatch(unit): raise ValueError('SERVER_USER_UNIT_INVALID')
  if unit in seen_units: raise ValueError('SERVER_USER_UNIT_IDENTITY_DUPLICATE:'+unit)
  seen_units.add(unit)
  if 'required' in row and not isinstance(row['required'],bool): raise ValueError('SERVER_SERVICE_REQUIRED_FLAG_INVALID:'+sid)
  # User units must be installed by this exact payload under systemd/user.
  matches=[e for e in manifest.entries if e.destination_scope=='xdg_config' and e.destination=='systemd/user/'+unit]
  if len(matches)!=1: raise ValueError('SERVER_USER_UNIT_NOT_IN_PAYLOAD:'+sid)
  if probe is not None:
   try:u=urllib.parse.urlparse(probe)
   except Exception: raise ValueError('SERVER_PROBE_INVALID')
   if u.scheme not in ('http','https') or u.hostname not in LOOPBACK or u.username or u.password or u.fragment:
    raise ValueError('SERVER_PROBE_NOT_LOOPBACK:'+sid)
 return {'document':doc,'manifest':manifest,'manifest_path':payload_manifest,
         'package_sha256':sha(descriptor_bytes),'root':root}

def _prepare_loaded_server_package(pkg,home,permissions):
 doc=pkg['document'];manifest=pkg['manifest']
 service_ids=[x['service_id'] for x in doc['services']]
 for sid in service_ids:
  permission_profile.require_capability(permissions,'configure_services',sid)
  permission_profile.require_capability(permissions,'start_services',sid)
  # A service must never be started unless the same reviewed ceiling can stop it.
  permission_profile.require_capability(permissions,'stop_services',sid)
 roots=_roots(home)
 plan=[x.__dict__ for x in plan_install(manifest,pkg['root'],roots)]
 return {
  'schema':PLAN_SCHEMA,
  'package_id':doc['package_id'],'version':doc['version'],'source_ref':doc.get('source_ref'),
  'package_sha256':pkg['package_sha256'],'permission_digest':permissions['permission_digest'],
  'installer_identity':_manifest_identity(manifest),
  'services':doc['services'],'file_plan':plan,
  'payload_files':len(plan),'effect_authorized':False,
  'first_red':None,
  'hard':['PACKAGE_PRESENT!=INSTALLED','INSTALL_PLAN!=INSTALL_APPLY',
          'START_ALLOWED!=START_APPROVED','CENTRAL_REQUEST!=LOCAL_AUTHORITY',
          'USER_SERVICE_ONLY','ROLLBACK_REQUIRED'],
 }

def prepare_server_package(package_root,home,permissions):
 return _prepare_loaded_server_package(load_server_package(package_root),home,permissions)

def _probe(url):
 if url is None:return {'state':'NO_PROBE_DECLARED'}
 try:
  with urllib.request.urlopen(url,timeout=3) as r:
   body=r.read(4097)
   if len(body)>4096:return {'state':'PROBE_RESPONSE_TOO_LARGE','status':r.status}
   return {'state':'PASS','status':r.status}
 except urllib.error.HTTPError as e:return {'state':'HTTP_FAIL','status':e.code}
 except Exception:return {'state':'UNREACHABLE'}

def _reviewed_services(reviewed_plan,permissions):
 if not isinstance(reviewed_plan,dict) or reviewed_plan.get('schema')!=PLAN_SCHEMA:
  raise ValueError('SERVER_PACKAGE_PLAN_SCHEMA_INVALID')
 if reviewed_plan.get('permission_digest')!=permissions.get('permission_digest'):
  raise ValueError('SERVER_PACKAGE_PERMISSION_DIGEST_CHANGED')
 services=reviewed_plan.get('services')
 if not isinstance(services,list) or not services: raise ValueError('SERVER_ROLLBACK_SERVICES_REQUIRED')
 seen=set();seen_units=set()
 for row in services:
  if (not isinstance(row,dict) or not isinstance(row.get('service_id'),str)
      or not isinstance(row.get('unit'),str) or not UNIT.fullmatch(row['unit'])):
   raise ValueError('SERVER_ROLLBACK_SERVICE_IDENTITY_INVALID')
  if row['service_id'] in seen or row['unit'] in seen_units:
   raise ValueError('SERVER_ROLLBACK_SERVICE_IDENTITY_DUPLICATE')
  seen.add(row['service_id']);seen_units.add(row['unit'])
 return services

def _bound_installer_receipt(reviewed_plan,receipt_path):
 path=Path(receipt_path)
 if (not path.is_absolute() or path.is_symlink() or not path.is_file()
     or path.stat().st_nlink!=1 or (path.stat().st_mode & 0o777)!=0o600
     or path.stat().st_uid!=os.getuid()):
  raise ValueError('SERVER_ROLLBACK_RECEIPT_UNTRUSTED')
 try: receipt=json.loads(path.read_bytes())
 except (OSError,ValueError,UnicodeError) as exc: raise ValueError('SERVER_ROLLBACK_RECEIPT_INVALID') from exc
 if receipt.get('schema_version')!=INSTALLER_RECEIPT_SCHEMA or receipt.get('absolute_paths_redacted') is not True:
  raise ValueError('SERVER_ROLLBACK_RECEIPT_INVALID')
 identity=reviewed_plan.get('installer_identity')
 if not isinstance(identity,dict) or set(identity)!={'product_id','profile_id','version','channel','fixture'}:
  raise ValueError('SERVER_ROLLBACK_PLAN_INSTALLER_IDENTITY_INVALID')
 for key in identity:
  if receipt.get(key)!=identity[key]: raise ValueError('SERVER_ROLLBACK_RECEIPT_IDENTITY_MISMATCH:'+key)
 expected=reviewed_plan.get('file_plan');observed=receipt.get('entries')
 if not isinstance(expected,list) or not isinstance(observed,list) or len(expected)!=len(observed):
  raise ValueError('SERVER_ROLLBACK_RECEIPT_PLAN_MISMATCH')
 for plan_item,receipt_item in zip(expected,observed):
  if not isinstance(plan_item,dict) or not isinstance(receipt_item,dict):
   raise ValueError('SERVER_ROLLBACK_RECEIPT_PLAN_MISMATCH')
  for key,value in plan_item.items():
   if receipt_item.get(key)!=value:
    raise ValueError('SERVER_ROLLBACK_RECEIPT_PLAN_MISMATCH:'+str(key))
 return receipt

def _stop_services(rows,permissions):
 results=[];failures=[]
 for row in reversed(rows):
  sid=row.get('service_id');unit=row.get('unit')
  try:
   permission_profile.require_capability(permissions,'stop_services',sid)
   before=service_profile.observe_user_unit(unit)
   r=service_profile._run(['systemctl','--user','stop',unit])
   if r.returncode!=0: raise ValueError('SERVER_SERVICE_STOP_FAILED:'+sid)
   after=service_profile.observe_user_unit(unit)
   if after['active_state']!='inactive': raise ValueError('SERVER_SERVICE_STOP_READBACK_FAILED:'+sid)
   results.append({'service_id':sid,'unit':unit,'before':before,'after':after})
  except Exception as exc:
   failures.append((str(sid),exc))
 if failures:
  raise ValueError('SERVER_SERVICE_STOP_OR_READBACK_FAILED:'+','.join(x[0] for x in failures)) from failures[0][1]
 return results

def _rollback_with_readback(home,permissions,reviewed_plan,services,receipt_path):
 # Receipt identity and exact file plan are verified before any service or file effect.
 _bound_installer_receipt(reviewed_plan,receipt_path)
 stopped=_stop_services(services,permissions)
 rollback(Path(receipt_path),_roots(home))
 r=service_profile._run(['systemctl','--user','daemon-reload'])
 if r.returncode!=0: raise ValueError('SYSTEMD_USER_DAEMON_RELOAD_FAILED')
 for row in stopped:
  final=service_profile.observe_user_unit(row['unit'])
  if final['active_state']!='inactive': raise ValueError('SERVER_SERVICE_ROLLBACK_READBACK_FAILED:'+row['service_id'])
  row['final']=final
 return stopped

def apply_server_package(package_root,home,permissions,reviewed_plan,receipt_path,approved):
 if approved is not True: raise ValueError('EXPLICIT_SERVER_PACKAGE_APPROVAL_REQUIRED')
 # Load once, compile the review from that exact object, and apply the same
 # manifest/payload identity. A second package read cannot replace reviewed bytes.
 pkg=load_server_package(package_root)
 live=_prepare_loaded_server_package(pkg,home,permissions)
 if live!=reviewed_plan: raise ValueError('SERVER_PACKAGE_PLAN_CHANGED_SINCE_REVIEW')
 services=_reviewed_services(live,permissions)
 apply_install(pkg['manifest'],pkg['root'],Path(receipt_path),_roots(home))
 started=[]
 try:
  _bound_installer_receipt(live,receipt_path)
  r=service_profile._run(['systemctl','--user','daemon-reload'])
  if r.returncode!=0: raise ValueError('SYSTEMD_USER_DAEMON_RELOAD_FAILED')
  for row in services:
   sid=row['service_id'];unit=row['unit']
   permission_profile.require_capability(permissions,'start_services',sid)
   before=service_profile.observe_user_unit(unit)
   attempt={'service_id':sid,'unit':unit,'before':before,'after':None,'probe':None}
   # Once a start command is issued, the unit belongs to rollback custody even
   # when the command or immediate active-state readback reports failure.
   started.append(attempt)
   r=service_profile._run(['systemctl','--user','start',unit])
   if r.returncode!=0: raise ValueError('SERVER_SERVICE_START_FAILED:'+sid)
   after=service_profile.observe_user_unit(unit);attempt['after']=after
   if after['active_state']!='active': raise ValueError('SERVER_SERVICE_ACTIVE_READBACK_FAILED:'+sid)
   probe=_probe(row.get('probe'));attempt['probe']=probe
   if row.get('required',True) is not False and row.get('probe') and probe['state']!='PASS':
    raise ValueError('SERVER_SERVICE_PROBE_FAILED:'+sid)
  return {'schema':'xiio.hex.server-package-effect/v1','state':'INSTALLED_STARTED_READBACK_VERIFIED',
          'package_id':live['package_id'],'package_sha256':live['package_sha256'],
          'installer_identity':live['installer_identity'],
          'permission_digest':permissions['permission_digest'],'services':started,
          'installer_receipt':str(receipt_path),'effect_authorized':True}
 except Exception:
  try:
   _rollback_with_readback(home,permissions,live,started,receipt_path)
  except Exception as rb:
   raise ValueError('SERVER_PACKAGE_APPLY_FAILED_ROLLBACK_UNCERTAIN') from rb
  raise

def rollback_server_package(home,permissions,reviewed_plan,receipt_path,approved):
 if approved is not True: raise ValueError('EXPLICIT_SERVER_ROLLBACK_APPROVAL_REQUIRED')
 services=_reviewed_services(reviewed_plan,permissions)
 try:
  stopped=_rollback_with_readback(home,permissions,reviewed_plan,services,receipt_path)
 except Exception as exc:
  raise ValueError('SERVER_PACKAGE_ROLLBACK_FAILED_OR_UNVERIFIED') from exc
 return {'schema':'xiio.hex.server-package-effect/v1','state':'ROLLED_BACK_READBACK_VERIFIED',
         'package_id':reviewed_plan.get('package_id'),'installer_identity':reviewed_plan.get('installer_identity'),
         'permission_digest':permissions['permission_digest'],'services':stopped,'effect_authorized':True}
