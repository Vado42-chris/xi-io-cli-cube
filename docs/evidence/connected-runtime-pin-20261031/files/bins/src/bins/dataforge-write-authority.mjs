/**
 * Trusted DataForge custody write-authority adapter.
 *
 * Resolves principal, workspace/resource scope and permitted operation from
 * existing on-disk authoritative records. Does not mint grants.
 *
 * Caller authentication: request-body principal / admitted:true JSON alone is
 * insufficient. Production HTTP must supply resolveVerifiedCaller from an
 * existing seat/Switchboard/loopback trust artifact. Without it, authorizeWrite
 * refuses with CALLER_AUTHENTICATOR_MISSING (production route stays fail-closed).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { constants } from 'node:fs';

const AUTHORITY_SCHEMA = 'xiio.bins.dataforge-write-authority/v1';
const PERMITTED_OPS = new Set(['custody.put']);

function fail(code, detail = null) {
  const error = Object.assign(new Error(code), { code });
  if (detail !== null) error.detail = detail;
  return error;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw fail(label + '_REQUIRED');
  return value.trim();
}

async function readJsonSafe(file) {
  const st = await fs.lstat(file);
  if (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1) {
    throw fail('AUTHORITY_FILE_UNSAFE', { file });
  }
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > 1024 * 1024) {
      throw fail('AUTHORITY_FILE_UNSAFE', { file });
    }
    const buf = Buffer.alloc(before.size);
    await handle.read(buf, 0, before.size, 0);
    const after = await handle.stat();
    if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
      throw fail('AUTHORITY_FILE_CHANGED_DURING_READ', { file });
    }
    return JSON.parse(buf.toString('utf8'));
  } finally {
    await handle.close();
  }
}

function normalizeAuthority(row, file) {
  if (!row || row.schema !== AUTHORITY_SCHEMA) return null;
  if (row.admitted !== true) return null;
  if (row.revoked === true) return { ...row, _file: file, _status: 'REVOKED' };
  if (row.expires_at != null && row.expires_at !== '') {
    const exp = Date.parse(row.expires_at);
    // Malformed expires_at must fail closed — never treat as "not expired".
    if (!Number.isFinite(exp)) {
      return { ...row, _file: file, _status: 'MALFORMED', reason: 'EXPIRES_AT_INVALID' };
    }
    if (Date.now() > exp) {
      return { ...row, _file: file, _status: 'EXPIRED' };
    }
  }
  const principal = String(row.principal_ref || row.agent_id || '').trim();
  const rootRef = String(row.workspace_root_ref || row.root_ref || '').trim();
  const ops = Array.isArray(row.permitted_operations) ? row.permitted_operations.map(String) : [];
  if (!principal || !rootRef.startsWith('dataforge://root/') || !ops.length) return null;
  return {
    ...row,
    principal_ref: principal,
    workspace_root_ref: rootRef,
    permitted_operations: ops,
    _file: file,
    _status: 'ADMITTED',
    _fingerprint: crypto
      .createHash('sha256')
      .update(JSON.stringify({ principal, rootRef, ops, scope: row.coordinate_scope, work: row.work_ref || null, revoked: false, expires: row.expires_at || null }))
      .digest('hex'),
  };
}

/**
 * @param {{
 *   authorityDir:string,
 *   resolveVerifiedCaller?: () => Promise<{principal_ref:string, issuer_ref:string, evidence_class:string}|null>|null
 * }} options
 */
export function createDataForgeWriteAuthorityAdapter({
  authorityDir,
  resolveVerifiedCaller = null,
  /** @deprecated test-only hook between authority re-reads — never set in production */
  _testBetweenAuthorityLoads = null,
} = {}) {
  if (typeof authorityDir !== 'string' || !path.isAbsolute(authorityDir)) {
    throw fail('AUTHORITY_DIR_ABSOLUTE_REQUIRED');
  }

  async function loadRecords() {
    let names;
    try {
      names = await fs.readdir(authorityDir);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const out = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(authorityDir, name);
      try {
        const st = await fs.lstat(file);
        if (!st.isFile() || st.isSymbolicLink()) continue;
        const row = normalizeAuthority(await readJsonSafe(file), file);
        if (row) out.push(row);
      } catch (error) {
        if (error?.code === 'AUTHORITY_FILE_UNSAFE' || error?.code === 'AUTHORITY_FILE_CHANGED_DURING_READ') {
          out.push({ _file: file, _status: 'UNSAFE', reason: error.code });
          continue;
        }
        throw error;
      }
    }
    return out;
  }

  return {
    schema: 'xiio.bins.dataforge-write-authority-adapter/v1',
    authority_dir: authorityDir,
    caller_authenticator_bound: typeof resolveVerifiedCaller === 'function',
    async list() {
      return loadRecords();
    },
    async authorizeWrite(request = {}) {
      if (typeof resolveVerifiedCaller !== 'function') {
        return {
          admitted: false,
          reason: 'CALLER_AUTHENTICATOR_MISSING',
          authority_granted: false,
          hard: [
            'REQUEST_BODY_PRINCIPAL != VERIFIED_CALLER',
            'ADMITTED_JSON != CALLER_AUTH',
            'LOOPBACK_ALONE != PRINCIPAL_PROOF',
          ],
          missing_primitive: {
            name: 'resolveVerifiedCaller',
            owner: 'Vado42-chris/xi-io_bins + Switchboard seat identity',
            next: 'Bind HTTP writes to Switchboard/seat identity readback (or equivalent peer-authenticated principal) before production activation',
          },
        };
      }

      const verified = await resolveVerifiedCaller(request);
      if (!verified?.principal_ref) {
        return {
          admitted: false,
          reason: 'CALLER_NOT_VERIFIED',
          authority_granted: false,
        };
      }

      const claimedPrincipal = text(request.principal_ref || request.agent_id, 'PRINCIPAL_REF');
      if (claimedPrincipal !== verified.principal_ref) {
        return {
          admitted: false,
          reason: 'PRINCIPAL_SPOOF_REFUSED',
          authority_granted: false,
          verified_principal_ref: verified.principal_ref,
        };
      }

      const rootRef = text(request.root_ref || request.workspace_root_ref, 'ROOT_REF');
      const operation = text(request.operation || 'custody.put', 'OPERATION');
      const coordinate = text(request.coordinate_ref, 'COORDINATE_REF');
      const workRef = request.work_ref == null ? null : text(String(request.work_ref), 'WORK_REF');

      if (!PERMITTED_OPS.has(operation)) {
        return { admitted: false, reason: 'OPERATION_NOT_PERMITTED', authority_granted: false };
      }

      const loadAndMatch = async () => {
        const records = await loadRecords();
        if (!records.length) {
          return { admitted: false, reason: 'DATAFORGE_CUSTODY_WRITE_AUTHORITY_UNBOUND', authority_granted: false };
        }
        if (records.some((r) => r._status === 'UNSAFE')) {
          return { admitted: false, reason: 'AUTHORITY_FILE_UNSAFE', authority_granted: false };
        }

        const revoked = records.find(
          (r) => r._status === 'REVOKED' && r.principal_ref === claimedPrincipal && r.workspace_root_ref === rootRef,
        );
        if (revoked) {
          return {
            admitted: false,
            reason: 'AUTHORITY_REVOKED',
            authority_granted: false,
            authority_ref: revoked.authority_id || path.basename(revoked._file),
          };
        }

        const expired = records.find(
          (r) => r._status === 'EXPIRED' && r.principal_ref === claimedPrincipal && r.workspace_root_ref === rootRef,
        );
        if (expired) {
          return {
            admitted: false,
            reason: 'AUTHORITY_EXPIRED',
            authority_granted: false,
            authority_ref: expired.authority_id || path.basename(expired._file),
          };
        }

        const malformed = records.find(
          (r) => r._status === 'MALFORMED' && r.principal_ref === claimedPrincipal && r.workspace_root_ref === rootRef,
        );
        if (malformed) {
          return {
            admitted: false,
            reason: 'AUTHORITY_MALFORMED',
            detail: malformed.reason || 'EXPIRES_AT_INVALID',
            authority_granted: false,
            authority_ref: malformed.authority_id || path.basename(malformed._file),
          };
        }

        const matches = records.filter((r) => {
          if (r._status !== 'ADMITTED') return false;
          if (r.principal_ref !== claimedPrincipal) return false;
          if (r.workspace_root_ref !== rootRef) return false;
          if (!r.permitted_operations.includes(operation)) return false;
          if (r.work_ref != null && workRef != null && r.work_ref !== workRef) return false;
          if (r.work_ref != null && workRef == null) return false;
          const scope = r.coordinate_scope;
          if (scope == null) return true;
          // Bare string = exact match only. Prefix must be explicit { prefix }.
          if (typeof scope === 'string') return coordinate === scope;
          if (Array.isArray(scope)) return scope.includes(coordinate);
          if (scope && typeof scope === 'object' && typeof scope.prefix === 'string') {
            return coordinate.startsWith(scope.prefix);
          }
          if (scope && typeof scope === 'object' && typeof scope.exact === 'string') {
            return coordinate === scope.exact;
          }
          return false;
        });

        if (!matches.length) {
          const samePrincipal = records.some((r) => r._status === 'ADMITTED' && r.principal_ref === claimedPrincipal);
          return {
            admitted: false,
            reason: samePrincipal ? 'AUTHORITY_SCOPE_MISMATCH' : 'AUTHORITY_PRINCIPAL_MISSING',
            authority_granted: false,
          };
        }

        const chosen = matches.sort((a, b) => String(a.authority_id || '').localeCompare(String(b.authority_id || '')))[0];
        return {
          admitted: true,
          authority_granted: true,
          authority_ref: chosen.authority_id || path.basename(chosen._file),
          principal_ref: claimedPrincipal,
          workspace_root_ref: rootRef,
          work_ref: workRef,
          operation,
          coordinate_ref: coordinate,
          authority_fingerprint: chosen._fingerprint,
          issuer_ref: verified.issuer_ref || null,
          evidence_class: verified.evidence_class || 'VERIFIED_CALLER',
          source_record_refs: Array.isArray(chosen.source_record_refs) ? chosen.source_record_refs : [chosen._file],
          decision_digest: crypto
            .createHash('sha256')
            .update(
              JSON.stringify({
                principal: claimedPrincipal,
                rootRef,
                workRef,
                operation,
                coordinate,
                authority: chosen.authority_id,
                fingerprint: chosen._fingerprint,
                issuer: verified.issuer_ref || null,
              }),
            )
            .digest('hex'),
        };
      };

      // First pass
      const first = await loadAndMatch();
      if (!first.admitted) return first;

      if (typeof _testBetweenAuthorityLoads === 'function') {
        await _testBetweenAuthorityLoads(first);
      }

      // TOCTOU: authority must not change before commit — re-read and require same fingerprint
      const second = await loadAndMatch();
      if (!second.admitted) {
        return { admitted: false, reason: 'AUTHORITY_CHANGED_BEFORE_COMMIT', authority_granted: false };
      }
      if (second.authority_fingerprint !== first.authority_fingerprint) {
        return { admitted: false, reason: 'AUTHORITY_CHANGED_BEFORE_COMMIT', authority_granted: false };
      }
      return second;
    },
  };
}

/**
 * Materialize an isolated authority record for tests only.
 * Not a production grant creator — tests write under temp authorityDir.
 */
export function buildAuthorityRecord({
  authority_id,
  principal_ref,
  workspace_root_ref,
  work_ref = null,
  permitted_operations = ['custody.put'],
  coordinate_scope = null,
  admitted = true,
  revoked = false,
  expires_at = null,
  source_record_refs = [],
} = {}) {
  return {
    schema: AUTHORITY_SCHEMA,
    authority_id,
    principal_ref,
    workspace_root_ref,
    work_ref,
    permitted_operations,
    coordinate_scope,
    admitted,
    revoked,
    expires_at,
    source_record_refs,
    effect_authority: admitted && !revoked ? 1 : 0,
    hard: ['JSON_FILE != PRODUCTION_GRANT', 'ADMITTED_RECORD != NEW_CREDENTIAL', 'REQUEST_BODY_PRINCIPAL != VERIFIED_CALLER'],
  };
}

/**
 * Seat identity file reader — identifies a seat; does NOT authenticate an HTTP request.
 * Must not be bound as production resolveVerifiedCaller without a request-specific trust path.
 * Production keeps resolveVerifiedCaller unbound → CALLER_AUTHENTICATOR_MISSING.
 */
export function createSeatSwitchboardCallerResolver({
  seatAgentPath = path.join(
    process.env.HOME || '',
    '.local/state/xi-io/switchboard/agents/AGENT.seat-cursor.flatpack-studio.current.json',
  ),
} = {}) {
  return async function resolveVerifiedCaller() {
    try {
      const st = await fs.lstat(seatAgentPath);
      if (!st.isFile() || st.isSymbolicLink()) return null;
      const row = JSON.parse(await fs.readFile(seatAgentPath, 'utf8'));
      const principal = String(row.agent_id || '').trim();
      if (!principal.startsWith('xiio:agent/')) return null;
      return {
        principal_ref: principal,
        issuer_ref: seatAgentPath,
        evidence_class: 'SWITCHBOARD_SEAT_AGENT_FILE_ONLY',
        hard: [
          'SEAT_IDENTITY_FILE != HTTP_REQUEST_AUTH',
          'createSeatSwitchboardCallerResolver != PRODUCTION_CALLER_AUTHENTICATOR',
        ],
        production_activation: false,
      };
    } catch {
      return null;
    }
  };
}
