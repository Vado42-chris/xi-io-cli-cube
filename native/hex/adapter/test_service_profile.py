import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ADAPTER=Path(__file__).resolve().parent
sys.path.insert(0,str(ADAPTER))
import permission_profile
import service_profile


class ServiceProfileTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.root=Path(self.tmp.name)/'source';(self.root/'config').mkdir(parents=True)
  self.catalog_path=self.root/'config/service-catalog.json'
  self.catalog={
   'schema':service_profile.CATALOG_SCHEMA,
   'services':[
    {'id':'alpha','probe':None,'systemd_candidates':['alpha.service']},
    {'id':'beta','probe':None,'systemd_candidates':['beta.service']},
   ]}
  self.write_catalog()
  self.states={'alpha.service':{'observed':True,'active':'inactive'},
               'beta.service':{'observed':True,'active':'inactive'}}
  self.events=[];self.fail_action=None;self.fail_unit=None;self.fail_with_effect=False
  self.disappear_action=None;self.disappear_unit=None
  self.permissions=permission_profile.compile_profile({
   'profile_id':'service-admin','capabilities':['start_services','stop_services'],
   'service_scopes':['alpha','beta'],'update_policy':'off',
   'central_updates':False,'remote_access':False,'revoked':False})
  self.permission_base=Path(self.tmp.name)/'authority';self.permission_base.mkdir(mode=0o700)
  self.permission_plan_id='a'*32
  permission_profile.save_grant(
   self.permission_base,self.permission_plan_id,self.permissions,True)

 def write_catalog(self):
  self.catalog_path.write_text(json.dumps(self.catalog,indent=2)+'\n')

 def fake_run(self,args):
  if args[:3]==['systemctl','--user','show']:
   unit=args[3];state=self.states.get(unit,{'observed':False,'active':'inactive'})
   load='loaded' if state['observed'] else 'not-found'
   active=state['active'] if state['observed'] else 'inactive'
   sub='running' if active=='active' else 'dead'
   return SimpleNamespace(returncode=0,stdout=f'LoadState={load}\nActiveState={active}\nSubState={sub}\n',stderr='')
  if args[:3] in (['systemctl','--user','start'],['systemctl','--user','stop']):
   action=args[2];unit=args[3];self.events.append((action,unit))
   if self.disappear_action==action and self.disappear_unit==unit:
    self.states[unit]['observed']=False
    return SimpleNamespace(returncode=0,stdout='',stderr='')
   if self.fail_action==action and self.fail_unit==unit:
    if self.fail_with_effect:self.states[unit]['active']='active' if action=='start' else 'inactive'
    return SimpleNamespace(returncode=1,stdout='',stderr='injected')
   self.states[unit]['active']='active' if action=='start' else 'inactive'
   return SimpleNamespace(returncode=0,stdout='',stderr='')
  return SimpleNamespace(returncode=1,stdout='',stderr='unexpected')

 def compile(self,ids=('alpha',),action='start'):
  with patch.object(service_profile,'_run',side_effect=self.fake_run):
   return service_profile.compile_service_plan(
    service_profile.load_catalog(self.root),self.permissions,list(ids),action,
    permission_base=self.permission_base,permission_plan_id=self.permission_plan_id)

 def apply(self,plan,action='start',permission_base=None):
  with patch.object(service_profile,'_run',side_effect=self.fake_run):
   return service_profile.apply_service_action(
    plan,self.permissions,action,True,catalog_source_root=self.root,
    permission_base=permission_base or self.permission_base)

 def test_successful_action_is_catalog_and_plan_bound(self):
  plan=self.compile();effect=self.apply(plan)
  self.assertEqual(plan['action'],'start')
  self.assertEqual(self.states['alpha.service']['active'],'active')
  self.assertEqual(effect['catalog_sha256'],plan['catalog_sha256'])
  self.assertEqual(effect['plan_digest'],plan['plan_digest'])
  self.assertEqual(effect['permission_plan_id'],self.permission_plan_id)
  self.assertEqual(effect['permission_grant_ref'],plan['permission_grant_ref'])
  self.assertEqual(effect['results'][0]['after']['active_state'],'active')

 def test_in_memory_profile_without_durable_grant_refuses(self):
  missing_plan='c'*32
  with patch.object(service_profile,'_run',side_effect=self.fake_run):
   with self.assertRaisesRegex(ValueError,'PERMISSION_GRANT_NOT_FOUND'):
    service_profile.compile_service_plan(
     service_profile.load_catalog(self.root),self.permissions,['alpha'],'start',
     permission_base=self.permission_base,permission_plan_id=missing_plan)
  self.assertEqual(self.events,[])

 def test_replaced_permission_grant_refuses_before_action(self):
  plan=self.compile()
  replacement=permission_profile.compile_profile({
   'profile_id':'replacement','capabilities':['start_services','stop_services'],
   'service_scopes':['alpha','beta'],'update_policy':'off',
   'central_updates':False,'remote_access':False,'revoked':False})
  permission_profile.replace_grant(
   self.permission_base,self.permission_plan_id,
   self.permissions['permission_digest'],replacement,True)
  with self.assertRaisesRegex(ValueError,'SERVICE_PERMISSION_GRANT_CHANGED_SINCE_REVIEW'):
   self.apply(plan)
  self.assertEqual(self.events,[])

 def test_equivalent_grant_from_another_custody_root_cannot_substitute(self):
  plan=self.compile();alternate=Path(self.tmp.name)/'alternate-authority';alternate.mkdir(mode=0o700)
  permission_profile.save_grant(
   alternate,self.permission_plan_id,self.permissions,True)
  with self.assertRaisesRegex(ValueError,'SERVICE_PERMISSION_GRANT_LOCATOR_CHANGED'):
   self.apply(plan,permission_base=alternate)
  self.assertEqual(self.events,[])

 def test_reviewed_start_cannot_be_substituted_with_stop(self):
  plan=self.compile(action='start')
  with self.assertRaisesRegex(ValueError,'SERVICE_PLAN_ACTION_MISMATCH'):
   self.apply(plan,action='stop')
  self.assertEqual(self.events,[])

 def test_forged_selected_unit_refuses_before_action_even_with_recomputed_digest(self):
  plan=self.compile();forged=copy.deepcopy(plan)
  forged['services'][0]['selected_unit']='arbitrary.service'
  forged['plan_digest']=service_profile._plan_digest(forged)
  with self.assertRaisesRegex(ValueError,'SERVICE_PLAN_STALE_OR_CATALOG_MISMATCH:alpha'):
   self.apply(forged)
  self.assertEqual(self.events,[])

 def test_catalog_change_after_review_refuses_before_action(self):
  plan=self.compile();self.catalog['revision']='changed-after-review';self.write_catalog()
  with self.assertRaisesRegex(ValueError,'SERVICE_CATALOG_CHANGED_SINCE_REVIEW'):
   self.apply(plan)
  self.assertEqual(self.events,[])

 def test_live_unit_change_after_review_refuses_before_action(self):
  plan=self.compile();self.states['alpha.service']['observed']=False
  with self.assertRaisesRegex(ValueError,'SERVICE_PLAN_STALE_OR_CATALOG_MISMATCH:alpha'):
   self.apply(plan)
  self.assertEqual(self.events,[])

 def test_partial_start_failure_restores_every_attempted_service(self):
  plan=self.compile(('alpha','beta'))
  self.fail_action='start';self.fail_unit='beta.service';self.fail_with_effect=True
  with self.assertRaisesRegex(ValueError,'SERVICE_START_FAILED:beta'):
   self.apply(plan)
  self.assertEqual(self.states['alpha.service']['active'],'inactive')
  self.assertEqual(self.states['beta.service']['active'],'inactive')
  self.assertEqual(self.events,[('start','alpha.service'),('start','beta.service'),
                                ('stop','beta.service'),('stop','alpha.service')])

 def test_disappearing_unit_cannot_receive_success_or_clean_compensation(self):
  plan=self.compile();self.disappear_action='start';self.disappear_unit='alpha.service'
  with self.assertRaisesRegex(ValueError,'SERVICE_ACTION_PARTIAL_EFFECT_UNCERTAIN'):
   self.apply(plan)
  self.assertEqual(self.events,[('start','alpha.service'),('stop','alpha.service')])

 def test_compile_requires_inverse_action_authority(self):
  start_only=permission_profile.compile_profile({
   'profile_id':'start-only','capabilities':['start_services'],
   'service_scopes':['alpha'],'update_policy':'off',
   'central_updates':False,'remote_access':False,'revoked':False})
  start_only_plan='b'*32
  permission_profile.save_grant(
   self.permission_base,start_only_plan,start_only,True)
  with patch.object(service_profile,'_run',side_effect=self.fake_run):
   with self.assertRaisesRegex(ValueError,'CAPABILITY_NOT_GRANTED:stop_services'):
    service_profile.compile_service_plan(
     service_profile.load_catalog(self.root),start_only,['alpha'],'start',
     permission_base=self.permission_base,permission_plan_id=start_only_plan)

 def test_apply_requires_authoritative_catalog_source(self):
  plan=self.compile()
  with self.assertRaisesRegex(ValueError,'SERVICE_CATALOG_SOURCE_REQUIRED'):
   service_profile.apply_service_action(plan,self.permissions,'start',True)

 def test_duplicate_unit_ownership_in_catalog_refuses(self):
  self.catalog['services'][1]['systemd_candidates']=['alpha.service'];self.write_catalog()
  with self.assertRaisesRegex(ValueError,'SERVICE_CATALOG_UNIT_IDENTITY_DUPLICATE:alpha.service'):
   service_profile.load_catalog(self.root)

 def test_falsey_non_list_candidates_are_not_laundered_as_empty(self):
  self.catalog['services'][0]['systemd_candidates']='';self.write_catalog()
  with self.assertRaisesRegex(ValueError,'SERVICE_CATALOG_UNITS_INVALID:alpha'):
   service_profile.load_catalog(self.root)

 def test_symlinked_catalog_directory_refuses(self):
  linked=Path(self.tmp.name)/'linked-source';linked.mkdir()
  (linked/'config').symlink_to(self.root/'config',target_is_directory=True)
  with self.assertRaisesRegex(ValueError,'SERVICE_CATALOG_CONFIG_UNTRUSTED'):
   service_profile.load_catalog(linked)

 def test_hard_linked_catalog_file_refuses(self):
  alias=self.root/'config/service-catalog-alias.json';os.link(self.catalog_path,alias)
  with self.assertRaisesRegex(ValueError,'SERVICE_CATALOG_FILE_UNTRUSTED'):
   service_profile.load_catalog(self.root)

 def test_group_writable_catalog_file_refuses(self):
  self.catalog_path.chmod(0o664)
  with self.assertRaisesRegex(ValueError,'SERVICE_CATALOG_FILE_UNTRUSTED'):
   service_profile.load_catalog(self.root)


if __name__=='__main__':unittest.main()
