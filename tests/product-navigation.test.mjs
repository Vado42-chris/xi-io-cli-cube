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
  // Layout-only adapters initially; bounded chooser response fixture below, no external loading.
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
    assert.match(shadow.textContent, /Selected operating-system guide/);
    assert.doesNotMatch(shadow.textContent, /operating system was detected/);
    assert.equal(rail('Data'), null, 'unbound generic navigation is not shown');
    await click(rail('Software')); selectedRail('Software'); selectedProduct('Tools & Diagnostics'); selectedProduct('1. HEX Software Suite');
    assert.ok(shadow.textContent.includes('Software reference catalog.'));
    const componentPanel = panel();
    const ids = ['cli', 'editor', 'studio', 'web', 'switchboard', 'bins', 'ward'];
    for (const id of ids) {
      await click(rail('Software'));
      const availability = shadow.querySelector(`[data-product-availability="${id}"]`);
      const card = availability?.closest('[role="button"]');
      assert.ok(card);
      assert.match(card.textContent, /Installed on this computer: not reported/);
      assert.doesNotMatch(card.textContent, /Aries|Loki|54509965|verified socket|mutual TLS|409|qualified CLI|D-Bus|background monitors/i);
      await click(card);
      assert.equal(panel(), componentPanel, 'product selection retains actual installer recovery state');
      // HEX installs the same six-product baseline regardless of which
      // catalog card opened the Install tab. Product-specific detail remains
      // explanatory and cannot hide the actual native bundle installer.
      assert.equal(Boolean(panel().closest('.hidden')), false, 'core installer remains available for ' + id);
      assert.match(panel().textContent, /XI-IO core baseline/);
      const reference = [...shadow.querySelectorAll('details')].find(el => el.querySelector('summary')?.textContent.includes('Historical CLI developer reference'));
      assert.ok(reference && !reference.open, 'unrelated old CLI commands are closed historical reference');
      assert.match(reference.textContent, /not the current release or evidence of what is installed/);
      assert.match(reference.textContent, /do not describe requirements for other products/);
    }
    await click(rail('Software'));
    await click(shadow.querySelector('[data-product-availability="cli"]').closest('[role="button"]'));
    await click(rail('Install')); selectedRail('Install'); selectedProduct('2. Install & Compile');
    const retainedPanel = panel(); assert.ok(retainedPanel); assert.equal(retainedPanel.closest('.hidden'), null);
    assert.ok(retainedPanel.textContent.includes('Native HEX is required.'));
    await click(rail('Status')); selectedRail('Status'); selectedProduct('3. System Diagnostics');
    const diagnostics = shadow.querySelector('[aria-label="System Diagnostics"]');
    assert.ok(diagnostics);
    assert.match(diagnostics.textContent, /has not queried your computers or services/);
    assert.doesNotMatch(diagnostics.textContent, /Aries|Loki|PASS|16:05|rollback\.json|100% offline/);
    assert.equal((diagnostics.textContent.match(/NOT REPORTED/g) || []).length, 9);
    await click(button('Load Canary Receipt'));
    assert.match(diagnostics.textContent, /Valid BINS CAS conflict receipt schema/);
    assert.equal((diagnostics.textContent.match(/NOT REPORTED/g) || []).length, 9, 'a synthetic schema example never qualifies this device');
    for (const estate of ['workspace', 'device', 'platform']) {
      await click([...diagnostics.querySelectorAll('button')].find(el => el.textContent.trim() === estate));
      assert.equal((diagnostics.textContent.match(/NOT REPORTED/g) || []).length, 9);
      assert.doesNotMatch(diagnostics.textContent, /PASS|16:05/);
    }
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
    await click(shadow.querySelector('button[aria-label="Jump to step 5"]'));
    const stepButtons = [...shadow.querySelector('[aria-label="First-run steps"]').querySelectorAll('button')];
    assert.deepEqual(stepButtons.map(el => el.textContent.trim()), ['1', '2', '3', '4', '5'], 'navigation never creates completion checkmarks');
    assert.equal(stepButtons[4].getAttribute('aria-current'), 'step');
    for (const el of stepButtons) {
      assert.doesNotMatch(el.className, /text-workspace-success|bg-emerald/);
      assert.match(el.title, /not a completed check/);
    }
    await click(shadow.querySelector('button[aria-label="Jump to step 1"]'));
    const account = Array.from(shadow.querySelectorAll('[role="button"]')).find(el => el.textContent.includes('Connect an account'));
    await click(account); assert.equal(account.getAttribute('aria-pressed'), 'true');
    assert.match(shadow.textContent, /Account sign-in is not connected in this build/);
    await click(button('Continue to Workspace Folder'));
    assert.equal(shadow.querySelector('#folder-input').value, '');
    assert.match(shadow.textContent, /does not grant file permissions/);
    assert.equal(button('Use Sample'), undefined, 'no fabricated workspace shortcut');
    await click(button('Choose Folder'));
    assert.equal(shadow.querySelector('#folder-input').value, '');
    assert.match(shadow.textContent, /Open the native HEX application to choose a local directory/);
    // Exercise the actual App handler through a narrowly bounded IPC response fixture.
    // This verifies chooser wiring/cancellation, not a native dialog or filesystem access.
    const chooserRequests = [];
    const chooserReplies = [{cancelled:true}, {cancelled:false,path:'/fixture/selected-workspace'}, {cancelled:true}];
    w.__TAURI__ = {core:{invoke: async (command, args) => {
      assert.equal(command, 'native_select_directory');
      assert.equal(args.purpose, 'workspace');
      assert.deepEqual(Object.keys(args), ['purpose']);
      chooserRequests.push(command);
      return chooserReplies.shift();
    }}};
    await click(button('Choose Folder'));
    assert.equal(shadow.querySelector('#folder-input').value, '', 'cancel preserves empty workspace');
    assert.match(shadow.textContent, /Directory selection cancelled/);
    await click(button('Choose Folder'));
    assert.equal(shadow.querySelector('#folder-input').value, '/fixture/selected-workspace');
    assert.match(shadow.textContent, /Access still requires its existing permission checks/);
    await click(button('Choose Folder'));
    assert.equal(shadow.querySelector('#folder-input').value, '/fixture/selected-workspace', 'cancel preserves prior selection');
    assert.match(shadow.textContent, /Directory selection cancelled/);
    assert.equal(chooserRequests.length, 3);
    assert.equal(chooserReplies.length, 0);
    delete w.__TAURI__;
    selectedRail('Setup'); selectedProduct('Setup');
    await click(button('Next: Set Up Local AI'));
    assert.ok(shadow.querySelector('[aria-label="Local AI observation"]'));
    assert.match(shadow.textContent, /Open native HEX to check this computer/);
    assert.equal(button('Empty (0 Models)'), undefined, 'fake model readiness toggles removed');
    assert.equal(button('ready'), undefined);
    await click(button('Next: Try a Safe Task'));
    assert.ok(shadow.querySelector('[aria-label="Disposable local file proof"]'));
    assert.match(shadow.textContent, /Open native HEX to check this computer/);
    assert.equal(button('Apply Example'), undefined, 'fake file success controls removed');
    assert.equal(button('Reset Example'), undefined);
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

// Pure observed-state projection: arbitrary device labels, source metadata and
// partial receipts are not live installed evidence. This is not a native test.
test('unreported or historical installation data never becomes current device success', async () => {
  const {installerStatus} = await import('../src/lib/nativeInstaller.mjs');
  for (const name of ['Aries', 'Loki', 'Any customer computer']) {
    for (const value of [null, {}, {hostname:name}, {hostname:name, source_sha:'a'.repeat(40)}, {hostname:name, phase:'INSTALLED_READBACK_VERIFIED'}]) {
      assert.notEqual(installerStatus(value).tone, 'success');
    }
  }
  assert.notEqual(installerStatus({phase:'APPLY_OUTCOME_UNCERTAIN', hostname:'Aries'}, true).tone, 'success');
  assert.match(installerStatus({phase:'INSTALLED_READBACK_VERIFIED'}, true).message, /services not started.*Remote connection is not configured/);
});
