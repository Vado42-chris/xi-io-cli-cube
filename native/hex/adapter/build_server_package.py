#!/usr/bin/env python3
"""Build a reviewed XI-IO HEX server package from an explicit local spec.

This is packaging only. It does not install, start, stop, connect, publish, or
grant authority. Every source file must be explicitly named in the spec.
"""
from __future__ import annotations
import argparse, hashlib, json, os, shutil
from pathlib import Path

def sha(b): return hashlib.sha256(b).hexdigest()

def safe_source(path):
 p=Path(path)
 if not p.is_absolute() or any(q.is_symlink() for q in [p,*p.parents]):
  raise ValueError('SOURCE_PATH_UNTRUSTED')
 st=p.stat()
 if not p.is_file() or st.st_nlink!=1 or st.st_size>64*1024*1024:
  raise ValueError('SOURCE_FILE_UNTRUSTED')
 return p

def build(spec_path,out_dir):
 spec_path=safe_source(spec_path)
 spec=json.loads(spec_path.read_text())
 allowed={'package_id','version','channel','source_ref','files','services'}
 if set(spec)-allowed: raise ValueError('SERVER_PACKAGE_SPEC_FIELDS_INVALID')
 for key in ['package_id','version','source_ref']:
  if not isinstance(spec.get(key),str) or not spec[key]: raise ValueError('SERVER_PACKAGE_SPEC_IDENTITY_INVALID')
 if spec.get('channel') not in {'stable','rc','beta','alpha','fixture'}: raise ValueError('SERVER_PACKAGE_CHANNEL_INVALID')
 files=spec.get('files');services=spec.get('services')
 if not isinstance(files,list) or not files or not isinstance(services,list) or not services:
  raise ValueError('SERVER_PACKAGE_SPEC_CONTENT_REQUIRED')
 out=Path(out_dir)
 if not out.is_absolute() or out.exists(): raise ValueError('OUTPUT_DIRECTORY_MUST_BE_NEW_ABSOLUTE_PATH')
 out.mkdir(parents=True,mode=0o700)
 payload=[]
 seen_dest=set()
 try:
  for i,row in enumerate(files):
   if not isinstance(row,dict) or set(row)-{'source','destination_scope','destination','mode','overwrite'}:
    raise ValueError('SERVER_PACKAGE_FILE_FIELDS_INVALID')
   source=safe_source(row.get('source'))
   scope=row.get('destination_scope')
   if scope not in {'xdg_config','xdg_data','xdg_state','xdg_cache'}: raise ValueError('SERVER_PACKAGE_SCOPE_INVALID')
   dest=row.get('destination')
   if not isinstance(dest,str) or not dest or dest.startswith('/') or '..' in Path(dest).parts:
    raise ValueError('SERVER_PACKAGE_DESTINATION_INVALID')
   key=(scope,dest)
   if key in seen_dest: raise ValueError('SERVER_PACKAGE_DUPLICATE_DESTINATION')
   seen_dest.add(key)
   mode=row.get('mode','0644')
   if not (isinstance(mode,str) and len(mode)==4 and all(c in '01234567' for c in mode)):
    raise ValueError('SERVER_PACKAGE_MODE_INVALID')
   overwrite=row.get('overwrite','backup_replace')
   if overwrite not in {'fail','backup_replace','same_hash_ok'}: raise ValueError('SERVER_PACKAGE_OVERWRITE_INVALID')
   data=source.read_bytes()
   rel=f'payload/{i:04d}-{source.name}'
   target=out/rel
   target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(data);os.chmod(target,int(mode,8))
   payload.append({'source':rel,'sha256':sha(data),'size':len(data),
                   'destination_scope':scope,'destination':dest,'mode':mode,'overwrite':overwrite})
  manifest={'schema_version':'xiio-installer-product-manifest-v1',
            'profile_id':'hex-server-'+spec['package_id'],
            'product_id':spec['package_id'],'display_name':spec['package_id'],
            'version':spec['version'],'channel':spec['channel'],'fixture':spec['channel']=='fixture',
            'payload':payload}
  (out/'manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n')
  package={'schema':'xiio.hex.server-package/v1','package_id':spec['package_id'],
           'version':spec['version'],'channel':spec['channel'],'source_ref':spec['source_ref'],
           'payload_manifest':'manifest.json','services':services}
  (out/'server-package.json').write_text(json.dumps(package,sort_keys=True,indent=2)+'\n')
  receipt={'schema':'xiio.hex.server-package-build/v1','state':'PACKAGED_NOT_INSTALLED',
           'package_id':spec['package_id'],'version':spec['version'],
           'files':len(payload),'services':len(services),
           'server_package_sha256':sha((out/'server-package.json').read_bytes()),
           'manifest_sha256':sha((out/'manifest.json').read_bytes()),
           'effect_authority':0}
  (out/'BUILD-RECEIPT.json').write_text(json.dumps(receipt,sort_keys=True,indent=2)+'\n')
  return receipt
 except Exception:
  shutil.rmtree(out,ignore_errors=True)
  raise

def main():
 ap=argparse.ArgumentParser()
 ap.add_argument('--spec',required=True)
 ap.add_argument('--out',required=True)
 args=ap.parse_args()
 try:
  print(json.dumps(build(args.spec,args.out),sort_keys=True))
 except Exception as e:
  print(json.dumps({'state':'BLOCKED','first_red':str(e)}))
  return 3
 return 0

if __name__=='__main__':
 raise SystemExit(main())
