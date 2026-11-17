import copy
import json
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

 def compile(self,ids=('alpha',)):
  with patch.object(service_profile,'_run',side_effect=self.fake_run):
   return service_profile.compile_service_plan(
    service_profile.load_catalog(self.root),self.permissions,list(ids))

 def apply(self,plan,action='start'):
  with patch.object(service_profile,'_run',side_effect=self.fake_run):
   return service_profile.apply_service_action(
    plan,self.permissions,action,True,catalog_source_root=self.root)

 def test_successful_action_is_catalog_and_plan_bound(self):
  plan=self.compile();effect=self.apply(plan)
  self.assertEqual(self.states['alpha.service']['active'],'active')
  self.assertEqual(effect['catalog_sha256'],plan['catalog_sha256'])
  self.assertEqual(effect['plan_digest'],plan['plan_digest'])
  self.assertEqual(effect['results'][0]['after']['active_state'],'active')

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
  with patch.object(service_profile,'_run',side_effect=self.fake_run):
   with self.assertRaisesRegex(ValueError,'CAPABILITY_NOT_GRANTED:stop_services'):
    service_profile.compile_service_plan(service_profile.load_catalog(self.root),start_only,['alpha'])

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


if __name__=='__main__':unittest.main()
