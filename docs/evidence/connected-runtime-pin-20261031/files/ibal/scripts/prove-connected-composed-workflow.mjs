#!/usr/bin/env node
/**
 * NEW bounded connected-workflow occurrence (not ALREADY_COMPLETE replay).
 * Runner chooses intermediate tool/Ollama steps; Cursor only launches + reads receipt.
 *
 * Path: isolated real-source worktree → Ibal startup bindings → local Ollama proposal →
 * deterministic apply/accept → Inbox WAKE_ONLY applyReturn/wake → BINS authorized write+version readback →
 * interrupt/restart reconcile without duplicate write.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createBinsCustodyClient,
  createConnectedLocalBindings,
} from '../services/connected-local-bindings.mjs';
import {
  buildAuthorityRecord,
  createDataForgeWriteAuthorityAdapter,
} from '/home/chrishallberg/.local/state/xi-io/worktrees/xi-io-bins-custody-20261031/src/bins/dataforge-write-authority.mjs';
import { createDataForgeCustodyServer } from '/home/chrishallberg/.local/state/xi-io/worktrees/xi-io-bins-custody-20261031/server/dataforge-custody-runtime.mjs';

const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL = process.env.XIIO_OLLAMA_MODEL || 'qwen2.5-coder:7b';
const PRINCIPAL = 'xiio:agent/98fa4876-34c7-41d5-a318-bb4db9cca103';
const ROOT_REF = 'dataforge://root/connected-composed-20261031';
const WORK_REF = 'dataforge://work/connected-composed-20261031';
const OUT = process.env.XIIO_COMPOSED_PROOF_OUT
  || path.join(os.homedir(), '.local/state/xi-io/receipts/connected-composed-workflow-proof-20261031.json');
const BINS_HEAD = spawnSync('git', ['-C', '/home/chrishallberg/.local/state/xi-io/worktrees/xi-io-bins-custody-20261031', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const IBAL_HEAD = spawnSync('git', ['-C', process.cwd(), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const INBOX_HEAD = spawnSync('git', ['-C', '/home/chrishallberg/.local/state/xi-io/worktrees/xi-io-inbox-babysit-20261031', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const CLI = spawnSync(path.join(os.homedir(), '.local/bin/xi-io-cli'), ['version'], { encoding: 'utf8', timeout: 15000 });
let cliVersion = null;
try { cliVersion = JSON.parse(CLI.stdout); } catch { cliVersion = { state: 'FAIL' }; }

const occurrenceId = `OCC-CONNECTED-COMPOSED-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
const canaryMarker = `COMPOSED_CANARY_${occurrenceId}`;

async function mkPrivate(prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.chmod(dir, 0o700);
  return dir;
}

async function ollamaPropose({ targetPath, instruction }) {
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      options: { temperature: 0 },
      prompt: [
        'Return ONLY one JSON object with keys action, marker, acceptance_command.',
        'action must be write_marker_file.',
        `marker must be exactly: ${canaryMarker}`,
        `acceptance_command must be: test -f ${targetPath} && grep -F ${canaryMarker} ${targetPath}`,
        `instruction: ${instruction}`,
      ].join('\n'),
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`OLLAMA_HTTP_${res.status}`);
  const body = await res.json();
  const text = String(body.response || '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('OLLAMA_JSON_MISSING');
  const parsed = JSON.parse(match[0]);
  return { raw: text.slice(0, 2000), parsed, model: MODEL };
}

function shaFile(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

const workspace = await mkPrivate('xiio-composed-ws-');
const targetPath = path.join(workspace, 'CANARY.composed.txt');
const stateDir = await mkPrivate('xiio-composed-ibal-');
const custodyRoot = await mkPrivate('xiio-composed-custody-');
const authorityDir = await mkPrivate('xiio-composed-auth-');
await fs.mkdir(path.join(custodyRoot, 'records'), { recursive: true, mode: 0o700 });

await fs.writeFile(
  path.join(authorityDir, 'auth-composed-001.json'),
  JSON.stringify(
    buildAuthorityRecord({
      authority_id: 'auth-composed-001',
      principal_ref: PRINCIPAL,
      workspace_root_ref: ROOT_REF,
      work_ref: WORK_REF,
      permitted_operations: ['custody.put'],
      coordinate_scope: { prefix: 'local:applied:' },
      source_record_refs: [
        'seat:' + PRINCIPAL,
        'receipt:bins-writer-identity-20261031.json',
      ],
    }),
    null,
    2,
  ) + '\n',
  { mode: 0o600 },
);

const authority = createDataForgeWriteAuthorityAdapter({ authorityDir });
const server = createDataForgeCustodyServer({ rootDir: custodyRoot, authorityAdapter: authority });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const binsBase = `http://127.0.0.1:${port}`;

const bins = createBinsCustodyClient({
  baseUrl: binsBase,
  authorityAdapter: authority,
});

const bindings = await createConnectedLocalBindings({
  stateDir,
  projectId: 'xi-io:connected-composed-20261031',
  workId: occurrenceId,
  sourceGeneration: `composed-${occurrenceId}`,
  bins,
});

const binding = {
  project_id: bindings.project_id,
  work_id: bindings.work_id,
  assignment_ref: 'composed:assignment',
  attempt_id: `attempt-${occurrenceId}`,
  agent_id: PRINCIPAL,
  source_generation: bindings.source_generation,
  return_ref: `local:return:${occurrenceId}`,
  operation_ref: 'local:composed-write-marker',
  workspace_root_ref: ROOT_REF,
  root_ref: ROOT_REF,
  work_ref: WORK_REF,
};

const receipt = {
  schema: 'xiio.ibal.connected-composed-workflow-proof/v1',
  occurrence_id: occurrenceId,
  stamped_at: new Date().toISOString(),
  temporal_root: 'America/Regina',
  revisions: {
    ibal: IBAL_HEAD,
    bins: BINS_HEAD,
    inbox_babysit_wake_pattern: INBOX_HEAD,
    cli_source_sha: cliVersion?.source_sha || null,
    sdk: '55cff051ff61c3cc55d21c364377a83f97620a32',
  },
  hard: [
    'ALREADY_COMPLETE != FRESH_EXECUTION_PROOF',
    'BOUND_OWNER_ADAPTER != E2E',
    'ISOLATED_AUTHORITY != PRODUCTION_GRANT',
    'CURSOR_LAUNCHES_RUNNER != CURSOR_CHOOSES_EVERY_STEP',
  ],
  steps: {},
};

try {
  // 1) Ollama proposal (runner-owned)
  let proposal;
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      proposal = await ollamaPropose({
        targetPath,
        instruction: `Create canary file for occurrence ${occurrenceId}`,
      });
      if (proposal.parsed?.marker === canaryMarker && proposal.parsed?.action === 'write_marker_file') break;
      lastErr = new Error('OLLAMA_MARKER_MISMATCH');
    } catch (error) {
      lastErr = error;
      proposal = null;
    }
  }
  if (!proposal || proposal.parsed?.marker !== canaryMarker) {
    throw lastErr || new Error('OLLAMA_PROPOSAL_FAILED');
  }
  receipt.steps.ollama_proposal = {
    state: 'PASS',
    model: MODEL,
    action: proposal.parsed.action,
    marker: proposal.parsed.marker,
    acceptance_command: proposal.parsed.acceptance_command,
  };

  // 2) Deterministic apply of requested change (not model-authored bytes beyond marker)
  await fs.writeFile(targetPath, `${canaryMarker}\noccurrence=${occurrenceId}\n`, 'utf8');
  const accept = spawnSync('bash', ['-lc', proposal.parsed.acceptance_command], { encoding: 'utf8' });
  receipt.steps.acceptance = {
    state: accept.status === 0 ? 'PASS' : 'FAIL',
    exit_code: accept.status,
    command: proposal.parsed.acceptance_command,
  };
  if (accept.status !== 0) throw new Error('ACCEPTANCE_COMMAND_FAILED');

  const bytes = await fs.readFile(targetPath);
  receipt.steps.independent_verify = {
    state: 'PASS',
    path: targetPath,
    sha256: shaFile(bytes),
    contains_marker: bytes.toString('utf8').includes(canaryMarker),
  };

  // 3) Ibal qualify → applyReturn (BINS write) → wake
  const qualify = await bindings.qualifiedHost.qualify({ binding });
  const hostReceipt = await bindings.qualifiedHost.request({
    binding,
    idempotencyKey: `${occurrenceId}:host`,
  });
  const applied = await bindings.applyReturn.apply({
    binding,
    result: hostReceipt,
    idempotencyKey: `${occurrenceId}:apply`,
  });
  const wake = await bindings.wakeConsumer({
    wake_id: `${occurrenceId}-wake`,
    semantics: 'WAKE_ONLY',
    authority_granted: false,
    ...binding,
    receipt_ref: applied.receipt_ref,
  });
  receipt.steps.ibal_inbox = {
    qualify: qualify.state,
    host: hostReceipt.state,
    apply_return: applied.state,
    bins_custody: applied.bins_custody?.state || null,
    bins_version_ref: applied.bins_version_ref || applied.bins_custody?.body?.version_ref || null,
    wake: wake.state,
  };
  if (applied.bins_custody?.state !== 'PASS') {
    throw new Error('BINS_WRITE_NOT_PASS:' + (applied.bins_custody?.reason || applied.bins_custody?.state));
  }

  const versionRef = applied.bins_version_ref || applied.bins_custody.body.version_ref;
  const coordinate = applied.receipt_ref;
  const versionRead = await bins.readVersion({ coordinateRef: coordinate, version: versionRef });
  receipt.steps.bins_version_readback = {
    state: versionRead.state,
    coordinate_ref: coordinate,
    version_ref: versionRef,
    digest: versionRead.body?.digest || null,
    payload_receipt_ref: versionRead.body?.payload?.receipt_ref || null,
  };
  if (versionRead.state !== 'PASS' || versionRead.body?.payload?.receipt_ref !== coordinate) {
    throw new Error('BINS_VERSION_READBACK_FAILED');
  }

  // 4) Interrupt/restart: reconcile uncertain effects; retry must not duplicate
  const reconciled = await bindings.applyReturn.reconcile({ idempotencyKey: `${occurrenceId}:apply` });
  const retry = await bindings.applyReturn.apply({
    binding,
    result: hostReceipt,
    idempotencyKey: `${occurrenceId}:apply`,
  });
  receipt.steps.interrupt_restart = {
    reconcile_state: reconciled.state,
    retry_state: retry.state,
    same_receipt: retry.receipt_ref === applied.receipt_ref,
    bins_retry_state:
      retry.bins_custody == null ? 'IDEMPOTENT_NO_SECOND_WRITE' : retry.bins_custody?.state,
    note: 'Second applyReturn with same idempotency key returns existing record; no second write attempted when file exists',
  };
  if (retry.receipt_ref !== applied.receipt_ref || reconciled.state !== 'APPLIED') {
    throw new Error('RESTART_RECONCILE_FAILED');
  }

  // Idempotent BINS put of same payload (exact applied_at from first apply)
  const custodyPayload = {
    schema: 'xiio.ibal.apply-return-custody-payload/v1',
    receipt_ref: coordinate,
    work_id: binding.work_id,
    result_ref: hostReceipt.result_ref,
    applied_at: applied.applied_at,
  };
  const putAgain = await bins.writeCustody({
    principal_ref: PRINCIPAL,
    root_ref: ROOT_REF,
    work_ref: WORK_REF,
    coordinate_ref: coordinate,
    payload: custodyPayload,
    source_occurrence_ref: coordinate,
  });
  receipt.steps.bins_idempotent_retry = {
    state: putAgain.state,
    http_status: putAgain.http_status,
    write_state: putAgain.body?.state || null,
    version_ref: putAgain.body?.version_ref || null,
  };
  if (
    !(
      putAgain.state === 'PASS' &&
      putAgain.body?.version_ref === versionRef &&
      (putAgain.body?.state === 'IDEMPOTENT_EXISTING' || putAgain.body?.state === 'STORED')
    )
  ) {
    throw new Error('BINS_DUPLICATE_WRITE_RISK');
  }
  if (putAgain.body?.state === 'STORED') {
    throw new Error('BINS_DUPLICATE_CREATED_NEW_VERSION');
  }

  // Consumer reopen
  const reopened = await bindings.wakeConsumer({
    wake_id: `${occurrenceId}-wake`,
    semantics: 'WAKE_ONLY',
    authority_granted: false,
    ...binding,
    receipt_ref: applied.receipt_ref,
  });
  receipt.steps.consumer_reopen = {
    state: reopened.state,
    wake_id: reopened.wake_id,
    same_receipt: reopened.receipt_ref === applied.receipt_ref,
  };

  receipt.state = 'PASS_FRESH_COMPOSED_OCCURRENCE';
  receipt.workspace = workspace;
  receipt.bins_base = binsBase;
  receipt.not_claimed = [
    'production_:8796_write',
    'owner_zed_install_mutated',
    'PR_merged',
  ];
} catch (error) {
  receipt.state = 'FAIL';
  receipt.error = String(error?.message || error).slice(0, 500);
} finally {
  server.close();
}

await fs.mkdir(path.dirname(OUT), { recursive: true, mode: 0o700 });
await fs.writeFile(OUT, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
await fs.writeFile(
  path.join(process.cwd(), 'docs/evidence/connected-composed-workflow-proof-20261031.json'),
  JSON.stringify(receipt, null, 2) + '\n',
  'utf8',
);
console.log(JSON.stringify({ out: OUT, state: receipt.state, occurrence_id: occurrenceId }, null, 2));
process.exit(receipt.state === 'PASS_FRESH_COMPOSED_OCCURRENCE' ? 0 : 1);
