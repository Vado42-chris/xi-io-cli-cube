import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom';
import {SourceTextModule} from 'node:vm';

// Real built React DOM and the actual ShadowRoot portal, not a replacement App.
// This verifies event dispatch/state, not layout hit testing, iframe policy,
// native IPC, installed payloads, or owner-host execution. Build first.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
function asset(path) {
  assert.ok(path && !/^(?:[a-z]+:)?\/\//i.test(path), 'fixture uses only built local assets');
  const file = resolve(dist, path.replace(/^\//, ''));
  assert.ok(file.startsWith(dist + sep));
  return readFileSync(file, 'utf8');
}
const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
const script = asset(scriptPath);
const css = asset(html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('actual tablet rail and product controls share selected views across the ShadowRoot', async () => {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  console.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'https://hex-interaction-fixture.invalid/', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: console,
  });
  const w = dom.window;
  // Layout-only adapters: no provider/native injection and no external loading.
  w.matchMedia = media => ({media, matches: media.includes('reduced-motion'), addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
  w.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  w.document.head.appendChild(Object.assign(w.document.createElement('style'), {textContent: css}));
  try {
    const module = new SourceTextModule(script, {
      context: dom.getInternalVMContext(),
      initializeImportMeta(meta) {meta.url = new URL(scriptPath, w.location.href).href;},
    });
    await module.link(specifier => {throw new Error('Unexpected non-bundled import: ' + specifier);});
    await module.evaluate();
    await pause(100);
    const shadow = w.document.querySelector('[data-hex-product-content]')?.shadowRoot;
    assert.ok(shadow, 'real product portal rendered');
    assert.equal(w.document.querySelector('[data-native-product="hex"]').getAttribute('data-chroma-key'), 'cyan-500');
    assert.equal(w.document.querySelector('.xi-window').style.getPropertyValue('--chroma-hue'), '188');
    const railTint = w.document.querySelector('[data-window-left-rail] > [aria-hidden="true"]').style.backgroundColor;
    assert.equal(railTint, w.document.querySelector('[data-window-title-chrome]').style.backgroundColor);
    assert.match(railTint, /^rgba?\(/, 'existing accentCss supplies both chrome surfaces');
    const button = label => Array.from(shadow.querySelectorAll('button,[role="button"]')).find(el => el.textContent.trim().startsWith(label));
    const rail = label => w.document.querySelector(`[data-window-rail-tabs] button[aria-label="${label}"]`);
    const selectedRail = label => assert.ok(rail(label)?.querySelector(':scope > div'), `${label} is the frame's selected rune`);
    const selectedProduct = label => assert.equal(button(label)?.getAttribute('aria-selected'), 'true');
    const panel = () => shadow.querySelector('[aria-label="Native HEX installer"]');
    async function click(el) {
      assert.ok(el, 'requested control exists');
      for (const name of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
        const event = new w.MouseEvent(name, {bubbles: true, cancelable: true, composed: true, button: 0});
        Object.defineProperty(event, 'pointerType', {value: 'mouse'});
        el.dispatchEvent(event);
      }
      const accepted = el.dispatchEvent(new w.MouseEvent('click', {bubbles: true, cancelable: true, composed: true}));
      await pause(25);
      return accepted;
    }
    selectedRail('Setup'); selectedProduct('Setup');
    assert.equal(rail('Data'), null, 'unbound generic navigation is not shown');
    await click(rail('Software')); selectedRail('Software'); selectedProduct('Tools & Diagnostics'); selectedProduct('1. HEX Software Suite');
    assert.ok(shadow.textContent.includes('Software reference catalog.'));
    await click(rail('Install')); selectedRail('Install'); selectedProduct('2. Install & Compile');
    const retainedPanel = panel(); assert.ok(retainedPanel); assert.equal(retainedPanel.closest('.hidden'), null);
    assert.ok(retainedPanel.textContent.includes('Native HEX is required.'));
    await click(rail('Status')); selectedRail('Status'); selectedProduct('3. System Diagnostics');
    assert.ok(shadow.querySelector('[aria-label="System Diagnostics"]'));
    assert.equal(panel(), retainedPanel, 'switching tools does not remount the installer'); assert.ok(panel().closest('.hidden'));
    await click(rail('Onboarding')); selectedRail('Onboarding'); selectedProduct('4. Onboarding');
    assert.ok(shadow.textContent.includes('HEX Onboarding, Identity'));
    assert.equal(panel(), retainedPanel);
    await click(button('2. Install & Compile')); selectedRail('Install'); selectedProduct('2. Install & Compile');
    assert.equal(panel(), retainedPanel); assert.equal(panel().closest('.hidden'), null);
    await click(button('Setup')); selectedRail('Setup'); selectedProduct('Setup'); assert.equal(panel(), null);
    // Two state setters in one action must merge rather than lose the view.
    await click(button('Review local installation')); selectedRail('Install'); selectedProduct('Tools & Diagnostics'); selectedProduct('2. Install & Compile');
    assert.equal(panel().closest('.hidden'), null);
    await click(rail('Setup')); selectedRail('Setup'); selectedProduct('Setup');
    const theme = shadow.querySelector('[data-product-theme]');
    const before = theme.getAttribute('data-product-theme');
    await click(shadow.querySelector('button[aria-label^="Switch to"]'));
    assert.notEqual(theme.getAttribute('data-product-theme'), before);
    const account = Array.from(shadow.querySelectorAll('[role="button"]')).find(el => el.textContent.includes('Connect an account'));
    await click(account); assert.equal(account.getAttribute('aria-pressed'), 'true');
    const sites = ['xi-io.ca', 'xi-io.com', 'xi-io.org', 'xi-io.net', 'xi-io.io', 'x42s.com'];
    const links = Array.from(shadow.querySelectorAll('footer a'));
    assert.equal(links.length, sites.length);
    for (const [index, link] of links.entries()) {
      assert.equal(link.href, `https://${sites[index]}/`);
      assert.equal(link.target, '_blank');
      assert.equal(link.rel, 'noopener noreferrer');
      assert.equal(await click(link), true, 'ordinary browser handoff is not canceled');
      assert.equal(link.nextElementSibling.querySelector('input').value, link.getAttribute('href'));
      assert.match(link.nextElementSibling.textContent, /If your preview blocks it/);
    }
    assert.equal(w.__TAURI__, undefined);
    for (const label of ['Minimize window', 'Maximize window', 'Close window']) {
      assert.equal(w.document.querySelector(`button[aria-label="${label}"]`).disabled, true);
    }
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
