# Cross-Lane Integration Directive: Universal Installation & 5-Point Host Acceptance

**Target Repositories:**  
- `Vado42-chris/xi-io-cli` (PR #14 / Issue #12)
- `Vado42-chris/xi-io-cube` (Issue #7 / Cube Applet)
- `Vado42-chris/xi-io-Switchboard` (PR #65 / Issue #18)
- `Vado42-chris/xi-io_bins` (PR #110)
- `@ibal` Native Editor (Aries Worktree / Node #1)

---

## 1. Core Operating Directive

**DO NOT make physical host access or user command execution a prerequisite for software packaging, installer scripts, or integration repairs.**

All teams and component writers must prepare the complete installable software together in source:
1. **Self-contained packaging & automated prerequisites**: The software must install cleanly and deterministically on **any** machine (Aries, Loki, local workstation, fresh CI VM) without requiring custom manual environment surgery.
2. **Deterministic Configuration**: All service bindings, ports, model names, and paths must have clean defaults or environment-driven configuration files (`.env.example` / `config.json`).
3. **Upgrade & Rollback Invariants**: Clean launcher migration, version readback, and single-command rollback without data loss.
4. **Usable First Launch**: A single command must launch the qualified client/editor, open a project, and verify the local runtime.

---

## 2. The 5-Point Minimum Acceptance Contract

The entire distributed system (Switchboard, Ward, BINS, CLI, Editor) must satisfy the following five acceptance criteria in sequence before any production release is authorized:

```
[1. Host Identity Proof] ──> [2. Strict Auth & Revocation] ──> [3. Uniquely Identified Read-Only Roundtrip]
                                                                        │
[5. Scoped Editor Actions & CAS] <── [4. Idempotency on Disconnect / Restart]
```

### Point 1: Host Self-Identity Proof
- Each physical host (Aries, Loki, or any new node) proves its own identity cryptographically using its local host private key.
- A client cannot choose another host's identity, spoof a node ID, or grant itself execution capabilities.

### Point 2: Strict Authorization & Revocation (Zero Fallback)
- Missing authorization, expired sessions, and revoked capability tokens must immediately refuse work.
- **Zero fallback credentials**: There is no ambient admin key, shared fallback string, or unauthenticated polling.
- All capabilities are bound to the specific `ResourceRef`, `ResourceVersion`, and lease window.

### Point 3: Uniquely Identified Read-Only Roundtrip
- A uniquely identified read-only request (with UUIDv4 `correlation_id` and timestamp) reaches the intended running host daemon.
- The daemon executes the query against its local environment and returns an independently verified result back to the requesting session.
- Diagnostic PONGs, HTTP 200 on an in-memory map, or registration receipts **do not** qualify as physical roundtrip proof.

### Point 4: Fault Tolerance & Idempotency
- Disconnects, daemon restarts, dropped packets, and lost replies must preserve the request's exact state.
- Retries must be strictly idempotent: the runtime must never silently repeat side-effects on the physical host filesystem.

### Point 5: Scoped Editor Actions & CAS Write Protection
- Only after Points 1–4 are fully proven may scoped editor mutation actions be enabled.
- Every edit proposal is bound to the exact project context and diff conceived by the user.
- Mutations must enforce whole-file content-addressed CAS protection against stale writes (`REFUSED_STALE_VERSION` HTTP 409). If intervening bytes change, the write is refused closed.

---

## 3. Component Writer Responsibilities

| Component | Owner | Immediate Deliverable |
|---|---|---|
| **XI-IO CLI** | CLI #14 Writer | Provide self-contained npm tarball + `xiio-install.mjs` installer with Node execPath pinning and single-command rollback. |
| **@ibal Editor** | Node #1 Writer | Package editor bundle with project-bound Ollama bridge; prove 5-step lifecycle (`install → open project → approved edit/test → save → reopen`). |
| **Switchboard** | Switchboard #65 Writer | Bind real persistence and host session adapter; verify Points 1–4 roundtrip between host consumer and daemon. |
| **BINS** | BINS #110 Writer | Verify atomic CAS logic (commit `7ea3976f`) against multi-agent collision harness with standard `REFUSED_STALE_VERSION` receipts. |
| **Cube Applet** | Cube #7 | Act strictly as offline installer catalog, documentation authority, and receipt consumer (15/15 static contract checks). |
