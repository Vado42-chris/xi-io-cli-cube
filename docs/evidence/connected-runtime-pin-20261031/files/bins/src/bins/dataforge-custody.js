import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { compileResourceSet } from './resource-contract.js';

const SAFE_REF=/^dataforge:\/\/(root|work)\/[A-Za-z0-9._:-]+$/;
const text=(v,label)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(label+'_REQUIRED');return v.trim()};
const stable=v=>Array.isArray(v)?v.map(stable):(!v||typeof v!=='object'?v:Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])));
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const key=v=>crypto.createHash('sha256').update(v).digest('hex').slice(0,24);

const need=(ok,code)=>{if(!ok)throw new Error(code)};
const MAX_RECORD=8*1024*1024;
async function safePath(target){
 const resolved=path.resolve(target);let part=path.parse(resolved).root;
 for(const component of resolved.slice(part.length).split(path.sep).filter(Boolean)){
  part=path.join(part,component);
  try{need(!(await fs.lstat(part)).isSymbolicLink(),'CUSTODY_SYMLINK_REFUSED')}
  catch(e){if(e.code!=='ENOENT')throw e;break}
 }
 return resolved;
}
async function readBoundedJson(file){
 await safePath(file);
 let handle;try{handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW)}catch(e){if(e.code==='ENOENT')return null;throw e}
 try{
  const before=await handle.stat();need(before.isFile()&&before.nlink===1&&before.size<=MAX_RECORD,'CUSTODY_RECORD_FILE_INVALID');
  const buffer=Buffer.alloc(MAX_RECORD+1);let length=0;
  while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,null);if(!bytesRead)break;length+=bytesRead}
  const after=await handle.stat();
  need(length<=MAX_RECORD&&length===before.size&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'CUSTODY_RECORD_CHANGED');
  return JSON.parse(buffer.subarray(0,length));
 }finally{await handle.close()}
}
async function readRecord(file,coordinate){
 const row=await readBoundedJson(file);if(row===null)return null;
 const resource='bins:dataforge:'+key(coordinate);
 need(row.schema==='xiio.bins.dataforge-custody-record/v1'&&row.coordinate_ref===coordinate&&row.resource_ref===resource,'CUSTODY_RECORD_IDENTITY_INVALID');
 need(SAFE_REF.test(row.root_ref)&&row.root_ref.startsWith('dataforge://root/'),'DATAFORGE_ROOT_REF_INVALID');
 need(row.work_ref===null||(typeof row.work_ref==='string'&&SAFE_REF.test(row.work_ref)&&row.work_ref.startsWith('dataforge://work/')),'DATAFORGE_WORK_REF_INVALID');
 need(Array.isArray(row.versions)&&row.versions.length>0,'CUSTODY_VERSIONS_INVALID');
 const seen=new Set();let parent=null;
 for(const version of row.versions){
  need(version.payload&&typeof version.payload==='object'&&!Array.isArray(version.payload),'CUSTODY_PAYLOAD_INVALID');
  need(version.digest?.algorithm==='sha256'&&/^[a-f0-9]{64}$/.test(version.digest?.value)&&version.version_ref===resource+':sha256:'+version.digest.value,'CUSTODY_VERSION_IDENTITY_INVALID');
  if(version.version_ref===row.current_version_ref){
   const digest=sha({coordinate_ref:coordinate,root_ref:row.root_ref,work_ref:row.work_ref,payload:version.payload});
   need(version.digest.value===digest,'CUSTODY_DIGEST_MISMATCH');
  }
  need(!seen.has(version.version_ref)&&version.parent_version_ref===parent,'CUSTODY_LINEAGE_INVALID');
  need(version.size_bytes===Buffer.byteLength(JSON.stringify(version.payload)),'CUSTODY_SIZE_MISMATCH');
  need(Array.isArray(version.provenance_refs)&&version.provenance_refs.length>0&&version.provenance_refs.every(x=>typeof x==='string'&&x.trim()),'CUSTODY_PROVENANCE_INVALID');
  seen.add(version.version_ref);parent=version.version_ref;
 }
 need(seen.has(row.current_version_ref),'CUSTODY_CURRENT_VERSION_INVALID');
 return row;
}
async function withCoordinateLock(root,coordinate,action){
 await safePath(root);await fs.mkdir(root,{recursive:true,mode:0o700});await safePath(root);
 const locks=path.join(root,'.locks');await safePath(locks);await fs.mkdir(locks,{mode:0o700,recursive:true});
 const lock=path.join(locks,key(coordinate));let acquired=false;
 for(let i=0;i<100;i++){
  try{await fs.mkdir(lock,{mode:0o700});acquired=true;break}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,10))}
 }
 need(acquired,'CUSTODY_COORDINATE_BUSY');
 const identity=await fs.lstat(lock);
 try{return await action()}finally{
  const current=await fs.lstat(lock);need(current.ino===identity.ino&&current.dev===identity.dev&&!current.isSymbolicLink(),'CUSTODY_LOCK_CHANGED');await fs.rmdir(lock);
 }
}
async function atomicRecord(file,row){
 await safePath(file);const tmp=file+'.tmp-'+crypto.randomUUID();let handle;
 try{
  handle=await fs.open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  const bytes=JSON.stringify(row,null,2)+'\n';need(Buffer.byteLength(bytes)<=MAX_RECORD,'CUSTODY_RECORD_TOO_LARGE');await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
  await fs.rename(tmp,file);const dir=await fs.open(path.dirname(file),constants.O_RDONLY|constants.O_DIRECTORY);try{await dir.sync()}finally{await dir.close()}
 }finally{if(handle)await handle.close();await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e})}
}

export function createDataForgeCustodyStore({rootDir}={}){
 const root=path.resolve(rootDir||path.join(process.cwd(),'.xiio','runtime','dataforge-custody'));
 const records=path.join(root,'records');
 const fileFor=ref=>path.join(records,key(ref)+'.json');
 return Object.freeze({
  async health(){
   await safePath(records);await fs.mkdir(records,{recursive:true,mode:0o700});
   return {schema:'xiio.bins.dataforge-custody-health/v1',state:'READY',root_dir:root,provider_effect:false,authority_granted:false};
  },
  async put({coordinate_ref,root_ref,work_ref=null,payload,source_occurrence_ref}={}){
   const coordinate=text(coordinate_ref,'COORDINATE_REF');
   const rootRef=text(root_ref,'ROOT_REF');
   const sourceRef=text(source_occurrence_ref,'SOURCE_OCCURRENCE_REF');
   if(!SAFE_REF.test(rootRef)||!rootRef.startsWith('dataforge://root/'))throw new TypeError('DATAFORGE_ROOT_REF_INVALID');
   if(work_ref!=null&&(!SAFE_REF.test(work_ref)||!String(work_ref).startsWith('dataforge://work/')))throw new TypeError('DATAFORGE_WORK_REF_INVALID');
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new TypeError('DATAFORGE_PAYLOAD_OBJECT_REQUIRED');
   const frozenPayload=JSON.stringify(payload);need(Buffer.byteLength(frozenPayload)<=MAX_RECORD,'CUSTODY_PAYLOAD_TOO_LARGE');payload=JSON.parse(frozenPayload);
   need(payload&&typeof payload==='object'&&!Array.isArray(payload),'DATAFORGE_PAYLOAD_OBJECT_REQUIRED');
   return withCoordinateLock(root,coordinate,async()=>{
   const resourceRef='bins:dataforge:'+key(coordinate);
   const digest=sha({coordinate_ref:coordinate,root_ref:rootRef,work_ref:work_ref||null,payload});
   const versionRef=resourceRef+':sha256:'+digest;
   await safePath(records);await fs.mkdir(records,{recursive:true,mode:0o700});
   const prior=await readRecord(fileFor(coordinate),coordinate);
   need(!prior||(prior.root_ref===rootRef&&prior.work_ref===(work_ref||null)),'CUSTODY_COORDINATE_BINDING_CONFLICT');
   const versions=Array.isArray(prior?.versions)?prior.versions:[];
   const existing=versions.find(v=>v.version_ref===versionRef);
   if(existing)return {schema:'xiio.bins.dataforge-custody-write/v1',state:'IDEMPOTENT_EXISTING',resource_ref:resourceRef,version_ref:versionRef,coordinate_ref:coordinate,provider_effect:false,authority_granted:false};
   const parent=versions.at(-1)?.version_ref||null;
   compileResourceSet({
    resources:[{resource_ref:resourceRef,resource_class:'dataforge-coordinate',provenance_refs:[sourceRef],integrity:{algorithm:'sha256',value:digest},media_type:'application/vnd.xiio.dataforge+json',created_at:prior?.created_at||new Date().toISOString()}],
    bindings:[{binding_ref:'binding:dataforge:'+key(coordinate),resource_ref:resourceRef,binding_role:'bins-custodied-dataforge-coordinate',provider_ref:'provider:bins-local-runtime',provider_connection_ref:null,provider_object_ref:coordinate,location_hint:null,availability_state:'OBSERVED'}],
    versions:[...versions.map(v=>({version_ref:v.version_ref,resource_ref:resourceRef,parent_version_ref:v.parent_version_ref||null,provenance_refs:v.provenance_refs,digest:v.digest,size_bytes:v.size_bytes,media_type:v.media_type,provider_version_ref:null})),{version_ref:versionRef,resource_ref:resourceRef,parent_version_ref:parent,provenance_refs:[sourceRef],digest:{algorithm:'sha256',value:digest},size_bytes:Buffer.byteLength(JSON.stringify(payload)),media_type:'application/vnd.xiio.dataforge+json',provider_version_ref:null}]
   });
   const row={schema:'xiio.bins.dataforge-custody-record/v1',coordinate_ref:coordinate,root_ref:rootRef,work_ref:work_ref||null,resource_ref:resourceRef,created_at:prior?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),current_version_ref:versionRef,versions:[...versions,{version_ref:versionRef,parent_version_ref:parent,provenance_refs:[sourceRef],digest:{algorithm:'sha256',value:digest},size_bytes:Buffer.byteLength(JSON.stringify(payload)),media_type:'application/vnd.xiio.dataforge+json',payload:structuredClone(payload),stored_at:new Date().toISOString()}]};
   await atomicRecord(fileFor(coordinate),row);
   await readRecord(fileFor(coordinate),coordinate);
   return {schema:'xiio.bins.dataforge-custody-write/v1',state:'STORED',resource_ref:resourceRef,version_ref:versionRef,parent_version_ref:parent,coordinate_ref:coordinate,provider_effect:false,authority_granted:false,hard:['DATAFORGE_NORMALIZED!=BINS_CUSTODIED','BINS_CUSTODIED!=WARD_ADMITTED','DATAFORGE_COORDINATE!=SECOND_STUDIO_PRODUCT']};
   });
  },
  async get(coordinateRef){
   const coordinate=text(coordinateRef,'COORDINATE_REF');
   const row=await readRecord(fileFor(coordinate),coordinate);if(!row)return null;const v=row.versions.find(v=>v.version_ref===row.current_version_ref);
   return {schema:'xiio.bins.dataforge-custody-read/v1',state:'READBACK',coordinate_ref:row.coordinate_ref,root_ref:row.root_ref,work_ref:row.work_ref,resource_ref:row.resource_ref,version_ref:v.version_ref,parent_version_ref:v.parent_version_ref,payload:v.payload,digest:v.digest,provider_effect:false,authority_granted:false};
  },
  /**
   * Exact coordinate+version readback. Historical API lead: local-file-custody
   * readPreservedVersion @ b998bf1d — adapted to DataForge payload records without
   * replacing put/get semantics.
   */
  async readPreservedVersion({coordinateRef,versionRef,resourceRef=null,maxBytes=8*1024*1024}={}){
   const coordinate=text(coordinateRef,'COORDINATE_REF');
   const version=text(versionRef,'VERSION_REF');
   if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_RECORD)throw new Error('BINS_PRESERVED_READ_LIMIT_INVALID');
   const row=await readRecord(fileFor(coordinate),coordinate);
   if(!row)throw new Error('BINS_PRESERVED_RESOURCE_NOT_FOUND');
   if(resourceRef!=null&&row.resource_ref!==text(resourceRef,'RESOURCE_REF'))throw new Error('BINS_PRESERVED_RESOURCE_IDENTITY_MISMATCH');
   const matches=(Array.isArray(row.versions)?row.versions:[]).filter(v=>v.version_ref===version);
   if(matches.length!==1)throw new Error('BINS_PRESERVED_VERSION_NOT_UNIQUE_OR_MISSING');
   const selected=matches[0];
   const digest=selected.digest?.value;
   if(selected.digest?.algorithm!=='sha256'||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest)
     ||version!==row.resource_ref+':sha256:'+digest)
    throw new Error('BINS_PRESERVED_VERSION_DIGEST_INVALID');
   const bytes=Buffer.from(JSON.stringify(selected.payload));
   if(bytes.length!==selected.size_bytes)throw new Error('BINS_PRESERVED_BLOB_SIZE_MISMATCH');
   if(bytes.length>maxBytes)throw new Error('BINS_PRESERVED_BYTES_LIMIT_EXCEEDED');
   const recomputed=sha({coordinate_ref:coordinate,root_ref:row.root_ref,work_ref:row.work_ref,payload:selected.payload});
   if(recomputed!==digest)throw new Error('BINS_PRESERVED_BLOB_DIGEST_MISMATCH');
   return {
    schema:'xiio.bins.dataforge-custody-version-read/v1',
    state:'READBACK',
    coordinate_ref:row.coordinate_ref,
    root_ref:row.root_ref,
    work_ref:row.work_ref,
    resource_ref:row.resource_ref,
    version_ref:selected.version_ref,
    parent_version_ref:selected.parent_version_ref||null,
    payload:structuredClone(selected.payload),
    digest:{algorithm:'sha256',value:digest},
    size_bytes:bytes.length,
    content_bytes:bytes,
    provider_effect:false,
    authority_granted:false,
   };
  },
 });
}


export async function inspectDataForgeCustodyStore(rootDir){
 need(typeof rootDir==='string'&&path.isAbsolute(rootDir),'EXPLICIT_ABSOLUTE_CUSTODY_ROOT_REQUIRED');
 await safePath(rootDir);need((await fs.lstat(rootDir)).isDirectory(),'EXISTING_CUSTODY_ROOT_REQUIRED');
 const records=path.join(rootDir,'records');await safePath(records);
 const result={state:'READY',scan_state:'COMPLETE',records:0,entries_examined:0,unclassified_entries:0,invalid_records:0,errors:[],errors_truncated:false};
 const report=(code,name)=>{result.state='PARTIAL';result.scan_state='PARTIAL';if(result.errors.length<100)result.errors.push({code,...(name?{entry_ref:'entry:'+key(name)}:{})});else result.errors_truncated=true};
 let dir;try{need((await fs.lstat(records)).isDirectory(),'CUSTODY_RECORDS_DIRECTORY_INVALID');dir=await fs.opendir(records)}catch(e){if(e.code==='ENOENT')return result;throw e}
 let total=0;
 try{for await(const entry of dir){
  if(result.entries_examined>=10000){report('CUSTODY_RECORD_COUNT_LIMIT');break}
  result.entries_examined++;
  const name=entry.name;
  if(!/^[a-f0-9]{24}\.json$/.test(name)){result.unclassified_entries++;report('CUSTODY_UNKNOWN_RECORD_ENTRY',name);continue}
  try{
   const file=path.join(records,name);const st=await fs.lstat(file);
   need(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<=MAX_RECORD,'CUSTODY_RECORD_FILE_INVALID');
   if(total+st.size>64*1024*1024){report('CUSTODY_TOTAL_SIZE_LIMIT');break}total+=st.size;
   const row=await readBoundedJson(file);need(row!==null,'CUSTODY_RECORD_CHANGED');
   need(typeof row.coordinate_ref==='string'&&name===key(row.coordinate_ref)+'.json','CUSTODY_RECORD_FILENAME_MISMATCH');
   await readRecord(file,row.coordinate_ref);result.records++;
  }catch(e){result.invalid_records++;const code=/^(CUSTODY|DATAFORGE)_[A-Z_]+$/.test(e.message)?e.message:'CUSTODY_RECORD_UNREADABLE_OR_INVALID';report(code,name)}
 }}catch(e){report('CUSTODY_INDEX_READ_FAILED')}
 return result;
}
