/**
 * Trusted DataForge custody write-authority adapter.
 *
 * Resolves principal, workspace/resource scope and permitted operation from
 * existing on-disk authoritative records. Does not mint grants. Missing or
 * revoked authority refuses. Production activation of a new credential/grant
 * remains a separate owner approval.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

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

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function normalizeAuthority(row, file) {
  if (!row || row.schema !== AUTHORITY_SCHEMA) return null;
  if (row.admitted !== true) return null;
  if (row.revoked === true) return { ...row, _file: file, _status: 'REVOKED' };
  const principal = String(row.principal_ref || row.agent_id || '').trim();
  const rootRef = String(row.workspace_root_ref || row.root_ref || '').trim();
  const ops = Array.isArray(row.permitted_operations) ? row.permitted_operations.map(String) : [];
  if (!principal || !rootRef.startsWith('dataforge://root/') || !ops.length) return null;
  return { ...row, principal_ref: principal, workspace_root_ref: rootRef, permitted_operations: ops, _file: file, _status: 'ADMITTED' };
}

/**
 * @param {{authorityDir:string}} options absolute directory of authority records
 */
export function createDataForgeWriteAuthorityAdapter({ authorityDir } = {}) {
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
      const st = await fs.lstat(file);
      if (!st.isFile() || st.isSymbolicLink()) continue;
      const row = normalizeAuthority(await readJson(file), file);
      if (row) out.push(row);
    }
    return out;
  }

  return {
    schema: 'xiio.bins.dataforge-write-authority-adapter/v1',
    authority_dir: authorityDir,
    async list() {
      return loadRecords();
    },
    /**
     * Authorize a custody.put against existing admitted records.
     * Returns {admitted:true,...} or throws/returns denied object for HTTP layer.
     */
    async authorizeWrite(request = {}) {
      const principal = text(request.principal_ref || request.agent_id, 'PRINCIPAL_REF');
      const rootRef = text(request.root_ref || request.workspace_root_ref, 'ROOT_REF');
      const operation = text(request.operation || 'custody.put', 'OPERATION');
      const coordinate = text(request.coordinate_ref, 'COORDINATE_REF');
      const workRef = request.work_ref == null ? null : text(String(request.work_ref), 'WORK_REF');

      if (!PERMITTED_OPS.has(operation)) {
        return { admitted: false, reason: 'OPERATION_NOT_PERMITTED', authority_granted: false };
      }

      const records = await loadRecords();
      if (!records.length) {
        return { admitted: false, reason: 'DATAFORGE_CUSTODY_WRITE_AUTHORITY_UNBOUND', authority_granted: false };
      }

      const revoked = records.find(
        (r) => r._status === 'REVOKED' && r.principal_ref === principal && r.workspace_root_ref === rootRef,
      );
      if (revoked) {
        return {
          admitted: false,
          reason: 'AUTHORITY_REVOKED',
          authority_granted: false,
          authority_ref: revoked.authority_id || path.basename(revoked._file),
        };
      }

      const matches = records.filter((r) => {
        if (r._status !== 'ADMITTED') return false;
        if (r.principal_ref !== principal) return false;
        if (r.workspace_root_ref !== rootRef) return false;
        if (!r.permitted_operations.includes(operation)) return false;
        if (r.work_ref != null && workRef != null && r.work_ref !== workRef) return false;
        if (r.work_ref != null && workRef == null) return false;
        const scope = r.coordinate_scope;
        if (scope == null) return true;
        if (typeof scope === 'string') return coordinate === scope || coordinate.startsWith(scope);
        if (Array.isArray(scope)) return scope.includes(coordinate);
        if (scope && typeof scope === 'object' && typeof scope.prefix === 'string') {
          return coordinate.startsWith(scope.prefix);
        }
        return false;
      });

      if (!matches.length) {
        // Wrong scope vs missing principal
        const samePrincipal = records.some((r) => r._status === 'ADMITTED' && r.principal_ref === principal);
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
        principal_ref: principal,
        workspace_root_ref: rootRef,
        work_ref: workRef,
        operation,
        coordinate_ref: coordinate,
        source_record_refs: Array.isArray(chosen.source_record_refs) ? chosen.source_record_refs : [chosen._file],
        decision_digest: crypto
          .createHash('sha256')
          .update(JSON.stringify({ principal, rootRef, workRef, operation, coordinate, authority: chosen.authority_id }))
          .digest('hex'),
      };
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
    source_record_refs,
    effect_authority: admitted && !revoked ? 1 : 0,
    hard: ['JSON_FILE != PRODUCTION_GRANT', 'ADMITTED_RECORD != NEW_CREDENTIAL'],
  };
}
