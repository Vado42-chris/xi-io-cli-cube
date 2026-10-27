import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';


function sha(v){return 'sha256:'+crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');}
function walk(root,max=4000,allowPath=()=>true){
 const out=[];const skip=new Set(['.git','node_modules','dist','build','.cache','coverage','vendor']);
 const q=[root];
 while(q.length&&out.length<max){const d=q.shift();let rows=[];try{rows=fs.readdirSync(d,{withFileTypes:true});}catch{continue;}
  for(const e of rows){if(skip.has(e.name))continue;const p=path.join(d,e.name);if(!allowPath(p))continue;if(e.isDirectory())q.push(p);else if(e.isFile())out.push(p);if(out.length>=max)break;}
 }
 return out;
}
export const ACCEPTED_LOCAL_SCANNER=Object.freeze({
 repository:'Vado42-chris/xi-io-sdk',commit:'d1d145ff25ee1df2ccc36960b8bf93c0d5b1ff00',
 path:'scripts/local_scan.py',git_blob:'ccea3fdef6e5a78f0af63d196ba48c1b20831107',
 sha256:'2c651e40b99f4da2b9d913970f099893aa83b788ce788e9469c44b1a4cfa275e',schema:'xiio.sdk.local-static-scan/v1'
});
export function localScan(root,{runScanner,readArtifact}={}){
 const fail=reason=>({schema:'xiio.cli.local-scan/v1',state:'BLOCKED',reason,closure_credit:false,effect_authority:0});
 if(typeof runScanner!=='function'||typeof readArtifact!=='function')return fail('APPROVED_SANDBOX_AND_GUARDED_READER_REQUIRED');
 let source;try{source=readArtifact(ACCEPTED_LOCAL_SCANNER.path);}catch{return fail('LOCAL_SCAN_SOURCE_UNREADABLE');}
 if(!Buffer.isBuffer(source.buf)||sha(source.buf.toString('utf8'))!=='sha256:'+ACCEPTED_LOCAL_SCANNER.sha256||source.text!==source.buf.toString('utf8'))return fail('LOCAL_SCAN_PRODUCER_BYTES_UNQUALIFIED');
 // Execute the validated snapshot, not the mutable workspace path.
 const r=runScanner(source.text,root);
 let receipt;try{receipt=JSON.parse(r.stdout);}catch{return fail('LOCAL_SCAN_OUTPUT_INVALID');}
 const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const count=v=>Number.isSafeInteger(v)&&v>=0;
 const counts=receipt?.counts,findings=receipt?.findings;
 const shape=obj(receipt)&&receipt.schema===ACCEPTED_LOCAL_SCANNER.schema&&receipt.axis==='1000s/Y/local-static'
  &&typeof receipt.root==='string'&&path.resolve(receipt.root)===path.resolve(root)
  &&receipt.live_authority===false&&receipt.closure_100===false
  &&obj(receipt.subject)&&typeof receipt.subject.repo_bound==='boolean'&&Array.isArray(receipt.subject.root_markers)
  &&obj(counts)&&['source_files','syntax_checked','unvalidated_code_files','fail','unknown','observed'].every(k=>count(counts[k]))&&counts.syntax_checked<=counts.source_files
  &&Array.isArray(findings)&&findings.every(f=>obj(f)&&['FAIL','UNKNOWN','OBSERVED'].includes(f.state)&&['code','path','detail'].every(k=>typeof f[k]==='string'));
 if(!shape)return fail('LOCAL_SCAN_RECEIPT_INVALID');
 if(['FAIL','UNKNOWN','OBSERVED'].some(state=>findings.filter(f=>f.state===state).length!==counts[state.toLowerCase()]))return fail('LOCAL_SCAN_COUNT_MISMATCH');
 const expected=!receipt.subject.repo_bound?'WAIT_NO_REPO_SUBJECT':counts.source_files===0&&counts.unvalidated_code_files===0?'WAIT_NO_CODE_SUBJECT':counts.fail?'FAIL_LOCAL_STATIC':counts.unknown?'DEGRADED_LOCAL_STATIC':'PASS_LOCAL_STATIC';
 const exit=expected==='PASS_LOCAL_STATIC'?0:expected==='FAIL_LOCAL_STATIC'?1:2;
 if(receipt.status!==expected||receipt.local_static_pass!==(expected==='PASS_LOCAL_STATIC'))return fail('LOCAL_SCAN_STATUS_CONTRADICTION');
 if(r.status!==exit||r.error||r.signal||r.timed_out)return fail('LOCAL_SCAN_PROCESS_CONTRADICTION');
 return{schema:'xiio.cli.local-scan/v1',state:'LOCAL_STATIC_OBSERVED',status:receipt.status,local_static_pass:receipt.local_static_pass,
  producer:{...ACCEPTED_LOCAL_SCANNER,bytes_verified:true},root,receipt,process_status:r.status,
  closure_credit:false,live_authority:false,effect_authority:0,
  hard:['LOCAL_STATIC_OBSERVATION!=LIVE','PRODUCER_BYTES!=SIGNED_RECEIPT','SCAN_OBSERVATION!=RCP_EARNED']};
}
export function crossUxTriage(root,{terms=['local_scan','RCP','ibal'],maxFiles=4000,allowPath=()=>true,readArtifact}={}){
 if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>20000||!Array.isArray(terms))return{schema:'xiio.cli.cross-ux-triage/v1',state:'FAIL',reason:'TRIAGE_OPTIONS_INVALID',effect_authority:0};
 if(typeof readArtifact!=='function')return{schema:'xiio.cli.cross-ux-triage/v1',state:'BLOCKED',reason:'GUARDED_WORKSPACE_READER_REQUIRED',effect_authority:0};
 const files=walk(root,maxFiles,allowPath);const hits=[];let skipped=0;
 const needles=terms.map(x=>String(x).toLowerCase()).filter(Boolean);
 for(const p of files){const rel=path.relative(root,p).split(path.sep).join('/');let text='';
  if(!/\.(?:md|json|mjs|js|py|ts|tsx|jsx|yml|yaml|txt)$/i.test(p))continue;
  try{text=readArtifact(rel).text;if(typeof text!=='string')throw Error('INVALID_ARTIFACT_TEXT');}catch{skipped++;continue;}
  const hay=(rel+'\n'+text.slice(0,250000)).toLowerCase();
  const matched=needles.filter(n=>hay.includes(n));if(!matched.length)continue;
  const digest=sha(text);hits.push({path:rel,digest,matched_terms:matched});
 }
 const groups=new Map();for(const h of hits){if(!groups.has(h.digest))groups.set(h.digest,[]);groups.get(h.digest).push(h.path);}
 const unique=[...groups.entries()].map(([digest,paths])=>({digest,canonical_path:paths[0],duplicate_paths:paths.slice(1),copies:paths.length}));
 const duplicates=unique.filter(x=>x.copies>1);
 return{schema:'xiio.cli.cross-ux-triage/v1',state:'OBSERVED',incomplete:skipped>0||files.length>=maxFiles,skipped_files:skipped,root,terms,scanned_files:files.length,matched_artifacts:hits.length,
  unique_artifacts:unique,unique_count:unique.length,duplicate_groups:duplicates,duplicate_group_count:duplicates.length,
  hard:['SAME_CONTENT!=MULTIPLE_UNIQUE_ARTIFACTS','DUPLICATE_DETECTED!=DELETE_AUTHORITY','CROSS_UX_TRIAGE!=LIVE'],effect_authority:0};
}
export function ibalBalanceGuide(){
 return{schema:'xiio.cli.ibal-balance/v1',state:'INFORMATIONAL_DONOR',source:'xi-io-cli PR5 b545c39712d405f31048377c85e10597e0c3f8f3',current_contract_qualified:false,notice:'Historical donor description only; not the accepted current framework mathematics or execution authority.',historical_logic:{
  visible:'user-facing worker/seat',headless:'independent worker/seat',same_coordinate:true,
  odd:'headless effect -> visible witness',even:'visible effect -> headless witness',self_witness:false,
  close:['RESULT','RETURN','APPLY_RETURN','READBACK','REAP','NEXT']},
  hard:['TWO_WORKERS!=TWO_WORK_GRAPHS','SELF_WITNESS=FAIL','REPORT!=LOOP_EXIT'],effect_authority:0};
}
