#!/usr/bin/env python3
"""Pinned downloader for the EXISTING HEX offline CLI installer. No new installer."""
import argparse,base64,hashlib,json,os,pathlib,re,shutil,subprocess,sys,tempfile
SOURCE_SHA="1d7543a3cf33a3c2d83363825e120a31e28a8bdf"
INSTALLER_SHA="7cfb4bed6ba2c5e20c9c4e6aa9089ccdd9172ae88e5b3df3add78134662b50de"
MANIFEST_SHA="5d973281ab9dab69d10a300e6ff2d752ebada7926c8c0e474abb1eceb002b558"
FILES=['src/xiio.mjs', 'src/file-edit-cas.mjs', 'src/local-ops.mjs', 'src/runtime-integrity.mjs', 'config/service-catalog.json', 'scripts/service-inventory.mjs', 'scripts/reconcile-service-inventory.mjs', 'src/sdk-provider-state.mjs']

def digest(data):return hashlib.sha256(data).hexdigest()
def get_file(carrier,name):
 endpoint=f"repos/Vado42-chris/xi-io-cli-cube/contents/native/hex/cli-source/{name}?ref={carrier}"
 response=subprocess.run(['gh','api',endpoint],check=True,capture_output=True,text=True,timeout=45)
 item=json.loads(response.stdout)
 if item.get('type')!='file' or item.get('encoding')!='base64':raise RuntimeError('GITHUB_REGULAR_FILE_REQUIRED:'+name)
 data=base64.b64decode(item['content'])
 blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 if len(data)>1048576 or len(data)!=item['size'] or blob!=item['sha']:raise RuntimeError('GITHUB_BYTE_IDENTITY_MISMATCH:'+name)
 return data

def verify(root):
 manifest_bytes=(root/'packaged-source.json').read_bytes()
 if digest(manifest_bytes)!=MANIFEST_SHA:raise RuntimeError('MANIFEST_HASH_MISMATCH')
 manifest=json.loads(manifest_bytes)
 if manifest.get('schema')!='xiio.cli.packaged-source/v1' or manifest.get('source_sha')!=SOURCE_SHA or set(manifest.get('files',{}))!=set(FILES):raise RuntimeError('MANIFEST_CONTRACT_MISMATCH')
 if digest((root/'install.mjs').read_bytes())!=INSTALLER_SHA:raise RuntimeError('INSTALLER_HASH_MISMATCH')
 for name in FILES:
  file=root/name
  if file.is_symlink() or not file.is_file():raise RuntimeError('PAYLOAD_REGULAR_FILE_REQUIRED:'+name)
  data=file.read_bytes();expected=manifest['files'][name]
  if len(data)!=expected['size'] or digest(data)!=expected['sha256']:raise RuntimeError('PAYLOAD_HASH_MISMATCH:'+name)
 return manifest

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--carrier-ref',required=True);ap.add_argument('--install',action='store_true');ap.add_argument('--cache-dir');ap.add_argument('--prefix');ap.add_argument('--bin-dir');ap.add_argument('--adopt-existing-launcher',action='store_true');ap.add_argument('--expect-launcher-sha256');a=ap.parse_args()
 if not re.fullmatch('[0-9a-f]{40}',a.carrier_ref):raise RuntimeError('EXACT_CARRIER_SHA_REQUIRED')
 if a.adopt_existing_launcher and not re.fullmatch('[0-9a-f]{64}',a.expect_launcher_sha256 or ''):raise RuntimeError('EXPLICIT_LAUNCHER_HASH_REQUIRED')
 cache=pathlib.Path(a.cache_dir or os.path.join(os.environ.get('XDG_CACHE_HOME',os.path.expanduser('~/.cache')),'xi-io','hex-cli'))
 cache.mkdir(mode=0o700,parents=True,exist_ok=True);root=cache/a.carrier_ref
 if root.exists():
  if root.is_symlink() or not root.is_dir():raise RuntimeError('CACHE_DESTINATION_UNSAFE')
  verify(root)
 else:
  stage=pathlib.Path(tempfile.mkdtemp(prefix='.download-',dir=cache))
  try:
   for name in ['packaged-source.json','install.mjs']+FILES:
    data=get_file(a.carrier_ref,name);dest=stage/name;dest.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    with open(os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:f.write(data)
   verify(stage)
   if root.exists():raise RuntimeError('CACHE_DESTINATION_CHANGED')
   stage.rename(root)
  except BaseException:
   shutil.rmtree(stage,ignore_errors=True);raise
 if not a.install:
  print(json.dumps({'state':'VERIFIED_DOWNLOAD','carrier_sha':a.carrier_ref,'source_sha':SOURCE_SHA,'directory':str(root),'installed':False}));return
 node=shutil.which('node')
 if not node:raise RuntimeError('NODE_REQUIRED')
 cmd=[node,str(root/'install.mjs'),'--packaged-source',str(root),'--ref',SOURCE_SHA]
 for flag,value in [('--prefix',a.prefix),('--bin-dir',a.bin_dir)]:
  if value:cmd.extend([flag,value])
 if a.adopt_existing_launcher:cmd.extend(['--adopt-existing-launcher','--expect-launcher-sha256',a.expect_launcher_sha256])
 # Existing HEX installer owns preferences, generation checks, approval and rollback.
 result=subprocess.run(cmd,timeout=120)
 raise SystemExit(result.returncode)
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as e:
  print(json.dumps({'state':'BLOCKED','reason':str(e),'automatic_permission_change':False}),file=sys.stderr);sys.exit(2)
