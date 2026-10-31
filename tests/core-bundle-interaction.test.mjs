import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {JSDOM, VirtualConsole} from 'jsdom';

// Compile the actual component and its real client/helpers, not a copied state
// predicate. Only native IPC is a fixture. No native install or device claim.
const panelPath = fileURLToPath(new URL('../src/components/NativeInstallerPanel.tsx', import.meta.url));
const result = await build({
  configFile: false, logLevel: 'silent',
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  plugins: [{
    name: 'core-panel-interaction-fixture',
    resolveId(id) { if (id === 'core-panel-fixture' || id.endsWith('/core-panel-fixture')) return '\0core-panel-fixture'; },
    load(id) {
      if (id === '\0core-panel-fixture') return `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {flushSync} from 'react-dom';
        import Panel from ${JSON.stringify(panelPath)};
        flushSync(() => createRoot(document.getElementById('root')).render(React.createElement(Panel)));
        window.__corePanelClick = element => flushSync(() => element.click());
      `;
    },
  }],
  build: {write: false, minify: false,
    lib: {entry: 'core-panel-fixture', name: 'CorePanelFixture', formats: ['iife']}},
});
const bundle = (Array.isArray(result) ? result : [result])
  .flatMap(item => item.output).find(item => item.type === 'chunk').code;
const digest = 'a'.repeat(64);
const review = phase => ({phase, lock_sha256: digest, retry_allowed: true, do_not_retry: false});
const installed = {phase: 'INSTALLED_BYTES_VERIFIED', retry_allowed: false, do_not_retry: true};
const uncertain = {phase: 'APPLY_OUTCOME_UNCERTAIN', retry_allowed: false, do_not_retry: true};
const success = value => ({ok: true, result: value});
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await pause();
  }
  assert.fail('Timed out waiting for component state');
}
async function mount(respond) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://hex.fixture.invalid', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: new VirtualConsole().sendTo(console),
  });
  const requests = [];
  dom.window.fetch = () => { throw Error('NETWORK_FORBIDDEN'); };
  dom.window.__TAURI__ = {core: {invoke: async (command, args) => {
    assert.equal(command, 'installer_request');
    requests.push(args.request);
    if (args.request.action === 'inspect') return success({plans: []});
    return await respond(args.request);
  }}};
  dom.window.eval(bundle);
  await until(() => requests.some(request => request.action === 'inspect'));
  // Let the initial effect's promise finish before driving another request.
  await pause();
  const panel = dom.window.document.querySelector('[aria-label="XI-IO core baseline"]');
  assert.ok(panel);
  const button = text => [...panel.querySelectorAll('button')].find(item => item.textContent.includes(text));
  const inspect = () => button('Check core package availability');
  const apply = () => button('Install approved core products');
  const unknown = () => [...panel.querySelectorAll('[role="alert"]')]
    .some(item => item.textContent.includes('Core installation outcome may be uncertain'));
  await until(() => !inspect().disabled);
  const click = element => dom.window.__corePanelClick(element);
  return {dom, panel, requests, inspect, apply, unknown, click};
}
async function inspect(view) {
  const previous = view.requests.length;
  view.click(view.inspect());
  await until(() => view.requests.length > previous && !view.inspect().disabled);
}
async function approve(view) {
  const checkbox = view.panel.querySelector('input[type="checkbox"]');
  assert.ok(checkbox);
  view.click(checkbox);
  await until(() => view.apply() && !view.apply().disabled);
}

for (const [phase, response, hasApproval, isUnknown] of [
  ['BLOCKED_RELEASE_PROFILE_UNPUBLISHED', {phase: 'BLOCKED_RELEASE_PROFILE_UNPUBLISHED'}, false, false],
  ['REVIEW_REQUIRED', review('REVIEW_REQUIRED'), true, false],
  ['RECONCILED_NOT_INSTALLED', review('RECONCILED_NOT_INSTALLED'), true, false],
  ['APPLY_OUTCOME_UNCERTAIN', uncertain, false, true],
  ['APPLY_IN_PROGRESS', {phase: 'APPLY_IN_PROGRESS', do_not_retry: true, retry_allowed: false}, false, true],
  ['INSTALLED_BYTES_VERIFIED', installed, false, false],
]) {
  test('actual core panel preserves phase semantics: ' + phase, async () => {
    const view = await mount(() => success(response));
    try {
      await inspect(view);
      assert.equal(Boolean(view.apply()), hasApproval);
      assert.equal(view.unknown(), isUnknown);
      assert.equal(view.inspect().disabled, false);
      if (hasApproval) assert.equal(view.apply().disabled, true, 'fresh approval is required');
      assert.equal(view.requests.filter(request => request.action === 'bundle_apply').length, 0);
    } finally { view.dom.window.close(); }
  });
}

test('successful apply then nonretryable installed inspection stays known without offering duplicate apply', async () => {
  let applied = false;
  const view = await mount(request => {
    if (request.action === 'bundle_inspect') return success(applied ? installed : review('REVIEW_REQUIRED'));
    assert.equal(request.action, 'bundle_apply');
    assert.equal(request.approved, true);
    assert.equal(request.lock_sha256, digest);
    applied = true;
    return success({state: 'INSTALLED_BYTES_VERIFIED'});
  });
  try {
    await inspect(view);
    await approve(view);
    view.click(view.apply());
    await until(() => applied && !view.inspect().disabled);
    assert.equal(view.unknown(), false);
    assert.equal(view.apply(), undefined);
    await inspect(view);
    assert.match(view.panel.textContent, /Verified child bytes installed/);
    assert.equal(view.unknown(), false, 'known installed is not an uncertain outcome');
    assert.equal(view.apply(), undefined, 'installed readback never offers duplicate apply');
    assert.equal(view.requests.filter(request => request.action === 'bundle_apply').length, 1);
  } finally { view.dom.window.close(); }
});

test('failed apply remains blocked while read-only inspect reconciles and requires fresh approval', async () => {
  let resolveApply;
  let inspection = review('REVIEW_REQUIRED');
  const view = await mount(request => {
    if (request.action === 'bundle_inspect') return success(inspection);
    assert.equal(request.action, 'bundle_apply');
    return new Promise(resolve => { resolveApply = resolve; });
  });
  try {
    await inspect(view);
    await approve(view);
    const apply = view.apply();
    view.click(apply); view.click(apply);
    await until(() => resolveApply);
    assert.equal(view.requests.filter(request => request.action === 'bundle_apply').length, 1);
    assert.equal(view.apply(), undefined);
    resolveApply({ok: false, error: 'BUNDLE_OUTCOME_UNCERTAIN_DO_NOT_RETRY'});
    await until(() => !view.inspect().disabled);
    assert.equal(view.unknown(), true);
    assert.equal(view.apply(), undefined);
    inspection = uncertain;
    await inspect(view);
    assert.equal(view.unknown(), true);
    assert.equal(view.apply(), undefined);
    inspection = review('RECONCILED_NOT_INSTALLED');
    await inspect(view);
    assert.equal(view.unknown(), false);
    assert.ok(view.apply());
    assert.equal(view.apply().disabled, true);
    assert.equal(view.panel.querySelector('input[type="checkbox"]').checked, false);
    assert.equal(view.requests.filter(request => request.action === 'bundle_apply').length, 1);
  } finally { view.dom.window.close(); }
});
