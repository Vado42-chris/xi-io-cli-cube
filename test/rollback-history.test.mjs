import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRollbackHistory,ROLLBACK_PROJECTION_SCHEMA} from '../src/lib/rollbackHistory.mjs';

const SHA_A='a'.repeat(40),SHA_B='b'.repeat(40);
const FILE_A='1'.repeat(64),FILE_B='2'.repeat(64);
const A='54509965c9d9-20261025T160100Z';
const B='54509965c9d9-20261025T161500Z';
function receipt(generation, source_sha,hash, installed_at) {
 return JSON.stringify({schema:'xiio.cli.install-receipt/v2',repo:'Vado42-chris/xi-io-cli',
   ref:source_sha, source_sha,generation, installed_at,files:{'src/xiio.mjs':hash,'config/service-catalog.json':'f'.repeat(64)},
   prefix:'/private/person/local/cli-v1',platform:'linux',node:'22.16.0'});
}
function rows(){
 return [
 {path:'cli-v1/current',content:B+'\n'},
 {path:'cli-v1/previous',content:A+'\n'},
 {path:'cli-v1/versions/'+A+'/install-receipt.json',content:receipt(A,SHA_A,FILE_A,'2026-10-25T16:01:00.000Z')},
 {path:'cli-v1/versions/'+B+'/install-receipt.json',content:receipt(B,SHA_B,FILE_B,'2026-10-25T16:15:00.000Z')},
 {path:'cli-v1/versions/'+A+'/src/xiio.mjs',sha256:FILE_A},
 {path:'cli-v1/versions/'+B+'/src/xiio.mjs',sha256:FILE_B},
 ];
}
test('reads genuine V1 pointer + receipt fields and hashes without releasing authority',()=>{
 const r=buildRollbackHistory(rows());
 assert.equal(r.schema,ROLLBACK_PROJECTION_SCHEMA);
 assert.equal(r.entries.length,2);
 assert.equal(r.state,'RECORDED_ONLY');assert.equal(r.qualified,false);
 assert.equal(r.entries[0].generation,B);assert.equal(r.entries[0].pointer,'CURRENT');
 assert.equal(r.entries[1].pointer,'PREVIOUS');
 assert.deepEqual(r.entries.map(e=>e.byteState),['BYTE_MATCH','BYTE_MATCH']);
 assert.equal(r.entries[0].hostVerified,false);
 assert.equal(r.entries[0].releaseQualified,false);
 assert.doesNotMatch(JSON.stringify(r),/\/private\/person|models_installed|password/i);
});
test('receipt-only selection cannot invent an independently verified running binary',()=>{
 const r=buildRollbackHistory([rows()[2]]);
 assert.equal(r.entries.length,1);
 assert.equal(r.entries[0].byteState,'NOT_READ');
 assert.equal(r.entries[0].pointer,'HISTORICAL_RECORD');
});
test('missing history must remain empty rather than generating fixture versions',()=>{
 const r=buildRollbackHistory([]);
 assert.equal(r.state,'NO_CLI_RECEIPTS');
 assert.equal(r.entries.length,0);
});
test('source hash mismatches must be explicit refusals',()=>{
 const a=rows();
 a[5]={...a[5],sha256:'f'.repeat(64)};
 const r=buildRollbackHistory(a);
 assert.equal(r.state,'REVIEW_REQUIRED');
 assert.equal(r.entries[0].byteState,'BYTE_MISMATCH');
 assert.ok(r.problems.includes('CLI_BINARY_BYTE_MISMATCH'));
});
test('receipt generation may not impersonate another version directory',()=>{
 const x=rows();x[2].path='cli-v1/versions/other/install-receipt.json';
 const r=buildRollbackHistory(x);
 assert.equal(r.state,'REVIEW_REQUIRED');
 assert.ok(r.problems.includes('INVALID_OR_MISBOUND_CLI_RECEIPT'));
});
test('wrong schema, repo, SHA and malformed JSON are rejected without raw echoes',()=>{
 for (const doc of ['{invalid','{"schema":"unknown"}',
   receipt(A,SHA_A,FILE_A,'2026-10-25T16:01:00.000Z').replace('Vado42-chris/xi-io-cli','other'),
   receipt(A,SHA_A,FILE_A,'2026-10-25T16:01:00.000Z').replace(FILE_A,'X'.repeat(64))]){
  const r=buildRollbackHistory([{path:'install-receipt.json',content:doc}]);
  assert.equal(r.entries.length,0);
  assert.deepEqual(r.problems,['INVALID_OR_MISBOUND_CLI_RECEIPT']);
  assert.doesNotMatch(JSON.stringify(r),/\/private\/person|X{16}/);
 }
});
test('conflicting duplicate generations and pointers refuse ambiguity',()=>{
 const r=buildRollbackHistory([...rows(),rows()[2],{path:'another-root/current',content:A}]);
 assert.equal(r.state,'REVIEW_REQUIRED');
 assert.ok(r.problems.includes('DUPLICATE_GENERATION_RECEIPT'));
 assert.ok(r.problems.includes('DUPLICATE_ROLLBACK_POINTER'));
});
test('oversized input and path traversal refuse without exposing source',()=>{
 assert.equal(buildRollbackHistory(new Array(257)).state,'REFUSED_INPUT');
 const r=buildRollbackHistory([{path:'../secrets/install-receipt.json',content:receipt(A,SHA_A,FILE_A,'2026-10-25T16:01:00.000Z')}]);
 assert.deepEqual(r.problems,['INVALID_IMPORT_PATH']);
});
test('missing pointer target is incomplete evidence, not an approved rollback',()=>{
 const r=buildRollbackHistory([{path:'current',content:A}]);
 assert.equal(r.state,'REVIEW_REQUIRED');
 assert.ok(r.problems.includes('POINTER_TARGET_RECEIPT_NOT_IMPORTED'));
 assert.equal(r.entries.length,0);
});
test('unrelated files and secret-bearing imports are ignored without display',()=>{
 const r=buildRollbackHistory([{path:'cli-v1/secrets/token.json',content:'SECRET'},
   {path:'cli-v1/versions/'+A+'/install-receipt.json',content:receipt(A,SHA_A,FILE_A,'2026-10-25T16:01:00.000Z')}]);
 assert.equal(r.entries.length,1);
 assert.doesNotMatch(JSON.stringify(r),/SECRET|token\.json|private\/person/);
});
