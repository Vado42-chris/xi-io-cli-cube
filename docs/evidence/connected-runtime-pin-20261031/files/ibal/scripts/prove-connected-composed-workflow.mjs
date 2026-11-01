#!/usr/bin/env node
/**
 * SUPERSEDED unrepaired composed proof path.
 * Do NOT re-emit PASS_FRESH_COMPOSED_OCCURRENCE from this script.
 *
 * Correction runner: scripts/prove-connected-composed-workflow-corrected.mjs
 * Superseded receipt: ~/.local/state/xi-io/receipts/connected-composed-workflow-proof-20261031.json
 * Historical unrepaired body archived as:
 *   docs/evidence/prove-connected-composed-workflow.unrepaired-20261031.mjs.txt
 */
const payload = {
  state: 'SUPERSEDED',
  reason: 'UNREPAIRED_COMPOSED_PROOF_PATH',
  use: 'scripts/prove-connected-composed-workflow-corrected.mjs',
  hard: ['PASS_FRESH_COMPOSED_OCCURRENCE != REPAIRED', 'MODEL_ACCEPTANCE != ADMITTED_PACKET'],
};
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
process.exit(2);
