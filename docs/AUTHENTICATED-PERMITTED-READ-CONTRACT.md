# Authenticated Permitted Read Contract & Host Bridge Specification

**Document Version:** `1.0.0`  
**Governing Issue:** Desktop Daemon & Authority Join (CLI #12 / Ward #26 / Switchboard #18 / BINS #110)  
**Schema Identification:** `xiio.host.read-return/v1`

---

## 1. Executive Context: Desktop Commander vs. Running Service

Desktop Commander previously bundled four capabilities into a single monolithic donor:
1. Running remote service
2. Device pairing
3. Authenticated session
4. Command/result transport

Configuring settings for Desktop Commander recorded where and how it was configured, but **settings do not replace the running service**. In the XI-IO modular architecture:
- **CLI (`xi-io-cli`):** Supplies local execution, binary wrappers with P1 Node path binding, and whole-file pre-commit verification.
- **Switchboard:** Supplies routing and capability admission, but depends on production session authority, host-operation adapters, and persistence bindings.
- **REA:** Provides source inspection and recovery analysis, but does not itself supply an authenticated device connection.

### The Objective
Close the open join by:
1. Connecting the existing daemon (`xi-io-cli` local endpoint) to the existing authority (Ward capability token validation) and persistence (BINS canonical resource IDs).
2. Packaging that exact combination into an unprivileged host bridge.
3. Proving **one permitted read returning actual bytes from the computer**, with zero unrestricted remote shell access and zero acceptance of synthetic health checks.

---

## 2. Security Invariants & Boundaries

### Invariant 1: Zero Ambient Authority (No Unrestricted Shells)
The system **never** opens an unrestricted remote shell (`/bin/sh`, `/bin/bash`, `cmd.exe`, or raw process execution).
- Any request requesting `OPEN_REMOTE_SHELL` or embedding shell interpreters is refused closed immediately with **Exit Code 126** (`REFUSED_UNRESTRICTED_SHELL_FORBIDDEN`).
- Every host interaction requires an explicit, cryptographically signed capability grant (`ward:capability:file:read`, `ward:capability:file:edit`, etc.) scoped strictly to the declared project workspace folder.

### Invariant 2: Synthetic Diagnostics Disqualification
A health response (`{ status: "ok" }`, HTTP 200 ping, or PONG message) does **not** prove an authenticated device connection or file read capability.
- Synthetic diagnostics are explicitly disqualified from qualification gates.
- Only a **content-addressed read returning verified byte digests from the local filesystem** satisfies Gate 4 and Gate 6.

### Invariant 3: Canonical Resource Addressing
All persistent artifacts are addressed via canonical BINS resource references:
$$\text{resource\_ref} = \text{bins:resource:}\langle\text{UUID}\rangle$$

---

## 3. Permitted Read Operation Protocol

### Step 1: Inbound Read Request
An authorized client dispatches a scoped read request:
```json
{
  "schema": "xiio.host.read-request/v1",
  "session_id": "ward:session:3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "capability_token": "ward:capability:file:read:v1",
  "resource_ref": "bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "target_path": "app.ts"
}
```

### Step 2: Ward Capability Validation
The Host Bridge checks:
1. `session_id` matches `^ward:session:[0-9a-fA-F-]{36}$` and is active.
2. `capability_token` grants `file:read` permissions on the targeted path.
3. `target_path` is strictly relative to the project directory without path traversal (`..` or leading `/`).
4. Request contains no shell execution commands.

### Step 3: Local Daemon Execution & Digest Generation
The local daemon reads the target file from the host filesystem using the P1 verified executable (`fs.realpathSync(process.execPath)`). It calculates the SHA-256 digest of the entire byte payload:
$$\text{content\_sha256} = \text{SHA256}(\text{raw\_bytes})$$

### Step 4: Out-of-Band Return Receipt (`READ_RETURN`)
The host returns an unforgeable receipt:
```json
{
  "schema": "xiio.host.read-return/v1",
  "operation_id": "op_8f3b219e487942bca1067ea3976fbcd1",
  "session_id": "ward:session:3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "capability_token": "ward:capability:file:read:v1",
  "resource_ref": "bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "target_path": "app.ts",
  "byte_length": 142,
  "content_sha256": "54509965c9d91ab02febcc8e49755e2b072a0ca9e144a8219dfa95c9603f9011",
  "content_preview": "// Sample project file: app.ts\nexport function calculateTotal(items: number[]): number {\n  return items.reduce((sum, item) => sum + item, 0);\n}\n",
  "exit_code": 0,
  "timestamp": "2026-10-25T16:05:00.000Z",
  "physical_evidence": "LOCAL_HOST_READ_VERIFIED",
  "simulated": false
}
```

---

## 4. Acceptance Criteria & Gate Mapping

| Gate | Name | Requirement | Validation Method |
|---|---|---|---|
| **Gate 2** | Installed Device Endpoint | CLI daemon active on local socket | Local socket listener verified |
| **Gate 3** | Ward Capability Admission | Scoped token verified; no unrestricted shell | Shell request fails with exit code 126 |
| **Gate 4** | Actual Device Effect | Target file read from host storage | Byte length > 0 and verified SHA-256 |
| **Gate 6** | Original Work APPLY_RETURN | Out-of-band receipt delivery | `READ_RETURN` schema verified |
