import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {SourceTextModule} from 'node:vm';
const root=new URL('../dist/',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const source=readFileSync(new URL(html.match(/<script[^>]+src="([^"]+)"/)[1].replace(/^\//,''),root),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,35));
// Real compiled React controls, fixture IPC only. Not native or host acceptance.
test('repair controls require approval, dispatch once and retain uncertain outcome',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://hex.fixture.invalid',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole().sendTo(console)});
 const w=dom.window;const requests=[];let finish;
 w.matchMedia=media=>({media,matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 w.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
 w.__TAURI__={core:{invoke:async(command,args)=>{
  if(command==='native_product_window')return {};
  assert.equal(command,'installer_request');const req=args.request;requests.push(req);
  if(req.action==='inspect')return {ok:true,result:{plans:[],prefix_suggestion:'/existing/cli',node_suggestion:'/existing/node',bin_dir_suggestion:'/existing/bin'}};
  if(req.action==='prepare_repair')return {ok:true,result:{kind:'launcher_repair',plan_id:'p',phase:'PREPARED_REPAIR_NOT_APPLIED',approval_digest:'digest',prefix:'/existing/cli',node:{version:'v22.23.2',path:'/existing/node',sha256:'s'}}};
  if(req.action==='apply_repair')return await new Promise(resolve=>{finish=resolve;});
  throw Error('unexpected '+req.action);
 }}};
 try{
  const mod=new SourceTextModule(source,{context:dom.getInternalVMContext(),importModuleDynamically:async()=>{throw Error('ARTCRAFT_TEST_EXECUTOR_NO_WASM');}});await mod.link(()=>{throw Error('external module');});await mod.evaluate();await pause();
  const shadow=w.document.querySelector('[data-hex-product-content]').shadowRoot;
  const rail=text=>Array.from(w.document.querySelectorAll('[data-window-rail-tabs] button')).find(b=>b.getAttribute('aria-label')===text);
  const panel=shadow.querySelector('[aria-label="Native HEX installer"]');assert.ok(panel);
  assert.ok(panel.closest('[hidden]'),'Software retains one hidden installer before navigation');
  rail('Install').click();await pause();assert.equal(panel.closest('[hidden]'),null);
  assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'),panel);
  assert.doesNotMatch(shadow.textContent,/Tools & Diagnostics|XI-IO Ecosystem Component Catalog/);
  const label=text=>Array.from(panel.querySelectorAll('label')).find(l=>l.textContent.includes(text));
  label('Repair only the existing CLI launcher').querySelector('input').click();await pause();
  const button=text=>Array.from(panel.querySelectorAll('button')).find(b=>b.textContent.includes(text));
  button('Check selected Node').click();await pause();
  assert.equal(requests.at(-1).action,'prepare_repair');assert.equal(requests.at(-1).bin_dir,'/existing/bin');
  assert.equal(button('Repair this existing launcher').disabled,true);
  label('I approve only the displayed launcher repair').querySelector('input').click();await pause();
  const node=panel.querySelector('[aria-label="Node executable"]');
  assert.equal(node.value,'/existing/node');
  const approval=label('I approve only the displayed launcher repair').querySelector('input');
  assert.equal(approval.checked,true);
  assert.equal(requests.filter(r=>r.action==='inspect').length,1,'only the installer inspects before Tools is opened');
  // Keep exact plan, runtime and consent while visiting another product and tools.
  for(const view of ['Tools','Maths','Software']){rail(view).click();await pause();assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'),panel);}
  // Existing local tool panels inspect when Tools is first visited. Product
  // navigation after that visit must not remount or reinspect the installer.
  const inspectionsAfterTools=requests.filter(r=>r.action==='inspect').length;
  assert.ok(shadow.querySelector('canvas[aria-label="HEX software marketplace"]'));
  assert.equal(shadow.querySelector('[data-hex-microsites]'),null);
  assert.ok(panel.closest('[hidden]'));
  rail('Install').click();await pause();
  assert.equal(panel.closest('[hidden]'),null);
  assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'),panel);
  assert.equal(panel.querySelector('[aria-label="Node executable"]'),node);
  assert.equal(node.value,'/existing/node');assert.equal(approval.checked,true);
  assert.match(panel.querySelector('[aria-label="Exact reviewed plan and receipts"]').textContent,/"plan_id": "p"/);
  assert.equal(requests.filter(r=>r.action==='prepare_repair').length,1);
  assert.equal(requests.filter(r=>r.action==='inspect').length,inspectionsAfterTools,'Software/Install view changes never remount/reinspect');
  assert.equal(requests.filter(r=>r.action==='apply_repair'||r.action==='apply'||r.action==='launch_cli').length,0,'navigation does not execute the approved plan');
  const apply=button('Repair this existing launcher');assert.equal(apply.disabled,false);apply.click();apply.click();await pause();
  assert.equal(requests.filter(r=>r.action==='apply_repair').length,1);assert.equal(apply.isConnected,false);assert.equal(button('Repair this existing launcher'),undefined);
  finish({ok:true,result:{plan_id:'p',phase:'LAUNCHER_REPAIR_OUTCOME_UNCERTAIN',do_not_retry:true}});await pause();
  assert.match(panel.textContent,/Outcome uncertain/);assert.equal(button('Repair this existing launcher'),undefined);
  rail('Software').click();await pause();rail('Install').click();await pause();
  assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'),panel);
  assert.match(panel.textContent,/Outcome uncertain/);assert.equal(button('Repair this existing launcher'),undefined);
  assert.ok(button('Check actual state'));assert.ok(!requests.some(r=>r.action==='apply'||r.action==='launch_cli'));
  assert.ok(Array.from(panel.querySelectorAll('button')).every(b=>b.textContent.trim()!=='Open XI-IO CLI'||b.disabled),'uncertain binding cannot launch');
  assert.doesNotMatch(shadow.textContent,/Tools & Diagnostics|XI-IO Ecosystem Component Catalog/);
 }finally{dom.window.close();}
});

// Actual built Open control, fixture IPC only. The PID below is fixture data,
// not a terminal/process launch or installed-host acceptance.
for (const phase of ['INSTALLED_READBACK_VERIFIED', 'LAUNCHER_REPAIR_READBACK_VERIFIED']) {
 test('Open requires fresh readback, dispatches once and retains the ' + phase + ' plan', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'https://hex.fixture.invalid', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:new VirtualConsole().sendTo(console)});
  const w = dom.window, requests = [], directoryRequests = [];
  const directoryResults = [null, '/fixture/project', null];
  w.matchMedia = media => ({media, matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
  w.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  const installedPlan = {
   plan_id:'fixture-installed-plan', phase, approval_digest:'a'.repeat(64),
   ...(phase === 'LAUNCHER_REPAIR_READBACK_VERIFIED' ? {kind:'launcher_repair'} : {}),
   prefix:'/fixture/cli', components:['cli'], generation:'fixture-generation',
   node:{version:'v24.11.1', path:'/fixture/node', sha256:'b'.repeat(64)},
   connection:{required:true, source:{ref:'c'.repeat(40)}, manifest_sha256:'d'.repeat(64), payload_files:1},
   do_not_retry:false,
  };
  let readback = installedPlan, finishLaunch;
  const invoke = async (command, args) => {
   if (command === 'native_product_window') return {maximized:false, fullscreen:false};
   if (command === 'native_select_directory') {
    const request = JSON.parse(JSON.stringify(args)); directoryRequests.push(request);
    assert.deepEqual(request, {purpose:'workspace'});
    const path = directoryResults.shift(); assert.notEqual(path, undefined, 'only the requested folder selections occur');
    return path === null ? {cancelled:true} : {cancelled:false, path};
   }
   assert.equal(command, 'installer_request');
   const req = JSON.parse(JSON.stringify(args.request)); requests.push(req);
   if (req.action === 'inspect' && !req.plan_id) return {ok:true, result:{plans:[installedPlan], prefix_suggestion:'/fixture/cli', node_suggestion:'/fixture/node'}};
   if (req.action === 'inspect') {assert.equal(req.plan_id, installedPlan.plan_id); return {ok:true, result:installedPlan};}
   if (req.action === 'readback') {assert.deepEqual(req, {action:'readback', plan_id:installedPlan.plan_id}); return {ok:true, result:readback};}
   if (req.action === 'launch_cli') return await new Promise(resolve => {finishLaunch = resolve;});
   throw Error('Unexpected installer action: ' + req.action);
  };
  w.__TAURI__ = {core:{invoke}}; w.__TAURI_INTERNALS__ = {invoke};
  try {
   const mod = new SourceTextModule(source, {context:dom.getInternalVMContext(),importModuleDynamically:async()=>{throw Error('ARTCRAFT_TEST_EXECUTOR_NO_WASM');}});
   await mod.link(() => {throw Error('external module');}); await mod.evaluate(); await pause();
   const shadow = w.document.querySelector('[data-hex-product-content]').shadowRoot;
   const panel = shadow.querySelector('[aria-label="Native HEX installer"]'); assert.ok(panel);
   const rail = label => [...w.document.querySelectorAll('[data-window-rail-tabs] button')].find(el => el.getAttribute('aria-label') === label);
   const button = label => [...panel.querySelectorAll('button')].find(el => el.textContent.trim() === label);
   const launchCount = () => requests.filter(req => req.action === 'launch_cli').length;
   const planBytes = () => panel.querySelector('[aria-label="Exact reviewed plan and receipts"]')?.textContent;
   const cannotOpen = () => assert.ok(!button('Open XI-IO CLI') || button('Open XI-IO CLI').disabled, 'fresh eligible installed state is required');
   async function click(el) {assert.ok(el, 'requested control exists'); el.click(); await pause();}

   assert.equal(launchCount(), 0);
   assert.ok(shadow.querySelector('canvas[aria-label="HEX software marketplace"]'));
   await click(rail('Install'));
   assert.equal(launchCount(), 0, 'product navigation never launches');
   const history = panel.querySelector('[aria-label="Saved installation and repair history"]'); assert.ok(history);
   history.closest('details').open = true; await click(history.querySelector('button'));
   assert.equal(JSON.parse(planBytes()).plan_id, installedPlan.plan_id);
   cannotOpen(); assert.equal(launchCount(), 0, 'historical verified phase is not current readback');
   readback = installedPlan; await click(button('Check actual state'));
   cannotOpen(); assert.equal(launchCount(), 0, 'an observed installation still needs an explicit project folder');
   const project = panel.querySelector('[aria-label="CLI project folder"]');
   assert.ok(project && project.readOnly, 'project selection uses the existing native directory picker');
   assert.equal(project.value, '');
   const beforeProjectSelection = planBytes();
   await click(button('Choose CLI project folder'));
   assert.equal(project.value, '', 'cancelling an empty selection keeps it empty'); cannotOpen();
   await click(button('Choose CLI project folder'));
   assert.equal(project.value, '/fixture/project');
   assert.equal(launchCount(), 0, 'selecting a project alone never launches');
   await click(button('Choose CLI project folder'));
   assert.equal(project.value, '/fixture/project', 'cancelling preserves the previous project folder');
   assert.equal(planBytes(), beforeProjectSelection, 'folder selection does not change installation evidence');
   assert.equal(directoryRequests.length, 3); assert.equal(directoryResults.length, 0);
   await click(history.querySelector('button'));
   cannotOpen(); assert.equal(project.value, '/fixture/project', 'historical plan selection retains the separate project folder');
   // A fresh receipt still needs a complete runtime binding and plan digest.
   readback = {...installedPlan, node:{...installedPlan.node, sha256:''}};
   await click(button('Check actual state')); cannotOpen();
   readback = {...installedPlan, approval_digest:''};
   await click(button('Check actual state')); cannotOpen();
   readback = installedPlan; await click(button('Check actual state'));
   const savedPlan = planBytes();
   const open = button('Open XI-IO CLI'); assert.ok(open && !open.disabled);
   open.click(); open.click(); await pause();
   assert.equal(launchCount(), 1, 'double click dispatches one finite request');
   assert.deepEqual(requests.filter(req => req.action === 'launch_cli')[0], {action:'launch_cli', plan_id:installedPlan.plan_id, approval_digest:installedPlan.approval_digest, workspace:'/fixture/project', approved:true});
   assert.equal(planBytes(), savedPlan, 'pending launch preserves the installation plan'); cannotOpen();
   await click(rail('Software')); await click(rail('Install'));
   assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'), panel);
   assert.equal(panel.querySelector('[aria-label="CLI project folder"]'), project);
   assert.equal(project.value, '/fixture/project', 'product navigation retains the selected project folder');
   cannotOpen(); assert.equal(launchCount(), 1); assert.equal(typeof finishLaunch, 'function');
   finishLaunch({ok:true, result:{schema:'xiio.hex.cli-launch/v1', state:'CLI_LAUNCH_REQUESTED', plan_id:installedPlan.plan_id, generation:'fixture-generation', source_sha:'e'.repeat(40), pid:4242, launcher:'/fixture/bin/xi-io', terminal:'/fixture/bin/terminal', workspace:'/fixture/project', launch_requested:true, runtime_ready:false}});
   await pause();
   assert.equal(planBytes(), savedPlan, 'launch receipt is stored separately from the saved plan');
   assert.equal(JSON.parse(planBytes()).phase, phase);
   assert.match(panel.textContent, /Terminal launch requested for generation fixture-generation/);
   for (const failedResult of [
    {ok:false, error:'INSTALLED_STATE_DRIFT'},
    {ok:true, result:{phase:'CLI_LAUNCH_OUTCOME_UNCERTAIN', do_not_retry:true}},
   ]) {
    await click(button('Check actual state'));
    const retry = button('Open XI-IO CLI'); assert.ok(retry && !retry.disabled);
    const before = launchCount(); retry.click(); await pause(); assert.equal(launchCount(), before + 1);
    finishLaunch(failedResult); await pause(); cannotOpen();
    assert.equal(planBytes(), savedPlan, 'failed or ambiguous launch preserves the original plan');
    if (failedResult.result?.phase === 'CLI_LAUNCH_OUTCOME_UNCERTAIN') {
     const disclosure = [...panel.querySelectorAll('details')].find(el => el.querySelector('summary')?.textContent === 'Launch result');
     assert.ok(disclosure, 'the native phase-based ambiguity receipt remains inspectable');
     assert.deepEqual(JSON.parse(disclosure.querySelector('pre').textContent), failedResult.result);
    }
    button('Open XI-IO CLI')?.click(); await pause();
    assert.equal(launchCount(), before + 1, 'launch cannot retry before readback');
    await click(rail('Software')); await click(rail('Install'));
    cannotOpen(); assert.equal(launchCount(), before + 1, 'navigation cannot clear the launch block');
    assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'), panel);
   }
   await click(button('Check actual state'));
   assert.equal(button('Open XI-IO CLI')?.disabled, false, 'separate fresh readback restores eligibility');
   assert.ok(requests.every(req => ['inspect','readback','launch_cli'].includes(req.action)), 'Open does not install, roll back or start a service');
   assert.ok(requests.filter(req => req.action === 'launch_cli').every(req => req.workspace === '/fixture/project'), 'each finite launch uses the explicitly selected project folder');
   assert.doesNotMatch(shadow.textContent, /Tools & Diagnostics|XI-IO Ecosystem Component Catalog/);
  } finally { w.close(); }
 });
}
