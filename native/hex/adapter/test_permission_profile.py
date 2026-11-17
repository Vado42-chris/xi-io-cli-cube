import importlib.util
import os
import shutil
import tempfile
import threading
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('permission_profile',ROOT/'native/hex/adapter/permission_profile.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class PermissionProfileTests(unittest.TestCase):
 def profile(self,name='managed',caps=None):
  return mod.compile_profile({
   'profile_id':name,
   'capabilities':caps or ['install_files','start_services','stop_services'],
   'service_scopes':['inbox'],
   'update_policy':'off','central_updates':False,'remote_access':False,'revoked':False})

 def test_default_is_file_install_only(self):
  p=mod.compile_profile()
  self.assertEqual(p['capabilities'],['install_files'])
  self.assertEqual(p['update_policy'],'notify')
  self.assertFalse(p['central_updates']);self.assertFalse(p['remote_access'])
  self.assertEqual(mod.require_capability(p,'install_files')['profile_id'],'local-standard')
  with self.assertRaisesRegex(ValueError,'CAPABILITY_NOT_GRANTED'):
   mod.require_capability(p,'start_services')

 def test_managed_profile_scopes_services(self):
  p=mod.compile_profile({
   'profile_id':'managed-local',
   'capabilities':['install_files','configure_services','start_services','stop_services','receive_central_updates','apply_hotpatches'],
   'service_scopes':['api-glass-private','inbox'],'update_policy':'review_each',
   'central_updates':True,'remote_access':False,'revoked':False})
  mod.require_capability(p,'start_services','inbox')
  with self.assertRaisesRegex(ValueError,'SERVICE_SCOPE_NOT_GRANTED'):
   mod.require_capability(p,'start_services','crm')

 def test_central_request_never_directly_authorizes_effect(self):
  p=mod.compile_profile({
   'profile_id':'managed-review','capabilities':['install_files','receive_central_updates','apply_hotpatches'],
   'service_scopes':['inbox'],'update_policy':'review_each','central_updates':True,
   'remote_access':False,'revoked':False})
  d=mod.authorize_central_request(p,{
   'request_id':'req:1','kind':'hotpatch','service_id':'inbox','severity':'security',
   'target_generation':'g2','signed':True,'rollback_available':True,'requires_restart':True})
  self.assertTrue(d['allowed_by_profile']);self.assertTrue(d['approval_required'])
  self.assertFalse(d['effect_authorized'])

 def test_auto_security_is_only_eligible_not_executed(self):
  p=mod.compile_profile({
   'profile_id':'managed-security-auto','capabilities':['install_files','receive_central_updates','apply_hotpatches'],
   'service_scopes':['api-glass-private'],'update_policy':'auto_security','central_updates':True,
   'remote_access':False,'revoked':False})
  d=mod.authorize_central_request(p,{
   'request_id':'req:2','kind':'hotpatch','service_id':'api-glass-private','severity':'security',
   'target_generation':'g3','signed':True,'rollback_available':True,'requires_restart':False})
  self.assertTrue(d['auto_eligible']);self.assertFalse(d['effect_authorized'])

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
  self.assertTrue(mod.require_effect_authorization(d,auth,True)['authorized'])
  with self.assertRaisesRegex(ValueError,'EFFECT_AUTHORIZATION_REF_REQUIRED'):
   mod.require_effect_authorization(d,{**auth,'work_ref':''},True)

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

 def test_initial_grant_requires_explicit_approval_before_custody_creation(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);plan='0'*32
   with self.assertRaisesRegex(ValueError,'EXPLICIT_PERMISSION_GRANT_APPROVAL_REQUIRED'):
    mod.save_grant(base,plan,self.profile(),False)
   self.assertFalse((base/'permissions').exists())

 def test_grant_create_load_and_replace_are_private_plan_bound_and_current(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);plan='a'*32;first=self.profile('first')
   self.assertEqual(mod.save_grant(base,plan,first,True),first)
   target=base/'permissions'/f'{plan}.json'
   self.assertEqual(target.stat().st_mode & 0o777,0o600)
   self.assertEqual(target.stat().st_nlink,1)
   self.assertEqual((base/'permissions').stat().st_mode & 0o777,0o700)
   self.assertEqual(mod.load_grant(base,plan),first)
   second=self.profile('second',['install_files','stop_services'])
   with self.assertRaisesRegex(ValueError,'EXPLICIT_PERMISSION_CHANGE_APPROVAL_REQUIRED'):
    mod.replace_grant(base,plan,first['permission_digest'],second,False)
   replaced=mod.replace_grant(base,plan,first['permission_digest'],second,True)
   self.assertEqual(replaced,second);self.assertEqual(mod.load_grant(base,plan),second)

 def test_save_cannot_silently_overwrite_existing_grant(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);plan='b'*32;first=self.profile('first');second=self.profile('second')
   mod.save_grant(base,plan,first,True)
   with self.assertRaisesRegex(ValueError,'PERMISSION_GRANT_ALREADY_EXISTS'):
    mod.save_grant(base,plan,second,True)
   self.assertEqual(mod.load_grant(base,plan),first)

 def test_grant_copied_under_another_plan_id_refuses(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);first_plan='2'*32;second_plan='3'*32
   mod.save_grant(base,first_plan,self.profile('first'),True)
   source=base/'permissions'/f'{first_plan}.json'
   target=base/'permissions'/f'{second_plan}.json'
   shutil.copyfile(source,target);target.chmod(0o600)
   with self.assertRaisesRegex(ValueError,'PERMISSION_GRANT_PLAN_MISMATCH'):
    mod.load_grant(base,second_plan)

 def test_stale_replace_refuses_without_changing_current_grant(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);plan='c'*32;first=self.profile('first');mod.save_grant(base,plan,first,True)
   with self.assertRaisesRegex(ValueError,'PERMISSION_CURRENTNESS_CHANGED'):
    mod.replace_grant(base,plan,'0'*64,self.profile('second'),True)
   self.assertEqual(mod.load_grant(base,plan),first)

 def test_invalid_current_digest_refuses_before_replacement(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);plan='4'*32;first=self.profile('first');mod.save_grant(base,plan,first,True)
   with self.assertRaisesRegex(ValueError,'PERMISSION_CURRENT_DIGEST_INVALID'):
    mod.replace_grant(base,plan,'G'*64,self.profile('second'),True)
   self.assertEqual(mod.load_grant(base,plan),first)

 def test_two_replacements_from_one_generation_cannot_both_win(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);plan='d'*32;first=self.profile('first');mod.save_grant(base,plan,first,True)
   barrier=threading.Barrier(2);results=[];errors=[]
   def worker(profile):
    try:
     barrier.wait();results.append(mod.replace_grant(base,plan,first['permission_digest'],profile,True))
    except Exception as exc: errors.append(str(exc))
   threads=[threading.Thread(target=worker,args=(self.profile('second'),)),
            threading.Thread(target=worker,args=(self.profile('third'),))]
   for thread in threads: thread.start()
   for thread in threads: thread.join()
   self.assertEqual(len(results),1);self.assertEqual(errors,['PERMISSION_CURRENTNESS_CHANGED'])
   self.assertEqual(mod.load_grant(base,plan),results[0])

 def test_symlinked_permissions_directory_refuses(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);outside=base/'outside';outside.mkdir(mode=0o700)
   (base/'permissions').symlink_to(outside,target_is_directory=True)
   with self.assertRaisesRegex(ValueError,'PERMISSION_ROOT_UNTRUSTED'):
    mod.save_grant(base,'e'*32,self.profile(),True)

 def test_hard_linked_or_group_writable_grant_refuses(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);plan='f'*32;mod.save_grant(base,plan,self.profile(),True)
   target=base/'permissions'/f'{plan}.json';alias=base/'permissions'/'alias.json'
   os.link(target,alias)
   with self.assertRaisesRegex(ValueError,'PERMISSION_GRANT_UNTRUSTED'):
    mod.load_grant(base,plan)
   alias.unlink();target.chmod(0o660)
   with self.assertRaisesRegex(ValueError,'PERMISSION_GRANT_UNTRUSTED'):
    mod.load_grant(base,plan)

 def test_untrusted_lock_file_refuses_before_grant_write(self):
  with tempfile.TemporaryDirectory() as td:
   base=Path(td);root=base/'permissions';root.mkdir(mode=0o700);plan='1'*32
   lock=root/f'.{plan}.json.lock';lock.write_text('x');lock.chmod(0o644)
   with self.assertRaisesRegex(ValueError,'PERMISSION_GRANT_LOCK_UNTRUSTED'):
    mod.save_grant(base,plan,self.profile(),True)
   self.assertFalse((root/f'{plan}.json').exists())

if __name__=='__main__':unittest.main()
