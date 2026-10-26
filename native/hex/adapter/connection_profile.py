"""Admitted LOCAL profile adaptation. Existing installer schema/transaction only.
Five unmodified Switchboard source files plus finite local launcher. No secrets,
service install/start, ports implementation, session enrollment or broker creation.
"""
import json, hashlib, os, stat
from pathlib import Path
from xiio_installer.manifest import load_manifest, verify_payload
from xiio_installer.transaction import plan_install, apply_install, rollback
REF='ffbcd216d4c673de826242662271add63112c49a'
REL='connection/switchboard/'+REF
FILES=['scripts/device-native-consumer.mjs','lib/device-broker.mjs','lib/device-execute-pull-worker.mjs','lib/device-execute.mjs','lib/operational-job.ts']
def sha(b):return hashlib.sha256(b).hexdigest()
def safe(p):
 p=Path(p)
 if not p.is_absolute() or any(q.is_symlink() for q in [p,*p.parents]):raise ValueError('CONNECTION_CUSTODY_PATH_UNTRUSTED')
 return p

def read(p):
 p=safe(p);s=p.stat()
 if not p.is_file() or s.st_nlink!=1:raise ValueError('CONNECTION_FILE_CUSTODY_UNTRUSTED')
 return p.read_bytes()
def custody(source):
 rows=json.loads(read(source/'SOURCE.json'))
 if rows['ref']!=REF or sorted(x['path'] for x in rows['files'])!=sorted(FILES):raise ValueError('CONNECTION_SOURCE_SET_CHANGED')
 for row in rows['files']:
  b=read(source/row['path'])
  if sha(b)!=row['sha256'] or len(b)!=row['size'] or hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()!=row['blob']:raise ValueError('CONNECTION_SOURCE_CHANGED')
 return rows

def paths(base,p):
 d=safe(base/'native-plans'/p['plan_id']/'connection')
 return d,d/'manifest.json',d/'payload',d/'install-receipt.json'
def roots(p):return {'HOME':p['prefix'],'XDG_DATA_HOME':p['prefix'],'XDG_CONFIG_HOME':p['prefix']+'/unused-config','XDG_STATE_HOME':p['prefix']+'/unused-state','XDG_CACHE_HOME':p['prefix']+'/unused-cache'}
def launcher(prefix,node):
 quote=lambda x:"'"+str(x).replace("'","'\"'\"'")+"'"
 return ('#!/bin/sh\n# Finite existing Switchboard native consumer; no service startup.\n'
 'if [ "$#" -ne 0 ]; then echo \'{"state":"BLOCKED","firstRed":"ARGUMENTS_NOT_SUPPORTED"}\'; exit 3; fi\n'
 'if [ -z "${XIIO_DEVICE_REF:-}" ] || [ -z "${XIIO_DEVICE_BROKER_URL:-}" ] || [ -z "${XIIO_DEVICE_PORTS_MODULE:-}" ]; then\n'
 '  echo \'{"state":"CONFIGURATION_REQUIRED","firstRed":"EXISTING_DEVICE_BROKER_AND_WARD_PORTS_REQUIRED","connected":false}\'; exit 3\nfi\n'
 'unset NODE_OPTIONS NODE_PATH\nexec '+quote(node)+' --experimental-strip-types '+quote(Path(prefix)/REL/'scripts/device-native-consumer.mjs')+' --once\n').encode()
def prepare(base,p,source):
 c=custody(source);d,mf,pr,receipt=paths(base,p);pr.mkdir(parents=True,exist_ok=False,mode=0o700)
 entries=[]
 for row in c['files']:
  f=pr/row['path'];f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(read(source/row['path']))
  entries.append({'source':row['path'],'sha256':row['sha256'],'size':row['size'],'destination_scope':'xdg_data','destination':REL+'/'+row['path'],'mode':'0644','overwrite':'backup_replace'})
 b=launcher(p['prefix'],p['node']['path']);(pr/'xi-io-connect').write_bytes(b)
 entries.append({'source':'xi-io-connect','sha256':sha(b),'size':len(b),'destination_scope':'xdg_data','destination':'bin/xi-io-connect','mode':'0755','overwrite':'backup_replace'})
 m={'schema_version':'xiio-installer-product-manifest-v1','profile_id':'cli-required-switchboard-connection-local-candidate','product_id':'xi-io-switchboard-native-consumer','display_name':'CLI required Switchboard connection runtime','version':REF,'channel':'alpha','fixture':False,'payload':entries}
 mf.write_text(json.dumps(m,sort_keys=True)+'\n');manifest=load_manifest(mf)
 items=[x.__dict__ for x in plan_install(manifest,pr,roots(p))]
 return {'required':True,'source':c,'manifest_sha256':sha(read(mf)),'plan':items,'payload_files':len(entries),'payload_bytes':sum(x['size'] for x in entries),'launcher':str(Path(p['prefix'])/'bin/xi-io-connect'),'configuration_state':'CONFIGURATION_REQUIRED','connected':False,'required_bindings':['XIIO_DEVICE_REF','XIIO_DEVICE_BROKER_URL','XIIO_DEVICE_PORTS_MODULE'],'host_effect_authorized':False}
def validate(base,p,source,preapply=False):
 d,mf,pr,r=paths(base,p)
 if custody(source)!=p['connection']['source'] or sha(read(mf))!=p['connection']['manifest_sha256']:raise ValueError('CONNECTION_REVIEW_CUSTODY_CHANGED')
 m=load_manifest(mf);verify_payload(m,pr)
 if preapply and [x.__dict__ for x in plan_install(m,pr,roots(p))]!=p['connection']['plan']:raise ValueError('CONNECTION_DESTINATION_CHANGED')
 return m,pr,r

def apply(base,p,source):
 m,pr,r=validate(base,p,source,True)
 receipt=apply_install(m,pr,r,roots(p))
 return {'receipt_sha256':sha(read(r)),'receipt_schema':receipt['schema_version']}
def readback(base,p,source,receipt_sha=None,rolled_back=False):
 m,pr,r=validate(base,p,source)
 if receipt_sha and sha(read(r))!=receipt_sha:raise ValueError('CONNECTION_RECEIPT_CHANGED')
 for item in p['connection']['plan']:
  f=safe(Path(p['prefix'])/item['destination'])
  expected=item['existing_sha256'] if rolled_back and item['action']!='noop_same_hash' else item['expected_sha256']
  mode=item['existing_mode'] if rolled_back and item['action']!='noop_same_hash' else item['expected_mode']
  if expected is None:
   if f.exists():raise ValueError('CONNECTION_ROLLBACK_FILE_REMAINS')
  elif sha(read(f))!=expected or stat.S_IMODE(f.stat().st_mode)!=mode:raise ValueError('CONNECTION_INSTALLED_READBACK_MISMATCH')
 return {'state':'ROLLED_BACK' if rolled_back else 'FILES_READBACK_VERIFIED','configuration_state':'CONFIGURATION_REQUIRED','connected':False,'source_ref':REF,'receipt_sha256':sha(read(r))}
def revert(base,p,source,receipt_sha):
 m,pr,r=validate(base,p,source)
 if sha(read(r))!=receipt_sha:raise ValueError('CONNECTION_RECEIPT_CHANGED')
 rollback(r,roots(p))
 return readback(base,p,source,receipt_sha,True)
