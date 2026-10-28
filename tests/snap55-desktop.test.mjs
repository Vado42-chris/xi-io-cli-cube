import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {calculateDesktopSnap55, exactDesktopEpoch} from '../src/math/snap55-desktop.mjs';
import {snap55} from '../src/math/sdk-snap55.mjs';

const SOURCE = readFileSync(new URL('../src/math/sdk-snap55.mjs', import.meta.url));
const sdkBlobSha = createHash('sha1').update(`blob ${SOURCE.length}\0`).update(SOURCE).digest('hex');
const good = {
  questions: [{id:'a',pillar:'autism'},{id:'b',pillar:'adhd'}],
  responses: {a:4,b:0},nowMs:'1793200000000',decayMode:'legacy_efold18',
  journal:[{timestamp:'1793196400000',sensoryEntropy:50}]
};
const run = data => calculateDesktopSnap55(JSON.stringify(data));

test('maths source is exact qualified SDK Git blob, not a separate derivative', () => {
  assert.equal(sdkBlobSha,'3276684dd7101c911c594bbc3045b7afddea8213');
});
test('signed-out desktop computes independent weighted known-answer, same SDK source', () => {
  const envelope=run(good);
  const expectedBaseline=13/21;
  const expectedR=0.25*expectedBaseline+0.65*0.5+0.005;
  assert.equal(envelope.schema,'xiio.hex.desktop-snap55/v1');
  assert.equal(envelope.source_commit,'cfb7719d946443575e3b60d850d9923a7a6e2797');
  assert.equal(envelope.provider_effect,false);
  assert.equal(envelope.authority_granted,false);
  assert.equal(envelope.persistence,false);
  assert.equal(envelope.status,'COMPUTED');
  assert.equal(envelope.result.state,'SOURCE_BOUND_NUMERIC');
  assert.equal(envelope.result.known_count,2);
  assert.ok(Math.abs(envelope.result.baseline-expectedBaseline)<1e-15);
  assert.ok(Math.abs(envelope.result.R-expectedR)<1e-15);
  const direct=snap55({...good,nowMs:1793200000000,journal:[{timestamp:1793196400000,sensoryEntropy:50}]});
  assert.deepEqual(envelope.result,direct,'desktop uses the identical source calculation');
});
test('missing answers fail closed without laundering null as zero',()=>{
  const data=structuredClone(good);delete data.responses.b;
  const row=run(data).result;
  assert.equal(row.state,'UNKNOWN_REQUIRED_RESPONSES');
  assert.equal(row.R,null);
  assert.deepEqual(row.missing,['b']);
});
test('bad journal does not yield numeric R, negative and future times exclude',()=>{
  const invalid=run({...good,journal:[{timestamp:'1793196400000',sensoryEntropy:999}]}).result;
  assert.equal(invalid.state,'UNKNOWN_JOURNAL_DATA');
  assert.equal(invalid.R,null);
  const future=run({...good,journal:[{timestamp:'1793203600000',sensoryEntropy:50}]}).result;
  assert.equal(future.excluded_future,1);
  assert.equal(future.recent_entropy,0);
});
test('exact timestamp strings are mandatory, no silent JSON numeric rounding',()=>{
  assert.equal(exactDesktopEpoch('1793200000000'),1793200000000);
  for(const value of ['9007199254740992','1793200000000.5','00001','-1','1e3',1793200000000,null,'','1'.repeat(100)])
    assert.throws(()=>exactDesktopEpoch(value),/SNAP_EPOCH/);
  for(const value of [1793200000000,9007199254740993,1793200000000.5,'9007199254740993','1793200000000.5'])
    assert.throws(()=>run({...good,nowMs:value}));
  for(const timestamp of [1793196400000,9007199254740993,'9007199254740993','1793196400000.5'])
    assert.throws(()=>run({...good,journal:[{timestamp,sensoryEntropy:50}]}));
});
test('protected keys and non-replayable inputs are rejected, unknown stays UNKNOWN',()=>{
  assert.throws(()=>run({...good,password:'do-not-store'}),/SNAP_SENSITIVE_INPUT/);
  assert.throws(()=>run({...good,tenant_id:'ungranted'}),/SNAP_INPUT_INVALID/);
  assert.throws(()=>run({...good,nowMs:undefined}),/SNAP_TIME_REQUIRED/);
  assert.throws(()=>calculateDesktopSnap55(' '.repeat(65537)),/SNAP_INPUT_BOUNDS/);
  assert.throws(()=>run({...good,questions:[good.questions[0],good.questions[0]]}),/SNAP_DUPLICATE_QUESTION_ID/);
  assert.equal(run({...good,decayMode:'unsupported'}).result.state,'UNKNOWN_DECAY_MODE');
  assert.throws(()=>calculateDesktopSnap55('{"nowMs":"1","__proto__":{}}'),/SNAP_SENSITIVE_INPUT/);
});
