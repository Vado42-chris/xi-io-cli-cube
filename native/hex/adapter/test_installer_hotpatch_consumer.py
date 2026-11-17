import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ADAPTER=Path(__file__).resolve().parent
import sys
sys.path.insert(0,str(ADAPTER))
import installer_adapter
import permission_profile


class InstalledHotpatchConsumerTests(unittest.TestCase):
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
  self.grant=permission_profile.compile_profile({
   'profile_id':'hotpatch-consumer',
   'capabilities':['receive_central_updates','apply_hotpatches'],
   'service_scopes':['inbox'],'update_policy':'review_each',
   'central_updates':True,'remote_access':False,'revoked':False})
  self.request={'request_id':'request:one','kind':'hotpatch','service_id':'inbox',
   'severity':'security','target_generation':'generation-2','signed':True,
   'rollback_available':True,'requires_restart':True}
  self.package_root=Path(self.tmp.name)/'package';self.package_root.mkdir()
  self.server_plan={'schema':'xiio.hex.server-plan/v1','package_sha256':'c'*64}
  self.server_plan_digest=installer_adapter.digest(installer_adapter.canonical(self.server_plan))

 def authority(self,decision):
  return {'ward_admission':True,'ward_admission_ref':'ward:one',
   'work_ref':'work:one','assignment_ref':'assignment:one','attempt_ref':'attempt:one',
   'generation_ref':'authority:generation-1','currentness_ref':'current:one',
   'effect_authorization_ref':'effect:one','permission_digest':self.grant['permission_digest'],
   'central_request_id':decision['request_id'],'service_id':decision['service_id'],
   'kind':decision['kind'],'target_generation':decision['target_generation'],
   'decision_digest':decision['decision_digest']}

 def patches(self):
  return [
   patch.object(installer_adapter,'root',return_value=self.base),
   patch.object(installer_adapter,'load_plan',return_value=self.plan),
   patch.object(installer_adapter,'project',return_value=self.view),
   patch.object(installer_adapter,'observation',return_value=self.observation),
   patch.object(installer_adapter,'tree',return_value=self.tree_view),
   patch.object(installer_adapter,'installed',return_value={'generation':self.generation}),
   patch.object(installer_adapter.permission_profile,'load_grant',return_value=self.grant),
   patch.object(installer_adapter.server_profile,'prepare_server_package',return_value=self.server_plan),
  ]

 def request_payload(self,request,authorization):
  return {'action':'hotpatch_apply','plan_id':self.plan_id,'request':request,
   'package_root':str(self.package_root),'server_plan':self.server_plan,
   'server_plan_digest':self.server_plan_digest,'authorization':authorization,
   'approved':True}

 def test_installed_hotpatch_consumes_exact_ward_bound_decision(self):
  decision=permission_profile.authorize_central_request(self.grant,self.request)
  entered=[]
  apply_patch=patch.object(installer_adapter.server_profile,'apply_server_package',
                           return_value={'state':'READBACK_VERIFIED'})
  try:
   for item in self.patches():entered.append(item.start())
   apply_mock=apply_patch.start()
   result=installer_adapter.handle(self.request_payload(self.request,self.authority(decision)))
   self.assertEqual(result['authorization']['schema'],permission_profile.EFFECT_SCHEMA)
   self.assertTrue(result['authorization']['authorized'])
   self.assertEqual(result['authorization']['decision_digest'],decision['decision_digest'])
   apply_mock.assert_called_once()
  finally:
   apply_patch.stop()
   for item in reversed(entered):item.stop()

 def test_cross_request_ward_replay_refuses_before_server_effect(self):
  original=permission_profile.authorize_central_request(self.grant,self.request)
  replay=dict(self.request);replay['request_id']='request:two'
  entered=[]
  apply_patch=patch.object(installer_adapter.server_profile,'apply_server_package')
  try:
   for item in self.patches():entered.append(item.start())
   apply_mock=apply_patch.start()
   with self.assertRaisesRegex(ValueError,'EFFECT_REQUEST_ID_MISMATCH'):
    installer_adapter.handle(self.request_payload(replay,self.authority(original)))
   apply_mock.assert_not_called()
  finally:
   apply_patch.stop()
   for item in reversed(entered):item.stop()


if __name__=='__main__':unittest.main()
