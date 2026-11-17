import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ADAPTER=Path(__file__).resolve().parent
KERNEL=ADAPTER/'kernel'
sys.path.insert(0,str(KERNEL));sys.path.insert(0,str(ADAPTER))
import permission_profile
import server_profile


def digest(value): return hashlib.sha256(value).hexdigest()


class ServerUpdateRollbackTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.root=Path(self.tmp.name)/'package';self.root.mkdir()
  self.home=Path(self.tmp.name)/'home';self.home.mkdir()
  self.new_unit=b'[Unit]\nDescription=XIIO new\n[Service]\nExecStart=/usr/bin/true\n'
  self.new_config=b'{"generation":"new"}\n'
  self.old_unit=b'[Unit]\nDescription=XIIO old\n[Service]\nExecStart=/usr/bin/true\n'
  self.old_config=b'{"generation":"old"}\n'
  (self.root/'unit.service').write_bytes(self.new_unit)
  (self.root/'config.json').write_bytes(self.new_config)
  manifest={
   'schema_version':'xiio-installer-product-manifest-v1','profile_id':'fixture-server',
   'product_id':'xiio-test-server','display_name':'XIIO test server','version':'2',
   'channel':'fixture','fixture':True,
   'payload':[
    {'source':'unit.service','sha256':digest(self.new_unit),'size':len(self.new_unit),
     'destination_scope':'xdg_config','destination':'systemd/user/xiio-test.service',
     'mode':'0644','overwrite':'backup_replace'},
    {'source':'config.json','sha256':digest(self.new_config),'size':len(self.new_config),
     'destination_scope':'xdg_data','destination':'xiio/test/config.json',
     'mode':'0600','overwrite':'backup_replace'},
   ]}
  (self.root/'manifest.json').write_text(json.dumps(manifest))
  package={'schema':server_profile.SCHEMA,'package_id':'fixture','version':'2','channel':'fixture',
   'source_ref':'fixture:2','payload_manifest':'manifest.json',
   'services':[{'service_id':'api-glass-private','unit':'xiio-test.service',
                'probe':'http://127.0.0.1:8870/health','required':True}]}
  (self.root/'server-package.json').write_text(json.dumps(package))
  self.unit_path=self.home/'.config/systemd/user/xiio-test.service'
  self.config_path=self.home/'.local/share/xiio/test/config.json'
  self.unit_path.parent.mkdir(parents=True);self.config_path.parent.mkdir(parents=True)
  self.unit_path.write_bytes(self.old_unit);self.unit_path.chmod(0o644)
  self.config_path.write_bytes(self.old_config);self.config_path.chmod(0o600)
  self.permissions=permission_profile.compile_profile({
   'profile_id':'managed','capabilities':['install_files','configure_services','start_services','stop_services'],
   'service_scopes':['api-glass-private'],'update_policy':'review_each',
   'central_updates':False,'remote_access':False,'revoked':False})
  self.active=True;self.events=[]

 def fake_run(self,args):
  if args[:3]==['systemctl','--user','show']:
   state='active' if self.active else 'inactive'
   return SimpleNamespace(returncode=0,stdout='LoadState=loaded\nActiveState='+state+'\nSubState='+('running' if self.active else 'dead')+'\n',stderr='')
  if args[:3]==['systemctl','--user','start']:
   self.events.append('start');self.active=True
   return SimpleNamespace(returncode=0,stdout='',stderr='')
  if args[:3]==['systemctl','--user','stop']:
   self.events.append('stop');self.active=False
   return SimpleNamespace(returncode=0,stdout='',stderr='')
  if args==['systemctl','--user','daemon-reload']:
   self.events.append('daemon-reload')
   return SimpleNamespace(returncode=0,stdout='',stderr='')
  return SimpleNamespace(returncode=1,stdout='',stderr='unexpected')

 def plan(self):
  plan=server_profile.prepare_server_package(self.root,self.home,self.permissions)
  actions={row['destination']:row['action'] for row in plan['file_plan']}
  self.assertEqual(actions['systemd/user/xiio-test.service'],'backup_replace')
  self.assertEqual(actions['xiio/test/config.json'],'backup_replace')
  return plan

 def test_explicit_update_rollback_restores_old_bytes_and_active_state(self):
  plan=self.plan();receipt=self.home/'receipt.json'
  with patch.object(server_profile.service_profile,'_run',side_effect=self.fake_run), \
       patch.object(server_profile,'_probe',return_value={'state':'PASS','status':200}):
   server_profile.apply_server_package(self.root,self.home,self.permissions,plan,receipt,True)
   self.events=[]
   result=server_profile.rollback_server_package(self.home,self.permissions,plan,receipt,True)
  self.assertEqual(self.unit_path.read_bytes(),self.old_unit)
  self.assertEqual(self.config_path.read_bytes(),self.old_config)
  self.assertTrue(self.active)
  self.assertEqual(self.events,['stop','daemon-reload','start'])
  row=result['services'][0]
  self.assertEqual(row['unit_plan_action'],'backup_replace')
  self.assertTrue(row['restored_previous_active_state'])
  self.assertEqual(row['final']['active_state'],'active')

 def test_failed_update_restores_old_bytes_and_active_state(self):
  plan=self.plan();receipt=self.home/'receipt.json'
  with patch.object(server_profile.service_profile,'_run',side_effect=self.fake_run), \
       patch.object(server_profile,'_probe',return_value={'state':'UNREACHABLE'}):
   with self.assertRaisesRegex(ValueError,'SERVER_SERVICE_PROBE_FAILED'):
    server_profile.apply_server_package(self.root,self.home,self.permissions,plan,receipt,True)
  self.assertEqual(self.unit_path.read_bytes(),self.old_unit)
  self.assertEqual(self.config_path.read_bytes(),self.old_config)
  self.assertTrue(self.active)
  self.assertEqual(self.events,['daemon-reload','start','stop','daemon-reload','start'])


if __name__=='__main__':unittest.main()
