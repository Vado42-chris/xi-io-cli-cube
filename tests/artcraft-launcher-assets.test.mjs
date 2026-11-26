import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/lib/artcraftLauncherAssets.mjs',import.meta.url),'utf8');
async function fixture({importFailure=false,initFailure=false,violation=null,missingExport=false}={}) {
 const listeners=new Set(), urls=[],inits=[];
 const fire=()=>{if(violation)for(const listener of listeners)listener(violation);};
 const window={location:{href:'http://tauri.localhost/index.html'},setTimeout,
 addEventListener(name,fn){assert.equal(name,'securitypolicyviolation');listeners.add(fn);},
 removeEventListener(name,fn){assert.equal(name,'securitypolicyviolation');listeners.delete(fn);}};
 const context=vm.createContext({URL,window});
 const module=new vm.SourceTextModule(source,{context,importModuleDynamically:async url=>{
  urls.push(url);if(importFailure){fire();throw new Error('private import detail');}
  const exports=['default',...(missingExport?[]:['mount_launcher'])];
  const donor=new vm.SyntheticModule(exports,function(){this.setExport('default',async options=>{inits.push(options.module_or_path);fire();if(initFailure)throw new Error('private init detail');});if(!missingExport)this.setExport('mount_launcher',()=>{});},{context});
  await donor.link(()=>{});await donor.evaluate();return donor;
 }});
 await module.link(()=>{});await module.evaluate();return{load:module.namespace.loadPackagedArtcraftLauncher,listeners,urls,inits};
}
test('fixed packaged assets initialize once without remote fallback',async()=>{
 const f=await fixture();assert.equal(await f.load(),await f.load());
 assert.deepEqual(f.urls,['http://tauri.localhost/donor/artcraft-launcher-web/launcher.js']);
 assert.deepEqual(f.inits,['http://tauri.localhost/donor/artcraft-launcher-web/launcher_bg.wasm']);assert.equal(f.listeners.size,0);
});
for(const [name,options,code] of [
 ['import failure',{importFailure:true},'ARTCRAFT_LOCAL_MODULE_IMPORT_FAILED'],
 ['init failure',{initFailure:true},'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED'],
 ['missing export',{missingExport:true},'ARTCRAFT_GENERATED_EXPORTS_UNBOUND'],
 ['local script policy',{importFailure:true,violation:{disposition:'enforce',effectiveDirective:'script-src-elem',blockedURI:'http://tauri.localhost/donor/artcraft-launcher-web/launcher.js'}},'ARTCRAFT_LOCAL_MODULE_IMPORT_FAILED_WITH_LOCAL_POLICY_EVENT'],
 ['local WASM fetch policy',{initFailure:true,violation:{disposition:'enforce',effectiveDirective:'connect-src',blockedURI:'http://tauri.localhost/donor/artcraft-launcher-web/launcher_bg.wasm'}},'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_LOCAL_FETCH_POLICY_EVENT'],
 ['WASM compile policy',{initFailure:true,violation:{disposition:'enforce',effectiveDirective:'script-src',blockedURI:'wasm-eval'}},'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_UNATTRIBUTED_COMPILE_POLICY_EVENT'],
 ['remote violation is not local evidence',{initFailure:true,violation:{disposition:'enforce',effectiveDirective:'connect-src',blockedURI:'https://unrelated.invalid/private'}},'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED'],
 ['report only is not blocking evidence',{initFailure:true,violation:{disposition:'report',effectiveDirective:'script-src',blockedURI:'wasm-eval'}},'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED'],
 ]) test(name,async()=>{const f=await fixture(options);await assert.rejects(f.load(),error=>error.message===code&&!error.message.includes('private'));assert.equal(f.listeners.size,0);});

test('concurrent unattributed eval violation does not claim donor CSP causation',async()=>{
 const f=await fixture({initFailure:true,violation:{disposition:'enforce',effectiveDirective:'script-src',blockedURI:'eval',sourceFile:'https://unrelated.invalid/private-script.js'}});
 await assert.rejects(f.load(),error=>error.message==='ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_UNATTRIBUTED_COMPILE_POLICY_EVENT' && error.cause.message==='private init detail' && !error.message.includes('BLOCKED'));
 assert.equal(f.listeners.size,0);
});
