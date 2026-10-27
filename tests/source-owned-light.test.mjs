import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {SourceTextModule} from 'node:vm';
import {fireProfile,IBAL_PANEL_SHADOW} from '../src/lib/source-owned-light/panelShadow.js';
import {cursorLightGradient,cursorLightGeometry,sourcePanelShadow,CURSOR_LIGHT_DEFAULTS,HEX_LIGHT_OVERRIDE} from '../src/lib/source-owned-light/cursorLight.mjs';
import {createBackdropMotion} from '../src/lib/backdropMotion.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(root+'package.json');const {JSDOM,VirtualConsole}=require('jsdom');
const pause=()=>new Promise(r=>setTimeout(r,35));
test('exact upstream bytes, default controls and source-owned profile do not drift',()=>{
 const manifest=JSON.parse(readFileSync(root+'src/lib/source-owned-light/source-custody.json'));
 for(const row of manifest.vendored_files){const b=readFileSync(root+'src/lib/source-owned-light/'+row.path);assert.equal(createHash('sha256').update(b).digest('hex'),row.sha256);assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex'),row.git_blob);}
 assert.deepEqual(CURSOR_LIGHT_DEFAULTS,{intensity:1.6,reach:1,softness:1,blend:'screen'});
 assert.deepEqual(IBAL_PANEL_SHADOW,{blur:50,spread:-10,alpha:.2});
 assert.equal(HEX_LIGHT_OVERRIDE.intensity,.5);assert.ok(HEX_LIGHT_OVERRIDE.intensity<CURSOR_LIGHT_DEFAULTS.intensity);assert.equal(manifest.hex_override.peak_alpha,.1);
 const stops=fireProfile(1);assert.equal(stops.length,17);assert.equal(stops[0][1],1);assert.equal(stops.at(-1)[1],0);
 for(let i=1;i<stops.length;i++)assert.ok(stops[i][1]<=stops[i-1][1]);
 assert.equal(cursorLightGradient(),'radial-gradient(circle closest-side, '+stops.map(([t,w])=>`hsl(var(--cursor-glow, var(--color-brand)) / ${(.2*.5*w).toFixed(4)}) ${(t*100).toFixed(1)}%`).join(', ')+')');
 assert.equal(sourcePanelShadow(),'0 0 50px -10px rgba(0, 0, 0, 0.2)');
 assert.match(manifest.settings_qualification,/NO_STUDIO_SETTINGS_SYNC/);
});
test('finite light geometry shares bounded interpolation and performs zero idle work',()=>{
 assert.deepEqual(cursorLightGeometry(800,600),{diameter:1000,x:400,y:300});
 assert.deepEqual(cursorLightGeometry(800,600,-17,-11),{diameter:1000,x:800,y:600});
 assert.deepEqual(cursorLightGeometry(800,600,17,11),{diameter:1000,x:0,y:0});
 for(const bad of [[NaN,1],[1,Infinity],[0,1],[-1,1],[1,1,NaN]])assert.equal(cursorLightGeometry(...bad),null);
 const frames=new Map(),writes=[];let id=0;
 const motion=createBackdropMotion({requestFrame:f=>{frames.set(++id,f);return id;},cancelFrame:i=>frames.delete(i),write:(x,y)=>writes.push(cursorLightGeometry(800,600,x,y))});
 assert.equal(frames.size,0);for(let i=0;i<100;i++)motion.target(-17,-11);assert.equal(frames.size,1);
 let n=0;while(frames.size&&n++<150){const q=[...frames.values()];frames.clear();q.forEach(f=>f());}
 assert.ok(n<150);assert.equal(frames.size,0);assert.deepEqual(writes.at(-1),{diameter:1000,x:800,y:600});
 motion.target(17,11);motion.enable(false);assert.equal(frames.size,0);const count=writes.length;motion.target(0,0);assert.equal(writes.length,count);motion.dispose();
});
test('compiled light follows pointer below reading plane, settles, pauses and cleans up',async()=>{
 const html=readFileSync(root+'dist/index.html','utf8'),source=readFileSync(root+'dist/'+html.match(/<script[^>]+src="([^"]+)"/)[1].replace(/^\//,''),'utf8');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://hex.fixture.invalid',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole().sendTo(console)});
 const w=dom.window,frames=new Map(),listeners=new Set();let id=0,now=0,reduced=false,hidden=false,reads=0;
 w.requestAnimationFrame=f=>{frames.set(++id,f);return id;};w.cancelAnimationFrame=i=>frames.delete(i);
 Object.defineProperty(w.performance,'now',{value:()=>now});Object.defineProperty(w.document,'hidden',{get:()=>hidden});
 w.matchMedia=media=>({media,get matches(){return reduced;},addEventListener(_n,f){listeners.add(f);},removeEventListener(_n,f){listeners.delete(f);},addListener(){},removeListener(){}});
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 const oldBounds=w.HTMLElement.prototype.getBoundingClientRect;
 w.HTMLElement.prototype.getBoundingClientRect=function(){if(this.classList.contains('ca-brand-field')){reads++;return {left:0,top:0,width:800,height:600,right:800,bottom:600,x:0,y:0,toJSON(){}};}return oldBounds.call(this);};
 const flush=()=>{let n=0;while(frames.size&&n++<300){now+=16.667;const q=[...frames.values()];frames.clear();q.forEach(f=>f(now));}assert.ok(n<300);return n;};
 try{
  const mod=new SourceTextModule(source,{context:dom.getInternalVMContext()});await mod.link(()=>{throw Error('external');});await mod.evaluate();await pause();flush();await pause();flush();
  const shadow=w.document.querySelector('[data-hex-product-content]').shadowRoot,field=shadow.querySelector('.ca-brand-field'),product=shadow.querySelector('[data-tablet-surface]'),lamp=shadow.querySelector('[data-source-owned-light]');
  assert.ok(lamp);assert.equal(lamp.closest('.ca-brand-field'),field);assert.equal(field.getAttribute('aria-hidden'),'true');assert.match(field.dataset.lightSettings,/NO_STUDIO_SETTINGS_SYNC/);
  assert.equal(field.style.getPropertyValue('--ca-light-diameter'),'1000px');assert.equal(field.style.getPropertyValue('--ca-light-x'),'400.00px');
  const beforeReads=reads;for(let i=0;i<100;i++)product.dispatchEvent(new w.MouseEvent('pointermove',{clientX:800,clientY:600,bubbles:true}));
  assert.equal(reads,beforeReads);assert.equal(frames.size,1);const n=flush();assert.ok(n<150);assert.equal(frames.size,0);assert.equal(field.style.getPropertyValue('--ca-light-x'),'800.00px');assert.equal(field.style.getPropertyValue('--ca-light-y'),'600.00px');
  hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));const before=field.getAttribute('style');product.dispatchEvent(new w.MouseEvent('pointermove',{clientX:0,clientY:0,bubbles:true}));assert.equal(frames.size,0);assert.equal(field.getAttribute('style'),before);
  hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));flush();reduced=true;listeners.forEach(f=>f());assert.equal(frames.size,0);assert.equal(field.style.getPropertyValue('--ca-light-x'),'400.00px');assert.equal(field.style.getPropertyValue('--ca-light-y'),'300.00px');
  product.dispatchEvent(new w.MouseEvent('pointermove',{clientX:0,clientY:0,bubbles:true}));assert.equal(frames.size,0);
  w.dispatchEvent(new w.Event('pagehide'));assert.equal(frames.size,0);
 }finally{dom.window.close();}
});
test('light cannot cover text; opaque reading surfaces retain minimum contrast',()=>{
 const css=readFileSync(root+'src/styles/product-workspace.css','utf8');assert.match(css,/\.ca-brand-field \{[^}]*z-index: -1/s);assert.match(css,/\.ca-brand-field \{ isolation: isolate/);assert.match(css,/mix-blend-mode: screen/);assert.doesNotMatch(css,/radial-gradient\(ellipse at 12% 16%/);
 const srgb=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};const lum=rgb=>rgb.map(srgb).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const worstDark=[12,12,13].map(v=>v*.96+255*.04);assert.ok(ratio([244,244,242],worstDark)>4.5);assert.ok(ratio([193,193,193],worstDark)>4.5);
 const hsl=(h,s,l)=>{s/=100;l/=100;const a=s*Math.min(l,1-l);return[0,8,4].map(n=>{const k=(n+h/30)%12;return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));});};
 assert.ok(ratio(hsl(0,0,33),[255*.92,255*.92,255*.92])>4.5);
});

test('latest owner palette confines cyan to links/light/window and keeps PNG grayscale',()=>{
 const css=readFileSync(root+'src/styles/product-workspace.css','utf8');
 assert.match(css,/--workspace-focus: #f4f4f2/);assert.match(css,/--workspace-muted: #c1c1c1/);
 assert.match(css,/a\[href\] \{\s*color: var\(--workspace-link\)/);
 assert.match(css,/grayscale\(100%\) brightness\(\.72\) contrast\(1\.08\)/);
 assert.equal((css.match(/hsl\(var\(--chroma-hue,188\)/g)||[]).length,2); // Link tokens, dark/light only.
 assert.match(css,/--cursor-glow: var\(--chroma-hue,188\) 74% 60%/);
 assert.doesNotMatch(css,/saturate\(1\.12\)|#c1d6df|rgba\(10,28,38/);
});
