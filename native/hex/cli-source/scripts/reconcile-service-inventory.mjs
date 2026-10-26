#!/usr/bin/env node
// Read-only reconciliation: systemd/PID/listener evidence is never an access grant.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const CATALOG=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../config/service-catalog.json');
function probeOf(probe){
 try{
  const u=new URL(probe);
  if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.username||u.password||u.hash)return null;
  return {port:Number(u.port)||(u.protocol==='https:'?443:80),health_path:u.pathname+u.search};
 }catch{return null;}
}
export function listenPort(address){
 const m=String(address||'').match(/:(\d+)$/);return m?Number(m[1]):null;
}
export function reconcile(catalog,report){
 if(report?.schema!=='xiio.cli.host-service-inventory/v1'||!Array.isArray(report.units))throw Error('INVENTORY_SCHEMA_INVALID');
 if(!Array.isArray(catalog?.services))throw Error('SERVICE_CATALOG_INVALID');
 const units=report.units;
 const known=new Set(catalog.services.flatMap(s=>s.systemd_candidates||[]));
 const services=catalog.services.map(s=>{
  const related=units.filter(u=>(s.systemd_candidates||[]).includes(u.unit));
  const active=related.filter(u=>u.active_state==='active'&&u.main_pid);
  const probe=probeOf(s.probe);
  const matching=active.filter(u=>u.listen.some(addr=>listenPort(addr)===probe?.port));
  let identity='UNKNOWN',red='SERVICE_UNIT_IDENTITY_UNVERIFIED';
  if(!s.probe)red='HEALTH_ENDPOINT_UNDECLARED';
  else if(!probe)red='HEALTH_ENDPOINT_NOT_LOCAL_OR_INVALID';
  else if(!related.length)red='SERVICE_UNIT_NOT_OBSERVED';
  else if(!active.length)red='SERVICE_PROCESS_NOT_OBSERVED';
  else if(!matching.length)red='MAIN_PID_LISTENER_NOT_OBSERVED';
  else if(matching.length>1){identity='AMBIGUOUS';red='MULTIPLE_LISTENER_OWNERS';}
  else{identity='IDENTITY_CANDIDATE';red='HEALTH_AUTH_AND_CONTENT_READBACK_REQUIRED';}
  return {service_id:s.id,identity_state:identity,first_red:red,
   declared_health:s.probe||null,
   catalog_cli_access:['health','read','read_write'].includes(s.cli_access)?s.cli_access:'health',
   candidate_units:related.map(u=>({scope:u.scope,unit:u.unit,active_state:u.active_state,main_pid:u.main_pid,
    executable:u.executable,cwd:u.cwd,listen:u.listen})),
   health_proven:false,authority_proven:false,registration_change_authorized:false};
 });
 const missing=units.filter(u=>/^xi/i.test(u.unit)&&!known.has(u.unit)).map(u=>({
  unit:u.unit,scope:u.scope,state:'UNMAPPED_UNIT',
  next:'RESOLVE_OWNER_AND_DECLARED_HEALTH_ENDPOINT_FROM_PRODUCT_SOURCE',add_catalog_entry:false
 }));
 return {schema:'xiio.cli.service-reconciliation/v1',
  source_host:report.host,source_observed_at:report.observed_at,
  source_inventory_complete:report.inventory_complete===true,
  state:services.some(s=>s.identity_state!=='IDENTITY_CANDIDATE')||missing.length||report.inventory_complete!==true?'PARTIAL':'IDENTITY_CANDIDATES_ONLY',
  services,unmapped_units:missing,
  hard:['IDENTITY_CANDIDATE != HEALTHY','PORT_MATCH != CONSUMER_VERIFIED',
   'UNIT_PRESENT != AUTHORITATIVE_SERVICE','CLI_ACCESS_GRANT != WARD_AUTHORIZATION',
   'NO_CATALOG_MUTATION','UNKNOWN != MISSING']};
}
function main(){
 const args=process.argv.slice(2);
 if(!args.length||args.length>3||args.some((a,i)=>a.startsWith('-')&&a!=='--catalog'))
  throw Error('USAGE: reconcile-service-inventory.mjs INVENTORY.json [--catalog PATH]');
 const i=args.indexOf('--catalog'),cat=i<0?CATALOG:args[i+1];
 if(!args[0]||!cat)throw Error('INPUT_REQUIRED');
 const report=JSON.parse(fs.readFileSync(args[0],'utf8'));
 const catalog=JSON.parse(fs.readFileSync(cat,'utf8'));
 process.stdout.write(JSON.stringify(reconcile(catalog,report),null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(e){console.error(JSON.stringify({state:'FAIL',first_red:String(e.message)}));process.exitCode=1;}
}
