# CLI install Cube, cross-lane patch and adoption record

**Canonical Work:** [Cube #7](https://github.com/Vado42-chris/xi-io-cube/issues/7), [CLI #12](https://github.com/Vado42-chris/xi-io-cli/issues/12), [CLI PR #13](https://github.com/Vado42-chris/xi-io-cli/pull/13), [CLI PR #14](https://github.com/Vado42-chris/xi-io-cli/pull/14), [Switchboard #18](https://github.com/Vado42-chris/xi-io-Switchboard/issues/18) / [#65](https://github.com/Vado42-chris/xi-io-Switchboard/pull/65), [BINS #110](https://github.com/Vado42-chris/xi-io_bins/pull/110).

**Scope:** this is an offline instruction projection, not an executable bridge, a runtime provider, a Ward grant, a new Work record, or a release authority. Never derive authority from GitHub comments or source test PASS.

## Current pinned candidate

The sole source of commands and display SHA is `RELEASE` in `src/App.tsx`:

- Repo: `Vado42-chris/xi-io-cli`
- SHA: `54509965c9d91ab02febcc8e49755e2b072a0ca9` (CLI PR #13 candidate, **not** a production release)
- Pinned installer Git blob observed: `3c9c52335e1b88d104b04823c298e1bf6d0ed1c6`
- Issue: CLI #12

The newer PR #14 draft head observed during this check was `5b2d807561f0d8d15d3a85aa59df6182a6d4eb87`. **It is not automatically the applet's pin.** Resolve the latest head and its approval/installed evidence before changing `RELEASE`.

## What the AI Studio cleanup fixed at source

The October 25 Cube `main` source inspection found:
- 15-cell offline/static contract auditor, negative tests, pinned-command tests and CI workflow.
- No Gemini/backend packages in the current `package.json`; `metadata.json` identifies XI-IO CLI Install.
- Keyboard tab navigation and associated tabpanel; clipboard fallback checks `execCommand('copy')` result before displaying success.
- Candidate status visible and no network/runtime execution API in `App.tsx`.

These are **source assertions**. They do not prove a browser build, a GitHub Actions job ran, offline cache persistence after browser restart, an installed CLI, or any host effect. A static Vite bundle needs hosting/cache qualification before claiming independently reloadable offline operation.

## Concrete installer-contract differences still requiring adoption

1. **Legacy launcher conflict:** The historical pinned PR #13 installer refuses an unrecognized existing `xi-io-cli` wrapper and prints a move-aside command. Loki's previously observed wrapper points to the unsandboxed `f8449dc` generation. Do not overwrite it silently. The CLI #14 writer's SHA-approved migration and rollback require independent tests and native Loki readback before the Cube can instruct a user to adopt that flow.
2. **Node binary identity:** the historical installer validates using `process.execPath` but the generated launcher resolves `node` on `PATH`. NVM desktop/service sessions can select a different binary. CLI #14 owns the repair and exact runtime/launcher regression; the Cube must not claim cross-host launch qualification until it passes.
3. **Inventory tools:** PR #14 adds versioned inventory/reconciliation scripts and digest preflight absent from the pinned historical PR #13. They must not be advertised as available in the historical candidate.
4. **Concurrent edits:** CLI #14 owns local stale-byte/CAS protection. BINS #110 owns canonical ResourceRef, ResourceVersion and cross-process/host version convergence. A CLI edit and SHA readback alone do **not** certify multi-agent collision safety.
5. **Remote connection:** Switchboard #65 owns authenticated routing, Ward admission, BINS receipts and original Work return. A PONG, canary source test or a successful local CLI edit is not evidence of a ChatGPT-initiated authorized Loki/Aries file operation.
6. **Private repository access:** the Cube is public, but the installer fetches a private CLI repository. A public visitor without approved GitHub access cannot use its pinned `gh api` command. Treat this as an explicit audience/access limitation, not an installer PASS.
7. **Windows/macOS:** pinned installer source and UI instructions do not establish native installed-host acceptance. Qualify each OS separately; do not infer parity from Linux.

## Required promotion gates

Before any release-pin change, the responsible CLI writer and independent checker must supply:

1. Exact approved CLI commit and byte-verified installer, with native Node/installer tests actually executed (not PRE_RUNNER).
2. Installed `xi-io-cli version` reports the pinned `source_sha` and running-file digest, and its launcher invokes the same verified Node runtime.
3. Legacy launcher migration/rollback and new-install paths independently read back without overwriting user data.
4. Host-specific health/discovery remains health-only unless separately authorized, no catalog entry mints a Ward grant.
5. CLI/BINS stale-version and cross-process/host write-collision hostiles refuse lost updates.
6. Switchboard/Ward/BINS complete **declared API → callable endpoint → Ward admission → actual effect → independent readback → original Work APPLY_RETURN** on Loki and Aries, with exact resource/version and project binding.

**Promotion rule:** a later draft SHA is not a release. Do not edit the `RELEASE` pin from a moving branch head, and do not change its four-field schema. The existing Cube writer owns `App.tsx`, metadata, environment template and dependencies; the independent checker owns tests. This file is only the cross-lane patch/adoption record. Existing Work IDs remain canonical.

**Current result:** STATIC_SOURCE_PRESENT; APPROVED_RELEASE=UNKNOWN; INSTALLED_LOKI=UNVERIFIED; INSTALLED_ARIES=UNVERIFIED; REMOTE_DEVICE_EXECUTE=UNVERIFIED; BINS_CROSS_HOST_RETURN=UNVERIFIED; BUGZILLA_NATIVE_BINDING=WAIT_PROVIDER_NATIVE_BINDING.
