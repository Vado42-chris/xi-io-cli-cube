# Cube repair candidate — 2026-10-25

Base: `39fb50dc37dc1f845abde16d7c21b05b8e2b790c` in `Vado42-chris/xi-io-cli-cube`.

Scope: existing offline installer/receipt guide, not a native editor or host broker.

Changes: remove the unused incompatible direct esbuild pin; commit a reproducible npm lockfile; fix JSON-null receipt crashes and strict ResourceVersion/digest checks; preserve historical Linux qualification while correcting gate/draft labels; add owner-selected, read-only Rollback History for actual v2 installation receipts. Newer CLI generation suffixes are supported. Records are not proof of installed/current/qualified binaries. No network, filesystem scanning or rollback effects are introduced by the UI.

Executed in an isolated Linux cloud workspace with Node v24.22.1:
- clean npm dependency installation: PASS;
- `npm run lint`: PASS;
- `npm run build`: PASS;
- `npm test`: 32 PASS / 1 optional byte oracle SKIP without external oracle;
- same tests with independently fetched pinned installer bytes: 33 PASS / 0 SKIP;
- `node scripts/verify-installer-contract.mjs`: 15/15 PASS;
- React server rendering: PASS;
- `git diff --check`: PASS.

Oracle: `Vado42-chris/xi-io-cli@54509965c9d91ab02febcc8e49755e2b072a0ca9/install.mjs`, Git blob `3c9c52335e1b88d104b04823c298e1bf6d0ed1c6`. Its complete bytes were fetched and blob-hashed before the oracle test. The installer was NOT executed. Set `XIIO_PINNED_CLI_INSTALLER_FILE` to independently retrieved matching bytes to repeat this check; do not fabricate the input.

Browser interaction: NOT VERIFIED. Direct Chromium startup failed with a socket restriction; the supported cloud browser could not reach the workspace loopback preview. Native installation, physical editor operation, authenticated host communication and original Work return were not performed. No release qualification or promotion is claimed. The CLI pin remains historical 54509965; `xi-io-cli editor open .` is not a verified command of that generation.

AI Studio may retain additional unpublished edits. This checkpoint-relative candidate does not overwrite them. Integrate only after comparing current source; never force-push over a newer checkpoint.
