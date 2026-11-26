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

test('built Software mounts the recovered Artcraft body inside the retained native frame', async () => {
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
    // JSDOM cannot run the donor GPU/WASM surface. Deliberately refuse that
    // import here; the unchanged donor tests and native observer qualify it.
    const module = new SourceTextModule(script, {
      context: dom.getInternalVMContext(),
      initializeImportMeta(meta) {meta.url = new URL(scriptPath, w.location.href).href;},
      importModuleDynamically: async () => {throw Error('ARTCRAFT_TEST_EXECUTOR_NO_WASM');},
    });
    await module.link(specifier => {throw new Error('Unexpected non-bundled import: ' + specifier);});
    await module.evaluate(); await pause(100);
    const shadow = w.document.querySelector('[data-hex-product-content]')?.shadowRoot;
    assert.ok(shadow, 'actual product portal rendered');
    const panel = shadow.querySelector('[aria-label="Native HEX installer"]');
    assert.ok(panel && panel.closest('[hidden]'), 'one installer is retained outside Software');
    const layout = panel.closest('.hex-workspace-layout');
    assert.ok(layout, 'installer retains the existing lattice');
    const rail = label => w.document.querySelector(`[data-window-rail-tabs] button[aria-label="${label}"]`);
    const selectedRail = label => assert.ok(rail(label)?.querySelector(':scope > div'), `${label} is selected`);
    const button = label => [...shadow.querySelectorAll('button')].find(el => el.textContent.trim().startsWith(label));
    function retainedHost() {
      assert.doesNotMatch(shadow.textContent, /Tools & Diagnostics|XI-IO Ecosystem Component Catalog|Software reference catalog\./);
      assert.equal(shadow.querySelector('[data-hex-microsites]'), null, 'new microsites do not stand in for Artcraft');
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
      el.dispatchEvent(new w.MouseEvent('click', {bubbles: true, cancelable: true, composed: true})); await pause(30);
    }
    function artcraftBody() {
      const body = shadow.querySelector('section[aria-label="HEX launcher body"][data-artcraft-mount-status]');
      assert.ok(body, 'the recovered body is mounted on Software');
      assert.equal(body.querySelectorAll('canvas[aria-label="HEX software marketplace"]').length, 1);
      assert.notEqual(body.dataset.artcraftMountStatus, 'mounted', 'refused fixture import cannot claim donor initialization');
      assert.equal(body.querySelector('[aria-label="HEX software marketplace initialized"]'), null);
      return body;
    }
    const firstBody = artcraftBody();
    selectedRail('Software');
    assert.deepEqual([...w.document.querySelectorAll('[data-window-rail-tabs] button')].map(el => el.getAttribute('aria-label')), ['Software', 'Install', 'Tools', 'Maths']);
    assert.equal(w.document.querySelector('[data-native-product="hex"]').getAttribute('data-chroma-key'), 'cyan-500');
    assert.equal(w.document.querySelector('.xi-window').style.getPropertyValue('--chroma-hue'), '188');
    const railTint = w.document.querySelector('[data-window-left-rail] > [aria-hidden="true"]').style.backgroundColor;
    assert.equal(railTint, w.document.querySelector('[data-window-title-chrome]').style.backgroundColor);
    assert.match(railTint, /^rgba?\(/); retainedHost();
    assert.equal(button('Open SAM_LAW in HEX'), undefined, 'unbound products never expose a launch action');
    assert.doesNotMatch(firstBody.textContent, /NATIVE_PRODUCT_WINDOW_READBACK_VERIFIED/);

    await click(rail('Install')); selectedRail('Install');
    assert.equal(firstBody.isConnected, false, 'leaving Software releases its canvas consumer');
    assert.equal(shadow.querySelector('[aria-label="HEX launcher body"]'), null);
    assert.equal(panel.closest('[hidden]'), null); assert.match(panel.textContent, /Native HEX is required/); retainedHost();
    const workspace = [...shadow.querySelectorAll('[data-hex-workspace]')].find(el => !el.closest('[hidden]'));
    assert.ok(workspace);
    const beforeTheme = workspace.getAttribute('data-product-theme');
    await click(shadow.querySelector('button[aria-label^="Switch to"]'));
    assert.notEqual(workspace.getAttribute('data-product-theme'), beforeTheme);
    await click(rail('Tools')); selectedRail('Tools');
    assert.ok(shadow.querySelector('[data-hex-local-tools]'));
    assert.ok(panel.closest('[hidden]')); retainedHost();
    await click(rail('Maths')); selectedRail('Maths');
    const maths = shadow.querySelector('[data-hex-snap55-workbench]');
    assert.ok(maths, 'existing maths editor remains reachable');
    const mathsInput = maths.querySelector('textarea');
    assert.ok(mathsInput.value.includes('"nowMs": "1793200000000"'));
    await click(button('Calculate locally'));
    const result = maths.querySelector('[data-snap55-result]'); assert.ok(result);
    const resultText = result.textContent;
    assert.equal(maths.querySelector('[data-snap55-state]').textContent, 'SOURCE_BOUND_NUMERIC');
    assert.ok(Math.abs(Number(maths.querySelector('[data-snap55-r]').textContent) - (0.25 * 13 / 21 + 0.65 * 0.5 + 0.005)) < 1e-15);
    assert.match(resultText, /provider_effect/); assert.match(resultText, /authority_granted/);
    assert.equal(w.__TAURI__, undefined, 'local maths needs no native IPC or account');
    await click(rail('Software')); selectedRail('Software');
    assert.notEqual(artcraftBody(), firstBody); retainedHost();
    await click(rail('Maths'));
    assert.equal(shadow.querySelector('[data-hex-snap55-workbench]'), maths);
    assert.equal(maths.querySelector('textarea'), mathsInput);
    assert.equal(maths.querySelector('[data-snap55-result]').textContent, resultText, 'Maths result survives Software navigation');
    await click(rail('Install')); assert.equal(panel.closest('[hidden]'), null); retainedHost();
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

test('built Tools shares one read-only plan inspection and recovers explicitly from transport refusal', async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'https://hex-tools-fixture.invalid/', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole,
  });
  const w = dom.window;
  w.matchMedia = media => ({media, matches: media.includes('reduced-motion'), addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
  w.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  w.document.head.appendChild(Object.assign(w.document.createElement('style'), {textContent: css}));
  const requests = [], gates = [];
  let inFlight = false, overlaps = 0, nextGate = null, nextFailure = '';
  let plans = [{plan_id: 'fixture-plan-a', prefix: '/fixture/cli-a', phase: 'INSTALLED_READBACK_VERIFIED'}];
  function holdNextRequest() {
    let release;
    const promise = new Promise(resolve => {release = resolve;});
    gates.push(release); nextGate = promise;
    return release;
  }
  const invoke = async (command, args) => {
    if (command === 'native_product_window') return {maximized: false, fullscreen: false};
    assert.equal(command, 'installer_request');
    const request = JSON.parse(JSON.stringify(args.request)); requests.push(request);
    if (request.action === 'local_ai_status') {
      assert.deepEqual(request, {action: 'local_ai_status', plan_id: 'fixture-plan-b'});
    } else {
      assert.deepEqual(request, {action: 'inspect'}, 'Tools navigation and refresh cannot prepare, apply or launch');
    }
    // Same exclusion boundary as the native transport, held across the reply.
    if (inFlight) {overlaps++; return {ok: false, error: 'NATIVE_REQUEST_BUSY_DO_NOT_RETRY'};}
    inFlight = true;
    const gate = nextGate; nextGate = null;
    try {
      if (gate) await gate; else await pause(10);
      if (nextFailure) {
        const error = nextFailure; nextFailure = '';
        return {ok: false, error};
      }
      if (request.action === 'local_ai_status') return {ok: true, result: {state: 'NO_MODELS', models: []}};
      return {ok: true, result: {
        plans: JSON.parse(JSON.stringify(plans)), prefix_suggestion: '/fixture/cli', node_suggestion: '/fixture/node',
        supported_components: {cli: {available: true}, bins: {available: false, reason: 'NOT_PACKAGED'}, switchboard: {available: false, reason: 'NOT_PACKAGED'}},
      }};
    } finally {inFlight = false;}
  };
  w.__TAURI__ = {core: {invoke}}; w.__TAURI_INTERNALS__ = {invoke};
  async function until(predicate, message) {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await pause(10);
    assert.ok(predicate(), message);
  }
  try {
    const module = new SourceTextModule(script, {
      context: dom.getInternalVMContext(),
      initializeImportMeta(meta) {meta.url = new URL(scriptPath, w.location.href).href;},
      importModuleDynamically: async () => {throw Error('ARTCRAFT_TEST_EXECUTOR_NO_WASM');},
    });
    await module.link(specifier => {throw new Error('Unexpected non-bundled import: ' + specifier);});
    await module.evaluate();
    await until(() => w.document.querySelector('[data-hex-product-content]')?.shadowRoot?.querySelector('[aria-label="Node executable"]')?.value === '/fixture/node', 'retained installer completed its initial read');
    const shadow = w.document.querySelector('[data-hex-product-content]').shadowRoot;
    const tools = shadow.querySelector('[data-hex-local-tools]');
    const panel = shadow.querySelector('[aria-label="Native HEX installer"]');
    const selectors = () => [...tools.querySelectorAll('select[aria-label="Installed CLI for local checks"]')];
    const optionIds = select => [...select.options].map(option => option.value).filter(Boolean);
    const button = label => [...tools.querySelectorAll('button')].find(el => el.textContent.trim() === label);
    const rail = label => w.document.querySelector(`[data-window-rail-tabs] button[aria-label="${label}"]`);
    const bothLists = ids => {
      assert.equal(selectors().length, 2);
      for (const select of selectors()) assert.deepEqual(optionIds(select), ids);
    };
    async function click(el) {assert.ok(el); el.click(); await pause(30);}
    assert.ok(tools.closest('[hidden]'));
    assert.equal(requests.length, 1, 'hidden Tools does not inspect at startup');
    bothLists([]);

    const releaseEntry = holdNextRequest();
    await click(rail('Tools'));
    assert.equal(requests.length, 2, 'one shared inspect serves both controls on Tools entry');
    assert.equal(overlaps, 0, 'the second control must not contend for native transport');
    assert.ok(selectors().every(select => select.disabled));
    bothLists([]);
    releaseEntry();
    await until(() => !inFlight && selectors().every(select => optionIds(select).includes('fixture-plan-a')), 'both controls receive the same saved plan snapshot');
    bothLists(['fixture-plan-a']);
    selectors()[0].value = 'fixture-plan-a';
    selectors()[0].dispatchEvent(new w.Event('change', {bubbles: true})); await pause(20);
    assert.deepEqual(selectors().map(select => select.value), ['fixture-plan-a', 'fixture-plan-a']);
    assert.equal(button('Check Local AI').disabled, false);

    await click(rail('Install'));
    assert.equal(shadow.querySelector('[aria-label="Native HEX installer"]'), panel);
    plans = [{plan_id: 'fixture-plan-b', prefix: '/fixture/cli-b', phase: 'INSTALLED_READBACK_VERIFIED'}];
    await click(rail('Tools'));
    await until(() => !inFlight && selectors().every(select => optionIds(select).includes('fixture-plan-b')), 'returning from Install refreshes both plan lists');
    assert.equal(requests.length, 3); bothLists(['fixture-plan-b']);
    selectors()[0].value = 'fixture-plan-b';
    selectors()[0].dispatchEvent(new w.Event('change', {bubbles: true})); await pause(20);
    assert.equal(button('Check Local AI').disabled, false);

    const refresh = button('Refresh saved installations');
    const releaseCheck = holdNextRequest();
    button('Check Local AI').click(); refresh.click(); await pause(30);
    assert.equal(requests.length, 4, 'Refresh cannot overlap an existing local check');
    assert.equal(requests.at(-1).action, 'local_ai_status');
    assert.equal(refresh.disabled, true);
    assert.equal(button('Inspect Saved File Tests').disabled, true, 'both controls share native exclusion');
    assert.equal(overlaps, 0);
    releaseCheck();
    await until(() => !inFlight && !refresh.disabled, 'the local check releases the shared request guard');
    assert.match(tools.textContent, /Runtime responded; no models installed/);

    const releaseRefresh = holdNextRequest();
    refresh.click(); refresh.click(); await pause(30);
    assert.equal(requests.length, 5, 'repeated refresh clicks remain one read');
    assert.equal(refresh.disabled, true);
    assert.equal(button('Check Local AI').disabled, true, 'pending metadata is not usable as a current plan selection');
    bothLists([]); releaseRefresh();
    await until(() => !inFlight && !refresh.disabled, 'shared refresh completed'); bothLists(['fixture-plan-b']);

    nextFailure = 'NATIVE_REQUEST_BUSY_DO_NOT_RETRY';
    await click(refresh);
    await until(() => /NATIVE_REQUEST_BUSY_DO_NOT_RETRY/.test(tools.querySelector('[role="alert"]')?.textContent || ''), 'transport refusal is shown truthfully');
    bothLists([]);
    assert.equal(button('Check Local AI').disabled, true);
    const afterFailure = requests.length; await pause(60);
    assert.equal(requests.length, afterFailure, 'a failed read never automatically retries');
    assert.equal(refresh.disabled, false, 'the finite read-only Refresh action remains available');

    plans = [{plan_id: 'fixture-plan-c', prefix: '/fixture/cli-c', phase: 'INSTALLED_READBACK_VERIFIED', do_not_retry: true}];
    await click(refresh);
    await until(() => !inFlight && selectors().every(select => optionIds(select).includes('fixture-plan-c')), 'explicit refresh updates both lists after refusal');
    bothLists(['fixture-plan-c']); assert.equal(tools.querySelector('[role="alert"]'), null);
    assert.equal(requests.length, afterFailure + 1, 'explicit recovery performs one read');
    selectors()[0].value = 'fixture-plan-c';
    selectors()[0].dispatchEvent(new w.Event('change', {bubbles: true})); await pause(20);
    assert.equal(button('Check Local AI').disabled, true, 'shared inspection never relaxes the uncertain-plan guard');
    assert.equal(overlaps, 0);
    assert.equal(requests.filter(request => request.action === 'local_ai_status').length, 1);
    assert.ok(requests.every(request => request.action === 'inspect' || request.action === 'local_ai_status'));
    assert.deepEqual(errors, []);
  } finally {
    for (const release of gates) release();
    await pause(30); w.close();
  }
});
