import unittest,tempfile,subprocess,json,os,shutil,importlib.util,stat
from unittest.mock import patch,Mock
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
 def prepare(self,permission_profile=None):
  request={'action':'prepare','prefix':str(self.home/'selected/cli'),'node':NODE,'components':['cli']}
  if permission_profile is not None:request['permission_profile']=permission_profile
  r=self.call(request);self.assertTrue(r['ok'],r);return r['result']
 def launch_fixture(self,apply=True):
  # A real temporary installed CLI, with a copied Node executable whose bytes can
  # be changed safely. Only the terminal process is mocked in these checks.
  node=self.home/'selected-node';shutil.copyfile(Path(NODE).resolve(),node);node.chmod(0o700)
  r=self.call({'action':'prepare','prefix':str(self.home/'selected/cli'),'node':str(node),'components':['cli']})
  self.assertTrue(r['ok'],r);p=r['result']
  if apply:
   r=self.call({'action':'apply','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True})
   self.assertTrue(r['ok'],r)
  spec=importlib.util.spec_from_file_location('xiio_cli_launch_test',ADAPTER)
  adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
  workspace=self.home/'project';workspace.mkdir(mode=0o700)
  return adapter,p,{'action':'launch_cli','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True,'workspace':str(workspace)}
 def test_launch_cli_uses_fresh_installed_readback_and_fixed_terminal_argv(self):
  a,p,request=self.launch_fixture();process=Mock(pid=321)
  with patch.dict(os.environ,{**self.env,'DISPLAY':':77','LD_PRELOAD':'must-not-forward','SECRET_TOKEN':'must-not-forward'},clear=True),patch.object(a,'registered_terminal',return_value='/usr/bin/registered-test-terminal',create=True),patch.object(a,'start_terminal',return_value=process,create=True) as spawn:
   result=a.handle(request)
  self.assertEqual(result['state'],'CLI_LAUNCH_REQUESTED');self.assertEqual(result['pid'],321)
  self.assertEqual(result['plan_id'],p['plan_id']);self.assertTrue(result['launch_requested']);self.assertFalse(result['runtime_ready'])
  self.assertEqual(result['generation'],(Path(p['prefix'])/'current').read_text().strip())
  self.assertEqual(spawn.call_count,1)
  self.assertEqual(spawn.call_args.args[0],['/usr/bin/registered-test-terminal','-e',str(Path(p['prefix'])/'bin/xi-io-cli'),'menu'])
  options=spawn.call_args.kwargs;self.assertIs(options['shell'],False);self.assertIs(options['start_new_session'],True)
  self.assertEqual(options['env']['DISPLAY'],':77');self.assertNotIn('LD_PRELOAD',options['env']);self.assertNotIn('SECRET_TOKEN',options['env'])
  self.assertEqual(options['cwd'],request['workspace']);self.assertEqual(result['workspace'],request['workspace'])
  self.assertEqual(options['stdin'],subprocess.DEVNULL)
 def test_launch_cli_requires_exact_approval_and_finite_request(self):
  a,p,request=self.launch_fixture()
  cases=[({'approved':False},'EXACT_APPROVAL_REQUIRED'),({'approval_digest':'0'*64},'EXACT_APPROVAL_REQUIRED'),({'args':['other']},'REQUEST_FIELDS_INVALID'),({'executable':'/bin/true'},'REQUEST_FIELDS_INVALID'),({'url':'https://example.invalid'},'REQUEST_FIELDS_INVALID')]
  with patch.dict(os.environ,{**self.env,'DISPLAY':':77'},clear=True),patch.object(a,'start_terminal',create=True) as spawn:
   for changes,reason in cases:
    with self.subTest(changes=changes),self.assertRaisesRegex(a.Refused,reason):a.handle({**request,**changes})
   spawn.assert_not_called()
 def test_launch_cli_refuses_installed_generation_launcher_and_node_drift(self):
  a,p,request=self.launch_fixture();prefix=Path(p['prefix']);generation=(prefix/'current').read_text().strip()
  targets=[(prefix/'current',b'not-the-reviewed-generation\n'),(prefix/'bin/xi-io-cli',b'#!/bin/sh\nexit 0\n'),(prefix/'versions'/generation/'src/xiio.mjs',b'changed payload'),(Path(p['node']['path']),b'#!/bin/sh\nexit 0\n')]
  with patch.dict(os.environ,{**self.env,'DISPLAY':':77'},clear=True),patch.object(a,'start_terminal',create=True) as spawn:
   for target,replacement in targets:
    original=target.read_bytes()
    try:
     target.write_bytes(replacement)
     with self.subTest(target=target.name),self.assertRaisesRegex(a.Refused,'INSTALLED_STATE_DRIFT|NODE_CHANGED_SINCE_REVIEW'):a.handle(request)
    finally:target.write_bytes(original)
   spawn.assert_not_called()
 def test_launch_cli_refuses_prepared_unavailable_terminal_and_missing_desktop(self):
  a,p,request=self.launch_fixture(apply=False)
  with patch.dict(os.environ,{**self.env,'DISPLAY':':77'},clear=True),patch.object(a,'start_terminal',create=True) as spawn:
   with self.assertRaisesRegex(a.Refused,'VERIFIED_INSTALLED_CLI_REQUIRED'):a.handle(request)
   spawn.assert_not_called()
  installed=self.call({'action':'apply','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True});self.assertTrue(installed['ok'],installed)
  with patch.dict(os.environ,{**self.env,'DISPLAY':':77'},clear=True),patch.object(a,'registered_terminal',side_effect=a.Refused('REGISTERED_TERMINAL_UNAVAILABLE'),create=True),patch.object(a,'start_terminal',create=True) as spawn:
   with self.assertRaisesRegex(a.Refused,'REGISTERED_TERMINAL_UNAVAILABLE'):a.handle(request)
   spawn.assert_not_called()
  with patch.dict(os.environ,self.env,clear=True),patch.object(a,'registered_terminal',return_value='/usr/bin/registered-test-terminal',create=True),patch.object(a,'start_terminal',create=True) as spawn:
   with self.assertRaisesRegex(a.Refused,'CLI_LAUNCH_DESKTOP_UNAVAILABLE'):a.handle(request)
   spawn.assert_not_called()
  with patch.dict(os.environ,{**self.env,'DISPLAY':':77'},clear=True),patch.object(a,'registered_terminal',return_value='/usr/bin/registered-test-terminal',create=True),patch.object(a,'start_terminal',side_effect=OSError('not started'),create=True):
   with self.assertRaisesRegex(a.Refused,'CLI_TERMINAL_NOT_STARTED'):a.handle(request)
 def test_launch_cli_resolves_only_trusted_registered_terminal(self):
  spec=importlib.util.spec_from_file_location('xiio_cli_terminal_test',ADAPTER)
  a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
  target=self.home/'terminal';target.write_text('not executed');target.chmod(0o700)
  link=self.home/'registered';link.symlink_to(target)
  original=Path.lstat
  def metadata(path):
   values=list(original(path));values[4]=0
   if not stat.S_ISLNK(values[0]):values[0]&=~0o022
   return os.stat_result(values)
  def selected(value):return link if str(value)=='/usr/bin/x-terminal-emulator' else Path(value)
  with patch.object(a,'Path',side_effect=selected),patch.object(Path,'lstat',autospec=True,side_effect=metadata):
   self.assertEqual(a.registered_terminal(),str(target))
  with patch.object(a,'Path',side_effect=selected):
   with self.assertRaisesRegex(a.Refused,'REGISTERED_TERMINAL_UNTRUSTED'):a.registered_terminal()
  link.unlink()
  with patch.object(a,'Path',side_effect=selected):
   with self.assertRaisesRegex(a.Refused,'REGISTERED_TERMINAL_UNAVAILABLE'):a.registered_terminal()
 def test_launch_cli_requires_bounded_existing_project_without_install_overlap(self):
  a,p,request=self.launch_fixture();project=Path(request['workspace'])
  link=self.home/'linked-project';link.symlink_to(project)
  file=self.home/'not-directory';file.write_text('not a project')
  sensitive=self.home/'.ssh';sensitive.mkdir()
  cases=[None,'',str(self.home),'/','relative',str(self.home/'missing'),str(link),str(file),str(sensitive),p['prefix'],str(self.home/'state')]
  with patch.dict(os.environ,{**self.env,'DISPLAY':':77'},clear=True),patch.object(a,'start_terminal') as spawn:
   for selected in cases:
    with self.subTest(workspace=selected),self.assertRaises(a.Refused):a.handle({**request,'workspace':selected})
   spawn.assert_not_called()
 def test_real_offline_install_readback_duplicate_and_upgrade_rollback(self):
  p=self.prepare();self.assertFalse((self.home/'selected/cli').exists())
  approval={'plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True}
  r=self.call({'action':'apply',**approval});self.assertTrue(r['ok'],r);self.assertEqual(r['result']['phase'],'INSTALLED_READBACK_VERIFIED')
  self.assertEqual(r['result']['permission_state'],'GRANT_READBACK_VERIFIED')
  self.assertEqual(r['result']['permission_digest'],p['permission_digest'])
  self.assertTrue(self.call({'action':'readback','plan_id':p['plan_id']})['ok'])
  self.assertFalse(self.call({'action':'apply',**approval})['ok'])
  self.assertFalse(self.call({'action':'rollback',**approval})['ok'])
  old=(self.home/'selected/cli/current').read_text();p2=self.prepare();a2={'plan_id':p2['plan_id'],'approval_digest':p2['approval_digest'],'approved':True}
  self.assertTrue(self.call({'action':'apply',**a2})['ok'])
  r=self.call({'action':'rollback',**a2});self.assertTrue(r['ok'],r);self.assertEqual((self.home/'selected/cli/current').read_text(),old)
  self.assertEqual(r['result']['permission_state'],'REVOKED_AFTER_ROLLBACK')
  self.assertNotEqual(r['result']['permission_digest'],p2['permission_digest'])
 def test_installed_service_plan_consumes_durable_grant_and_reviewed_action(self):
  profile={'schema':'xiio.hex.permission-profile/v1','profile_id':'service-consumer',
   'capabilities':['install_files','start_services','stop_services'],
   'service_scopes':['ollama'],'update_policy':'off','central_updates':False,
   'remote_access':False,'revoked':False}
  p=self.prepare(profile);approval={'plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True}
  applied=self.call({'action':'apply',**approval});self.assertTrue(applied['ok'],applied)
  self.assertEqual(applied['result']['permission_state'],'GRANT_READBACK_VERIFIED')
  missing=self.call({'action':'service_plan','plan_id':p['plan_id'],'service_ids':['ollama']})
  self.assertFalse(missing['ok']);self.assertIn('SERVICE_PLAN_ACTION_REQUIRED',missing['error'])
  planned=self.call({'action':'service_plan','plan_id':p['plan_id'],'service_ids':['ollama'],'service_action':'start'})
  self.assertTrue(planned['ok'],planned)
  self.assertEqual(planned['result']['action'],'start')
  self.assertEqual(planned['result']['permission_plan_id'],p['plan_id'])
  self.assertEqual(planned['result']['permission_digest'],p['permission_digest'])
  self.assertTrue(planned['result']['permission_grant_ref'].startswith('sha256:'))
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
