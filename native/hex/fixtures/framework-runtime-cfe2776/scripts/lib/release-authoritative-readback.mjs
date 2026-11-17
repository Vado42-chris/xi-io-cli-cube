import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMAS=Object.freeze({
 release:'xiio.framework.distributable-release-projection/v1',
 adopter:'xiio.framework.release-adopter-lock/v1',
 entrypoint:'xiio.framework.entrypoint-qualification/v1',
});
const text=(v,c)=>{const s=String(v??'').trim();if(!s)throw Error(c);return s};
const safe=v=>{const s=text(v,'RELEASE_READBACK_KEY_REQUIRED');if(!/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/.test(s))throw Error('RELEASE_READBACK_KEY_INVALID');return s};
const h=v=>crypto.createHash('sha256').update(v).digest('hex');
const clone=v=>structuredClone(v);
const canonical=v=>JSON.stringify(v);

function rootOf(root){
 const out=path.resolve(root||path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'xi-io','framework','release-readback'));
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 const st=fs.lstatSync(out);if(!st.isDirectory()||st.isSymbolicLink())throw Error('RELEASE_READBACK_ROOT_UNTRUSTED');
 return out;
}
function key(kind,parts){return h([kind,...parts.map(safe)].join('|'))+'.json'}
function writeImmutable(file,value){
 const body=canonical(value)+'\n';
 if(fs.existsSync(file)){const existing=fs.readFileSync(file,'utf8');if(existing!==body)throw Error('RELEASE_READBACK_CONFLICT');return;}
 const tmp=file+'.'+process.pid+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);
 try{fs.writeFileSync(fd,body,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd)}
 fs.renameSync(tmp,file);
 const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o777)!==0o600)throw Error('RELEASE_READBACK_CUSTODY_INVALID');
 if(fs.readFileSync(file,'utf8')!==body)throw Error('RELEASE_READBACK_MISMATCH');
}
function writeCurrent(file,value){
 const body=canonical(value)+'\n';const tmp=file+'.'+process.pid+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);
 try{fs.writeFileSync(fd,body,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd)}
 fs.renameSync(tmp,file);const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o777)!==0o600||fs.readFileSync(file,'utf8')!==body)throw Error('RELEASE_READBACK_POINTER_WRITE_FAILED');
}
function read(file){
 let st;try{st=fs.lstatSync(file)}catch{throw Error('RELEASE_READBACK_NOT_FOUND')}
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o777)!==0o600)throw Error('RELEASE_READBACK_CUSTODY_INVALID');
 let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw Error('RELEASE_READBACK_INVALID')}
 return value;
}
function requireSchema(value,schema){if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==schema)throw Error('RELEASE_READBACK_SCHEMA_INVALID')}

export function persistAcceptedRelease(projection,{root}={}){
 requireSchema(projection,SCHEMAS.release);const product=safe(projection.product_ref),gen=safe(projection.release_generation);
 const file=path.join(rootOf(root),key('release',[product,gen]));writeImmutable(file,projection);
 const current=path.join(rootOf(root),key('release-current',[product]));writeCurrent(current,{schema:'xiio.framework.release-readback-pointer/v1',product_ref:product,release_generation:gen,file:path.basename(file)});
 return Object.freeze({file,product_ref:product,release_generation:gen});
}
export function persistCurrentAdopter(lock,{root}={}){
 requireSchema(lock,SCHEMAS.adopter);const consumer=safe(lock.consumer_ref),product=safe(lock.product_ref),gen=safe(lock.release_generation);
 const file=path.join(rootOf(root),key('adopter',[consumer,product,gen]));writeImmutable(file,lock);
 const current=path.join(rootOf(root),key('adopter-current',[consumer,product]));writeCurrent(current,{schema:'xiio.framework.release-readback-pointer/v1',consumer_ref:consumer,product_ref:product,release_generation:gen,file:path.basename(file)});
 return Object.freeze({file,consumer_ref:consumer,product_ref:product,release_generation:gen});
}
export function persistEntrypointQualification(receipt,{product_ref,root}={}){
 requireSchema(receipt,SCHEMAS.entrypoint);const product=safe(product_ref),gen=safe(receipt.artifact_generation);
 const file=path.join(rootOf(root),key('entrypoint',[product,gen]));writeImmutable(file,receipt);
 const current=path.join(rootOf(root),key('entrypoint-current',[product]));writeCurrent(current,{schema:'xiio.framework.release-readback-pointer/v1',product_ref:product,release_generation:gen,file:path.basename(file)});
 return Object.freeze({file,product_ref:product,release_generation:gen});
}
function pointer(root,file){const p=read(file);if(p.schema!=='xiio.framework.release-readback-pointer/v1')throw Error('RELEASE_READBACK_POINTER_INVALID');return read(path.join(root,path.basename(text(p.file,'RELEASE_READBACK_POINTER_INVALID'))))}
export function createAuthoritativeReleaseReaders({root}={}){
 const r=rootOf(root);
 return Object.freeze({
  readAcceptedRelease:async({product_ref})=>{const product=safe(product_ref);const v=pointer(r,path.join(r,key('release-current',[product])));requireSchema(v,SCHEMAS.release);if(v.product_ref!==product)throw Error('RELEASE_READBACK_PRODUCT_MISMATCH');return clone(v)},
  readCurrentAdopter:async({consumer_ref,product_ref})=>{const consumer=safe(consumer_ref),product=safe(product_ref);const v=pointer(r,path.join(r,key('adopter-current',[consumer,product])));requireSchema(v,SCHEMAS.adopter);if(v.consumer_ref!==consumer||v.product_ref!==product||v.state!=='ADOPTED_CURRENT')throw Error('ADOPTER_READBACK_NOT_CURRENT');return clone(v)},
  readEntrypointQualification:async({product_ref,release_generation})=>{const product=safe(product_ref),gen=safe(release_generation);const v=pointer(r,path.join(r,key('entrypoint-current',[product])));requireSchema(v,SCHEMAS.entrypoint);if(v.artifact_generation!==gen||v.state!=='QUALIFIED'||v.effect_authority!==false)throw Error('ENTRYPOINT_READBACK_NOT_CURRENT');return clone(v)},
 });
}
