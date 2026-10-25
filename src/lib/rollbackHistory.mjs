import {parseInstallReceipt} from '../rollback-history.mjs';
// Static, unprivileged parser for the actual xi-io CLI install.mjs receipt and
// generation-pointer formats. Metadata is evidence, not independently verified bytes.
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^[0-9a-f]{64}$/;
const GEN=/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;
const MAX_FILES=32;
const MAX_FILE_BYTES=65536;
const SUPPORTED=new Set(['xiio.cli.install-receipt/v1','xiio.cli.install-receipt/v2']);

const trim=s=>typeof s==='string'?s.trim():'';
const basename=s=>String(s||'').replace(/\\/g,'/').split('/').at(-1)||'';
const generationFromPath=s=>{
  const parts=String(s||'').replace(/\\/g,'/').split('/');
  const i=parts.lastIndexOf('versions');
  const v=i>=0?parts[i+1]:null;
  return GEN.test(v||'')?v:null;
};
const cleanTime=s=>{
  if(typeof s!=='string'||s.length>40)return null;
  const n=Date.parse(s);
  return Number.isFinite(n)&&/^\d{4}-\d\d-\d\dT/.test(s)?new Date(n).toISOString():null;
};
export function parseRollbackFiles(inputs){
  const issues=[],records=[],pointers={current:null,previous:null};
  const entries=Array.isArray(inputs)?inputs:[];
  if(entries.length>MAX_FILES) return {state:'REJECTED',first_red:'TOO_MANY_FILES',records:[],pointers,issues:['Maximum 32 files per read.']};
  for(const file of entries){
    const name=basename(file?.name||file?.relativePath);
    const path=String(file?.relativePath||file?.name||'');
    const raw=typeof file?.text==='string'?file.text:'';
    if(new TextEncoder().encode(raw).length>MAX_FILE_BYTES||raw.includes('\0')){
      issues.push(name+': FILE_TOO_LARGE_OR_BINARY');continue;
    }
    if(name==='current'||name==='previous'){
      const value=raw.trim();
      if(!GEN.test(value)){issues.push(name+': POINTER_NOT_GENERATION_NAME');continue;}
      if(pointers[name]&&pointers[name]!==value)issues.push(name+': POINTER_CONFLICT');
      else pointers[name]=value;
      continue;
    }
    if(name!=='install-receipt.json'){continue;}
    let obj;
    try{obj=JSON.parse(raw);}catch{issues.push('install-receipt.json: INVALID_JSON');continue;}
    if(!obj||typeof obj!=='object'||Array.isArray(obj)||!SUPPORTED.has(obj.schema)){
      issues.push('install-receipt.json: UNSUPPORTED_SCHEMA');continue;
    }
    if(obj.schema==='xiio.cli.install-receipt/v2'){
      try{obj=parseInstallReceipt(raw);}catch(error){issues.push('install-receipt.json: '+error.message);continue;}
    }
    const generation= obj.schema.endsWith('/v2')?trim(obj.generation):generationFromPath(path);
    if(generation&&!GEN.test(generation)){
      issues.push('install-receipt.json: GENERATION_INVALID');continue;
    }
    const sourceSha=trim(obj.source_sha);
    if(sourceSha&&sourceSha!=='UNKNOWN'&&!SHA40.test(sourceSha)){
      issues.push('install-receipt.json: SOURCE_SHA_INVALID');continue;
    }
    const digest=obj?.files?.['src/xiio.mjs'];
    if(digest!==undefined&&!(typeof digest==='string'&&SHA256.test(digest))){
      issues.push('install-receipt.json: CLI_FILE_DIGEST_INVALID');continue;
    }
    const rec={
      generation:generation||null,
      sourceSha:SHA40.test(sourceSha)?sourceSha:null,
      cliFileSha256:typeof digest==='string'?digest:null,
      installedAt:cleanTime(obj.installed_at),
      schema:obj.schema,
      repo:obj.repo||null, prefix:obj.prefix||null, platform:obj.platform||null,
      scope:JSON.stringify([obj.repo||null,obj.prefix||null,obj.platform||null]),
      conflict:false,
      qualification:'NOT_INDEPENDENTLY_VERIFIED',
    };
    const previous=records.find(r=>r.generation&&r.generation===rec.generation&&r.scope===rec.scope);
    if(previous){
      if(previous.sourceSha!==rec.sourceSha||previous.cliFileSha256!==rec.cliFileSha256||previous.installedAt!==rec.installedAt){
        issues.push('install-receipt.json: SAME_GENERATION_CONFLICT');
        previous.conflict=true;rec.conflict=true;
      } else continue; // Exact projected duplicate, never overwrite a conflict.
    }
    records.push(rec);
  }
  const pointerScopeKnown=new Set(records.map(r=>r.scope)).size<=1;
  if(!pointerScopeKnown&&(pointers.current||pointers.previous))issues.push('POINTER_SCOPE_UNRESOLVED: multiple recorded scopes; no host identity supplied');
  const categorized=records.map(r=>({
    ...r,
    pointerState:pointerScopeKnown&&r.generation&&pointers.previous===r.generation?'PREVIOUS_POINTER'
      :pointerScopeKnown&&r.generation&&pointers.current===r.generation?'CURRENT_POINTER'
      :'POINTER_UNRESOLVED',
  }));
  // Preserve selection order; timestamps do not establish rollback order.
  // No receipt, pointer or declared PASS is proof of a running binary, copied
  // installation, rollback success or authenticated device connection.
  const state=issues.length?'PARTIAL':categorized.length?'RECORDED_METADATA':'NO_RECEIPTS';
  return {state,first_red:issues[0]||null,records:categorized,pointers,issues,
    evidence:'LOCAL_USER_SELECTED_METADATA_ONLY',
    installedBinaryVerified:false,fullByteReadbackVerified:false};
}
