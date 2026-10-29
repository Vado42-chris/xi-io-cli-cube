import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startFrontendDiagnostic} from '../src/lib/frontendDiagnostic.mjs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function fixture() {
 const calls=[],timers=[],listeners=new Map(); let raf;
 const element=()=>({parentElement:null,childElementCount:1,style:{display:'block',visibility:'visible',opacity:'1'},
  getBoundingClientRect:()=>({width:1440,height:900}),getRootNode:()=>({}),
  get textContent(){throw Error('CONTENT_READ_FORBIDDEN');}});
 const root=element(),frame=element(),host=element(),workspace=element();
 frame.parentElement=root;host.parentElement=frame;
 const shadow={host,querySelector:()=>workspace};workspace.getRootNode=()=>shadow;host.shadowRoot=shadow;
 root.querySelector=s=>s.includes('native-window')?frame:host;
 const view={__TAURI_INTERNALS__:{invoke:(...args)=>{calls.push(args);return Promise.resolve();}},
  document:{getElementById:()=>root,visibilityState:'visible'},
  addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),
  requestAnimationFrame:fn=>{raf=fn;return 7;},cancelAnimationFrame:id=>assert.equal(id,7),
  getComputedStyle:n=>n.style,setTimeout:(fn,delay)=>timers.push({fn,delay})};
 return {view,calls,timers,listeners,root,frame,host,workspace,raf:()=>raf()};
}
test('exactly three bounded data-only observations, no text or error details',()=>{
 const f=fixture();const options=startFrontendDiagnostic(f.view);
 const secret=new Proxy({}, {get(){throw Error('ERROR_DETAILS_READ_FORBIDDEN');}});
 options.onUncaughtError(secret);options.onRecoverableError(secret);
 for(const fn of f.listeners.values()) fn(secret);
 for(let i=0;i<300;i++) options.onUncaughtError(secret);
 assert.deepEqual(f.timers.map(t=>t.delay),[0,2000,10000]);f.raf();f.timers.forEach(t=>t.fn());
 assert.equal(f.calls.length,3);assert.equal(f.listeners.size,0);
 for(const [sample,[command,args]] of f.calls.entries()) {
  assert.equal(command,'native_product_window');assert.equal(args.action,'state');
  assert.deepEqual(args.diagnostic,{sample,errors:[255,1,1,1,1],nodes:Array.from({length:4},()=>[1,1440,900,1]),root_children:true,document_visible:true,raf:true,shadow:true});
 }
});
test('missing React root after an error stays absent, no fallback UI',()=>{
 const f=fixture();const options=startFrontendDiagnostic(f.view);options.onUncaughtError();
 f.view.document.getElementById=()=>null;f.timers[1].fn();
 const d=f.calls[0][1].diagnostic;assert.equal(d.errors[0],1);assert.equal(d.shadow,false);
 assert.deepEqual(d.nodes,Array.from({length:4},()=>[0,0,0,0]));assert.equal(d.raf,false);
});
test('hidden shadow ancestor and zero geometry do not report visibility',()=>{
 const f=fixture();f.host.style.display='none';f.frame.getBoundingClientRect=()=>({width:0,height:0});
 f.workspace.getBoundingClientRect=()=>({width:Infinity,height:999999});
 startFrontendDiagnostic(f.view);f.timers[0].fn();const d=f.calls[0][1].diagnostic;
 assert.equal(d.nodes[1][3],0);assert.deepEqual(d.nodes[3],[1,0,16384,0]);
});
test('browser-only mode makes no observation, IPC rejection does not retry',async()=>{
 assert.deepEqual(startFrontendDiagnostic({}),{});
 const f=fixture();let n=0;f.view.__TAURI_INTERNALS__.invoke=()=>{n++;return Promise.reject(Error('secret'));};
 startFrontendDiagnostic(f.view);f.timers.forEach(t=>t.fn());await Promise.resolve();assert.equal(n,3);
});
test('native boundary remains local, typed, bounded and state-only',()=>{
 const s=read('native/hex/carrier/src-tauri/src/lib.rs');
 assert.match(s,/#\[serde\(deny_unknown_fields\)\]/);
 assert.match(s,/errors: \[u8; 5\]/);assert.match(s,/nodes: \[\[u16; 4\]; 4\]/);
 assert.match(s,/count < 3/);assert.match(s,/action != "state" \|\| direction.is_some\(\) \|\| !observation.valid\(\)/);
 const command=s.slice(s.indexOf('fn native_product_window'),s.indexOf('/// Read only'));
 assert.ok(command.indexOf('local_caller(&window)?')<command.indexOf('HEX_FRONTEND_DIAGNOSTIC'));
 assert.match(read('src/main.tsx'),/createRoot\(document.getElementById\('root'\)!, startFrontendDiagnostic\(window\)\)/);
});
