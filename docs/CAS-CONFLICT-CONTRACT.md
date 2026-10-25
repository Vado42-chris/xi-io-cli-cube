# CAS Conflict Contract: `REFUSED_STALE_VERSION`
**Specification ID:** `XI-IO-CAS-CONFLICT-SCHEMA-V1`  
**Referenced Work:** BINS #110, Switchboard #65, CLI #14  
**Applies To:** Host Workers, BINS Custody, Switchboard `APPLY_RETURN` Relay & Consumer  
**Status:** Target Interface Contract (Reconciled Against Inspected BINS Source)  

---

## 1. Overview & Integration Scope
This specification defines the exact JSON schema for the `REFUSED_STALE_VERSION` error response emitted when an optimistic concurrency check fails during a compare-and-swap (CAS) operation in BINS #110.

### Required Fields for Collision Evidence:
To align Switchboard and BINS agents, every conflict payload must provide:
* `status`: Exactly `"REFUSED_STALE_VERSION"`.
* `resource_ref`: Canonical `bins:resource:<UUID>`.
* `expected_version`: The content-addressed version expected by the writer.
* `actual_version`: The current content-addressed version recorded in BINS.
* `actual_sha256`: The raw 64-character SHA-256 digest of current on-disk content.
* `timestamp`: ISO 8601 UTC timestamp of refusal evaluation.

### Operational Source Status:
* **BINS #110 Implementation Invariant**: The inspected BINS `put()` interface currently accepts `(path, source_occurrence_ref, media_type, resource_ref)`, but lacks `expected_version_ref`. Lock scope is currently limited to the store instance and source path. **This missing compare-and-swap check is the first documented RED in BINS #110.**
* **Consumer Delivery**: A refused write is **not** automatically an `APPLY_RETURN`. Switchboard must deliver the conflict receipt to the original Work consumer and establish verifiable acknowledgement before closing the transaction.

---

## 2. Normative JSON Schema (Draft-07)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://xi-io.org/schemas/bins/conflict-receipt.v1.json",
  "title": "BinsConflictReceipt",
  "type": "object",
  "required": [
    "status",
    "resource_ref",
    "expected_version",
    "actual_version",
    "actual_sha256",
    "timestamp"
  ],
  "properties": {
    "status": {
      "type": "string",
      "const": "REFUSED_STALE_VERSION",
      "description": "Standardized status code signaling an optimistic concurrency failure."
    },
    "resource_ref": {
      "type": "string",
      "pattern": "^bins:resource:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      "description": "Canonical UUID-based resource reference in BINS custody."
    },
    "expected_version": {
      "type": "string",
      "pattern": "^(bins:resource:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:sha256:[0-9a-f]{64}|[0-9a-f]{64})$",
      "description": "Content-addressed version reference supplied by caller in pre-condition."
    },
    "actual_version": {
      "type": "string",
      "pattern": "^(bins:resource:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:sha256:[0-9a-f]{64}|[0-9a-f]{64})$",
      "description": "Authoritative content-addressed version currently recorded in BINS journal."
    },
    "actual_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "Raw 64-character hex digest of current on-disk content."
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp of refusal evaluation."
    },
    "schema": {
      "type": "string",
      "description": "Optional version identifier of this conflict receipt format."
    },
    "competing_agent_id": {
      "type": "string",
      "description": "Optional identifier of the winning agent/process whose write established actual_version."
    },
    "recovery_action": {
      "type": "string",
      "enum": [
        "FETCH_LATEST_VERSION_AND_REBASE",
        "ABORT_AND_RETRY_WITH_NEW_WORK"
      ],
      "description": "Prescribed recovery protocol for the calling runtime."
    },
    "expected_version_ref": {
      "type": "string",
      "description": "Alias for expected_version."
    },
    "actual_version_ref": {
      "type": "string",
      "description": "Alias for actual_version."
    },
    "rejected_at": {
      "type": "string",
      "description": "Alias for timestamp."
    }
  },
  "additionalProperties": false
}
```

---

## 3. Concrete Conforming Example

```json
{
  "status": "REFUSED_STALE_VERSION",
  "resource_ref": "bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "expected_version": "bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6:sha256:54509965c9d91ab02febcc8e49755e2b072a0ca9e144a8219dfa95c9603f9011",
  "actual_version": "bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6:sha256:9c568988fbf8fc43facdca12267847c30b55e01460599c2794eb09aa8e52e468",
  "actual_sha256": "9c568988fbf8fc43facdca12267847c30b55e01460599c2794eb09aa8e52e468",
  "timestamp": "2026-10-25T15:10:00.000Z",
  "competing_agent_id": "ward:agent:aries-worker-01",
  "recovery_action": "FETCH_LATEST_VERSION_AND_REBASE"
}
```

---

## 4. Lane Responsibilities

1. **BINS #110 (Emitter)**:
   * When `expected_version != current_version`, abort write immediately with zero disk alteration.
   * Emit the structured conflict object containing all required fields (`status`, `resource_ref`, `expected_version`, `actual_version`, `actual_sha256`, `timestamp`).
2. **Switchboard #65 (Relay)**:
   * Detects `REFUSED_STALE_VERSION` and packages the receipt into `APPLY_RETURN`.
   * Delivers receipt to the original Work consumer and secures verified delivery confirmation.
3. **CLI #14 (Client)**:
   * Maps receipt to exit code `3` (`EXIT_CONFLICT_STALE_VERSION`).
   * Process signal traps ensure zero dangling `.lock` or `.tmp` files.
