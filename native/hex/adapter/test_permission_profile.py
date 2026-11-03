import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('permission_profile',ROOT/'native/hex/adapter/permission_profile.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class PermissionProfileTests(unittest.TestCase):
 def test_default_is_file_install_only(self):
  p=mod.compile_profile()
  self.assertEqual(p['capabilities'],['install_files'])
  self.assertEqual(p['update_policy'],'notify')
  self.assertFalse(p['central_updates'])
  self.assertFalse(p['remote_access'])
  self.assertEqual(mod.require_capability(p,'install_files')['profile_id'],'local-standard')
  with self.assertRaisesRegex(ValueError,'CAPABILITY_NOT_GRANTED'):
   mod.require_capability(p,'start_services')

 def test_managed_profile_scopes_services(self):
  p=mod.compile_profile({
   'profile_id':'managed-local',
   'capabilities':['install_files','configure_services','start_services','stop_services','receive_central_updates','apply_hotpatches'],
   'service_scopes':['api-glass-private','inbox'],
   'update_policy':'review_each',
   'central_updates':True,
   'remote_access':False,
   'revoked':False,
  })
  mod.require_capability(p,'start_services','inbox')
  with self.assertRaisesRegex(ValueError,'SERVICE_SCOPE_NOT_GRANTED'):
   mod.require_capability(p,'start_services','crm')

 def test_central_request_never_directly_authorizes_effect(self):
  p=mod.compile_profile({
   'profile_id':'managed-review',
   'capabilities':['install_files','receive_central_updates','apply_hotpatches'],
   'service_scopes':['inbox'],
   'update_policy':'review_each',
   'central_updates':True,
   'remote_access':False,
   'revoked':False,
  })
  d=mod.authorize_central_request(p,{
   'request_id':'req:1','kind':'hotpatch','service_id':'inbox',
   'severity':'security','target_generation':'g2','signed':True,
   'rollback_available':True,'requires_restart':True,
  })
  self.assertTrue(d['allowed_by_profile'])
  self.assertTrue(d['approval_required'])
  self.assertFalse(d['effect_authorized'])

 def test_auto_security_is_only_eligible_not_executed(self):
  p=mod.compile_profile({
   'profile_id':'managed-security-auto',
   'capabilities':['install_files','receive_central_updates','apply_hotpatches'],
   'service_scopes':['api-glass-private'],
   'update_policy':'auto_security','central_updates':True,
   'remote_access':False,'revoked':False,
  })
  d=mod.authorize_central_request(p,{
   'request_id':'req:2','kind':'hotpatch','service_id':'api-glass-private',
   'severity':'security','target_generation':'g3','signed':True,
   'rollback_available':True,'requires_restart':False,
  })
  self.assertTrue(d['auto_eligible'])
  self.assertFalse(d['effect_authorized'])

 def test_revocation_is_zero_capability(self):
  p=mod.compile_profile({'profile_id':'revoked','capabilities':[],'service_scopes':[],
    'update_policy':'off','central_updates':False,'remote_access':False,'revoked':True})
  with self.assertRaisesRegex(ValueError,'PERMISSION_PROFILE_REVOKED'):
   mod.require_capability(p,'install_files')


 def test_effect_authorization_requires_ward_and_currentness(self):
  profile=mod.compile_profile({
   'profile_id':'managed-review','capabilities':['install_files','receive_central_updates','apply_hotpatches'],
   'service_scopes':['inbox'],'update_policy':'review_each','central_updates':True,
   'remote_access':False,'revoked':False})
  d=mod.authorize_central_request(profile,{'request_id':'req:3','kind':'hotpatch','service_id':'inbox',
   'severity':'security','target_generation':'g4','signed':True,'rollback_available':True,'requires_restart':True})
  auth={'ward_admission':True,'ward_admission_ref':'ward:1','work_ref':'work:1',
   'assignment_ref':'assignment:1','attempt_ref':'attempt:1','generation_ref':'g:1',
   'currentness_ref':'current:1','effect_authorization_ref':'effect:1',
   'permission_digest':profile['permission_digest']}
  with self.assertRaisesRegex(ValueError,'EXPLICIT_HOTPATCH_APPROVAL_REQUIRED'):
   mod.require_effect_authorization(d,auth,False)
  a=mod.require_effect_authorization(d,auth,True)
  self.assertTrue(a['authorized'])
  bad={**auth,'work_ref':''}
  with self.assertRaisesRegex(ValueError,'EFFECT_AUTHORIZATION_REF_REQUIRED'):
   mod.require_effect_authorization(d,bad,True)

 def test_auto_security_still_requires_ward_receipt(self):
  profile=mod.compile_profile({
   'profile_id':'managed-auto','capabilities':['install_files','receive_central_updates','apply_hotpatches'],
   'service_scopes':['inbox'],'update_policy':'auto_security','central_updates':True,
   'remote_access':False,'revoked':False})
  d=mod.authorize_central_request(profile,{'request_id':'req:4','kind':'hotpatch','service_id':'inbox',
   'severity':'security','target_generation':'g5','signed':True,'rollback_available':True,'requires_restart':True})
  self.assertTrue(d['auto_eligible'])
  with self.assertRaisesRegex(ValueError,'EFFECT_AUTHORIZATION_REQUIRED'):
   mod.require_effect_authorization(d,None,False)

if __name__=='__main__':unittest.main()
