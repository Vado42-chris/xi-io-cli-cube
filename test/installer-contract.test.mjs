#!/usr/bin/env node
/**
 * Offline CLI install-cube contract checks: no network, API, tokens, browser,
 * provider, npm install, or xi-io CLI execution. They audit source, not runtime.
 * Independent pinned source oracle: xi-io-cli PR #13 at
 * 54509965c9d91ab02febcc8e49755e2b072a0ca9,
 * install.mjs Git blob 3c9c52335e1b88d104b04823c298e1bf6d0ed1c6.
 * CLI #14 is a DIFFERENT draft candidate, not automatically the released pin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const optional = p => fs.existsSync(path.join(ROOT, p)) ? read(p) : '';
const app = read('src/App.tsx');
const html = read('index.html');
const css = optional('src/index.css');
const packageJson = JSON.parse(read('package.json'));
const metadata = optional('metadata.json');
const envTemplate = optional('.env.example');
const PINNED_ORACLE = Object.freeze({
  repo: 'Vado42-chris/xi-io-cli',
  sha: '54509965c9d91ab02febcc8e49755e2b072a0ca9',
  installerBlob: '3c9c52335e1b88d104b04823c298e1bf6d0ed1c6',
  issue: 'https://github.com/Vado42-chris/xi-io-cli/issues/12'
});

function releaseConfig() {
  const hits = [...app.matchAll(/\bconst\s+RELEASE\s*=\s*\{([\s\S]*?)\}\s*;/g)];
  assert.equal(hits.length, 1, 'One RELEASE declaration is required in App.tsx');
  const pairs = [...hits[0][1].matchAll(/^\s*(label|repo|sha|issueUrl)\s*:\s*["']([^"']+)["']\s*,?\s*$/gm)];
  const values = Object.fromEntries(pairs.map(([, key, val]) => [key, val]));
  assert.deepEqual(Object.keys(values).sort(), ['issueUrl','label','repo','sha'].sort());
  assert.ok(app.indexOf('const RELEASE') < app.indexOf('export default function App'),
    'RELEASE must be the top-level source of truth');
  return values;
}

function commandValue(name) {
  const tick = String.fromCharCode(96);
  const regex = new RegExp('\\bconst\\s+' + name + '\\s*=\\s*(' +
    tick + '[^' + tick + ']*' + tick + '|"[^"]*"|\\x27[^\\x27]*\\x27)\\s*;');
  const found = app.match(regex);
  assert.ok(found, 'Command must have an inspectable string initializer: ' + name);
  const contents = found[1].slice(1,-1);
  const release = releaseConfig();
  const expanded = contents.replace(/\$\{RELEASE\.(\w+)\}/g, (_,key) => {
    assert.ok(Object.hasOwn(release,key), 'Unknown RELEASE field: '+key);
    return release[key];
  });
  assert.doesNotMatch(expanded, /\$\{/, 'Unresolved dynamic command expression: '+name);
  return expanded.replace(/\\(["'\\])/g, '$1');
}
function commands() {
  return {
    download: commandValue('downloadCommand'),
    install: commandValue('installCommand'),
    version: commandValue('versionCommand'),
    start: commandValue('startCommand'),
    rollback: commandValue('rollbackCommand')
  };
}

test('pinned candidate is exact and cannot silently shift to CLI #14', () => {
  const r=releaseConfig();
  assert.deepEqual({repo:r.repo,sha:r.sha,issue:r.issueUrl},
    {repo:PINNED_ORACLE.repo,sha:PINNED_ORACLE.sha,issue:PINNED_ORACLE.issue});
  assert.match(r.sha, /^[0-9a-f]{40}$/);
  assert.match(r.label, /\bcandidate\b/i);
  assert.match(r.label, /not a release/i);
  assert.equal(app.split(r.sha).length-1,1,'SHA belongs only in RELEASE, not duplicated in commands');
});

test('download command uses GitHub raw installer pinned at exactly the same SHA',()=>{
  const r=releaseConfig();
  assert.equal(commands().download,
    'gh api -H "Accept: application/vnd.github.raw" "repos/' +
    r.repo + '/contents/install.mjs?ref=' + r.sha + '" > xiio-install.mjs');
  assert.match(app, /id="step-1"[\s\S]*?command=\{downloadCommand\}/);
});

test('all five copyable commands preserve CLI V1 semantics without --execute',()=>{
  const r=releaseConfig(),cmd=commands();
  assert.equal(cmd.install,'node xiio-install.mjs --ref '+r.sha);
  assert.equal(cmd.version,'xi-io-cli version');
  assert.equal(cmd.start,'xi-io-cli');
  assert.equal(cmd.rollback,'xi-io-cli rollback');
  for (const [kind,value] of Object.entries(cmd)) {
    assert.equal(value.includes('\n'),false,'Copied '+kind+' command must be one line');
    assert.doesNotMatch(value,/--execute\b|curl\s+.+\|\s*(?:sh|bash)|sudo\s+sh\b/,
      'Public installer may not silently authorize the host shell');
  }
  for (const [number,name] of [[2,'installCommand'],[3,'versionCommand'],
    [4,'startCommand'],[5,'rollbackCommand']]) {
    const regex=new RegExp('id="step-'+number+'"[\\s\\S]*?command=\\{'+name+'\\}');
    assert.match(app,regex,'The command for step '+number+' must be the one displayed');
  }
});

test('source SHA check, rollback and existing-launcher conflict remain legible',()=>{
  assert.match(app,/source_sha must equal/);
  assert.match(app,/\{RELEASE\.sha\}/);
  assert.match(app,/LAUNCHER_OWNERSHIP_CONFLICT/);
  assert.match(app,/PATH needs updating/);
  assert.match(app,/add_to_path/);
  assert.match(app,/[Rr]un it again to undo the rollback/);
  assert.match(app,/[Rr]eport a problem \(V1 issue\)/);
  assert.match(app,/href=\{RELEASE\.issueUrl\}/);
});

test('OS tabs are keyboard-operable without orphaned ARIA relationships',()=>{
  assert.match(app,/(?:navigator\.userAgent|userAgentData)/);
  assert.match(app,/role="tablist"/);
  assert.match(app,/role="tab"/);
  assert.ok(/\bonKeyDown\s*=/.test(app)||/tabIndex=\{?0\}?/.test(app),
    'Inactive tabs must support arrow-key navigation or ordinary Tab focus');
  if (/aria-controls=\{\x60tabpanel-\$\{os\}\x60\}/.test(app)) {
    assert.match(app,/id=\{\x60tabpanel-\$\{selectedOS\}\x60\}/,
      'Tab control must point to a corresponding tabpanel element');
  }
  assert.doesNotMatch(app,/selectedOS\s*===\s*['"]linux['"]\s*\|\|\s*true/,
    'Linux-only bubblewrap text may not be forcibly shown on every OS');
});

test('clipboard fallback cannot claim Copied after unverified execCommand',()=>{
  assert.match(app,/navigator\.clipboard\.writeText\s*\(/);
  assert.match(app,/(?:\.select\s*\(|setSelectionRange\s*\(|selectNodeContents\s*\()/,
    'Users need a selection fallback when clipboard permission is denied');
  if (/document\.execCommand\s*\(\s*['"]copy['"]\s*\)/.test(app)) {
    assert.ok(
      /(?:const|let)\s+\w+\s*=\s*document\.execCommand\s*\(\s*['"]copy['"]\s*\)/.test(app)
      || /if\s*\(\s*document\.execCommand\s*\(\s*['"]copy['"]\s*\)\s*\)/.test(app),
      'The deprecated execCommand boolean must be checked before success state');
  }
  assert.match(app,/[Cc]opied/);
});

test('static UI contains no model, API, network, telemetry or external asset client',()=>{
  const inspected=[app,read('src/main.tsx'),html,css,optional('vite.config.ts')].join('\n');
  for(const [reason,pattern] of [
    ['fetch',/\bfetch\s*\(/],
    ['XHR',/\bXMLHttpRequest\b/],
    ['WebSocket',/\bWebSocket\b/],
    ['EventSource',/\bEventSource\b/],
    ['Gemini',/\bGemini\b|@google\/genai|generativ(e[-_]?ai|eai)/i],
    ['credential storage',/\b(?:localStorage|sessionStorage|indexedDB)\b/],
    ['external script',/<script\b[^>]*\bsrc\s*=\s*["']https?:/i],
    ['external stylesheet',/<link\b[^>]*\bhref\s*=\s*["']https?:/i],
    ['remote CSS',/@import\s+(?:url\()?["']?https?:/i],
    ['TempTransport',/\bTempTransport\b/i],
  ]) assert.doesNotMatch(inspected,pattern,'Static/offline failure: '+reason);
  assert.match(html,/\/src\/main\.tsx/);
  assert.match(app,/<CommandBlock/);
});

test('metadata, env template and dependencies have no inherited AI/backend residue',()=>{
  assert.doesNotMatch(metadata,/TempTransport|Cold Chain|GEMINI|SERVER_SIDE_GEMINI/i);
  assert.doesNotMatch(envTemplate,/\b(?:GEMINI_API_KEY|API_KEY|PASSWORD|SECRET|TOKEN)\b/i);
  const dependencies={...packageJson.dependencies,...packageJson.devDependencies};
  for(const unwanted of ['@google/genai','@google/generative-ai','express','dotenv','@types/express']) {
    assert.equal(Object.hasOwn(dependencies,unwanted),false,
      'Unused backend/AI dependency cannot ship in static installer: '+unwanted);
  }
});

test('phone code blocks scroll horizontally and copy their exact source',()=>{
  assert.match(app,/overflow-x-auto/);
  assert.match(app,/whitespace-pre(?:\b|[-])/);
  assert.match(app,/font-mono/);
  assert.match(app,/aria-label=\{\x60Copy command:/);
});

test('optional independent pinned CLI installer byte oracle', t=>{
  const file=process.env.XIIO_PINNED_CLI_INSTALLER_FILE;
  if(!file){
    t.skip('PINNED_CLI_BYTES_NOT_SUPPLIED: UI source tests are not GitHub source custody');
    return;
  }
  const bytes=fs.readFileSync(file);
  const blob=createHash('sha1').update('blob '+bytes.byteLength+'\0').update(bytes).digest('hex');
  assert.equal(blob,PINNED_ORACLE.installerBlob,'CLI installer source bytes changed');
  const cli=bytes.toString('utf8');
  assert.match(cli,/LAUNCHER_OWNERSHIP_CONFLICT/);
  assert.match(cli,/install-receipt\.json/);
  assert.match(cli,/const\s+REF\s*=/);
  assert.match(cli,/--ref/);
  assert.match(cli,/rollback/);
});
