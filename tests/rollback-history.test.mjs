import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseInstallReceipt, groupInstallReceipts, readSelectedReceipts, MAX_RECEIPT_BYTES, MAX_RECEIPT_FILES} from '../src/rollback-history.mjs';
// Synthetic shape based on byte-verified CLI installer 54509965, not host evidence.
const receipt = () => ({schema:'xiio.cli.install-receipt/v2',installed_at:'2026-10-25T16:05:00.000Z',repo:'Vado42-chris/xi-io-cli',ref:'54509965c9d91ab02febcc8e49755e2b072a0ca9',source_sha:'54509965c9d91ab02febcc8e49755e2b072a0ca9',generation:'54509965c9d9-20261025T160500Z',prefix:'/selected/example',platform:'linux',node:'22.14.0',files:{'src/xiio.mjs':'a'.repeat(64),'config/service-catalog.json':'b'.repeat(64)},models_installed:0});
const parse = value => parseInstallReceipt(JSON.stringify(value));
const file = (value,name='install-receipt.json') => ({name,size:JSON.stringify(value).length,text:async()=>JSON.stringify(value)});
test('rollback history: parse actual v2 field shape without qualifying a current generation',()=>{
  const result=parse(receipt());assert.deepEqual(result,receipt());assert.equal(result.current,undefined);
  // CLI #14 b4d0758d uses mkdtempSync(timestampPrefix + '-') for six-character uniqueness.
  const newer=parse({...receipt(),generation:receipt().generation+'-Ab12Xy'});
  assert.equal(newer.generation,receipt().generation+'-Ab12Xy');
});
test('rollback history: malformed, primitive, unexpected schema, missing fields and file hashes fail closed',()=>{
  assert.throws(()=>parseInstallReceipt('{'));
  for (const value of [null,[],1,{...receipt(),schema:'history/v1'},{...receipt(),files:{}},{...receipt(),files:{'src/xiio.mjs':'a'.repeat(40),'config/service-catalog.json':'b'.repeat(64)}},{...receipt(),source_sha:'main'}]) assert.throws(()=>parse(value));
  for (const field of Object.keys(receipt())) {const value=receipt();delete value[field];assert.throws(()=>parse(value),field);}
});
test('rollback history: contract bounds reject old Node, invalid timestamp, identity mismatch, oversized bytes',()=>{
  for (const change of [{node:'20.1.0'},{installed_at:'2026-02-30T16:05:00.000Z'},{generation:'aaaaaaaaaaaa-20261025T160500Z'},{models_installed:1},{repo:'not-a-repo'}]) assert.throws(()=>parse({...receipt(),...change}));
  assert.throws(()=>parseInstallReceipt(' '.repeat(MAX_RECEIPT_BYTES+1)));
});
test('rollback history: exact duplicates collapse; conflicting source/hash/metadata records are retained and flagged',()=>{
  const first=parse(receipt());
  let rows=groupInstallReceipts([first,parse(receipt())]);assert.equal(rows.length,1);assert.equal(rows[0].copies,2);assert.equal(rows[0].conflict,false);
  const changed=parse({...receipt(),files:{...receipt().files,'src/xiio.mjs':'c'.repeat(64)}});
  rows=groupInstallReceipts([first,changed]);assert.equal(rows.length,2);assert.ok(rows.every(row=>row.conflict));
  const metadata=parse({...receipt(),prefix:'/different/installation'});
  rows=groupInstallReceipts([first,metadata]);assert.equal(rows.length,2);assert.ok(rows.every(row=>!row.conflict));
  const platform=parse({...receipt(),platform:'win32'});
  assert.ok(groupInstallReceipts([first,platform]).every(row=>!row.conflict));
  const changedSource=parse({...receipt(),source_sha:'54509965c9d9'+'0'.repeat(28)});
  assert.ok(groupInstallReceipts([first,changedSource]).every(row=>row.conflict));
});
test('rollback history: preserve selected order, not timestamp or implied rollback order',()=>{
  const later=parse({...receipt(),generation:'54509965c9d9-20261025T180000Z',installed_at:'2026-10-25T18:00:00.000Z'});
  const earlier=parse(receipt());
  assert.deepEqual(groupInstallReceipts([later,earlier]).map(row=>row.receipt.generation),[later.generation,earlier.generation]);
});
test('rollback history: oversized and excess files are refused before reading',async()=>{
  let reads=0;const huge={name:'large.json',size:MAX_RECEIPT_BYTES+1,text:async()=>{reads++;return '{}';}};
  const result=await readSelectedReceipts([huge]);assert.equal(reads,0);assert.equal(result.errors.length,1);
  const excess=await readSelectedReceipts(Array(MAX_RECEIPT_FILES+1).fill(huge));assert.equal(reads,0);assert.equal(excess.rows.length,0);assert.equal(excess.errors.length,1);
});
test('rollback history: mixed selections preserve valid rows and visibly report read/parse failures',async()=>{
  const broken={name:'unreadable.json',size:1,text:async()=>{throw Error('Read failed');}};
  const result=await readSelectedReceipts([file(receipt()),file(null),broken]);assert.equal(result.rows.length,1);assert.equal(result.errors.length,2);
  assert.equal((await readSelectedReceipts([])).rows.length,0);
});
test('rollback history: untrusted text stays text; diagnostics integration is read-only owner-selected input',()=>{
  const value=parse({...receipt(),ref:'<img src=x onerror=alert(1)>'});assert.equal(value.ref,'<img src=x onerror=alert(1)>');
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/RollbackHistory.tsx',import.meta.url),'utf8');
  const parser=readFileSync(new URL('../src/rollback-history.mjs',import.meta.url),'utf8');
  assert.match(app,/import RollbackHistory from '\.\/RollbackHistory'/);
  assert.match(app,/activeView === 'status-dashboard'[\s\S]*?aria-label="System Diagnostics">\s*<RollbackHistory \/>/);
  assert.match(ui,/type="file"[^>]*multiple[^>]*onChange=\{selectReceipts\}/);
  assert.match(ui,/\{row\.receipt\.ref\}/);assert.match(ui,/RECORDED \/ UNVERIFIED/);
  assert.match(ui,/current and previous as separate plaintext pointers/);
  assert.doesNotMatch(ui+parser,/dangerouslySetInnerHTML|innerHTML|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|localStorage|showDirectoryPicker|writeFile|child_process/);
  assert.doesNotMatch(ui,/<button/);
});
