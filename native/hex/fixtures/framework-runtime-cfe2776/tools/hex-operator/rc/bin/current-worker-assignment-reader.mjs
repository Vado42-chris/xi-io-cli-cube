import fs from 'node:fs';import path from 'node:path';
const text=v=>String(v??'').trim();
const safeDir=raw=>{const p=path.resolve(text(raw));if(!text(raw)||!path.isAbsolute(p))throw new Error('WORKER_ASSIGNMENT_RUNTIME_DIR_REQUIRED');const st=fs.lstatSync(p,{throwIfNoEntry:false});if(!st?.isDirectory()||st.isSymbolicLink()||fs.realpathSync(p)!==p)throw new Error('WORKER_ASSIGNMENT_RUNTIME_DIR_UNTRUSTED');return p};
const validRow=row=>row?.schema==='xiio.switchboard.worker-assignment/v1'&&row.admitted===true&&row.state==='ADMITTED';
const safeRow=row=>{for(const k of ['assignment_ref','work_ref','source_generation','agent_id'])if(!text(row[k]))throw new Error('CURRENT_ASSIGNMENT_BINDING_INCOMPLETE');if(row.authority_granted!==false||row.attempt_created!==false||row.provider_effect!==false)throw new Error('CURRENT_ASSIGNMENT_AUTHORITY_INVALID');return row};
export function readCurrentAssignment(input={}){
 const principal=text(input.principal_ref);if(!principal)throw new Error('CURRENT_ASSIGNMENT_PRINCIPAL_REQUIRED');
 const root=safeDir(input.runtime_dir||process.env.XIIO_WORKER_ASSIGNMENT_RUNTIME_DIR),rows=[];
 const packetMode=['session_id','work_ref','assignment_ref','source_generation'].some(k=>text(input[k]));
 const matter=text(input.matter_ref);
 if(packetMode){for(const k of ['session_id','work_ref','assignment_ref','source_generation'])if(!text(input[k]))throw new Error('CURRENT_ASSIGNMENT_PACKET_SELECTOR_INCOMPLETE');}
 else if(!matter)throw new Error('CURRENT_ASSIGNMENT_MATTER_REQUIRED');
 for(const name of fs.readdirSync(root)){if(!/^[a-f0-9]{32}\.json$/.test(name))continue;const file=path.join(root,name),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())throw new Error('CURRENT_ASSIGNMENT_RUNTIME_ENTRY_UNTRUSTED');const row=JSON.parse(fs.readFileSync(file,'utf8'));if(!validRow(row)||row.principal_ref!==principal)continue;
  if(packetMode){if(row.session_id===input.session_id&&row.work_ref===input.work_ref&&row.assignment_ref===input.assignment_ref&&row.source_generation===input.source_generation)rows.push(row);}
  else if(row.return_target===matter)rows.push(row);
 }
 if(rows.length===0)throw new Error('CURRENT_ASSIGNMENT_UNBOUND');if(rows.length!==1)throw new Error('CURRENT_ASSIGNMENT_AMBIGUOUS');
 const row=safeRow(rows[0]);
 return Object.freeze(structuredClone(packetMode?{...row,state:'CURRENT'}:row));
}
