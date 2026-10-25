import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {parseRollbackFiles} from '../src/lib/rollbackHistory.mjs';

const SH='a'.repeat(40), DIGEST='b'.repeat(64);
const receipt=(generation='gen-one',extra={})=>({
  name:'install-receipt.json',relativePath:'cli/versions/'+generation+'/install-receipt.json',
  text:JSON.stringify({schema:'xiio.cli.install-receipt/v2',source_sha:SH,generation,
    installed_at:'2026-10-25T10:00:00Z',files:{'src/xiio.mjs':DIGEST},...extra})
});
const pointer=(name,content)=>({name,relativePath:'cli/'+name,text:content});
test('no local files is UNKNOWN, never a qualifying installed release',()=>{
  const r=parseRollbackFiles([]);
  assert.equal(r.state,'NO_RECEIPTS');
  assert.equal(r.records.length,0);
  assert.equal(r.installedBinaryVerified,false);
});
test('real V2 receipts expose metadata digests, not runtime verification',()=>{
  const r=parseRollbackFiles([receipt(),pointer('current','gen-new\n'),pointer('previous','gen-one\n'),
    receipt('gen-new',{installed_at:'2026-10-25T10:05:00Z'})]);
  assert.equal(r.state,'RECORDED_METADATA');
  assert.equal(r.records.length,2);
  assert.equal(r.records[0].pointerState,'CURRENT_POINTER');
  assert.equal(r.records[1].pointerState,'PREVIOUS_POINTER');
  assert.equal(r.records[1].cliFileSha256,DIGEST);
  assert.equal(r.records[1].sourceSha,SH);
  assert.equal(r.installedBinaryVerified,false);
  assert.equal(r.fullByteReadbackVerified,false);
});
test('V1 legacy receipt is supported without fabricating binary digest',()=>{
  const r=parseRollbackFiles([{
    name:'install-receipt.json',relativePath:'versions/legacy-one/install-receipt.json',
    text:JSON.stringify({schema:'xiio.cli.install-receipt/v1',source_sha:SH,
      installed_at:'2026-10-25T09:00:00Z'})}]);
  assert.equal(r.records[0].generation,'legacy-one');
  assert.equal(r.records[0].cliFileSha256,null);
  assert.equal(r.records[0].qualification,'NOT_INDEPENDENTLY_VERIFIED');
});
test('a V1 receipt without a containing versions path cannot invent a generation',()=>{
  const r=parseRollbackFiles([{
    name:'install-receipt.json',text:JSON.stringify({schema:'xiio.cli.install-receipt/v1',
      source_sha:'UNKNOWN',bin:'/secret/ignored',token:'SENSITIVE'})}]);
  assert.equal(r.records[0].generation,null);
  assert.equal(r.records[0].sourceSha,null);
  assert.equal(JSON.stringify(r).includes('SENSITIVE'),false);
  assert.equal(JSON.stringify(r).includes('/secret/ignored'),false);
});
test('JSON with arbitrary "qualified": true cannot promote a version',()=>{
  const r=parseRollbackFiles([receipt('gen-one',{state:'PASS',qualified:true,ward_admitted:true})]);
  assert.equal(r.records[0].qualification,'NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(r.installedBinaryVerified,false);
});
test('unsupported rollback-meta schema rejected rather than guessed',()=>{
  const r=parseRollbackFiles([{name:'install-receipt.json',text:JSON.stringify({
    schema:'someone-else/rollback',versions:[{sha:DIGEST,qualified:true}]})}]);
  assert.equal(r.state,'PARTIAL');
  assert.equal(r.records.length,0);
  assert.match(r.first_red,/UNSUPPORTED_SCHEMA/);
});
test('bad SHA-1 or recorded CLI SHA-256 invalidates receipt',()=>{
  for(const extra of [{source_sha:'short'},{files:{'src/xiio.mjs':'f'.repeat(63)}}]){
    const r=parseRollbackFiles([receipt('gen-one',extra)]);
    assert.equal(r.records.length,0);
    assert.equal(r.state,'PARTIAL');
  }
});
test('two claims for the same generation with different hashes cannot both count',()=>{
  const r=parseRollbackFiles([receipt(),receipt('gen-one',{source_sha:'c'.repeat(40)})]);
  assert.equal(r.records.length,1);
  assert.equal(r.state,'PARTIAL');
  assert.ok(r.issues.includes('install-receipt.json: SAME_GENERATION_CONFLICT'));
});
test('exact duplicate generation receipts are deduplicated',()=>{
  const r=parseRollbackFiles([receipt(),receipt()]);
  assert.equal(r.records.length,1);
  assert.equal(r.issues.length,0);
});
test('plain text pointers do not manufacture receipts',()=>{
  const r=parseRollbackFiles([pointer('previous','earlier')]);
  assert.equal(r.records.length,0);
  assert.equal(r.pointers.previous,'earlier');
  assert.equal(r.state,'NO_RECEIPTS');
});
test('unsafe pointers and conflicting pointers fail closed',()=>{
  const a=parseRollbackFiles([pointer('current','../../other')]);
  assert.equal(a.state,'PARTIAL');
  assert.equal(a.pointers.current,null);
  const b=parseRollbackFiles([pointer('previous','gen-old'),pointer('previous','gen-two')]);
  assert.equal(b.state,'PARTIAL');
  assert.ok(b.issues.includes('previous: POINTER_CONFLICT'));
});
test('malformed JSON, oversized input and binary input refuse their own entries',()=>{
  const r=parseRollbackFiles([
    {name:'install-receipt.json',text:'{'},
    {name:'install-receipt.json',text:'x'.repeat(262145)},
    {name:'install-receipt.json',text:'abc\0def'}
  ]);
  assert.equal(r.records.length,0);
  assert.equal(r.issues.length,3);
});
test('unrelated files are ignored and their contents never appear',()=>{
  const r=parseRollbackFiles([{name:'device-key.pem',text:'private key'},{name:'.env',text:'SECRET'}]);
  assert.equal(r.state,'NO_RECEIPTS');
  assert.equal(JSON.stringify(r).includes('SECRET'),false);
});
test('oversized file count is a typed refusal, not truncated success',()=>{
  const r=parseRollbackFiles(Array.from({length:121},()=>receipt()));
  assert.equal(r.state,'REJECTED');
  assert.equal(r.first_red,'TOO_MANY_FILES');
});

// UI source must never invent an installed history or claim physical qualification.
test('Cube diagnostics uses one receipt reader and no hard-coded qualified history',()=>{
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/<RollbackHistory\s*\/>/);
  assert.doesNotMatch(app,/BASELINE_ROLLBACK_MANIFEST|QUALIFIED_ACTIVE|QUALIFIED_ROLLBACK_TARGET|rollback-manifest\/v1|Simulate File Present/);
  assert.equal(app.split('54509965c9d91ab02febcc8e49755e2b072a0ca9').length-1,1);
});
