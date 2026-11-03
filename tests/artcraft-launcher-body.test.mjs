import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import Body from '../test-dist/body.mjs';

// Actual compiled React consumer; donor WASM exports remain mocked.
function deferred() {let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function setup() {
 const dom=new JSDOM('<div id="host"></div>');
 const old={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const shadow=dom.window.document.querySelector('#host').attachShadow({mode:'open'});
 const root=createRoot(shadow);
 return {dom,shadow,root,async close(){await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,old);}};
}
test('compiled consumer StrictMode mounts once and disposes actual canvas lease',async()=>{
 const f=setup();const calls=[];
 const loadModule=async()=>({mount_launcher:async canvas=>{
   assert.equal(canvas.getRootNode(),f.shadow);calls.push('mount');
   return {destroy(){calls.push('destroy');},free(){calls.push('free');}};
 }});
 try {
  await act(async()=>f.root.render(React.createElement(React.StrictMode,null,React.createElement(Body,{loadModule}))));
  assert.equal(f.shadow.querySelector('section').dataset.artcraftMountStatus,'mounted');
  assert.equal(f.shadow.querySelectorAll('canvas').length,1);assert.deepEqual(calls,['mount']);
 }finally{await f.close();}
 assert.deepEqual(calls,['mount','destroy','free']);
});
test('compiled consumer cleans late completion after unmount',async()=>{
 const f=setup(),pending=deferred(),calls=[];
 const loadModule=async()=>({mount_launcher:()=>{calls.push('mount');return pending.promise;}});
 await act(async()=>f.root.render(React.createElement(Body,{loadModule})));
 await act(async()=>f.root.unmount());
 pending.resolve({destroy(){calls.push('destroy');},free(){calls.push('free');}});
 await act(async()=>{await pending.promise;await Promise.resolve();});
 assert.deepEqual(calls,['mount','destroy','free']);assert.equal(f.shadow.querySelector('canvas'),null);
 await f.close();
});
test('compiled consumer loader replacement waits for old pending cleanup',async()=>{
 const f=setup(),pending=deferred(),calls=[];
 const one=async()=>({mount_launcher:()=>{calls.push('one');return pending.promise;}});
 const two=async()=>({mount_launcher:async()=>{calls.push('two');return {destroy(){calls.push('destroy2');},free(){calls.push('free2');}};}});
 try {
  await act(async()=>f.root.render(React.createElement(Body,{loadModule:one})));
  await act(async()=>f.root.render(React.createElement(Body,{loadModule:two})));
  assert.deepEqual(calls,['one']);
  await act(async()=>pending.resolve({destroy(){calls.push('destroy1');},free(){calls.push('free1');}}));
  assert.deepEqual(calls,['one','destroy1','free1','two']);
  assert.equal(f.shadow.querySelector('section').dataset.artcraftMountStatus,'mounted');
 }finally{await f.close();}
 assert.deepEqual(calls,['one','destroy1','free1','two','destroy2','free2']);
});
test('compiled consumer leaves missing assets visibly unbound',async()=>{
 const f=setup();
 try {
  await act(async()=>f.root.render(React.createElement(Body)));
  assert.equal(f.shadow.querySelector('[role="alert"]').textContent,'ARTCRAFT_MODULE_LOADER_UNBOUND');
  assert.notEqual(f.shadow.querySelector('section').dataset.artcraftMountStatus,'mounted');
 }finally{await f.close();}
});
test('compiled consumer contains cleanup failure without erasing host or mounting replacement',async()=>{
 const f=setup(),calls=[];
 const one=async()=>({mount_launcher:async()=>({destroy(){calls.push('destroy');throw Error('donor failed');},free(){calls.push('free');}})});
 const two=async()=>({mount_launcher:async()=>{calls.push('second mount');throw Error('must not mount');}});
 try {
  await act(async()=>f.root.render(React.createElement(Body,{loadModule:one})));
  const canvas=f.shadow.querySelector('canvas');
  await act(async()=>f.root.render(React.createElement(Body,{loadModule:two})));
  assert.equal(f.shadow.querySelector('canvas'),canvas);
  assert.equal(f.shadow.querySelector('[role="alert"]').textContent,'ARTCRAFT_CLEANUP_UNVERIFIED');
  assert.deepEqual(calls,['destroy','free']);
 }finally{await f.close();}
});
test('compiled consumer contains late cleanup failure and blocks queued replacement',async()=>{
 const f=setup(),pending=deferred(),calls=[];
 const one=async()=>({mount_launcher:()=>pending.promise});
 const two=async()=>({mount_launcher:async()=>{calls.push('second mount');throw Error('must not mount');}});
 try {
  await act(async()=>f.root.render(React.createElement(Body,{loadModule:one})));
  await act(async()=>f.root.render(React.createElement(Body,{loadModule:two})));
  await act(async()=>pending.resolve({destroy(){calls.push('destroy');throw Error('late donor failed');},free(){calls.push('free');}}));
  assert.equal(f.shadow.querySelector('[role="alert"]').textContent,'ARTCRAFT_CLEANUP_UNVERIFIED');
  assert.ok(f.shadow.querySelector('canvas'));assert.deepEqual(calls,['destroy','free']);
 }finally{await f.close();}
});
