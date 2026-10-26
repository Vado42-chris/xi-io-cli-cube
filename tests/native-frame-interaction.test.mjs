import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom';
import {SourceTextModule} from 'node:vm';

// Real built React DOM and the actual ShadowRoot portal, not a replacement App.
// This verifies event dispatch/state, not layout hit testing, iframe policy,
// native IPC, installed payloads, or owner-host execution. Build first.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
function asset(path) {
  assert.ok(path && !/^(?:[a-z]+:)?\/\//i.test(path), 'fixture uses only built local assets');
  const file = resolve(dist, path.replace(/^\//, ''));
  assert.ok(file.startsWith(dist + sep));
  return readFileSync(file, 'utf8');
}
const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
const script = asset(scriptPath);
const css = asset(html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));


for (const [initiallyMaximized,fullscreen] of [[false,false],[true,false],[true,true]]) test('built existing frame native drag max='+initiallyMaximized+' fullscreen='+fullscreen, async () => {
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',{url:'https://frame-fixture.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;const requests=[];
 w.matchMedia=media=>({media,matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 w.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
 const invoke=async(command,args)=>{requests.push({command,args});return {maximized:initiallyMaximized,fullscreen};};
 w.__TAURI__={core:{invoke}};w.__TAURI_INTERNALS__={invoke};
 try {
  const module=new SourceTextModule(script,{context:dom.getInternalVMContext()});await module.link(s=>{throw Error(s)});await module.evaluate();
  const settled=()=>requests.some(r=>r.args.action==='state') && w.document.querySelector('.xi-window')?.getAttribute('data-maximized')===String(initiallyMaximized);
  const deadline=Date.now()+2000;while(!settled()&&Date.now()<deadline)await pause(20);
  assert.ok(settled(),'native state response must render before the gesture');
  async function mouse(el,type='mousedown') {assert.ok(el);el.dispatchEvent(new w.MouseEvent(type,{button:0,bubbles:true,cancelable:true,composed:true}));await pause(20);}
  requests.length=0;
  await mouse(w.document.querySelector('[data-window-title-chrome]'));
  await mouse(w.document.querySelector('[data-window-left-rail]'));
  assert.equal(requests.filter(r=>r.args.action==='drag').length,fullscreen?0:2);
  const before=requests.length;
  await mouse(w.document.querySelector('[data-window-rail-tabs] button'));
  assert.equal(requests.length,before,'interactive rail button must not drag');
  if(!initiallyMaximized&&!fullscreen) for(const direction of ['w','e','n','s','nw','ne','sw','se']) {
   await mouse(w.document.querySelector('.cursor-'+direction+'-resize'));
   assert.equal(requests.at(-1).args.action,'resize');assert.equal(requests.at(-1).args.direction,direction);
  }
  for(const [label,action] of [['Minimize window','minimize'],[initiallyMaximized?'Restore window':'Maximize window','maximize'],['Close window','close']]) {
   await mouse(w.document.querySelector('[aria-label="'+label+'"]'),'click');assert.equal(requests.at(-1).command,'native_product_window');assert.equal(requests.at(-1).args.action,action);
  }
 } finally {dom.window.close()}
});
