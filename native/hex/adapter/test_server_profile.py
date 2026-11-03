import hashlib, importlib.util, json, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

ADAPTER=Path(__file__).resolve().parent
KERNEL=ADAPTER/'kernel'
sys.path.insert(0,str(KERNEL));sys.path.insert(0,str(ADAPTER))
import permission_profile
import server_profile

def h(b): return hashlib.sha256(b).hexdigest()

class ServerProfileTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.root=Path(self.tmp.name)/'package';self.root.mkdir()
  self.home=Path(self.tmp.name)/'home';self.home.mkdir()
  unit=b'[Unit]\nDescription=XIIO test\n[Service]\nExecStart=/usr/bin/true\n'
  cfg=b'{"ok":true}\n'
  (self.root/'unit.service').write_bytes(unit);(self.root/'config.json').write_bytes(cfg)
  manifest={
   'schema_version':'xiio-installer-product-manifest-v1',
   'profile_id':'fixture-server',
   'product_id':'xiio-test-server',
   'display_name':'XIIO test server','version':'1','channel':'fixture','fixture':True,
   'payload':[
    {'source':'unit.service','sha256':h(unit),'size':len(unit),'destination_scope':'xdg_config','destination':'systemd/user/xiio-test.service','mode':'0644','overwrite':'backup_replace'},
    {'source':'config.json','sha256':h(cfg),'size':len(cfg),'destination_scope':'xdg_data','destination':'xiio/test/config.json','mode':'0600','overwrite':'backup_replace'},
   ]}
  (self.root/'manifest.json').write_text(json.dumps(manifest))
  package={'schema':server_profile.SCHEMA,'package_id':'fixture','version':'1','channel':'fixture',
   'source_ref':'fixture:1','payload_manifest':'manifest.json',
   'services':[{'service_id':'api-glass-private','unit':'xiio-test.service','probe':'http://127.0.0.1:8870/health','required':True}]}
  (self.root/'server-package.json').write_text(json.dumps(package))
  self.permissions=permission_profile.compile_profile({
   'profile_id':'managed','capabilities':['install_files','configure_services','start_services','stop_services','receive_central_updates','apply_hotpatches'],
   'service_scopes':['api-glass-private'],'update_policy':'review_each','central_updates':True,'remote_access':False,'revoked':False})
  self.active=False
  def fake_run(args):
   if args[:3]==['systemctl','--user','show']:
    state='active' if self.active else 'inactive'
    return SimpleNamespace(returncode=0,stdout='LoadState=loaded\nActiveState='+state+'\nSubState='+('running' if self.active else 'dead')+'\n',stderr='')
   if args[:3]==['systemctl','--user','start']:
    self.active=True;return SimpleNamespace(returncode=0,stdout='',stderr='')
   if args[:3]==['systemctl','--user','stop']:
    self.active=False;return SimpleNamespace(returncode=0,stdout='',stderr='')
   if args==['systemctl','--user','daemon-reload']:
    return SimpleNamespace(returncode=0,stdout='',stderr='')
   return SimpleNamespace(returncode=1,stdout='',stderr='unexpected')
  self.run=fake_run

 def test_prepare_requires_service_grant(self):
  denied=permission_profile.compile_profile()
  with self.assertRaisesRegex(ValueError,'CAPABILITY_NOT_GRANTED'):
   server_profile.prepare_server_package(self.root,self.home,denied)

 def test_prepare_is_review_only(self):
  with patch.object(server_profile.service_profile,'_run',side_effect=self.run):
   p=server_profile.prepare_server_package(self.root,self.home,self.permissions)
  self.assertFalse(p['effect_authorized']);self.assertEqual(p['payload_files'],2)

 def test_changed_package_after_review_refuses(self):
  with patch.object(server_profile.service_profile,'_run',side_effect=self.run):
   p=server_profile.prepare_server_package(self.root,self.home,self.permissions)
   (self.root/'config.json').write_text('changed')
   with self.assertRaises(Exception):
    server_profile.apply_server_package(self.root,self.home,self.permissions,p,self.home/'receipt.json',True)

 def test_apply_starts_and_reads_back_then_rollback(self):
  with patch.object(server_profile.service_profile,'_run',side_effect=self.run), \
       patch.object(server_profile,'_probe',return_value={'state':'PASS','status':200}):
   p=server_profile.prepare_server_package(self.root,self.home,self.permissions)
   receipt=self.home/'receipt.json'
   result=server_profile.apply_server_package(self.root,self.home,self.permissions,p,receipt,True)
   self.assertEqual(result['state'],'INSTALLED_STARTED_READBACK_VERIFIED')
   self.assertTrue(self.active);self.assertTrue(receipt.exists())
   self.assertTrue((self.home/'.config/systemd/user/xiio-test.service').exists())
   rb=server_profile.rollback_server_package(self.home,self.permissions,p,receipt,True)
   self.assertEqual(rb['state'],'ROLLED_BACK_READBACK_REQUIRED')
   self.assertFalse(self.active)
   self.assertFalse((self.home/'config/systemd/user/xiio-test.service').exists())

 def test_failed_required_probe_rolls_back_files_and_service(self):
  with patch.object(server_profile.service_profile,'_run',side_effect=self.run), \
       patch.object(server_profile,'_probe',return_value={'state':'UNREACHABLE'}):
   p=server_profile.prepare_server_package(self.root,self.home,self.permissions)
   receipt=self.home/'receipt.json'
   with self.assertRaisesRegex(ValueError,'SERVER_SERVICE_PROBE_FAILED'):
    server_profile.apply_server_package(self.root,self.home,self.permissions,p,receipt,True)
  self.assertFalse(self.active)
  self.assertFalse((self.home/'config/systemd/user/xiio-test.service').exists())

 def test_revoked_grant_blocks_start(self):
  revoked=permission_profile.compile_profile({'profile_id':'revoked','capabilities':[],'service_scopes':[],
   'update_policy':'off','central_updates':False,'remote_access':False,'revoked':True})
  with self.assertRaisesRegex(ValueError,'PERMISSION_PROFILE_REVOKED'):
   server_profile.prepare_server_package(self.root,self.home,revoked)

if __name__=='__main__':unittest.main()
