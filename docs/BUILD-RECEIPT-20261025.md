# Cube repair candidate — 2026-10-25

Reconciled base: `36d320ce1537c888220f7d4528bd67cefc78b5eb` (original continuation base `39fb50dc37dc1f845abde16d7c21b05b8e2b790c`) in `Vado42-chris/xi-io-cli-cube`.

Scope: existing offline installer/receipt guide, not a native editor or host broker.

Changes: remove the unused incompatible direct esbuild pin; commit a reproducible npm lockfile; fix JSON-null receipt crashes and strict ResourceVersion/digest checks; preserve historical Linux qualification while correcting gate/draft labels; add owner-selected, read-only Rollback History for actual v2 installation receipts. Newer CLI generation suffixes are supported. Records are not proof of installed/current/qualified binaries. No network, filesystem scanning or rollback effects are introduced by the UI.

Executed in an isolated Linux cloud workspace with Node v24.22.1:
- clean npm dependency installation: PASS;
- `npm run lint`: PASS;
- `npm run build`: PASS;
- `npm test`: 50 PASS / 1 optional byte oracle SKIP without external oracle;
- same tests with independently fetched pinned installer bytes: 51 PASS / 0 SKIP;
- `node scripts/verify-installer-contract.mjs`: 15/15 PASS;
- React server rendering: PASS;
- `git diff --check`: PASS.

Oracle: `Vado42-chris/xi-io-cli@54509965c9d91ab02febcc8e49755e2b072a0ca9/install.mjs`, Git blob `3c9c52335e1b88d104b04823c298e1bf6d0ed1c6`. Its complete bytes were fetched and blob-hashed before the oracle test. The installer was NOT executed. Set `XIIO_PINNED_CLI_INSTALLER_FILE` to independently retrieved matching bytes to repeat this check; do not fabricate the input.

Browser interaction: NOT VERIFIED. Direct Chromium startup failed with a socket restriction; the supported cloud browser could not reach the workspace loopback preview. Native installation, physical editor operation, authenticated host communication and original Work return were not performed. No release qualification or promotion is claimed. The CLI pin remains historical 54509965; `xi-io-cli editor open .` is not a verified command of that generation.

AI Studio may retain additional unpublished edits. This checkpoint-relative candidate does not overwrite them. Integrate only after comparing current source; never force-push over a newer checkpoint.

## Incoming-source reconciliation

The first incoming checkpoint contained 24 blob-verified files; final main 36d320ce contains 22, all independently blob-verified. Its owner-directed deletion of the redundant hyphenated parser and declaration is preserved. The incoming `src/components/RollbackHistory.tsx` remains the single rendered history component, retaining explicit folder selection and current/previous metadata support. Selection is bounded before reads; v2 requires actual installer fields/digests; conflicting records are retained. V1 is preserved only as legacy incomplete, unverified metadata, not supported current installation evidence.

The camelCase parser is the active receipt/pointer projection, sharing strict v2 validation with `src/rollback-history.mjs`. The owner deleted the redundant hyphenated parser and declaration in main 36d320ce. They remain deleted; no production compatibility adapter is restored. The corresponding recorded-digest and missing-digest assertions now directly exercise the canonical parser, with fullByteReadbackVerified remaining false. No independent duplicate schema implementation remains.

Fourteen incoming rollback tests were retained, with their synthetic v2 fixtures completed to the actual receipt field shape. Expected chronology/conflict assertions were corrected to selection order and retained conflicts; four reconciliation tests verify missing fields, scoped pointers, selection order, and canonical digest projection. `tests/installation-journey.test.mjs` remains absent from this published checkpoint; no installation journey PASS is claimed.

Recorded repo/prefix/platform distinguish installation scopes without pretending to identify hosts. Pointers become unresolved across mixed scopes. No file is uploaded, executed, mutated, or rolled back. The historical CLI download SHA remains unchanged.
