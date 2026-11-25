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
  const mod=new SourceTextModule(source,{context:dom.getInternalVMContext()});await mod.link(()=>{throw Error('external module');});await mod.evaluate();await pause();
  const shadow=w.document.querySelector('[data-hex-product-content]').shadowRoot;
  const rail=text=>Array.from(w.document.querySelectorAll('[data-window-rail-tabs] button')).find(b=>b.getAttribute('aria-label')===text);
  const slot=shadow.querySelector('[data-hex-installer-slot="cli"]');
  const panel=shadow.querySelector('[aria-label="Native HEX installer"]');assert.ok(panel&&slot);
  assert.equal(slot.hidden,true,'Library retains one hidden installer before navigation');
  rail('Install').click();await pause();assert.equal(slot.hidden,false);
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
  for(const view of ['Tools','Maths','Library']){rail(view).click();await pause();assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'),panel);}
  // Existing local tool panels inspect when Tools is first visited. Product
  // navigation after that visit must not remount or reinspect the installer.
  const inspectionsAfterTools=requests.filter(r=>r.action==='inspect').length;
  const click=async el=>{assert.ok(el);el.click();await pause();};
  const pageButton=text=>Array.from(shadow.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith(text));
  await click(shadow.querySelector('[data-product-id="publisher"] button'));
  await click(pageButton('View requirements'));
  assert.equal(slot.hidden,true,'Publisher requirements cannot expose the CLI plan');
  assert.ok(shadow.querySelector('[aria-label="Installation unavailable"]'));
  await click(shadow.querySelector('button[aria-label="Back to Library"]'));
  await click(shadow.querySelector('[data-product-id="cli"] button'));
  await click(pageButton('View requirements'));
  await click(pageButton('Review installation'));
  assert.equal(slot.hidden,false);assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'),panel);
  assert.equal(panel.querySelector('[aria-label="Node executable"]'),node);
  assert.equal(node.value,'/existing/node');assert.equal(approval.checked,true);
  assert.match(panel.querySelector('[aria-label="Exact reviewed plan and receipts"]').textContent,/"plan_id": "p"/);
  assert.equal(requests.filter(r=>r.action==='prepare_repair').length,1);
  assert.equal(requests.filter(r=>r.action==='inspect').length,inspectionsAfterTools,'Library/product page changes never remount/reinspect');
  assert.equal(requests.filter(r=>r.action==='apply_repair'||r.action==='apply'||r.action==='launch_cli').length,0,'navigation does not execute the approved plan');
  const apply=button('Repair this existing launcher');assert.equal(apply.disabled,false);apply.click();apply.click();await pause();
  assert.equal(requests.filter(r=>r.action==='apply_repair').length,1);assert.equal(apply.isConnected,false);assert.equal(button('Repair this existing launcher'),undefined);
  finish({ok:true,result:{plan_id:'p',phase:'LAUNCHER_REPAIR_OUTCOME_UNCERTAIN',do_not_retry:true}});await pause();
  assert.match(panel.textContent,/Outcome uncertain/);assert.equal(button('Repair this existing launcher'),undefined);
  rail('Library').click();await pause();rail('Install').click();await pause();
  assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'),panel);
  assert.match(panel.textContent,/Outcome uncertain/);assert.equal(button('Repair this existing launcher'),undefined);
  assert.ok(button('Check actual state'));assert.ok(!requests.some(r=>r.action==='apply'||r.action==='launch_cli'));
  assert.ok(Array.from(panel.querySelectorAll('button')).every(b=>b.textContent.trim()!=='Open XI-IO CLI'||b.disabled),'uncertain binding cannot launch');
  assert.doesNotMatch(shadow.textContent,/Tools & Diagnostics|XI-IO Ecosystem Component Catalog/);
 }finally{dom.window.close();}
});

