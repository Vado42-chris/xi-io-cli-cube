# BINS #110 Concurrency Test Vector Specification
**Specification ID:** `XI-IO-TEST-SPEC-CONCURRENCY-V1`  
**Referenced Work:** BINS #110, Switchboard #65, CLI #14  
**Applies To:** Physical Six-Gate Qualification (Gate 5: Stale-Write Collision Refusal)  
**Status:** Canary Specification (Reflecting Actual BINS Interface Discrepancies)  

---

## 1. Test Objective & Interface Status

This specification outlines the required parallel test vector to exercise concurrent writes on the same `ResourceRef` to prove that agents are cleanly refused by the compare-and-swap (CAS) guard.

### Operational Discrepancies & Audit Scope:
* **Current Interface Limitation**: Inspected BINS source currently accepts `put(path, source_occurrence_ref, media_type, resource_ref)`, but lacks `expected_version_ref`. Lock scope is currently limited to the store instance and source path. **This test targets the primary documented RED in BINS #110.**
* **Scope Separation**: The CLI Cube's 15/15 checks validate its static documentation and installer contracts. **They do not prove that BINS enforces concurrency correctly.**
* **Identifiers**: Uses canonical `bins:resource:<UUID>` and content-addressed version references of the form `<ResourceRef>:sha256:<64-character digest>`.

---

## 2. Test Architecture: Independent Workers & Barrier Synchronization

A valid test must start two independent worker processes, initialize both with the identical `ResourceRef` and base `ResourceVersion`, hold them behind a synchronization barrier, and release them simultaneously against the authoritative BINS store:

```
                  [ Baseline Initialization ]
             ResourceRef: bins:resource:3fa85f64-...
             Version: bins:resource:3fa85f64-...:sha256:<digest-v0>
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
    [ Worker Loki ]             [ Worker Aries ]
    Prepare Mutation A          Prepare Mutation B
    Base: v0                    Base: v0
           │                           │
           └─────────────┬─────────────┘
                         ▼
             ═════════════════════════
             SYNCHRONIZATION BARRIER
             (Both workers ready)
             ═════════════════════════
                         │ Simultaneous Release
                         ▼
                 [ BINS Authoritative Store ]
                 (Atomic CAS Evaluation)
                /                         \
       [ Winner: First Commit ]      [ Loser: CAS Conflict ]
       * Base == Journal (PASS)      * Base != Current (FAIL)
       * Commit V1                   * Abort write immediately
       * Journal updated to V1       * Zero disk alteration
       * Return: SUCCESS (V1)        * Return: REFUSED_STALE_VERSION
                                     * Delivery to Work Consumer
```

---

## 3. Step-by-Step Test Sequence

### Phase 1: Baseline Establishment
1. Provision target resource:
   * `resource_ref`: `bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6`
   * Initial write produces base version:  
     `bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6:sha256:54509965c9d91ab02febcc8e49755e2b072a0ca9e144a8219dfa95c9603f9011`

### Phase 2: Barrier-Synchronized Concurrent Dispatch
1. Spawn Worker 1 (`worker-loki`) and Worker 2 (`worker-aries`).
2. Both workers stage distinct modifications with the same base `expected_version_ref`.
3. Workers wait at a synchronization barrier until both report readiness.
4. Barrier is dropped; both invoke `bins.put()` concurrently against the target `resource_ref`.

### Phase 3: Assertions & Physical Verification
1. **Strict 1-Winner / 1-Loser Invariant**:
   * Exactly **one** writer receives `SUCCESS`, advancing the resource to version `<ResourceRef>:sha256:<winning-digest>`.
   * Exactly **one** writer is refused with `REFUSED_STALE_VERSION`.
2. **Conflict Receipt Conformance**:
   * The rejected writer receives the receipt conforming to `docs/CAS-CONFLICT-CONTRACT.md`:
     - `resource_ref`: `bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6`
     - `expected_version_ref`: `<ResourceRef>:sha256:<digest-v0>`
     - `actual_version_ref`: `<ResourceRef>:sha256:<winning-digest>`
3. **Consumer Delivery & State Verification**:
   * Switchboard must deliver the conflict receipt to the original Work consumer and verify that it was received and acknowledged. The relay cannot self-certify completion.
4. **Physical Storage Readback**:
   * Storage readback proves content matches 100% of the winning writer's payload.
   * Zero bytes of the losing writer's mutation are present.
   * Lock directory and staging tree contain zero orphaned `.tmp` or `.lock` files.

---

## 4. Barrier Test Harness Template (Node.js)

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

test('BINS CAS barrier test: competing writes refuse stale version', async () => {
  const ref = 'bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6';
  
  // 1. Establish baseline
  const base = await bins.put('/path/to/base.txt', 'occ:base', 'text/plain', ref);
  const v0 = base.version_ref; // bins:resource:...:sha256:...

  // 2. Barrier Coordinator
  const barrier = new EventEmitter();
  let readyCount = 0;
  const waitForBarrier = () => new Promise(resolve => barrier.once('release', resolve));

  const runWorker = async (workerId, payloadPath) => {
    readyCount++;
    if (readyCount === 2) {
      barrier.emit('release');
    } else {
      await waitForBarrier();
    }
    // Released simultaneously
    return bins.put(payloadPath, `occ:${workerId}`, 'text/plain', ref, { expected_version_ref: v0 });
  };

  // 3. Competing mutations
  const [resA, resB] = await Promise.allSettled([
    runWorker('worker-loki', '/path/to/loki.txt'),
    runWorker('worker-aries', '/path/to/aries.txt')
  ]);

  // 4. Concurrency assertions
  const results = [resA, resB];
  const winners = results.filter(r => r.status === 'fulfilled' && r.value.status === 'SUCCESS');
  const losers = results.filter(r => 
    (r.status === 'fulfilled' && r.value.status === 'REFUSED_STALE_VERSION') ||
    (r.status === 'rejected' && r.reason?.status === 'REFUSED_STALE_VERSION')
  );

  assert.equal(winners.length, 1, 'Exactly one writer must succeed');
  assert.equal(losers.length, 1, 'Exactly one writer must receive REFUSED_STALE_VERSION');

  const conflict = losers[0].value || losers[0].reason;
  assert.equal(conflict.status, 'REFUSED_STALE_VERSION');
  assert.equal(conflict.expected_version_ref, v0);
  assert.match(conflict.actual_version_ref, new RegExp(`^${ref}:sha256:[0-9a-f]{64}$`));

  // 5. Authoritative readback
  const final = await bins.get(ref);
  assert.notEqual(final.version_ref, v0);
  assert.equal(final.version_ref, winners[0].value.version_ref);
});
```
