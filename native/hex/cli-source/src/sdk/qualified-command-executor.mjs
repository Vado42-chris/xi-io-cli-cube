/**
 * Qualified workspace command executor — shared sandbox/path/approval surface
 * for packet admitted_step and acceptance_command.
 * Extracted from xiio.mjs bubblewrap containment; not a new sandbox product.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {controlledChildEnv} from '../runtime-integrity.mjs';

export const SANDBOX_TIMEOUT_MS = 120000;

let sandboxCache = null;

function onPath(name) {
  for (const d of String(process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue;
    const f = path.join(d, name);
    try {
      fs.accessSync(f, fs.constants.X_OK);
      if (fs.statSync(f).isFile()) return f;
    } catch {
      /* continue */
    }
  }
  return null;
}

function within(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return c === p || c.startsWith(p + path.sep);
}

export function sandboxState({env = process.env} = {}) {
  if (sandboxCache && !env.XIIO_TEST_PLATFORM) return sandboxCache;
  if (env.XIIO_SANDBOX === 'off') {
    return {ok: false, reason: 'SANDBOX_DISABLED_BY_ENVIRONMENT'};
  }
  const platform =
    process.platform === 'linux' && env.XIIO_TEST_PLATFORM ? env.XIIO_TEST_PLATFORM : process.platform;
  if (platform !== 'linux') {
    return {
      ok: false,
      reason: 'SANDBOX_UNAVAILABLE_ON_' + platform.toUpperCase(),
      detail: 'Commands require Linux bubblewrap containment in Version 1.',
    };
  }
  const bwrap = onPath('bwrap');
  if (!bwrap) {
    return {
      ok: false,
      reason: 'SANDBOX_UNAVAILABLE_NO_BWRAP',
      detail: 'Install bubblewrap to allow commands.',
    };
  }
  const probe = spawnSync(
    bwrap,
    ['--unshare-all', '--die-with-parent', '--ro-bind', '/', '/', '--', 'true'],
    {encoding: 'utf8', timeout: 10000, env: controlledChildEnv(env)},
  );
  if (probe.status !== 0) {
    return {
      ok: false,
      reason: 'SANDBOX_UNAVAILABLE_NAMESPACES_BLOCKED',
      detail: String(probe.stderr || probe.error?.message || '').trim().slice(0, 300),
    };
  }
  const state = {ok: true, bwrap};
  if (!env.XIIO_TEST_PLATFORM) sandboxCache = state;
  return state;
}

export function sandboxArgs(root, command, {network = false} = {}) {
  const home = os.homedir();
  const args = ['--die-with-parent', '--new-session', '--unshare-all', '--clearenv'];
  if (network) args.push('--share-net');
  for (const d of ['/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/etc']) {
    args.push('--ro-bind-try', d, d);
  }
  args.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp');
  args.push('--tmpfs', home);
  const nodeBin = path.dirname(process.execPath);
  const toolchain = new Set([
    path.dirname(nodeBin),
    path.dirname(path.dirname(fs.realpathSync(process.execPath))),
  ]);
  for (const t of toolchain) {
    if (!['/', '/usr', '/usr/local'].includes(t)) args.push('--ro-bind-try', t, t);
  }
  args.push('--bind', root, root);
  const git = path.join(root, '.git');
  if (fs.existsSync(git)) args.push('--ro-bind', git, git);
  args.push(
    '--chdir',
    root,
    '--setenv',
    'HOME',
    home,
    '--setenv',
    'TMPDIR',
    '/tmp',
    '--setenv',
    'LANG',
    process.env.LANG || 'C.UTF-8',
    '--setenv',
    'TERM',
    'dumb',
    '--setenv',
    'PATH',
    [nodeBin, '/usr/local/bin', '/usr/bin', '/bin'].join(':'),
    '--',
    '/bin/bash',
    '-o',
    'pipefail',
    '-c',
    command,
  );
  return args;
}

export function sandboxRefusal(root) {
  const home = os.homedir();
  if (root === path.parse(root).root || within(root, home)) {
    return 'SANDBOX_WORKSPACE_TOO_BROAD: start xi-io-cli inside a project folder to run commands';
  }
  return null;
}

const INTERPRETERS = new Set([
  'node',
  'nodejs',
  'python',
  'python3',
  'python3.11',
  'python3.12',
  'bash',
  'sh',
  'dash',
  'perl',
  'ruby',
]);

function pathAllowed(resolved, allows) {
  return allows.some((a) => {
    const base = a.endsWith(path.sep) ? a : a + path.sep;
    return resolved === a || resolved === a.replace(/\/$/, '') || resolved.startsWith(base) || within(resolved, a);
  });
}

/**
 * Scan argv for filesystem path tokens that escape allowed_scope.paths.
 * Interpreters must not gain unrestricted FS access via -e / script args.
 */
export function scanArgvPathEscape(argv, {workspaceRoot, allowedPaths = []} = {}) {
  const root = path.resolve(workspaceRoot);
  const allows = (Array.isArray(allowedPaths) ? allowedPaths : [])
    .map((p) => path.resolve(root, p))
    .filter(Boolean);
  if (!allows.length) {
    return {ok: false, reason: 'ALLOWED_SCOPE_PATHS_REQUIRED'};
  }
  const escapes = [];
  const seen = new Set();
  const consider = (raw, index) => {
    if (index === 0) return; // interpreter / tool binary
    if (typeof raw !== 'string' || !raw) return;
    let resolved;
    try {
      resolved = path.resolve(root, raw.replace(/^~(?=\/|$)/, os.homedir()));
    } catch {
      return;
    }
    // Only judge path-like tokens (absolute, relative with slash, or ..).
    // Do not treat JS escape sequences like \n as Windows path separators.
    const winPath = process.platform === 'win32' && (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\'));
    const pathLike =
      raw.startsWith('/') ||
      raw.startsWith('~/') ||
      raw.startsWith('./') ||
      raw.startsWith('../') ||
      raw.includes('/') ||
      raw.includes('..') ||
      winPath;
    if (!pathLike) return;
    if (pathAllowed(resolved, allows)) return;
    // Outside allowed scope — including other files in the same workspace
    if (!seen.has(resolved)) {
      seen.add(resolved);
      escapes.push({token: raw, resolved});
    }
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    const prev = String(argv[i - 1] || '');
    // Never treat the whole -e/-c payload as one filesystem path; extract embeds only.
    // Do not split mid-relative paths (canary/independent.txt must not yield /independent.txt).
    if (['-e', '-c', '--eval'].includes(prev)) {
      const quoted = token.match(/["']([^"']+)["']/g) || [];
      for (const q of quoted) {
        const inner = q.replace(/^["']|["']$/g, '');
        // Only judge path-like quoted strings (absolute, ~/..., relative with slash, or ..)
        const winPath = process.platform === 'win32' && (/^[A-Za-z]:[\\/]/.test(inner) || inner.startsWith('\\\\'));
        if (
          inner.startsWith('/') ||
          inner.startsWith('~/') ||
          inner.startsWith('./') ||
          inner.startsWith('../') ||
          inner.includes('/') ||
          inner.includes('..') ||
          winPath
        ) {
          consider(inner, i);
        }
      }
      continue;
    }
    if (['-e', '-c', '--eval'].includes(token)) continue;
    consider(token, i);
  }
  if (escapes.length) {
    return {ok: false, reason: 'ARGV_PATH_ESCAPES_ALLOWED_SCOPE', escapes};
  }
  return {ok: true};
}

function shellQuote(arg) {
  return "'" + String(arg).replace(/'/g, `'\\''`) + "'";
}

export function argvToShellCommand(argv) {
  return argv.map(shellQuote).join(' ');
}

/**
 * Run argv inside the existing bubblewrap workspace sandbox.
 * requireApproval: when provided and returns false → HUMAN_APPROVAL_REQUIRED.
 * autoApprove for deterministic acceptance when packet already accepted (caller decides).
 */
export function runQualifiedWorkspaceArgv({
  argv,
  workspaceRoot,
  allowedPaths = [],
  allowedTools = [],
  network = false,
  approve = null,
  purpose = 'packet_command',
  env = process.env,
  spawnImpl = spawnSync,
} = {}) {
  if (!Array.isArray(argv) || !argv.length) {
    return {state: 'FAIL', reason: 'ARGV_REQUIRED', effect_authority: false};
  }
  const root = path.resolve(workspaceRoot);
  const [cmd, ...rest] = argv.map(String);
  const base = path.basename(cmd);
  const toolOk = (allowedTools || []).includes(cmd) || (allowedTools || []).includes(base);
  let pathOk = false;
  try {
    const resolved = path.resolve(root, cmd);
    pathOk = (allowedPaths || []).some((p) => {
      const allow = path.resolve(root, p);
      return resolved === allow || within(resolved, allow);
    });
  } catch {
    pathOk = false;
  }
  // Interpreters on PATH are allowed only if listed in tools OR basename matches node/python when tools include execPath
  const interpreterOk =
    (INTERPRETERS.has(base) || cmd === process.execPath) &&
    ((allowedTools || []).some(
      (t) => INTERPRETERS.has(path.basename(String(t))) || t === cmd || t === process.execPath || path.basename(String(t)) === base,
    ) ||
      toolOk ||
      cmd === process.execPath);
  if (!toolOk && !pathOk && !interpreterOk) {
    return {
      state: 'FAIL',
      reason: 'COMMAND_OUT_OF_SCOPE',
      effect_authority: false,
      hard: ['ALLOWLISTED_NAME != UNRESTRICTED_FS'],
    };
  }

  const escape = scanArgvPathEscape(argv, {workspaceRoot: root, allowedPaths});
  if (!escape.ok) {
    return {
      state: 'FAIL',
      reason: escape.reason,
      escapes: escape.escapes || null,
      effect_authority: false,
      hard: ['INTERPRETER_ARGV != UNRESTRICTED_FS', 'ALLOWED_SCOPE_PATHS_ENFORCED'],
    };
  }

  const sb = sandboxState({env});
  if (!sb.ok) {
    return {state: 'FAIL', reason: sb.reason, detail: sb.detail || null, effect_authority: false};
  }
  const broad = sandboxRefusal(root);
  if (broad) {
    return {state: 'FAIL', reason: broad, effect_authority: false};
  }

  if (typeof approve === 'function') {
    const ok = approve({
      tool: 'run_workspace_command',
      purpose,
      command: argvToShellCommand(argv),
      workspace: root,
      network: Boolean(network),
    });
    // sync approve may return boolean or Promise — callers using async should pass sync or pre-approved
    if (ok && typeof ok.then === 'function') {
      return {state: 'FAIL', reason: 'APPROVE_MUST_BE_SYNC_FOR_QUALIFIED_EXECUTOR', effect_authority: false};
    }
    if (!ok) {
      return {state: 'FAIL', reason: 'HUMAN_APPROVAL_REQUIRED', effect_authority: false};
    }
  }

  const command = argvToShellCommand(argv);
  const r = spawnImpl(sb.bwrap, sandboxArgs(root, command, {network}), {
    cwd: root,
    encoding: 'utf8',
    timeout: SANDBOX_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    env: {PATH: env.PATH || '/usr/bin:/bin'},
  });
  const exit = r.status === null ? 124 : r.status;
  return {
    state: exit === 0 ? 'PASS' : 'FAIL',
    reason: exit === 0 ? null : 'QUALIFIED_COMMAND_NONZERO_EXIT',
    exit_code: exit,
    signal: r.signal || null,
    stdout: String(r.stdout || ''),
    stderr: String(r.stderr || ''),
    sandbox: 'bubblewrap',
    network: network ? 'shared' : 'none',
    effect_authority: false,
    hard: [
      'QUALIFIED_SANDBOX_RUN != EFFECT_AUTHORITY',
      'PACKET_ACCEPTANCE != EFFECT_AUTHORIZATION',
      'effect_authority:false != ENFORCEMENT',
    ],
  };
}

export function resetSandboxCacheForTests() {
  sandboxCache = null;
}
