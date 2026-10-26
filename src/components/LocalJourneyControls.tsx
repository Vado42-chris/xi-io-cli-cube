import React, {useEffect, useRef, useState} from 'react';
import {createInstallerClient, nativeInstallerAvailable} from '../lib/nativeInstaller.mjs';

/** Original onboarding steps backed by finite native actions, never browser simulation. */
export default function LocalJourneyControls({step,workspace,planId,onPlanId}:{step:4|5;workspace:string;planId:string;onPlanId:(id:string)=>void}) {
 const native=nativeInstallerAvailable();
 const [plans,setPlans]=useState<any[]>([]),[result,setResult]=useState<any>(null),[review,setReview]=useState<any>(null);
 const [history,setHistory]=useState<any[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[approved,setApproved]=useState(false),[attempted,setAttempted]=useState(false);
 const lock=useRef(false);
 const context=useRef('');context.current=JSON.stringify([step,workspace,planId]);
 const client=createInstallerClient(native?(command:string,args:object)=>(globalThis as any).__TAURI__.core.invoke(command,args):undefined);
 async function request(action:string,extra:any={}) {
  if(lock.current)return;const requestedContext=context.current;lock.current=true;setBusy(true);setError('');setResult(null);
  try {
   const response=await client({action,plan_id:planId,...extra});
   if(context.current!==requestedContext)return;
   if(action==='safe_task_inspect'){setHistory(response.proofs||[]);return;}
   if(action==='safe_task_prepare'){setReview(response);setApproved(false);setAttempted(false);setResult(null);}else setResult(response);
  }catch(e){if(context.current===requestedContext)setError(String(e instanceof Error?e.message:e));}finally{lock.current=false;setBusy(false);}
 }
 useEffect(()=>{setReview(null);setApproved(false);setResult(null);setAttempted(false);setHistory([]);},[workspace,planId,step]);
 useEffect(()=>{if(native)client({action:'inspect'}).then((v:any)=>setPlans(v.plans||[])).catch((e:Error)=>setError(e.message));},[]);
 const selectedPlan=plans.find(p=>p.plan_id===planId);
 const eligible=selectedPlan?.phase==='INSTALLED_READBACK_VERIFIED'&&!selectedPlan?.do_not_retry;
 const reviewMatches=review?.plan_id===planId&&review?.workspace===workspace;
 const button='min-h-[44px] px-4 py-2 rounded-none border border-workspace-border-strong text-xs disabled:opacity-40';
 return <div aria-label={step===4?'Local AI observation':'Disposable local file proof'} className="p-4 rounded-none bg-workspace-canvas border border-workspace-border space-y-3 text-xs text-workspace-text">
 {!native?<p role="status">Open native HEX to check this computer. No browser example is treated as a real test.</p>:<>
 <label className="block">Installed CLI to verify<select aria-label="Installed CLI for local checks" className="block mt-2 w-full bg-workspace-surface p-2" value={planId} disabled={busy} onChange={e=>onPlanId(e.target.value)}><option value="">Select a saved installation</option>{plans.map(p=><option key={p.plan_id} value={p.plan_id}>{p.prefix} · {p.plan_id.slice(0,8)} · {p.phase}</option>)}</select></label>
 {!eligible&&planId&&<p>New checks require an installed, unambiguous CLI plan. Saved file-test history can still be inspected.</p>}
 <p>Saved history is not current proof. Each check verifies the installed CLI and its exact source before executing the fixed local action.</p>
 {step===4?<>
 <button className={button} disabled={busy||!planId||!eligible} onClick={()=>void request('local_ai_status')}>Check Local AI</button>
 <p>Read-only local model listing. No model load, download, runtime startup, inference or account connection.</p>
 {result&&<div role="status"><strong>{result.state==='MODELS_OBSERVED'?'Installed models observed':result.state==='NO_MODELS'?'Runtime responded; no models installed':'Runtime not observed'}</strong><ul>{result.models?.map((m:any)=><li key={m.name}>{m.name}</li>)}</ul><p>{result.reason||'Model listing does not verify inference or provider identity.'}</p><p>{result.observed_at}</p></div>}
 </>:<>
 <button className={button} disabled={busy||!planId} onClick={()=>void request('safe_task_inspect')}>Inspect Saved File Tests</button>
 {history.length>0&&<div role="status"><p>Saved historical outcomes only; current fixture bytes were not inspected. Previously attempted proofs are never reexecuted.</p>{history.map(h=><p key={h.proof_id} className="font-mono break-all">{h.proof_id} · {h.state} · {h.directory||'Evidence unreadable'}</p>)}</div>}
 <p>Selected workspace: <span className="font-mono break-all">{workspace||'Choose a workspace in Step 3'}</span></p>
 <p>This reviewed local test creates its own exclusive disposable folder, writes and reopens a fixed file, applies the existing CLI CAS guard, refuses a stale edit, then removes only its unchanged fixture. Existing project files are not edited. This uses a cooperative same-host guard, not protection against concurrent noncooperating filesystem writers. This is not command-sandbox, remote BINS or Ward admission proof.</p>
 <button className={button} disabled={busy||!planId||!eligible||!workspace||attempted} onClick={()=>void request('safe_task_prepare',{workspace})}>Review Disposable File Test</button>
 {review&&reviewMatches&&<div className="space-y-2"><p className="font-mono break-all">Fixture: {review.directory}</p><ul>{review.changes?.map((c:string)=><li key={c}>{c}</li>)}</ul><label className="block"><input type="checkbox" checked={approved} disabled={busy||attempted} onChange={e=>setApproved(e.target.checked)}/> I approve this exact disposable file test and cleanup in the selected workspace.</label><button className={button} disabled={busy||!approved||attempted||!reviewMatches||!eligible} onClick={()=>{if(!reviewMatches)return;setAttempted(true);void request('safe_task_apply',{proof_id:review.proof_id,approval_digest:review.approval_digest,approved:true});}}>Run Approved File Test</button></div>}
 {result&&<p role="status">{result.state==='LOCAL_DISPOSABLE_PROOF_VERIFIED'&&result.cleanup_verified?'Local create, CAS edit, stale-edit refusal and cleanup verified. No remote or command execution was tested.':'No complete local file proof returned.'}</p>}
 {attempted&&(error||result?.do_not_retry)&&<p>Do not retry this proof. Inspect Saved File Tests before any further action. A remaining fixture is preserved for inspection; no automatic deletion is attempted.</p>}
 </>}
 </>}
 {busy&&<p role="status">Checking the actual local request…</p>}{error&&<p role="alert" className="text-workspace-danger">{error}</p>}
 {result&&<details><summary>Actual returned evidence</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(result,null,2)}</pre></details>}
 </div>;
}
