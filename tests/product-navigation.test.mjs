import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom';
import {SourceTextModule} from 'node:vm';

// Actual built React and ShadowRoot portal. DOM interaction is not geometry,
// native IPC, installed payload or owner-host acceptance. Build first.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
function asset(path) {
  assert.ok(path && !/^(?:[a-z]+:)?\/\//i.test(path), 'only built local assets');
  const file = resolve(dist, path.replace(/^\//, ''));
  assert.ok(file.startsWith(dist + sep));
  return readFileSync(file, 'utf8');
}
const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
const script = asset(scriptPath);
const css = asset(html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('built Library and product pages replace the retired catalog inside one native frame', async () => {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  console.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'https://hex-interaction-fixture.invalid/', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: console,
  });
  const w = dom.window;
  w.matchMedia = media => ({media, matches: media.includes('reduced-motion'), addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
  w.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  w.document.head.appendChild(Object.assign(w.document.createElement('style'), {textContent: css}));
  try {
    const module = new SourceTextModule(script, {context: dom.getInternalVMContext(), initializeImportMeta(meta) {meta.url = new URL(scriptPath, w.location.href).href;}});
    await module.link(specifier => {throw new Error('Unexpected non-bundled import: ' + specifier);});
    await module.evaluate(); await pause(100);
    const shadow = w.document.querySelector('[data-hex-product-content]')?.shadowRoot;
    assert.ok(shadow, 'actual product portal rendered');
    const microsite = shadow.querySelector('[data-hex-microsites]');
    assert.ok(microsite, 'new product composition is mounted');
    const panel = shadow.querySelector('[aria-label="Native HEX installer"]');
    const slot = shadow.querySelector('[data-hex-installer-slot="cli"]');
    assert.ok(panel && slot && slot.contains(panel));
    const layout = microsite.querySelector('.hex-workspace-layout.hex-ms-layout');
    assert.ok(layout, 'mounted product composition retains the existing Empire lattice');
    assert.equal(panel.closest('.hex-workspace-layout'), layout, 'installer inherits the retained layout variables');
    const rail = label => w.document.querySelector(`[data-window-rail-tabs] button[aria-label="${label}"]`);
    const selectedRail = label => assert.ok(rail(label)?.querySelector(':scope > div'), `${label} is selected`);
    const button = label => [...shadow.querySelectorAll('button')].find(el => el.textContent.trim().startsWith(label));
    function noRetiredCatalog() {
      assert.doesNotMatch(shadow.textContent, /Tools & Diagnostics|XI-IO Ecosystem Component Catalog|Software reference catalog\./);
      assert.equal(shadow.querySelectorAll('[aria-label="Native HEX installer"]').length, 1);
      assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'), panel);
      assert.equal(panel.closest('.hex-workspace-layout'), layout);
      assert.equal(w.document.querySelectorAll('[data-native-product="hex"]').length, 1);
    }
    async function click(el) {
      assert.ok(el, 'requested control exists');
      for (const name of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
        const event = new w.MouseEvent(name, {bubbles: true, cancelable: true, composed: true, button: 0});
        Object.defineProperty(event, 'pointerType', {value: 'mouse'}); el.dispatchEvent(event);
      }
      el.dispatchEvent(new w.MouseEvent('click', {bubbles: true, cancelable: true, composed: true})); await pause(25);
    }
    function selectedPage(page) {
      assert.equal(microsite.getAttribute('data-product-page'), page);
      const tab = shadow.querySelector(`[role="tab"][data-xiui-tab-id="${page}"]`);
      assert.ok(tab); assert.equal(tab.getAttribute('aria-selected'), 'true');
      const content = shadow.getElementById(tab.getAttribute('aria-controls'));
      assert.ok(content && !content.hidden, 'tab controls its visible ShadowRoot panel');
      noRetiredCatalog();
    }
    assert.equal(microsite.getAttribute('data-product-page'), 'library');
    assert.ok(shadow.querySelector('main[aria-label="Product Library"]'));
    selectedRail('Library'); assert.equal(slot.hidden, true);
    assert.deepEqual([...w.document.querySelectorAll('[data-window-rail-tabs] button')].map(el => el.getAttribute('aria-label')), ['Library', 'Install', 'Tools', 'Maths']);
    assert.equal(w.document.querySelector('[data-native-product="hex"]').getAttribute('data-chroma-key'), 'cyan-500');
    assert.equal(w.document.querySelector('.xi-window').style.getPropertyValue('--chroma-hue'), '188');
    const railTint = w.document.querySelector('[data-window-left-rail] > [aria-hidden="true"]').style.backgroundColor;
    assert.equal(railTint, w.document.querySelector('[data-window-title-chrome]').style.backgroundColor);
    assert.match(railTint, /^rgba?\(/); noRetiredCatalog();

    const products = ['cli', 'publisher', 'sam_law', 'studio', 'veilrift', 'ibal'];
    assert.deepEqual([...shadow.querySelectorAll('[data-product-id]')].map(el => el.getAttribute('data-product-id')), products);
    for (const id of products) {
      await click(rail('Library')); noRetiredCatalog();
      const card = shadow.querySelector(`[data-product-id="${id}"]`);
      const name = card.querySelector('h3').textContent;
      await click(card.querySelector('button'));
      assert.ok(shadow.querySelector(`main[aria-label="${name} product page"]`));
      selectedPage('overview'); assert.equal(slot.hidden, true);
      await click(button('View requirements')); selectedPage('requirements');
      assert.match(shadow.querySelector('[data-product-primitive="PlatformRequirements"]').textContent, /\S/);
      if (id === 'cli') {
        await click(button('Review installation')); selectedPage('install');
        assert.equal(slot.hidden, false); assert.match(panel.textContent, /Native HEX is required/);
      } else {
        assert.equal(shadow.querySelector('[role="tab"][data-xiui-tab-id="install"]'), null);
        assert.ok(shadow.querySelector('[aria-label="Installation unavailable"]'));
        assert.equal(slot.hidden, true, 'unbound product cannot borrow the CLI installation');
        assert.ok([...shadow.querySelectorAll('main button')].every(el => !/^Open\b/i.test(el.textContent.trim()) || el.disabled), 'unknown native binding offers no enabled Open');
      }
      noRetiredCatalog();
      await click(shadow.querySelector('button[aria-label="Back to Library"]'));
      assert.equal(microsite.getAttribute('data-product-page'), 'library');
      assert.equal(slot.hidden, true); noRetiredCatalog();
    }
    await click(shadow.querySelector('[data-product-id="cli"] button'));
    const overview = shadow.querySelector('[role="tab"][data-xiui-tab-id="overview"]');
    overview.focus(); overview.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
    await pause(25); selectedPage('requirements');
    assert.equal(shadow.activeElement.getAttribute('data-xiui-tab-id'), 'requirements');
    assert.equal(shadow.querySelector('[role="tab"][data-xiui-tab-id="overview"]').getAttribute('tabindex'), '-1');
    const beforeTheme = microsite.getAttribute('data-product-theme');
    await click(shadow.querySelector('button[aria-label^="Switch to"]'));
    assert.notEqual(microsite.getAttribute('data-product-theme'), beforeTheme);
    await click(rail('Tools')); selectedRail('Tools');
    assert.ok(microsite.closest('[hidden]'), 'Tools hides rather than remounts the composition'); noRetiredCatalog();
    await click(rail('Maths')); selectedRail('Maths');
    const maths = shadow.querySelector('[data-hex-snap55-workbench]');
    assert.ok(maths, 'existing maths editor remains reachable');
    assert.ok(maths.querySelector('textarea').value.includes('"nowMs": "1793200000000"'));
    await click(button('Calculate locally'));
    const result = maths.querySelector('[data-snap55-result]'); assert.ok(result);
    assert.equal(maths.querySelector('[data-snap55-state]').textContent, 'SOURCE_BOUND_NUMERIC');
    assert.ok(Math.abs(Number(maths.querySelector('[data-snap55-r]').textContent) - (0.25 * 13 / 21 + 0.65 * 0.5 + 0.005)) < 1e-15);
    assert.match(result.textContent, /provider_effect/); assert.match(result.textContent, /authority_granted/);
    assert.equal(w.__TAURI__, undefined, 'local maths needs no native IPC or account');
    await click(rail('Library'));
    assert.equal(microsite.closest('[hidden]'), null);
    assert.equal(microsite.getAttribute('data-product-page'), 'library'); noRetiredCatalog();
    for (const label of ['Minimize window', 'Maximize window', 'Close window']) assert.equal(w.document.querySelector(`button[aria-label="${label}"]`).disabled, true);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('unreported or historical installation data never becomes current device success', async () => {
  const {installerStatus} = await import('../src/lib/nativeInstaller.mjs');
  for (const name of ['Aries', 'Loki', 'Any customer computer']) {
    for (const value of [null, {}, {hostname: name}, {hostname: name, source_sha: 'a'.repeat(40)}, {hostname: name, phase: 'INSTALLED_READBACK_VERIFIED'}]) assert.notEqual(installerStatus(value).tone, 'success');
  }
  assert.notEqual(installerStatus({phase: 'APPLY_OUTCOME_UNCERTAIN', hostname: 'Aries'}, true).tone, 'success');
  assert.match(installerStatus({phase: 'INSTALLED_READBACK_VERIFIED'}, true).message, /services not started.*Remote connection is not configured/);
});
