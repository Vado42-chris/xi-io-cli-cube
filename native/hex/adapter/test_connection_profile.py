import unittest,tempfile,subprocess,json,os,sys,shutil
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE));import installer_adapter as adapter
import connection_profile as connection
NODE=shutil.which('node')
class ActualConnectionPayload(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.home=Path(self.tmp.name)
  self.environment=patch.dict(os.environ,{'HOME':str(self.home),'XDG_STATE_HOME':str(self.home/'state')},clear=True);self.environment.start()
 def tearDown(self):self.environment.stop();self.tmp.cleanup()
 def prepare(self):return adapter.handle({'action':'prepare','prefix':str(self.home/'selected/cli'),'node':NODE,'components':['cli']})
 def approval(self,p):return {'plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True}
 def test_real_closure_install_configuration_refusal_and_kernel_rollback(self):
  p=self.prepare();self.assertTrue(p['connection']['required']);self.assertFalse(Path(p['prefix']).exists())
  r=adapter.handle({'action':'apply',**self.approval(p)})
  self.assertFalse(r['connected']);self.assertEqual(r['connection_state'],'CONFIGURATION_REQUIRED')
  launcher=Path(p['connection']['launcher']);self.assertTrue(launcher.is_file())
  cp=subprocess.run([str(launcher)],capture_output=True,text=True,env={'PATH':'/usr/bin:/bin'},timeout=10)
  self.assertEqual(cp.returncode,3);self.assertEqual(json.loads(cp.stdout)['state'],'CONFIGURATION_REQUIRED')
  # Import the actual TS-containing execution closure; no main/host operations.
  lib=Path(p['prefix'])/connection.REL/'lib/device-execute.mjs'
  cp=subprocess.run([NODE,'--experimental-strip-types','--input-type=module','-e','await import(process.argv[1])',lib.as_uri()],capture_output=True,text=True,env={'PATH':'/usr/bin:/bin'},timeout=10)
  self.assertEqual(cp.returncode,0,cp.stderr)
  base=adapter.root();receipt=r['connection_readback']['receipt_sha256'];old=(Path(p['prefix'])/'current').read_bytes()
  connection.revert(base,p,adapter.SOURCE/'connection',receipt)
  self.assertFalse(launcher.exists());self.assertEqual((Path(p['prefix'])/'current').read_bytes(),old)
  self.assertTrue((Path(p['prefix'])/'bin/xi-io-cli').exists())
 def test_cli_failure_restores_connection_and_preserves_prior_cli(self):
  p=self.prepare();r=adapter.handle({'action':'apply',**self.approval(p)})
  connection.revert(adapter.root(),p,adapter.SOURCE/'connection',r['connection_readback']['receipt_sha256'])
  before=(Path(p['prefix'])/'current').read_bytes();cli=(Path(p['prefix'])/'bin/xi-io-cli').read_bytes()
  p2=self.prepare();real_run=adapter.run
  def fail_cli(argv,*args,**kwargs):
   if str(adapter.SOURCE/'install.mjs') in argv:raise RuntimeError('injected before CLI acquisition')
   return real_run(argv,*args,**kwargs)
  with patch.object(adapter,'run',side_effect=fail_cli):
   with self.assertRaisesRegex(adapter.Refused,'OUTCOME_UNCERTAIN'):adapter.handle({'action':'apply',**self.approval(p2)})
  self.assertEqual((Path(p['prefix'])/'current').read_bytes(),before);self.assertEqual((Path(p['prefix'])/'bin/xi-io-cli').read_bytes(),cli)
  self.assertFalse(Path(p2['connection']['launcher']).exists())
  state=adapter.handle({'action':'inspect','plan_id':p2['plan_id']});self.assertTrue(state['do_not_retry']);self.assertEqual(state['phase'],'APPLY_OUTCOME_UNCERTAIN')
if __name__=='__main__':unittest.main()
