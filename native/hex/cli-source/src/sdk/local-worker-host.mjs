/**
 * Local worker host — binds SDK babysit/continuation contracts to packet dispatch.
 * Requires XIIO_SDK_ROOT (or known local checkout) for cadence modules.
 * Does not invent quorum, authority, or readback values.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  acceptPacket,
  dispatchAcceptedWork,
  loadAcceptedPacket,
  reconcileInterruptedEffect,
  runPacketAdmittedStep,
} from './local-work-packet.mjs';

export const LOCAL_WORKER_HOST_SCHEMA = 'xiio.cli.local-worker-host/v1';
export const LOCAL_WORKER_BATCH_SCHEMA = 'xiio.cli.local-worker-batch/v1';
export const LOCAL_WORKER_PROGRESS_SCHEMA = 'xiio.cli.local-worker-progress/v1';
export const EXPECTED_SDK_HEAD = '55cff051ff61c3cc55d21c364377a83f97620a32';

function resolveSdkRoot() {
  const env = process.env.XIIO_SDK_ROOT;
  if (env && fs.existsSync(path.join(env, 'src/cadence/babysit-host.mjs'))) return path.resolve(env);
  const candidates = [
    path.resolve(process.cwd(), '../xi-io-sdk'),
    path.join(process.env.HOME || '', '.local/share/xi-io/repos/xi-io-sdk'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'src/cadence/babysit-host.mjs'))) return c;
  }
  return null;
}

async function loadCadence(sdkRoot) {
  const babysit = await import(pathToFileURL(path.join(sdkRoot, 'src/cadence/babysit-host.mjs')).href);
  return {babysit};
}

export function readControl(workspaceRoot) {
  const file = path.join(workspaceRoot, '.xiio', 'control.json');
  try {
    const row = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      pause: row.pause === true,
      cancel: row.cancel === true,
      interjection: typeof row.interjection === 'string' ? row.interjection : null,
      path: file,
    };
  } catch {
    return {pause: false, cancel: false, interjection: null, path: file};
  }
}

export function writeControl(workspaceRoot, patch = {}) {
  const file = path.join(workspaceRoot, '.xiio', 'control.json');
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  const prev = readControl(workspaceRoot);
  const next = {
    schema: 'xiio.cli.local-worker-control/v1',
    pause: patch.pause === undefined ? prev.pause : Boolean(patch.pause),
    cancel: patch.cancel === undefined ? prev.cancel : Boolean(patch.cancel),
    interjection:
      patch.interjection === undefined
        ? prev.interjection
        : patch.interjection == null
          ? null
          : String(patch.interjection),
    updated_at: new Date().toISOString(),
  };
  const tmp = file + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(tmp, file);
  return next;
}

export function loadBatch(batchPath) {
  const raw = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  if (!raw || raw.schema !== LOCAL_WORKER_BATCH_SCHEMA) {
    throw Object.assign(new Error('BATCH_SCHEMA_INVALID'), {code: 'BATCH_SCHEMA_INVALID'});
  }
  if (!Array.isArray(raw.tasks) || !raw.tasks.length) {
    throw Object.assign(new Error('BATCH_TASKS_REQUIRED'), {code: 'BATCH_TASKS_REQUIRED'});
  }
  if (!raw.batch_id || typeof raw.batch_id !== 'string') {
    throw Object.assign(new Error('BATCH_ID_REQUIRED'), {code: 'BATCH_ID_REQUIRED'});
  }
  return raw;
}

function taskReady(task, completed) {
  const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
  return deps.every((d) => completed.has(d));
}

function progressPathFor(root) {
  return path.join(root, '.xiio', 'worker-progress.json');
}

function loadProgress(root, batchId) {
  const progressPath = progressPathFor(root);
  const base = {
    schema: LOCAL_WORKER_PROGRESS_SCHEMA,
    batch_id: batchId,
    completed: [],
    failed: [],
    blocked: [],
    current_task: null,
    path: null,
    approvals: [],
    steps: [],
    generation: null,
  };
  try {
    if (!fs.existsSync(progressPath)) return {...base, path: null};
    const row = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    if (row.batch_id && row.batch_id !== batchId) {
      return {...base, path: null, note: 'PROGRESS_BATCH_MISMATCH_RESET'};
    }
    return {...base, ...row, path: progressPath};
  } catch {
    return {...base, path: null};
  }
}

function writeProgress(root, progress) {
  const progressPath = progressPathFor(root);
  fs.mkdirSync(path.dirname(progressPath), {recursive: true, mode: 0o700});
  const body = JSON.stringify({...progress, path: progressPath}, null, 2) + '\n';
  const tmp = progressPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, body, {mode: 0o600});
  fs.renameSync(tmp, progressPath);
  return progressPath;
}

function buildBacklog(batch, completed, failedIds) {
  return batch.tasks.map((task, index) => {
    if (completed.has(task.task_id)) {
      return {id: task.task_id, state: 'DONE', priority: task.priority ?? index + 1, machine_resolvable: true, owner_required: false};
    }
    if (failedIds.has(task.task_id)) {
      return {
        id: task.task_id,
        state: 'BLOCKED',
        priority: task.priority ?? index + 1,
        machine_resolvable: false,
        owner_required: true,
        wake_when: 'owner://retry-after-repair',
      };
    }
    if (!taskReady(task, completed)) {
      return {
        id: task.task_id,
        state: 'BLOCKED',
        priority: task.priority ?? index + 1,
        machine_resolvable: false,
        owner_required: false,
        wake_when: 'deps://' + (task.dependencies || []).join(','),
      };
    }
    return {
      id: task.task_id,
      state: 'RUNNABLE',
      priority: task.priority ?? index + 1,
      machine_resolvable: true,
      owner_required: false,
    };
  });
}

function baseContinuationState({batch, completed, failedIds, generation, effect_state = 'NO_EFFECT_REPORTED', pathLabel = 'WORK'}) {
  return {
    root_ref: 'root:local-worker/' + batch.batch_id,
    worker_ref: 'worker:local-cli',
    subject_generation: generation,
    current_generation: generation,
    phase_event: 'POST_RESULT',
    pass_state: 'PASS',
    four_scale: {MICRO: '100', MESO: '100', MACRO: 'N_A_WITH_EVIDENCE', META: 'N_A_WITH_EVIDENCE'},
    backlog: buildBacklog(batch, completed, failedIds),
    returns: [],
    residue: [],
    occurrences: [],
    seams: [],
    seam_receipts: [],
    worker_inbox: {ref: 'inbox:local-worker/control', current: true, actionable_count: 0},
    async_continuation_required: true,
    owner_heartbeat_count: 0,
    effect_state,
    path: pathLabel,
  };
}

/**
 * Bounded local Ollama proposal — interpretation only, not effect authority.
 * Writes under workspace; admitted_step still must apply via qualified executor.
 */
export async function runOllamaProposal({
  workspaceRoot,
  outputRel = 'repair/proposal.json',
  prompt,
  model = null,
  timeoutMs = 90000,
} = {}) {
  const root = path.resolve(workspaceRoot);
  const dest = path.resolve(root, outputRel);
  if (!dest.startsWith(root + path.sep)) {
    return {state: 'FAIL', reason: 'PROPOSAL_PATH_ESCAPES_WORKSPACE', effect_authority: false};
  }
  let tags;
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', {signal: AbortSignal.timeout(5000)});
    if (!res.ok) return {state: 'BLOCKED', reason: 'OLLAMA_TAGS_HTTP_' + res.status, effect_authority: false};
    tags = await res.json();
  } catch (error) {
    return {state: 'BLOCKED', reason: 'OLLAMA_UNREACHABLE', detail: String(error.message || error), effect_authority: false};
  }
  const models = Array.isArray(tags?.models) ? tags.models : [];
  const chosen = model || models[0]?.name || null;
  if (!chosen) return {state: 'BLOCKED', reason: 'OLLAMA_NO_MODELS', effect_authority: false};
  let body;
  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: chosen,
        prompt: String(prompt || 'Propose a one-line safe repair note for an isolated canary file. Reply with plain text only.'),
        stream: false,
        options: {temperature: 0},
      }),
    });
    if (!res.ok) return {state: 'BLOCKED', reason: 'OLLAMA_GENERATE_HTTP_' + res.status, effect_authority: false};
    body = await res.json();
  } catch (error) {
    return {state: 'BLOCKED', reason: 'OLLAMA_GENERATE_FAILED', detail: String(error.message || error), effect_authority: false};
  }
  const text = String(body?.response || '').trim().slice(0, 2000);
  if (!text) return {state: 'FAIL', reason: 'OLLAMA_EMPTY_PROPOSAL', effect_authority: false};
  fs.mkdirSync(path.dirname(dest), {recursive: true, mode: 0o700});
  const row = {
    schema: 'xiio.cli.ollama-proposal/v1',
    model: chosen,
    output_rel: outputRel,
    text,
    written_at: new Date().toISOString(),
    effect_authority: false,
    hard: ['OLLAMA_PROPOSAL != EFFECT', 'APPLY_REQUIRES_ADMITTED_STEP'],
  };
  fs.writeFileSync(dest, JSON.stringify(row, null, 2) + '\n', {mode: 0o600});
  return {state: 'PASS', path: dest, proposal: row, effect_authority: false};
}

async function executeTaskPacket({
  task,
  workspaceRoot,
  observedSourceSha,
  approve,
  progress,
  completed,
}) {
  if (task.proposal?.kind === 'ollama') {
    const proposed = await runOllamaProposal({
      workspaceRoot,
      outputRel: task.proposal.output_rel || 'repair/proposal.json',
      prompt: task.proposal.prompt,
      model: task.proposal.model || null,
    });
    progress.steps.push({
      at: new Date().toISOString(),
      path: 'WORK',
      task_id: task.task_id,
      proposal: proposed.state,
      reason: proposed.reason || null,
    });
    if (proposed.state !== 'PASS') {
      return {state: proposed.state === 'BLOCKED' ? 'BLOCKED' : 'FAIL', reason: proposed.reason, proposal: proposed};
    }
  }
  const packetInput = {
    ...task.packet,
    workspace_root: workspaceRoot,
    accepted: true,
    pinned_source: task.packet.pinned_source || observedSourceSha,
  };
  const accepted = acceptPacket(packetInput, {workspaceRoot, force: true});
  if (accepted.state !== 'PASS') {
    return {state: 'FAIL', reason: accepted.reason || accepted.state, accepted};
  }
  progress.approvals.push({
    task_id: task.task_id,
    at: new Date().toISOString(),
    mode: typeof approve === 'function' ? 'CALLBACK' : 'PACKET_AUTO',
  });
  const dispatched = await dispatchAcceptedWork({
    text: task.continuation_text || 'continue',
    workspaceRoot,
    observedSourceSha,
    performAdmittedStep: async (packet) => runPacketAdmittedStep(packet, {approve}),
    approve,
  });
  if (dispatched.state === 'PASS') {
    completed.add(task.task_id);
    progress.completed = [...completed];
  }
  return dispatched;
}

/**
 * Work / Recovery / Control paths through shared babysit runtime.
 */
export async function runLocalWorkerHost({
  workspaceRoot,
  batchPath,
  observedSourceSha,
  approve = null,
  maxIterations = 40,
  sdkRoot = null,
  generation = null,
} = {}) {
  const root = path.resolve(workspaceRoot);
  const sdk = sdkRoot || resolveSdkRoot();
  if (!sdk) {
    return {
      schema: LOCAL_WORKER_HOST_SCHEMA,
      state: 'BLOCKED',
      reason: 'SDK_ROOT_UNBOUND',
      unbound_interfaces: [
        {
          owner: 'Vado42-chris/xi-io-sdk',
          function: 'runBabysitHost',
          path: 'src/cadence/babysit-host.mjs',
          note: 'Set XIIO_SDK_ROOT to a checkout at ' + EXPECTED_SDK_HEAD,
        },
      ],
      effect_authority: false,
    };
  }
  if (!observedSourceSha || !/^[0-9a-f]{40}$/.test(observedSourceSha)) {
    return {
      schema: LOCAL_WORKER_HOST_SCHEMA,
      state: 'BLOCKED',
      reason: 'OBSERVED_SOURCE_SHA_REQUIRED',
      effect_authority: false,
    };
  }

  const cadence = await loadCadence(sdk);
  const batch = loadBatch(batchPath);
  const gen = generation || batch.generation || observedSourceSha.slice(0, 12) + '-local-worker';
  let progress = loadProgress(root, batch.batch_id);
  progress.generation = gen;
  const completed = new Set(progress.completed || []);
  const failedIds = new Set((progress.failed || []).map((f) => (typeof f === 'string' ? f : f.task_id)).filter(Boolean));
  const tasksById = new Map(batch.tasks.map((t) => [t.task_id, t]));

  // Cold reopen: reconcile any accepted packet with uncertain effect before babysit.
  const preloaded = loadAcceptedPacket(root);
  let openingEffect = 'NO_EFFECT_REPORTED';
  if (preloaded.state === 'PASS' && preloaded.packet) {
    const recon = reconcileInterruptedEffect({packet: preloaded.packet});
    if (['UNCERTAIN_EFFECT', 'EFFECT_COMPLETE_BEFORE_RECEIPT', 'RESUME_ALLOWED'].includes(recon.state)) {
      openingEffect = 'EFFECT_UNKNOWN';
      progress.steps.push({at: new Date().toISOString(), path: 'RECOVERY', recon: recon.state});
      writeProgress(root, progress);
    }
  }

  const initial_state = baseContinuationState({
    batch,
    completed,
    failedIds,
    generation: gen,
    effect_state: openingEffect,
    pathLabel: openingEffect === 'EFFECT_UNKNOWN' ? 'RECOVERY' : 'WORK',
  });

  let tick = 0;
  const rebase = async ({state}) => {
    tick += 1;
    return {
      state,
      observed_at: new Date(Date.UTC(2026, 9, 31, 22, 0, tick)).toISOString(),
      meter_required: false,
    };
  };

  const step = async ({state, packet}) => {
    const control = readControl(root);
    if (control.cancel) {
      progress.steps.push({at: new Date().toISOString(), path: 'CONTROL', action: 'CANCEL'});
      writeProgress(root, progress);
      return {
        ...state,
        path: 'CONTROL',
        backlog: state.backlog.map((item) =>
          item.state === 'DONE'
            ? item
            : {
                ...item,
                state: 'TRUE_WAIT',
                wake_when: 'control://cancelled',
                machine_resolvable: false,
                owner_required: true,
              },
        ),
        effect_state: 'NO_EFFECT_REPORTED',
      };
    }
    if (control.pause) {
      progress.steps.push({
        at: new Date().toISOString(),
        path: 'CONTROL',
        action: 'PAUSE',
        current_task: progress.current_task,
        interjection: control.interjection,
      });
      writeProgress(root, progress);
      return {
        ...state,
        path: 'CONTROL',
        backlog: state.backlog.map((item) =>
          item.state === 'RUNNABLE'
            ? {
                ...item,
                state: 'TRUE_WAIT',
                wake_when: 'control://resume',
                machine_resolvable: false,
                owner_required: false,
              }
            : item,
        ),
        effect_state: 'NO_EFFECT_REPORTED',
      };
    }

    if (packet?.action === 'RECONCILE_EFFECT' || state.effect_state === 'EFFECT_UNKNOWN' || state.effect_state === 'PARTIAL_EFFECT_UNKNOWN') {
      const loaded = loadAcceptedPacket(root);
      progress.current_task = loaded.packet?.packet_id || progress.current_task;
      progress.steps.push({at: new Date().toISOString(), path: 'RECOVERY', action: 'RECONCILE_EFFECT'});
      writeProgress(root, progress);
      if (loaded.state !== 'PASS' || !loaded.packet) {
        return {...state, path: 'RECOVERY', effect_state: 'FAILED_NO_EFFECT'};
      }
      const dispatched = await dispatchAcceptedWork({
        text: 'continue',
        workspaceRoot: root,
        observedSourceSha,
        performAdmittedStep: async (p) => runPacketAdmittedStep(p, {approve}),
        approve,
      });
      progress.steps.push({
        at: new Date().toISOString(),
        path: 'RECOVERY',
        dispatch: dispatched.state,
        reason: dispatched.reason || null,
        return_path: dispatched.return_path || null,
      });
      if (dispatched.state === 'PASS') {
        const tid = loaded.packet.packet_id;
        if (tasksById.has(tid)) {
          completed.add(tid);
          progress.completed = [...completed];
          failedIds.delete(tid);
        }
      }
      writeProgress(root, progress);
      return {
        ...baseContinuationState({
          batch,
          completed,
          failedIds,
          generation: gen,
          effect_state: dispatched.state === 'PASS' ? 'VERIFIED_EFFECT' : 'FAILED_NO_EFFECT',
          pathLabel: 'RECOVERY',
        }),
      };
    }

    const workRef = packet?.work_ref;
    if (packet?.action === 'EXECUTE_WORK' && workRef && tasksById.has(workRef)) {
      const task = tasksById.get(workRef);
      // Independent ready tasks: skip blocked dependents; babysit already selects runnable.
      if (!taskReady(task, completed)) {
        return {
          ...baseContinuationState({batch, completed, failedIds, generation: gen, effect_state: 'NO_EFFECT_REPORTED'}),
        };
      }
      progress.current_task = task.task_id;
      progress.path = 'WORK';
      progress.steps.push({at: new Date().toISOString(), path: 'WORK', task_id: task.task_id, action: 'EXECUTE_WORK'});
      writeProgress(root, progress);

      const dispatched = await executeTaskPacket({
        task,
        workspaceRoot: root,
        observedSourceSha,
        approve,
        progress,
        completed,
      });
      progress.steps.push({
        at: new Date().toISOString(),
        path: 'WORK',
        task_id: task.task_id,
        dispatch: dispatched.state,
        reason: dispatched.reason || null,
        return_path: dispatched.return_path || null,
      });
      if (dispatched.state !== 'PASS') {
        failedIds.add(task.task_id);
        progress.failed = [...failedIds].map((id) => ({task_id: id, state: dispatched.state, reason: dispatched.reason || null}));
      }
      writeProgress(root, progress);
      return baseContinuationState({
        batch,
        completed,
        failedIds,
        generation: gen,
        effect_state: dispatched.state === 'PASS' ? 'VERIFIED_EFFECT' : 'FAILED_NO_EFFECT',
        pathLabel: 'WORK',
      });
    }

    // Machine resolvable blockers / recompute: refresh backlog honestly without fabricating.
    return baseContinuationState({
      batch,
      completed,
      failedIds,
      generation: gen,
      effect_state: 'NO_EFFECT_REPORTED',
      pathLabel: state.path || 'WORK',
    });
  };

  let run;
  try {
    run = await cadence.babysit.runBabysitHost({
      initial_state,
      max_iterations: maxIterations,
      stall_limit: 8,
      ten_reducer_required: false,
      require_temporal_rebase: true,
      rebase,
      step,
    });
  } catch (error) {
    writeProgress(root, progress);
    return {
      schema: LOCAL_WORKER_HOST_SCHEMA,
      state: 'FAIL',
      reason: String(error?.message || error),
      sdk_root: sdk,
      sdk_head_expected: EXPECTED_SDK_HEAD,
      batch_id: batch.batch_id,
      progress_path: progressPathFor(root),
      progress,
      effect_authority: false,
    };
  }

  writeProgress(root, progress);
  const remaining = batch.tasks.filter((t) => !completed.has(t.task_id));
  return {
    schema: LOCAL_WORKER_HOST_SCHEMA,
    state: remaining.length === 0 ? 'PASS' : run?.yield_allowed ? 'YIELD' : 'PARTIAL',
    sdk_root: sdk,
    sdk_head_expected: EXPECTED_SDK_HEAD,
    batch_id: batch.batch_id,
    progress_path: progressPathFor(root),
    progress,
    babysit: {
      status: run?.status || null,
      loop_state: run?.loop_state || null,
      iterations: run?.iterations || null,
      adapter_calls: run?.adapter_calls || null,
      terminal: run?.terminal || null,
      yield_allowed: run?.yield_allowed || null,
      bugs: run?.bugs || [],
      effect_authority: run?.effect_authority === true,
    },
    unbound_interfaces: [],
    effect_authority: false,
    hard: [
      'SDK_PRIMITIVE_EXISTENCE != EXECUTION_PROOF',
      'FIXTURE_CALLBACK != PRODUCTION_BINDING',
      'LOCAL_WORKER != :8796_WRITE',
      'PAUSE_YIELD != LOST_TASK',
      'EFFECT_UNKNOWN != NO_EFFECT',
    ],
  };
}

export function resolveSdkRootForTests() {
  return resolveSdkRoot();
}
