import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {SourceTextModule} from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(root+'package.json');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=readFileSync(root+'dist/index.html','utf8');
const script=readFileSync(root+'dist/'+html.match(/<script[^>]+src="([^"]+)"/)[1].replace(/^\//,''),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,40));
for(const native of [false,true])test('first Setup package truth and existing primary path, native='+native,async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://hex.fixture.invalid',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole().sendTo(console)});
 const w=dom.window,requests=[];
 w.matchMedia=media=>({media,matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 w.ResizeObserver=class{observe(){}disconnect(){}};
 if(native){const invoke=async(command,args)=>{
  if(command==='native_product_window')return {maximized:false,fullscreen:false};
  assert.equal(command,'installer_request');requests.push(JSON.parse(JSON.stringify(args)));
  assert.deepEqual(requests.at(-1),{request:{action:'inspect'}});
  return {ok:true,result:{supported_components:{cli:{available:true},bins:{available:false,reason:'NOT_PACKAGED'},switchboard:{available:false,reason:'NOT_PACKAGED'}},plans:[]}};
 };w.__TAURI__={core:{invoke}};w.__TAURI_INTERNALS__={invoke};}
 try{
  const mod=new SourceTextModule(script,{context:dom.getInternalVMContext()});await mod.link(()=>{throw Error('external');});await mod.evaluate();await pause();
  const shadow=w.document.querySelector('[data-hex-product-content]').shadowRoot;
  const setup=shadow.querySelector('[aria-label="Software available in this build"]');assert.ok(setup);
  assert.match(setup.textContent,/Nothing is installed until you approve the plan/);
  assert.match(setup.textContent,/not proof of an installation/);assert.match(setup.textContent,/account is optional/);
  const row=id=>setup.querySelector(`[data-setup-package="${id}"]`).textContent;
  if(native){
   for(let i=0;i<30 && row('cli').includes('Availability not reported');i++)await pause();
   assert.equal(requests.length,1);assert.equal(setup.querySelector('[role=alert]')?.textContent,undefined);assert.match(row('cli'),/Available in this build/);assert.match(row('bins'),/Not available in this build/);
   const refresh=[...setup.querySelectorAll('button')].find(b=>b.textContent==='Refresh available software');refresh.click();refresh.click();await pause();assert.equal(requests.length,2);
  }else{
   for(const id of ['cli','bins','switchboard'])assert.match(row(id),/Availability not reported/);
   assert.match(setup.textContent,/browser preview cannot inspect or install/);assert.equal(requests.length,0);
  }
  [...setup.querySelectorAll('button')].find(b=>b.textContent.includes('Review local installation')).click();await pause();
  const panel=shadow.querySelector('[aria-label="Native HEX installer"]');assert.ok(panel);assert.equal(panel.closest('.hidden'),null);
  assert.ok(w.document.querySelector('[data-window-rail-tabs] button[aria-label="Install"] > div'));
  assert.ok(requests.every(r=>r.request.action==='inspect'),'navigation never prepares or applies an installation');
  assert.equal(shadow.querySelector('[aria-label="Software available in this build"]'),null);
 }finally{w.close();}
});
