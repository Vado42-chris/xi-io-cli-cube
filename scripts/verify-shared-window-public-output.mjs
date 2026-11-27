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

export async function verifySharedWindowPublicOutput(root){
 const names=[];
 async function walk(dir){
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   const path=join(dir,entry.name);
   const stat=await lstat(path);
   if(stat.isSymbolicLink())throw Error('SHARED_WINDOW_OUTPUT_LINK_REFUSED');
   if(stat.isDirectory()){await walk(path);continue;}
   if(!stat.isFile())throw Error('SHARED_WINDOW_OUTPUT_NOT_REGULAR');
   assertSharedWindowPublicBytes(await readFile(path));
   names.push(relative(root,path).split(sep).join('/'));
  }
 }
 await walk(root);
 for(const required of ['window-frame.mjs','window-frame.css','frame-theme.css']){
  if(!names.includes(required))throw Error('SHARED_WINDOW_REQUIRED_ASSET_MISSING');
 }
 return names;
}
