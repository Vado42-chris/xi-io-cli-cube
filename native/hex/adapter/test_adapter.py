import unittest,tempfile,subprocess,json,os,shutil
from pathlib import Path
ADAPTER=Path(__file__).resolve().parent/'installer_adapter.py'
NODE=shutil.which('node')
class RealPayload(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.home=Path(self.tmp.name);self.env={'HOME':str(self.home),'XDG_STATE_HOME':str(self.home/'state'),'PATH':'/usr/bin:/bin'}
 def tearDown(self):self.tmp.cleanup()
 def call(self,request):
  p=subprocess.run(['/usr/bin/python3','-I',str(ADAPTER)],input=json.dumps(request),text=True,capture_output=True,env=self.env,timeout=110)
  self.assertEqual(p.returncode,0,p.stderr);return json.loads(p.stdout)
 def prepare(self):
  r=self.call({'action':'prepare','prefix':str(self.home/'selected/cli'),'node':NODE,'components':['cli']});self.assertTrue(r['ok'],r);return r['result']
 def test_real_offline_install_readback_duplicate_and_upgrade_rollback(self):
  p=self.prepare();self.assertFalse((self.home/'selected/cli').exists())
  approval={'plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True}
  r=self.call({'action':'apply',**approval});self.assertTrue(r['ok'],r);self.assertEqual(r['result']['phase'],'INSTALLED_READBACK_VERIFIED')
  self.assertTrue(self.call({'action':'readback','plan_id':p['plan_id']})['ok'])
  self.assertFalse(self.call({'action':'apply',**approval})['ok'])
  self.assertFalse(self.call({'action':'rollback',**approval})['ok'])
  old=(self.home/'selected/cli/current').read_text();p2=self.prepare();a2={'plan_id':p2['plan_id'],'approval_digest':p2['approval_digest'],'approved':True}
  self.assertTrue(self.call({'action':'apply',**a2})['ok'])
  r=self.call({'action':'rollback',**a2});self.assertTrue(r['ok'],r);self.assertEqual((self.home/'selected/cli/current').read_text(),old)
 def test_tampered_launcher_refused_without_execution(self):
  p=self.prepare();a={'plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True}
  self.assertTrue(self.call({'action':'apply',**a})['ok'])
  launcher=Path(p['prefix'])/'bin/xi-io-cli';sentinel=self.home/'must-not-execute'
  launcher.write_text('#!/bin/sh\ntouch '+str(sentinel)+'\n')
  self.assertFalse(self.call({'action':'readback','plan_id':p['plan_id']})['ok']);self.assertFalse(sentinel.exists())
 def test_serialization_and_unknown_journal(self):
  import fcntl
  p=self.prepare();lock=self.home/'state/xi-io/installer/native-adapter.lock'
  with lock.open('r+') as f:
   fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
   self.assertFalse(self.call({'action':'inspect'})['ok'])
  journal=self.home/'state/xi-io/installer/operations'/ (p['plan_id']+'-apply.jsonl');journal.parent.mkdir(exist_ok=True);journal.write_text('corrupt')
  self.assertFalse(self.call({'action':'apply','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True})['ok'])
  self.assertFalse(Path(p['prefix']).exists())
 def test_approval_drift_components_and_fields(self):
  self.assertFalse(self.call({'action':'prepare','prefix':str(self.home/'cli'),'node':NODE,'components':['cli','bins']})['ok'])
  self.assertFalse(self.call({'action':'inspect','shell':'x'})['ok'])
  p=self.prepare();a={'plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':False}
  self.assertFalse(self.call({'action':'apply',**a})['ok'])
  Path(p['prefix']).mkdir(parents=True);(Path(p['prefix'])/'unrelated').write_text('preserve')
  a['approved']=True;self.assertFalse(self.call({'action':'apply',**a})['ok']);self.assertEqual((Path(p['prefix'])/'unrelated').read_text(),'preserve')
if __name__=='__main__':unittest.main()
