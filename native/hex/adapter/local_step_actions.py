"""Finite original HEX onboarding actions; existing CLI integrity and journal owners."""
import json,hashlib,uuid,os,datetime,subprocess
from pathlib import Path
from xiio_installer.observability import OperationJournal, inspect_operation
HERE=Path(__file__).resolve().parent
STEPS=HERE/'local_steps'
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':')).encode()
def safe(p):
 p=Path(p)
 if not p.is_absolute() or '..' in p.parts or any(q.is_symlink() for q in [p,*p.parents]):raise ValueError('UNSAFE_WORKSPACE_PATH')
 return p

def call_helper(p,name,request=None):
 # Fixed executable and helper only. No ambient credentials, preloads, user imports.
 r=subprocess.run([p['node']['path'],str(STEPS/name)],input='' if request is None else json.dumps(request),text=True,capture_output=True,timeout=15,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'},cwd=str(STEPS))
 if r.returncode or len(r.stdout)>2*1024*1024:raise ValueError('LOCAL_STEP_FAILED: '+r.stderr[-300:])
 return json.loads(r.stdout)
def handle(req,base,p,readback):
 action=req['action']
 if action=='local_ai_status':return {**call_helper(p,'local_ai_status.mjs'),'plan_id':p['plan_id'],'cli_generation':readback['generation']}
 records=base/'local-proof-plans'
 if action=='safe_task_inspect':
  rows=[]
  if records.exists():
   safe(records)
   for entry in sorted(records.glob('*.json')):
    try:
     review=json.loads(safe(entry).read_text());unsigned=dict(review);digest=unsigned.pop('approval_digest')
     if review['plan_id']!=p['plan_id']:continue
     if sha(canonical(unsigned))!=digest:raise ValueError('PROOF_REVIEW_CHANGED')
     operation=base/'operations'/(review['proof_id']+'-safe-task.jsonl')
     state='REVIEW_REQUIRED';details=None
     if operation.exists():
      observed=inspect_operation(review['proof_id']+'-safe-task',root=base)
      if observed.get('correlation_id')!=p['plan_id'] or observed.get('component')!='native-safe-task' or observed.get('operation')!='safe_task' or observed['events'][-1].get('details',{}).get('approval_digest')!=digest:raise ValueError('PROOF_JOURNAL_BINDING_MISMATCH')
      state='HISTORICAL_LOCAL_PROOF_PASSED' if observed['final_state']=='passed' else 'SAFE_TASK_OUTCOME_UNCERTAIN'
      details=observed['events'][-1].get('details')
     rows.append({'proof_id':review['proof_id'],'workspace':review['workspace'],'directory':review['directory'],'state':state,'historical_only':True,'current_bytes_observed':False,'do_not_retry':operation.exists(),'details':details})
    except Exception:
     rows.append({'proof_id':entry.stem,'state':'EVIDENCE_UNREADABLE_DO_NOT_RETRY','historical_only':True,'current_bytes_observed':False,'do_not_retry':True})
  return {'plan_id':p['plan_id'],'proofs':rows[-50:],'historical_only':True,'current_bytes_observed':False}
 records.mkdir(mode=0o700,exist_ok=True);safe(records)
 if action=='safe_task_prepare':
  workspace=safe(req['workspace'])
  if not workspace.is_dir() or len(workspace.parts)<3 or workspace==Path.home() or any(x in workspace.parts for x in ['.ssh','.aws','.config','.local','.codex','.git']):raise ValueError('DEDICATED_WORKSPACE_REQUIRED')
  for protected in [base,Path(p['prefix']),HERE.parent]:
   if workspace==protected or protected in workspace.parents or workspace in protected.parents:raise ValueError('WORKSPACE_OVERLAPS_INSTALLER')
  st=workspace.stat();ident=uuid.uuid4().hex
  cas=Path(p['prefix'])/'versions'/readback['generation']/'src/file-edit-cas.mjs'
  review={'proof_id':ident,'plan_id':p['plan_id'],'workspace':str(workspace),'workspace_dev':st.st_dev,'workspace_ino':st.st_ino,'directory':str(workspace/('.xiio-proof-'+ident)),'cas_module':str(cas),'cas_sha256':sha(cas.read_bytes()),'helper_sha256':sha((STEPS/'safe_task.mjs').read_bytes()),'cli_generation':readback['generation'],'cleanup':True,'changes':['Create exclusive disposable directory and proof.txt','Apply fixed local CAS edit and independently reopen bytes','Refuse stale edit','Delete only unchanged owned proof file and empty directory'],'authority':'EXACT_LOCAL_DISPOSABLE_FIXTURE_ONLY','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  review['approval_digest']=sha(canonical(review))
  with (records/(ident+'.json')).open('x') as f:json.dump(review,f)
  return {**review,'state':'REVIEW_REQUIRED'}
 ident=req.get('proof_id')
 if not isinstance(ident,str) or len(ident)!=32 or any(c not in '0123456789abcdef' for c in ident):raise ValueError('PROOF_ID_INVALID')
 review=json.loads(safe(records/(ident+'.json')).read_text());unsigned=dict(review);digest=unsigned.pop('approval_digest')
 if sha(canonical(unsigned))!=digest or req.get('approval_digest')!=digest or req.get('approved') is not True or review['plan_id']!=p['plan_id']:raise ValueError('EXACT_PROOF_APPROVAL_REQUIRED')
 if review['cli_generation']!=readback['generation'] or sha((STEPS/'safe_task.mjs').read_bytes())!=review['helper_sha256']:raise ValueError('PROOF_SOURCE_CHANGED')
 if (base/'operations'/(ident+'-safe-task.jsonl')).exists():raise ValueError('PROOF_ALREADY_ATTEMPTED_DO_NOT_RETRY')
 journal=OperationJournal('native-safe-task','safe_task',operation_id=ident+'-safe-task',correlation_id=p['plan_id'],root=base)
 journal.start('Reviewed disposable local CAS proof including cleanup',details={'approval_digest':digest})
 try:
  result=call_helper(p,'safe_task.mjs',review)
  if result.get('state')!='LOCAL_DISPOSABLE_PROOF_VERIFIED' or not result.get('cleanup_verified'):raise ValueError('PROOF_POSTCONDITION_UNVERIFIED')
  journal.finish('passed','Local fixture create, CAS, stale refusal and cleanup readback verified',expected_action='safe_task',details={'approval_digest':digest,'result':result})
  return {**result,'proof_id':ident,'plan_id':p['plan_id']}
 except Exception as error:
  journal.finish('unknown','Local proof incomplete; preserve remaining fixture and inspect before retry',expected_action='safe_task',details={'approval_digest':digest})
  raise ValueError('SAFE_TASK_OUTCOME_UNCERTAIN_DO_NOT_RETRY: '+str(error)) from error
