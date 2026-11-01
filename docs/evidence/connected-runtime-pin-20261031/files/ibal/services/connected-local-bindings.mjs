/**
 * Connected local workflow bindings for Ibal hotfolder/workspace owners.
 *
 * Produces real durable coordinationReader / applyReturn / wakeConsumer /
 * qualifiedHost.reconcile for loopback use. Does NOT grant BINS write authority,
 * OS sandbox elevation, or fixture-only PROFILE promotion.
 *
 * Inbox WAKE/RETURN pattern provenance:
 *   Vado42-chris/xi-io-Inbox@8b5960c3 scripts/run-internal-babysit-consumer.mjs
 * CLI effect path (optional): installed xi-io-cli local-work-packet continue.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';

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

  const applyReturn = {
    async apply({ binding, result, idempotencyKey }) {
      if (!idempotencyKey) throw fail('IDEMPOTENCY_KEY_REQUIRED');
      const file = path.join(returnDir, `${digest(idempotencyKey)}.json`);
      const existing = await readJson(file);
      if (existing) return existing;
      const value = {
        schema: 'xiio.ibal.apply-return/v1',
        state: 'APPLIED',
        ...bindFields(binding),
        result_ref: result?.result_ref || null,
        receipt_ref: `local:applied:${idempotencyKey}`,
        applied_at: new Date().toISOString(),
        bins_custody: null,
      };
      if (bins) {
        const probe = await bins.writeCustody({
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
        if (probe.state === 'PASS') {
          value.bins_version_qualified = true;
          value.bins_version_ref = probe.body?.version_ref || null;
        }
      }
      await writeJsonAtomic(file, value);
      return value;
    },
    async reconcile({ idempotencyKey }) {
      if (!idempotencyKey) throw fail('IDEMPOTENCY_KEY_REQUIRED');
      const file = path.join(returnDir, `${digest(idempotencyKey)}.json`);
      return (await readJson(file)) || { state: 'UNKNOWN' };
    },
  };

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
        state: 'CONSUMED',
        semantics: 'WAKE_ONLY',
        authority_granted: false,
        ...bindFields(wake),
        wake_id: wakeId,
        receipt_ref: wake?.receipt_ref || `local:wake:${wakeId}`,
        consumed_at: new Date().toISOString(),
      });
    }
    const stored = await readJson(file);
    return { state: 'CONSUMED', ...bindFields(wake), wake_id: wakeId, receipt_ref: stored.receipt_ref };
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

  const qualifiedHost = {
    profile: 'LOCAL_LOOPBACK_CLI',
    sourceGeneration: generation,
    async qualify({ binding, readOnly = false }) {
      if (!binding?.work_id || !binding?.attempt_id || !binding?.agent_id) throw fail('BINDING_INCOMPLETE');
      if (binding.source_generation && binding.source_generation !== generation) {
        return { state: 'DENIED', reason: 'SOURCE_GENERATION_MISMATCH', ...bindFields(binding) };
      }
      // Side-effect free: confirm CLI binary exists when not read-only path only.
      if (!readOnly) {
        try {
          await fs.access(cliBin, fsConstants.X_OK);
        } catch {
          // PATH-resolved binaries may not be absolute
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
    async request({ binding, idempotencyKey, workspaceRoot = null, utterance = 'continue' }) {
      if (!idempotencyKey) throw fail('IDEMPOTENCY_KEY_REQUIRED');
      const file = path.join(receiptDir, `${digest(idempotencyKey)}.json`);
      const existing = await readJson(file);
      if (existing) return existing;
      const args = workspaceRoot
        ? ['work-packet', 'continue', '--root', workspaceRoot]
        : ['version'];
      const probe = await runCli(args, { timeoutMs: 180000, input: workspaceRoot ? null : null });
      let parsed = null;
      try {
        parsed = JSON.parse(probe.stdout);
      } catch {
        parsed = null;
      }
      const result = {
        schema: 'xiio.ibal.qualified-host-receipt/v1',
        state: probe.ok ? 'COMPLETE' : 'FAILED',
        ...bindFields(binding),
        result_ref: `local:result:${idempotencyKey}`,
        identity_evidence_class: 'LOCAL_LOOPBACK_CLI',
        inference: workspaceRoot ? 'CLI_WORK_PACKET' : 'VERSION_PROBE_ONLY',
        utterance: workspaceRoot ? utterance : null,
        cli: { exit_code: probe.exit_code, parsed, stderr: probe.stderr || null },
        source_generation: generation,
      };
      await writeJsonAtomic(file, result);
      return result;
    },
    async reconcile({ idempotencyKey }) {
      if (!idempotencyKey) throw fail('IDEMPOTENCY_KEY_REQUIRED');
      const file = path.join(receiptDir, `${digest(idempotencyKey)}.json`);
      return (await readJson(file)) || { state: 'UNKNOWN' };
    },
  };

  const binsClient = bins || createBinsCustodyClient();

  return {
    schema: 'xiio.ibal.connected-local-bindings/v1',
    state: 'BOUND_LOCAL',
    project_id: projectId,
    work_id: snapshot.work_id,
    source_generation: generation,
    state_dir: stateDir,
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
