import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const SHA=/^[a-f0-9]{40,64}$/;const REL=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;
const required=(v,c)=>{const s=String(v??'').trim();if(!s)throw new TypeError(c);return s};
const digest=b=>createHash('sha256').update(b).digest('hex');
function safeFile(root,relative){if(!REL.test(relative)||relative.startsWith('/')||relative.split('/').includes('..'))throw new TypeError('ENTRYPOINT_PATH_INVALID');const target=path.resolve(root,relative);const prefix=path.resolve(root)+path.sep;if(!target.startsWith(prefix))throw new TypeError('ENTRYPOINT_PATH_ESCAPE');const st=fs.lstatSync(target);if(!st.isFile()||st.isSymbolicLink())throw new TypeError('ENTRYPOINT_FILE_UNTRUSTED');return {target,st};}
const runtimes=Object.freeze({
 node:{command:process.execPath,args:file=>['--check',file]},
 python:{command:process.env.PYTHON||'python3',args:file=>['-m','py_compile',file]},
 sh:{command:process.env.SHELL_CHECK||'sh',args:file=>['-n',file]}
});
export function qualifyExecutableEntrypoints({artifact_root,artifact_generation,entrypoints,run=spawnSync}={}){
 const root=required(artifact_root,'ARTIFACT_ROOT_REQUIRED'),generation=required(artifact_generation,'ARTIFACT_GENERATION_REQUIRED');
 if(!SHA.test(generation))throw new TypeError('ARTIFACT_GENERATION_INVALID');
 const rootStat=fs.lstatSync(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new TypeError('ARTIFACT_ROOT_UNTRUSTED');
 if(!Array.isArray(entrypoints)||!entrypoints.length||entrypoints.length>64)throw new TypeError('ENTRYPOINTS_REQUIRED');
 const seen=new Set(),rows=[];
 for(const item of entrypoints){if(!item||typeof item!=='object'||Array.isArray(item))throw new TypeError('ENTRYPOINT_DECLARATION_INVALID');const relative=required(item.path,'ENTRYPOINT_PATH_REQUIRED'),runtime=required(item.runtime,'ENTRYPOINT_RUNTIME_REQUIRED');if(seen.has(relative))throw new TypeError('ENTRYPOINT_DUPLICATE');seen.add(relative);const spec=runtimes[runtime];if(!spec)throw new TypeError('ENTRYPOINT_RUNTIME_UNSUPPORTED');const {target,st}=safeFile(root,relative);const before=fs.readFileSync(target),sha=digest(before);const result=run(spec.command,spec.args(target),{cwd:root,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH||'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});if(result?.status!==0)throw new TypeError('ENTRYPOINT_QUALIFICATION_FAILED:'+relative);const after=fs.readFileSync(target);if(digest(after)!==sha||after.length!==before.length)throw new TypeError('ENTRYPOINT_CHANGED_DURING_QUALIFICATION');rows.push(Object.freeze({path:relative,runtime,sha256:sha,size:st.size,state:'QUALIFIED'}));}
 const receipt={schema:'xiio.framework.entrypoint-qualification/v1',state:'QUALIFIED',artifact_generation:generation,entrypoints:Object.freeze(rows),qualification_digest:digest(Buffer.from(JSON.stringify({generation,rows}))),effect_authority:false,provider_effect:false};
 return Object.freeze(receipt);
}
