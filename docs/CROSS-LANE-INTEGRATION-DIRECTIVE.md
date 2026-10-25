# Cross-Lane Integration Directive: Scoped Installation & Editor Acceptance

**Target Repositories:**  
- `Vado42-chris/xi-io-cli` (PR #14 / Issue #12)
- `Vado42-chris/xi-io-cube` (Issue #7 / Cube Applet)
- `Vado42-chris/xi-io-Switchboard` (PR #65 / Issue #18)
- `Vado42-chris/xi-io_bins` (PR #110)
- `@ibal` Native Editor (Aries Worktree / Node #1 / Studio #221)

---

## 1. Operating Mandate & Platform Scope

**DO NOT make physical host access or user command execution a prerequisite for software packaging, installer scripts, or integration repairs.**

### Supported Platform Scope
- **Recorded Baseline Platform:** **Linux `x86_64`** on Aries and Loki at historical CLI `54509965` (CLI #12, 16:05 UTC). Node.js 22+ is the inspected installer requirement. This record does not independently qualify every Debian/Ubuntu/Fedora release or glibc/bubblewrap version.
- **Explicitly Untested / Unsupported:**
  - **Windows `x86_64`**: Pinned installer commands use `cmd.exe`. Unverified on physical Windows hosts.
  - **macOS (`arm64` / `x86_64`)**: Pinned script unverified on macOS hosts.
  - **Linux `arm64` / aarch64**: Untested.
  - Parity must never be inferred. Each OS/architecture requires separate independent qualification.

---

## 2. Decoupled Acceptance Boundaries

### Boundary A: Local Native Editor Acceptance (Immediate Outcome)
Local editor work is **unblocked** by the proven Linux CLI baseline (`54509965`) recorded on Aries and Loki (CLI #12, 16:05 UTC). It does **not** depend on finishing remote infrastructure, distributed BINS, or full Studio.

The required local editor outcome is strictly the 5-step lifecycle:
$$\text{install} \longrightarrow \text{open project} \longrightarrow \text{approved edit/test} \longrightarrow \text{save} \longrightarrow \text{reopen}$$
- **Entry & Bridge:** Native editor consumes installed `xi-io-cli` via existing CLI bridge.
- **Project Scope:** Project-bound Ollama model with working file read/write/reopen.
- **Local Edit Safety:** CLI whole-file pre-commit check refuses with exit code 3 if disk bytes changed after diff proposal.

### Boundary B: Remote Host Qualification (Gates Remote Operations Only)
Remote-host qualification governs cloud-to-device execution and does **not** block local editor work. It requires:
1. **Existing Ward/Session Contract:** Consume the established Ward capability and session admission contract. Do not mandate a new host-key infrastructure or invent tokens.
2. **Strict Auth & Revocation:** Missing authorization, expired sessions, and revoked tokens refuse work immediately. Zero fallback credentials.
3. **Uniquely Identified Read-Only Roundtrip:** A unique read-only request reaches the intended running host daemon, and its independently checked result returns to the session.
4. **Idempotency on Disconnect / Restart:** Disconnects and lost replies preserve request state without duplicate effects.
5. **BINS ResourceVersion Custody:** Shared storage CAS in BINS PR #110 returning `REFUSED_STALE_VERSION` (HTTP 409) with canonical `bins:resource:<UUID>` identities.

---

## 3. Separation of Stale-Write Protections

Do not conflate local CLI file protection with BINS custody:
- **Local CLI Pre-Commit Re-verification:** Operates on the local filesystem. Compares whole-file content digest before applying an approved patch. Refuses with exit code 3 if intervening bytes changed.
- **BINS CAS Ledger (`REFUSED_STALE_VERSION`):** Operates on the distributed storage repository. Enforces atomic `ResourceVersion` progression (`<ResourceRef>:sha256:<digest>`). Emits HTTP 409 conflict receipts defined in `docs/CAS-CONFLICT-CONTRACT.md`.

---

## 4. Required Inputs for Native Editor Integration (Node #1 / Studio #221)

To integrate the installable editor without rebuilding or mocking:
1. **Native Editor Entry & Components:** Existing code/chat/file layout from the Aries/Loki worktree.
2. **CLI Bridge Adapter:** Adapter script connecting editor UI to standalone `xi-io-cli`.
3. **Manifest & Lockfile:** Dependencies for Ollama client and editor runtime.
4. **Build & Package Configuration:** Scripts to bundle the editor (`package.json` scripts).
5. **Launcher Wrapper:** Script to launch editor bound to local project directory.
