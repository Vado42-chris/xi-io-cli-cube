import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

ADAPTER=Path(__file__).resolve().parent
sys.path.insert(0,str(ADAPTER))
import permission_profile
import installer_adapter


class InstalledServiceConsumerTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.base=Path(self.tmp.name)/'state';self.base.mkdir(mode=0o700)
  self.plan_id='a'*32
  self.plan={'plan_id':self.plan_id,'prefix':str(Path(self.tmp.name)/'cli')}
  self.view={'phase':'INSTALLED_READBACK_VERIFIED','do_not_retry':False}
  self.tree_view={'current':{'kind':'file','sha256':'1','mode':0o600}}
  self.generation='generation-1'
  self.observation={'events':[{'details':{
   'destination_tree_digest':installer_adapter.digest(installer_adapter.canonical(self.tree_view)),
   'generation':self.generation}}]}
  self.grant={'schema':permission_profile.SCHEMA,'profile_id':'service-admin',
              'capabilities':['start_services','stop_services'],
              'service_scopes':['ollama'],'update_policy':'off',
              'central_updates':False,'remote_access':False,'revoked':False,
              'permission_digest':'b'*64}
  self.catalog={'document':{'schema':'xiio.cli.service-catalog/v1','services':[]},
                'catalog_sha256':'c'*64}

 def common(self):
  return [
   patch.object(installer_adapter,'root',return_value=self.base),
   patch.object(installer_adapter,'load_plan',return_value=self.plan),
   patch.object(installer_adapter,'project',return_value=self.view),
   patch.object(installer_adapter,'observation',return_value=self.observation),
   patch.object(installer_adapter,'tree',return_value=self.tree_view),
   patch.object(installer_adapter,'installed',return_value={'generation':self.generation}),
   patch.object(installer_adapter.permission_profile,'load_grant',return_value=self.grant),
   patch.object(installer_adapter.service_profile,'load_catalog',return_value=self.catalog),
  ]

 def run_with(self,request,compile_plan,apply_effect=None):
  patches=self.common()
  patches.append(patch.object(installer_adapter.service_profile,'compile_service_plan',
                              return_value=compile_plan))
  if apply_effect is not None:
   patches.append(patch.object(installer_adapter.service_profile,'apply_service_action',
                               return_value=apply_effect))
  entered=[]
  try:
   for item in patches: entered.append(item.start())
   return installer_adapter.handle(request),entered
  finally:
   for item in reversed(patches): item.stop()

 def test_service_plan_requires_reviewed_action(self):
  patches=self.common()
  try:
   for item in patches:item.start()
   with self.assertRaisesRegex(installer_adapter.Refused,'SERVICE_PLAN_ACTION_REQUIRED'):
    installer_adapter.handle({'action':'service_plan','plan_id':self.plan_id,
                              'service_ids':['ollama']})
  finally:
   for item in reversed(patches):item.stop()

 def test_service_plan_passes_durable_grant_coordinates(self):
  compiled={'schema':'xiio.hex.user-service-admin/v1','action':'start',
            'permission_plan_id':self.plan_id,'permission_grant_ref':'sha256:'+'d'*64}
  result,entered=self.run_with(
   {'action':'service_plan','plan_id':self.plan_id,'service_ids':['ollama'],
    'service_action':'start'},compiled)
  compile_mock=entered[-1]
  compile_mock.assert_called_once_with(
   self.catalog,self.grant,['ollama'],'start',
   permission_base=self.base,permission_plan_id=self.plan_id)
  self.assertEqual(result['action'],'start')
  self.assertEqual(result['service_plan_digest'],
                   installer_adapter.digest(installer_adapter.canonical(compiled)))

 def test_service_start_consumes_reviewed_action_catalog_and_grant_root(self):
  compiled={'schema':'xiio.hex.user-service-admin/v1','action':'start',
            'permission_plan_id':self.plan_id,'permission_grant_ref':'sha256:'+'d'*64}
  plan_digest=installer_adapter.digest(installer_adapter.canonical(compiled))
  effect={'schema':'xiio.hex.user-service-effect/v1','state':'READBACK_VERIFIED'}
  result,entered=self.run_with(
   {'action':'service_start','plan_id':self.plan_id,'service_ids':['ollama'],
    'service_plan_digest':plan_digest,'approved':True},compiled,effect)
  compile_mock=entered[-2];apply_mock=entered[-1]
  compile_mock.assert_called_once_with(
   self.catalog,self.grant,['ollama'],'start',
   permission_base=self.base,permission_plan_id=self.plan_id)
  apply_mock.assert_called_once_with(
   compiled,self.grant,'start',True,
   catalog_source_root=installer_adapter.SOURCE,permission_base=self.base)
  self.assertEqual(result['service_plan_digest'],plan_digest)

 def test_service_start_refuses_digest_from_other_reviewed_action(self):
  compiled={'schema':'xiio.hex.user-service-admin/v1','action':'start'}
  stop={'schema':'xiio.hex.user-service-admin/v1','action':'stop'}
  stop_digest=installer_adapter.digest(installer_adapter.canonical(stop))
  patches=self.common()
  compile_patch=patch.object(installer_adapter.service_profile,'compile_service_plan',
                             return_value=compiled)
  apply_patch=patch.object(installer_adapter.service_profile,'apply_service_action')
  try:
   for item in patches:item.start()
   compile_patch.start();apply_mock=apply_patch.start()
   with self.assertRaisesRegex(installer_adapter.Refused,'SERVICE_PLAN_CHANGED_SINCE_REVIEW'):
    installer_adapter.handle(
     {'action':'service_start','plan_id':self.plan_id,'service_ids':['ollama'],
      'service_plan_digest':stop_digest,'approved':True})
   apply_mock.assert_not_called()
  finally:
   apply_patch.stop();compile_patch.stop()
   for item in reversed(patches):item.stop()


class PermissionGrantTransactionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.base=Path(self.tmp.name)/'authority';self.base.mkdir(mode=0o700)
  self.plan_id='f'*32
  self.profile=permission_profile.compile_profile({
   'profile_id':'install-and-service',
   'capabilities':['install_files','start_services','stop_services'],
   'service_scopes':['ollama'],'update_policy':'off',
   'central_updates':False,'remote_access':False,'revoked':False})
  self.plan={'plan_id':self.plan_id,'permission_profile':self.profile}

 def test_install_creates_reopened_grant_and_rollback_revokes_it(self):
  applied=installer_adapter._commit_permission_state(self.base,self.plan,'apply')
  self.assertEqual(applied['permission_state'],'GRANT_READBACK_VERIFIED')
  self.assertEqual(permission_profile.load_grant(self.base,self.plan_id),self.profile)
  rolled=installer_adapter._commit_permission_state(self.base,self.plan,'rollback')
  current=permission_profile.load_grant(self.base,self.plan_id)
  self.assertEqual(rolled['permission_state'],'REVOKED_AFTER_ROLLBACK')
  self.assertEqual(rolled['permission_digest'],current['permission_digest'])
  self.assertTrue(current['revoked']);self.assertEqual(current['capabilities'],[])
  self.assertEqual(current['service_scopes'],[])

 def test_grant_persistence_failure_propagates_instead_of_claiming_install(self):
  with patch.object(installer_adapter.permission_profile,'save_grant',
                    side_effect=ValueError('write failed')):
   with self.assertRaisesRegex(ValueError,'write failed'):
    installer_adapter._commit_permission_state(self.base,self.plan,'apply')


if __name__=='__main__':unittest.main()
