// Repository build wiring only. Never install a package or touch user app state.
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, lstatSync, readdirSync, rmSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const carrier=join(root,'native/hex/carrier'),adapter=join(root,'native/hex/adapter');
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
if(mode!=='stage'){
 if(process.platform!=='linux')throw Error('Native candidate checks are Linux-qualified only');
 run('/usr/bin/python3',['-B','-m','unittest','discover','-s',adapter,'-p','test_*.py']);
 run('/usr/bin/python3',['-I','-B',join(carrier,'tests/check_contract.py')]);
 if(spawnSync('which',['cargo']).status===0){
  run('cargo',['test','--locked','--manifest-path',join(carrier,'src-tauri/Cargo.toml')],carrier);
 }else{
  console.log('[native:check] Cargo toolchain absent in environment; skipped carrier unit test');
 }
 // Isolated adapter subprocesses can ignore PYTHONDONTWRITEBYTECODE; caches are not payloads.
 pruneBytecode(adapter);
}
if(mode==='build')run(process.execPath,[join(carrier,'node_modules/@tauri-apps/cli/tauri.js'),'build','--bundles','deb','--','--locked'],carrier);
