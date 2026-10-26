#!/usr/bin/env node
// Read-only Linux service identity inventory. No endpoints, argv or environment read.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const CATALOG=path.resolve(ROOT,'../config/service-catalog.json');
const CAP=120;
const hash=s=>createHash('sha256').update(s).digest('hex');
const validUnit=s=>/^[A-Za-z0-9_.@:-]+\.service$/.test(s);
const redact=s=>s?'[REDACTED_PATH]':null;

const cmd=(bin,args,timeout=7000)=>{
 const r=spawnSync(bin,args,{encoding:'utf8',timeout,maxBuffer:3145728,
  env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C',LC_ALL:'C'}});
 return {ok:r.status===0,output:r.stdout||'',error:r.error?.code||(r.status===0?null:'EXIT_'+r.status)};
};
export function parseUnitNames(input){
 const names=new Set();
 for(const line of String(input||'').split('\n')){
  const m=line.trim().replace(/^●\s*/,'').match(/^([^\s]+\.service)(?:\s|$)/);
  if(m&&validUnit(m[1]))names.add(m[1]);
 }
 return [...names].sort();
}
export function parseSockets(input){
 const byPid=new Map();
 for(const line of String(input||'').split('\n')){
  const f=line.trim().split(/\s+/);if(f.length<5)continue;
  const addr=f[3];if(!addr||/[^\w.\-\[\]:*%]/.test(addr))continue;
  for(const pid of new Set([...line.matchAll(/pid=(\d+),/g)].map(m=>Number(m[1])))){
   if(!byPid.has(pid))byPid.set(pid,new Set());
   byPid.get(pid).add(addr);
  }
 }
 return byPid;
}
const properties=input=>{
 const o={};
 for(const line of String(input||'').split('\n')){const i=line.indexOf('=');if(i>0)o[line.slice(0,i)]=line.slice(i+1);}
 return o;
};
const procLink=(pid,name)=>{try{return redact(fs.readlinkSync('/proc/'+pid+'/'+name));}catch{return null;}};
export function makeInventory({catalog,systemUnits,userUnits,show,ss,host='fixture',observedAt='1970-01-01T00:00:00Z'}){
 const system=parseUnitNames(systemUnits),user=parseUnitNames(userUnits);
 const all=new Set([...system,...user]);
 const declared=new Set((catalog?.services||[]).flatMap(s=>s.systemd_candidates||[]).filter(validUnit));
 const eligible=[...all].filter(n=>/^(xiio?[-._]|xi-io[-._])/i.test(n)||declared.has(n)).sort();
 const sockets=parseSockets(ss),units=[];
 for(const unit of eligible.slice(0,CAP))for(const scope of ['user','system']){
  if(!(scope==='user'?user:system).includes(unit))continue;
  const p=properties(show(scope,unit));if(!p.LoadState||p.LoadState==='not-found')continue;
  const pid=Number(p.MainPID)||0;
  units.push({scope,unit,load_state:p.LoadState,active_state:p.ActiveState||'UNKNOWN',
   main_pid:pid||null,executable:pid?procLink(pid,'exe'):null,
   cwd:pid?procLink(pid,'cwd'):redact(p.WorkingDirectory),
   listen:pid?[...(sockets.get(pid)||[])].sort():[],
   socket_relation:'MAIN_PID_ONLY',identity_state:pid?'PROCESS_OBSERVED':'NO_MAIN_PID',
   health_state:'NOT_PROBED',authority_state:'NOT_EVALUATED'});
 }
 return {schema:'xiio.cli.host-service-inventory/v1',effect_authority:0,host,observed_at:observedAt,
  inventory_complete:eligible.length<=CAP,unfiltered_unit_count:all.size,selected_unit_count:eligible.length,
  listener_source:'ss -ltnpH',units,
  hard:['PROCESS_OBSERVED != SERVICE_HEALTHY','SOCKET_LISTEN != API_IDENTITY',
   'CATALOG_ENTRY != ACCESS_GRANT','NO_EXEC_ARGV_OR_ENV_EXPORTED','NO_SERVICE_REQUESTS_SENT']};
}
export function collect(catalog){
 if(process.platform!=='linux')throw Error('LINUX_ONLY');
 const a=cmd('systemctl',['--user','list-units','--all','--type=service','--no-legend','--plain']);
 const b=cmd('systemctl',['list-units','--all','--type=service','--no-legend','--plain']);
 const c=cmd('ss',['-ltnpH']);const cache=new Map();
 const show=(scope,unit)=>{
  const key=scope+':'+unit;
  if(!cache.has(key))cache.set(key,cmd('systemctl',[...(scope==='user'?['--user']:[]),'show',unit,
   '-p','LoadState','-p','ActiveState','-p','MainPID','-p','WorkingDirectory']).output);
  return cache.get(key);
 };
 const report=makeInventory({catalog,systemUnits:b.output,userUnits:a.output,show,ss:c.output,
  host:os.hostname(),observedAt:new Date().toISOString()});
 report.source_errors={user_units:a.ok?null:a.error,system_units:b.ok?null:b.error,socket_scan:c.ok?null:c.error};
 if(!a.ok||!b.ok||!c.ok)report.inventory_complete=false;
 return report;
}
export function reportMarkdown(report){
 const cell=v=>String(v??'UNKNOWN').replaceAll('|','\\|').replaceAll('\n',' ');
 const lines=['## Loki XI-IO service identity, read-only',
  '','Host: '+cell(report.host),'Observed: '+cell(report.observed_at),
  'Scope: systemd, /proc and ss. No service requests, argv, secrets or environment values.',
  '','| Scope | Unit | State | PID | Executable | CWD | Main-PID listeners |',
  '|---|---|---|---:|---|---|---|'];
 for(const u of report.units)lines.push('| '+[u.scope,u.unit,u.active_state,u.main_pid,redact(u.executable),redact(u.cwd),u.listen.join(', ')||'UNKNOWN'].map(cell).join(' | ')+' |');
 if(!report.units.length)lines.push('| UNKNOWN | NO_MATCHING_UNIT | UNKNOWN | | | | |');
 lines.push('','Qualification: no service-health, authentication, API or Ward permission claim.',
  'A missing MainPID socket does not prove child processes have no listeners.');
 if(!report.inventory_complete)lines.push('Coverage: PARTIAL, a source failed or the unit limit was reached.');
 lines.push('','Inventory SHA-256: '+hash(JSON.stringify({...report,units:report.units.map(u=>({...u,executable:redact(u.executable),cwd:redact(u.cwd)}))})));
 return lines.join('\n')+'\n';
}
function main(){
 const args=process.argv.slice(2);
 if(args.some(a=>!['--markdown','--post-issue','--catalog'].includes(a)&&args[args.indexOf(a)-1]!=='--catalog'))
  throw Error('UNKNOWN_ARGUMENT');
 const catAt=args.indexOf('--catalog');
 const file=catAt>=0?args[catAt+1]:CATALOG;
 if(!file)throw Error('CATALOG_PATH_REQUIRED');
 const report=collect(JSON.parse(fs.readFileSync(file,'utf8')));
 const markdown=reportMarkdown(report);
 if(args.includes('--post-issue')){
  const r=spawnSync('gh',['issue','comment','12','-R','Vado42-chris/xi-io-cli','--body-file','-'],
   {input:markdown,encoding:'utf8',timeout:15000});
  if(r.status!==0)throw Error('GH_POST_FAILED: '+String(r.stderr||r.error?.message||'').slice(0,250));
  const url=String(r.stdout||'').trim(),m=url.match(/#issuecomment-(\d+)$/);
  if(!m){console.log(JSON.stringify({state:'POSTED_READBACK_UNKNOWN',url,sha256:hash(markdown)}));process.exitCode=2;return;}
  const q=spawnSync('gh',['api','repos/Vado42-chris/xi-io-cli/issues/comments/'+m[1]],{encoding:'utf8',timeout:15000});
  let matched=false;try{matched=q.status===0&&JSON.parse(q.stdout).body===markdown;}catch{}
  console.log(JSON.stringify({state:matched?'POSTED_READBACK_MATCH':'POSTED_READBACK_UNKNOWN',url,sha256:hash(markdown),inventory_complete:report.inventory_complete}));
  if(!matched)process.exitCode=2;
 }else process.stdout.write(args.includes('--markdown')?markdown:JSON.stringify(report,null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(e){console.error(JSON.stringify({state:'FAIL',first_red:String(e.message)}));process.exitCode=1;}
}
