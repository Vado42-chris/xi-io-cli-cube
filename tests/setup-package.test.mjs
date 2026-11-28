import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {SourceTextModule} from 'node:vm';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + 'package.json');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = readFileSync(root + 'dist/index.html', 'utf8');
const script = readFileSync(root + 'dist/' + html.match(/<script[^>]+src="([^"]+)"/)[1].replace(/^\//, ''), 'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve, 40));

// Actual compiled UI with controlled native responses, not installed proof.
for (const native of [false, true]) test('Software to CLI installation preserves package truth and requires review, native=' + native, async () => {
  const dom = new JSDOM('<div id="root"></div>', {url: 'https://hex.fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole().sendTo(console)});
  const w = dom.window, requests = [], productOpenRequests = [], chooserReplies = [{cancelled: true}, {cancelled: false, path: '/fixture/selected-cli'}, {cancelled: true}];
  w.matchMedia = media => ({media, matches: true, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
  w.ResizeObserver = class {observe(){} disconnect(){}};
  if (native) {
    const invoke = async (command, args) => {
      if (command === 'native_product_window') return {maximized: false, fullscreen: false};
      if (command === 'native_product_open') {
        productOpenRequests.push(JSON.parse(JSON.stringify(args)));
        assert.deepEqual(productOpenRequests.at(-1), {productId: 'sam_law'});
        throw Error('NATIVE_PRODUCT_OPEN_REGISTRY_UNBOUND');
      }
      if (command === 'native_select_directory') {
        assert.deepEqual(JSON.parse(JSON.stringify(args)), {purpose: 'installation'});
        return chooserReplies.shift();
      }
      assert.equal(command, 'installer_request'); requests.push(JSON.parse(JSON.stringify(args.request)));
      assert.deepEqual(requests.at(-1), {action: 'inspect'}, 'navigation never prepares or applies');
      return {ok: true, result: {supported_components: {cli: {available: true}, bins: {available: false, reason: 'NOT_PACKAGED'}, switchboard: {available: false, reason: 'NOT_PACKAGED'}}, plans: [], prefix_suggestion: '/fixture/original-cli', node_suggestion: '/fixture/node'}};
    };
    w.__TAURI__ = {core: {invoke}}; w.__TAURI_INTERNALS__ = {invoke};
  }
  try {
    const mod = new SourceTextModule(script, {context: dom.getInternalVMContext(), importModuleDynamically: async () => {throw Error('ARTCRAFT_TEST_EXECUTOR_NO_WASM');}});
    await mod.link(() => {throw Error('external');}); await mod.evaluate(); await pause();
    const shadow = w.document.querySelector('[data-hex-product-content]').shadowRoot;
    const panel = shadow.querySelector('[aria-label="Native HEX installer"]');
    assert.ok(panel && panel.closest('[hidden]'));
    assert.ok(shadow.querySelector('canvas[aria-label="HEX software marketplace"]'));
    assert.equal(shadow.querySelector('[data-hex-microsites]'), null);
    assert.doesNotMatch(shadow.textContent, /Tools & Diagnostics|XI-IO Ecosystem Component Catalog/);
    const button = text => [...shadow.querySelectorAll('button')].find(el => el.textContent.trim().startsWith(text));
    const rail = label => w.document.querySelector(`[data-window-rail-tabs] button[aria-label="${label}"]`);
    async function click(el) {assert.ok(el); el.click(); await pause();}
    assert.equal(button('Open SAM_LAW in HEX'), undefined, 'unbound products never expose a launch action');
    assert.deepEqual(productOpenRequests, []);
    await click(rail('Install'));
    assert.equal(panel.closest('[hidden]'), null);
    assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'), panel);
    assert.equal(shadow.querySelector('[aria-label="HEX launcher body"]'), null);
    assert.match(panel.textContent, /No sign-in required/);
    assert.ok(w.document.querySelector('[data-window-rail-tabs] button[aria-label="Install"] > div'));
    if (native) {
      for (let i = 0; i < 30 && !panel.querySelector('[aria-label="Node executable"]')?.value; i++) await pause();
      assert.equal(requests.length, 1, 'retained installer inspects once, not once per page');
      assert.match(panel.textContent, /BINS: unavailable.*NOT_PACKAGED/s);
      const available = [...panel.querySelectorAll('label')].find(el => el.textContent.includes('CLI (required)'));
      assert.ok(available?.querySelector('input').checked);
      const refresh = button('Refresh requirements & history'); refresh.click(); refresh.click(); await pause();
      assert.equal(requests.length, 2, 'double click remains single flight');
      const folder = panel.querySelector('[aria-label="Installation folder"]');
      assert.equal(folder.value, '/fixture/original-cli');
      await click(button('Choose Folder')); assert.equal(folder.value, '/fixture/original-cli');
      await click(button('Choose Folder')); assert.equal(folder.value, '/fixture/selected-cli');
      await click(button('Choose Folder')); assert.equal(folder.value, '/fixture/selected-cli', 'cancel preserves target');
      assert.equal(chooserReplies.length, 0);
    } else {
      assert.match(panel.textContent, /browser preview cannot inspect, install or roll back/);
      assert.equal(requests.length, 0); assert.equal(panel.querySelector('[aria-label="Node executable"]'), null);
    }
    const folder = panel.querySelector('[aria-label="Installation folder"]');
    await click(rail('Software'));
    assert.ok(shadow.querySelector('canvas[aria-label="HEX software marketplace"]'));
    assert.ok(panel.closest('[hidden]'));
    assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'), panel);
    await click(rail('Install'));
    assert.equal(panel.closest('[hidden]'), null);
    assert.equal(panel.querySelector('[aria-label="Installation folder"]'), folder);
    if (native) assert.equal(folder.value, '/fixture/selected-cli');
    assert.equal(productOpenRequests.length, 0, 'navigation never opens an unbound product');
    assert.ok(requests.every(request => request.action === 'inspect'));
    assert.doesNotMatch(shadow.textContent, /Tools & Diagnostics|XI-IO Ecosystem Component Catalog/);
  } finally { w.close(); }
});

test('one Install tab reviews two downloaded products on the same host with separate approvals', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'https://hex.fixture.invalid', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:new VirtualConsole()});
  const w = dom.window;
  w.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
  w.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  const products = ['disposable-editor','disposable-service'];
  const requests = [];
  let index = 0;
  const invoke = async (command,args) => {
    if (command === 'native_product_window') return {};
    if (command === 'native_select_directory') {
      assert.equal(args.purpose,'product-release');
      return {cancelled:false,path:'/downloads/'+products[index]};
    }
    assert.equal(command,'installer_request');
    const req = args.request; requests.push(req.action);
    if (req.action === 'inspect') return {ok:true,result:{plans:[], node_suggestion:'/host/node', product_host:{framework_binding_receipt:'/host/framework.binding.json',framework_generation:'f'.repeat(40)}}};
    assert.equal(req.node,'/host/node');
    assert.equal(req.release_lock,'/downloads/'+products[index]+'/bundle.lock.json');
    assert.equal(req.framework_binding_receipt,'/host/framework.binding.json');
    assert.equal(req.framework_generation,'f'.repeat(40));
    const review = {schema:'xiio.hex.native-product-release-review/v1', display_name:products[index],product_ref:products[index],release_generation:'b'.repeat(40),review_digest:String(index+1).repeat(64),effect_authority:false};
    if (req.action === 'product_inspect') return {ok:true,result:{...review,phase:'PRODUCT_REVIEW_REQUIRED',installed_bytes_verified:false}};
    assert.equal(req.action,'product_apply'); assert.equal(req.approved,true); assert.equal(req.review_digest,review.review_digest);
    return {ok:true,result:{...review,phase:'PRODUCT_BYTES_INSTALLED_READBACK_VERIFIED',installed_bytes_verified:true,do_not_retry:false}};
  };
  w.__TAURI__={core:{invoke}}; w.__TAURI_INTERNALS__={invoke};
  try {
    const mod = new SourceTextModule(script,{context:dom.getInternalVMContext(),importModuleDynamically:async()=>{throw Error('ARTCRAFT_TEST_EXECUTOR_NO_WASM');}});
    await mod.link(()=>{throw Error('external');}); await mod.evaluate(); await pause();
    const shadow=w.document.querySelector('[data-hex-product-content]').shadowRoot;
    [...shadow.querySelectorAll('button')].find(el=>el.textContent.trim()==='Install from download').click(); await pause();
    const panel=w.document.querySelector('[data-hex-product-content]').shadowRoot.querySelector('[aria-label="Product-only release installation"]');
    const button=text=>[...panel.querySelectorAll('button')].find(el=>el.textContent.trim()===text);
    for (;index<products.length;index++) {
      if (index > 0) { button('Choose product folder').click(); await pause(); }
      assert.equal(button('Install reviewed product'),undefined);
      button('Inspect exact product release').click(); await pause();
      assert.match(panel.textContent,new RegExp(products[index]));
      assert.ok(button('Install reviewed product').disabled);
      panel.querySelector('input[type="checkbox"]').click(); await pause();
      button('Install reviewed product').click(); await pause();
      assert.match(panel.textContent,/Installed files independently verified/);
    }
    assert.deepEqual(requests.filter(a=>a!=='inspect'),['product_inspect','product_apply','product_inspect','product_apply']);
  } finally {dom.window.close();}
});
