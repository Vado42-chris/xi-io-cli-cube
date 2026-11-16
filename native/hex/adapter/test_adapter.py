import unittest,tempfile,subprocess,json,os,shutil
from pathlib import Path
from unittest.mock import patch
import installer_adapter as native_adapter
from xiio_installer.transaction import TransactionError
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

 def test_cli_filesystem_failure_refuses_before_connection_install(self):
  p=self.prepare();self.assertFalse(Path(p['prefix']).exists())
  base=self.home/'state/xi-io/installer'
  with patch.dict(os.environ,self.env), patch.object(native_adapter,'qualify_precommand_manifests',
     side_effect=TransactionError('filesystem preflight: noexec CLI destination')) as probes:
   with self.assertRaisesRegex(TransactionError,'noexec CLI destination'):
    native_adapter.handle({'action':'apply','plan_id':p['plan_id'],
                           'approval_digest':p['approval_digest'],'approved':True})
  self.assertEqual(probes.call_count,1,'shared Installer must qualify both targets in one admission')
  self.assertFalse(Path(p['prefix']).exists(),'no installed connection or CLI payload may remain')
  self.assertFalse((base/'operations'/(p['plan_id']+'-apply.jsonl')).exists(),
                   'a capability denial must not be misreported as an attempted install')

 def test_native_preflight_runs_before_connection_component_apply(self):
  p=self.prepare();base=self.home/'state/xi-io/installer'
  with patch.dict(os.environ,self.env), patch.object(native_adapter,'qualify_apply_targets',
       side_effect=TransactionError('filesystem preflight: unsupported')) as preflight:
   with patch.object(native_adapter.connection_profile,'apply',side_effect=AssertionError('CONNECTION_EFFECT_RAN')) as effect:
    with self.assertRaisesRegex(TransactionError,'filesystem preflight: unsupported'):
     native_adapter.handle({'action':'apply','plan_id':p['plan_id'],
                            'approval_digest':p['approval_digest'],'approved':True})
    self.assertEqual(preflight.call_count,1)
    effect.assert_not_called()
  self.assertFalse(Path(p['prefix']).exists())

if __name__=='__main__':unittest.main()
