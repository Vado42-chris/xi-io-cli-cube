# HEX consumption of CLI PR15 launcher-only repair

Scope: existing HEX controls and finite Python/native adapter consume the canonical CLI installer. No new installer implementation, Node runtime, CLI generation, broker, identity, service, credential or product UI redesign.

## Exact source

- CLI PR15: `b56adb5cbf34bcd9102f46df297aa42395ef41eb`.
- Upstream `install.mjs` consumed unchanged as `native/hex/cli-source/launcher-repair.install.mjs`.
- SHA-256: `118a7df1e952602aaf9b9c93d4e8aae62c527f15150463e8b2cb0645da3ab137`.
- Existing normal `cli-source/install.mjs` retains its offline packaged-source transport. The repair resource is that same upstream installer, not a forked repair algorithm.
- Exact unchanged upstream generation verifier is checked before preparation and readback.
- Test-only upstream fixture closure is under `tests/fixtures/cli-launcher-repair-pr15`, outside shipped native resources.

## User journey

In the existing native HEX installation panel, select “Repair only the existing CLI launcher.” Select the existing CLI generation root, the existing verified Node executable, and the directory containing the existing `xi-io-cli` launcher. The launcher directory is independent of the generation root. Node is never downloaded.

Prepare checks source custody, actual selected runtime, launcher bytes and ownership, both generation pointers/receipts, complete prefix snapshot, and pending operations. Review the displayed original and expected launcher digests before approving. Only the canonical `--repair-launcher` entrypoint performs replacement. HEX reopens exact expected launcher bytes and metadata, compares the complete generation history, and invokes the real launcher with Node absent from its PATH.

A successful return is `LAUNCHER_REPAIR_READBACK_VERIFIED`, not complete CLI or remote acceptance. The required next physical checks are the installed CLI `version`, `doctor`, and an explicitly approved local file read with independent reopen. No such owner-machine checks are claimed here.

## Failure and recovery

Stale source, runtime, launcher, directory, generation bytes or approval refuses the operation. Once effect execution starts, a missing response or failed readback records uncertain outcome and blocks repeated apply and replacement plans. A timeout retains process custody; it does not kill the transaction or infer rollback.

The canonical installer owns interrupted-transaction recovery. The saved plan exposes its exact source/runtime/target/original SHA for explicitly reviewed recovery. This patch does not add an automatic recovery effect or claim an uncertain journal is cleared merely because a backup exists. Generation rollback is not a substitute for launcher recovery.

## Executed qualification

- Full existing adapter discovery: 34/34 PASS with no environment override.
- 16 executable real-installer integration cases; independently rerun with repository-default fixtures: PASS, no skips.
- 14 additional independent process/filesystem cases against unchanged adapter SHA `dba4323e992e42acc2e183ced8b5e30d19d8c03730715c6eff0cc72cb802ef11`: PASS, no skips.
- 4 new UI/client projection tests: PASS.
- 1 actual compiled React interaction case with fixture IPC: PASS. Verifies explicit approval, duplicate-effect suppression and retained uncertain state, not native execution.
- Existing readiness cases: 3 PASS; existing normal source suite: 78 PASS, 1 optional historical-byte oracle SKIP; existing binding suite: 18 PASS; existing interaction suite: 13 PASS.
- Source adoption: 6 PASS. Static installer audit: 15 PASS. These are source checks, not installed proof.
- TypeScript and frontend build: PASS. Vite reports existing large-chunk advisory.
- Native Rust finite protocol/transport: 11 PASS including the repair-specific uncertainty projection in the DEV5 build.

Counts describe distinct suites, not a summed marketing score. Canonical CLI's prior 17-case/4-contract qualification remains separate. Original CLI failure evidence remains in CLI PR15; it is not overwritten by this consumer patch.

## Remaining release gates

Exact GitHub publication/readback, final native package resource verification, real native UI QA, approved owner-machine installation, and installed CLI consumer acceptance. A draft PR, source test, or .deb alone cannot satisfy those gates.

## DEV5 timeout discrepancy, preserved

The carrier retained custody but the Python repair call used subprocess.run(timeout=90), which can kill its child. DEV5 is held; its binary parity did not qualify this failure behavior. The successor removes the adapter-owned kill deadline only for the consequential canonical repair, leaving the carrier response deadline/process tracker and uncertain-state journal in place. Final successor replay remains required. Inspection creates the installer state directory and lock: it is non-installing, not filesystem-write-free.
