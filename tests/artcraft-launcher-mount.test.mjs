import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountArtcraftLauncher} from '../src/lib/artcraftLauncherMount.mjs';

// Mocked donor boundary: lifecycle and canvas ownership only, not WASM proof.
function fixture() {
  const dom = new JSDOM('<div id="host"></div>');
  const root = dom.window.document.querySelector('#host').attachShadow({mode:'open'});
  const canvas = dom.window.document.createElement('canvas'); root.append(canvas);
  const calls = [];
  const handle = {destroy(){calls.push('destroy');},free(){calls.push('free');}};
  return {dom,canvas,calls,handle};
}
function deferred() {let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('passes actual ShadowRoot canvas to donor and cleans once',async()=>{
 const f=fixture();
 const lease=mountArtcraftLauncher({canvas:f.canvas,loadModule:async()=>({mount_launcher:async canvas=>{assert.equal(canvas,f.canvas);return f.handle;}})});
 assert.deepEqual(await lease.ready,{status:'mounted'});
 lease.dispose();lease.dispose();assert.deepEqual(f.calls,['destroy','free']);f.dom.window.close();
});
test('rejects duplicate pending mount and reopens after cleanup',async()=>{
 const f=fixture(),start=deferred();let mounts=0;
 const loader=async()=>({mount_launcher:()=>{mounts++;return start.promise;}});
 const lease=mountArtcraftLauncher({canvas:f.canvas,loadModule:loader});
 await Promise.resolve();
 assert.throws(()=>mountArtcraftLauncher({canvas:f.canvas,loadModule:loader}),/ALREADY_OWNED/);
 lease.dispose();
 assert.throws(()=>mountArtcraftLauncher({canvas:f.canvas,loadModule:loader}),/ALREADY_OWNED/);
 start.resolve(f.handle);assert.deepEqual(await lease.ready,{status:'disposed'});
 assert.deepEqual(f.calls,['destroy','free']);
 const next=mountArtcraftLauncher({canvas:f.canvas,loadModule:loader});await next.ready;next.dispose();
 assert.equal(mounts,2);assert.deepEqual(f.calls,['destroy','free','destroy','free']);f.dom.window.close();
});
test('unmount during module loading never starts donor',async()=>{
 const f=fixture(),load=deferred();let called=false;
 const lease=mountArtcraftLauncher({canvas:f.canvas,loadModule:()=>load.promise});lease.dispose();
 load.resolve({mount_launcher:()=>{called=true;}});
 assert.deepEqual(await lease.ready,{status:'disposed'});assert.equal(called,false);f.dom.window.close();
});
test('removed canvas during startup destroys late handle',async()=>{
 const f=fixture(),start=deferred();
 const lease=mountArtcraftLauncher({canvas:f.canvas,loadModule:async()=>({mount_launcher:()=>start.promise})});
 await Promise.resolve();f.canvas.remove();start.resolve(f.handle);
 assert.deepEqual(await lease.ready,{status:'disposed'});assert.deepEqual(f.calls,['destroy','free']);f.dom.window.close();
});
test('missing loader, export and startup failures refuse, without fake mounted result',async()=>{
 const f=fixture();
 assert.throws(()=>mountArtcraftLauncher({canvas:f.canvas}),/LOADER_UNBOUND/);
 let lease=mountArtcraftLauncher({canvas:f.canvas,loadModule:async()=>({})});
 await assert.rejects(lease.ready,/EXPORT_UNBOUND/);
 lease=mountArtcraftLauncher({canvas:f.canvas,loadModule:async()=>({mount_launcher:async()=>{throw Error('GRAPHICS_FAILED');}})});
 await assert.rejects(lease.ready,error=>error.message==='ARTCRAFT_RUNNER_START_FAILED' && error.cause.message==='GRAPHICS_FAILED');assert.deepEqual(f.calls,[]);f.dom.window.close();
});
test('uncertain cleanup blocks canvas reuse and still attempts free',async()=>{
 const f=fixture();f.handle.destroy=()=>{f.calls.push('destroy');throw Error('cleanup');};
 const loader=async()=>({mount_launcher:async()=>f.handle});
 const lease=mountArtcraftLauncher({canvas:f.canvas,loadModule:loader});await lease.ready;
 assert.throws(()=>lease.dispose(),/CLEANUP_UNVERIFIED/);assert.deepEqual(f.calls,['destroy','free']);
 assert.throws(()=>mountArtcraftLauncher({canvas:f.canvas,loadModule:loader}),/ALREADY_OWNED/);f.dom.window.close();
});
test('invalid donor handle remains refused and blocks reuse',async()=>{
 const f=fixture();const loader=async()=>({mount_launcher:async()=>({})});
 const lease=mountArtcraftLauncher({canvas:f.canvas,loadModule:loader});
 await assert.rejects(lease.ready,/HANDLE_INVALID/);
 assert.throws(()=>mountArtcraftLauncher({canvas:f.canvas,loadModule:loader}),/ALREADY_OWNED/);f.dom.window.close();
});
test('detached/noncanvas inputs refuse before loading',()=>{
 const f=fixture(),loader=()=>{throw Error('must not load');};
 assert.throws(()=>mountArtcraftLauncher({canvas:f.canvas.ownerDocument.createElement('div'),loadModule:loader}),/CONNECTED_CANVAS_REQUIRED/);
 f.canvas.remove();assert.throws(()=>mountArtcraftLauncher({canvas:f.canvas,loadModule:loader}),/CONNECTED_CANVAS_REQUIRED/);f.dom.window.close();
});
