import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReleaseDistributionLock} from '../src/lib/releaseDistribution.mjs';

const H = 'a'.repeat(64);
const good = () => ({
  schema: 'xiio.release-distribution-lock/v1',
  release_ref: 'release:sam:1',
  product_ref: 'product:sam-law',
  consumer_ref: 'hex',
  release_generation: 'gen:1',
  approved_lock_sha256: H,
  manifest_refs: ['manifest:sam:1'],
  artifact_refs: [{url: 'https://example.invalid/sam-law-1.tar', sha256: 'b'.repeat(64)}],
  provider_hosts: ['example.invalid'],
  lifecycle: 'DISTRIBUTABLE',
  adopter_current: true,
  release_projection_digest: 'c'.repeat(64),
});
const expected = {product_ref: 'product:sam-law', consumer_ref: 'hex'};

test('a current distributable lock for the selected product qualifies with its artifact digests', () => {
  const out = evaluateReleaseDistributionLock(good(), expected);
  assert.equal(out.state, 'QUALIFIED');
  assert.equal(out.release_generation, 'gen:1');
  assert.equal(out.artifacts[0].sha256, 'b'.repeat(64));
});

test('missing lock refuses without a release', () => {
  const out = evaluateReleaseDistributionLock(null, expected);
  assert.equal(out.state, 'REFUSED');
  assert.equal(out.reason, 'LOCK_MISSING');
  assert.deepEqual([...out.artifacts], []);
});

test('an unselected product refuses before reading the lock', () => {
  assert.equal(evaluateReleaseDistributionLock(good(), {}).reason, 'PRODUCT_NOT_SELECTED');
});

test('a lock for a different product refuses', () => {
  const out = evaluateReleaseDistributionLock({...good(), product_ref: 'product:other'}, expected);
  assert.equal(out.reason, 'PRODUCT_MISMATCH');
});

test('a lock for a different consumer refuses', () => {
  const out = evaluateReleaseDistributionLock({...good(), consumer_ref: 'cli'}, expected);
  assert.equal(out.reason, 'CONSUMER_MISMATCH');
});

test('a stale adopter lock refuses', () => {
  const out = evaluateReleaseDistributionLock({...good(), adopter_current: false}, expected);
  assert.equal(out.reason, 'ADOPTER_LOCK_STALE');
});

test('a release that is not distributable refuses', () => {
  const out = evaluateReleaseDistributionLock({...good(), lifecycle: 'CANDIDATE'}, expected);
  assert.equal(out.reason, 'RELEASE_NOT_DISTRIBUTABLE');
});

test('a foreign or historical schema refuses rather than being adapted', () => {
  const out = evaluateReleaseDistributionLock({...good(), schema: 'xiio.release-distribution-lock/v0'}, expected);
  assert.equal(out.reason, 'LOCK_SCHEMA_INVALID');
});

test('an artifact without a SHA-256 digest refuses', () => {
  const lock = good();
  lock.artifact_refs = [{url: 'https://example.invalid/x.tar', sha256: 'not-a-digest'}];
  assert.equal(evaluateReleaseDistributionLock(lock, expected).reason, 'ARTIFACT_DIGEST_INVALID');
});

test('a lock with no artifacts refuses', () => {
  const lock = good();
  lock.artifact_refs = [];
  assert.equal(evaluateReleaseDistributionLock(lock, expected).reason, 'ARTIFACT_MISSING');
});

test('an artifact without a location refuses', () => {
  const lock = good();
  lock.artifact_refs = [{sha256: 'b'.repeat(64)}];
  assert.equal(evaluateReleaseDistributionLock(lock, expected).reason, 'ARTIFACT_LOCATION_MISSING');
});

test('refusals never leak artifacts into the result', () => {
  const lock = good();
  lock.adopter_current = false;
  const out = evaluateReleaseDistributionLock(lock, expected);
  assert.deepEqual([...out.artifacts], []);
  assert.equal(out.release_generation, null);
});
