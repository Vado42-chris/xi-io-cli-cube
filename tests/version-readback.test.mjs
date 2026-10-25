import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareVersionReport,MAX_VERSION_REPORT_BYTES} from '../src/version-readback.mjs';
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const pin=app.match(/\bsha:\s*"([0-9a-f]{40})"/)[1];
const report=()=>({schema:'xiio.cli.version/v1',product:'xi-io: CLI',source_sha:pin,ref:pin,generation:pin.slice(0,12)+'-20261025T160500Z',running_file_sha256:'a'.repeat(64),receipt_file_sha256:'a'.repeat(64),current:'recorded-generation',previous:null,platform:'linux',commands:'SANDBOXED',active_workspace:null});
const compare=value=>compareVersionReport(JSON.stringify(value),pin);
test('reported version: matching schema, pinned source and paired digests yields reported comparison only',()=>{
 const r=compare(report());assert.equal(r.status,'valid');assert.equal(r.detectedSha,pin);
 assert.match(r.details,/REPORTED COMPARISON MATCH/);assert.match(r.details,/not independent host/);assert.match(r.details,/NOT_REPORTED/);assert.match(r.details,/UNKNOWN/);
 assert.deepEqual(compare({...report(),node_path:'/invented/node',wrapper_type:'QUALIFIED',wrapper_status:'PASS'}),r);
 assert.equal(compareVersionReport(' ',pin).status,'idle');
});
test('reported version: raw hashes, terminal prose, malformed JSON, null and wrong schema/product fail closed',()=>{
 for(const value of [pin,'a'.repeat(64),'Installed '+pin,'{', '5b2d807'])assert.equal(compareVersionReport(value,pin).status,'invalid');
 for(const value of [null,[],true,{...report(),schema:'other/v1'},{...report(),product:'other'}])assert.equal(compare(value).status,'invalid');
});
test('reported version: hashes must be complete strings; missing receipt cannot pass',()=>{
 for(const field of ['source_sha','running_file_sha256','receipt_file_sha256']){
  for(const value of [undefined,null,7,'short','A'.repeat(field==='source_sha'?40:64)])assert.equal(compare({...report(),[field]:value}).status,'invalid');
 }
 // A pinned-looking substring elsewhere cannot override an invalid source_sha.
 assert.equal(compare({...report(),source_sha:'UNKNOWN',note:pin}).status,'invalid');
});
test('reported version: source or paired-digest disagreement is mismatch, never a repaired candidate',()=>{
 assert.equal(compare({...report(),source_sha:'b'.repeat(40)}).status,'mismatch');
 assert.equal(compare({...report(),source_sha:'5b2d80766a2fca01d51a92e6e3c545b7364bfa10'}).status,'mismatch');
 assert.equal(compare({...report(),receipt_file_sha256:'b'.repeat(64)}).status,'mismatch');
});
test('reported version: byte limit applies before parsing, including multibyte content',()=>{
 assert.equal(compareVersionReport(' '.repeat(MAX_VERSION_REPORT_BYTES+1),pin).status,'invalid');
 assert.equal(compare({...report(),note:'é'.repeat(MAX_VERSION_REPORT_BYTES/2)}).status,'invalid');
});
test('source pane uses actual pinned installer commands and comparison module, not nonexistent npm build',()=>{
 const pane=app.slice(app.indexOf("{cliMode === 'source'"),app.indexOf("{cliMode === 'validator'"));
 assert.match(pane,/gh repo clone \$\{RELEASE.repo\} xi-io-cli && cd xi-io-cli && git checkout --detach \$\{RELEASE.sha\}/);
 assert.match(pane,/node --check install\.mjs/);assert.match(pane,/node install\.mjs --ref \$\{RELEASE.sha\}/);
 assert.doesNotMatch(pane,/npm ci|npm run build|npm link|Compile Binary|editor open/);
 assert.match(app,/setReadbackResult\(compareVersionReport\(text, RELEASE.sha\)\)/);
 assert.doesNotMatch(app,/MATCH VERIFIED: Installed binary|REPAIRED CANDIDATE DETECTED|text.includes\('5b2d807'\)/);
});

test('P1: bad installed launcher text is a diagnostic, not a SHA or host attestation',()=>{
  const bin=compareVersionReport('bash: xi-io-cli: command not found',pin);
  assert.equal(bin.status,'invalid');assert.equal(bin.p1Notice?.type,'violation');
  const env=compareVersionReport('#!/usr/bin/env node\nconsole.log(1)',pin);
  assert.equal(env.status,'invalid');assert.equal(env.p1Notice?.type,'warning');
  const sh=compareVersionReport('#!/bin/bash\nexec node "$s" "$@"',pin);
  assert.equal(sh.status,'invalid');assert.equal(sh.p1Notice?.type,'warning');
  const normal={...report(),node_path:null,wrapper_type:null};
  assert.equal(compare(normal).status,'valid');assert.equal(compare(normal).p1Notice,undefined);
  assert.equal(compareVersionReport('expected '+pin+' but cli missing',pin).status,'invalid');
  assert.equal(compareVersionReport('zsh: command not found: xi-io-cli',pin).p1Notice?.type,'violation');
});
