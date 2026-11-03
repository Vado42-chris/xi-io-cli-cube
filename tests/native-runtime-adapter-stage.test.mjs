import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const adapter=join(root,'native/hex/adapter');
const generated=join(root,'native/hex/carrier/runtime-adapter');
const expected=[
 'child_bundle.py','connection_profile.py','install_preflight.py',
 'installer_adapter.py','local_step_actions.py','local_steps/local_ai_status.mjs',
 'local_steps/safe_task.mjs','kernel/xiio_installer/__init__.py',
 'kernel/xiio_installer/cli.py','kernel/xiio_installer/diagnostics.py',
 'kernel/xiio_installer/discovery.py','kernel/xiio_installer/manifest.py',
 'kernel/xiio_installer/observability.py','kernel/xiio_installer/redaction.py',
 'kernel/xiio_installer/transaction.py',
].sort();
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function walk(dir){
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const p=join(dir,entry.name);
  assert.equal(entry.isSymbolicLink(),false,p);
  return entry.isDirectory()?walk(p):[relative(generated,p).replaceAll('\\','/')];
 });
}
test('stage existing canonical HEX runtime without installer, host or provider effects',()=>{
 assert.ok(existsSync(join(root,'dist/index.html')),'This test runs after npm run build, never invents dist');
 const command=spawnSync(process.execPath,['scripts/native-package.mjs','stage'],{
  cwd:root,encoding:'utf8',timeout:20000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(command.status,0,command.stderr||command.stdout);
 assert.deepEqual(walk(generated).sort(),expected);
 for(const file of expected){
  const raw=join(adapter,file),copied=join(generated,file);
  assert.equal(sha(copied),sha(raw),'runtime source mismatch '+file);
  assert.ok(lstatSync(copied).isFile());
 }
});
test('no development files are permitted in the generated adapter runtime',()=>{
 assert.ok(existsSync(generated),'Run the staged-runtime acceptance first');
 const fileNames=walk(generated);
 assert.ok(fileNames.length===15);
 for(const name of fileNames){
  assert.doesNotMatch(name,/(^|\/)(?:tests?|fixtures|__pycache__|README)(?:\/|\.|$)|\.test\.|\.spec\./i);
 }
});
test('canonical adapter still retains original tests for qualification',()=>{
 for(const name of ['test_adapter.py','test_bundle.py','test_core_bundle_native.py','README.md']){
  assert.ok(existsSync(join(adapter,name)),'editable qualification source was altered: '+name);
  assert.ok(!existsSync(join(generated,name)),'development file copied to product');
 }
});
test('existing native Tauri installer consumes staged adapter without changing CLI',()=>{
 const conf=JSON.parse(readFileSync(join(root,'native/hex/carrier/src-tauri/tauri.conf.json'),'utf8'));
 assert.deepEqual(conf.bundle.resources,{
  '../runtime-adapter/':'adapter/',
  '../../cli-source/':'cli-source/'
 });
 const code=readFileSync(join(root,'scripts/native-package.mjs'),'utf8');
 assert.match(code,/stageRuntimeAdapter\(\);/);
 assert.match(code,/RUNTIME_ADAPTER_SOURCE_UNTRUSTED/);
 assert.match(code,/RUNTIME_ADAPTER_COPY_MISMATCH/);
 assert.match(code,/pruneBytecode\(adapter\)/);
});
