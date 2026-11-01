/**
 * Connected local workflow bindings for Ibal hotfolder/workspace owners.
 *
 * Produces durable coordinationReader / applyReturn / wakeConsumer /
 * qualifiedHost for loopback use. Does NOT grant BINS write authority,
 * OS sandbox elevation, or fixture-only PROFILE promotion.
 *
 * Inbox receiving-product consumer (not a local wake file):
 *   Vado42-chris/xi-io-Inbox@8b5960c3 scripts/run-internal-babysit-consumer.mjs
 *   hotfolder ready → returns/{wake_id}.return.json
 *
 * CLI pinned surface (89b9c418): work-packet continue runs deterministic
 * acceptance from the admitted packet; performAdmittedStep is null unless
 * --acceptance-only (noop). Host mutation via continue alone is
 * CLI_TASK_SURFACE_MISSING — owner: Vado42-chris/xi-io-cli local-work-packet.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';

const digest = (value) =>
  createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function fail(code, detail = null) {
  const error = Object.assign(new Error(code), { code });
  if (detail !== null) error.detail = detail;
  return error;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await fs.open(tmp, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
  try {
    const dir = await fs.open(path.dirname(file), 'r');
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } catch {
    // best-effort directory sync
  }
}

function bindFields(binding = {}) {
  const keys = [
    'project_id',
    'work_id',
    'assignment_ref',
    'attempt_id',
    'agent_id',
    'source_generation',
    'return_ref',
    'operation_ref',
  ];
  return Object.fromEntries(keys.map((k) => [k, binding[k] ?? null]));
}

function bindingDigest(binding = {}) {
  return digest(bindFields(binding));
}

function inputDigest(parts = {}) {
  return digest(parts);
}

/**
 * O_EXCL claim/lease — same shape as Inbox acquireRunLease, local to this module
 * (no absolute cross-repo import in deliverable runtime).
 */
async function withIdempotencyClaim(claimPath, action) {
  await fs.mkdir(path.dirname(claimPath), { recursive: true, mode: 0o700 });
  let handle;
  const token = randomUUID();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      handle = await fs.open(claimPath, 'wx', 0o600);
      const lease = {
        schema: 'xiio.ibal.idempotency-claim/v1',
        pid: process.pid,
        token,
        hostname: os.hostname(),
        acquired_at: new Date().toISOString(),
      };
      await handle.writeFile(`${JSON.stringify(lease)}\n`, 'utf8');
      await handle.sync();
      try {
        return await action();
      } finally {
        await handle.close().catch(() => {});
        const current = await readJson(claimPath);
        if (current?.token === token && current?.pid === process.pid) {
          await fs.unlink(claimPath).catch(() => {});
        }
      }
    } catch (error) {
      await handle?.close().catch(() => {});
      handle = undefined;
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readJson(claimPath);
      if (existing?.hostname === os.hostname() && existing?.pid && existing.pid !== process.pid) {
        try {
          process.kill(existing.pid, 0);
          throw fail('IDEMPOTENCY_CLAIM_HELD', { claimPath, existing });
        } catch (aliveErr) {
          if (aliveErr?.code === 'IDEMPOTENCY_CLAIM_HELD') throw aliveErr;
          // ESRCH — dead claimant; remove and retry
          await fs.unlink(claimPath).catch(() => {});
          continue;
        }
      }
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  throw fail('IDEMPOTENCY_CLAIM_EXHAUSTED', { claimPath });
}

function digestsMatch(existing, binding, parts) {
  const wantBinding = bindingDigest(binding);
  const wantInput = inputDigest(parts);
  if (existing.binding_digest !== wantBinding) return false;
  if (existing.input_digest !== wantInput) return false;
  return true;
}

/**
 * Fail-closed BINS custody client. Write remains unbound until a trusted
 * authority adapter is bound; read/version probes stay honest.
 */
export function createBinsCustodyClient({
  baseUrl = 'http://127.0.0.1:8796',
  fetchImpl = globalThis.fetch,
  authorityAdapter = null,
} = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  return {
    schema: 'xiio.bins.custody-client/v1',
    write_authority_bound: typeof authorityAdapter?.authorizeWrite === 'function',
    async health() {
      if (typeof fetchImpl !== 'function') return { state: 'UNAVAILABLE', reason: 'FETCH_UNBOUND' };
      try {
        const res = await fetchImpl(`${root}/api/bins/dataforge/health`, {
          signal: AbortSignal.timeout(2000),
        });
        const body = await res.json().catch(() => null);
        return { state: res.ok ? 'PASS' : 'FAIL', http_status: res.status, body };
      } catch (error) {
        return { state: 'UNAVAILABLE', reason: String(error?.message || error) };
      }
    },
    async writeCustody(record) {
      if (typeof authorityAdapter?.authorizeWrite !== 'function') {
        return {
          state: 'BLOCKED',
          reason: 'DATAFORGE_CUSTODY_WRITE_AUTHORITY_UNBOUND',
          hard: ['GRANT_ALONE != AUTHORITY_ADAPTER', 'HTTP_503 != WRITE_PROOF'],
        };
      }
      const admission = await authorityAdapter.authorizeWrite({
        ...record,
        operation: 'custody.put',
      });
      if (!admission || admission.admitted !== true) {
        return { state: 'DENIED', reason: 'AUTHORITY_ADAPTER_REFUSED', admission: admission || null };
      }
      if (typeof fetchImpl !== 'function') return { state: 'UNAVAILABLE', reason: 'FETCH_UNBOUND' };
      const res = await fetchImpl(`${root}/api/bins/dataforge/custody`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(admission.headers || {}) },
        body: JSON.stringify({
          ...record,
          principal_ref: record.principal_ref || record.agent_id || admission.principal_ref,
          root_ref: record.root_ref || record.workspace_root_ref || admission.workspace_root_ref,
          authority_ref: admission.authority_ref || null,
        }),
        signal: AbortSignal.timeout(5000),
      });
      const body = await res.json().catch(() => null);
      return { state: res.ok ? 'PASS' : 'FAIL', http_status: res.status, body };
    },
    async readCustody(coordinateRef) {
      if (typeof fetchImpl !== 'function') return { state: 'UNAVAILABLE', reason: 'FETCH_UNBOUND' };
      const url = `${root}/api/bins/dataforge/custody?coordinate_ref=${encodeURIComponent(coordinateRef)}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
      const body = await res.json().catch(() => null);
      if (res.status === 404) {
        return {
          state: 'NOT_FOUND',
          hard: ['UNKNOWN_COORDINATE_404 != READBACK_PROOF'],
          body,
        };
      }
      return { state: res.ok ? 'PASS' : 'FAIL', http_status: res.status, body };
    },
    async readVersion({ coordinateRef, version }) {
      if (typeof fetchImpl !== 'function') return { state: 'UNAVAILABLE', reason: 'FETCH_UNBOUND' };
      const url =
        `${root}/api/bins/dataforge/custody/version` +
        `?coordinate_ref=${encodeURIComponent(coordinateRef)}&version=${encodeURIComponent(version)}`;
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
        const body = await res.json().catch(() => null);
        if (res.status === 404) {
          return {
            state: 'NOT_FOUND',
            reason: 'VERSION_READBACK_ENDPOINT_OR_RECORD_MISSING',
            body,
          };
        }
        return { state: res.ok ? 'PASS' : 'FAIL', http_status: res.status, body };
      } catch (error) {
        return { state: 'UNAVAILABLE', reason: String(error?.message || error) };
      }
    },
  };
}

/**
 * Build connected local owners under a private state directory.
 */
export async function createConnectedLocalBindings({
  stateDir,
  projectId,
  workId = null,
  sourceGeneration = null,
  cliBin = 'xi-io-cli',
  assignmentsDir = path.join(process.env.HOME || '', '.local/state/xi-io/switchboard/assignments'),
  bins = null,
  inboxBabysitRoot = null,
} = {}) {
  if (typeof stateDir !== 'string' || !path.isAbsolute(stateDir)) throw fail('STATE_DIR_ABSOLUTE_REQUIRED');
  if (typeof projectId !== 'string' || !projectId.trim()) throw fail('PROJECT_ID_REQUIRED');

  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const st = await fs.lstat(stateDir);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) !== 0) {
    throw fail('STATE_DIR_PRIVATE_REQUIRED');
  }

  const coordinationPath = path.join(stateDir, 'coordination-snapshot.json');
  const receiptDir = path.join(stateDir, 'host-receipts');
  const returnDir = path.join(stateDir, 'returns');
  const wakeDir = path.join(stateDir, 'wakes');
  for (const dir of [receiptDir, returnDir, wakeDir]) {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  const generation =
    typeof sourceGeneration === 'string' && sourceGeneration.trim()
      ? sourceGeneration.trim()
      : `local-connected-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
  const work =
    typeof workId === 'string' && workId.trim()
      ? workId.trim()
      : randomUUID();

  const resolvedInboxRoot =
    typeof inboxBabysitRoot === 'string' && path.isAbsolute(inboxBabysitRoot)
      ? inboxBabysitRoot
      : null;

  async function loadAssignments() {
    const workers = [];
    try {
      const names = await fs.readdir(assignmentsDir);
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const row = await readJson(path.join(assignmentsDir, name));
        if (!row || row.admitted !== true) continue;
        const agent = String(row.agent_id || row.principal_ref || '').trim();
        const workUuid = String(row.work_uuid || '').trim();
        if (!agent || !workUuid) continue;
        workers.push({
          agent_id: agent,
          alias: row.operator_id || 'admitted-worker',
          specialty: 'switchboard-admitted',
          identity_evidence_class: 'SWITCHBOARD_ADMITTED',
          permission_refs: Array.isArray(row.capability) ? row.capability : [],
          assignment: {
            assignment_ref: String(row.assignment_id || name),
            work_id: workUuid,
            attempt_id: String(row.correlation_id || row.assignment_id || randomUUID()),
            source_generation: generation,
            return_ref: `local:return:${workUuid}`,
            operation_ref: 'local:connected-continue',
            depends_on: [],
          },
        });
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return workers;
  }

  let snapshot = await readJson(coordinationPath);
  if (!snapshot) {
    const workers = await loadAssignments();
    snapshot = {
      schema: 'xiio.ibal.coordination-snapshot/v1',
      project_id: projectId,
      work_id: work,
      source_generation: generation,
      quorum: null,
      workers,
      evidence_class: workers.length ? 'SWITCHBOARD_ADMITTED' : 'LOCAL_EMPTY_COORDINATION',
    };
    await writeJsonAtomic(coordinationPath, snapshot);
  }

  const coordinationReader = async ({ projectId: asked } = {}) => {
    if (asked && asked !== snapshot.project_id) throw fail('COORDINATION_PROJECT_MISMATCH', { asked, have: snapshot.project_id });
    const fresh = await readJson(coordinationPath);
    if (!fresh) throw fail('COORDINATION_SNAPSHOT_MISSING');
    snapshot = fresh;
    return structuredClone(snapshot);
  };

  const binsClient = bins || createBinsCustodyClient();

  const applyReturn = {
    async apply({ binding, result, idempotencyKey }) {
      if (!idempotencyKey) throw fail('IDEMPOTENCY_KEY_REQUIRED');
      const file = path.join(returnDir, `${digest(idempotencyKey)}.json`);
      const claimPath = `${file}.claim`;
      const parts = {
        result_ref: result?.result_ref || null,
        receipt_seed: `local:applied:${idempotencyKey}`,
      };
      return withIdempotencyClaim(claimPath, async () => {
        const existing = await readJson(file);
        if (existing) {
          if (!digestsMatch(existing, binding, parts)) {
            return {
              schema: 'xiio.ibal.apply-return/v1',
              state: 'IDEMPOTENCY_CONFLICT',
              reason: 'BINDING_OR_INPUT_DIGEST_MISMATCH',
              idempotency_key: idempotencyKey,
              existing_binding_digest: existing.binding_digest || null,
              requested_binding_digest: bindingDigest(binding),
              hard: ['WRITEJSONATOMIC != CLAIM_LOCK', 'CONFLICTING_REUSE != IDEMPOTENT_PASS'],
            };
          }
          return existing;
        }

        const value = {
          schema: 'xiio.ibal.apply-return/v1',
          state: 'RECOVERABLE_CUSTODY_PENDING',
          ...bindFields(binding),
          binding_digest: bindingDigest(binding),
          input_digest: inputDigest(parts),
          result_ref: result?.result_ref || null,
          receipt_ref: `local:applied:${idempotencyKey}`,
          applied_at: new Date().toISOString(),
          bins_custody: null,
          bins_version_qualified: false,
          bins_version_ref: null,
          bins_digest: null,
        };

        const probe = await binsClient.writeCustody({
          coordinate_ref: value.receipt_ref,
          principal_ref: binding?.agent_id || null,
          agent_id: binding?.agent_id || null,
          root_ref: binding?.workspace_root_ref || binding?.root_ref || null,
          work_ref: binding?.work_ref || null,
          payload: {
            schema: 'xiio.ibal.apply-return-custody-payload/v1',
            receipt_ref: value.receipt_ref,
            work_id: value.work_id,
            result_ref: value.result_ref,
            applied_at: value.applied_at,
          },
          source_occurrence_ref: value.receipt_ref,
        });
        value.bins_custody = probe;

        if (probe.state !== 'PASS' || !probe.body?.version_ref) {
          value.state = 'RECOVERABLE_CUSTODY_PENDING';
          value.reason = probe.reason || probe.state;
          await writeJsonAtomic(file, value);
          return value;
        }

        const versionRead = await binsClient.readVersion({
          coordinateRef: value.receipt_ref,
          version: probe.body.version_ref,
        });
        const digestValue = versionRead.body?.digest?.value || versionRead.body?.content_sha256 || null;
        const payloadOk = versionRead.body?.payload?.receipt_ref === value.receipt_ref;
        if (versionRead.state !== 'PASS' || !digestValue || !payloadOk) {
          value.state = 'RECOVERABLE_CUSTODY_PENDING';
          value.reason = 'VERSION_READBACK_UNQUALIFIED';
          value.bins_version_readback = versionRead;
          await writeJsonAtomic(file, value);
          return value;
        }

        value.state = 'APPLIED';
        value.bins_version_qualified = true;
        value.bins_version_ref = probe.body.version_ref;
        value.bins_digest = digestValue;
        value.bins_version_readback = {
          state: 'PASS',
          coordinate_ref: value.receipt_ref,
          version_ref: probe.body.version_ref,
          digest: digestValue,
        };
        await writeJsonAtomic(file, value);
        return value;
      });
    },
    async reconcile({ idempotencyKey }) {
      if (!idempotencyKey) throw fail('IDEMPOTENCY_KEY_REQUIRED');
      const file = path.join(returnDir, `${digest(idempotencyKey)}.json`);
      return (await readJson(file)) || { state: 'UNKNOWN' };
    },
  };

  async function readInboxConsumerAck(wakeId) {
    if (!resolvedInboxRoot) return null;
    const returnPath = path.join(resolvedInboxRoot, 'returns', `${wakeId}.return.json`);
    const row = await readJson(returnPath);
    if (!row || row.schema !== 'xiio.hotfolder.return.v1') return null;
    if (row.wake_id !== wakeId) return null;
    return { return_path: returnPath, return: row };
  }

  const wakeConsumer = async (wake) => {
    const wakeId = String(wake?.wake_id || '').trim();
    if (!wakeId) throw fail('WAKE_ID_REQUIRED');
    if (wake?.authority_granted === true) throw fail('WAKE_AUTHORITY_MUST_BE_FALSE');
    if (wake?.semantics && wake.semantics !== 'WAKE_ONLY') throw fail('WAKE_SEMANTICS_NOT_WAKE_ONLY');
    const file = path.join(wakeDir, `${wakeId}.json`);
    const existing = await readJson(file);
    if (!existing) {
      await writeJsonAtomic(file, {
        schema: 'xiio.ibal.wake-ack/v1',
        state: 'PENDING_CONSUMER_ACK',
        semantics: 'WAKE_ONLY',
        authority_granted: false,
        ...bindFields(wake),
        wake_id: wakeId,
        receipt_ref: wake?.receipt_ref || `local:wake:${wakeId}`,
        local_recorded_at: new Date().toISOString(),
        hard: ['LOCAL_WAKE_RECEIPT != RECEIVING_PRODUCT_CONSUMPTION'],
      });
    }
    const stored = await readJson(file);
    const consumer = await readInboxConsumerAck(wakeId);
    if (!consumer) {
      return {
        state: 'PENDING_CONSUMER_ACK',
        ...bindFields(wake),
        wake_id: wakeId,
        receipt_ref: stored.receipt_ref,
        reason: resolvedInboxRoot ? 'INBOX_CONSUMER_RETURN_MISSING' : 'INBOX_BABYSIT_ROOT_UNBOUND',
        hard: ['LOCAL_WAKE_RECEIPT != RECEIVING_PRODUCT_CONSUMPTION'],
      };
    }
    const consumed = {
      ...stored,
      state: 'CONSUMED',
      consumer_ack: {
        return_path: consumer.return_path,
        consumer: consumer.return.consumer || null,
        observed_at: consumer.return.observed_at || null,
        apply_return_state: consumer.return.apply_return_state || null,
      },
      consumed_at: new Date().toISOString(),
    };
    await writeJsonAtomic(file, consumed);
    return {
      state: 'CONSUMED',
      ...bindFields(wake),
      wake_id: wakeId,
      receipt_ref: stored.receipt_ref,
      consumer_ack: consumed.consumer_ack,
    };
  };

  function runCli(args, { timeoutMs = 120000, input = null } = {}) {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(cliBin, args, {
          env: { ...process.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        resolve({ ok: false, exit_code: null, stdout: '', stderr: String(error?.message || error) });
        return;
      }
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(payload);
      };
      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }, timeoutMs);
      child.stdout.on('data', (chunk) => {
        if (Buffer.byteLength(stdout) < 65536) stdout = (stdout + chunk.toString()).slice(0, 65536);
      });
      child.stderr.on('data', (chunk) => {
        if (Buffer.byteLength(stderr) < 65536) stderr = (stderr + chunk.toString()).slice(0, 65536);
      });
      child.on('error', (error) => finish({ ok: false, exit_code: null, stdout, stderr: String(error?.message || error) }));
      child.on('close', (code) => finish({ ok: code === 0, exit_code: code, stdout, stderr }));
      if (input !== null) child.stdin.end(String(input));
      else child.stdin.end();
    });
  }

  const cliTaskSurface = {
    state: 'CLI_TASK_SURFACE_MISSING',
    owner: 'Vado42-chris/xi-io-cli',
    function: 'dispatchAcceptedWork.performAdmittedStep',
    pinned_revision: '89b9c418f6e161d9864bf891fd665b6a18f00dd2',
    note: 'work-packet continue defaults performAdmittedStep=null; only admitted acceptance_command runs. Host mutation must be supplied by packet acceptance proving an admitted effect, or a future CLI admitted-step flag — do not invent a general task engine here.',
    smallest_next_repair: 'Expose an explicit, policy-gated admitted-step runner on work-packet continue that executes packet.admitted_step only, never model-supplied commands.',
  };

  const qualifiedHost = {
    profile: 'LOCAL_LOOPBACK_CLI',
    sourceGeneration: generation,
    cli_task_surface: cliTaskSurface,
    async qualify({ binding, readOnly = false }) {
      if (!binding?.work_id || !binding?.attempt_id || !binding?.agent_id) throw fail('BINDING_INCOMPLETE');
      if (binding.source_generation && binding.source_generation !== generation) {
        return { state: 'DENIED', reason: 'SOURCE_GENERATION_MISMATCH', ...bindFields(binding) };
      }
      if (!readOnly) {
        try {
          await fs.access(cliBin, fsConstants.X_OK);
        } catch {
          const probe = await runCli(['version'], { timeoutMs: 5000 });
          if (!probe.ok) {
            return { state: 'DENIED', reason: 'CLI_UNAVAILABLE', ...bindFields(binding) };
          }
        }
      }
      return {
        state: 'ALLOWED',
        ...bindFields(binding),
        admission_ref: `local:loopback:${digest(binding.attempt_id)}`,
        read_only: Boolean(readOnly),
      };
    },
    async request({ binding, idempotencyKey, workspaceRoot = null, utterance = 'continue', admittedAcceptance = null } = {}) {
      if (!idempotencyKey) throw fail('IDEMPOTENCY_KEY_REQUIRED');
      const file = path.join(receiptDir, `${digest(idempotencyKey)}.json`);
      const claimPath = `${file}.claim`;
      const parts = {
        workspace_root: workspaceRoot || null,
        utterance: workspaceRoot ? utterance : null,
        admitted_acceptance: admittedAcceptance || null,
      };
      return withIdempotencyClaim(claimPath, async () => {
        const existing = await readJson(file);
        if (existing) {
          if (!digestsMatch(existing, binding, parts)) {
            return {
              schema: 'xiio.ibal.qualified-host-receipt/v1',
              state: 'IDEMPOTENCY_CONFLICT',
              reason: 'BINDING_OR_INPUT_DIGEST_MISMATCH',
              hard: ['CONFLICTING_REUSE != IDEMPOTENT_PASS'],
            };
          }
          return existing;
        }

        // Missing workspace: version probe must never become completed work.
        if (!workspaceRoot) {
          const probe = await runCli(['version'], { timeoutMs: 5000 });
          let parsed = null;
          try {
            parsed = JSON.parse(probe.stdout);
          } catch {
            parsed = null;
          }
          const result = {
            schema: 'xiio.ibal.qualified-host-receipt/v1',
            state: 'VERSION_PROBE_ONLY',
            reason: 'WORKSPACE_ROOT_REQUIRED_FOR_TASK_COMPLETION',
            ...bindFields(binding),
            binding_digest: bindingDigest(binding),
            input_digest: inputDigest(parts),
            result_ref: `local:result:${idempotencyKey}`,
            identity_evidence_class: 'LOCAL_LOOPBACK_CLI',
            inference: 'VERSION_PROBE_ONLY',
            utterance: null,
            cli: { exit_code: probe.exit_code, parsed, stderr: probe.stderr || null },
            source_generation: generation,
            hard: ['CLI_VERSION_EXIT_0 != TASK_COMPLETE', 'MISSING_WORKSPACE != COMPLETED_WORK'],
          };
          await writeJsonAtomic(file, result);
          return result;
        }

        const statusProbe = await runCli(['work-packet', 'status', '--root', workspaceRoot], { timeoutMs: 30000 });
        let statusParsed = null;
        try {
          statusParsed = JSON.parse(statusProbe.stdout);
        } catch {
          statusParsed = null;
        }
        if (!statusParsed || statusParsed.state === 'MISSING_BINDING' || !statusParsed.packet_id) {
          const result = {
            schema: 'xiio.ibal.qualified-host-receipt/v1',
            state: 'MISSING_BINDING',
            reason: 'NO_ACCEPTED_WORK_PACKET',
            ...bindFields(binding),
            binding_digest: bindingDigest(binding),
            input_digest: inputDigest(parts),
            result_ref: `local:result:${idempotencyKey}`,
            identity_evidence_class: 'LOCAL_LOOPBACK_CLI',
            inference: 'CLI_WORK_PACKET',
            utterance,
            cli: { exit_code: statusProbe.exit_code, parsed: statusParsed, stderr: statusProbe.stderr || null },
            source_generation: generation,
            hard: ['EXIT_0 != TASK_COMPLETE', 'ACCEPTED_PACKET_REQUIRED'],
          };
          await writeJsonAtomic(file, result);
          return result;
        }

        // Acceptance comes from admitted packet only — never from model-supplied commands.
        if (admittedAcceptance != null) {
          const packetCmd = statusParsed.acceptance_command;
          const admitted = Array.isArray(admittedAcceptance) ? admittedAcceptance : [String(admittedAcceptance)];
          const same =
            Array.isArray(packetCmd) &&
            packetCmd.length === admitted.length &&
            packetCmd.every((x, i) => String(x) === String(admitted[i]));
          if (!same) {
            const result = {
              schema: 'xiio.ibal.qualified-host-receipt/v1',
              state: 'ACCEPTANCE_BOUNDARY_REFUSED',
              reason: 'MODEL_OR_EXTERNAL_ACCEPTANCE_NOT_ADMITTED',
              ...bindFields(binding),
              binding_digest: bindingDigest(binding),
              input_digest: inputDigest(parts),
              result_ref: `local:result:${idempotencyKey}`,
              packet_id: statusParsed.packet_id,
              hard: ['MODEL_ACCEPTANCE_COMMAND != ADMITTED_PACKET'],
            };
            await writeJsonAtomic(file, result);
            return result;
          }
        }

        const cont = await runCli(['work-packet', 'continue', '--root', workspaceRoot], { timeoutMs: 180000 });
        let parsed = null;
        try {
          parsed = JSON.parse(cont.stdout);
        } catch {
          parsed = null;
        }

        const acceptancePass = parsed?.acceptance?.state === 'PASS' || (parsed?.state === 'PASS' && parsed?.reason === 'ALREADY_COMPLETE');
        const taskComplete =
          parsed &&
          (parsed.state === 'PASS' || parsed.reason === 'ALREADY_COMPLETE') &&
          acceptancePass &&
          parsed.packet_id === statusParsed.packet_id;

        const result = {
          schema: 'xiio.ibal.qualified-host-receipt/v1',
          state: taskComplete ? 'COMPLETE' : cont.ok && parsed ? 'FAILED_ACCEPTANCE_OR_DISPATCH' : 'FAILED',
          ...bindFields(binding),
          binding_digest: bindingDigest(binding),
          input_digest: inputDigest(parts),
          result_ref: `local:result:${idempotencyKey}`,
          identity_evidence_class: 'LOCAL_LOOPBACK_CLI',
          inference: 'CLI_WORK_PACKET',
          utterance,
          packet_id: statusParsed.packet_id || null,
          acceptance: parsed?.acceptance || null,
          cli_task_surface: cliTaskSurface,
          cli: { exit_code: cont.exit_code, parsed, stderr: cont.stderr || null },
          source_generation: generation,
          hard: [
            'EXIT_0 != TASK_COMPLETE',
            'ADMITTED_ACCEPTANCE_REQUIRED',
            'CLI_TASK_SURFACE_MISSING_FOR_HOST_MUTATION_WITHOUT_PACKET_ACCEPTANCE',
          ],
        };
        await writeJsonAtomic(file, result);
        return result;
      });
    },
    async reconcile({ idempotencyKey }) {
      if (!idempotencyKey) throw fail('IDEMPOTENCY_KEY_REQUIRED');
      const file = path.join(receiptDir, `${digest(idempotencyKey)}.json`);
      return (await readJson(file)) || { state: 'UNKNOWN' };
    },
  };

  return {
    schema: 'xiio.ibal.connected-local-bindings/v1',
    state: 'BOUND_LOCAL',
    project_id: projectId,
    work_id: snapshot.work_id,
    source_generation: generation,
    state_dir: stateDir,
    inbox_babysit_root: resolvedInboxRoot,
    coordinationReader,
    applyReturn,
    wakeConsumer,
    qualifiedHost,
    bins: binsClient,
    async refreshCoordinationFromSwitchboard() {
      const workers = await loadAssignments();
      snapshot = {
        ...snapshot,
        workers,
        refreshed_at: new Date().toISOString(),
        evidence_class: workers.length ? 'SWITCHBOARD_ADMITTED' : 'LOCAL_EMPTY_COORDINATION',
      };
      await writeJsonAtomic(coordinationPath, snapshot);
      return snapshot;
    },
  };
}
