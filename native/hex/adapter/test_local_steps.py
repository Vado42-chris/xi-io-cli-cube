import unittest,sys,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from test_adapter import RealPayload
class LocalSteps(RealPayload):
 def installed_plan(self):
  p=self.prepare();self.assertTrue(self.call({'action':'apply','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True})['ok']);return p
 def test_real_fixed_disposable_proof_cleanup_and_prior_data_preserved(self):
  p=self.installed_plan();workspace=self.home/'workspace';workspace.mkdir();sentinel=workspace/'existing.txt';sentinel.write_text('untouched')
  r=self.call({'action':'safe_task_prepare','plan_id':p['plan_id'],'workspace':str(workspace)});self.assertTrue(r['ok'],r);review=r['result'];self.assertEqual(list(workspace.iterdir()),[sentinel])
  request={'action':'safe_task_apply','plan_id':p['plan_id'],'proof_id':review['proof_id'],'approval_digest':review['approval_digest'],'approved':True}
  bad={**request,'approved':False};self.assertFalse(self.call(bad)['ok']);self.assertEqual(sentinel.read_text(),'untouched')
  r=self.call(request);self.assertTrue(r['ok'],r);proof=r['result'];self.assertTrue(proof['cleanup_verified']);self.assertTrue(proof['stale_edit_refused']);self.assertFalse(proof['ward_authority_granted']);self.assertEqual(list(workspace.iterdir()),[sentinel]);self.assertEqual(sentinel.read_text(),'untouched');self.assertFalse(self.call(request)['ok'])
  history=self.call({'action':'safe_task_inspect','plan_id':p['plan_id']});self.assertTrue(history['ok'],history);row=history['result']['proofs'][0];self.assertEqual(row['state'],'HISTORICAL_LOCAL_PROOF_PASSED');self.assertFalse(row['current_bytes_observed']);self.assertTrue(row['do_not_retry'])
 def test_preexisting_fixture_and_symlink_refused_without_deletion(self):
  p=self.installed_plan();workspace=self.home/'workspace';workspace.mkdir();link=self.home/'link';link.symlink_to(workspace,target_is_directory=True)
  self.assertFalse(self.call({'action':'safe_task_prepare','plan_id':p['plan_id'],'workspace':str(link)})['ok'])
  r=self.call({'action':'safe_task_prepare','plan_id':p['plan_id'],'workspace':str(workspace)});review=r['result'];fixture=Path(review['directory']);fixture.mkdir();(fixture/'user.txt').write_text('preserve')
  r=self.call({'action':'safe_task_apply','plan_id':p['plan_id'],'proof_id':review['proof_id'],'approval_digest':review['approval_digest'],'approved':True});self.assertFalse(r['ok']);self.assertEqual((fixture/'user.txt').read_text(),'preserve')
  history=self.call({'action':'safe_task_inspect','plan_id':p['plan_id']});self.assertEqual(history['result']['proofs'][0]['state'],'SAFE_TASK_OUTCOME_UNCERTAIN');self.assertFalse(history['result']['current_bytes_observed'])
  self.assertFalse(self.call({'action':'local_ai_status','plan_id':p['plan_id'],'url':'https://example.com'})['ok'])
if __name__=='__main__':unittest.main()
