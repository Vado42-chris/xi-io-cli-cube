#!/usr/bin/env node
/**
 * Connected local workflow proof: Ibal owners + Inbox wake/return semantics +
 * BINS fail-closed + production CLI integrity/readback. Does not claim BINS
 * write authority or overwrite the owner's Zed/third-party installs.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createBinsCustodyClient,
  createConnectedLocalBindings,
} from '../services/connected-local-bindings.mjs';
import { createHotfolderWorkerAdapter } from '../services/hotfolder-worker-adapter.mjs';

const CLI = process.env.XIIO_CLI_BIN || path.join(os.homedir(), '.local/bin/xi-io-cli');
const outDir = process.env.XIIO_CONNECTED_PROOF_DIR
  || path.join(os.homedir(), '.local/state/xi-io/receipts');

function cliVersion() {
  const r = spawnSync(CLI, ['version'], { encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) return { state: 'FAIL', stderr: r.stderr || String(r.error) };
  try {
    return JSON.parse(r.stdout);
  } catch (error) {
    return { state: 'FAIL', reason: String(error.message || error), stdout: r.stdout };
  }
}

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ibal-connected-proof-'));
await fs.chmod(stateDir, 0o700);
const transport = await fs.mkdtemp(path.join(os.tmpdir(), 'ibal-connected-transport-'));
await fs.chmod(transport, 0o700);

const bins = createBinsCustodyClient();
const bindings = await createConnectedLocalBindings({
  stateDir,
  projectId: 'xi-io:connected-local-proof',
  cliBin: CLI,
  bins,
});
await bindings.refreshCoordinationFromSwitchboard();

const adapter = createHotfolderWorkerAdapter({
  root: transport,
  coordinationReader: bindings.coordinationReader,
  qualifiedHost: bindings.qualifiedHost,
  applyReturn: bindings.applyReturn,
  wakeConsumer: bindings.wakeConsumer,
});

const version = cliVersion();
const binsHealth = await bins.health();
const binsWrite = await bins.writeCustody({ coordinate_ref: 'connected-proof' });
const binsRead = await bins.readCustody('connected-proof-unknown');
const binsVersion = await bins.readVersion({ coordinate_ref: 'connected-proof', version: '1' });

const binding = {
  project_id: bindings.project_id,
  work_id: bindings.work_id,
  assignment_ref: 'proof:assignment',
  attempt_id: 'proof-attempt-1',
  agent_id: 'xiio:agent/connected-proof',
  source_generation: bindings.source_generation,
  return_ref: 'proof:return',
  operation_ref: 'proof:version-probe',
};
const qualify = await bindings.qualifiedHost.qualify({ binding });
const receipt = await bindings.qualifiedHost.request({ binding, idempotencyKey: 'connected-proof-1' });
const applied = await bindings.applyReturn.apply({ binding, result: receipt, idempotencyKey: 'connected-proof-1' });
const wake = await bindings.wakeConsumer({
  wake_id: 'connected-proof-wake-1',
  semantics: 'WAKE_ONLY',
  authority_granted: false,
  ...binding,
  receipt_ref: applied.receipt_ref,
});
const snap = await adapter.snapshot({ projectId: bindings.project_id });

const summary = {
  schema: 'xiio.ibal.connected-local-workflow-proof/v1',
  state:
    adapter.available &&
    version?.source_sha === '89b9c418f6e161d9864bf891fd665b6a18f00dd2' &&
    version?.integrity_verified === true &&
    qualify.state === 'ALLOWED' &&
    applied.state === 'APPLIED' &&
    wake.state === 'CONSUMED' &&
    binsWrite.state === 'BLOCKED'
      ? 'PASS_LOCAL_CONNECTED_BIN_WRITE_STILL_BLOCKED'
      : 'FAIL',
  at: new Date().toISOString(),
  temporal_root: 'America/Regina',
  cli: {
    bin: CLI,
    source_sha: version?.source_sha || null,
    generation: version?.generation || null,
    integrity_verified: version?.integrity_verified === true,
    previous: version?.previous || null,
  },
  ibal: {
    adapter_state: snap.state,
    available: adapter.available,
    project_id: bindings.project_id,
    work_id: bindings.work_id,
    source_generation: bindings.source_generation,
    workers: snap.workers?.length ?? 0,
  },
  inbox_semantics: {
    wake_only: true,
    authority_granted: false,
    apply_return: applied.state,
    wake: wake.state,
  },
  bins: {
    health: binsHealth,
    write: binsWrite,
    read_unknown: binsRead,
    version_readback: binsVersion,
    write_authority_bound: bins.write_authority_bound,
  },
  hard: [
    'FIXTURE_HOST != LOCAL_LOOPBACK_CLI',
    'WAKE_ONLY != AUTHORITY',
    'DATAFORGE_CUSTODY_WRITE_AUTHORITY_UNBOUND != BYPASS',
    'UNKNOWN_COORDINATE_404 != READBACK_PROOF',
    'ZED_INSTALL != AGENT_MUTATE',
  ],
  remaining_blocker: 'BINS trusted write-authority adapter + same-coordinate/version readback proof',
  next: [
    'Bind BINS authority adapter under BINS owner when ready',
    'Package Ibal+Inbox+BINS bindings onto qualified runtime with Zed plugin / Ibal UI / SAM_LAW',
  ],
};

await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
const outPath = path.join(outDir, 'connected-local-workflow-proof-20261031.json');
await fs.writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ ...summary, proof_path: outPath }, null, 2));
await fs.rm(stateDir, { recursive: true, force: true });
await fs.rm(transport, { recursive: true, force: true });
process.exit(summary.state.startsWith('PASS') ? 0 : 2);
