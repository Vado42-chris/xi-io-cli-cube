from pathlib import Path
import tempfile,subprocess,hashlib,json,os,shutil,sys
REPO=Path(__file__).resolve().parents[1]
NODE=str(Path(shutil.which('node') or '').resolve())
INSTALL=REPO/'install.mjs'
SOURCE='d53a1d0219f5b1707c6c1bbedfb262082179ceab'
HASHES={'src/xiio.mjs': '561ca051ad26a41e27d3465191a7e7cf3e3a27c523a6411f632e6a8562bb028b', 'src/file-edit-cas.mjs': 'f96a15c095ef043d862e6ba77bb2b0ac1dcde90c040c414a68331b4b8e4e88f3', 'src/runtime-integrity.mjs': 'de15e26e26ad52c1bab3fd3fc7a0a389bec3c8dbe6a06666f51de075a0dd4912', 'config/service-catalog.json': '8f9c4c8efb77c36242a81fdcf8c821e05a2ce253d320c34ce27f4b67b2a19a88', 'scripts/service-inventory.mjs': '4711d6603f759607e79cadc1031f8668ef27b393f25b408b9ecd5516ebc18204', 'scripts/reconcile-service-inventory.mjs': 'eb20d7ef9cc8d50ca7c3cd1af016f76e4c2a7ddea4afb30d47d1695237a6845e'}
for rel,want in HASHES.items():
 assert hashlib.sha256((REPO/rel).read_bytes()).hexdigest()==want, 'Fixture payload changed: '+rel
class Fixture:
 def __enter__(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='xiio-repair-test-');self.home=Path(self.tmp.name);self.prefix=self.home/'cli';self.bin=self.home/'bin';self.bin.mkdir();(self.bin/'cat').symlink_to('/bin/cat')
  gh=self.home/'fixture-gh'
  gh.write_text('#!'+sys.executable+'\nimport sys,pathlib\na=sys.argv[1:];u=next(x for x in a if x.startswith("repos/"))\nif "/commits/" in u: print('+repr(SOURCE)+')\nelse: sys.stdout.buffer.write((pathlib.Path('+repr(str(REPO))+')/u.split("/contents/",1)[1].split("?",1)[0]).read_bytes())\n');gh.chmod(0o700)
  self.env={'HOME':str(self.home),'PATH':str(self.bin),'XIIO_CONFIG_DIR':str(self.home/'config'),'XIIO_SANDBOX':'off','XIIO_GH':str(gh)}
  for _ in range(2):
   r=subprocess.run([NODE,str(INSTALL),'--ref',SOURCE,'--prefix',str(self.prefix),'--bin-dir',str(self.bin)],env=self.env,capture_output=True,text=True,timeout=60);assert r.returncode==0,r.stdout+r.stderr
  return self
 def __exit__(self,*a):self.tmp.cleanup()
