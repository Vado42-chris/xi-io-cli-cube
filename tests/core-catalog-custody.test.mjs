import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const source=path.join(root,'native/hex/cli-source');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'packaged-source.json'),'utf8'));
const historicalSource=path.join(root,'tests/fixtures/cli-launcher-repair-pr15');
const historical=JSON.parse(fs.readFileSync(path.join(historicalSource,'SOURCE.json'),'utf8'));
const historicalFiles=Object.keys(historical.files).filter(f=>/^(?:src|config|scripts)\//.test(f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function snapshot(directory){
 const rows={};
 function visit(p,rel){
  const s=fs.lstatSync(p,{bigint:true});
  rows[rel]={mode:Number(s.mode&0o777n),uid:String(s.uid),gid:String(s.gid),ino:String(s.ino),dev:String(s.dev),nlink:String(s.nlink),mtime:String(s.mtimeNs),bytes:s.isFile()?sha(fs.readFileSync(p)):null};
  if(s.isDirectory())for(const name of fs.readdirSync(p))visit(path.join(p,name),rel?rel+'/'+name:name);
 }
 visit(directory,'');return rows;
}
for(const mask of ['002','022'])test(`actual offline producer gives only new generation private custody under umask${mask}`,()=>{
 assert.equal(historical.ref,'0f2b444abbe8f7a99c5f4520b1222c568eba6dd1');
 assert.equal(historical.modified,false);assert.equal(historicalFiles.length,6);
 for(const [rel,row] of Object.entries(historical.files)){
  const bytes=fs.readFileSync(path.join(historicalSource,rel));
  assert.equal(bytes.length,row.size,rel);assert.equal(sha(bytes),row.sha256,rel);
 }
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'hex-catalog-custody-'));
 try{
  const prefix=path.join(home,'cli'),bin=path.join(home,'bin'),hook=path.join(home,'deny-network.mjs'),trace=path.join(home,'network.jsonl');
  // Instrument fixture child processes only. Production installer/resources are
  // unmodified, and no provider/network response is supplied as acceptance.
  fs.writeFileSync(hook,`import fs from'node:fs';import cp from'node:child_process';import http from'node:http';import https from'node:https';import net from'node:net';import tls from'node:tls';import dgram from'node:dgram';import{syncBuiltinESMExports}from'node:module';const deny=(...a)=>{fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({url:typeof a[0]==='string'?a[0]:null})+'\\n');throw Error('FIXTURE_NETWORK_DENIED')};globalThis.fetch=http.get=http.request=https.get=https.request=net.connect=net.createConnection=tls.connect=dgram.createSocket=deny;const real=cp.spawnSync;cp.spawnSync=function(c,a,o={}){return real(c,a,{...o,env:{...(o.env||process.env),NODE_OPTIONS:${JSON.stringify('--import='+hook)}}})};syncBuiltinESMExports();`);
  const gh=path.join(home,'offline-gh');
  fs.writeFileSync(gh,`#!/usr/bin/python3\nimport pathlib,sys\nu=next(x for x in sys.argv[1:] if x.startswith('repos/'))\nif '/commits/' in u:\n assert u.rsplit('/',1)[1] == ${JSON.stringify(historical.ref)}\n print(${JSON.stringify(historical.ref)})\nelse:\n rel=u.split('/contents/',1)[1].split('?',1)[0]\n assert rel in ${JSON.stringify(historicalFiles)}\n assert u.split('?ref=',1)[1] == ${JSON.stringify(historical.ref)}\n sys.stdout.buffer.write((pathlib.Path(${JSON.stringify(historicalSource)})/rel).read_bytes())\n`,{mode:0o700});
  const env={HOME:home,PATH:path.dirname(process.execPath)+':/usr/bin:/bin',LANG:'C.UTF-8',XIIO_CONFIG_DIR:path.join(home,'config'),XIIO_SANDBOX:'off',XIIO_GH:gh,NODE_OPTIONS:'--import='+hook};
  function install(program,umask,packaged){
   const r=spawnSync('/bin/sh',['-c','umask "$1"; shift; exec "$@"','fixture',umask,process.execPath,path.join(source,program),...(packaged?['--packaged-source',source]:[]),'--ref',packaged?manifest.source_sha:historical.ref,'--prefix',prefix,'--bin-dir',bin],{env,encoding:'utf8',timeout:90000});
   assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return JSON.parse(r.stdout);
  }
  // Frozen existing canonical resource exercises its historical normal-install
  // writer AND its exact six-file fixture, never today's seven-file payload.
  // It produces real 0664/0644 files without manually chmodding a catalog.
  const canonical=path.join(source,'launcher-repair.install.mjs');
  assert.equal(sha(fs.readFileSync(canonical)),'61fd09c0d0de09fb2b3aec4e94b34d013cd35ddc60eb44f86443a5d2b5812a4d');
  const a=install('launcher-repair.install.mjs','002',false);
  const b=install('launcher-repair.install.mjs','022',false);
  assert.equal(a.source_sha,historical.ref);assert.equal(b.source_sha,historical.ref);
  const versions=path.join(prefix,'versions'),oldA=path.join(versions,a.generation),oldB=path.join(versions,b.generation);
  assert.equal(fs.statSync(path.join(oldA,'config/service-catalog.json')).mode&0o777,0o664);
  assert.equal(fs.statSync(path.join(oldB,'config/service-catalog.json')).mode&0o777,0o644);
  for(const prior of [oldA,oldB])assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(prior,'install-receipt.json'),'utf8')).files).sort(),[...historicalFiles].sort());
  const priorA=snapshot(oldA),priorB=snapshot(oldB),launcher=path.join(bin,'xi-io-cli'),beforeLauncher=snapshot(launcher);
  const c=install('install.mjs',mask,true),fresh=path.join(versions,c.generation);
  assert.equal(c.state,'PASS');assert.equal(c.source_sha,manifest.source_sha);
  assert.deepEqual(snapshot(oldA),priorA);assert.deepEqual(snapshot(oldB),priorB);assert.deepEqual(snapshot(launcher),beforeLauncher);
  assert.equal(fs.readFileSync(path.join(prefix,'current'),'utf8').trim(),c.generation);
  assert.equal(fs.readFileSync(path.join(prefix,'previous'),'utf8').trim(),b.generation);
  assert.deepEqual(fs.readdirSync(versions).sort(),[a.generation,b.generation,c.generation].sort());
  assert.equal(fs.statSync(path.join(fresh,'config/service-catalog.json')).mode&0o777,0o600,'new installed core catalog must be0600');
  for(const [rel,row] of Object.entries(snapshot(fresh))){
   assert.equal(row.mode,row.bytes===null?0o700:0o600,rel);
   if(manifest.files[rel])assert.equal(row.bytes,manifest.files[rel].sha256,rel);
  }
  const r=spawnSync(launcher,['version'],{env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);
  const version=JSON.parse(r.stdout);assert.equal(version.state,'PASS');assert.equal(version.integrity_verified,true);assert.equal(version.generation,c.generation);
  assert.equal(fs.existsSync(path.join(home,'config/device.json')),false);
  if(fs.existsSync(trace))for(const line of fs.readFileSync(trace,'utf8').trim().split('\n'))assert.equal(JSON.parse(line).url,'http://127.0.0.1:11434/api/tags');
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
