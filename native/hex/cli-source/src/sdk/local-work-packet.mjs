// Local CLI adopter for an explicitly accepted work packet.
// Recovers SDK continuation/babysit *contracts* as projection only — this module
// does not invent ACK/YAR/ROTFL/lexicon semantics and grants no effect authority.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {normalizeAudhdIntent} from './audhd-command.mjs';

export const LOCAL_WORK_PACKET_SCHEMA = 'xiio.cli.local-work-packet/v1';
export const LOCAL_WORK_RETURN_SCHEMA = 'xiio.cli.local-work-return/v1';
export const LOCAL_WORK_BINDING_SCHEMA = 'xiio.cli.local-work-binding/v1';

export const REQUIRED_PACKET_FIELDS = Object.freeze([
  'packet_id',
  'pinned_source',
  'workspace_root',
  'objective',
  'dependencies',
  'allowed_scope',
  'acceptance_command',
  'expected_result',
  'checkpoint_return_destination',
  'next_step_policy',
  'accepted',
]);

const CONTINUATION_PHRASES = Object.freeze([
  /^continue(?:\s+the\s+rest)?[.!?]*$/i,
  /^let'?s\s+do\s+that[.!?]*$/i,
  /^start\s+working\s+through\s+these\s+issues[.!?]*$/i,
  /^continue\s+the\s+rest[.!?]*$/i,
  /^keep\s+going[.!?]*$/i,
  /^\/continue$/i,
  /^(?:go\s+ahead|proceed|do\s+it|resume|finish\s+(?:it|the\s+task))[.!?]*$/i,
  /^pick\s+up\s+where\s+we\s+left\s+off[.!?]*$/i,
  /^please\s+(?:continue|proceed|keep\s+going)\b/i,
]);

const NEXT_STEP_POLICIES = new Set([
  'STOP_ON_PASS',
  'STOP_ON_FAIL',
  'REQUIRE_HUMAN_ACCEPTANCE_EACH_EFFECT',
  'RECORD_ONLY',
]);

function clean(value, max = 4096) {
  return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;
}

function digest(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function packetPath(workspaceRoot) {
  return path.join(workspaceRoot, '.xiio', 'accepted-work-packet.json');
}

export function missingPacketFields(input = {}) {
  const missing = [];
  for (const key of REQUIRED_PACKET_FIELDS) {
    const value = input[key];
    if (value === undefined || value === null) missing.push(key);
    else if (typeof value === 'string' && !value.trim()) missing.push(key);
    else if (Array.isArray(value) && key === 'dependencies' && value.length === 0) {
      // empty dependencies array is allowed (explicit none)
    } else if (key === 'allowed_scope' && (!value || typeof value !== 'object' || Array.isArray(value))) {
      missing.push(key);
    } else if (key === 'expected_result' && (!value || typeof value !== 'object' || Array.isArray(value))) {
      missing.push(key);
    } else if (key === 'accepted' && value !== true) {
      missing.push('accepted(must_be_true)');
    }
  }
  return missing;
}

export function compileLocalWorkPacket(input = {}) {
  const missing = missingPacketFields(input);
  if (missing.length) {
    const error = new Error('LOCAL_WORK_PACKET_FIELDS_MISSING:' + missing.join(','));
    error.code = 'LOCAL_WORK_PACKET_FIELDS_MISSING';
    error.missing = missing;
    throw error;
  }
  const pinned_source = clean(input.pinned_source, 64);
  if (!pinned_source || !/^[0-9a-f]{40}$/.test(pinned_source)) {
    throw Object.assign(new Error('PINNED_SOURCE_INVALID'), {code: 'PINNED_SOURCE_INVALID'});
  }
  const workspace_root = path.resolve(clean(input.workspace_root, 4096));
  const scope = input.allowed_scope;
  const paths = Array.isArray(scope.paths) ? scope.paths.map((p) => clean(String(p), 1024)).filter(Boolean) : null;
  if (!paths || paths.length === 0) {
    throw Object.assign(new Error('ALLOWED_SCOPE_PATHS_REQUIRED'), {code: 'ALLOWED_SCOPE_PATHS_REQUIRED'});
  }
  const policy = clean(input.next_step_policy, 128);
  if (!NEXT_STEP_POLICIES.has(policy)) {
    throw Object.assign(new Error('NEXT_STEP_POLICY_INVALID'), {code: 'NEXT_STEP_POLICY_INVALID'});
  }
  const acceptance_command = Array.isArray(input.acceptance_command)
    ? input.acceptance_command.map((x) => String(x))
    : typeof input.acceptance_command === 'string'
      ? ['/bin/sh', '-c', input.acceptance_command]
      : null;
  if (!acceptance_command || acceptance_command.length === 0) {
    throw Object.assign(new Error('ACCEPTANCE_COMMAND_INVALID'), {code: 'ACCEPTANCE_COMMAND_INVALID'});
  }
  const packet = Object.freeze({
    schema: LOCAL_WORK_PACKET_SCHEMA,
    packet_id: clean(input.packet_id, 256),
    pinned_source,
    workspace_root,
    objective: clean(input.objective, 4096),
    dependencies: Object.freeze(
      (Array.isArray(input.dependencies) ? input.dependencies : [])
        .map((d) => (typeof d === 'string' ? {id: clean(d, 256)} : {id: clean(d?.id, 256), note: clean(d?.note, 512)}))
        .filter((d) => d.id),
    ),
    allowed_scope: Object.freeze({
      paths: Object.freeze(paths),
      tools: Object.freeze(
        Array.isArray(scope.tools) ? scope.tools.map((t) => clean(String(t), 128)).filter(Boolean) : [],
      ),
    }),
    acceptance_command: Object.freeze(acceptance_command),
    expected_result: Object.freeze({...input.expected_result}),
    checkpoint_return_destination: path.resolve(workspace_root, clean(input.checkpoint_return_destination, 1024)),
    next_step_policy: policy,
    accepted: true,
    accepted_at: clean(input.accepted_at, 64) || new Date().toISOString(),
    effect_authority: false,
    semantic_digest: null,
  });
  const withDigest = {
    ...packet,
    semantic_digest: digest({
      packet_id: packet.packet_id,
      pinned_source: packet.pinned_source,
      workspace_root: packet.workspace_root,
      objective: packet.objective,
      dependencies: packet.dependencies,
      allowed_scope: packet.allowed_scope,
      acceptance_command: packet.acceptance_command,
      expected_result: packet.expected_result,
      checkpoint_return_destination: packet.checkpoint_return_destination,
      next_step_policy: packet.next_step_policy,
    }),
  };
  return Object.freeze(withDigest);
}

export function isContinuationPhrase(text) {
  const line = clean(text, 512);
  if (!line) return false;
  return CONTINUATION_PHRASES.some((re) => re.test(line));
}

function aliasesPath(workspaceRoot) {
  return path.join(workspaceRoot, '.xiio', 'aliases.json');
}

export function loadUserAliases(workspaceRoot) {
  const file = aliasesPath(workspaceRoot);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Object.freeze({});
    const out = {};
    for (const [alias, id] of Object.entries(raw)) {
      const a = clean(String(alias), 128);
      const packetId = clean(String(id), 256);
      if (a && packetId) out[a.toLowerCase()] = packetId;
    }
    return Object.freeze(out);
  } catch {
    return Object.freeze({});
  }
}

export function saveUserAlias(workspaceRoot, alias, packetId) {
  const root = path.resolve(workspaceRoot);
  const a = clean(String(alias), 128);
  const id = clean(String(packetId), 256);
  if (!a || !id) throw Object.assign(new Error('ALIAS_FIELDS_REQUIRED'), {code: 'ALIAS_FIELDS_REQUIRED'});
  const dest = aliasesPath(root);
  fs.mkdirSync(path.dirname(dest), {recursive: true, mode: 0o700});
  const current = {...loadUserAliases(root)};
  current[a.toLowerCase()] = id;
  const tmp = dest + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  fs.renameSync(tmp, dest);
  return {state: 'PASS', alias: a.toLowerCase(), packet_id: id, path: dest, effect_authority: false};
}

function objectiveTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !['that', 'this', 'with', 'from', 'into', 'then', 'please', 'task', 'work', 'file', 'update'].includes(t));
}

function isQuotedMentionOnly(line) {
  const t = line.trim();
  return (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2) ||
    /^say\s+["'].*continue/i.test(t) ||
    /^write\s+["'].*continue/i.test(t)
  );
}

/**
 * Classify ordinary language against the accepted pending task.
 * Shortcuts remain valid; they are not the only route. Grants no permission.
 */
export function classifyContinuationUtterance(text, {workspaceRoot = null, aliases = null} = {}) {
  const line = clean(text, 512);
  if (!line) {
    return {kind: 'EMPTY', effect_authority: false};
  }
  if (isQuotedMentionOnly(line)) {
    return {kind: 'QUOTED_MENTION_ONLY', effect_authority: false, note: 'Quoted text is data, not a continuation command.'};
  }
  let intent = null;
  try {
    intent = normalizeAudhdIntent(line);
  } catch {
    intent = null;
  }
  const negative = (intent?.directives || []).some((d) => d.kind === 'NEGATIVE_DIRECTIVE');
  if (negative && /\b(continue|proceed|keep going|do that|resume|finish|edit|write|apply)\b/i.test(line)) {
    return {kind: 'NEGATED', effect_authority: false, intent_ref: intent?.raw_ref || null};
  }
  if (isContinuationPhrase(line) || line === '/continue') {
    return {kind: 'CONTINUATION_SHORTCUT', effect_authority: false};
  }
  const root = workspaceRoot ? path.resolve(workspaceRoot) : null;
  const loaded = root ? loadAcceptedPacket(root) : {state: 'MISSING', packet: null};
  const aliasMap = aliases || (root ? loadUserAliases(root) : {});
  const lower = line.toLowerCase();
  if (loaded.state === 'PASS' && loaded.packet) {
    const packet = loaded.packet;
    const aliasHit = Object.entries(aliasMap).find(([alias, id]) => id === packet.packet_id && lower.includes(alias));
    if (aliasHit) {
      return {
        kind: 'CONTINUATION_TASK_CONTEXT',
        effect_authority: false,
        packet_id: packet.packet_id,
        matched_alias: aliasHit[0],
      };
    }
    if (lower.includes(packet.packet_id.toLowerCase())) {
      return {kind: 'CONTINUATION_TASK_CONTEXT', effect_authority: false, packet_id: packet.packet_id, matched: 'packet_id'};
    }
    const objTokens = objectiveTokens(packet.objective);
    const hits = objTokens.filter((t) => lower.includes(t));
    if (hits.length >= 2 || (hits.length >= 1 && /\b(pending|accepted|canary|packet|task)\b/i.test(line))) {
      return {
        kind: 'CONTINUATION_TASK_CONTEXT',
        effect_authority: false,
        packet_id: packet.packet_id,
        matched_tokens: hits.slice(0, 6),
      };
    }
    if (/\b(the|that|this)\s+(pending|accepted)?\s*(task|packet|work|job)\b/i.test(line) && /\b(do|finish|run|continue|resume|complete)\b/i.test(line)) {
      return {kind: 'CONTINUATION_TASK_CONTEXT', effect_authority: false, packet_id: packet.packet_id, matched: 'deictic_pending'};
    }
  }
  // Alias names a packet that is not the bound one, or multiple unresolved names → ask once.
  const mentionedAliases = Object.entries(aliasMap).filter(([alias]) => lower.includes(alias));
  if (mentionedAliases.length > 1) {
    return {
      kind: 'AMBIGUOUS',
      effect_authority: false,
      question: 'Which accepted task should run: ' + mentionedAliases.map(([a, id]) => a + ' (' + id + ')').join(' or ') + '?',
      candidates: mentionedAliases.map(([alias, packet_id]) => ({alias, packet_id})),
    };
  }
  if (mentionedAliases.length === 1 && loaded.state === 'PASS' && loaded.packet && mentionedAliases[0][1] !== loaded.packet.packet_id) {
    return {
      kind: 'AMBIGUOUS',
      effect_authority: false,
      question: 'Alias ' + mentionedAliases[0][0] + ' names ' + mentionedAliases[0][1] + ', but the bound packet is ' + loaded.packet.packet_id + '. Accept the intended packet first, or clear the alias.',
      candidates: [{alias: mentionedAliases[0][0], packet_id: mentionedAliases[0][1]}, {packet_id: loaded.packet.packet_id}],
    };
  }
  return {kind: 'NOT_CONTINUATION', effect_authority: false};
}

export function shouldAttemptLocalWorkContinuation(text, workspaceRoot) {
  const kind = classifyContinuationUtterance(text, {workspaceRoot}).kind;
  return ['CONTINUATION_SHORTCUT', 'CONTINUATION_TASK_CONTEXT', 'NEGATED', 'AMBIGUOUS'].includes(kind);
}

export function loadAcceptedPacket(workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  const file = packetPath(root);
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink()) {
      return {state: 'BLOCKED', reason: 'PACKET_FILE_CUSTODY_INVALID', packet: null};
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const packet = compileLocalWorkPacket(raw);
    if (path.resolve(packet.workspace_root) !== root) {
      return {state: 'BLOCKED', reason: 'WRONG_WORKSPACE', packet, expected: root, observed: packet.workspace_root};
    }
    return {state: 'PASS', packet, path: file};
  } catch (error) {
    if (error?.code === 'ENOENT') return {state: 'MISSING', reason: 'NO_ACCEPTED_PACKET', packet: null};
    return {
      state: 'BLOCKED',
      reason: error?.code || 'PACKET_LOAD_FAILED',
      missing: error?.missing || null,
      detail: String(error.message || error),
      packet: null,
    };
  }
}

export function acceptPacket(input, {workspaceRoot, force = false} = {}) {
  const root = path.resolve(workspaceRoot || input.workspace_root);
  const packet = compileLocalWorkPacket({...input, workspace_root: root, accepted: true});
  if (path.resolve(packet.workspace_root) !== root) {
    return {state: 'BLOCKED', reason: 'WRONG_WORKSPACE', packet: null};
  }
  const dest = packetPath(root);
  fs.mkdirSync(path.dirname(dest), {recursive: true, mode: 0o700});
  if (fs.existsSync(dest) && !force) {
    const existing = loadAcceptedPacket(root);
    if (existing.state === 'PASS' && existing.packet.packet_id === packet.packet_id) {
      return {state: 'PASS', reason: 'ALREADY_ACCEPTED', packet: existing.packet, path: dest, duplicate: true};
    }
    if (existing.state === 'PASS') {
      const prior = reconcileInterruptedEffect({packet: existing.packet});
      if (prior.state === 'RECONCILED_NO_DUPLICATE') {
        const archiveDir = path.join(root, '.xiio', 'completed');
        fs.mkdirSync(archiveDir, {recursive: true, mode: 0o700});
        const archive = path.join(archiveDir, existing.packet.packet_id + '.json');
        if (!fs.existsSync(archive)) {
          fs.copyFileSync(dest, archive);
        }
        // Prior packet completed with acceptance PASS — allow successor without erasing its return.
      } else {
        return {state: 'BLOCKED', reason: 'DUPLICATE_START', packet: existing.packet, path: dest};
      }
    }
  }
  const body = JSON.stringify(packet, null, 2) + '\n';
  const tmp = dest + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, body, {mode: 0o600, flag: 'wx'});
  fs.renameSync(tmp, dest);
  return {state: 'PASS', packet, path: dest, duplicate: false};
}

export function bindContinuationRequest({
  text,
  workspaceRoot,
  observedSourceSha = null,
  modelPromiseWithoutAction = false,
} = {}) {
  const classified = classifyContinuationUtterance(text, {workspaceRoot});
  const loaded = loadAcceptedPacket(workspaceRoot);
  if (classified.kind === 'QUOTED_MENTION_ONLY' || classified.kind === 'NOT_CONTINUATION' || classified.kind === 'EMPTY') {
    return {
      schema: LOCAL_WORK_BINDING_SCHEMA,
      state: 'NOT_CONTINUATION',
      reason: classified.kind === 'QUOTED_MENTION_ONLY' ? 'QUOTED_MENTION_ONLY' : 'ORDINARY_CHAT',
      classification: classified,
      packet: loaded.packet || null,
      effect_authority: false,
    };
  }
  if (classified.kind === 'NEGATED') {
    return {
      schema: LOCAL_WORK_BINDING_SCHEMA,
      state: 'BLOCKED',
      reason: 'NEGATION_OR_CANCEL',
      classification: classified,
      packet: loaded.packet || null,
      effect_authority: false,
      plain: 'Understood as a stop/negation. No pending effect was started.',
    };
  }
  if (classified.kind === 'AMBIGUOUS') {
    return {
      schema: LOCAL_WORK_BINDING_SCHEMA,
      state: 'AMBIGUOUS',
      reason: 'MULTIPLE_OR_MISMATCHED_TASKS',
      question: classified.question,
      candidates: classified.candidates || null,
      classification: classified,
      packet: loaded.packet || null,
      effect_authority: false,
    };
  }
  if (loaded.state === 'MISSING') {
    return {
      schema: LOCAL_WORK_BINDING_SCHEMA,
      state: 'MISSING_BINDING',
      reason: 'NO_ACCEPTED_PACKET',
      offer: 'Accept an executable work packet with /accept-packet PATH or: xi-io-cli work-packet accept --file PATH',
      packet: null,
      classification: classified,
      effect_authority: false,
    };
  }
  if (loaded.state !== 'PASS') {
    return {
      schema: LOCAL_WORK_BINDING_SCHEMA,
      state: 'BLOCKED',
      reason: loaded.reason,
      missing: loaded.missing || null,
      detail: loaded.detail || null,
      packet: loaded.packet,
      effect_authority: false,
    };
  }
  const packet = loaded.packet;
  if (observedSourceSha && observedSourceSha !== packet.pinned_source) {
    return {
      schema: LOCAL_WORK_BINDING_SCHEMA,
      state: 'BLOCKED',
      reason: 'STALE_SOURCE',
      packet,
      expected: packet.pinned_source,
      observed: observedSourceSha,
      effect_authority: false,
    };
  }
  if (path.resolve(workspaceRoot) !== path.resolve(packet.workspace_root)) {
    return {
      schema: LOCAL_WORK_BINDING_SCHEMA,
      state: 'BLOCKED',
      reason: 'WRONG_WORKSPACE',
      packet,
      expected: packet.workspace_root,
      observed: path.resolve(workspaceRoot),
      effect_authority: false,
    };
  }
  if (modelPromiseWithoutAction) {
    return {
      schema: LOCAL_WORK_BINDING_SCHEMA,
      state: 'BLOCKED',
      reason: 'MODEL_ANSWER_WITHOUT_ACTION',
      packet,
      effect_authority: false,
    };
  }
  return {
    schema: LOCAL_WORK_BINDING_SCHEMA,
    state: 'DISPATCH',
    reason: null,
    packet,
    workspace_root: packet.workspace_root,
    packet_id: packet.packet_id,
    objective: packet.objective,
    classification: classified,
    plain:
      'Pending task ' +
      packet.packet_id +
      ' — ' +
      packet.objective +
      ' (workspace ' +
      packet.workspace_root +
      ').',
    effect_authority: false,
  };
}

function matchExpected(result, expected) {
  const failures = [];
  if (Object.hasOwn(expected, 'exit_code') && result.exit_code !== expected.exit_code) {
    failures.push('exit_code');
  }
  if (expected.stdout_includes && !String(result.stdout || '').includes(expected.stdout_includes)) {
    failures.push('stdout_includes');
  }
  if (expected.stderr_includes && !String(result.stderr || '').includes(expected.stderr_includes)) {
    failures.push('stderr_includes');
  }
  if (expected.file_sha256) {
    const rel = expected.file_sha256.path;
    const want = expected.file_sha256.sha256;
    const abs = path.resolve(result.cwd, rel);
    try {
      const got = digest(fs.readFileSync(abs));
      if (got !== want) failures.push('file_sha256');
    } catch {
      failures.push('file_sha256_missing');
    }
  }
  return failures;
}

export function runAcceptanceCommand(packet, {spawn = spawnSync, env = process.env} = {}) {
  const cwd = packet.workspace_root;
  const [cmd, ...args] = packet.acceptance_command;
  const child = spawn(cmd, args, {
    cwd,
    env: {...env, PATH: env.PATH},
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 2_000_000,
  });
  const result = {
    exit_code: child.status === null ? 124 : child.status,
    signal: child.signal || null,
    stdout: child.stdout || '',
    stderr: child.stderr || '',
    cwd,
  };
  const failures = matchExpected(result, packet.expected_result);
  return {
    state: failures.length ? 'FAIL' : 'PASS',
    failures,
    result,
  };
}

export function writeWorkReturn(packet, body) {
  const dest = packet.checkpoint_return_destination;
  fs.mkdirSync(path.dirname(dest), {recursive: true, mode: 0o700});
  const payload = {
    schema: LOCAL_WORK_RETURN_SCHEMA,
    packet_id: packet.packet_id,
    semantic_digest: packet.semantic_digest,
    written_at: new Date().toISOString(),
    effect_authority: false,
    ...body,
  };
  const tmp = dest + '.tmp.' + process.pid;
  const text = JSON.stringify(payload, null, 2) + '\n';
  fs.writeFileSync(tmp, text, {mode: 0o600, flag: 'wx'});
  fs.renameSync(tmp, dest);
  return {state: 'PASS', path: dest, return: payload};
}

export function reconcileInterruptedEffect({packet, priorReturnPath = null} = {}) {
  const dest = priorReturnPath || packet.checkpoint_return_destination;
  if (!fs.existsSync(dest)) {
    return {state: 'NO_PRIOR_RETURN', duplicate_write: false};
  }
  const prior = JSON.parse(fs.readFileSync(dest, 'utf8'));
  if (prior.packet_id !== packet.packet_id) {
    return {state: 'BLOCKED', reason: 'RETURN_PACKET_MISMATCH', duplicate_write: false};
  }
  if (prior.state === 'PASS' && prior.acceptance?.state === 'PASS') {
    return {
      state: 'RECONCILED_NO_DUPLICATE',
      duplicate_write: false,
      prior,
      note: 'Effect already recorded; restart must not rewrite the same acceptance.',
    };
  }
  return {state: 'RESUME_ALLOWED', duplicate_write: false, prior};
}

/**
 * Local controller step: bind → optional model/work hook → deterministic acceptance → return.
 * Model output never authorizes skip of acceptance_command.
 */
export async function dispatchAcceptedWork({
  text = 'continue',
  workspaceRoot,
  observedSourceSha = null,
  performAdmittedStep = null,
  refuse = false,
  interruptedBeforeReceipt = false,
} = {}) {
  const binding = bindContinuationRequest({text, workspaceRoot, observedSourceSha});
  if (binding.state !== 'DISPATCH') {
    return {schema: 'xiio.cli.local-work-dispatch/v1', ...binding, executed: false};
  }
  const packet = binding.packet;
  const prior = reconcileInterruptedEffect({packet});
  if (prior.state === 'RECONCILED_NO_DUPLICATE') {
    return {
      schema: 'xiio.cli.local-work-dispatch/v1',
      state: 'PASS',
      reason: 'ALREADY_COMPLETE',
      packet_id: packet.packet_id,
      workspace_root: packet.workspace_root,
      executed: false,
      duplicate_write: false,
      return_path: packet.checkpoint_return_destination,
      prior,
      effect_authority: false,
    };
  }
  if (refuse) {
    const ret = writeWorkReturn(packet, {
      state: 'REFUSED',
      reason: 'OPERATOR_OR_POLICY_REFUSAL',
      binding,
    });
    return {
      schema: 'xiio.cli.local-work-dispatch/v1',
      state: 'REFUSED',
      packet_id: packet.packet_id,
      workspace_root: packet.workspace_root,
      executed: false,
      return_path: ret.path,
      effect_authority: false,
    };
  }
  let step = null;
  if (typeof performAdmittedStep === 'function') {
    step = await performAdmittedStep(packet);
    if (step?.state === 'FAIL') {
      const ret = writeWorkReturn(packet, {state: 'FAIL', reason: 'ADMITTED_STEP_FAILED', step, binding});
      return {
        schema: 'xiio.cli.local-work-dispatch/v1',
        state: 'FAIL',
        packet_id: packet.packet_id,
        workspace_root: packet.workspace_root,
        executed: true,
        step,
        return_path: ret.path,
        effect_authority: false,
      };
    }
  }
  if (interruptedBeforeReceipt) {
    return {
      schema: 'xiio.cli.local-work-dispatch/v1',
      state: 'INTERRUPTED_BEFORE_RECEIPT',
      packet_id: packet.packet_id,
      workspace_root: packet.workspace_root,
      executed: Boolean(step),
      step,
      note: 'Effect may have occurred; no return written. Restart must reconcile before duplicate write.',
      effect_authority: false,
    };
  }
  const acceptance = runAcceptanceCommand(packet);
  const ret = writeWorkReturn(packet, {
    state: acceptance.state,
    reason: acceptance.state === 'PASS' ? null : 'ACCEPTANCE_FAILED',
    acceptance,
    step,
    binding: {state: binding.state, packet_id: packet.packet_id},
    next_step_policy: packet.next_step_policy,
  });
  return {
    schema: 'xiio.cli.local-work-dispatch/v1',
    state: acceptance.state,
    packet_id: packet.packet_id,
    workspace_root: packet.workspace_root,
    objective: packet.objective,
    executed: true,
    step,
    acceptance,
    return_path: ret.path,
    effect_authority: false,
  };
}

export function formatBindingMessage(binding) {
  if (binding.state === 'MISSING_BINDING') {
    return 'No accepted executable work packet is bound to this workspace. ' + binding.offer;
  }
  if (binding.state === 'AMBIGUOUS') {
    return binding.question || 'More than one task could match. Name the packet id or alias once.';
  }
  if (binding.state === 'BLOCKED' && binding.reason === 'NEGATION_OR_CANCEL') {
    return binding.plain || 'Understood as a stop/negation. No pending effect was started.';
  }
  if (binding.state === 'BLOCKED' && binding.reason === 'STALE_SOURCE') {
    return 'Continuation blocked: pinned source ' + binding.expected + ' does not match observed ' + binding.observed + '.';
  }
  if (binding.state === 'BLOCKED' && binding.reason === 'WRONG_WORKSPACE') {
    return 'Continuation blocked: packet workspace is ' + binding.expected + ', current workspace is ' + binding.observed + '.';
  }
  if (binding.state === 'BLOCKED' && binding.reason === 'DUPLICATE_START') {
    return 'Continuation blocked: another accepted packet is already bound (' + binding.packet?.packet_id + ').';
  }
  if (binding.state === 'BLOCKED' && binding.reason === 'MODEL_ANSWER_WITHOUT_ACTION') {
    return 'A model answer alone is not an executable continuation. Bind an accepted packet and dispatch through the local controller.';
  }
  if (binding.state === 'DISPATCH') {
    return (
      (binding.plain || ('Bound pending task ' + binding.packet_id + ': ' + binding.objective)) +
      ' Local controller runs the admitted step and deterministic acceptance; model proposals are not authority. Details stay in /details.'
    );
  }
  if (binding.state === 'BLOCKED') {
    return 'Continuation blocked: ' + (binding.reason || 'UNKNOWN') + (binding.missing ? ' missing=' + binding.missing.join(',') : '');
  }
  return null;
}
