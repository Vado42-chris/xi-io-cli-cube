// Same-host installation guards. Neither identity admission nor a remote lease.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const PAYLOAD_FILES=Object.freeze(['src/xiio.mjs','src/file-edit-cas.mjs','src/local-ops.mjs','src/sdk-provider-state.mjs','src/runtime-integrity.mjs','config/service-catalog.json','scripts/service-inventory.mjs','scripts/reconcile-service-inventory.mjs']);
export const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Preserve selected runtime lookup, home and explicit transport/auth configuration;
// never inherit interpreter preloads, dynamic loader hooks or Git config injection.
export function controlledChildEnv(source=process.env,extra={}){
  const allowed=new Set(['PATH','PATHEXT','HOME','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','LANG','LC_ALL','TERM','USER','LOGNAME','GH_TOKEN','GITHUB_TOKEN','GH_HOST','GH_CONFIG_DIR','SSH_AUTH_SOCK','XDG_RUNTIME_DIR','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME','DBUS_SESSION_BUS_ADDRESS','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS','XIIO_CONFIG_DIR','XIIO_SERVICE_CATALOG','XIIO_SANDBOX','XIIO_TEST_PLATFORM']);
  return Object.fromEntries(Object.entries({...source,...extra}).filter(([key,value])=>allowed.has(key.toUpperCase())&&typeof value==='string'));
}
export function firstLauncher(name,env=process.env,cwd=process.cwd()){
  if(typeof env.PATH!=='string')return null;
  const extensions=process.platform==='win32'?String(env.PATHEXT||'.COM;.EXE;.BAT;.CMD').split(';').filter(x=>/^\.(COM|EXE|BAT|CMD)$/i.test(x)):[''];
  for(const dir of String(env.PATH||'').split(path.delimiter))for(const ext of extensions){
    const candidate=path.resolve(cwd,dir.replace(/^"|"$/g,''),name+ext.toLowerCase());
    try{if(!fs.statSync(candidate).isFile())continue;fs.accessSync(candidate,process.platform==='win32'?fs.constants.F_OK:fs.constants.X_OK);return fs.realpathSync(candidate);}catch{}
  }
  return null;
}
// The original two-file installer (Git blob 3c9c52335e1b88d104b04823c298e1bf6d0ed1c6)
// produced suffixless names. Only these recovered exact releases are supported;
// this is not permission to accept arbitrary old receipts or missing helpers.
export const SUPPORTED_LEGACY_RELEASES=Object.freeze({
  '385c85d53f99ac2f9e6c4fecb6d3c76ee772590d':Object.freeze({
    'src/xiio.mjs':'e8ba5b3c6fe6446076da8c7671de7719edc06a854e797ba8d4740f291f75259f',
    'config/service-catalog.json':'8f9c4c8efb77c36242a81fdcf8c821e05a2ce253d320c34ce27f4b67b2a19a88'
  }),
  '16d0fb4101d0674f8bd57858ac04d7fabf02aed2':Object.freeze({
    'src/xiio.mjs':'23b55b2524302f8d46958889b4735e37f2b04ec4b994b546c7eb38a87ba6e53b',
    'config/service-catalog.json':'8f9c4c8efb77c36242a81fdcf8c821e05a2ce253d320c34ce27f4b67b2a19a88'
  })
});
const legacyGenerationName=value=>typeof value==='string'&&/^[0-9a-f]{12}-\d{8}T\d{6}Z$/.test(value);
const generationName=value=>typeof value==='string'&&(
  /^[0-9a-f]{12}-\d{8}T\d{6}Z-[A-Za-z0-9_-]+$/.test(value)||
  legacyGenerationName(value)&&Object.keys(SUPPORTED_LEGACY_RELEASES).some(sha=>value.startsWith(sha.slice(0,12)+'-'))
);
function regular(file){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('INSTALL_FILE_CUSTODY_INVALID');return st;}
export function verifyGeneration(prefix,generation){
  if(!generationName(generation))throw Error('GENERATION_NAME_INVALID');
  const versions=path.join(prefix,'versions'),root=path.join(versions,generation);
  for(const directory of [versions,root]){const st=fs.lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink())throw Error('GENERATION_DIRECTORY_INVALID');}
  regular(path.join(root,'install-receipt.json'));
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'install-receipt.json'),'utf8'));
  if(receipt.schema!=='xiio.cli.install-receipt/v2'||receipt.generation!==generation||path.resolve(receipt.prefix||'')!==path.resolve(prefix)||!(/^[0-9a-f]{40}$/).test(receipt.source_sha)||!generation.startsWith(receipt.source_sha.slice(0,12)+'-'))throw Error('GENERATION_RECEIPT_INVALID');
  if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(String(receipt.node||''))||Number(process.versions.node.split('.')[0])<22||Number(receipt.node.split('.')[0])<22||receipt.platform!==process.platform)throw Error('GENERATION_RUNTIME_INCOMPATIBLE');
  const listed=Object.keys(receipt.files||{});
  if(legacyGenerationName(generation)){
    const expected=SUPPORTED_LEGACY_RELEASES[receipt.source_sha];
    if(!expected||receipt.repo!=='Vado42-chris/xi-io-cli'||receipt.ref!==receipt.source_sha)throw Error('LEGACY_RELEASE_UNSUPPORTED');
    if(listed.length!==Object.keys(expected).length||listed.some(file=>!Object.hasOwn(expected,file)||receipt.files[file]!==expected[file]))throw Error('LEGACY_RELEASE_PAYLOAD_MISMATCH');
  }else{
    const required=PAYLOAD_FILES.filter(file=>!['src/runtime-integrity.mjs','src/local-ops.mjs','src/sdk-provider-state.mjs'].includes(file));
    if(required.some(file=>!listed.includes(file))||listed.some(file=>!PAYLOAD_FILES.includes(file)))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './runtime-integrity.mjs'")&&!listed.includes('src/runtime-integrity.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './local-ops.mjs'")&&!listed.includes('src/local-ops.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './sdk-provider-state.mjs'")&&!listed.includes('src/sdk-provider-state.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
  }
  for(const relative of listed){
    const file=path.join(root,...relative.split('/'));
    if(!/^[0-9a-f]{64}$/.test(receipt.files?.[relative]||''))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    regular(file);
    if(!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep))throw Error('GENERATION_FILE_OUTSIDE_ROOT');
    if(digest(fs.readFileSync(file))!==receipt.files[relative])throw Error('GENERATION_DIGEST_MISMATCH');
  }
  return receipt;
}
export function readGenerationPointer(prefix,name){
  if(!['current','previous'].includes(name))throw Error('POINTER_NAME_INVALID');
  const file=path.join(prefix,name);
  try{regular(file);const value=fs.readFileSync(file,'utf8').trim();if(!generationName(value))throw Error('GENERATION_NAME_INVALID');return value;}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
const journalPath=prefix=>path.join(prefix,'.pointer-transaction.json');
const lockPath=prefix=>path.join(prefix,'.pointer-transaction.lock');
export const pointerTransactionPending=prefix=>fs.existsSync(journalPath(prefix))||fs.existsSync(lockPath(prefix))||fs.existsSync(path.join(prefix,'.pointer-recovery.lock'));
function atomicPointer(prefix,name,value){
  if(value!==null&&!generationName(value))throw Error('GENERATION_NAME_INVALID');
  const file=path.join(prefix,name);if(value===null){fs.rmSync(file,{force:true});return;}
  const temp=file+'.tmp-'+process.pid+'-'+crypto.randomBytes(6).toString('hex');
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,value+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}
}
function pair(prefix){return{current:readGenerationPointer(prefix,'current'),previous:readGenerationPointer(prefix,'previous')};}
function verifyPair(prefix,value){for(const name of ['current','previous'])if(value[name]!==null)verifyGeneration(prefix,value[name]);}
function writePair(prefix,value){atomicPointer(prefix,'previous',value.previous);atomicPointer(prefix,'current',value.current);if(JSON.stringify(pair(prefix))!==JSON.stringify(value))throw Error('POINTER_READBACK_MISMATCH');}
export function commitGenerationPointers(prefix,next,expected){
  const lock=lockPath(prefix),journal=journalPath(prefix);let fd=null;
  if(pointerTransactionPending(prefix))throw Error('POINTER_TRANSACTION_PENDING');
  try{
    try{fd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('POINTER_TRANSACTION_PENDING');throw error;}
    fs.writeFileSync(fd,JSON.stringify({host:os.hostname(),pid:process.pid}));fs.fsyncSync(fd);
    if(fs.existsSync(journal)||fs.existsSync(path.join(prefix,'.pointer-recovery.lock')))throw Error('POINTER_RECOVERY_REQUIRED');
    const before=pair(prefix);
    if(JSON.stringify(before)!==JSON.stringify(expected))throw Error('POINTER_CHANGED_SINCE_APPROVAL');
    verifyPair(prefix,next);
    const jf=fs.openSync(journal,'wx',0o600);
    try{fs.writeFileSync(jf,JSON.stringify({schema:'xiio.cli.pointer-transaction/v1',before,after:next}));fs.fsyncSync(jf);}finally{fs.closeSync(jf);}
    try{writePair(prefix,next);fs.unlinkSync(journal);}catch(error){
      try{writePair(prefix,before);fs.unlinkSync(journal);}catch{throw Error('POINTER_RECOVERY_REQUIRED');}
      throw error;
    }
    return {state:'POINTERS_COMMITTED',readback:pair(prefix)};
  }finally{if(fd!==null){fs.closeSync(fd);if(!fs.existsSync(journal))fs.rmSync(lock,{force:true});}}
}
// Explicit recovery only. A live or foreign owner is never evicted. The journal
// makes an interrupted two-file update visible; it is not an atomic filesystem pair.
export function recoverGenerationPointers(prefix){
  const recovery=path.join(prefix,'.pointer-recovery.lock');let fd=null;
  try{
    try{fd=fs.openSync(recovery,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('POINTER_RECOVERY_LOCK_HELD_MANUAL_REVIEW_REQUIRED');throw error;}
    fs.writeFileSync(fd,JSON.stringify({host:os.hostname(),pid:process.pid}));fs.fsyncSync(fd);
    const lock=lockPath(prefix),journal=journalPath(prefix);
    regular(lock);const owner=JSON.parse(fs.readFileSync(lock,'utf8'));
    if(owner.host!==os.hostname()||!Number.isSafeInteger(owner.pid)||owner.pid<1)throw Error('POINTER_RECOVERY_OWNER_UNVERIFIED');
    try{process.kill(owner.pid,0);throw Error('POINTER_TRANSACTION_OWNER_ACTIVE');}catch(error){if(error.code!=='ESRCH')throw error;}
    if(!fs.existsSync(journal)){
      // No journal means no pointer mutation began, or a verified commit already
      // finished. Validate the complete current pair before clearing its dead lock.
      const observed=pair(prefix);verifyPair(prefix,observed);fs.unlinkSync(lock);
      return{state:'RECOVERED',readback:observed,reason:'DEAD_OWNER_COMPLETE_PAIR_VERIFIED'};
    }
    regular(journal);const entry=JSON.parse(fs.readFileSync(journal,'utf8'));
    if(entry.schema!=='xiio.cli.pointer-transaction/v1'||!entry.before||!Object.hasOwn(entry.before,'current')||!Object.hasOwn(entry.before,'previous'))throw Error('POINTER_RECOVERY_JOURNAL_INVALID');
    const before={current:entry.before.current,previous:entry.before.previous};verifyPair(prefix,before);writePair(prefix,before);
    fs.unlinkSync(journal);fs.unlinkSync(lock);return{state:'RECOVERED',readback:pair(prefix)};
  }finally{if(fd!==null){fs.closeSync(fd);fs.rmSync(recovery,{force:true});}}
}
