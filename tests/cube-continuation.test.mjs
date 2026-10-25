// New continuation regressions, not the unpublished installation-journey suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCasReceipt} from '../src/cas-receipt.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('src/App.tsx');
const sample = {
  status: 'REFUSED_STALE_VERSION',
  resource_ref: 'bins:resource:a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  expected_version: 'bins:resource:a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d:sha256:' + '0'.repeat(64),
  actual_version: 'bins:resource:a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d:sha256:' + 'a'.repeat(64),
  actual_sha256: 'a'.repeat(64), timestamp: '2026-10-25T16:00:00.000Z'
};
const validate = value => validateCasReceipt(JSON.stringify(value));
test('new regression: JSON primitives and malformed input fail without crashing', () => {
  for (const value of [null, [], 1, false, 'hello']) assert.equal(validate(value).valid, false);
  assert.equal(validateCasReceipt('{').valid, false);
});
test('new regression: canonical receipt passes; UUID and content versions are checked', () => {
  assert.equal(validate(sample).valid, true);
  for (const change of [
    {resource_ref:'bins:resource:'+'-'.repeat(36)},
    {expected_version:'v1.4'}, {actual_version:'v1.5'},
    {expected_version:'0'.repeat(64)}, {actual_version:'a'.repeat(64)},
    {actual_sha256:'a'.repeat(40)}, {actual_sha256:'A'.repeat(64)},
    {actual_sha256:'b'.repeat(64)},
    {expected_version:'bins:resource:00000000-0000-0000-0000-000000000000:sha256:'+'0'.repeat(64)},
  ]) assert.equal(validate({...sample,...change}).valid, false, JSON.stringify(change));
});
test('new regression: target fields, aliases and UTC timestamps cannot silently drift', () => {
  for (const change of [
    {extra:true}, {schema:5}, {recovery_action:'IGNORE'},
    {timestamp:'2026-02-30T16:00:00Z'}, {timestamp:'yesterday'}, {timestamp:123},
    {timestamp:'2026-10-25T16:00:00+02:00'}, {actual_version_ref:'b'.repeat(64)}
  ]) assert.equal(validate({...sample,...change}).valid, false, JSON.stringify(change));
  assert.equal(validate({...sample,actual_version_ref:sample.actual_version}).valid,false);
});
test('new regression: both documented synthetic examples pass the actual UI validator', () => {
  for (const name of ['docs/CAS-CONFLICT-CONTRACT.md','docs/BINS-CAS-COLLISION-CONTRACT.md']) {
    const examples = [...read(name).matchAll(/```json\n([\s\S]*?)\n```/g)]
      .map(([,json])=>JSON.parse(json)).filter(x=>x.status==='REFUSED_STALE_VERSION');
    assert.equal(examples.length,1);
    const result=validate(examples[0]); assert.equal(result.valid,true,result.errors.join('; '));
  }
});
test('new regression: actual UI uses validator and does not equate local commands with host gates', () => {
  assert.match(app,/setCasValidation\(validateCasReceipt\(inputStr\)\)/);
  assert.doesNotMatch(app,/Physical Gate 6: Readback|Physical Gate 3 &amp; 4: Ward|expected-version CAS merged/);
  assert.match(app,/Local version check \(not Work return\)/);
  assert.match(app,/Local launch \(not Ward admission\)/);
  assert.match(app,/historical CLI #13 download below still resolves node on PATH/);
  assert.match(app,/draft expected-version CAS; not merged/);
  assert.doesNotMatch(app,/BASELINE_ROLLBACK_MANIFEST|parseRollbackManifest|QUALIFIED_ACTIVE|QUALIFIED_ROLLBACK_TARGET/);
  assert.equal((app.match(/<RollbackHistory \/>/g)||[]).length,1);
  assert.match(app,/Remote Host Operations Only/);
});
test('new regression: UI sample generator produces a valid synthetic receipt', () => {
  const source=app.match(/const handleGenerateCanaryReceipt = \(\) => \{([\s\S]*?)\n  \};/)[1];
  let captured;
  // This source fragment only constructs JSON and calls the injected local validator.
  new Function('handleValidateCasReceipt',source)(value=>{captured=validateCasReceipt(value);});
  assert.equal(captured.valid,true,captured.errors.join('; '));
});
