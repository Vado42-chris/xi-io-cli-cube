// Pure consumer of Framework's xiio.release-distribution-lock/v1 projection.
// It never reads storage or calls a producer: it only judges a lock it is given.
// Anything missing, malformed, stale or for a different product/consumer is refused.
export const RELEASE_DISTRIBUTION_LOCK_SCHEMA = 'xiio.release-distribution-lock/v1';
const SHA256 = /^[a-f0-9]{64}$/;

function refuse(reason, detail) {
  return Object.freeze({state: 'REFUSED', reason, detail: detail ?? null, release_generation: null, artifacts: Object.freeze([])});
}

/**
 * @param {object|null|undefined} lock       lock returned by readReleaseDistribution(), via the native bridge
 * @param {{product_ref:string, consumer_ref?:string}} expected
 * @returns {{state:'QUALIFIED'|'REFUSED', reason:string|null, detail:any, release_generation:string|null, artifacts:ReadonlyArray<object>}}
 */
export function evaluateReleaseDistributionLock(lock, expected = {}) {
  const consumer = expected.consumer_ref ?? 'hex';
  if (!expected.product_ref) return refuse('PRODUCT_NOT_SELECTED');
  if (lock == null) return refuse('LOCK_MISSING');
  if (typeof lock !== 'object' || Array.isArray(lock)) return refuse('LOCK_UNREADABLE');
  if (lock.schema !== RELEASE_DISTRIBUTION_LOCK_SCHEMA) return refuse('LOCK_SCHEMA_INVALID', lock.schema ?? null);
  if (lock.product_ref !== expected.product_ref) return refuse('PRODUCT_MISMATCH', lock.product_ref ?? null);
  if (lock.consumer_ref !== consumer) return refuse('CONSUMER_MISMATCH', lock.consumer_ref ?? null);
  if (lock.lifecycle !== 'DISTRIBUTABLE') return refuse('RELEASE_NOT_DISTRIBUTABLE', lock.lifecycle ?? null);
  if (lock.adopter_current !== true) return refuse('ADOPTER_LOCK_STALE');
  if (typeof lock.release_generation !== 'string' || !lock.release_generation) return refuse('GENERATION_MISSING');
  if (!SHA256.test(lock.approved_lock_sha256 ?? '')) return refuse('APPROVED_LOCK_DIGEST_INVALID');
  if (!Array.isArray(lock.artifact_refs) || lock.artifact_refs.length === 0) return refuse('ARTIFACT_MISSING');

  const artifacts = [];
  for (const artifact of lock.artifact_refs) {
    if (!artifact || typeof artifact !== 'object') return refuse('ARTIFACT_UNREADABLE');
    if (!artifact.url || typeof artifact.url !== 'string') return refuse('ARTIFACT_LOCATION_MISSING');
    if (!SHA256.test(artifact.sha256 ?? '')) return refuse('ARTIFACT_DIGEST_INVALID', artifact.url);
    artifacts.push(Object.freeze({url: artifact.url, sha256: artifact.sha256}));
  }
  return Object.freeze({state: 'QUALIFIED', reason: null, detail: null, release_generation: lock.release_generation, artifacts: Object.freeze(artifacts)});
}
