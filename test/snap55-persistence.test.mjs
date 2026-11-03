import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM,VirtualConsole} from 'jsdom';
import {SourceTextModule} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist');
const html=readFileSync(resolve(dist,'index.html'),'utf8');
function asset(p){
  const file=resolve(dist,String(p).replace(/^\//,''));
  assert.ok(file.startsWith(dist+sep));return readFileSync(file,'utf8');
}
const scriptPath=html.match(/<script[^>]+src="([^"]+)"/)?.[1];
const script=asset(scriptPath);
const pause=ms=>new Promise(r=>setTimeout(r,ms));

async function boot(store){
  const errors=[];
  const console=new VirtualConsole();
  console.on('jsdomError',e=>errors.push(e.message));
  console.on('error',(...a)=>errors.push(a.map(String).join(' ')));
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{
    url:'https://hex-persistence.invalid/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console
  });
  const w=dom.window;
  w.matchMedia=media=>({media,matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.__TAURI__={core:{invoke:async(command,args)=>{
    if(command==='snap55_state'){
      if(args.action==='load') return store.source===null?{state:'NOT_SAVED',source:null}:{state:'LOADED_READBACK_VERIFIED',source:store.source};
      if(args.action==='save'){store.source=args.source;return{state:'SAVED_READBACK_VERIFIED',source:store.source};}
      if(args.action==='clear'){store.source=null;return{state:'CLEARED_READBACK_VERIFIED'};}
      throw Error('unexpected state action');
    }
    if(command==='installer_request' && args?.request?.action==='inspect'){
      return {ok:true,result:{plans:[],supported_components:{cli:{available:true,required:true},bins:{available:false,reason:'fixture'},switchboard:{available:false,reason:'fixture'}},component_availability:{cli:{available:true,required:true},bins:{available:false,reason:'fixture'},switchboard:{available:false,reason:'fixture'}}}};
    }
    if(command==='native_product_window') return {maximized:false,fullscreen:false};
    throw Error('unexpected invoke '+command);
  }}};
  const module=new SourceTextModule(script,{context:dom.getInternalVMContext(),initializeImportMeta(meta){meta.url=new URL(scriptPath,w.location.href).href;}});
  await module.link(spec=>{throw Error('unexpected import '+spec)});
  await module.evaluate();await pause(100);
  const shadow=w.document.querySelector('[data-hex-product-content]')?.shadowRoot;
  assert.ok(shadow);
  const click=async el=>{assert.ok(el);el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,composed:true}));await pause(30);};
  const rail=label=>w.document.querySelector(`[data-window-rail-tabs] button[aria-label="${label}"]`);
  await click(rail('Maths'));
  await pause(30);
  return {dom,w,shadow,click,errors};
}

test('native SNAP useful action saves, readbacks, closes and restores on next boot',async()=>{
  const store={source:null};
  const first=await boot(store);
  try{
    const textarea=first.shadow.querySelector('[data-hex-snap55-workbench] textarea');
    assert.ok(textarea);
    const edited=textarea.value.replace('"example-a": 4','"example-a": 3');
    textarea.value=edited;
    textarea.dispatchEvent(new first.w.Event('input',{bubbles:true,composed:true}));
    textarea.dispatchEvent(new first.w.Event('change',{bubbles:true,composed:true}));
    await pause(30);
    const button=label=>[...first.shadow.querySelectorAll('button')].find(x=>x.textContent.trim()===label);
    await first.click(button('Calculate locally'));
    assert.equal(first.shadow.querySelector('[data-snap55-state]')?.textContent,'SOURCE_BOUND_NUMERIC');
    await first.click(button('Save on this computer'));
    assert.equal(store.source,edited);
    assert.match(first.shadow.querySelector('[data-snap55-persistence]').textContent,/Saved and read back/);
    assert.deepEqual(first.errors,[]);
  } finally {first.dom.window.close();}

  const second=await boot(store);
  try{
    const textarea=second.shadow.querySelector('[data-hex-snap55-workbench] textarea');
    assert.equal(textarea.value,store.source);
    assert.equal(second.shadow.querySelector('[data-snap55-state]')?.textContent,'SOURCE_BOUND_NUMERIC');
    assert.match(second.shadow.querySelector('[data-snap55-persistence]').textContent,/restored and read back/);
    assert.deepEqual(second.errors,[]);
  } finally {second.dom.window.close();}
});
