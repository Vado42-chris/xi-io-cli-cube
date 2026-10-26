import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectNativeDirectory} from '../src/lib/nativeDirectory.mjs';
test('uses exact existing native chooser command with bounded purpose',async()=>{
 const host={__TAURI__:{core:{invoke:async(command,args)=>{assert.equal(command,'native_select_directory');assert.deepEqual(args,{purpose:'workspace'});return {cancelled:false,path:'/chosen/project'};}}}};
 assert.equal(await selectNativeDirectory('workspace',host),'/chosen/project');
});
test('cancellation preserves caller selection and browser cannot fabricate a path',async()=>{
 assert.equal(await selectNativeDirectory('installation',{__TAURI__:{core:{invoke:async()=>({cancelled:true})}}}),null);
 await assert.rejects(selectNativeDirectory('workspace',{}),/native HEX/);
 await assert.rejects(selectNativeDirectory('shell',{}),/not supported/);
 await assert.rejects(selectNativeDirectory('workspace',{__TAURI__:{core:{invoke:async()=>({cancelled:false,path:'relative'})}}}),/invalid/);
});
test('existing Step3 and install prefix controls are wired, sample shortcut removed',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/components/NativeInstallerPanel.tsx',import.meta.url),'utf8');
 assert.ok(app.includes("selectNativeDirectory('workspace')"));assert.ok(!app.includes("setSelectedFolder('/example/project')"));
 assert.ok(panel.includes("selectNativeDirectory('installation')"));assert.ok(panel.includes('Detected requirements and connection prerequisites'));
});
