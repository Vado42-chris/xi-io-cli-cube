#!/usr/bin/env python3
"""Pinned downloader for the EXISTING HEX offline CLI installer. No new installer."""
import argparse,base64,hashlib,importlib.util,json,os,pathlib,re,shutil,subprocess,sys,tempfile
SOURCE_SHA="c4e2b9f8738d2d2e074301608ca6b263d635852f"
INSTALLER_SHA="83e823bea184ddf2ec7334cd937c61a1d89b1c8034edfbd60e37960c92aa4d9b"
MANIFEST_SHA="6666c7e8c5a3177d14a2baa03941ff52b5671af96e71687dde3c2130da3598fe"
FILES=['src/xiio.mjs', 'src/file-edit-cas.mjs', 'src/local-ops.mjs', 'src/runtime-integrity.mjs', 'config/service-catalog.json', 'scripts/service-inventory.mjs', 'scripts/reconcile-service-inventory.mjs', 'src/sdk-provider-state.mjs', 'src/sdk/audhd-command.mjs', 'src/sdk/tool-verb-fidelity.mjs']

def digest(data):return hashlib.sha256(data).hexdigest()
def get_file(carrier,name,source_path=None):
 source_path=source_path or "native/hex/cli-source/"+name
 endpoint=f"repos/Vado42-chris/xi-io-cli-cube/contents/{source_path}?ref={carrier}"
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

DISCOVERY_FILES = {'native/hex/adapter/install_preflight.py': '7290a9d02870332009f4dd984203aa9aabb093a135adae97643c60aa1ab6f9a2', 'native/hex/adapter/kernel/xiio_installer/__init__.py': '1cfa18cf7a7ce811c262f715af968d50db2efb237fc44f95f0e593f30a3e2c95', 'native/hex/adapter/kernel/xiio_installer/discovery.py': 'c1c6096189c03b593707f7c440b8727ea0aff49135f9d8d26afd5d10e5ee60a8'}

def resolve_existing_node(carrier,cache,home=None):
 node=shutil.which('node')
 if node:return node
 # Reuse HEX's bounded metadata-only discovery. No profile changes or new runtime.
 base=cache/'runtime-discovery'/carrier
 for relative,expected in DISCOVERY_FILES.items():
  target=base/relative
  if target.exists():
   if target.is_symlink() or not target.is_file() or digest(target.read_bytes())!=expected:raise RuntimeError('DISCOVERY_SOURCE_CHANGED:'+relative)
  else:
   data=get_file(carrier,relative,source_path=relative)
   if digest(data)!=expected:raise RuntimeError('DISCOVERY_SOURCE_HASH_MISMATCH:'+relative)
   target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
   with open(os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:f.write(data)
 adapter=base/'native/hex/adapter'
 sys.path.insert(0,str(adapter/'kernel'))
 try:
  spec=importlib.util.spec_from_file_location('_xiio_existing_install_preflight',adapter/'install_preflight.py')
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  candidates=module.node_candidates(home or pathlib.Path.home())
 finally:sys.path.pop(0)
 preferred=next((row['path'] for row in candidates if row['source']=='user_nvm'),None)
 return preferred or (candidates[0]['path'] if candidates else None)

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
 node=resolve_existing_node(a.carrier_ref,cache)
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
