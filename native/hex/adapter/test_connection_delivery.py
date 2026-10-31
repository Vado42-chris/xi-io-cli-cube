"""Actual existing adapter -> installed CLI -> admitted native refusal -> rollback.
No credentials, ports implementation, device enrollment, service or network supplied.
The existing PR15 fixture supplies prior six-file generations; no parallel installer.
"""
import hashlib,json,os,shutil,subprocess,tempfile,unittest
from pathlib import Path
from test_launcher_repair import Fixture,NODE
HERE=Path(__file__).resolve().parent
SOURCE=HERE.parent/'cli-source'
REF='1d7543a3cf33a3c2d83363825e120a31e28a8bdf'
SB='ffbcd216d4c673de826242662271add63112c49a'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def snapshot(root):
 return {str(p.relative_to(root)):(sha(p) if p.is_file() else None,p.stat().st_mode,p.stat().st_uid,p.stat().st_gid,p.stat().st_ino,p.stat().st_nlink,p.stat().st_mtime_ns) for p in root.rglob('*')}
class ConnectionDelivery(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.home=Path(self.tmp.name);self.prefix=self.home/'selected/cli'
  self.env={'HOME':str(self.home),'XDG_STATE_HOME':str(self.home/'state'),'PATH':'/usr/bin:/bin','XIIO_CONFIG_DIR':str(self.home/'config')}
  self.adapter=HERE/'installer_adapter.py'
 def tearDown(self):self.tmp.cleanup()
 def call(self,req):
  r=subprocess.run(['/usr/bin/python3','-I',str(self.adapter)],input=json.dumps(req),text=True,capture_output=True,env=self.env,timeout=110)
  self.assertEqual(r.returncode,0,r.stderr);return json.loads(r.stdout)
 def prepare(self):
  r=self.call({'action':'prepare','prefix':str(self.prefix),'node':NODE,'components':['cli']});self.assertTrue(r['ok'],r);return r['result']
 def act(self,p,action='apply'):
  return self.call({'action':action,'plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True})
 def assert_native_reachable(self):
  m=json.loads((SOURCE/'connection/SOURCE.json').read_text());self.assertEqual(m['ref'],SB);self.assertEqual(len(m['files']),5)
  for row in m['files']:
   p=self.prefix/'connection/switchboard'/SB/row['path'];self.assertEqual(sha(p),row['sha256']);self.assertEqual(p.stat().st_nlink,1);self.assertEqual(p.stat().st_mode&0o022,0)
  launcher=self.prefix/'bin/xi-io-cli'
  for extra,want in [({},'EXISTING_DEVICE_BROKER_AND_WARD_PORTS_REQUIRED'),({'XIIO_DEVICE_REF':'invalid-negative-test','XIIO_DEVICE_BROKER_URL':'https://invalid.example','XIIO_DEVICE_PORTS_MODULE':str(self.home/'absent-ports.mjs')},'NATIVE_DEVICE_REF_UNBOUND')]:
   r=subprocess.run([str(launcher),'connect'],env={**self.env,**extra},capture_output=True,text=True,timeout=15);self.assertEqual(r.returncode,3,r.stdout+r.stderr);v=json.loads(r.stdout)
   self.assertEqual(v['firstRed'],want);self.assertFalse(v['connected']);self.assertFalse(v['execution_verified']);self.assertFalse(v['returnCertified'])
   if extra:self.assertEqual(v['native_exit'],3)
  self.assertFalse((self.home/'absent-ports.mjs').exists());self.assertFalse((self.home/'config').exists())
 def test_fresh_offline_install_reaches_exact_native_without_auth(self):
  p=self.prepare();self.assertEqual(p['payload']['manifest']['source_sha'],REF);self.assertEqual(len(p['payload']['manifest']['files']),8)
  r=self.act(p);self.assertTrue(r['ok'],r);self.assertEqual(r['result']['phase'],'INSTALLED_READBACK_VERIFIED');self.assert_native_reachable()
 def test_six_file_prior_receipts_survive_seven_file_update_connect_and_rollback(self):
  with Fixture() as f:
   self.prefix=f.prefix
   # Existing fixture's real canonical launcher is moved only within its disposable root.
   (self.prefix/'bin').mkdir();shutil.move(str(f.bin/'xi-io-cli'),self.prefix/'bin/xi-io-cli')
   old=(self.prefix/'current').read_text();before=snapshot(self.prefix/'versions');launcher=(self.prefix/'bin/xi-io-cli').read_bytes();node=sha(Path(NODE))
   p=self.prepare();r=self.act(p);self.assertTrue(r['ok'],r);self.assert_native_reachable();current=(self.prefix/'current').read_text()
   self.assertEqual((self.prefix/'previous').read_text(),old)
   r=self.act(p,'rollback');self.assertTrue(r['ok'],r);self.assertEqual(r['result']['phase'],'ROLLED_BACK');self.assertEqual((self.prefix/'current').read_text(),old);self.assertEqual((self.prefix/'previous').read_text(),current)
   after=snapshot(self.prefix/'versions');self.assertEqual({k:after[k] for k in before},before);self.assertEqual((self.prefix/'bin/xi-io-cli').read_bytes(),launcher);self.assertEqual(sha(Path(NODE)),node)
   self.assertFalse((self.prefix/'connection/switchboard'/SB/'scripts/device-native-consumer.mjs').exists())
   self.assertTrue(self.call({'action':'readback','plan_id':p['plan_id']})['ok'])
 def test_changed_prior_receipt_is_not_accepted_as_rollback_denominator(self):
  p=self.prepare();self.assertTrue(self.act(p)['ok']);old=(self.prefix/'current').read_text().strip();p2=self.prepare();self.assertTrue(self.act(p2)['ok']);current=(self.prefix/'current').read_bytes()
  receipt=self.prefix/'versions'/old/'install-receipt.json';value=json.loads(receipt.read_text());value['files'].pop('src/local-ops.mjs');receipt.write_text(json.dumps(value))
  r=self.act(p2,'rollback');self.assertFalse(r['ok']);self.assertEqual(r['error'],'INSTALLED_STATE_DRIFT');self.assertEqual((self.prefix/'current').read_bytes(),current)
 def test_missing_current_module_refuses_without_destination_effect(self):
  bundle=self.home/'isolated-bundle';shutil.copytree(HERE,bundle/'adapter',ignore=shutil.ignore_patterns('__pycache__'));shutil.copytree(SOURCE,bundle/'cli-source');self.adapter=bundle/'adapter/installer_adapter.py'
  (bundle/'cli-source/src/local-ops.mjs').unlink();r=self.call({'action':'prepare','prefix':str(self.prefix),'node':NODE,'components':['cli']});self.assertFalse(r['ok']);self.assertFalse(self.prefix.exists())
 def test_old_repair_verifier_remains_exact_and_separate_from_current_payload(self):
  m=json.loads((SOURCE/'launcher-repair.SOURCE.json').read_text());self.assertEqual(m['verification_resource']['path'],'launcher-repair.runtime-integrity.mjs');self.assertEqual(sha(SOURCE/m['verification_resource']['path']),'de15e26e26ad52c1bab3fd3fc7a0a389bec3c8dbe6a06666f51de075a0dd4912')
  self.assertNotEqual(sha(SOURCE/'src/runtime-integrity.mjs'),m['verification_resource']['sha256'])
if __name__=='__main__':unittest.main()
