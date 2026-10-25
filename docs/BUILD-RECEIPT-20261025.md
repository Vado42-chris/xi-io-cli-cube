# Cube repair candidate — 2026-10-25

Reconciled base: `991513e2cd1b9ad8bfe0ba5694486a29b09c216f` (original continuation base `39fb50dc37dc1f845abde16d7c21b05b8e2b790c`) in `Vado42-chris/xi-io-cli-cube`.

Scope: existing offline installer/receipt guide, not a native editor or host broker.

Changes: remove the unused incompatible direct esbuild pin; commit a reproducible npm lockfile; fix JSON-null receipt crashes and strict ResourceVersion/digest checks; preserve historical Linux qualification while correcting gate/draft labels; add owner-selected, read-only Rollback History for actual v2 installation receipts. Newer CLI generation suffixes are supported. Records are not proof of installed/current/qualified binaries. No network, filesystem scanning or rollback effects are introduced by the UI.

Executed in an isolated Linux cloud workspace with Node v24.22.1:
- clean npm dependency installation: PASS;
- `npm run lint`: PASS;
- `npm run build`: PASS;
- `npm test`: 58 PASS / 1 optional byte oracle SKIP without external oracle;
- same tests with independently fetched pinned installer bytes: 59 PASS / 0 SKIP (51 source/parser tests plus 8 explicitly labeled illustrative simulations, not installation acceptance);
- `node scripts/verify-installer-contract.mjs`: 15/15 PASS;
- React server rendering: PASS;
- `git diff --check`: PASS.

Oracle: `Vado42-chris/xi-io-cli@54509965c9d91ab02febcc8e49755e2b072a0ca9/install.mjs`, Git blob `3c9c52335e1b88d104b04823c298e1bf6d0ed1c6`. Its complete bytes were fetched and blob-hashed before the oracle test. The installer was NOT executed. Set `XIIO_PINNED_CLI_INSTALLER_FILE` to independently retrieved matching bytes to repeat this check; do not fabricate the input.

Browser interaction: NOT VERIFIED. Direct Chromium startup failed with a socket restriction; the supported cloud browser could not reach the workspace loopback preview. Native installation, physical editor operation, authenticated host communication and original Work return were not performed. No release qualification or promotion is claimed. The CLI pin remains historical 54509965; `xi-io-cli editor open .` is not a verified command of that generation.

The user confirmed AI Studio/GitHub fully synchronized on October 25 at 11:33 local. This candidate reconciles that published 991513e2 snapshot; no additional export is requested. Preserve remote history and check branch currentness before merging.

## Incoming-source reconciliation

The first incoming checkpoint contained 24 blob-verified files; final main 36d320ce contains 22, all independently blob-verified. Its owner-directed deletion of the redundant hyphenated parser and declaration is preserved. The incoming `src/components/RollbackHistory.tsx` remains the single rendered history component, retaining explicit folder selection and current/previous metadata support. Selection is bounded before reads; v2 requires actual installer fields/digests; conflicting records are retained. V1 is preserved only as legacy incomplete, unverified metadata, not supported current installation evidence.

The camelCase parser is the active receipt/pointer projection, sharing strict v2 validation with `src/rollback-history.mjs`. The owner deleted the redundant hyphenated parser and declaration in main 36d320ce. They remain deleted; no production compatibility adapter is restored. The corresponding recorded-digest and missing-digest assertions now directly exercise the canonical parser, with fullByteReadbackVerified remaining false. No independent duplicate schema implementation remains.

Fourteen incoming rollback tests were retained, with their synthetic v2 fixtures completed to the actual receipt field shape. Expected chronology/conflict assertions were corrected to selection order and retained conflicts; four reconciliation tests verify missing fields, scoped pointers, selection order, and canonical digest projection. `tests/installation-journey.test.mjs` is now present in synchronized 991513e2. Its eight self-contained examples import no installer, CLI, launcher, or editor; they have been retained and explicitly relabeled as simulations/filesystem examples. No installation journey PASS is claimed.

Recorded repo/prefix/platform distinguish installation scopes without pretending to identify hosts. Pointers become unresolved across mixed scopes. No file is uploaded, executed, mutated, or rolled back. The historical CLI download SHA remains unchanged.

## Final synchronized-source reconciliation (991513e2)

All 23 published blobs were verified. Preserve the new separation of local native-editor work from remote Ward/host qualification. Retain Node 22+ from the inspected installer; do not generalize a historical Linux host record into qualification of every distribution/library version. CI retains the staged branch's real locked npm install, typecheck and Vite build.

The incoming App added a second rollback inspector with a default fabricated `rollback.json`, invented byte hashes, inferred current/previous generations and auto-generated QUALIFIED status. That duplicate is removed in favor of the already-present owner-selected canonical receipt component. Its exact original bytes remain recoverable from base commit 991513e2; no legitimate selected-file feature is removed. Source regressions prevent duplicate rendering or invented qualification from returning.

The incoming eight simulations are retained under their published filename but accurately named. Their local wrapper text, copy operations, formatter, saved/reopened file, and manually assigned exit-code variable are not real software execution tests. The invented manifest example now additionally exercises the actual parser and proves rejection of its unsupported schema. These eight passes must not be reported as installer/editor journey acceptance.
