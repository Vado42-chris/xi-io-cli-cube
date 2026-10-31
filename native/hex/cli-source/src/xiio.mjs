#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import crypto from 'node:crypto';
import {compileCommandIntentProjection} from './sdk/audhd-command.mjs';
import {evaluateAgentResponseRealization} from './sdk/tool-verb-fidelity.mjs';
import {
  acceptPacket,
  bindContinuationRequest,
  dispatchAcceptedWork,
  formatBindingMessage,
  isContinuationPhrase,
  loadAcceptedPacket,
} from './sdk/local-work-packet.mjs';
import {LOCAL_TOOL_INFERENCE_OPTIONS} from './sdk-provider-state.mjs';
import {localScan,crossUxTriage,ibalBalanceGuide} from './local-ops.mjs';
import {commitWorkspaceEditCAS} from './file-edit-cas.mjs';
import {controlledChildEnv,verifyGeneration,readGenerationPointer,pointerTransactionPending,commitGenerationPointers,recoverGenerationPointers} from './runtime-integrity.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const CATALOG_PATH=process.env.XIIO_SERVICE_CATALOG||path.join(ROOT,'config','service-catalog.json');
const CONFIG_DIR=process.env.XIIO_CONFIG_DIR||path.join(os.homedir(),'.config','xi-io');
const ACTIVE_WORKSPACE_FILE=path.join(CONFIG_DIR,'active-workspace');

function emit(v,code=0){process.stdout.write(JSON.stringify(v,null,2)+'\n');if(code)process.exitCode=code;}
function run(cmd,args=[],opts={}){const r=spawnSync(cmd,args,{cwd:opts.cwd||process.cwd(),encoding:'utf8',env:controlledChildEnv(process.env,opts.env||{}),timeout:opts.timeout||15000});return{status:r.status,signal:r.signal||null,error:r.error?.message||null,stdout:(r.stdout||'').trim(),stderr:(r.stderr||'').trim()};}
// Repository configuration must not turn read-only Git inspection into hook execution.
// This disables known Git hook/fsmonitor paths; it is not a general OS sandbox.
function readOnlyGit(args,opts={}){
  return run('git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false','-c','core.hooksPath='+os.devNull,...args],opts);
}
// Product catalog (generic, same on every computer) + this computer's own
// services file (which services run here, ports, owner-granted access).
// Nothing machine-specific lives in the product catalog.
const LOCAL_SERVICES_FILE=path.join(CONFIG_DIR,'services.local.json');
function localServicesState(){
  // Local grants cannot travel from one computer to another by copied config.
  // Invalid or foreign files are not silently overwritten by an add/grant.
  try{
    const st=fs.lstatSync(LOCAL_SERVICES_FILE);
    if(!st.isFile()||st.isSymbolicLink()||st.size>65536||(process.platform!=='win32'&&(st.mode&0o077)!==0))
      return{state:'BLOCKED',first_red:'LOCAL_SERVICES_CUSTODY_UNVERIFIED',services:[]};
    const bytes=fs.readFileSync(LOCAL_SERVICES_FILE);
    const j=JSON.parse(bytes.toString('utf8'));
    if(j?.schema!=='xiio.cli.services-local/v1'||!Array.isArray(j.services))
      return{state:'BLOCKED',first_red:'LOCAL_SERVICES_SCHEMA_INVALID',services:[]};
    if(j.host!==os.hostname())
      return{state:'BLOCKED',first_red:'LOCAL_SERVICES_HOST_MISMATCH',services:[]};
    if(j.services.length>100||j.services.some(s=>!s||typeof s!=='object'||Array.isArray(s)
        || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(s.id||''))
        || (s.cli_access!==undefined&&!['health','read','read_write'].includes(s.cli_access))
        || (s.probe!==undefined&&!loopbackUrl(s.probe))))
      return{state:'BLOCKED',first_red:'LOCAL_SERVICES_RECORD_INVALID',services:[]};
    return{state:'PASS',first_red:null,services:j.services,bytes};
  }catch(e){
    return e?.code==='ENOENT'?{state:'ABSENT',first_red:null,services:[]}
      :{state:'BLOCKED',first_red:'LOCAL_SERVICES_UNREADABLE',services:[]};
  }
}
function readLocalServices(){return localServicesState().services}
function writeLocalServices(list,expectedBytes){
  fs.mkdirSync(CONFIG_DIR,{recursive:true});
  const bytes=Buffer.from(JSON.stringify({schema:'xiio.cli.services-local/v1',host:os.hostname(),services:list},null,2)+'\n');
  if(list.length>100||bytes.length>65536)throw Error('LOCAL_SERVICES_LIMIT_EXCEEDED');
  if(expectedBytes){commitWorkspaceEditCAS({file:path.resolve(LOCAL_SERVICES_FILE),expectedBytes,nextBytes:bytes});}
  else{
    // First creation is exclusive. A simultaneous creator must retry, not erase it.
    const fd=fs.openSync(LOCAL_SERVICES_FILE,'wx',0o600);
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(!fs.readFileSync(LOCAL_SERVICES_FILE).equals(bytes))throw Error('LOCAL_SERVICES_READBACK_MISMATCH');
  }
}

function loadCatalog(){
  const c=JSON.parse(fs.readFileSync(CATALOG_PATH,'utf8'));
  const byId=new Map((c.services||[]).map(s=>[s.id,{...s,source:'catalog'}]));
  for(const l of readLocalServices()){if(!l||!l.id)continue;byId.set(l.id,{...(byId.get(l.id)||{}),...l,source:byId.has(l.id)?'catalog+local':'local'});}
  return {...c,services:[...byId.values()]};
}
function loopbackUrl(v){try{const u=new URL(String(v));return ['http:','https:'].includes(u.protocol)&&['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)&&!u.username&&!u.password&&!u.hash&&!/%/.test(u.pathname)?u:null;}catch{return null;}}
async function servicesLocalCommand(sub,args,flags){
  try{return await mutateOrObserveLocalServices(sub,args,flags);}
  catch(error){return{schema:'xiio.cli.services-local/v1',state:'BLOCKED',reason:'LOCAL_SERVICES_UPDATE_REFUSED',detail:String(error.code||error.message),modified:['EEXIST','FILE_WRITE_LOCK_HELD','FILE_CHANGED_SINCE_APPROVAL'].includes(error.code||error.message)?false:'UNKNOWN',hint:'Read this computer’s service list again, then retry. No conflicting writer is evicted.'};}
}
async function mutateOrObserveLocalServices(sub,args,flags){
  const local=localServicesState();
  if(local.state==='BLOCKED')return{schema:'xiio.cli.services-local/v1',state:'BLOCKED',reason:local.first_red,modified:false};
  const list=local.services;
  if(sub==='add'){
    const id=String(args[0]||'').trim();const u=loopbackUrl(args[1]);
    if(!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id))return{state:'FAIL',reason:'SERVICE_ID_INVALID',usage:'xi-io-cli services add <id> <http://127.0.0.1:PORT/health-path> [--class NAME]'};
    if(!u)return{state:'FAIL',reason:'HEALTH_URL_MUST_BE_THIS_COMPUTER',hint:'use http://127.0.0.1:PORT/<the service health path>'};
    // URL/class equality cannot prove that the process behind a reused port is
    // still the approved instance. No independent instance adapter exists here.
    const previous=loadCatalog().services.find(s=>s.id===id);
    const cls=String(flags.class||previous?.class||'local');
    const previousGrant=['health','read','read_write'].includes(previous?.cli_access)?previous.cli_access:'health';
    const access='health';
    const grantReset=previousGrant!=='health';
    const row={id,probe:u.href,class:cls,cli_access:access,verified:'UNKNOWN'};
    const i=list.findIndex(x=>x.id===id);if(i>=0)list[i]={...list[i],...row};else list.push(row);
    writeLocalServices(list,local.bytes);
    const probe=await httpProbe(u.href);
    return{schema:'xiio.cli.services-local/v1',state:'PASS',added:id,probe:u.href,
      health:probe.state,status:probe.status??null,access,grant_reset:grantReset,
      file:LOCAL_SERVICES_FILE,
      identity_verified:false,
      note:grantReset?'Service instance is unverified: broader access was revoked; only the declared health endpoint is available.'
        :'Listed means discoverable; CLI access remains subordinate to Ward and project authority.'};
  }
  if(sub==='grant'){
    const id=String(args[0]||'');const level=String(args[1]||'');
    if(!['health','read','read_write'].includes(level))return{state:'FAIL',reason:'ACCESS_LEVEL_INVALID',levels:['health','read','read_write']};
    if(!loadCatalog().services.some(s=>s.id===id))return{state:'FAIL',reason:'UNKNOWN_SERVICE',id};
    if(level!=='health')return{state:'BLOCKED',reason:'SERVICE_IDENTITY_UNVERIFIED',service:id,cli_access:'health',modified:false,note:'Broader local access needs an independently resolved current service identity. A URL or health response is not that identity.'};
    const i=list.findIndex(x=>x.id===id);if(i>=0)list[i].cli_access=level;else list.push({id,cli_access:level});
    writeLocalServices(list,local.bytes);
    return{schema:'xiio.cli.services-local/v1',state:'PASS',service:id,cli_access:level,file:LOCAL_SERVICES_FILE,note:'Writes still need yes in chat; Ward and project rules still apply.'};
  }
  if(sub==='remove'){
    const id=String(args[0]||'');const next=list.filter(x=>x.id!==id);
    if(next.length===list.length)return{state:'FAIL',reason:'NOT_IN_LOCAL_FILE',id};
    writeLocalServices(next,local.bytes);return{state:'PASS',removed:id,file:LOCAL_SERVICES_FILE};
  }
  if(sub==='discover'){
    // Checks only each service's declared health URL on this computer. Reads,
    // never grants access, never guesses paths.
    const rows=[];
    for(const s of loadCatalog().services){const u=loopbackUrl(s.probe);if(!u||s.id==='ollama')continue;const r=await httpProbe(u.href);rows.push({id:s.id,source:s.source,health_url:u.href,present:r.response_received===true,response_received:r.response_received===true,http_observed:r.http_observed===true,health:r.state,identity_verified:false,status:r.status??null,access:'health'});}
    return{schema:'xiio.cli.services-discover/v1',state:'PASS',scope:'DECLARED_LOOPBACK_CATALOG_CANDIDATES_ONLY',completeness:'NOT_A_HOST_INVENTORY',effect_authority:0,host:os.hostname(),present:rows.filter(r=>r.present).map(r=>r.id),rows};
  }
  return null;
}
function parse(argv){
  const args=[],flags={};
  const booleanFlags=new Set(['execute','help','version','apply','deep','staged','recover','force','refuse','acceptance-only']);
  for(let i=0;i<argv.length;i++){
    const t=argv[i];
    if(t==='--'){args.push(...argv.slice(i+1));break;}
    if(!t.startsWith('--')){args.push(t);continue;}
    const eq=t.indexOf('=');const k=t.slice(2,eq<0?undefined:eq);
    if(eq>=0){
      const value=t.slice(eq+1);
      if(booleanFlags.has(k)){
        if(!['true','false'].includes(value))throw new Error('BOOLEAN_FLAG_VALUE_INVALID: --'+k);
        flags[k]=value==='true';
      }else flags[k]=value;
      continue;
    }
    if(booleanFlags.has(k)){flags[k]=true;continue;}
    const n=argv[i+1];if(n===undefined||n.startsWith('--'))throw new Error('FLAG_VALUE_REQUIRED: --'+k);
    flags[k]=n;i++;
  }
  return{command:args[0]||'help',subcommand:args[1]||'',args:args.slice(2),positionals:args,flags};
}
function activeWorkspace(){try{const p=fs.readFileSync(ACTIVE_WORKSPACE_FILE,'utf8').trim();return p&&fs.existsSync(p)&&fs.statSync(p).isDirectory()?{state:'PASS',path:p}:{state:'STALE',path:p||null};}catch{return{state:'UNSET',path:null};}}
function activate(args,flags){try{const p=workspaceRoot(String(flags.path||args[0]||process.cwd()));if(!fs.existsSync(p)||!fs.statSync(p).isDirectory())return{schema:'xiio.cli.activate/v1',state:'FAIL',reason:'WORKSPACE_NOT_DIRECTORY',path:p};fs.mkdirSync(CONFIG_DIR,{recursive:true});fs.writeFileSync(ACTIVE_WORKSPACE_FILE,p+'\n',{mode:0o600});return{schema:'xiio.cli.activate/v1',state:'PASS',active_workspace:p,next:['xiio doctor','xiio services status','xiio runner diagnose'],effect_authority:0};}catch(error){return{schema:'xiio.cli.activate/v1',state:'FAIL',reason:String(error.message),modified:false};}}
function systemctl(scope,args){return run('systemctl',[...(scope==='user'?['--user']:[]),...args]);}
function serviceRows(service,discovery=true){
  const out=[];out.observation_incomplete=false;
  const candidates=[...new Set([...(service.systemd_candidates||[]),...(discovery?service.discovery_systemd_candidates||[]:[])])];
  for(const scope of ['system','user'])for(const unit of candidates){
    const exists=systemctl(scope,['show',unit,'-p','LoadState','--value']);
    if(exists.stdout==='not-found')continue;
    if(exists.status!==0||!exists.stdout){out.observation_incomplete=true;continue;}
    const a=systemctl(scope,['is-active',unit]),e=systemctl(scope,['is-enabled',unit]);
    if(!['active','inactive','failed'].includes(a.stdout))out.observation_incomplete=true;
    out.push({scope,unit,active:a.stdout||'unknown',enabled:e.stdout||'unknown'});
  }
  return out;
}
function httpProbe(url,timeout=2500){
  return new Promise(resolve=>{
    const u=loopbackUrl(url);
    if(!u)return resolve({state:'FAIL',reason:'HEALTH_URL_MUST_BE_THIS_COMPUTER',http_observed:false,response_received:false,identity_verified:false,effect_authority:0});
    const limit=65536,deadline=Math.max(1,Math.min(Number(timeout)||2500,15000));
    let completed=false,timer,req,responseReceived=false,responseStatus=null;
    const finish=result=>{if(completed)return;completed=true;clearTimeout(timer);resolve({...result,response_received:responseReceived,...(responseReceived?{status:responseStatus}:{}),identity_verified:false,effect_authority:0});};
    const client=u.protocol==='https:'?https:http;
    timer=setTimeout(()=>{finish({state:'TRUE_WAIT',reason:'HEALTH_TIMEOUT',http_observed:false});req?.destroy();},deadline);
    try{req=client.get(u,{timeout:deadline,rejectUnauthorized:true,headers:{accept:'application/json'}},res=>{
      responseReceived=true;responseStatus=res.statusCode;
      let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>limit){finish({state:'FAIL',reason:'HEALTH_RESPONSE_TOO_LARGE',status:res.statusCode,http_observed:false});req.destroy();}});
      res.on('end',()=>{
        const status=res.statusCode;
        if(status>=300&&status<400)return finish({state:'UNQUALIFIED',reason:'HEALTH_REDIRECT_REFUSED',status,http_observed:false});
        if(status!==200)return finish({state:'UNQUALIFIED',reason:'HEALTH_STATUS_UNQUALIFIED',status,http_observed:false});
        // HTTP reachability is observable; product health/identity needs its own
        // independently bound adapter. Never expose untrusted response bodies.
        finish({state:'HTTP_OBSERVED',reason:'PRODUCT_HEALTH_AND_IDENTITY_UNVERIFIED',status,http_observed:true,bytes_received:size});
      });
      res.on('error',()=>finish({state:'TRUE_WAIT',reason:'HEALTH_RESPONSE_INTERRUPTED',http_observed:false}));
      res.on('aborted',()=>finish({state:'TRUE_WAIT',reason:'HEALTH_RESPONSE_INTERRUPTED',http_observed:false}));
    });req.on('timeout',()=>{finish({state:'TRUE_WAIT',reason:'HEALTH_TIMEOUT',http_observed:false});req.destroy();});req.on('error',()=>finish({state:'TRUE_WAIT',reason:'HEALTH_TRANSPORT_UNVERIFIED',http_observed:false}));}
    catch{finish({state:'FAIL',reason:'HEALTH_REQUEST_REFUSED',http_observed:false});}
  });
}

async function serviceStatus(id){const c=loadCatalog();const s=c.services.find(x=>x.id===id);if(!s)return{state:'FAIL',reason:'UNKNOWN_SERVICE',id};const units=serviceRows(s);const probe=s.probe?await httpProbe(s.probe):null;let state='UNKNOWN';if(probe?.response_received)state='HTTP_OBSERVED_UNQUALIFIED';else if(units.some(x=>x.active==='active'))state='RUNNING_UNPROVEN';else if(units.observation_incomplete)state='OBSERVATION_INCOMPLETE';else if(units.length)state='STOPPED';else state='NOT_OBSERVED';return{schema:'xiio.cli.service-status/v1',id:s.id,class:s.class,state,unit_observation:units.observation_incomplete?'OBSERVATION_INCOMPLETE':'CATALOG_CANDIDATES_CHECKED',observation_scope:'DECLARED_CATALOG_CANDIDATES_ONLY',identity_verified:false,effect_authority:0,units,probe,model_agnostic:s.model_agnostic??null};}
async function servicesCommand(sub,args,flags){if(['add','grant','remove','discover'].includes(sub)){const r=await servicesLocalCommand(sub,args,flags);if(r)return r;}const c=loadCatalog();if(sub==='list'||!sub)return{schema:'xiio.cli.services/v1',state:'PASS',services:c.services.map(s=>({id:s.id,class:s.class,probe:s.probe||null,model_agnostic:s.model_agnostic??null}))};if(sub==='status'){if(flags.profile&&!c.profiles?.[flags.profile])return{schema:'xiio.cli.services-status/v1',state:'FAIL',reason:'UNKNOWN_SERVICE_PROFILE',profile:flags.profile,rows:[]};const ids=args.length?args:(flags.profile?(c.profiles[flags.profile]?.services||[]):c.services.map(s=>s.id));const rows=[];for(const id of ids)rows.push(await serviceStatus(id));return{schema:'xiio.cli.services-status/v1',state:rows.length&&rows.every(r=>r.state==='PASS')?'PASS':'PARTIAL',profile:flags.profile||null,rows};}if(['start','stop','restart'].includes(sub)){const id=args[0];if(!id)return{state:'FAIL',reason:'SERVICE_ID_REQUIRED'};const s=c.services.find(x=>x.id===id);if(!s)return{state:'FAIL',reason:'UNKNOWN_SERVICE',id};const rows=serviceRows(s,false);if(!rows.length)return{state:'BLOCKED',reason:'SERVICE_UNIT_NOT_FOUND',id,candidates:s.systemd_candidates||[]};const target=rows.find(x=>x.active==='active')||rows[0];let r=systemctl(target.scope,[sub,target.unit]);if(r.status!==0&&target.scope==='system')r=run('sudo',['-n','systemctl',sub,target.unit]);return{schema:'xiio.cli.service-action/v1',state:r.status===0?'PASS':'BLOCKED',action:sub,id,unit:target,stdout:r.stdout,stderr:r.stderr,effect_authority:'LOCAL_SERVICE_ONLY'};}return{state:'FAIL',reason:'UNKNOWN_SERVICES_COMMAND',subcommand:sub};}
function runnerProcesses(){const r=run('pgrep',['-af','Runner.Listener']);if(r.status!==0||!r.stdout)return[];return r.stdout.split('\n').filter(Boolean).map(line=>{const m=line.match(/^(\d+)\s+(.*)$/);return{pid:m?Number(m[1]):null,command:m?m[2]:line};});}
function runnerServiceRows(){const fake={systemd_candidates:['xiio-github-actions-runner.service']};const rows=serviceRows(fake);for(const scope of ['system','user']){const l=systemctl(scope,['list-unit-files','actions.runner.*.service','--no-legend','--no-pager']);for(const line of l.stdout.split('\n').map(x=>x.trim()).filter(Boolean)){const unit=line.split(/\s+/)[0];if(rows.some(x=>x.scope===scope&&x.unit===unit))continue;const a=systemctl(scope,['is-active',unit]);const e=systemctl(scope,['is-enabled',unit]);rows.push({scope,unit,active:a.stdout||'unknown',enabled:e.stdout||'unknown'});}}return rows;}
function runnerRoots(flags){const roots=[];const explicit=String(flags['search-root']||'').trim();if(explicit)for(const x of explicit.split(':'))if(x&&fs.existsSync(x))roots.push(path.resolve(x));else{}else{for(const x of [os.homedir(),'/opt','/srv'])if(fs.existsSync(x))roots.push(x);if(flags.deep){for(const x of [`/media/${process.env.USER}`,'/mnt'])if(fs.existsSync(x))roots.push(x);}}return[...new Set(roots)];}
function runnerRegistrations(flags){const out=[];for(const root of runnerRoots(flags)){const r=run('find',[root,'-maxdepth',String(flags.depth||7),'-type','f','-name','.runner','-print'],{timeout:Number(flags.timeout||30000)});for(const marker of r.stdout.split('\n').filter(Boolean)){const dir=path.dirname(marker);const runSh=path.join(dir,'run.sh');if(fs.existsSync(runSh))out.push({marker,dir,run_sh:runSh});}}return out;}
function ghJob(flags){const repo=String(flags.repo||'');const runId=String(flags['run-id']||'');const jobId=String(flags['job-id']||'');if(!repo||!runId)return{state:'UNBOUND'};const rr=run('gh',['api',`repos/${repo}/actions/runs/${runId}`]);const jr=run('gh',['api',`repos/${repo}/actions/runs/${runId}/jobs`]);if(rr.status!==0)return{state:'TRUE_WAIT',reason:'RUN_UNREADABLE',stderr:rr.stderr};let R={};let J={};try{R=JSON.parse(rr.stdout);const all=JSON.parse(jr.stdout).jobs||[];J=jobId?all.find(x=>String(x.id)===jobId)||{}:all[0]||{};}catch{}return{state:J.id?'PASS':'PARTIAL',run_id:runId,run_status:R.status||'UNKNOWN',head_sha:R.head_sha||null,job_id:J.id||jobId||null,job_status:J.status||'UNKNOWN',job_conclusion:J.conclusion||null,runner_id:J.runner_id||0,runner_name:J.runner_name||null,step_count:Array.isArray(J.steps)?J.steps.length:0};}
function runnerDiagnose(flags){const processes=runnerProcesses();const services=runnerServiceRows();const regs=runnerRegistrations(flags);const provider=ghJob(flags);let state='NOT_FOUND';if(processes.length)state='LISTENER_RUNNING';else if(services.some(x=>x.active==='active'))state='SERVICE_ACTIVE';else if(services.length)state='SERVICE_RECOVERABLE';else if(regs.length)state='REGISTRATION_RECOVERABLE';return{schema:'xiio.cli.runner-diagnose/v1',state,host:os.hostname(),listener_processes:processes,services,search_roots:runnerRoots(flags),registrations:regs,provider,hard:['MACHINE_NODE != AGENT','DIAGNOSE != RECOVER','NO_NEW_RUNNER','NO_TOKEN']};}
function runnerRecover(flags){const before=runnerDiagnose(flags);if(before.listener_processes.length)return{schema:'xiio.cli.runner-recover/v1',state:'PASS_ALREADY_RUNNING',before,after:before};const svc=before.services.find(x=>x.active!=='active')||before.services[0];let action=null;if(svc){let r=systemctl(svc.scope,['start',svc.unit]);if(r.status!==0&&svc.scope==='system')r=run('sudo',['-n','systemctl','start',svc.unit]);action={kind:'START_EXISTING_SERVICE',target:svc,status:r.status,stderr:r.stderr};}else if(before.registrations.length===1){const reg=before.registrations[0];const child=spawn(reg.run_sh,[],{cwd:reg.dir,detached:true,stdio:'ignore',env:controlledChildEnv()});child.unref();action={kind:'START_EXISTING_RUN_SH',target:{dir:reg.dir},status:0};}else return{schema:'xiio.cli.runner-recover/v1',state:'BLOCKED',reason:before.registrations.length>1?'AMBIGUOUS_REGISTRATIONS':'RUNNER_SERVICE_AND_REGISTRATION_NOT_FOUND',before};run('sleep',['2']);const after=runnerDiagnose(flags);return{schema:'xiio.cli.runner-recover/v1',state:after.listener_processes.length?'PASS':'BLOCKED',action,before,after,effect_authority:'LOCAL_EXISTING_RUNNER_ONLY'};}
async function glassRead(flags){const url=String(flags.url||'http://127.0.0.1:4390/api/v1/studio/local-truth/read');return{schema:'xiio.cli.glass-read/v1',...(await httpProbe(url,Number(flags.timeout||5000))),effect_authority:0};}
async function enginesCommand(sub,args){const c=loadCatalog();if(sub==='list'||!sub)return{schema:'xiio.cli.engines/v1',state:'PASS',engines:c.ai_engines};return{state:'FAIL',reason:'UNKNOWN_ENGINES_COMMAND'};}
async function modelsCommand(sub,args,flags){
  if(sub!=='list'&&sub)return{state:'FAIL',reason:'UNKNOWN_MODELS_COMMAND'};
  const engine=String(flags.engine||'ollama');
  if(engine!=='ollama')return{schema:'xiio.cli.models/v1',state:'TRUE_WAIT',engine,reason:'ENGINE_ADAPTER_NOT_IMPLEMENTED'};
  try{
    const res=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)});
    if(!res.ok)throw new Error('OLLAMA_HTTP_'+res.status);
    const body=await res.json();
    if(!Array.isArray(body.models))throw new Error('OLLAMA_MODELS_INVALID');
    return{schema:'xiio.cli.models/v1',state:'PASS',engine,models:body.models.filter(m=>m&&typeof(m.name||m.model)==='string').map(m=>({name:m.name||m.model,size:m.size??null,modified_at:m.modified_at||null})),rule:'ENGINE != MODEL; no model is installed or selected by listing.'};
  }catch(e){return{schema:'xiio.cli.models/v1',state:'TRUE_WAIT',engine,models:[],reason:String(e.message||e)};}
}
function installCommand(target,flags){
  if(target==='ollama'){
    if(run('ollama',['--version']).status===0)return{schema:'xiio.cli.install/v1',state:'PASS_ALREADY_INSTALLED',target:'ollama',models_installed:0};
    if(!flags.apply)return{schema:'xiio.cli.install-plan/v1',state:'PLAN',target:'ollama',provider:'official_ollama_linux_installer',command:'curl -fsSL https://ollama.com/install.sh | sh',models_installed:0,hard:['INSTALL_ENGINE != INSTALL_MODEL','--apply REQUIRED']};
    const curl=run('curl',['-fsSL','https://ollama.com/install.sh']);
    if(curl.status!==0)return{state:'BLOCKED',reason:'OLLAMA_INSTALLER_DOWNLOAD_FAILED',stderr:curl.stderr};
    const sh=spawnSync('sh',[],{input:curl.stdout,encoding:'utf8',timeout:180000,env:controlledChildEnv()});
    const result={schema:'xiio.cli.install/v1',state:'BLOCKED',target:'ollama',status:sh.status,stdout:(sh.stdout||'').slice(-2000),stderr:(sh.stderr||'').slice(-2000),models_installed:0,hard:['ENGINE_INSTALLED != MODEL_SELECTED']};
    if(sh.status!==0)return result;
    // Installer exit zero is not evidence that the engine can now be invoked.
    // Reuse the existing installed-engine observation, not a service-health claim.
    const version=run('ollama',['--version']);
    return{...result,state:version.status===0?'PASS':'BLOCKED',reason:version.status===0?null:'OLLAMA_INSTALLATION_UNVERIFIED',
      installation_observation:{state:version.status===0?'VERSION_COMMAND_SUCCEEDED':'VERSION_COMMAND_FAILED',status:version.status,stdout:version.stdout.slice(0,2000),stderr:version.stderr.slice(0,2000),error:version.error},
      service_health:'NOT_CHECKED',model_inference:'NOT_CHECKED'};
  }
  if(target==='mail-server')return{schema:'xiio.cli.install-plan/v1',state:'PROFILE_REQUIRED',target,reason:'Mail transport needs explicit provider/security profile before package mutation.',examples:['postfix+dovecot','existing external IMAP/SMTP'],apply:false};
  return{state:'FAIL',reason:'UNKNOWN_INSTALL_TARGET',target};
}
function ghJson(args){
  const r=run('gh',args,{timeout:30000});
  if(r.status!==0)return{state:'TRUE_WAIT',reason:'GITHUB_UNREADABLE',stderr:r.stderr};
  try{return{state:'PASS',value:JSON.parse(r.stdout)}}catch{return{state:'FAIL',reason:'GITHUB_JSON_INVALID',stdout:r.stdout};}
}
function registryDiscover(flags){
  const owner=String(flags.owner||'Vado42-chris').trim();
  const prefix=String(flags.prefix||'xi-io').trim().toLowerCase();
  const list=ghJson(['repo','list',owner,'--limit','1000','--json','name,isPrivate,isArchived,defaultBranchRef,url']);
  if(list.state!=='PASS')return{schema:'xiio.cli.registry-discover/v1',state:list.state,owner,prefix,reason:list.reason,stderr:list.stderr||null,effect_authority:0};
  const repos=(Array.isArray(list.value)?list.value:[]).filter(r=>String(r.name||'').toLowerCase().includes(prefix)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const rows=[];
  for(const r of repos){
    const full=owner+'/'+r.name, branch=r.defaultBranchRef?.name||'main', probes={};
    for(const p of ['README.md','AGENTS.md','xiio/ack.json','xiio/repo-ingress-manifest.json','.xiio/status.json','xiio/tool-manifest.json']){
      const q=run('gh',['api','repos/'+full+'/contents/'+p+'?ref='+branch],{timeout:10000});
      probes[p]=q.status===0?'PRESENT':(q.status===404?'ABSENT':'UNREADABLE');
    }
    rows.push({repository:full,url:r.url||null,default_branch:branch,private:Boolean(r.isPrivate),archived:Boolean(r.isArchived),identity_state:'REPOSITORY_DISCOVERED',hydration:{readme:probes['README.md'],agents:probes['AGENTS.md'],ack:probes['xiio/ack.json'],ingress:probes['xiio/repo-ingress-manifest.json'],local_status:probes['.xiio/status.json'],tool_manifest:probes['xiio/tool-manifest.json']},qualification_state:'UNQUALIFIED',execution_authority:0});
  }
  return{schema:'xiio.cli.registry-discover/v1',state:'PASS',owner,prefix,count:rows.length,repositories:rows,source:'GitHub authenticated repository inventory',rule:'REPOSITORY != PRODUCT; discovery does not grant product membership, framework adoption, Ward admission, runtime qualification, or effect authority.',effect_authority:0};
}
function registryCommand(sub,args,flags){
  if(sub==='discover'||!sub)return registryDiscover(flags);
  return{schema:'xiio.cli.registry/v1',state:'FAIL',reason:'UNKNOWN_REGISTRY_COMMAND',subcommand:sub,usage:['xiio registry discover [--owner Vado42-chris] [--prefix xi-io]']};
}
function selectDoctorProfile(c,host){
  // A host may not silently inherit another machine's service expectations.
  // Local entries are additional observed candidates, never health or access grants.
  const matches=Object.entries(c.profiles||{}).filter(([,p])=>p?.node_ref==='node.'+host);
  if(matches.length!==1)return{profile:null,ids:[],first_red:matches.length?'HOST_PROFILE_AMBIGUOUS':'HOST_PROFILE_UNRESOLVED'};
  const [profile,p]=matches[0];
  const local=(c.services||[]).filter(s=>s.source==='local'||s.source==='catalog+local').map(s=>s.id);
  return{profile,ids:[...new Set([...(p.services||[]),...local])],first_red:null};
}
async function doctor(){
  const c=loadCatalog(),host=os.hostname(),selection=selectDoctorProfile(c,host),local=localServicesState();
  // A service listed in the product catalog is NOT a host service, a health
  // grant, or a callable API. Do not probe other hosts' services automatically.
  // An operator may explicitly invoke `services discover` for declared health
  // endpoints; that separate read must never mint product or effect authority.
  const expected=new Set(selection.ids);
  const rows=await Promise.all(selection.ids.map(id=>serviceStatus(id)));
  const outside=(c.services||[]).filter(s=>!expected.has(s.id)&&loopbackUrl(s.probe)).map(s=>({
    id:s.id,declared_probe:s.probe,probe_state:'NOT_PROBED',
    observation:'CATALOG_DECLARATION_ONLY',product_identity_verified:false,effect_authority:0
  }));
  const active=activeWorkspace();
  let workspaceResolved=null,workspaceReason=null;
  try{workspaceResolved=workspaceRoot();}
  catch(error){workspaceReason=String(error?.message||error).split(':')[0]||'PROJECT_ROOT_SELECTION_REQUIRED';}
  const byId=new Map(rows.map(row=>[row.id,row]));
  const observed=row=>Boolean(row&&['HTTP_OBSERVED_UNQUALIFIED','RUNNING_UNPROVEN','PASS'].includes(row.state));
  const expectedService=id=>expected.has(id);
  const fileState=workspaceResolved?'READY':'BLOCKED';
  const ollamaRow=byId.get('ollama')||null,ibalRow=byId.get('ibal')||null;
  const modelState=!expectedService('ollama')?'NOT_IN_PROFILE'
    :fileState!=='READY'?'BLOCKED'
    :observed(ollamaRow)?'OBSERVED_UNQUALIFIED':'BLOCKED';
  const ibalState=!expectedService('ibal')?'NOT_IN_PROFILE'
    :modelState==='BLOCKED'?'BLOCKED'
    :observed(ibalRow)?'OBSERVED_UNQUALIFIED':'BLOCKED';
  const readinessFirstRed=fileState!=='READY'?'ACTIVE_WORKSPACE_NOT_READY'
    :expectedService('ollama')&&modelState==='BLOCKED'?'OLLAMA_NOT_OBSERVED'
    :expectedService('ibal')&&ibalState==='BLOCKED'?'IBAL_RUNTIME_NOT_OBSERVED'
    :null;
  const firstRed=local.state==='BLOCKED'?local.first_red:selection.first_red||readinessFirstRed;
  const state=local.state==='BLOCKED'||selection.first_red?'UNKNOWN'
    :readinessFirstRed?'PARTIAL'
    :rows.length&&rows.every(x=>x.state==='PASS')?'PASS':'PARTIAL';
  return{schema:'xiio.cli.doctor/v1',state,host,profile:selection.profile,first_red:firstRed,
    active_workspace:active,services:rows,unprofiled_candidates:outside,
    responding_outside_profile:[],local_services_state:local.state,
    work_readiness:{
      direct_cli_file_work:{state:fileState,requires:['BOUNDED_WORKSPACE'],workspace:workspaceResolved,reason:workspaceReason,effect_authority:0},
      local_ollama_work:{state:modelState,requires:['BOUNDED_WORKSPACE','OLLAMA_RUNTIME'],identity_qualified:false,effect_authority:0},
      ibal_agent_work:{state:ibalState,requires:['BOUNDED_WORKSPACE','OLLAMA_RUNTIME','IBAL_RUNTIME'],identity_qualified:false,effect_authority:0},
      remote_effect_work:{state:'NOT_PROBED',requires:['SWITCHBOARD','WARD','CURRENT_SESSION','BROKER_READBACK'],effect_authority:0}
    },
    host_integration_policy:{
      xiio_core_independent_of_codex_mcp:true,
      required_for_core:[],
      optional_host_integrations:['data','openai-api-key-local-confirmation','codex-diagnostic-db'],
      rule:'HOST_CLIENT_MCP_FAILURE != XIIO_CORE_RUNTIME_FAILURE'
    },
    engines:(c.ai_engines||[]).map(x=>x.id),effect_authority:0,
    qualification_rule:'CATALOG_ENTRY != HEALTH_CHECK != WARD_AUTHORITY'};
}
// Read-only executable discovery. Installation and tool admission remain separate.
function externalToolsStatus(){
  const definitions=[
    {id:'stitch',command:'stitch',args:['--version'],purpose:'Stitch Canvas and Sable design intake'},
    {id:'rea',command:'rea',args:['--version'],purpose:'Reverse engineering inspection'},
    {id:'photocraft',command:'photocraft',args:['--version'],purpose:'Image editing engine'},
    {id:'filmcraft',command:'filmcraft',args:['--version'],purpose:'Video editing engine'},
    {id:'nigel',command:'nigel',args:['--version'],purpose:'Bounded repair workflow'},
    {id:'go',command:'go',args:['version'],purpose:'Nigel build prerequisite'},
    {id:'rustc',command:'rustc',args:['--version'],purpose:'FilmCraft build prerequisite'}
  ];
  return {schema:'xiio.cli.external-tools/v1',state:'DISCOVERY_ONLY',qualified:false,
    tools:definitions.map(t=>{
      const r=run(t.command,t.args,{timeout:3500});
      const installed=r.status===0;
      return {id:t.id,purpose:t.purpose,installed,version:installed?(r.stdout||r.stderr).slice(0,200):null,
        state:installed?'INSTALLED_UNQUALIFIED':'NOT_VERIFIED',reason:installed?null:(r.error||r.stderr||'EXECUTABLE_NOT_FOUND').slice(0,200)};
    }),hard:['INSTALLED != QUALIFIED','DISCOVERY != WARD_ADMISSION','VERSION != VERIFIED_EFFECT']};
}

function help(){return{schema:'xiio.cli.help/v1',product:'xi-io: CLI',state:'PASS',usage:['xiio [workspace] [--model NAME] [--execute]','xiio chat [workspace] [--model NAME] [--execute]','xiio menu [workspace] [--model NAME] [--execute]','xi-io-cli login','xi-io-cli whoami','xi-io-cli connect','xi-io-cli device sign <challenge>','xiio version','xiio activate [path]','xiio doctor','xiio services list','xi-io-cli services discover','xi-io-cli services add <id> <http://127.0.0.1:PORT/health> [--class NAME]','xi-io-cli services grant <id> health|read|read_write','xi-io-cli services remove <id>','xiio services status [service...] [--profile aries-dev]','xiio services start|stop|restart <service>','xiio engines list','xiio tools status','xiio models list --engine ollama','xiio install ollama [--apply]','xiio install mail-server','xiio registry discover [--owner Vado42-chris] [--prefix xi-io]','xiio runner diagnose [--deep] [--search-root PATH] [--repo owner/repo --run-id N --job-id N]','xiio runner recover [same flags]','xiio glass read','xiio scan local [--root PATH] --apply','xiio ux triage [--root PATH] [--terms a,b,c]','xiio ibal balance'],hard:['ENGINE != MODEL','SERVICE != AUTHORITY','NO AUTOMATIC MODEL PULLS','NO NEW GITHUB RUNNER']};}

const MENU = [
  ['1','/help','What can you do?'],
  ['2','/workspace','Where am I working?'],
  ['3','/tools','What tools can you use?'],
  ['4','/commands','What can I ask xi-io to do?'],
  ['5','/ack','What rules and current work are bound?'],
  ['6','/model','Which local model are you using?'],
  ['7','/models','What local models are available?'],
  ['8','/status','Is my local xi-io setup healthy?'],
  ['9','/clear','Clear this conversation'],
  ['10','/exit','Exit xi-io'],
  ['11','/chat','Chat with Ibal — describe the work you need'],
  ['12','/list','List this project’s files (no model needed)'],
  ['13','/search','Find text in this project (no model needed)']
];

function resolveMenuChoice(input){
  const selected=MENU.find(([n,cmd])=>input===n||input===cmd);
  return{command:selected?.[1]||input,invalid:!selected&&/^\d+$/.test(input)};
}
// Terminal adapter: accept the next instruction while a model turn is pending.
// Queued task text is NEVER consumed as approval for a subsequently shown action.
function createHumanConsole(interface_,output,{onInterrupt=()=>{},formatPrompt=p=>p}={}){
  let pending=null,closed=false,pasting=false,burst=[],scheduled=null;
  const queued=[];const keyboard=interface_.input;
  const grouped=Boolean(keyboard?.isTTY)&&typeof setImmediate==='function';
  const render=s=>String(s).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'?');
  const deliver=(line,{paste=false}={})=>{
    if(closed)return;
    if(!paste&&line==='/queue'){output.write('\nQueued tasks: '+queued.length+'. /queue clear discards them; /cancel all cancels current work and clears the queue.\n');if(pending)interface_.prompt(true);return;}
    if(!paste&&(line==='/queue clear'||line==='/cancel all')){
      const count=queued.length;queued.length=0;
      if(line==='/cancel all'){onInterrupt();if(pending?.fresh){const p=pending;pending=null;p.resolve('');if(p.draft)interface_.write(p.draft);}}
      output.write('\nDiscarded '+count+' queued task(s). Completed effects remain recorded.\n');if(pending)interface_.prompt(true);return;
    }
    // Pasted text, even "yes", is never approval of the currently displayed action.
    if(pending&&!(paste&&pending.fresh)){
      const p=pending;pending=null;p.resolve(line);if(p.draft)interface_.write(p.draft);
    }else{queued.push(line);output.write('\nQueued for the next turn. '+queued.length+' task(s) waiting. /queue clear discards queued tasks; /cancel all also cancels current work.\n');}
  };
  const flush=()=>{scheduled=null;if(pasting||!burst.length)return;const batch=burst;burst=[];deliver(batch.join('\n'),{paste:batch.length>1});};
  const receive=line=>{
    if(pasting){burst.push(line);return;}
    if(!grouped){deliver(line);return;}
    burst.push(line);if(!scheduled)scheduled=setImmediate(flush);
  };
  const keypress=(text,key)=>{
    if(key?.name==='paste-start'){if(scheduled){clearImmediate(scheduled);scheduled=null;}flush();pasting=true;return;}
    if(key?.name==='paste-end'&&pasting){
      if(interface_.line){burst.push(interface_.line);interface_.write(null,{ctrl:true,name:'u'});}
      pasting=false;const lines=burst;burst=[];deliver(lines.join('\n'),{paste:true});
    }
  };
  const end=()=>{closed=true;if(scheduled&&grouped)clearImmediate(scheduled);scheduled=null;burst=[];if(pending){pending.reject(Object.assign(Error('Console closed'),{code:'ERR_USE_AFTER_CLOSE'}));pending=null;}};
  const interrupt=()=>{pasting=false;burst=[];if(scheduled&&grouped)clearImmediate(scheduled);scheduled=null;onInterrupt();if(pending?.fresh){const p=pending;pending=null;p.resolve('');if(p.draft)interface_.write(p.draft);}};
  interface_.on('line',receive);interface_.on('close',end);interface_.on('SIGINT',interrupt);
  if(keyboard?.isTTY&&keyboard.prependListener){keyboard.prependListener('keypress',keypress);output.write('\x1b[?2004h');}
  return {
    question(prompt){
      if(closed)return Promise.reject(Object.assign(Error('Console closed'),{code:'ERR_USE_AFTER_CLOSE'}));
      if(pending)return Promise.reject(Error('CONSOLE_QUESTION_ALREADY_PENDING'));
      const fresh=prompt!=='xi> '&&prompt!=='';
      if(!fresh&&queued.length){output.write(formatPrompt(prompt));return Promise.resolve(queued.shift());}
      let draft='';if(fresh&&interface_.line){draft=interface_.line;interface_.write(null,{ctrl:true,name:'u'});}
      interface_.setPrompt(formatPrompt(prompt));interface_.prompt(true);
      return new Promise((resolve,reject)=>{pending={resolve,reject,fresh,draft};});
    },
    close(){if(keyboard?.isTTY&&keyboard.off){keyboard.off('keypress',keypress);output.write('\x1b[?2004l');}interface_.off('line',receive);interface_.off('SIGINT',interrupt);end();interface_.off('close',end);interface_.close();},
    queuedCount(){return queued.length;}
  };
}
function looksLikeShellPaste(input){
  const text=String(input).trim();
  return text.includes('\n')&&/^(?:#!.*\b(?:ba)?sh\b|[A-Za-z_][A-Za-z_0-9]*=|\(\s*\n|set -[a-z]*e|export PATH=|gh api\b|python3?\s+.*--install|curl\s+|```(?:bash|sh)\s*\n)/.test(text);
}
async function nextHumanInput(rl){
  // Blank lines from a pasted terminal block are never model instructions
  // and must not create hundreds of visible prompts.
  let input=(await rl.question('xi> ')).trim();
  while(!input)input=(await rl.question('')).trim();
  return input;
}
function workspaceRoot(explicit=null){
  const a=activeWorkspace();
  // The folder you start in wins over a saved workspace, except from your home
  // folder or /, where the saved workspace (if any) is used.
  const cwd=process.cwd();const broad=cwd===path.parse(cwd).root||path.resolve(cwd)===path.resolve(os.homedir());
  if(!explicit&&broad&&a.state==='STALE')throw new Error('ACTIVE_WORKSPACE_STALE: '+a.path+'; choose an existing workspace explicitly.');
  if(!explicit&&broad&&!a.path)throw new Error('PROJECT_ROOT_SELECTION_REQUIRED: choose a project folder, not home or the filesystem root.');
  const candidate=explicit||(broad?a.path:cwd);
  const root=path.resolve(candidate);
  if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error('WORKSPACE_NOT_DIRECTORY: '+root);
  const real=fs.realpathSync(root);
  if(real===path.parse(real).root||real===fs.realpathSync(os.homedir()))throw new Error('PROJECT_ROOT_SELECTION_REQUIRED: choose a bounded project folder.');
  return real;
}
function within(root,p){const r=path.resolve(root),x=path.resolve(r,p),rel=path.relative(r,x);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep));}

// Credential stores stay closed even when the workspace is the home folder:
// the model never reads, lists or edits them.
const CREDENTIAL_PATHS=['.ssh','.gnupg','.aws','.azure','.kube','.docker','.password-store','.git-credentials','.netrc','.npmrc','.pypirc',path.join('.config','gh'),path.join('.config','gcloud'),path.join('.local','share','keyrings')];
// Secret-bearing names refused anywhere in a path, not only under home:
// a project can hold its own .env, keys or git credentials.
const SECRET_DIRS=new Set(['.ssh','.gnupg','.aws','.azure','.kube','.docker','.password-store']);
const SECRET_FILE=/^(\.env(\..+)?|\.netrc|\.npmrc|\.pypirc|\.git-credentials|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|keystore|jks))$/i;
const SECRET_FILE_OK=/^\.env\.(example|sample|template)$/i;
function credentialPath(abs){
  const home=os.homedir();
  if(within(home,abs)){const rel=path.relative(home,abs);if(CREDENTIAL_PATHS.some(c=>rel===c||rel.startsWith(c+path.sep)))return true;}
  const parts=path.resolve(abs).split(path.sep).filter(Boolean);
  if(parts.some(x=>SECRET_DIRS.has(x)))return true;
  // .git/config can carry tokens in remote URLs.
  for(let i=0;i<parts.length-1;i++)if(parts[i]==='.git'&&parts[i+1]==='config')return true;
  const base=parts.at(-1)||'';
  return SECRET_FILE.test(base)&&!SECRET_FILE_OK.test(base);
}
// Version 1 commands run only inside a real containment boundary. There is
// no fallback to the host shell: no boundary means no command.
const SANDBOX_TIMEOUT_MS=120000;
let sandboxCache=null;
function onPath(name){for(const d of String(process.env.PATH||'').split(path.delimiter)){if(!d)continue;const f=path.join(d,name);try{fs.accessSync(f,fs.constants.X_OK);if(fs.statSync(f).isFile())return f;}catch{}}return null;}
function sandboxState(){
  if(sandboxCache)return sandboxCache;
  if(process.env.XIIO_SANDBOX==='off')return sandboxCache={ok:false,reason:'SANDBOX_DISABLED_BY_ENVIRONMENT'};
  // XIIO_TEST_PLATFORM can only make this stricter: any non-linux value refuses.
  const platform=process.platform==='linux'&&process.env.XIIO_TEST_PLATFORM?process.env.XIIO_TEST_PLATFORM:process.platform;
  if(platform!=='linux')return sandboxCache={ok:false,reason:'SANDBOX_UNAVAILABLE_ON_'+platform.toUpperCase(),detail:'Commands are not available on this operating system in Version 1. Reading and approved edits still work.'};
  const bwrap=onPath('bwrap');
  if(!bwrap)return sandboxCache={ok:false,reason:'SANDBOX_UNAVAILABLE_NO_BWRAP',detail:'Install bubblewrap (for example: sudo apt install bubblewrap) to allow commands.'};
  // Some distributions block unprivileged namespaces; prove the boundary works.
  const probe=spawnSync(bwrap,['--unshare-all','--die-with-parent','--ro-bind','/','/','--','true'],{encoding:'utf8',timeout:10000,env:controlledChildEnv()});
  if(probe.status!==0)return sandboxCache={ok:false,reason:'SANDBOX_UNAVAILABLE_NAMESPACES_BLOCKED',detail:String(probe.stderr||probe.error?.message||'').trim().slice(0,300)};
  return sandboxCache={ok:true,bwrap};
}
function sandboxArgs(root,command,{network=false}={}){
  const home=os.homedir();
  const args=['--die-with-parent','--new-session','--unshare-all','--clearenv'];
  if(network)args.push('--share-net');
  for(const d of ['/usr','/bin','/sbin','/lib','/lib32','/lib64','/etc'])args.push('--ro-bind-try',d,d);
  args.push('--proc','/proc','--dev','/dev','--tmpfs','/tmp');
  // S1: hide the real home first, then mount the toolchain back on top, so a
  // node installed under home (nvm, fnm, volta) is still reachable.
  args.push('--tmpfs',home);
  const nodeBin=path.dirname(process.execPath);
  const toolchain=new Set([path.dirname(nodeBin),path.dirname(path.dirname(fs.realpathSync(process.execPath)))]);
  for(const t of toolchain)if(!['/','/usr','/usr/local'].includes(t))args.push('--ro-bind-try',t,t);
  // S2: the project is writable so caches, coverage and build output work.
  // Its .git stays read-only so hooks and config cannot be planted.
  args.push('--bind',root,root);
  const git=path.join(root,'.git');if(fs.existsSync(git))args.push('--ro-bind',git,git);
  args.push('--chdir',root,'--setenv','HOME',home,'--setenv','TMPDIR','/tmp','--setenv','LANG',process.env.LANG||'C.UTF-8','--setenv','TERM','dumb',
    '--setenv','PATH',[nodeBin,'/usr/local/bin','/usr/bin','/bin'].join(':'),'--','/bin/bash','-o','pipefail','-c',command);
  return args;
}
function sandboxRefusal(root){
  const home=os.homedir();
  // A home-wide or system-wide workspace would make dotfiles writable.
  if(root===path.parse(root).root||within(root,home))return 'SANDBOX_WORKSPACE_TOO_BROAD: start xi-io-cli inside a project folder to run commands';
  return null;
}

function toolCatalog(){
  return [
    {name:'list_workspace',description:'List files and folders in the workspace.',write:false},
    {name:'search_workspace',description:'Search workspace text files for a phrase.',write:false},
    {name:'read_workspace_file',description:'Read a text file from the workspace.',write:false},
    {name:'git_status',description:'Read git branch and working-tree status.',write:false},
    {name:'list_registries',description:'Find registry, ACK, current and manifest files.',write:false},
    {name:'resolve_registry',description:'Read one named registry/current/ACK file.',write:false},
    {name:'local_scan',description:'Run the workspace baseline scanner in the no-network sandbox, after explicit approval. A receipt is not live authority.',write:true},
    {name:'cross_ux_triage',description:'Read and deduplicate workspace artifact content; never delete duplicates.',write:false},
    {name:'edit_workspace_file',description:'Change an existing file using copied old_text, new_text and optional expected_sha256. The file is replaced only when its approved bytes still match under a local cooperative lock. To create a file, give path and content. Each change requires explicit approval. Local locking does not replace Ward or BINS authority.',write:true},
    {name:'install_dependencies',description:'Install the exact packages pinned in package-lock.json (npm ci, install scripts blocked) so builds can run. Sandboxed; needs your yes.',write:true},
    {name:'list_services',description:'List configured local service candidates and their declared health endpoints. Listing proves neither installation nor current product identity or permission.',write:false},
    {name:'call_service',description:'Read only the exact declared health endpoint of a configured loopback service. Broader APIs and writes are unavailable without independently bound current service identity. An HTTP response is not product-health or authority proof.',write:false},
    {name:'run_workspace_command',description:'Run a command inside a sandbox: the project folder is writable, the rest of the computer is hidden or read-only, and there is no network. The human approves each command.',write:true}
  ];
}

const sha256=(b)=>crypto.createHash('sha256').update(b).digest('hex');

const CHAT_STATE_ROOT=process.env.XIIO_STATE_DIR||path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'xi-io');
const CHAT_STATE_DIR=path.join(CHAT_STATE_ROOT,'chat');
const CHAT_SESSION_MAX_BYTES=8*1024*1024;
function chatSessionFile(root){
  return path.join(CHAT_STATE_DIR,crypto.createHash('sha256').update(Buffer.from(path.resolve(root),'utf8')).digest('hex').slice(0,40)+'.json');
}
function ensureChatStateDir(){
  fs.mkdirSync(CHAT_STATE_DIR,{recursive:true,mode:0o700});
  const st=fs.lstatSync(CHAT_STATE_DIR);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('CHAT_STATE_DIR_UNTRUSTED');
  if(process.platform!=='win32'){
    if(typeof process.getuid==='function'&&st.uid!==process.getuid())throw Error('CHAT_STATE_DIR_NOT_OWNED');
    if((st.mode&0o077)!==0)fs.chmodSync(CHAT_STATE_DIR,0o700);
  }
}
function chatSessionRegular(file,{strictMode=true}={}){
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('CHAT_SESSION_FILE_UNTRUSTED');
  if(process.platform!=='win32'){
    if(typeof process.getuid==='function'&&st.uid!==process.getuid())throw Error('CHAT_SESSION_NOT_OWNED');
    if(strictMode&&(st.mode&0o077)!==0)throw Error('CHAT_SESSION_PERMISSIONS_UNSAFE');
  }
  return st;
}
function validChatHistory(messages){
  return Array.isArray(messages)&&messages.length<=200&&messages.every(m=>m&&typeof m==='object'&&!Array.isArray(m)
    &&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string');
}
function loadChatSession(root){
  const file=chatSessionFile(root);
  let st;
  try{st=chatSessionRegular(file);}
  catch(error){
    if(error?.code==='ENOENT')return{state:'ABSENT',file,messages:[],lastTurn:null,model:null,bytes:null};
    return{state:'BLOCKED',file,reason:String(error?.message||error),messages:[],lastTurn:null,model:null,bytes:null};
  }
  if(st.size>CHAT_SESSION_MAX_BYTES)return{state:'BLOCKED',file,reason:'CHAT_SESSION_TOO_LARGE',messages:[],lastTurn:null,model:null,bytes:null};
  let bytes,data;
  try{
    const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    try{
      const opened=fs.fstatSync(fd);
      if(opened.dev!==st.dev||opened.ino!==st.ino||!opened.isFile()||opened.nlink!==1)throw Error('CHAT_SESSION_CHANGED_DURING_READ');
      bytes=fs.readFileSync(fd);
    }finally{fs.closeSync(fd);}
    data=JSON.parse(bytes.toString('utf8'));
  }catch(error){return{state:'BLOCKED',file,reason:String(error?.message||error),messages:[],lastTurn:null,model:null,bytes:null};}
  const lastTurn=data?.last_turn===null?null:data?.last_turn;
  if(data?.schema!=='xiio.cli.chat-session/v1'||path.resolve(String(data.workspace||''))!==path.resolve(root)
    ||!validChatHistory(data.messages)
    ||!(lastTurn===null||(lastTurn&&typeof lastTurn==='object'&&!Array.isArray(lastTurn)&&typeof lastTurn.text==='string'&&lastTurn.receipt&&typeof lastTurn.receipt==='object'&&!Array.isArray(lastTurn.receipt)))
    ||!(data.model===null||typeof data.model==='string'))
    return{state:'BLOCKED',file,reason:'CHAT_SESSION_INVALID',messages:[],lastTurn:null,model:null,bytes:null};
  return{state:'PASS',file,messages:data.messages,lastTurn,model:data.model,bytes};
}
function createPrivateChatSession(file,bytes){
  ensureChatStateDir();
  let fd=null;
  try{
    fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600);
    fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);
  }finally{if(fd!==null)fs.closeSync(fd);}
  const st=chatSessionRegular(file);if(st.size!==bytes.length||!fs.readFileSync(file).equals(bytes))throw Error('CHAT_SESSION_CREATE_READBACK_FAILED');
}
function saveChatSession(root,{messages,lastTurn,model},previousBytes){
  ensureChatStateDir();
  const file=chatSessionFile(root);
  const history=messages.filter(m=>m?.role==='user'||m?.role==='assistant').slice(-200).map(m=>({role:m.role,content:String(m.content)}));
  const record={schema:'xiio.cli.chat-session/v1',workspace:path.resolve(root),model:model||null,messages:history,last_turn:lastTurn||null,updated_at:new Date().toISOString()};
  const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n','utf8');
  if(bytes.length>CHAT_SESSION_MAX_BYTES)throw Error('CHAT_SESSION_TOO_LARGE');
  if(previousBytes===null)createPrivateChatSession(file,bytes);
  else{
    chatSessionRegular(file);
    commitWorkspaceEditCAS({file,expectedBytes:previousBytes,nextBytes:bytes,expectedSha256:sha256(previousBytes)});
    chatSessionRegular(file);
  }
  const readback=fs.readFileSync(file);
  if(!readback.equals(bytes))throw Error('CHAT_SESSION_READBACK_FAILED');
  return readback;
}
function clearChatSession(root){
  const file=chatSessionFile(root);
  let st;
  try{st=chatSessionRegular(file,{strictMode:false});}
  catch(error){if(error?.code==='ENOENT')return false;throw error;}
  fs.unlinkSync(file);
  try{fs.lstatSync(file);throw Error('CHAT_SESSION_CLEAR_READBACK_FAILED');}
  catch(error){if(error?.code!=='ENOENT')throw error;}
  return true;
}

const SKIP_DIRS=new Set(['.git','node_modules']);
function walkWorkspace(root,visit,{maxFiles=20000}={}){
  let seen=0;const stack=[root];
  while(stack.length&&seen<maxFiles){
    const dir=stack.pop();let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
    for(const e of entries){
      const abs=path.join(dir,e.name);
      if(e.isSymbolicLink())continue; // never follow links out of the workspace
      if(e.isDirectory()){if(!SKIP_DIRS.has(e.name)&&!credentialPath(abs))stack.push(abs);continue;}
      if(e.isFile()){if(credentialPath(abs))continue;seen++;if(visit(abs)===false)return;}
    }
  }
}
function readText(p){
  const buf=fs.readFileSync(p);
  if(buf.includes(0))throw new Error('BINARY_FILE_REFUSED');
  const text=buf.toString('utf8');
  if(!Buffer.from(text,'utf8').equals(buf))throw new Error('NOT_UTF8_TEXT_REFUSED');
  return {buf,text};
}
// Shared by direct reads and artifact triage: bounded allocation, descriptor
// readback, regular files only, no path-component symlinks or credential paths.
function readWorkspaceText(root,relative){
  const realRoot=fs.realpathSync(root),target=path.resolve(realRoot,relative);
  if(!within(realRoot,target))throw Error('PATH_OUTSIDE_WORKSPACE');
  if(credentialPath(target))throw Error('CREDENTIAL_PATH_REFUSED');
  let cursor=realRoot;
  for(const part of path.relative(realRoot,target).split(path.sep).filter(Boolean)){
    cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())throw Error('SYMLINK_OUTSIDE_WORKSPACE');
  }
  const before=fs.lstatSync(target);if(!before.isFile())throw Error('NOT_A_REGULAR_FILE');
  const limit=2*1024*1024;if(before.size>limit)throw Error('READ_FILE_TOO_LARGE: maximum 2097152 bytes');
  const fd=fs.openSync(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));
  try{
    const opened=fs.fstatSync(fd);if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino)throw Error('READ_FILE_CHANGED');
    if(!within(realRoot,fs.realpathSync(target))||credentialPath(fs.realpathSync(target)))throw Error('PATH_OUTSIDE_WORKSPACE');
    const buffer=Buffer.alloc(limit+1);let size=0;
    while(size<buffer.length){const n=fs.readSync(fd,buffer,size,buffer.length-size,null);if(!n)break;size+=n;}
    if(size>limit)throw Error('READ_FILE_TOO_LARGE: maximum 2097152 bytes');
    const after=fs.fstatSync(fd);if(after.size!==size||after.mtimeMs!==opened.mtimeMs)throw Error('READ_FILE_CHANGED');
    const buf=buffer.subarray(0,size);if(buf.includes(0))throw Error('BINARY_FILE_REFUSED');
    const text=buf.toString('utf8');if(!Buffer.from(text,'utf8').equals(buf))throw Error('NOT_UTF8_TEXT_REFUSED');
    return{buf,text};
  }finally{fs.closeSync(fd);}
}
function lineOf(text,index){return text.slice(0,index).split('\n').length;}
function showLines(prefix,s){const lines=s.split('\n');if(lines.length>1&&lines.at(-1)==='')lines.pop();return lines.map(l=>prefix+' '+l).join('\n');}
function describeAction(a){
  if(a.tool==='edit_workspace_file'&&a.kind==='replace')return 'Proposed change to '+a.path+' (line '+a.line+'):\n'+showLines('-',a.old_text)+'\n'+showLines('+',a.new_text)+'\nEverything else in the file stays exactly as it is.';
  if(a.tool==='edit_workspace_file'&&a.kind==='create')return 'Proposed new file '+a.path+' ('+a.bytes+' bytes):\n'+showLines('+',a.content);
  if(a.tool==='install_dependencies')return 'Proposed dependency install (sandboxed, network to the npm registry only for this step, install scripts blocked):\n  '+a.command+'\nin '+a.workspace;
  if(a.tool==='call_service')return 'Proposed request to your local service:\n  '+a.method+' '+a.url+(a.body?'\n  body: '+a.body.slice(0,2000):'');
  if(a.tool==='run_workspace_command')return 'Proposed command (sandboxed: project folder writable, no network, rest of the computer hidden or read-only, '+(SANDBOX_TIMEOUT_MS/1000)+'s limit):\n  '+a.command+'\nin '+a.workspace;
  return JSON.stringify(a,null,2);
}


// Presentation only. Execution retains the original action and its CAS preimage.
// Untrusted file/model text must never emit terminal control sequences.
function actionPreview(action,{columns=80,tty=false}={}){
  const safe=s=>String(s??'').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,c=>c==='\n'?'\n':'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  const text=safe(describeAction(action));
  if(!tty||!Number.isFinite(columns)||columns<24)return text;
  const width=Math.max(20,Math.min(100,Math.floor(columns)-2));
  // ASCII framing avoids relying on terminal box-drawing support. Do not clip
  // or truncate approval content. Long lines wrap naturally in the terminal.
  const edge='+'+'-'.repeat(width-2)+'+';
  return edge+'\n| REVIEW PROPOSED ACTION\n'+text.split('\n').map(line=>'| '+line).join('\n')+'\n| Nothing changes until you approve.\n'+edge;
}

async function approvedLocalScan(root,approve){
  const blocked=reason=>({schema:'xiio.cli.local-scan/v1',state:'BLOCKED',reason,effect_authority:0});
  const command="python3 -I scripts/local_scan.py . (validated SDK source snapshot)";
  if(typeof approve!=='function'||!await approve({tool:'run_workspace_command',command,workspace:root}))return blocked('HUMAN_APPROVAL_REQUIRED');
  const sb=sandboxState();if(!sb.ok)return blocked(sb.reason);
  const broad=sandboxRefusal(root);if(broad)return blocked(broad);
  const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const runScanner=source=>spawnSync(sb.bwrap,sandboxArgs(root,'python3 -I -c '+quote(source)+' .'),{cwd:root,encoding:'utf8',timeout:SANDBOX_TIMEOUT_MS,maxBuffer:16*1024*1024,env:{PATH:process.env.PATH||'/usr/bin:/bin'}});
  return localScan(root,{runScanner,readArtifact:rel=>readWorkspaceText(root,rel)});
}

async function executeTool(name,args,{root,approve}){
  const safe=(p)=>{
    if(!within(root,p))throw new Error('PATH_OUTSIDE_WORKSPACE');
    const target=path.resolve(root,p);let ancestor=target;
    while(!fs.existsSync(ancestor)){
      // A dangling symlink is not an absent, safe destination.
      try{if(fs.lstatSync(ancestor).isSymbolicLink())throw new Error('SYMLINK_OUTSIDE_WORKSPACE');}catch(e){if(e.code!=='ENOENT')throw e;}
      ancestor=path.dirname(ancestor);
    }
    const real=fs.realpathSync(ancestor);
    if(!within(fs.realpathSync(root),real))throw new Error('SYMLINK_OUTSIDE_WORKSPACE');
    if(credentialPath(target)||credentialPath(real))throw new Error('CREDENTIAL_PATH_REFUSED');
    return target;
  };
  const confirm=async(action)=>{
    if(typeof approve!=='function'||!await approve(action))throw new Error('HUMAN_APPROVAL_REQUIRED');
  };
  if(name==='local_scan')return approvedLocalScan(root,approve);
  if(name==='cross_ux_triage')return crossUxTriage(root,{terms:args?.terms?args.terms.split(','):undefined,maxFiles:args?.max_files?Number(args.max_files):4000,allowPath:p=>!credentialPath(p),readArtifact:rel=>readWorkspaceText(root,rel)});
  if(name==='list_workspace'){
    const rel=String(args?.path||'.');const dir=safe(rel);
    return {path:rel,entries:fs.readdirSync(dir,{withFileTypes:true}).filter(x=>!credentialPath(path.join(dir,x.name))).slice(0,200).map(x=>({name:x.name,type:x.isDirectory()?'dir':x.isSymbolicLink()?'link':'file'}))};
  }
  if(name==='search_workspace'){
    const q=String(args?.query||'').trim();if(!q)throw new Error('QUERY_REQUIRED');
    const matches=[];
    walkWorkspace(root,(abs)=>{
      let st;try{st=fs.statSync(abs);}catch{return;}if(st.size>2*1024*1024)return;
      let buf;try{buf=fs.readFileSync(abs);}catch{return;}if(buf.includes(0))return;
      const lines=buf.toString('utf8').split('\n');
      for(let i=0;i<lines.length;i++)if(lines[i].includes(q)){matches.push(path.relative(root,abs).split(path.sep).join('/')+':'+(i+1)+':'+lines[i].slice(0,300));if(matches.length>=100)return false;}
    });
    return {query:q,matches};
  }
  if(name==='read_workspace_file'||name==='resolve_registry'){
    const rel=String(args?.path||'');if(!rel)throw new Error('PATH_REQUIRED');const p=safe(rel);
    let read,reference=null;
    try{read=readWorkspaceText(root,rel);}
    catch(error){
      const fragment=/^(.*\.md)#([^#]+)$/i.exec(rel);
      if(error?.code!=='ENOENT'||name!=='read_workspace_file'||!fragment)throw error;
      safe(fragment[1]);read=readWorkspaceText(root,fragment[1]);
      reference={kind:'markdown_fragment',resolved_path:fragment[1],fragment:fragment[2],
        section_verified:false,note:'The full containing file was read. Locate and verify the section in its content; this reference is not proof the section exists.'};
    }
    const {buf,text}=read;
    return {path:rel,...(reference?{reference}:{}),content:text.slice(0,120000),sha256:sha256(buf),byte_length:buf.length,
      full_content_returned:text.length<=120000,bins_version_qualified:false};
  }
  if(name==='git_status'){
    // Git status may invoke content-conversion filters even with hooks disabled.
    // Resolve normal system/global/local/includes, but return no config values.
    const filters=readOnlyGit(['config','--includes','--null','--name-only','--get-regexp','^filter\\..*\\.(clean|smudge|process)$'],{cwd:root});
    if(filters.status===0)throw new Error('EXTERNAL_GIT_FILTER_CONFIGURED');
    if(filters.status!==1)throw new Error('GIT_CONFIG_INSPECTION_FAILED');
    const observed={branch:readOnlyGit(['branch','--show-current'],{cwd:root}),status:readOnlyGit(['status','--short','--ignore-submodules=all'],{cwd:root}),head:readOnlyGit(['rev-parse','--verify','--quiet','HEAD'],{cwd:root})};
    // Exit status is evidence; stdout alone cannot establish a successful read.
    // Do not expose stderr/error strings, which can carry repository secrets.
    const checks=Object.fromEntries(Object.entries(observed).map(([key,r])=>[key,{status:r.status,signal:r.signal,error_present:!!r.error,stderr_present:!!r.stderr}]));
    // A new repository has no commit yet: --verify --quiet exits exactly 1 with
    // no output. Every other non-zero result (128 = not a repository) still fails.
    const h=observed.head,unborn=h.status===1&&!h.signal&&!h.error&&!h.stdout;
    if(Object.entries(observed).some(([key,r])=>!(key==='head'&&unborn)&&(r.status!==0||r.signal||r.error)))return {state:'FAIL',reason:'GIT_INSPECTION_FAILED',submodule_contents:'NOT_INSPECTED',checks};
    return {submodule_contents:'NOT_INSPECTED',branch:observed.branch.stdout,status:observed.status.stdout,head:unborn?null:observed.head.stdout,head_state:unborn?'UNBORN_NO_COMMITS':'COMMITTED',checks};
  }
  if(name==='list_registries'){
    const files=[];const re=/(ack|registry|current)/i;
    walkWorkspace(root,(abs)=>{const b=path.basename(abs);if(re.test(b)||b.toLowerCase()==='manifest.json'){files.push('./'+path.relative(root,abs).split(path.sep).join('/'));if(files.length>=200)return false;}});
    return {files:files.sort()};
  }
  if(name==='edit_workspace_file'){
    const rel=String(args?.path||'');if(!rel)throw new Error('PATH_REQUIRED');const p=safe(rel);
    if(path.relative(root,p).split(path.sep)[0]==='.git')throw new Error('GIT_INTERNALS_EDIT_REFUSED');
    const hasReplace=args?.old_text!==undefined;
    if(!fs.existsSync(p)){
      if(hasReplace)throw new Error('FILE_NOT_FOUND: give path and content to create a new file');
      if(args?.expected_sha256)throw new Error('FILE_NOT_FOUND_EXPECTED_EXISTING');
      const content=String(args?.content??'');const bytes=Buffer.from(content,'utf8');
      await confirm({tool:name,kind:'create',path:rel,bytes:bytes.length,content});
      safe(rel);
      fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes,{flag:'wx'});
      const back=fs.readFileSync(p);
      return {path:rel,created:true,bytes:back.length,sha256:sha256(back),readback_matches:back.equals(bytes),readback:back.toString('utf8').slice(0,4000)};
    }
    const st=fs.lstatSync(p);
    if(!st.isFile())throw new Error('NOT_A_REGULAR_FILE');
    if(st.nlink>1)throw new Error('HARDLINK_WRITE_REFUSED');
    if(!hasReplace)throw new Error('WHOLE_FILE_REWRITE_REFUSED: to change an existing file give old_text copied exactly from it and new_text');
    const {buf,text}=readText(p);
    const oldText=String(args.old_text);const newText=String(args?.new_text??'');
    const expectedSha=args?.expected_sha256==null?'':String(args.expected_sha256);
    if(expectedSha&&!/^[0-9a-f]{64}$/.test(expectedSha))throw new Error('EDIT_EXPECTED_SHA256_INVALID');
    if(expectedSha&&sha256(buf)!==expectedSha)throw new Error('FILE_EXPECTED_SHA256_MISMATCH');
    if(!oldText)throw new Error('OLD_TEXT_REQUIRED');
    const at=text.indexOf(oldText);
    if(at<0)throw new Error('OLD_TEXT_NOT_FOUND: read the file again and copy old_text exactly');
    if(text.indexOf(oldText,at+1)>=0)throw new Error('OLD_TEXT_NOT_UNIQUE: include more surrounding text');
    const prefix=Buffer.from(text.slice(0,at),'utf8');const suffix=Buffer.from(text.slice(at+oldText.length),'utf8');
    const next=Buffer.concat([prefix,Buffer.from(newText,'utf8'),suffix]);
    await confirm({tool:name,kind:'replace',path:rel,line:lineOf(text,at),old_text:oldText,
      new_text:newText,expected_sha256:expectedSha||sha256(buf),
      bins_version_qualified:false});
    safe(rel);
    // Locally serialize competing XI-IO editors without minting a BINS lease.
    // Even an approved edit fails closed if its entire source snapshot moved.
    const receipt=commitWorkspaceEditCAS({file:p,expectedBytes:buf,nextBytes:next,
      expectedSha256:expectedSha||sha256(buf)});
    const back=fs.readFileSync(p);
    const preserved=back.subarray(0,prefix.length).equals(prefix)&&back.subarray(back.length-suffix.length).equals(suffix);
    return {...receipt,path:rel,line:lineOf(text,at),
      bytes_outside_change_preserved:preserved,
      readback_matches:receipt.readback_matches&&back.equals(next),
      remote_execution_qualified:false};
  }
  if(name==='run_workspace_command'){
    const command=String(args?.command||'').trim();if(!command)throw new Error('COMMAND_REQUIRED');
    const sb=sandboxState();
    if(!sb.ok)throw new Error(sb.reason+(sb.detail?': '+sb.detail:''));
    const broad=sandboxRefusal(root);if(broad)throw new Error(broad);
    await confirm({tool:name,command,workspace:root});
    const r=spawnSync(sb.bwrap,sandboxArgs(root,command),{cwd:root,encoding:'utf8',timeout:SANDBOX_TIMEOUT_MS,maxBuffer:16*1024*1024,env:{PATH:process.env.PATH||'/usr/bin:/bin'}});
    return {sandbox:'bubblewrap',network:'none',status:r.status,signal:r.signal||null,timed_out:r.error?.code==='ETIMEDOUT',stdout:String(r.stdout||'').slice(0,120000),stderr:String(r.stderr||'').slice(0,30000)};
  }
  if(name==='install_dependencies'){
    // The one networked action: install exactly what the project's lockfile
    // pins, so builds and tests can run. Sandboxed (project writable only),
    // install scripts blocked, human approval required. No other command gets
    // network.
    const sb=sandboxState();if(!sb.ok)throw new Error(sb.reason+(sb.detail?': '+sb.detail:''));
    const broad=sandboxRefusal(root);if(broad)throw new Error(broad);
    if(!fs.existsSync(path.join(root,'package-lock.json')))throw new Error('LOCKFILE_REQUIRED: only npm projects with package-lock.json are supported');
    const command='npm ci --ignore-scripts --no-audit --no-fund';
    await confirm({tool:name,command,workspace:root});
    const r=spawnSync(sb.bwrap,sandboxArgs(root,command,{network:true}),{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024,env:{PATH:process.env.PATH||'/usr/bin:/bin'}});
    return {sandbox:'bubblewrap',network:'npm registry via lockfile only',command,status:r.status,timed_out:r.error?.code==='ETIMEDOUT',stdout:String(r.stdout||'').slice(-8000),stderr:String(r.stderr||'').slice(-8000)};
  }
  if(name==='list_services'){
    return {services:serviceTargets().map(t=>({service:t.id,class:t.class,base:t.base,health_path:t.probe_path,access:t.access,verified:t.verified})),note:'Being listed is not permission: only declared health endpoints are available until current service identity is independently bound.'};
  }
  if(name==='call_service'){
    // Your own XI-IO services on this machine, from config/service-catalog.json.
    // Loopback only, no credentials sent, no shell/exec routes. GET is a read;
    // anything that can change state shows the exact request and needs yes.
    const t=serviceTargets().find(x=>x.id===String(args?.service||''));
    if(!t)throw new Error('UNKNOWN_SERVICE: use list_services');
    const method=String(args?.method||'GET').toUpperCase();
    if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))throw new Error('METHOD_NOT_ALLOWED');
    const rel=String(args?.path||'/');
    if(!rel.startsWith('/')||rel.startsWith('//')||/[\r\n#%\\]/.test(rel))throw new Error('SERVICE_PATH_INVALID');
    const url=new URL(rel,t.base);
    if(url.origin!==new URL(t.base).origin)throw new Error('SERVICE_PATH_INVALID');
    if(SHELL_ROUTE.test(url.pathname))throw new Error('SERVICE_SHELL_ROUTE_REFUSED: remote run/exec/fs routes are not reachable from chat');
    if(t.access==='health'&&!(method==='GET'&&url.pathname+url.search===t.probe_path))throw new Error('SERVICE_ACCESS_NOT_GRANTED: only GET '+t.probe_path+' is allowed for '+t.id+' (current service identity is not independently verified)');
    if(t.access==='read'&&method!=='GET')throw new Error('SERVICE_ACCESS_NOT_GRANTED: '+t.id+' is read-only');
    const body=method==='GET'||method==='DELETE'?undefined:String(args?.body??'');
    // The operator must see EVERY byte before approval. Refuse bodies that
    // would exceed the existing bounded terminal proposal preview.
    if(body!==undefined&&Buffer.byteLength(body,'utf8')>2000)throw new Error('SERVICE_BODY_TOO_LARGE_FOR_EXACT_APPROVAL');
    if(method!=='GET')await confirm({tool:name,method,url:url.href,body:body??''});
    const r=await loopbackRequest(url,method,body);
    return {service:t.id,method,url:url.href,status:r.status,body:r.body.slice(0,20000)};
  }
  throw new Error('UNKNOWN_TOOL:'+name);
}
const SHELL_ROUTE=/\/(run|exec|execute|shell|fs|files?|filesystem|spawn|terminal|cmd|commands?|upload)(\/|$)/i;
function serviceTargets(){
  let c;try{c=loadCatalog();}catch{return [];}
  const out=[];
  for(const s of c.services||[]){
    if(!s.probe||s.id==='ollama')continue;
    let u;try{u=new URL(s.probe);}catch{continue;}
    if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.username||u.password||u.hash||/%/.test(u.pathname))continue;
    // A catalog entry is a discovery map, never access by itself. Default access
    // is the declared health probe only. Broad local routes remain unavailable
    // until an independent current service-instance adapter is bound.
    // Stored owner intent is not a current service-instance identity proof.
    const access='health';
    out.push({id:s.id,class:s.class||null,base:u.origin+'/',probe_path:u.pathname+u.search,access,verified:s.verified??'UNKNOWN'});
  }
  return out;
}
function loopbackRequest(url,method,body){
  return new Promise((resolve,reject)=>{
    const client=url.protocol==='https:'?https:http;
    const req=client.request(url,{method,timeout:15000,rejectUnauthorized:true,headers:{accept:'application/json,text/plain,*/*',...(body!==undefined?{'content-type':'application/json','content-length':Buffer.byteLength(body)}:{})}},res=>{
      const chunks=[];let size=0;
      res.on('data',c=>{size+=c.length;if(size>1048576){req.destroy(new Error('SERVICE_RESPONSE_TOO_LARGE'));return;}chunks.push(Buffer.from(c));});
      res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('timeout',()=>req.destroy(new Error('SERVICE_TIMEOUT')));
    req.on('error',e=>reject(new Error('SERVICE_UNREACHABLE: '+e.message)));
    if(body!==undefined)req.write(body);
    req.end();
  });
}
const REQUIRED_TOOL_FIELDS={search_workspace:['query'],read_workspace_file:['path'],resolve_registry:['path'],edit_workspace_file:['path'],run_workspace_command:['command'],call_service:['service']};
function ollamaTools(){
  const defs={
    list_workspace:{path:{type:'string'}},search_workspace:{query:{type:'string'}},read_workspace_file:{path:{type:'string'}},
    git_status:{},list_registries:{},resolve_registry:{path:{type:'string'}},
    local_scan:{},cross_ux_triage:{terms:{type:'string'},max_files:{type:'string'}},
    edit_workspace_file:{path:{type:'string'},old_text:{type:'string'},new_text:{type:'string'},content:{type:'string'},expected_sha256:{type:'string'}},
    run_workspace_command:{command:{type:'string'}},install_dependencies:{},
    list_services:{},call_service:{service:{type:'string'},method:{type:'string'},path:{type:'string'},body:{type:'string'}}
  };
  return toolCatalog().map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:{type:'object',properties:defs[t.name],required:REQUIRED_TOOL_FIELDS[t.name]||[],additionalProperties:false}}}));
}
// Text resembling a call is not a call. Earlier real tool outcomes still count.
const TOOL_NAMES=['local_scan','cross_ux_triage','ibal_balance','list_workspace','search_workspace','read_workspace_file','git_status','list_registries','resolve_registry','edit_workspace_file','run_workspace_command','run_xiio_command','runtime_status'];
function looksLikeToolCall(text){
  const t=String(text||'');
  if(TOOL_NAMES.some(n=>new RegExp(n+'\\s*\\(\\s*\\{').test(t)||new RegExp('"(name|function|tool)"\\s*:\\s*"'+n+'"').test(t)))return true;
  const m=t.match(/[{[][\s\S]*[}\]]/);if(!m)return false;
  try{const j=JSON.parse(m[0]);const o=Array.isArray(j)?j[0]:j;return !!o&&typeof o==='object'&&(('name' in o&&('arguments' in o||'parameters' in o))||'tool_calls' in o||'function_call' in o);}catch{return false;}
}
// Provider prose is never an execution receipt. Both consumer paths and /read
// render the same host-observed results; failures never erase earlier facts.
const MAX_NATIVE_CALLS=8;
const isRecord=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const meaningfulReply=(value)=>typeof value==='string'&&value.trim()!==''&&!/^(null|undefined)$/i.test(value.trim());
function providerMessage(body){
  if(!isRecord(body)||body.error!==undefined||!isRecord(body.message))throw new Error('PROVIDER_ENVELOPE_INVALID');
  const msg=body.message;
  if(msg.role!=='assistant'||typeof msg.content!=='string'||(body.done!==undefined&&body.done!==true))throw new Error('PROVIDER_MESSAGE_INVALID');
  if(msg.tool_calls!==undefined&&(!Array.isArray(msg.tool_calls)||msg.tool_calls.length>MAX_NATIVE_CALLS))throw new Error('PROVIDER_TOOL_CALLS_INVALID');
  return msg;
}
function validateToolArgs(name,args){
  const def=ollamaTools().find(t=>t.function.name===name)?.function.parameters;
  if(!def)throw new Error('UNKNOWN_TOOL');
  if(!isRecord(args)||Object.keys(args).some(k=>!Object.hasOwn(def.properties,k)||typeof args[k]!=='string'))throw new Error('TOOL_ARGUMENTS_INVALID');
  const required=REQUIRED_TOOL_FIELDS;
  if((required[name]||[]).some(k=>typeof args[k]!=='string'||!args[k].trim()))throw new Error('TOOL_REQUIRED_ARGUMENT_MISSING');
  if(name==='edit_workspace_file'){
    if(args.old_text!==undefined){if(!args.old_text||typeof args.new_text!=='string')throw new Error('EDIT_REPLACEMENT_INVALID');}
    else if(typeof args.content!=='string')throw new Error('EDIT_CONTENT_REQUIRED');
  }
  return args;
}
function nativeCalls(msg){
  // Validate the ENTIRE batch before executing any part of it.
  return (msg.tool_calls||[]).map(call=>{
    if(!isRecord(call)||!isRecord(call.function)||(call.type!==undefined&&call.type!=='function')||typeof call.function.name!=='string')throw new Error('PROVIDER_TOOL_CALL_INVALID');
    let args=call.function.arguments;
    if(typeof args==='string'){try{args=JSON.parse(args);}catch{throw new Error('TOOL_ARGUMENT_JSON_INVALID');}}
    return {name:call.function.name,args:validateToolArgs(call.function.name,args)};
  });
}
function executionFact(name,args,result){
  let state='SUCCEEDED',reason=null;
  if(!toolCatalog().some(t=>t.name===name)||!isRecord(result)){state='FAILED';reason='TOOL_RESULT_INVALID';}
  else if(['local_scan','cross_ux_triage','ibal_balance'].includes(name)){
    const expected={local_scan:['xiio.cli.local-scan/v1','LOCAL_STATIC_OBSERVED'],cross_ux_triage:['xiio.cli.cross-ux-triage/v1','OBSERVED'],ibal_balance:['xiio.cli.ibal-balance/v1','INFORMATIONAL_DONOR']}[name];
    if(result.schema!==expected[0]||result.state!==expected[1]||result.effect_authority!==0||(name==='local_scan'&&(result.closure_credit!==false||result.live_authority!==false||result.producer?.bytes_verified!==true||result.receipt?.status!==result.status||result.receipt?.local_static_pass!==result.local_static_pass))){state='FAILED';reason=result.reason||'LOCAL_OPERATION_NOT_QUALIFIED';}
    else if(name==='local_scan'&&result.local_static_pass!==true){state='PARTIAL';reason=result.status;}
  }
  else if(result.state==='FAIL'){state='FAILED';reason=typeof result.reason==='string'?result.reason:'TOOL_FAILED';}
  else if(result.state==='PARTIAL'){state='PARTIAL';reason='TOOL_REPORTED_PARTIAL';}
  else if(result.state!==undefined&&!(name==='edit_workspace_file'&&result.state==='LOCAL_CAS_COMMITTED')){state='FAILED';reason='TOOL_STATE_UNQUALIFIED';}
  else if(name==='run_workspace_command'||name==='install_dependencies'){
    if(result.status!==0||result.timed_out!==false||result.signal||typeof result.stdout!=='string'||typeof result.stderr!=='string'){state='FAILED';reason=result?.timed_out?'TOOL_TIMED_OUT':'TOOL_EXIT_NOT_ZERO';}
  }else if(name==='call_service'){
    if(!Number.isInteger(result.status)||!(result.status>=200&&result.status<300)||['service','method','url','body'].some(k=>typeof result[k]!=='string')){state='FAILED';reason='SERVICE_HTTP_NOT_SUCCESS';}
  }else if(name==='edit_workspace_file'){
    if(result?.readback_matches!==true){state='FAILED';reason='EDIT_READBACK_UNVERIFIED';}
  }else if(name==='read_workspace_file'||name==='resolve_registry'){
    if(typeof result.content!=='string'||result.path!==args.path||typeof result.sha256!=='string'||!/^[a-f0-9]{64}$/.test(result.sha256)||!Number.isSafeInteger(result.byte_length)||result.byte_length<0||typeof result.full_content_returned!=='boolean'){
      state='FAILED';reason='READ_RESULT_INVALID';
    }else if(result.full_content_returned){
      const bytes=Buffer.from(result.content,'utf8');
      if(bytes.length!==result.byte_length||sha256(bytes)!==result.sha256){state='FAILED';reason='READ_RESULT_DIGEST_MISMATCH';}
    }else if(Buffer.byteLength(result.content,'utf8')>result.byte_length){state='FAILED';reason='READ_RESULT_INVALID';}
    else{state='PARTIAL';reason='READ_CONTENT_TRUNCATED';}
  }else{
    const strings=value=>Array.isArray(value)&&value.every(x=>typeof x==='string');
    const valid=name==='list_workspace'?typeof result.path==='string'&&Array.isArray(result.entries)&&result.entries.every(x=>isRecord(x)&&typeof x.name==='string'&&['file','dir','link'].includes(x.type))
      :name==='search_workspace'?typeof result.query==='string'&&strings(result.matches)
      :name==='list_registries'?strings(result.files)
      :name==='list_services'?Array.isArray(result.services)&&result.services.every(x=>isRecord(x)&&typeof x.service==='string')
      :name==='git_status'?typeof result.branch==='string'&&typeof result.status==='string'&&((result.head_state===undefined||result.head_state==='COMMITTED')&&typeof result.head==='string'&&/^[a-f0-9]{40,64}$/.test(result.head)||result.head_state==='UNBORN_NO_COMMITS'&&result.head===null)
      :false;
    if(!valid){state='FAILED';reason='TOOL_RESULT_INVALID';}
  }
  return {name,arguments:args,state,reason,result};
}
async function executeObservedTool(name,args,context){
  let result;
  try{result=await executeTool(name,args,context);}catch(error){result={state:'FAIL',reason:error instanceof Error?error.message:'TOOL_FAILED'};}
  return executionFact(name,args,result);
}
function toolFallbackText(results,{text='',error=null,source='provider'}={}){
  const firstFailed=results.find(r=>r.state==='FAILED');
  const firstPartial=results.find(r=>r.state==='PARTIAL');
  const firstRed=results.find(r=>r.reason)?.reason||error||null;
  const state=firstFailed?'FAILED':error?(results.length?'PARTIAL':'FAILED'):firstPartial?'PARTIAL':results.length?'TOOL_RESULTS_RECORDED':'NO_TOOL_EXECUTION';
  const receipt={schema:'xiio.cli.execution-return/v1',source,state,first_red:firstRed,provider_error:error,
    request_fulfillment:'NOT_EVALUATED',tool_results:results};
  // JSON escapes terminal-control bytes and preserves exact returned strings.
  // A successful read is evidence of that read, not acceptance of requested
  // formatting (for example, a request for only the first ten lines).
  return {text:'Actual execution receipt (CLI-observed, not model claims):\n'+JSON.stringify(receipt,null,2)
    +(results.length?'':'\nNo tools were executed.')
    +(meaningfulReply(text)?'\nModel reply (unverified narrative; not an execution receipt):\n'+text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')):''),
    fake_tool_call:false,receipt};
}
function finishToolTurn(messages,results,{text='',error=null,source='provider'}={}){
  if(!error&&!meaningfulReply(text)&&source==='provider')error='MODEL_ANSWER_EMPTY_OR_NULL';
  if(!error&&looksLikeToolCall(text))error='MODEL_TEXT_IS_NOT_A_TOOL_CALL';
  const answer=toolFallbackText(results,{text,error,source});
  // Preserve the terminal outcome in this in-memory conversation, not a claim
  // that a failed/empty/no-tool turn completed the user's task.
  messages.push({role:'assistant',content:answer.text});
  return answer;
}
function projectModelHistory(convo){
  const prefix='Actual execution receipt (CLI-observed, not model claims):\n';
  const marker='\nModel reply (unverified narrative; not an execution receipt):\n';
  return convo.map(message=>{
    if(message.role!=='assistant'||typeof message.content!=='string'||!message.content.startsWith(prefix))return message;
    try{
      const rest=message.content.slice(prefix.length),split=rest.indexOf(marker);
      const raw=(split<0?rest:rest.slice(0,split)).replace(/\nNo tools were executed\.$/,'');
      const receipt=JSON.parse(raw);
      if(receipt.schema!=='xiio.cli.execution-return/v1'||!Array.isArray(receipt.tool_results))return message;
      const summary={schema:'xiio.cli.prior-execution-context/v1',state:receipt.state,first_red:receipt.first_red,
        full_receipt_retained_in_session:true,not_execution_authority:true,
        tool_results:receipt.tool_results.map(f=>({name:f.name,state:f.state,reason:f.reason,path:f.arguments?.path,
          sha256:f.result?.sha256,byte_length:f.result?.byte_length,full_content_returned:f.result?.full_content_returned,
          branch:f.result?.branch,head:f.result?.head,head_state:f.result?.head_state})),
        note:'Historical observation metadata, not current file contents. Read current files when contents are needed.'};
      return {...message,content:JSON.stringify(summary)+(split<0?'':marker+rest.slice(split+marker.length))};
    }catch{return message;}
  });
}
function modelToolResult(fact){
  const result=fact.result;
  if(fact.name==='git_status'&&typeof result?.status==='string'){
    const lines=result.status.split('\n'),entries=lines.filter(line=>line.trim().length>0);
    return JSON.stringify({...result,status:lines.slice(0,20).join('\n'),status_entry_count:entries.length,working_tree_clean:entries.length===0,
      model_status_projection_truncated:lines.length>20,note:'working_tree_clean is computed from the complete Git result. A false value means changes exist. Only the first 20 status lines are shown to the model; the full observation remains in the receipt. Repeating git_status will not reveal omitted lines.'});
  }
  return JSON.stringify(result);
}
async function providerReply(convo,{model,mode,signal,answerOnly=false}){
  const res=await fetch('http://127.0.0.1:11434/api/chat',{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(answerOnly?60000:300000)]):AbortSignal.timeout(answerOnly?60000:300000),method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:projectModelHistory(convo),stream:false,options:LOCAL_TOOL_INFERENCE_OPTIONS,...(answerOnly?{format:{type:'object',properties:{tool:{type:'string',enum:['answer']},text:{type:'string',minLength:1}},required:['tool','text'],additionalProperties:false}}:mode==='native'?{tools:ollamaTools()}:{format:structuredSchema()})})});
  if(!res.ok)throw new Error('OLLAMA_HTTP_'+res.status);
  return providerMessage(await res.json());
}
// Structured tool mode (default). Small local models are unreliable at free-form
// tool calling: they invent tool names, wrap calls in prose, or loop. Ollama's
// `format` requests one real tool or an answer. A provider can still violate
// that schema; the CLI validates every returned action and field
// and every edit/command still needs the human's yes. XIIO_TOOL_MODE=native keeps
// the old provider tool-calling path.
const STRUCTURED_TOOLS=['local_scan','cross_ux_triage','list_workspace','search_workspace','read_workspace_file','git_status','list_registries','resolve_registry','edit_workspace_file','run_workspace_command','install_dependencies','list_services','call_service'];
const STRUCTURED_FIELDS=['max_files','terms','path','query','content','old_text','new_text','expected_sha256','command','service','method','body','text'];
function structuredSchema(){
  // One action has one argument shape. Requiring every tool's fields made real
  // models place filenames in unrelated fields and emit an empty required path.
  const variants=[];
  const variant=(name,fields,required)=>({type:'object',properties:{
    tool:{type:'string',enum:[name]},
    ...Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,
      required.includes(key)?{...value,minLength:1}:value])),
  },required:['tool',...required],additionalProperties:false});
  for(const {function:tool} of ollamaTools()){
    if(!STRUCTURED_TOOLS.includes(tool.name))continue;
    if(tool.name==='edit_workspace_file'){
      const fields=tool.parameters.properties;
      const creation=variant(tool.name,{path:fields.path,content:fields.content,expected_sha256:fields.expected_sha256},['path','content']);
      delete creation.properties.content.minLength; // An empty new file is valid.
      variants.push(creation);
      const replacement=variant(tool.name,{path:fields.path,old_text:fields.old_text,new_text:fields.new_text,expected_sha256:fields.expected_sha256},['path','old_text','new_text']);
      // Empty replacement is an intentional deletion; the exact old text and
      // displayed approval/readback remain mandatory at the executor boundary.
      delete replacement.properties.new_text.minLength;
      variants.push(replacement);
    }else variants.push(variant(tool.name,tool.parameters.properties,REQUIRED_TOOL_FIELDS[tool.name]||[]));
  }
  variants.push(variant('answer',{text:{type:'string'}},['text']));
  return {oneOf:variants};
}
const STRUCTURED_GUIDE=['Reply ONLY with one JSON action object. Include tool and only the arguments belonging to that tool. Use the actual path or value requested by the user, never a placeholder.',
  'tool="answer": text = your reply to the person. Use it when the task is done or you need to ask something.',
  'list_workspace: path (folder, "." for top). search_workspace: query. read_workspace_file: path. git_status / list_registries: no fields. resolve_registry: path.',
  'edit_workspace_file NEW file: path + content. EXISTING file: read it first, then path + old_text (copied exactly) + new_text + optional expected_sha256 from the read result. Edits fail closed if source bytes changed. Never rewrite a whole existing file.',
  'local_scan: no fields. Requires approval, accepted SDK producer bytes and a sandbox; returns local static observations only. cross_ux_triage: optional comma-separated terms and max_files.',
  'run_workspace_command: command (runs sandboxed in the project, no network).',
  'install_dependencies: no fields. Use it before building or testing an npm project whose node_modules is missing.',
  'list_services: no fields. call_service: service (name from list_services), method, path (starting with /), body (JSON text or ""). Each service only allows what its access says (health = only GET its health_path). Never guess API paths.',
  'Do exactly what the person asked, then STOP and use tool="answer". Never make extra changes nobody asked for.',
  'After each tool you get a TOOL RESULT message. Never claim something happened unless a TOOL RESULT shows it.'].join('\n');
function structuredArgs(d){
  const g=(k)=>typeof d[k]==='string'?d[k]:'';
  switch(d.tool){
    case 'local_scan':return {};
    case 'cross_ux_triage':return {...(g('terms')?{terms:g('terms')}:{}),...(g('max_files')?{max_files:g('max_files')}:{})};
    case 'list_workspace':return {path:g('path')||'.'};
    case 'search_workspace':return {query:g('query')};
    case 'read_workspace_file':case 'resolve_registry':return {path:g('path')};
    case 'edit_workspace_file':return g('old_text')?{path:g('path'),old_text:g('old_text'),new_text:g('new_text'),...(g('expected_sha256')?{expected_sha256:g('expected_sha256')}:{})}:{path:g('path'),content:g('content'),...(g('expected_sha256')?{expected_sha256:g('expected_sha256')}:{})};
    case 'run_workspace_command':return {command:g('command')};
    case 'call_service':return {service:g('service'),method:g('method')||'GET',path:g('path')||'/',body:g('body')};
    default:return {};
  }
}
function structuredAction(msg){
  if(msg.tool_calls?.length)throw new Error('STRUCTURED_NATIVE_CALLS_UNEXPECTED');
  let d;try{d=JSON.parse(msg.content);}catch{throw new Error('MODEL_REPLY_NOT_A_VALID_ACTION');}
  if(!isRecord(d)||typeof d.tool!=='string'||!(d.tool==='answer'||STRUCTURED_TOOLS.includes(d.tool)))throw new Error('MODEL_REPLY_NOT_A_VALID_ACTION');
  if(Object.keys(d).some(k=>k!=='tool'&&(!STRUCTURED_FIELDS.includes(k)||typeof d[k]!=='string')))throw new Error('STRUCTURED_FIELD_INVALID');
  if(d.tool==='answer'){
    if(!meaningfulReply(d.text))throw new Error('MODEL_ANSWER_EMPTY_OR_NULL');
    return {name:'answer',text:d.text.trim()};
  }
  // Fields are checked before projection; wrong types are never silently erased.
  const args=structuredArgs(d);
  if(d.tool==='edit_workspace_file'){
    if(d.old_text){if(typeof d.new_text!=='string')throw new Error('EDIT_REPLACEMENT_INVALID');}
    else if(typeof d.content!=='string')throw new Error('EDIT_CONTENT_REQUIRED');
  }
  return {name:d.tool,args:validateToolArgs(d.tool,args)};
}
function createNoProgressGuard() {
    const counts = new Map();
    let previousKey = null;
    const read_workspace_file = new Set(['read_workspace_file','resolve_registry','git_status','list_workspace','search_workspace','list_registries','list_services']);

    return function observe(fact) {
        if (!read_workspace_file.has(fact.name)) {
            counts.clear();
            previousKey = null;
            return false;
        }

        const sortedEntries = Object.entries(fact.arguments).sort((a, b) => a[0].localeCompare(b[0]));
        const key = JSON.stringify([fact.name, sortedEntries, fact.result]);
        if(key !== previousKey) counts.clear();
        previousKey = key;
        const n = (counts.get(key) || 0) + 1;
        counts.set(key, n);

        return n >= 3;
    };
}
async function finishNoProgressTurn(messages,convo,results,{model,signal}){
  if(signal?.aborted)return finishToolTurn(messages,results,{error:'USER_CANCELLED'});
  const originalTask=[...messages].reverse().find(m=>m.role==='user')?.content||'';
  const finalConvo=[...convo,{role:'user',content:'The CLI observed three identical read-only results and stopped further tool calls. Return only an answer using the recorded evidence. Do not claim unverified completion. If the next task is unknown, say so. Original task: '+originalTask}];
  try{
    const reply=await providerReply(finalConvo,{model,mode:'structured',signal,answerOnly:true});
    const action=structuredAction(reply);
    if(action.name!=='answer')return finishToolTurn(messages,results,{error:'NO_PROGRESS_FINAL_ANSWER_REQUIRED'});
    const unfulfilled=unmetLocalWork(localWorkRequirement(messages),results)||!responseRealization(action.text,results).pass;
    return finishToolTurn(messages,results,{text:action.text,...(unfulfilled?{error:'REQUESTED_ACTION_NOT_EXECUTED'}:{})});
  }catch(error){return finishToolTurn(messages,results,{error:error instanceof Error?error.message:'NO_PROGRESS_FINAL_ANSWER_FAILED'});}
}
function localWorkRequirement(messages){
  const task=String([...messages].reverse().find(m=>m.role==='user')?.content||'').trim();
  if(!task)return null;
  // Adopt the SDK projection as meaning only. It grants no effect authority.
  const projection=compileCommandIntentProjection(task,{workspaceIdentityState:'bound'});
  if(projection.reason!=='current_turn_meaning_projection')return null;
  const hasDirective=projection.intent?.directives?.some(row=>row.kind==='DIRECTIVE');
  if(!projection.allowWrite&&!projection.allowTerminal&&!hasDirective)return null;
  return {kind:[...(projection.allowWrite?['change']:[]),...(projection.allowTerminal?['execute']:[])].join(' and ')||'inspect',task,
    requireWrite:projection.allowWrite,requireTerminal:projection.allowTerminal,commands:projection.command_requirements,
    meaning_ref:projection.intent.raw_ref,authority_granted:false};
}
function responseRealization(text,results){
  return evaluateAgentResponseRealization({responseText:text,
    observedToolCalls:results.filter(f=>f.state==='SUCCEEDED').map(f=>f.name),
    availableToolNames:toolCatalog().map(t=>t.name),
    writeToolNames:['edit_workspace_file','run_workspace_command','install_dependencies'],
    issuedPolicyReasons:results.filter(f=>f.reason).map(f=>f.reason)});
}
function unmetLocalWork(requirement,results){
  if(!requirement)return false;
  if(results.some(f=>f.state==='FAILED'||f.state==='PARTIAL'))return false;
  const ok=results.filter(f=>f.state==='SUCCEEDED');
  if(requirement.requireWrite&&!ok.some(f=>f.name==='edit_workspace_file'))return true;
  if(requirement.requireTerminal){
    const commands=ok.filter(f=>f.name==='run_workspace_command');
    if(!commands.length)return true;
    if(requirement.commands?.state==='RESOLVED'){
      const used=new Set();
      for(const expected of requirement.commands.obligations){
        const index=commands.findIndex((fact,i)=>{
          if(used.has(i))return false;
          const actual=compileCommandIntentProjection('Run '+fact.arguments.command,{workspaceIdentityState:'bound'}).command_requirements;
          return actual?.state==='RESOLVED'&&actual.obligations.length===1&&actual.obligations[0].command===expected.command
            &&JSON.stringify(actual.obligations[0].args)===JSON.stringify(expected.args)
            &&expected.expected_result?.kind==='EXIT_CODE'&&fact.result.status===expected.expected_result.exit_code;
        });
        if(index<0)return true;used.add(index);
      }
    }
  }
  return !requirement.requireWrite&&!requirement.requireTerminal&&ok.length===0;
}
function localRecoveryMessage(requirement){return 'The user requested '+requirement.kind+' work, but the recorded tool results do not establish that action. Use the appropriate tool now, within existing permissions and approval. Do not merely promise future work. If you cannot proceed, state the exact missing prerequisite. Do not invent task status or permission. Original request: '+requirement.task;}
async function ollamaChatStructured(messages,{model,root,approve,signal,onProgress=()=>{}}){
  const convo=[...messages],results=[],noProgress=createNoProgressGuard(),requirement=localWorkRequirement(messages);let recovered=false;
  if(convo[0]?.role==='system')convo[0]={...convo[0],content:convo[0].content+'\n'+STRUCTURED_GUIDE};
  for(let turn=0;turn<12;turn++){
    let msg,action;
    try{msg=await providerReply(convo,{model,mode:'structured',signal});action=structuredAction(msg);}
    catch(error){return finishToolTurn(messages,results,{error:error instanceof Error?error.message:'PROVIDER_REQUEST_FAILED'});}
    convo.push({role:'assistant',content:msg.content});
    if(action.name==='answer'){
      if(looksLikeToolCall(action.text))return finishToolTurn(messages,results,{text:action.text});
      if(unmetLocalWork(requirement,results)||!responseRealization(action.text,results).pass){
        if(recovered)return finishToolTurn(messages,results,{text:action.text,error:'REQUESTED_ACTION_NOT_EXECUTED'});
        recovered=true;convo.push({role:'user',content:requirement?localRecoveryMessage(requirement):'The SDK response check found an unsupported action claim. Use actual tools within current approval or correct the claim. No authority is granted by this feedback.'});continue;
      }
      return finishToolTurn(messages,results,{text:action.text});
    }
    if(signal?.aborted)return finishToolTurn(messages,results,{error:'USER_CANCELLED'});
    onProgress({phase:'TOOL_PENDING',tool:action.name,results});
    const fact=await executeObservedTool(action.name,action.args,{root,approve});
    results.push(fact);onProgress({phase:'TOOL_RETURNED',tool:action.name,results});
    convo.push({role:'user',content:'TOOL RESULT for '+action.name+': '+modelToolResult(fact)});
    if(fact.reason==='HUMAN_APPROVAL_REQUIRED')return finishToolTurn(messages,results,{error:'HUMAN_APPROVAL_REQUIRED'});
    if(noProgress(fact))return finishNoProgressTurn(messages,convo,results,{model,signal});
  }
  return finishToolTurn(messages,results,{error:'TOOL_LOOP_LIMIT'});
}
async function ollamaChat(messages,opts){
  if(String(process.env.XIIO_TOOL_MODE||'structured').toLowerCase()!=='native')return ollamaChatStructured(messages,opts);
  return ollamaChatNative(messages,opts);
}
async function ollamaChatNative(messages,{model,root,approve,signal,onProgress=()=>{}}){
  const convo=[...messages],results=[],noProgress=createNoProgressGuard(),requirement=localWorkRequirement(messages);let recovered=false;
  for(let turn=0;turn<12;turn++){
    let msg,calls;
    try{msg=await providerReply(convo,{model,mode:'native',signal});calls=nativeCalls(msg);}
    catch(error){return finishToolTurn(messages,results,{error:error instanceof Error?error.message:'PROVIDER_REQUEST_FAILED'});}
    if(!calls.length){
      if(!meaningfulReply(msg.content)||looksLikeToolCall(msg.content))return finishToolTurn(messages,results,{text:msg.content.trim()});
      if(unmetLocalWork(requirement,results)||!responseRealization(msg.content,results).pass){
        if(recovered)return finishToolTurn(messages,results,{text:msg.content.trim(),error:'REQUESTED_ACTION_NOT_EXECUTED'});
        recovered=true;convo.push({role:'assistant',content:msg.content},{role:'user',content:requirement?localRecoveryMessage(requirement):'The SDK response check found an unsupported action claim. Use actual tools within current approval or correct the claim. No authority is granted by this feedback.'});continue;
      }
      return finishToolTurn(messages,results,{text:msg.content.trim()});
    }
    // Keep only validated provider fields in the conversation.
    convo.push({role:'assistant',content:msg.content,tool_calls:msg.tool_calls});
    for(const {name,args} of calls){
      if(signal?.aborted)return finishToolTurn(messages,results,{error:'USER_CANCELLED'});
      onProgress({phase:'TOOL_PENDING',tool:name,results});
      const fact=await executeObservedTool(name,args,{root,approve});
      results.push(fact);onProgress({phase:'TOOL_RETURNED',tool:name,results});
      convo.push({role:'tool',tool_name:name,content:modelToolResult(fact)});
      if(fact.reason==='HUMAN_APPROVAL_REQUIRED')return finishToolTurn(messages,results,{error:'HUMAN_APPROVAL_REQUIRED'});
    if(noProgress(fact))return finishNoProgressTurn(messages,convo,results,{model,signal});
    }
  }
  return finishToolTurn(messages,results,{error:'TOOL_LOOP_LIMIT'});
}
// Human-facing views consume existing observations; they do not grant access,
// infer task completion, or change the machine-readable execution receipt.
function humanText(value){return String(value??'').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
function humanCommands(){
  const sb=sandboxState();
  if(sb.ok)return 'Commands and pinned npm dependencies: available in the sandbox, only after your approval.';
  const why={SANDBOX_DISABLED_BY_ENVIRONMENT:'disabled for this session',SANDBOX_UNAVAILABLE_NO_BWRAP:'the required sandbox is not installed',SANDBOX_UNAVAILABLE_NAMESPACES_BLOCKED:'the sandbox could not start'};
  return 'Commands and dependency installs are unavailable here: '+(why[sb.reason]||'this computer has no working supported sandbox')+'. Local file reads and approved edits do not require it.';
}
function humanHelp(model){
  return ['I can read, explain, search, and edit files in this workspace. Try:',
    '  “Read README.md and explain how to use this project.”',
    '  “Find where the launch date is mentioned.”',
    '  “Change the launch date in README.md to 13 November; leave everything else alone.”',
    'I show each edit first and wait for your yes.',
    model?null:'No local model is selected. Use /models, then /model NAME for natural-language work.',
    '/connect runs one configured native broker cycle; it does not register this computer. /read README.md reads a file without a model. /tools shows available actions. /menu shows the choices.'
  ].filter(Boolean).join('\n');
}
function humanTools(){
  return ['Available actions in this workspace:',
    '  • Browse folders, search text, and read text files (credential files stay closed).',
    '  • Inspect the Git branch and changed files; locate and read possible project-rule/current-work files.',
    '  • Create a text file or replace an exact piece of text after you approve the displayed change.',
    '  • Check a configured local health endpoint only; a response does not prove the product is ready. Broader service access is unavailable.',
    humanCommands(),
    'Historical Ibal donor notes: xi-io-cli ibal balance. Informational and unqualified; not a model-callable action.',
    '/tools details shows the technical tool names and full descriptions.'].join('\n');
}
function humanExamples(){
  return ['Tell me what you need, for example:',
    '  “Read README.md and explain how to use this project.”',
    '  “Find every mention of the launch date.”',
    '  “Which files have changed in Git?”',
    '  “Change the launch date in README.md to 13 November; leave everything else alone.”',
    'File names and dates above are examples, not work already done. I read before proposing an edit; it waits for your yes.',
    humanCommands(),
    'For an exact text read without a model: /read PATH. For the last turn’s full evidence: /details.'].join('\n');
}
function humanRegistry(rows,{details=false}={}){
  if(!rows.files.length)return 'I did not find files named like ACK, current, registry or manifest in this workspace. That does not prove there are no project rules. Tell me your task or a known rules file to read.';
  const files=details?rows.files:rows.files.slice(0,10);
  return ['These files may describe project rules or current work. They were found by filename, not read or verified; no binding or permission is established by this search.',
    ...files.map(p=>'  '+humanText(p)),
    ...(files.length<rows.files.length?[String(rows.files.length-files.length)+' more candidates; /ack details lists all discovered paths.']:[]),
    rows.files.length===200?'The search reached its 200-candidate limit; this is not a complete inventory.':null,
    'Tell me what you are working on and I can read the relevant file, or use /read PATH to inspect one directly.'].filter(Boolean).join('\n');
}
function humanDoctor(d,root){
  const lines=['Local setup: '+(d.state==='PASS'?'the reported checks passed':d.state==='PARTIAL'?'not fully verified (PARTIAL)':'readiness unknown ('+humanText(d.state)+')')+'.',
    'Local file work is separate from these service checks. Workspace: '+humanText(root)+'.'];
  const reasons={HOST_PROFILE_UNRESOLVED:'There is no service profile for this computer, so no services were checked.',HOST_PROFILE_AMBIGUOUS:'More than one service profile matches this computer; I did not choose one.',LOCAL_SERVICES_HOST_MISMATCH:'The local service list belongs to another computer and was not accepted.',LOCAL_SERVICES_SCHEMA_INVALID:'The local service list has an unsupported format.',LOCAL_SERVICES_CUSTODY_UNVERIFIED:'The local service list did not pass file type or permission checks.',LOCAL_SERVICES_RECORD_INVALID:'The local service list contains an invalid entry.',LOCAL_SERVICES_UNREADABLE:'The local service list could not be read safely.'};
  if(d.first_red)lines.push(reasons[d.first_red]||'A setup check is unresolved ('+humanText(d.first_red)+').');
  if(!d.services.length&&!d.first_red)lines.push('No services were checked; this is not an all-clear.');
  for(const row of d.services){
    let observation;
    const p=row.probe;
    if(row.state==='HTTP_OBSERVED_UNQUALIFIED')observation='endpoint responded; product health and identity are not verified';
    else if(row.state==='RUNNING_UNPROVEN')observation='service unit is running; this does not confirm product readiness';
    else if(row.state==='STOPPED')observation='catalog candidate service units were found, but none was observed running';
    else if(row.state==='OBSERVATION_INCOMPLETE')observation='catalog candidate checks were incomplete; installation and health remain unknown';
    else if(row.state==='NOT_OBSERVED')observation='no declared catalog candidate was observed; installation and health remain unknown';
    else if(row.state==='PASS')observation='reported checks passed';
    else observation='unverified ('+humanText(row.reason||row.state)+')';
    if(p&&!p.http_observed){
      const why=p.reason==='HEALTH_REDIRECT_REFUSED'?'endpoint redirected; redirect was not followed':p.status?'endpoint returned HTTP '+p.status:p.reason==='HEALTH_TIMEOUT'?'endpoint check timed out':p.reason==='HEALTH_TRANSPORT_UNVERIFIED'?'could not reach the declared endpoint':'endpoint check unverified ('+humanText(p.reason||p.state)+')';
      observation=row.state==='NOT_OBSERVED'?why+'; health unknown':observation+'; '+why;
    }
    lines.push('  • '+humanText(row.id)+': '+observation+'.');
  }
  if(d.unprofiled_candidates.length)lines.push(d.unprofiled_candidates.length+' other catalog entries were not checked.');
  if(d.work_readiness){
    const label=x=>x==='READY'?'ready':x==='OBSERVED_UNQUALIFIED'?'runtime observed, qualification still required':x==='NOT_IN_PROFILE'?'not required by this host profile':'blocked';
    lines.push('Core XI-IO work readiness:');
    lines.push('  • Direct CLI file work: '+label(d.work_readiness.direct_cli_file_work?.state)+'.');
    lines.push('  • Local Ollama work: '+label(d.work_readiness.local_ollama_work?.state)+'.');
    lines.push('  • Ibal agent work: '+label(d.work_readiness.ibal_agent_work?.state)+'.');
    lines.push('  • Remote effects: '+label(d.work_readiness.remote_effect_work?.state)+'.');
  }
  if(d.host_integration_policy?.xiio_core_independent_of_codex_mcp===true)
    lines.push('Codex MCP startup and Codex diagnostic-database health are optional host integrations, not prerequisites for XI-IO core work.');
  lines.push(humanCommands(),'Nothing was changed. /status details shows the full doctor findings.');
  return lines.join('\n');
}
// Presentation only: never change receipts, model context, permissions or saved turns.
function terminalLabel(label,{tty=Boolean(process.stdout.isTTY&&process.stdin.isTTY),env=process.env}={}){
  const codes={YOU:36,IBAL:35,TOOL:34,STATUS:33};
  return tty&&!Object.hasOwn(env,'NO_COLOR')&&env.TERM!=='dumb'
    ? '\x1b[1;'+(codes[label]||37)+'m'+label+'\x1b[0m' : label;
}
function humanToolTurn(answer,{compact=false,color=false}={}){
  const r=answer.receipt,lines=[];
  const heading=label=>terminalLabel(label,{tty:color});
  const labels={local_scan:'Local baseline',cross_ux_triage:'Artifact deduplication',ibal_balance:'Opposite-seat witness guide',list_workspace:'List files',search_workspace:'Search text',read_workspace_file:'Read file',resolve_registry:'Read project record',list_registries:'Find project records',git_status:'Inspect Git',edit_workspace_file:'Change file',run_workspace_command:'Run command',install_dependencies:'Install pinned dependencies',list_services:'List configured services',call_service:'Check service endpoint'};
  const preview=(text)=>{const s=humanText(text);return s.length>4000?s.slice(0,4000)+'\n[Display shortened; /details retains the full returned value.]':s;};
  const reasons={HUMAN_APPROVAL_REQUIRED:'No approval was given, so this action was not performed.',CREDENTIAL_PATH_REFUSED:'Credential files are not accessible.',PATH_OUTSIDE_WORKSPACE:'That path is outside this workspace.',SYMLINK_OUTSIDE_WORKSPACE:'That link leaves the workspace.',BINARY_FILE_REFUSED:'This is not a text file.',NOT_UTF8_TEXT_REFUSED:'This file is not valid UTF-8 text.',NOT_A_REGULAR_FILE:'That path is not a regular file.',MODEL_ANSWER_EMPTY_OR_NULL:'The model did not return a usable answer.',MODEL_TEXT_IS_NOT_A_TOOL_CALL:'The model printed a tool-shaped reply instead of a valid action.',TOOL_LOOP_LIMIT:'The model reached the action limit without a final answer.',REQUESTED_ACTION_NOT_EXECUTED:'The local model did not perform the requested action after one recovery attempt. No completion is claimed.'};
  for(const fact of r.tool_results){
    if(compact)lines.push('\n'+heading('TOOL'));
    const v=fact.result||{},label=labels[fact.name]||'Action',where=v.path||fact.arguments?.path;
    if(v.reference?.kind==='markdown_fragment')lines.push('Opened '+humanText(v.reference.resolved_path)+' for section reference '+humanText(v.reference.fragment)+'. Section existence is not yet verified.');
    if(fact.state==='FAILED'){
      const reason=String(fact.reason||'UNKNOWN');
      lines.push(label+(where?' '+humanText(where):'')+' — failed. '+(reasons[reason]||(reason.startsWith('ENOENT')?'The file was not found.':'The action could not be verified.'))+' ('+humanText(reason)+')');
    }else if(['read_workspace_file','resolve_registry'].includes(fact.name)){
      lines.push('Read '+humanText(v.path)+' ('+v.byte_length+' bytes)'+(fact.state==='PARTIAL'?' — only part of the file was returned.':' — file content returned.')+'\n'+(v.content===''?'[Empty file: 0 bytes.]':compact&&r.source!=='direct_read'?'Content retained. /details shows the returned text.':preview(v.content)));
    }else if(fact.name==='edit_workspace_file')lines.push((v.created?'Created ':'Changed ')+humanText(v.path)+' — written bytes match the readback.'+(v.bytes_outside_change_preserved===true?' Other bytes were preserved.':''));
    else if(fact.name==='list_workspace')lines.push('Files in '+humanText(v.path)+':\n'+preview(v.entries.map(x=>x.name+(x.type==='dir'?'/':'')).join('\n')||'[No entries returned.]'));
    else if(fact.name==='search_workspace')lines.push('Matches for '+humanText(v.query)+':\n'+preview(v.matches.join('\n')||'[No matches returned.]'));
    else if(fact.name==='git_status')lines.push('Git branch: '+humanText(v.branch||'(detached HEAD)')+'\nWorking-tree entries: '+String(v.status.split('\n').filter(line=>line.trim().length>0).length)+'\n'+(compact ? (v.status.trim()?v.status.split('\n').filter(line=>line.trim()).slice(0,5).map(line=>humanText(line)).join('\n')+(v.status.split('\n').filter(line=>line.trim()).length>5?'\n[Showing 5 entries; /details retains all observed entries.]':''):'No working-tree changes reported.') : preview(v.status||'No working-tree changes reported.'))+'\nSubmodule contents were not inspected.');
    else if(fact.name==='list_registries')lines.push(humanRegistry(v));
    else if(fact.name==='list_services')lines.push('Configured service candidates: '+humanText(v.services.map(x=>x.service).join(', ')||'none')+'. Listing is not product health or permission. Only declared health endpoints are available.');
    else if(fact.name==='call_service')lines.push(humanText(v.service)+': endpoint returned HTTP '+v.status+'. Product health, identity and broader permission are not verified.\n'+preview(v.body));
    else if(['local_scan','cross_ux_triage','ibal_balance'].includes(fact.name))lines.push(label+' — '+humanText(v.state)+'. Local observation only; no live, closure or effect authority.\n'+preview(JSON.stringify(v)));
    else if(['run_workspace_command','install_dependencies'].includes(fact.name))lines.push(label+' — process exited with code '+v.status+'.');
    else lines.push(label+' — '+humanText(fact.state)+'.');
    if(['run_workspace_command','install_dependencies'].includes(fact.name)){
      if(typeof v.stdout==='string'&&v.stdout)lines.push('Command output:\n'+preview(v.stdout));
      if(typeof v.stderr==='string'&&v.stderr)lines.push('Command error output:\n'+preview(v.stderr));
    }
  }
  if(compact)lines.push('\n'+heading('STATUS'));
  if(!r.tool_results.length)lines.push('No tools were executed. No project file content was verified. Use /read PATH for an exact read.');
  if(r.provider_error&&!r.tool_results.some(f=>f.reason===r.provider_error))lines.push((r.source==='direct_read'?'The direct read did not complete: ':'The local model turn did not complete: ')+(reasons[r.provider_error]||humanText(r.provider_error))+(reasons[r.provider_error]?'':'.')+(r.tool_results.length?' Earlier tool results above still stand.':''));
  if(r.state==='FAILED'||r.state==='PARTIAL')lines.push('This request did not finish successfully.');
  else if(compact&&r.tool_results.length)lines.push('Tool results recorded. Goal completion is not independently verified.');
  const marker='\nModel reply (unverified narrative; not an execution receipt):\n';
  const at=answer.text.indexOf(marker);
  if(at>=0&&r.state!=='FAILED'&&r.state!=='PARTIAL')lines.push((compact?'\n'+heading('IBAL')+' · explanation, not proof\n':'Model explanation (unverified):\n')+humanText(answer.text.slice(at+marker.length)));
  lines.push('/details shows the full execution receipt and model reply.');
  return lines.join('\n')+(compact?'\n':'');
}

function printMenu({model=null,lastTurn=null,all=false}={}){
  const receipt=lastTurn?.receipt;
  const failed=receipt && ['FAILED','PARTIAL'].includes(receipt.state);
  // Suggestions are projections of observed state, not permission or a planner.
  const preferred=!model?['7','12','13','8']
    :failed?['3','8','12','13','5']
    :receipt?.tool_results?.length?['4','3','13','5']
    :['12','13','4','5','3'];
  const rows=all?MENU:MENU.filter(([n])=>preferred.includes(n));
  process.stdout.write('\n'+(all?'All CLI choices':!model?'Local model setup and file options':failed?'Options after the last incomplete action':receipt?.tool_results?.length?'Options for continuing this project':'Ways to get started')+'\n');
  if(receipt)process.stdout.write('Last observed result: '+humanText(receipt.state)+'. '+(receipt.first_red?'Reason: '+humanText(receipt.first_red)+'. ':'')+'Task completion has not been inferred.\n/details shows the original evidence.\n');
  for(const [n,,label] of rows)process.stdout.write('  '+n+'. '+label+'\n');
  process.stdout.write('Choose a listed number, or keep chatting. /menu all shows every choice.\n');
  return new Set(rows.map(([n])=>n));
}
const MODEL_FILE=path.join(CONFIG_DIR,'model');
function savedModel(){try{return fs.readFileSync(MODEL_FILE,'utf8').trim()||null;}catch{return null;}}
function saveModel(m){try{fs.mkdirSync(CONFIG_DIR,{recursive:true});fs.writeFileSync(MODEL_FILE,m+'\n',{mode:0o600});}catch{}}
function commandLine(){const s=sandboxState();return s.ok?'Commands: run in a sandbox after you approve each one.':'Commands: not available here ('+s.reason+'). Reading and approved edits work.';}
async function interactive(flags,args=[],{showMenu=false}={}){
  const explicit=flags.workspace||args[0]||null;
  const root=workspaceRoot(explicit);
  if(explicit)activate([root],{});
  // One conversation, one mode: every effect is proposed and needs a yes.
  // --execute is still accepted from older launchers and changes nothing.
  const requestedModel=String(flags.model||process.env.XIIO_MODEL||'').trim();
  const models=await modelsCommand('list',[],{engine:'ollama'});
  let names=(models.models||[]).map(x=>x.name);
  const session=loadChatSession(root);
  const remembered=savedModel();
  const sessionModel=session.state==='PASS'&&session.model&&names.includes(session.model)?session.model:null;
  let model=requestedModel||sessionModel||(remembered&&names.includes(remembered)?remembered:null)||names[0]||null;
  let activeTurn=null;
  const rl=createHumanConsole(readline.createInterface({input:process.stdin,output:process.stdout,terminal:Boolean(process.stdin.isTTY&&process.stdout.isTTY)}),process.stdout,{formatPrompt:p=>p==='xi> '?terminalLabel('YOU')+' · '+p:p,onInterrupt:()=>{if(activeTurn){activeTurn.abort(Error('USER_CANCELLED'));process.stdout.write('\nCancellation requested. Completed effects remain recorded.\n');}}});
  const systemMessage={role:'system',content:[
    'You are @ibal inside xi-io: CLI. Be conversational, concise, and practical.',
    'The user is the Pilot; you are the Navigator/Engineer.',
    'Current runtime date (UTC): '+new Date().toISOString().slice(0,10)+'. Dates and priority labels in documents are historical evidence, not proof a task is currently open or dependency-ready.',
    'Use tools instead of telling the user to run machine-resolvable steps. Call tools through the tool interface, never by writing JSON in your reply.',
    'Do not claim an effect without tool readback.',
    'To change an existing file, read it first, then call edit_workspace_file with old_text copied exactly from the file and new_text. Never rewrite a whole existing file.',
    'Every edit and command is shown to the human and needs their yes. Commands run in a sandbox with no network'+(sandboxState().ok?'.':'; on this computer commands are unavailable, so do not propose them.'),
    'Stay inside the active workspace.'
  ].join(' ')};
  let messages=[systemMessage,...(session.state==='PASS'?session.messages:[])];
  let lastTurn=session.state==='PASS'?session.lastTurn:null,menuChoices=null;
  let sessionBytes=session.state==='PASS'?session.bytes:null;
  let sessionWritable=session.state!=='BLOCKED';
  let sessionWarningShown=false;
  const showTurn=answer=>{lastTurn=answer;process.stdout.write((process.stdin.isTTY&&process.stdout.isTTY?humanToolTurn(answer,{compact:true,color:true}):answer.text)+'\n');};
  const persistSession=()=>{
    if(!sessionWritable)return false;
    try{sessionBytes=saveChatSession(root,{messages:messages.slice(1),lastTurn,model},sessionBytes);return true;}
    catch(error){
      sessionWritable=false;
      if(!sessionWarningShown){sessionWarningShown=true;process.stdout.write('Project chat could not be saved locally: '+humanText(String(error?.message||error))+'. The existing saved session was not replaced.\n');}
      return false;
    }
  };
  const recordDirectTurn=(input,answer)=>{
    messages.push({role:'user',content:input},{role:'assistant',content:answer.text});
    showTurn(answer);persistSession();
  };
  const approve=async(action)=>{
    if(activeTurn?.signal.aborted)return false;
    process.stdout.write('\n'+actionPreview(action,{columns:process.stdout.columns,tty:Boolean(process.stdin.isTTY&&process.stdout.isTTY)})+'\n');
    if(!process.stdin.isTTY||!process.stdout.isTTY){process.stdout.write('Interactive terminal approval required.\n');return false;}
    // y or yes, any case. Anything else, including Enter, is no.
    return ['y','yes'].includes((await rl.question('Approve this exact action? [y/N]: ')).trim().toLowerCase());
  };
  process.stdout.write('\nIbal · xi-io CLI\nProject: '+humanText(root)+'\nLocal model: '+humanText(model||'none discovered')+'\nWhat would you like to build or work on?\n/menu offers next-step options; /help shows commands. Changes still need your approval. /queue shows waiting tasks; /cancel all cancels and clears them.\nProject chat resumes locally on this computer. /clear removes its saved history.\n');
  if(session.lastTurn?.receipt?.source==='local_task_checkpoint')process.stdout.write('An interrupted task is preserved. /details shows its last recorded step. Effects are not replayed automatically.\n');
  if(session.state==='PASS'&&session.messages.length)process.stdout.write('Resumed '+session.messages.filter(m=>m.role==='user').length+' prior project turn(s).\n');
  if(session.state==='BLOCKED')process.stdout.write('Saved project chat was left untouched because it could not be verified: '+humanText(session.reason)+'. This session will not overwrite it; /clear can remove a regular local session file.\n');
  if(showMenu)menuChoices=printMenu({model,lastTurn});
  if(!model)process.stdout.write('No installed Ollama model found. Start Ollama with an already-installed model, then use /models and /model NAME. No model was downloaded.\n');
  try{
    for(;;){
      let input;try{input=await nextHumanInput(rl);}catch(e){if(e.code==='ERR_USE_AFTER_CLOSE'||e.code==='ABORT_ERR')break;throw e;}
      if(looksLikeShellPaste(input)){process.stdout.write('This is a shell script pasted into chat. Nothing was sent to the model or executed. Use a normal Bash terminal for installer scripts.\n');continue;}
      // Bare numbers are ordinary chat unless the user explicitly opened a menu.
      const numeric=/^\d+$/.test(input);
      if(menuChoices && numeric && !menuChoices.has(input)){
        process.stdout.write('That number is not in the displayed menu. Choose a listed number, type your task, or /menu all.\n');continue;
      }
      const choice=menuChoices && numeric?resolveMenuChoice(input):{command:input};
      menuChoices=null;
      const cmd=choice.command;
      if(cmd==='/exit'){process.stdout.write('See you next time.\n');break;}
      if(cmd==='/clear'){
        messages=[systemMessage];lastTurn=null;
        try{clearChatSession(root);sessionBytes=null;sessionWritable=true;sessionWarningShown=false;process.stdout.write('Conversation cleared from this project’s local session. Workspace stays '+root+'.\n');}
        catch(error){sessionWritable=false;process.stdout.write('Conversation cleared for this process, but the saved local session was left untouched: '+humanText(String(error?.message||error))+'.\n');}
        continue;
      }
      if(cmd==='/menu'||cmd==='/menu all'){menuChoices=printMenu({model,lastTurn,all:cmd==='/menu all'});continue;}
      if(cmd==='/chat'){
        process.stdout.write('Tell Ibal what you need at the next prompt. You can also type plain language directly without choosing a menu item.\n'+(model?'Selected local model: '+humanText(model)+'.':'No local model selected. Use /models and /model NAME; /list, /search and /read PATH work without one.')+'\n');
        continue;
      }
      if(cmd==='/list'||cmd.startsWith('/list ')){
        const directory=cmd.slice(5).trim()||'.';
        const fact=await executeObservedTool('list_workspace',{path:directory},{root});
        recordDirectTurn(input,toolFallbackText([fact],{source:'direct_read'}));continue;
      }
      if(cmd==='/search'||cmd.startsWith('/search ')){
        let query=cmd.slice(7).trim();
        if(!query){
          if(!process.stdin.isTTY||!process.stdout.isTTY){process.stdout.write('Use /search TEXT to search this project without a model.\n');continue;}
          try{query=(await rl.question('Search for (Enter cancels): ')).trim();}catch{break;}
          if(!query){process.stdout.write('Search cancelled. No search was run.\n');continue;}
        }
        const fact=await executeObservedTool('search_workspace',{query},{root});
        recordDirectTurn(input,toolFallbackText([fact],{source:'direct_read'}));continue;
      }
      if(cmd==='/connect'){process.stdout.write(JSON.stringify(connectCommand(),null,2)+'\n');continue;}
      if(cmd==='/help'){process.stdout.write(humanHelp(model)+'\n');continue;}
      if(cmd==='/details'){process.stdout.write(lastTurn?lastTurn.text+'\n':'No execution receipt yet. Ask for work or use /read PATH first.\n');continue;}
      if(cmd==='/workspace'){process.stdout.write('You are working in '+root+'.\n');continue;}
      if(cmd==='/tools'){process.stdout.write(humanTools()+'\n');continue;}
      if(cmd==='/tools details'){process.stdout.write('Informational only: xi-io-cli ibal balance reads historical unqualified donor notes; it is not a model action.\n');for(const t of toolCatalog())process.stdout.write('  '+t.name+(t.write?' [asks you first]':' [read]')+' — '+t.description+'\n');process.stdout.write(commandLine()+'\n');continue;}
      if(cmd==='/commands'){process.stdout.write(humanExamples()+'\n');continue;}
      if(cmd.startsWith('/model ')){const selected=cmd.slice(7).trim();if(!names.includes(selected)){process.stdout.write('Choose a discovered installed model from /models.\n');continue;}model=selected;saveModel(model);persistSession();process.stdout.write('Local model changed to '+model+'.\n');continue;}
      if(cmd==='/model'){process.stdout.write('Local model: '+(model||'none selected')+' via Ollama. Use /model NAME to switch among /models.\n');continue;}
      if(cmd==='/models'){
        const refreshed=await modelsCommand('list',[],{engine:'ollama'});
        names=(refreshed.models||[]).map(x=>x.name);
        if(refreshed.state!=='PASS')process.stdout.write('Could not refresh local Ollama models: '+refreshed.reason+'. Try /models again when Ollama is available.\n');
        else process.stdout.write(names.length?names.map((x,i)=>'  '+(i+1)+'. '+x).join('\n')+'\nUse /model NAME to select one.\n':'No local Ollama models were discovered.\n');
        continue;
      }
      if(cmd==='/status'||cmd==='/status details'){const d=await doctor();process.stdout.write((cmd==='/status details'?JSON.stringify(d,null,2):humanDoctor(d,root))+'\n');continue;}
      if(cmd==='/ack'||cmd==='/ack details'){
        const rows=await executeTool('list_registries',{}, {root});
        process.stdout.write(humanRegistry(rows,{details:cmd==='/ack details'})+'\n');
        continue;
      }
      if(cmd==='/read'||cmd.startsWith('/read ')){
        const file=cmd.slice(5).trim();
        if(!file||file.length>4096||/[\x00-\x1f\x7f]/.test(file)){
          showTurn(toolFallbackText([],{source:'direct_read',error:'READ_PATH_INVALID'}));continue;
        }
        const fact=await executeObservedTool('read_workspace_file',{path:file},{root});
        recordDirectTurn(input,toolFallbackText([fact],{source:'direct_read'}));
        continue;
      }
      if(cmd==='/packet'||cmd==='/packet status'){
        const loaded=loadAcceptedPacket(root);
        process.stdout.write(JSON.stringify(loaded,null,2)+'\n');
        continue;
      }
      if(cmd==='/accept-packet'||cmd.startsWith('/accept-packet ')){
        const file=cmd.slice('/accept-packet'.length).trim();
        if(!file){process.stdout.write('Usage: /accept-packet PATH.json — must include every required executable field and accepted:true.\n');continue;}
        try{
          const raw=JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
          const out=acceptPacket(raw,{workspaceRoot:root});
          process.stdout.write(JSON.stringify(out,null,2)+'\n');
          if(out.state==='PASS')process.stdout.write(formatBindingMessage(bindContinuationRequest({text:'continue',workspaceRoot:root,observedSourceSha:version().source_sha}))+'\n');
        }catch(error){process.stdout.write('Accept failed: '+String(error.message||error)+'\n');}
        continue;
      }
      if(isContinuationPhrase(cmd)||cmd==='/continue'){
        const observedSourceSha=version().source_sha;
        const binding=bindContinuationRequest({text:cmd==='/continue'?'continue':cmd,workspaceRoot:root,observedSourceSha});
        const message=formatBindingMessage(binding);
        if(message)process.stdout.write(message+'\n');
        if(binding.state!=='DISPATCH'){
          recordDirectTurn(input,toolFallbackText([],{source:'local_work_packet',error:binding.reason||binding.state}));
          continue;
        }
        process.stdout.write('Dispatching bound packet '+binding.packet_id+' through the local controller (deterministic acceptance; Ollama is not the authority).\n');
        activeTurn=new AbortController();
        let dispatched;
        try{
          dispatched=await dispatchAcceptedWork({
            text:cmd==='/continue'?'continue':cmd,
            workspaceRoot:root,
            observedSourceSha,
            performAdmittedStep:async(packet)=>{
              if(!model)return{state:'PASS',note:'NO_MODEL_STEP_ACCEPTANCE_ONLY'};
              // Bounded model assist: tools still require approval; acceptance is deterministic.
              const assist=await ollamaChat([
                systemMessage,
                {role:'user',content:'Executable packet '+packet.packet_id+' is already accepted. Objective: '+packet.objective+'. Allowed paths: '+packet.allowed_scope.paths.join(', ')+'. Use tools only inside that scope. Do not claim completion without tool results.'},
              ],{model,root,approve,signal:activeTurn.signal});
              return{state:assist?.error?'FAIL':'PASS',model_receipt:assist?.receipt||null,text:assist?.text||null};
            },
          });
        }finally{activeTurn=null;}
        recordDirectTurn(input,toolFallbackText([],{source:'local_work_packet',error:dispatched.state==='PASS'?null:dispatched.state}));
        process.stdout.write(JSON.stringify(dispatched,null,2)+'\n');
        continue;
      }
      if(!model){process.stdout.write('No local model selected. No request sent.\n');continue;}
      messages.push({role:'user',content:input});
      try{
        activeTurn=new AbortController();
        const taskId=crypto.randomUUID();
        const checkpoint=progress=>{
          lastTurn=toolFallbackText(progress.results||[],{source:'local_task_checkpoint',error:'TASK_INTERRUPTED_OR_IN_PROGRESS'});
          lastTurn.receipt.task={id:taskId,request:input,phase:progress.phase,tool:progress.tool||null,automatic_replay:false};
          lastTurn.text='Actual execution receipt (CLI-observed, not model claims):\n'+JSON.stringify(lastTurn.receipt,null,2);
          if(!persistSession())throw Error('TASK_CHECKPOINT_NOT_SAVED');
        };
        checkpoint({phase:'STARTED',results:[]});
        const answer=await ollamaChat(messages,{model,root,approve,signal:activeTurn.signal,onProgress:checkpoint});
        showTurn(answer);persistSession();
      }
      catch(e){
        const failure='I could not complete that locally: '+String(e.message||e)+'.';
        messages.push({role:'assistant',content:failure});process.stdout.write(failure+'\n');persistSession();
      }
    }
  } finally { rl.close(); }
  return {schema:'xiio.cli.interactive/v1',state:'CLOSED'};
}

// Installed layout (written by install.mjs): <prefix>/versions/<generation>/,
// with <prefix>/current and <prefix>/previous naming generations. Plain text
// pointers, not symlinks, so the same layout works on Windows.
function installLayout(){const versions=path.dirname(ROOT);if(path.basename(versions)!=='versions')return null;const prefix=path.dirname(versions);return{prefix,versions,current:path.join(prefix,'current'),previous:path.join(prefix,'previous'),generation:path.basename(ROOT)};}
function readPointer(f){return readGenerationPointer(path.dirname(f),path.basename(f));}
function receipt(){try{return JSON.parse(fs.readFileSync(path.join(ROOT,'install-receipt.json'),'utf8'));}catch{return null;}}
// Per-computer identity. The person is identified by the GitHub login this
// computer already has (gh auth); no new OAuth app or token is created and no
// token is read or stored. The computer gets its own Ed25519 device key; the
// private key never leaves this machine. Switchboard/Ward can later verify
// signatures made with it. Identity is not permission: Ward grants per device.
const DEVICE_FILE=path.join(CONFIG_DIR,'device.json');
const DEVICE_KEY_FILE=path.join(CONFIG_DIR,'device-key.pem');
function readDevice(){
  // Absence permits first-time sign-in. A failed read is not absence and must
  // never turn an existing device into a new identity or recommend that repair.
  let bytes,st;
  try{
    st=fs.lstatSync(DEVICE_FILE);
  }catch(error){return error.code==='ENOENT'?{state:'ABSENT'}:{state:'BLOCKED',reason:'DEVICE_IDENTITY_UNREADABLE'};}
  if(!st.isFile()||st.isSymbolicLink()||st.size>65536||(process.platform!=='win32'&&(st.mode&0o077)!==0))
    return{state:'BLOCKED',reason:'DEVICE_IDENTITY_CUSTODY_UNVERIFIED'};
  // Once observed, a disappearing record is an unreadable existing identity.
  try{bytes=fs.readFileSync(DEVICE_FILE);}catch{return{state:'BLOCKED',reason:'DEVICE_IDENTITY_UNREADABLE'};}
  try{
    const device=JSON.parse(bytes.toString('utf8'));
    // Existing device/v1 producers use UUIDs; match the bound observer contract.
    // Unsupported records remain intact, never normalized into another identity.
    if(device?.schema!=='xiio.cli.device/v1'||typeof device.device_id!=='string'||!/^device:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(device.device_id)
      ||typeof device.principal!=='string'||!/^github:[0-9]+$/.test(device.principal)||typeof device.login!=='string'||!device.login
      ||typeof device.hostname!=='string'||!device.hostname||typeof device.platform!=='string'||!device.platform
      ||typeof device.public_key!=='string'||typeof device.fingerprint!=='string'
      ||crypto.createPublicKey(device.public_key).asymmetricKeyType!=='ed25519'
      ||deviceFingerprint(device.public_key)!==device.fingerprint)
      return{state:'BLOCKED',reason:'DEVICE_IDENTITY_INVALID'};
    return{state:'PASS',device,bytes};
  }catch{return{state:'BLOCKED',reason:'DEVICE_IDENTITY_INVALID'};}
}
function deviceReadResult(observed,schema){
  return observed.state==='ABSENT'?{schema,state:'UNSET',fix:'Run: xi-io-cli login'}
    :{schema,state:'BLOCKED',reason:observed.reason,modified:false,note:'Existing identity was not replaced. Review the existing device record without re-registering this computer.'};
}
function readBoundDeviceKey(device){
  try{
    const st=fs.lstatSync(DEVICE_KEY_FILE);
    if(!st.isFile()||st.isSymbolicLink()||st.size>65536||(process.platform!=='win32'&&(st.mode&0o077)!==0))throw Error('KEY_CUSTODY');
    const privateKey=crypto.createPrivateKey(fs.readFileSync(DEVICE_KEY_FILE));
    const publicKey=crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'});
    if(privateKey.asymmetricKeyType!=='ed25519'||deviceFingerprint(publicKey)!==device.fingerprint)throw Error('KEY_CHANGED');
    return{state:'PASS',privateKey};
  }catch{return{state:'BLOCKED',reason:'DEVICE_KEY_MISSING_OR_CHANGED',modified:false};}
}
function deviceHostHold(device,schema){
  if(device.hostname===os.hostname()&&device.platform===process.platform)return null;
  return{schema,state:'BLOCKED',reason:'DEVICE_HOST_RECONCILIATION_REQUIRED',modified:false,
    device_id:device.device_id,principal:device.principal,hostname:device.hostname,platform:device.platform,
    device_key_matches_record:true,current_host_binding_verified:false,
    note:'The existing device identity is retained. A renamed or different host needs owner/Ward binding reconciliation before this target-bound operation; do not re-register or replace the key.'};
}
function githubIdentity(){
  const r=spawnSync(process.env.XIIO_GH||'gh',['api','user','--jq','{id:.id,login:.login}'],{encoding:'utf8',timeout:20000,env:controlledChildEnv()});
  if(r.error)return {state:'BLOCKED',reason:'GH_NOT_INSTALLED',fix:'Install the GitHub CLI, then run: gh auth login'};
  if(r.status!==0)return {state:'BLOCKED',reason:'GH_NOT_SIGNED_IN',fix:'Run: gh auth login'};
  try{const j=JSON.parse(r.stdout);if(!Number.isInteger(j.id)||!j.login)throw 0;return {state:'PASS',id:j.id,login:String(j.login)};}
  catch{return {state:'BLOCKED',reason:'GH_IDENTITY_UNREADABLE'};}
}
function deviceFingerprint(pubPem){return 'SHA256:'+crypto.createHash('sha256').update(crypto.createPublicKey(pubPem).export({type:'spki',format:'der'})).digest('base64').replace(/=+$/,'');}
function login(){
  const observed=readDevice();
  if(observed.state==='BLOCKED')return deviceReadResult(observed,'xiio.cli.login/v1');
  const who=githubIdentity();
  if(who.state!=='PASS')return {schema:'xiio.cli.login/v1',...who};
  const prev=observed.device||null;
  const principal='github:'+who.id;
  if(prev&&prev.principal!==principal)return {schema:'xiio.cli.login/v1',state:'BLOCKED',reason:'DEVICE_BOUND_TO_OTHER_ACCOUNT',bound_to:prev.principal,signed_in_as:principal,modified:false,note:'This computer remains bound to its existing account. No identity or key was changed.'};
  let priv;
  if(prev){
    const key=readBoundDeviceKey(prev);
    if(key.state!=='PASS')return{schema:'xiio.cli.login/v1',...key};
    const hold=deviceHostHold(prev,'xiio.cli.login/v1');if(hold)return hold;
    priv=key.privateKey;
  }else{
    // An orphan key is retained for review, not adopted into a replacement ID.
    try{fs.lstatSync(DEVICE_KEY_FILE);return{schema:'xiio.cli.login/v1',state:'BLOCKED',reason:'DEVICE_KEY_WITHOUT_IDENTITY',modified:false};}
    catch(error){if(error.code!=='ENOENT')return{schema:'xiio.cli.login/v1',state:'BLOCKED',reason:'DEVICE_KEY_UNREADABLE',modified:false};}
  }
  let created=false;
  try{
    if(!prev){
      fs.mkdirSync(CONFIG_DIR,{recursive:true,mode:0o700});
      priv=crypto.generateKeyPairSync('ed25519').privateKey;
      fs.writeFileSync(DEVICE_KEY_FILE,priv.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
      created=true;
    }
    const pub=crypto.createPublicKey(priv).export({type:'spki',format:'pem'});
    const device={schema:'xiio.cli.device/v1',device_id:prev?.device_id||('device:'+crypto.randomUUID()),hostname:os.hostname(),platform:process.platform,principal,login:who.login,public_key:pub,fingerprint:deviceFingerprint(pub),created_at:prev?.created_at||new Date().toISOString(),signed_in_at:new Date().toISOString(),authority:'NONE_UNTIL_WARD_GRANT'};
    const bytes=Buffer.from(JSON.stringify(device,null,2)+'\n');
    if(prev)commitWorkspaceEditCAS({file:path.resolve(DEVICE_FILE),expectedBytes:observed.bytes,nextBytes:bytes});
    else fs.writeFileSync(DEVICE_FILE,bytes,{mode:0o600,flag:'wx'});
    const returned=readDevice();
    if(returned.state!=='PASS'||!returned.bytes.equals(bytes)||readBoundDeviceKey(returned.device).state!=='PASS')throw Error('DEVICE_IDENTITY_READBACK_MISMATCH');
    return {schema:'xiio.cli.login/v1',state:'PASS',signed_in_as:who.login,principal,device_id:device.device_id,hostname:device.hostname,fingerprint:device.fingerprint,device_key:created?'CREATED':'EXISTING',note:'Identity only. Ward grants what this computer may do.'};
  }catch(error){return{schema:'xiio.cli.login/v1',state:'BLOCKED',reason:'DEVICE_IDENTITY_UPDATE_REFUSED',detail:String(error.code||error.message),modified:'UNKNOWN',note:'Existing files were not removed. Review the retained identity and key before retrying.'};}
}
function whoami(){
  const observed=readDevice();
  if(observed.state!=='PASS')return deviceReadResult(observed,'xiio.cli.whoami/v1');
  const d=observed.device,keyOk=readBoundDeviceKey(d).state==='PASS';
  if(keyOk){const hold=deviceHostHold(d,'xiio.cli.whoami/v1');if(hold)return hold;}
  return {schema:'xiio.cli.whoami/v1',state:keyOk?'PASS':'FAIL',reason:keyOk?null:'DEVICE_KEY_MISSING_OR_CHANGED',login:d.login,principal:d.principal,device_id:d.device_id,hostname:d.hostname,platform:d.platform,fingerprint:d.fingerprint,authority:d.authority};
}
function deviceSign(args){
  // Signs a challenge from Switchboard/Ward so this computer can prove it is
  // the registered device. Refuses anything that is not a plain nonce.
  const challenge=String(args[0]||'');
  if(!/^[A-Za-z0-9._:-]{16,256}$/.test(challenge))return {state:'FAIL',reason:'CHALLENGE_INVALID'};
  const observed=readDevice();if(observed.state!=='PASS')return deviceReadResult(observed,'xiio.cli.device-signature/v1');
  const d=observed.device,key=readBoundDeviceKey(d);
  if(key.state!=='PASS')return{schema:'xiio.cli.device-signature/v1',...key};
  const hold=deviceHostHold(d,'xiio.cli.device-signature/v1');if(hold)return hold;
  const sig=crypto.sign(null,Buffer.from('xiio-device-challenge/v1\n'+d.device_id+'\n'+challenge),key.privateKey);
  return {schema:'xiio.cli.device-signature/v1',state:'PASS',device_id:d.device_id,principal:d.principal,challenge,signature:sig.toString('base64'),fingerprint:d.fingerprint};
}
function version({staged=false}={}){
  const rec=receipt();let sha=rec?.source_sha||'UNKNOWN';
  if(!rec){const r=readOnlyGit(['rev-parse','HEAD'],{cwd:ROOT});if(r.status===0)sha=r.stdout;}
  const L=installLayout();
  const fileSha=crypto.createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex');
  let state='SOURCE_ONLY',reason=null,current=null,previous=null;
  if(L)try{
    verifyGeneration(L.prefix,L.generation);
    if(pointerTransactionPending(L.prefix))throw Error('POINTER_TRANSACTION_PENDING');
    current=readPointer(L.current);previous=readPointer(L.previous);
    if(current!==L.generation){if(staged){state='STAGED';reason='NOT_ACTIVE';}else throw Error('GENERATION_NOT_CURRENT');}else state='PASS';
  }catch(error){state='FAIL';reason=String(error.message);}
  return{schema:'xiio.cli.version/v1',state,reason,integrity_verified:state==='PASS'||state==='STAGED',active_release:state==='PASS',product:'xi-io: CLI',source_sha:sha,ref:rec?.ref||null,generation:L?.generation||null,running_file_sha256:fileSha,receipt_file_sha256:rec?.files?.['src/xiio.mjs']||null,current,previous,platform:process.platform,commands:sandboxState().ok?'SANDBOXED':sandboxState().reason,active_workspace:activeWorkspace()};
}
function rollback(flags={}){
  const L=installLayout();if(!L)return{schema:'xiio.cli.rollback/v1',state:'FAIL',reason:'NOT_AN_INSTALLED_GENERATION'};
  try{
    if(flags.recover)return{schema:'xiio.cli.rollback/v1',...recoverGenerationPointers(L.prefix),next:'xi-io-cli version'};
    if(pointerTransactionPending(L.prefix))return{state:'BLOCKED',reason:'POINTER_RECOVERY_REQUIRED',next:'xi-io-cli rollback --recover'};
    const cur=readPointer(L.current),prev=readPointer(L.previous);
    if(cur!==L.generation)throw Error('GENERATION_NOT_CURRENT');
    if(!prev)return{schema:'xiio.cli.rollback/v1',state:'BLOCKED',reason:'NO_PREVIOUS_GENERATION',current:cur};
    verifyGeneration(L.prefix,cur);verifyGeneration(L.prefix,prev);
    commitGenerationPointers(L.prefix,{current:prev,previous:cur},{current:cur,previous:prev});
    return{schema:'xiio.cli.rollback/v1',state:'PASS',from:cur,to:prev,undo:'xi-io-cli rollback',next:'xi-io-cli version'};
  }catch(error){return{schema:'xiio.cli.rollback/v1',state:'FAIL',reason:String(error.message),next:'xi-io-cli version'};}
}

// Explicit finite connection invocation. No enrollment, service, login, retries,
// broker implementation or authority is supplied by this client.
const CONNECTION_REF='ffbcd216d4c673de826242662271add63112c49a';
const CONNECTION_FILES=Object.freeze({
  "scripts/device-native-consumer.mjs": "418b840eb2a4f18ff3dd743aa14e082c3ef1d07bb507edc01a40352200531351",
  "lib/device-broker.mjs": "142f291535e21c5d238351d09e36ab09398da96e9530efba8bde34b845dac6aa",
  "lib/device-execute-pull-worker.mjs": "a6192a2e1695a48ddb727b7742482fa74526da3224d65f34a882f96321234aa8",
  "lib/device-execute.mjs": "3bb24e7702e421c7f1ce9f61f13453df496e93d8c61030a08e20c7dfe282ca23",
  "lib/operational-job.ts": "a4a97ba764ebd79b7678ccc3feae76f28b6b141912b1ed0e7764b4725087f3fe"
});
function connectCommand(args=[]){
  const base={schema:'xiio.cli.connection/v1',connected:false,returnCertified:false,execution_verified:false,job_execution_state:'NOT_REPORTED_BY_NATIVE_CONSUMER',source_ref:CONNECTION_REF};
  const blocked=reason=>({...base,state:'BLOCKED',firstRed:reason});
  const unknown=reason=>({...base,state:'OUTCOME_UNKNOWN',firstRed:reason,retry_safe:false,note:'Do not automatically retry: reconcile the existing broker job/result first.'});
  if(args.length)return blocked('CONNECTION_ARGUMENTS_NOT_SUPPORTED');
  const required=['XIIO_DEVICE_REF','XIIO_DEVICE_BROKER_URL','XIIO_DEVICE_PORTS_MODULE'];
  if(required.some(k=>!process.env[k]))return {...base,state:'CONFIGURATION_REQUIRED',firstRed:'EXISTING_DEVICE_BROKER_AND_WARD_PORTS_REQUIRED',required_bindings:required};
  try{const url=new URL(process.env.XIIO_DEVICE_BROKER_URL);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();}
  catch{return blocked('NATIVE_BROKER_HTTPS_REQUIRED');}
  // These values select existing backend bindings; they do not grant authority.
  // Local CLI login identity is deliberately not substituted for Ward enrollment.
  const layout=installLayout();
  if(!layout)return blocked('CONNECTION_INSTALLED_LAYOUT_REQUIRED');
  try{
    verifyGeneration(layout.prefix,layout.generation);
    if(pointerTransactionPending(layout.prefix))throw Error('POINTER_TRANSACTION_PENDING');
    if(readGenerationPointer(layout.prefix,'current')!==layout.generation)throw Error('GENERATION_NOT_CURRENT');
  }catch(e){return blocked(/^[A-Z0-9_]+$/.test(e.message)?e.message:'CONNECTION_GENERATION_UNVERIFIED');}
  const root=path.join(layout.prefix,'connection','switchboard',CONNECTION_REF);
  try{
    for(const [rel,expected] of Object.entries(CONNECTION_FILES)){
      const file=path.join(root,rel),st=fs.lstatSync(file);
      if(!st.isFile()||st.nlink!==1||fs.realpathSync(file)!==file||(st.mode&0o022))throw Error('CONNECTION_SOURCE_CUSTODY_INVALID');
      if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw Error('CONNECTION_SOURCE_CHANGED');
    }
  }catch(e){return blocked(['CONNECTION_SOURCE_CHANGED','CONNECTION_SOURCE_CUSTODY_INVALID'].includes(e.message)?e.message:'CONNECTION_RUNTIME_UNAVAILABLE');}
  const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
  const child=spawnSync(process.execPath,['--experimental-strip-types',path.join(root,'scripts/device-native-consumer.mjs'),'--once'],{env,encoding:'utf8',timeout:70000,killSignal:'SIGKILL',maxBuffer:65536});
  if(child.error||child.signal)return unknown('CONNECTION_PROCESS_INTERRUPTED');
  try{
    const output=(child.status===0?child.stdout:(child.stdout||child.stderr)).trim();
    const value=JSON.parse(output);
    const allowed=['EMPTY','BLOCKED','WAIT_TRANSPORT','RESULT_UNRETURNED','RESULT_RETURNED_TO_BROKER'];
    const success=['EMPTY','RESULT_RETURNED_TO_BROKER'].includes(value?.state);
    if(!allowed.includes(value?.state)||child.status!==(success?0:3)
      ||(value.deviceRef!==undefined&&value.deviceRef!==process.env.XIIO_DEVICE_REF)
      ||(value.state!=='BLOCKED'&&value.deviceRef!==process.env.XIIO_DEVICE_REF)
      ||(value.state==='RESULT_RETURNED_TO_BROKER'&&value.brokerReturned!==true)
      ||(value.state!=='RESULT_RETURNED_TO_BROKER'&&value.brokerReturned===true))throw Error('INVALID');
    // Preserve native loss/return distinctions. Process success is not live proof.
    return {...base,state:value.state,firstRed:value.firstRed||null,deviceRef:value.deviceRef||null,jobRef:value.jobRef||null,brokerReturned:value.brokerReturned===true,native_exit:child.status};
  }catch{return unknown('CONNECTION_NATIVE_RESULT_INVALID');}
}

const rawArgv=process.argv.slice(2);
let pre;try{pre=parse(rawArgv);}catch(e){emit({state:'FAIL',reason:String(e.message||e)},2);process.exit(2);}
const explicitHelp=Boolean(pre.flags.help)||['help','-h'].includes(pre.command)&&pre.positionals.length>0;
const explicitVersion=Boolean(pre.flags.version)||['version','-v'].includes(pre.command);
const TOP_LEVEL_COMMANDS=new Set(['help','-h','--help','version','-v','rollback','login','whoami','connect','device','activate','doctor','services','tools','engines','models','install','registry','runner','glass','scan','ux','ibal','menu','chat','work-packet']);
const preIsDirectory=!TOP_LEVEL_COMMANDS.has(pre.command) && fs.existsSync(path.resolve(pre.command)) && fs.statSync(path.resolve(pre.command)).isDirectory();
const interactiveRequested=!explicitHelp&&!explicitVersion&&(
  rawArgv.length===0 || pre.command==='help' || pre.command==='menu' || pre.command==='chat' || preIsDirectory
);
if(interactiveRequested){
  const paths=['chat','menu'].includes(pre.command)?pre.positionals.slice(1):pre.positionals;
  try{await interactive(pre.flags,paths,{showMenu:pre.command==='menu'});}catch(e){emit({state:'FAIL',reason:String(e.message||e)},2);process.exit(2);}
  process.exit(0);
}
const p=pre;
let result;
if(explicitVersion) result=version(pre.flags);
else if(explicitHelp||['help','--help','-h'].includes(p.command)) result=help();
else if(p.command==='rollback') result=rollback(p.flags);
else if(p.command==='login') result=login();
else if(p.command==='whoami') result=whoami();
else if(p.command==='connect') result=connectCommand(rawArgv.slice(1));
else if(p.command==='device'&&p.subcommand==='sign') result=deviceSign(p.args);
else if(p.command==='activate') result=activate(p.positionals.slice(1),p.flags);
else if(p.command==='doctor') result=await doctor();
else if(p.command==='services') result=await servicesCommand(p.subcommand,p.args,p.flags);
else if(p.command==='tools') result=externalToolsStatus();
else if(p.command==='engines') result=await enginesCommand(p.subcommand,p.args,p.flags);
else if(p.command==='models') result=await modelsCommand(p.subcommand,p.args,p.flags);
else if(p.command==='install') result=installCommand(p.subcommand||p.args[0],p.flags);
else if(p.command==='registry') result=registryCommand(p.subcommand,p.args,p.flags);
else if(p.command==='runner') result=p.subcommand==='recover'?runnerRecover(p.flags):runnerDiagnose(p.flags);
else if(p.command==='glass') result=await glassRead(p.flags);
else if(p.command==='scan'&&p.subcommand==='local') result=await approvedLocalScan(workspaceRoot(p.flags.root||null),async()=>p.flags.apply===true);
else if(p.command==='ux'&&['walk','triage'].includes(p.subcommand)){const root=workspaceRoot(p.flags.root||null);result=crossUxTriage(root,{terms:String(p.flags.terms||'local_scan,RCP,ibal').split(','),maxFiles:Number(p.flags['max-files']||4000),allowPath:p=>!credentialPath(p),readArtifact:rel=>readWorkspaceText(root,rel)});}
else if(p.command==='ibal'&&p.subcommand==='balance') result=ibalBalanceGuide();
else if(p.command==='work-packet'){
  const root=workspaceRoot(p.flags.root||null);
  const observedSourceSha=version().source_sha;
  if(p.subcommand==='status') result=loadAcceptedPacket(root);
  else if(p.subcommand==='accept'){
    const file=p.flags.file||p.args[0];
    if(!file) result={schema:'xiio.cli.local-work-packet/v1',state:'FAIL',reason:'FILE_REQUIRED',usage:'xi-io-cli work-packet accept --file PATH.json --root WORKSPACE'};
    else{
      try{result=acceptPacket(JSON.parse(fs.readFileSync(path.resolve(file),'utf8')),{workspaceRoot:root,force:p.flags.force===true});}
      catch(error){result={schema:'xiio.cli.local-work-packet/v1',state:'FAIL',reason:String(error.message||error),missing:error.missing||null};}
    }
  }else if(p.subcommand==='continue'||p.subcommand==='dispatch'){
    result=await dispatchAcceptedWork({
      text:'continue',
      workspaceRoot:root,
      observedSourceSha,
      refuse:p.flags.refuse===true,
      performAdmittedStep:p.flags['acceptance-only']===true?async()=>({state:'PASS',note:'ACCEPTANCE_ONLY'}):null,
    });
  }else result={schema:'xiio.cli.local-work-packet/v1',state:'FAIL',reason:'UNKNOWN_SUBCOMMAND',usage:'xi-io-cli work-packet status|accept|continue [--root PATH] [--file PATH] [--acceptance-only]'};
}
else result={schema:'xiio.cli.error/v1',state:'FAIL',reason:'UNKNOWN_COMMAND',command:p.command,usage:help().usage};
emit(result,p.command==='scan'?(result?.state==='LOCAL_STATIC_OBSERVED'?result.process_status:2):p.command==='connect'&&!['EMPTY','RESULT_RETURNED_TO_BROKER'].includes(result?.state)?3:result?.state==='FAIL'?2:0);

