# CAS Conflict Contract: `REFUSED_STALE_VERSION`
**Specification ID:** `XI-IO-CAS-CONFLICT-SCHEMA-V1`  
**Referenced Work:** BINS #110, Switchboard #65, CLI #14  
**Applies To:** Host Workers, BINS Custody, Switchboard `APPLY_RETURN` Envelope  

---

## 1. Overview & Purpose
This document defines the normative JSON schema for the `REFUSED_STALE_VERSION` error payload emitted when an optimistic concurrency check fails during a compare-and-swap (CAS) operation. 

By adhering to this schema:
* **BINS #110** emits a standard conflict descriptor rather than throwing unhandled exceptions.
* **Switchboard #65** recognizes the payload as a deterministic business refusal and packages it directly into the `APPLY_RETURN` message.
* **CLI #14** maps the error to exit code `3` (`EXIT_CONFLICT_STALE_VERSION`) and displays human-actionable rebase instructions.

---

## 2. JSON Schema (Draft-07)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://xi-io.org/schemas/bins/conflict-receipt.v1.json",
  "title": "BinsConflictReceipt",
  "type": "object",
  "required": [
    "schema",
    "status",
    "resource_ref",
    "expected_version",
    "actual_version",
    "actual_sha256",
    "rejected_at",
    "recovery_action"
  ],
  "properties": {
    "schema": {
      "type": "string",
      "const": "xiio.bins.conflict-receipt/v1",
      "description": "Exact version identifier of this conflict receipt format."
    },
    "status": {
      "type": "string",
      "const": "REFUSED_STALE_VERSION",
      "description": "Standardized status code signaling an optimistic concurrency failure."
    },
    "resource_ref": {
      "type": "string",
      "pattern": "^urn:xiio:resource:[a-zA-Z0-9._-]+$",
      "description": "Canonical URN identifying the target resource in BINS custody."
    },
    "expected_version": {
      "type": "string",
      "pattern": "^v[0-9]+(\\.[0-9]+)*$",
      "description": "ResourceVersion provided by the writer in its pre-condition check."
    },
    "actual_version": {
      "type": "string",
      "pattern": "^v[0-9]+(\\.[0-9]+)*$",
      "description": "Current ResourceVersion stored in the authoritative BINS journal."
    },
    "actual_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "Hex-encoded SHA-256 digest of the current state of the resource on disk."
    },
    "competing_agent_id": {
      "type": "string",
      "description": "Optional identifier of the winning agent or process that committed actual_version."
    },
    "rejected_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp recording when the collision was evaluated and rejected."
    },
    "recovery_action": {
      "type": "string",
      "enum": [
        "FETCH_LATEST_VERSION_AND_REBASE",
        "ABORT_AND_RETRY_WITH_NEW_WORK"
      ],
      "description": "Prescribed recovery protocol for the calling runtime."
    }
  },
  "additionalProperties": false
}
```

---

## 3. Concrete Example Payload

```json
{
  "schema": "xiio.bins.conflict-receipt/v1",
  "status": "REFUSED_STALE_VERSION",
  "resource_ref": "urn:xiio:resource:designated-existing",
  "expected_version": "v1.4",
  "actual_version": "v1.5",
  "actual_sha256": "4a0e026b7762e5c7a52d5d7c3658dfbd880226b14f8a32b091f0923e41dc0b42",
  "competing_agent_id": "ward:agent:aries-worker-01",
  "rejected_at": "2026-10-25T15:02:00.000Z",
  "recovery_action": "FETCH_LATEST_VERSION_AND_REBASE"
}
```

---

## 4. Consumer Invariants Across Lanes

### A. BINS #110 (Emitter)
* Evaluates CAS prior to filesystem alteration.
* If `expected_version != journal.current_version`:
  1. Abort file write immediately.
  2. Assemble the exact JSON payload matching the schema above.
  3. Emit payload to stdout/socket and return status code indicating CAS conflict.

### B. Switchboard #65 (Relay)
* Detects `status === "REFUSED_STALE_VERSION"`.
* Wraps the payload into the `APPLY_RETURN` envelope:
  ```json
  {
    "type": "APPLY_RETURN",
    "work_id": "work-12345",
    "result": "CONFLICT",
    "evidence": { ...conflict_receipt... }
  }
  ```
* Bypasses retry loops; delivers receipt directly back to caller.

### C. CLI #14 (Client)
* Detects receipt in operation response.
* Cleans up local temporary and lock files (`.tmp`, `.lock`).
* Prints: `Error: Stale version conflict on <resource_ref>. Expected <expected_version>, but current version is <actual_version>.`
* Exits with code `3` (`EXIT_CONFLICT_STALE_VERSION`).
