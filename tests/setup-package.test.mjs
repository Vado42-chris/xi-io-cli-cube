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
for (const native of [false, true]) test('Library to CLI installation preserves package truth and requires review, native=' + native, async () => {
  const dom = new JSDOM('<div id="root"></div>', {url: 'https://hex.fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole().sendTo(console)});
  const w = dom.window, requests = [], chooserReplies = [{cancelled: true}, {cancelled: false, path: '/fixture/selected-cli'}, {cancelled: true}];
  w.matchMedia = media => ({media, matches: true, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
  w.ResizeObserver = class {observe(){} disconnect(){}};
  if (native) {
    const invoke = async (command, args) => {
      if (command === 'native_product_window') return {maximized: false, fullscreen: false};
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
    const mod = new SourceTextModule(script, {context: dom.getInternalVMContext()});
    await mod.link(() => {throw Error('external');}); await mod.evaluate(); await pause();
    const shadow = w.document.querySelector('[data-hex-product-content]').shadowRoot;
    const microsite = shadow.querySelector('[data-hex-microsites]');
    const panel = shadow.querySelector('[aria-label="Native HEX installer"]');
    const slot = shadow.querySelector('[data-hex-installer-slot="cli"]');
    assert.ok(microsite && panel && slot);
    assert.equal(microsite.getAttribute('data-product-page'), 'library'); assert.equal(slot.hidden, true);
    assert.doesNotMatch(shadow.textContent, /Tools & Diagnostics|XI-IO Ecosystem Component Catalog/);
    const button = text => [...shadow.querySelectorAll('button')].find(el => el.textContent.trim().startsWith(text));
    async function click(el) {assert.ok(el); el.click(); await pause();}
    await click(button('Explore XI-IO CLI')); await click(button('View requirements'));
    const requirements = shadow.querySelector('[data-product-primitive="PlatformRequirements"]');
    assert.match(requirements.textContent, /account is not required for local installation/i);
    assert.match(requirements.textContent, /selected Node/); assert.equal(slot.hidden, true);
    await click(button('Review installation'));
    assert.equal(slot.hidden, false); assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'), panel);
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
    await click(shadow.querySelector('button[aria-label="Back to Library"]'));
    await click(shadow.querySelector('[data-product-id="publisher"] button')); await click(button('View requirements'));
    assert.ok(shadow.querySelector('[aria-label="Installation unavailable"]'));
    assert.equal(slot.hidden, true, 'unbound Publisher cannot reuse a CLI plan');
    assert.ok([...shadow.querySelectorAll('main button')].every(el => !/^Open\b/i.test(el.textContent.trim()) || el.disabled));
    assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'), panel);
    assert.ok(requests.every(request => request.action === 'inspect'));
    assert.doesNotMatch(shadow.textContent, /Tools & Diagnostics|XI-IO Ecosystem Component Catalog/);
  } finally { w.close(); }
});
