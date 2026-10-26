"""Bounded read-only installed metadata discovery. Never launches discovered tools."""
import os,stat,json,platform,re
from pathlib import Path
from xiio_installer.discovery import observe_semantic_roots, discover_executable_roles

def regular_metadata(path):
 p=Path(path)
 if any(q.is_symlink() for q in [p,*p.parents]):return None
 try:
  s=p.stat()
  if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1:return None
  return {'path':str(p),'size':s.st_size,'mode':stat.S_IMODE(s.st_mode),'executable':os.access(p,os.X_OK),'observation_only':True,'executed':False}
 except OSError:return None

def small_json(p,private=False):
 m=regular_metadata(p)
 if not m or m['size']>65536:return None
 try:
  if private and (Path(p).stat().st_uid!=os.getuid() or m['mode']&0o077):return None
  v=json.loads(Path(p).read_text())
  return v if isinstance(v,dict) else None
 except (OSError,ValueError):return None

def node_candidates(home):
 candidates=[];seen=set()
 paths=[('/usr/bin/node','system'),('/usr/local/bin/node','system')]
 versions=home/'.nvm/versions/node'
 # Fixed NVM location only. At most64 directory metadata entries, at most12 versions.
 if versions.is_dir() and not any(q.is_symlink() for q in [versions,*versions.parents]):
  with os.scandir(versions) as rows:
   names=[]
   for i,row in enumerate(rows):
    if i>=64:break
    if re.fullmatch(r'v\d+\.\d+\.\d+',row.name) and row.is_dir(follow_symlinks=False):names.append(row.name)
  names.sort(key=lambda v:tuple(map(int,v[1:].split('.'))),reverse=True)
  paths += [(str(versions/n/'bin/node'),'user_nvm') for n in names[:12]]
 for raw,source in paths:
  metadata=regular_metadata(raw)
  if metadata and metadata['executable'] and raw not in seen:
   candidates.append({**metadata,'source':source,'runtime_version':'NOT_EXECUTED','qualified':False});seen.add(raw)
 return candidates

def preflight():
 home=Path.home();e={'HOME':str(home),'PATH':'/usr/bin:/bin:/usr/local/bin'}
 for key in ['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME']:
  if os.environ.get(key):e[key]=os.environ[key]
 semantic=observe_semantic_roots(e,system=platform.system())
 roles=discover_executable_roles(e,family=semantic['family'])
 nodes=node_candidates(home)
 # Recover only the existing CLI's known install layout; never search home.
 prefix=home/'.local/share/xi-io/cli-v1';current=prefix/'current'
 existing={'state':'NOT_OBSERVED_AT_KNOWN_LOCATION','prefix':str(prefix),'qualification':'NOT_PERFORMED'}
 m=regular_metadata(current)
 if m and m['size']<256:
  generation=current.read_text().strip()
  if re.fullmatch(r'[A-Za-z0-9._-]{1,160}',generation) and generation not in ['.','..']:
   receipt=small_json(prefix/'versions'/generation/'install-receipt.json')
   if receipt and receipt.get('schema')=='xiio.cli.install-receipt/v2':
    existing={'state':'RECEIPT_METADATA_OBSERVED','prefix':str(prefix),'generation':generation,'source_sha':receipt.get('source_sha'),'node_version_recorded':receipt.get('node'),'qualification':'NO_CURRENT_RUNTIME_READBACK','executed':False}
 device=small_json(Path(e.get('XDG_CONFIG_HOME',str(home/'.config')))/'xi-io/device.json',True)
 identity={'state':'NOT_OBSERVED_AT_KNOWN_LOCATION','authority':'NOT_INFERRED'}
 if device and device.get('schema')=='xiio.cli.device/v1':
  identity={'state':'PUBLIC_DEVICE_METADATA_OBSERVED','device_ref':device.get('device_id'),'provider_principal_ref':device.get('principal'),'authority':'NOT_INFERRED','private_key_read':False}
 # Consumer source consumes process-env/module bindings, not a known config file.
 # The native carrier intentionally does not forward secret-bearing shell state.
 configuration={'state':'CONFIGURATION_REQUIRED','qualification':'NOT_OBSERVED','service_absence_claimed':False,'credential_values_read':False,'module_imported':False,'device_identity':identity,'required_bindings':[
  {'name':'XIIO_DEVICE_REF','state':'PUBLIC_METADATA_AVAILABLE' if identity['state']=='PUBLIC_DEVICE_METADATA_OBSERVED' else 'NOT_OBSERVED'},
  {'name':'XIIO_DEVICE_BROKER_URL','state':'NOT_OBSERVED_IN_INSTALLER_PROCESS'},
  {'name':'XIIO_DEVICE_PORTS_MODULE','state':'NOT_OBSERVED_IN_INSTALLER_PROCESS','supplies':['authenticated_headers','Ward_admission','durable_claim','BINS_result_and_attempt_readback']}],
  'note':'Missing installer-process observations are not proof that an existing host service or configured session is absent. Installer does not read secret files, import ports, enroll, or refresh grants.'}
 preferred=next((n['path'] for n in nodes if n['source']=='user_nvm'),nodes[0]['path'] if nodes else '')
 return {'system_metadata':{'os':platform.system(),'architecture':platform.machine(),'semantic_roots':semantic,'executable_roles':roles,'observation_only':True,'discovered_tools_executed':False},'node_candidates':nodes,'node_suggestion':preferred,'existing_cli':existing,'connection_prerequisites':configuration}
