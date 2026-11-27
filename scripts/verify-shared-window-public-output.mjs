import {readFile,readdir,lstat} from 'node:fs/promises';
import {join,relative,sep} from 'node:path';

// Reject complete emitted assets, including lazy chunks. Never echo matched
// private bytes into a public build log. This is a bounded disclosure guard,
// not a replacement for qualifying the presentation import graph.
export function assertSharedWindowPublicBytes(bytes){
 const text=Buffer.from(bytes).toString('utf8');
 // Normalize the common JS/JSON slash escapes before the path check.
 const normalized=text.replace(/\\u002f|\\x2f/gi,'/').replace(/\\\//g,'/').replace(/\\{2}/g,'\\');
 if(/(?:\/(?:home|Users|media|mnt|tmp|private\/var)\/|[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|file:\/\/)/i.test(normalized)||
    /xiio\.studio\.empire-work-home\.snapshot\/v1|empireWorkHomeSnapshot|physical_examples_unchanged/.test(normalized)){
  throw Error('SHARED_WINDOW_PRIVATE_PATH_DISCLOSURE_REFUSED');
 }
}

// Provenance may name a pinned relative source file without carrying its
// contents. Permit only the exact coordinate fields in canonical generated
// JSON; every other value retains the ordinary public-byte restriction.
export function assertSharedWindowPublicProvenance(bytes){
 const text=Buffer.from(bytes).toString('utf8');
 const refuse=()=>{throw Error('SHARED_WINDOW_PRIVATE_PATH_DISCLOSURE_REFUSED');};
 let record;
 try{record=JSON.parse(text);}catch{refuse();}
 if(!record||typeof record!=='object'||Array.isArray(record))refuse();
 if(text!==JSON.stringify(record)&&text!==JSON.stringify(record,null,2)+'\n')refuse();
 const snapshot='src/lib/empireWorkHomeSnapshot.json';
 const pins=Array.isArray(record.files)?record.files.filter(row=>row?.path===snapshot):[];
 if(pins.length){
  const pin=pins[0];
  if(pins.length!==1||Object.keys(pin).sort().join(',')!=='base_git_blob,path,sha256'||
     typeof pin.base_git_blob!=='string'||! /^[a-f0-9]{40}$/.test(pin.base_git_blob)||
     typeof pin.sha256!=='string'||! /^[a-f0-9]{64}$/.test(pin.sha256))refuse();
  pin.path='pinned-source-reference';
  const projection=record.public_source_projection;
  if(projection?.input===snapshot){
   if(Object.keys(projection).sort().join(',')!=='fields,input'||
      JSON.stringify(projection.fields)!==JSON.stringify(['planes[].id','planes[].label','planes[].job','planes[].kind']))refuse();
   projection.input='pinned-source-reference';
  }
 }
 assertSharedWindowPublicBytes(JSON.stringify(record));
}

export async function verifySharedWindowPublicOutput(root){
 const names=[];
 async function walk(dir){
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   const path=join(dir,entry.name);
   const stat=await lstat(path);
   if(stat.isSymbolicLink())throw Error('SHARED_WINDOW_OUTPUT_LINK_REFUSED');
   if(stat.isDirectory()){await walk(path);continue;}
   if(!stat.isFile())throw Error('SHARED_WINDOW_OUTPUT_NOT_REGULAR');
   const name=relative(root,path).split(sep).join('/');
   const bytes=await readFile(path);
   if(name==='source-custody.json')assertSharedWindowPublicProvenance(bytes);
   else assertSharedWindowPublicBytes(bytes);
   names.push(name);
  }
 }
 await walk(root);
 for(const required of ['window-frame.mjs','window-frame.css','frame-theme.css']){
  if(!names.includes(required))throw Error('SHARED_WINDOW_REQUIRED_ASSET_MISSING');
 }
 return names;
}
