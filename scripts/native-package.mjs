// Repository build wiring only. Never install a package or touch user app state.
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, lstatSync, readdirSync, rmSync, mkdirSync, mkdtempSync, renameSync, copyFileSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const carrier=join(root,'native/hex/carrier'),adapter=join(root,'native/hex/adapter');
// The original adapter remains the source of truth. Stage only runtime
// resources into the existing Tauri carrier, never touch the owner installs.
// This exact 15-file closure was independently exercised with install,
// configuration refusal, readback and rollback in Cube PR #27.
const runtimeAdapter = join(carrier,'runtime-adapter');
const runtimeAdapterFiles = Object.freeze([
  'child_bundle.py',
  'connection_profile.py',
  'install_preflight.py',
  'installer_adapter.py',
  'local_step_actions.py',
  'local_steps/local_ai_status.mjs',
  'local_steps/safe_task.mjs',
  'kernel/xiio_installer/__init__.py',
  'kernel/xiio_installer/cli.py',
  'kernel/xiio_installer/diagnostics.py',
  'kernel/xiio_installer/discovery.py',
  'kernel/xiio_installer/manifest.py',
  'kernel/xiio_installer/observability.py',
  'kernel/xiio_installer/redaction.py',
  'kernel/xiio_installer/transaction.py',
]);
function sourceBytes(file) {
 const stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0||stat.size>1048576)
   throw Error('RUNTIME_ADAPTER_SOURCE_UNTRUSTED');
 return readFileSync(file);
}
function sha(value){return createHash('sha256').update(value).digest('hex');}
function stageRuntimeAdapter(){
 const checked=new Set();
 for(const file of runtimeAdapterFiles){
  if(checked.has(file)||file.startsWith('/')||file.includes('..')||file.includes('\\'))
   throw Error('RUNTIME_ADAPTER_ALLOWLIST_INVALID');
  checked.add(file);
 }
 for(const path of [carrier, adapter, runtimeAdapter]){
  try {if(lstatSync(path).isSymbolicLink())throw Error('RUNTIME_ADAPTER_PATH_SYMLINK_REFUSED');}
  catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const stageRoot=mkdtempSync(join(carrier,'.runtime-adapter-stage-'));
 try{
  for(const file of runtimeAdapterFiles){
   const source=join(adapter,file),dest=join(stageRoot,file);
   const original=sourceBytes(source);
   mkdirSync(join(dest,'..'),{recursive:true});
   copyFileSync(source,dest);
   if(sha(sourceBytes(dest))!==sha(original))throw Error('RUNTIME_ADAPTER_COPY_MISMATCH');
  }
  // This is a generated build resource, not user data. No other files are
  // admitted. Never remove the editable canonical adapter or CLI tree.
  if(existsSync(runtimeAdapter)) {
   if(!lstatSync(runtimeAdapter).isDirectory())throw Error('RUNTIME_ADAPTER_TARGET_UNTRUSTED');
   rmSync(runtimeAdapter,{recursive:true,force:false});
  }
  renameSync(stageRoot,runtimeAdapter);
 }finally{
  if(existsSync(stageRoot))rmSync(stageRoot,{recursive:true,force:true});
 }
}

const mode=process.argv[2];
if(!['stage','check','build'].includes(mode)||process.argv.length!==3)throw Error('Use native-package.mjs stage|check|build');
function run(command,args,cwd=root){const r=spawnSync(command,args,{cwd,stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
function stage(){
 const source=join(root,'dist'),target=join(carrier,'frontend');
 if(!existsSync(join(source,'index.html')))throw Error('Build the root frontend first: npm run build');
 for(const p of [source,target])if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error('Generated frontend directory must not be a symlink');
 rmSync(target,{recursive:true,force:true});cpSync(source,target,{recursive:true});
}
function pruneBytecode(directory){
 for(const row of readdirSync(directory,{withFileTypes:true})){
  if(row.isSymbolicLink())throw Error('Adapter source must not contain symlinks');
  const p=join(directory,row.name);
  if(row.isDirectory()){if(row.name==='__pycache__')rmSync(p,{recursive:true});else pruneBytecode(p);}
 }
}
if(mode==='build')run('npm',['run','build']);
stage();
stageRuntimeAdapter();
if(mode!=='stage'){
 if(process.platform!=='linux')throw Error('Native candidate checks are Linux-qualified only');
 run('/usr/bin/python3',['-B','-m','unittest','discover','-s',adapter,'-p','test_*.py']);
 run('/usr/bin/python3',['-I','-B',join(carrier,'tests/check_contract.py')]);
 run('cargo',['test','--locked','--manifest-path',join(carrier,'src-tauri/Cargo.toml')],carrier);
 // Isolated adapter subprocesses can ignore PYTHONDONTWRITEBYTECODE; caches are not payloads.
 pruneBytecode(adapter);
}
if(mode==='build')run(process.execPath,[join(carrier,'node_modules/@tauri-apps/cli/tauri.js'),'build','--bundles','deb','--','--locked'],carrier);
