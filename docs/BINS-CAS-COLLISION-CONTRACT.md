# XI-IO Cross-Lane CAS & Concurrency Collision Contract
**Document ID:** `XI-IO-CONTRACT-2026-10-25-CAS`  
**Referenced Work:** BINS #110, Switchboard #18 / #65, CLI #12 / #14, Cube #7  
**Status:** Invariant Specification for Physical Gate Acceptance  

---

## 1. Executive Summary & Lane Boundaries
This document formalizes the interface contract for optimistic concurrency and compare-and-swap (CAS) version locking across active implementation lanes. 

Each lane retains exclusive ownership of its implementation:
* **BINS #110**: Owns canonical `ResourceRef`, storage journal, atomic CAS evaluation in `put()`, and collision receipt emission.
* **CLI #14**: Owns local process file safety, clean lock acquisition, exit code mapping, and scratch file cleanup.
* **Switchboard #65**: Owns Ward capability admission, payload relay, and packaging collision receipts into the original Work `APPLY_RETURN`.
* **CLI Cube**: Owns public documentation of this invariant; maintains zero execution authority.

---

## 2. Structured Rejection Contract (`REFUSED_STALE_VERSION`)

When BINS `put()` detects an expected-ResourceVersion mismatch, it **must not** throw an unhandled filesystem exception or return a generic HTTP 500 / exit 1. It must return a deterministic structured rejection:

```json
{
  "schema": "xiio.bins.conflict-receipt/v1",
  "status": "REFUSED_STALE_VERSION",
  "resource_ref": "urn:xiio:resource:designated-existing",
  "expected_version": "v1.4",
  "actual_version": "v1.5",
  "actual_sha256": "4a0e026b7762e5c7a52d5d7c3658dfbd880226b1",
  "competing_agent_id": "ward:agent:aries-worker-01",
  "rejected_at": "2026-10-25T15:02:00.000Z",
  "recovery_action": "FETCH_LATEST_VERSION_AND_REBASE"
}
```

### Lane Action on Rejection:
1. **BINS #110**: Immediately aborts write phase. Leaves existing payload and version journal unmodified on disk. Emits above receipt.
2. **Switchboard #65**: Detects `REFUSED_STALE_VERSION` status. Bridges receipt directly into the `APPLY_RETURN` envelope without triggering retries or error masks.
3. **CLI #14**: Translates structured rejection into **Exit Code 3** (`EXIT_CONFLICT_STALE_VERSION`) and prints human-readable recovery text to stderr.

---

## 3. Atomic Multi-File Scope Hygiene

To eliminate lost updates and dirty reads across multi-host sessions:

1. **Atomic File Pair**:
   The payload file (`<resource_id>.dat`) and its version ledger (`<resource_id>.version`) must update as a single unit.
   * *Forbidden*: Writing the payload file and subsequently writing the version metadata.
   * *Required*: Stage both payload and version record in a private staging directory on the same filesystem, followed by an atomic rename or transactional journal commit.
2. **Crash & Abort Cleanliness**:
   * If a write operation is refused or interrupted, no dangling `.tmp`, `.staged`, or `.lock` files may remain in the working tree.
   * CLI #14 must register process exit / signal handlers (`SIGINT`, `SIGTERM`) to unlink any local lock or temporary descriptor.

---

## 4. Deterministic Hostile Concurrency Test Vector (Gate 5)

To independently qualify BINS #110 and Switchboard #65 without ambiguous results:

```
[Agent A (Loki Worker)]                      [Agent B (Aries Worker)]
         |                                              |
         +------------ Read Resource V0 ----------------+
         |                                              |
   Apply Mutation 1                               Apply Mutation 2
   (e.g., append line A)                          (e.g., append line B)
         |                                              |
         v                                              v
   BINS put(expected=V0)                          BINS put(expected=V0)
         |                                              |
         | (Arrives at t=0ms)                           | (Arrives at t=2ms)
         v                                              v
   [ BINS COMMIT ]                                [ BINS CAS EVAL ]
   * Checks V0 == V0 (PASS)                       * Checks V0 == V1 (FAIL)
   * Commits V1                                   * Aborts write
   * Returns OK (V1)                              * Returns REFUSED_STALE_VERSION
         |                                              |
         v                                              v
   Switchboard APPLY_RETURN                       Switchboard APPLY_RETURN
   (Status: SUCCESS, Ver: V1)                     (Status: CONFLICT_REFUSED)
```

### Gate 5 Acceptance Criteria:
* Exactly **one** writer succeeds and advances the `ResourceVersion` to $V_1$.
* Exactly **one** writer fails closed with `REFUSED_STALE_VERSION`.
* File on disk matches the exact byte sequence and SHA of the winning agent ($V_1$).
* No byte interleaving, zero lost updates, and zero silent overwrites.

---

## 5. Summary Matrix of Responsibilities

| Obligation | Owning Lane | Key Artifact |
| :--- | :--- | :--- |
| CAS Invariant Logic | **BINS #110** | `src/storage.mjs` / atomic journal commit |
| Exit Code 3 & Lock Cleanup | **CLI #14** | `src/file-edit-cas.mjs` |
| Ward Receipt & Return Envelope | **Switchboard #65** | Worker execution & `APPLY_RETURN` |
| Contract Invariant Reference | **CLI Cube** | `docs/BINS-CAS-COLLISION-CONTRACT.md` |
