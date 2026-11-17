import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/cli-payload-current.yml'),'utf8');
const deliveryDirectories=['native/hex/cli-source','native/hex'];
const adapterNames=['test_adapter.py','test_connection_delivery.py','test_launcher_repair.py'];
const deliveryNames=deliveryDirectories.flatMap(directory=>
 fs.readdirSync(path.join(ROOT,directory),{withFileTypes:true})
  .filter(entry=>entry.isFile()&&/^test_.*\.py$/.test(entry.name))
  .map(entry=>directory+'/'+entry.name));
const expectedNames=[...deliveryNames,...adapterNames.map(name=>'native/hex/adapter/'+name)].sort();

function qualificationBody(){
 const step=workflow.split('      - name: Qualify receiving CLI package\n')[1]?.split('\n      - name: ')[0];
 assert.ok(step,'the receiving-package qualification step must exist');
 assert.match(step,/^        shell: bash$/m);
 assert.doesNotMatch(step,/continue-on-error|^        if:/m);
 const run=step.split('        run: |\n')[1];
 assert.ok(run,'the qualification step must have an executable shell body');
 return run.trimEnd().split('\n').map(line=>{
  assert.ok(!line.trim()||line.startsWith('          '),'unexpected qualification indentation');
  return line.slice(10);
 }).join('\n');
}

function triggerPatterns(){
 const lines=workflow.split('\n');
 const start=lines.indexOf('  pull_request:');
 assert.notEqual(start,-1,'pull-request qualification must be configured');
 const section=[];
 for(const line of lines.slice(start+1)){
  if(line.trim()&&/^(?:\S| {2}\S)/.test(line))break;
  section.push(line);
 }
 assert.ok(section.includes('    paths:'),'the pull-request paths must be explicit');
 return section.flatMap(line=>{
  const match=line.match(/^      - ['"]([^'"]+)['"]$/);
  return match?[match[1]]:[];
 });
}

function matchesPath(pattern,filename){
 const literal=value=>value.replace(/[.+?^${}()|[\]\\]/g,'\\$&');
 const expression=pattern.split('**').map(part=>part.split('*').map(literal).join('[^/]*')).join('.*');
 return new RegExp('^'+expression+'$').test(filename);
}

// Only inert Python unittest files and empty JavaScript modules are generated.
// This executes the workflow wiring, never an installer, model or network call.
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-hex-qualification-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const marker=path.join(root,'executed.jsonl');
 for(const directory of [...deliveryDirectories,'native/hex/cli-source/src','native/hex/adapter/kernel']){
  fs.mkdirSync(path.join(root,directory),{recursive:true});
 }
 for(const relative of ['native/hex/cli-source/src/xiio.mjs','native/hex/cli-source/install.mjs']){
  fs.writeFileSync(path.join(root,relative),'export {};\n');
 }
 const add=(relative,fails=false)=>{
  const file=path.join(root,relative);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const adapter=relative.startsWith('native/hex/adapter/');
  const expectedPythonPath=[path.join(root,'native/hex/adapter'),path.join(root,'native/hex/adapter/kernel')].join(path.delimiter);
  fs.writeFileSync(file,[
   'import json, os, unittest',
   'class QualificationFixture(unittest.TestCase):',
   ' def test_qualifies(self):',
   `  with open(${JSON.stringify(marker)}, 'a', encoding='utf-8') as output:`,
   `   output.write(json.dumps({'name': ${JSON.stringify(relative)}, 'pid': os.getpid()}) + '\\n')`,
   ...(adapter?[`  self.assertEqual(os.environ.get('PYTHONPATH'), ${JSON.stringify(expectedPythonPath)})`]:[]),
   `  self.assertEqual(${fails?'1':'0'}, 0, 'inert failure propagation control')`,
   "if __name__ == '__main__': unittest.main()",
   '',
  ].join('\n'));
 };
 for(const relative of expectedNames)add(relative);
 const env={...process.env,PWD:root,NODE_OPTIONS:'',PYTHONDONTWRITEBYTECODE:'1',
  PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH};
 delete env.NODE_TEST_CONTEXT;
 const run=()=>{
  fs.rmSync(marker,{force:true});
  const result=spawnSync('bash',['-c',qualificationBody()],{cwd:root,env,encoding:'utf8',timeout:30000});
  assert.equal(result.error,undefined,result.error?.message);
  const rows=fs.existsSync(marker)?fs.readFileSync(marker,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
  return {...result,rows,executed:rows.map(row=>row.name).sort()};
 };
 return {root,add,run};
}

test('receiving qualification follows the existing process owners and delivery boundary',()=>{
 const entry=fs.readFileSync(path.join(ROOT,'AGENTS.md'),'utf8');
 for(const link of [
  'https://github.com/Vado42-chris/xi-io-cli-cube/pull/19',
  'https://github.com/Vado42-chris/xi-io-cli/issues/12',
  'https://github.com/Vado42-chris/xi-io.net/issues/300',
  'https://github.com/Vado42-chris/xi-io.net/issues/319',
  'https://github.com/Vado42-chris/xi-io.net/blob/main/docs/crash-recovery-standard-v1.md',
  'https://github.com/Vado42-chris/xi-io.net/blob/main/docs/framework/agent-cost-local-first-v1.md',
 ])assert.ok(entry.includes(link),'missing existing owner: '+link);
 for(const obligation of [
  /Commit and push each validated unit immediately; never batch/,
  /same branch\/PR/,
  /independent exact-head review/,
  /Read back merged main/,
  /not downstream adoption or RETURN\/APPLY_RETURN/,
  /Retirement-eligible is not deleted/,
  /creates no admission/,
 ])assert.match(entry.replace(/\s+/g,' '),obligation);
});

test('workflow triggers include receiving sources, controls and onboarding',()=>{
 const patterns=triggerPatterns();
 for(const filename of [
  'AGENTS.md','.github/workflows/cli-payload-current.yml','tests/cli-payload-qualification.test.mjs',
  'native/hex/cli-source/install.mjs','native/hex/cli-source/packaged-source.json',
  'native/hex/cli-source/test_future_delivery.py','native/hex/test_future_discovery.py',
  'native/hex/download-install-cli.py','native/hex/compose-cli-packaged-source.py',
  'native/hex/COMPOSED-packaged-source.receipt.json','native/hex/hotfolder-update-consumer.py',
  'native/hex/adapter/installer_adapter.py','native/hex/adapter/kernel/xiio_installer/discovery.py',
  'tests/fixtures/cli-launcher-repair-pr15/future-control.json',
 ])assert.ok(patterns.some(pattern=>matchesPath(pattern,filename)),'qualification does not trigger for '+filename);
});

test('workflow executes this guard and keeps shell failures fatal',()=>{
 assert.match(workflow,/(?:^        run: |^          )node --test tests\/cli-payload-qualification\.test\.mjs$/m);
 assert.match(qualificationBody(),/^set -euo pipefail$/m);
 assert.doesNotMatch(workflow,/continue-on-error:\s*true/);
});

test('actual qualification visits every current suite once in separate processes',t=>{
 const result=fixture(t).run();
 assert.equal(result.status,0,result.stdout+result.stderr);
 assert.deepEqual(result.executed,expectedNames,'a receiving suite was omitted or repeated');
 assert.equal(new Set(result.rows.map(row=>row.pid)).size,expectedNames.length,
  'receiving suites must not share Python module state');
});

test('new passing suites are discovered in both delivery directories',t=>{
 const f=fixture(t),added=deliveryDirectories.map(directory=>directory+'/test_zz_added_passing.py');
 for(const relative of added){assert.ok(!expectedNames.includes(relative));f.add(relative);}
 const result=f.run();
 assert.equal(result.status,0,result.stdout+result.stderr);
 assert.deepEqual(result.executed,[...expectedNames,...added].sort());
});

for(const directory of deliveryDirectories){
 test(`a newly added failing suite in ${directory} fails the actual qualification`,t=>{
  const f=fixture(t),added=directory+'/test_zz_added_failing.py';
  assert.ok(!expectedNames.includes(added));f.add(added,true);
  const result=f.run();
  assert.ok(result.executed.includes(added),'the added failing suite never ran');
  assert.equal(result.status,1,'suite failure was hidden: '+result.stdout+result.stderr);
 });
 for(const state of ['empty','missing'])test(`${state} ${directory} cannot qualify`,t=>{
  const f=fixture(t);
  if(state==='missing')fs.rmSync(path.join(f.root,directory),{recursive:true,force:true});
  else for(const relative of deliveryNames.filter(name=>path.posix.dirname(name)===directory)){
   fs.rmSync(path.join(f.root,relative));
  }
  const result=f.run();
  assert.notEqual(result.status,0,'an absent receiving denominator was treated as passing');
 });
}

for(const name of adapterNames){
 const relative='native/hex/adapter/'+name;
 test(`failure in required ${name} fails the actual qualification`,t=>{
  const f=fixture(t);f.add(relative,true);
  const result=f.run();
  assert.ok(result.executed.includes(relative),'the required adapter suite never ran');
  assert.equal(result.status,1,'adapter failure was hidden: '+result.stdout+result.stderr);
 });
 test(`missing required ${name} cannot qualify with zero tests`,t=>{
  const f=fixture(t);fs.rmSync(path.join(f.root,relative));
  const result=f.run();
  assert.notEqual(result.status,0,'missing adapter suite silently passed unittest discovery');
 });
}
