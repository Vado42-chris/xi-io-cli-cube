// Restoration candidate: reconstructs the original route contract, not the lost local server.ts patch.
// Write authority: createDataForgeWriteAuthorityAdapter reads admitted records from
// XIIO_BINS_DATAFORGE_WRITE_AUTHORITY_DIR. Missing/empty dir keeps writes unbound.
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDataForgeCustodyStore, inspectDataForgeCustodyStore } from '../src/bins/dataforge-custody.js';
import { createDataForgeWriteAuthorityAdapter } from '../src/bins/dataforge-write-authority.mjs';

function resolveAuthorityAdapter() {
  // Production stays fail-closed on caller authentication: env authority dir alone
  // does not bind resolveVerifiedCaller. Isolated servers inject an adapter explicitly.
  const authorityDir = process.env.XIIO_BINS_DATAFORGE_WRITE_AUTHORITY_DIR;
  if (typeof authorityDir !== 'string' || !authorityDir.trim()) return null;
  if (!path.isAbsolute(authorityDir)) throw new Error('WRITE_AUTHORITY_DIR_ABSOLUTE_REQUIRED');
  // Without an authenticated caller primitive, adapter refuses every write.
  return createDataForgeWriteAuthorityAdapter({ authorityDir, resolveVerifiedCaller: null });
}

async function readJsonBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('REQUEST_BODY_TOO_LARGE');
      error.code = 'REQUEST_BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createDataForgeCustodyServer({
  rootDir,
  authorityAdapter = resolveAuthorityAdapter(),
  /** @deprecated test-only — never set in production */
  _testBetweenAuthorizeAndPut = null,
} = {}) {
  if (!path.isAbsolute(rootDir || '')) throw new Error('EXPLICIT_ABSOLUTE_CUSTODY_ROOT_REQUIRED');
  const store = createDataForgeCustodyStore({ rootDir });
  const writeBound = typeof authorityAdapter?.authorizeWrite === 'function';
  const reply = (res, status, value) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    try {
      const expected = '127.0.0.1:' + server.address().port;
      if (
        req.socket.remoteAddress !== '127.0.0.1' ||
        req.headers.host !== expected ||
        req.headers.origin !== undefined ||
        req.headers['sec-fetch-site'] === 'cross-site'
      ) {
        return reply(res, 403, { error: 'LOCAL_REQUEST_REQUIRED', authority_granted: false });
      }
      if ((req.url || '').length > 8192) {
        return reply(res, 414, { error: 'REQUEST_TOO_LARGE', authority_granted: false });
      }
      const url = new URL(req.url, 'http://' + expected);
      if (req.method === 'GET' && url.pathname === '/api/bins/dataforge/health') {
        const inspection = await inspectDataForgeCustodyStore(rootDir);
        return reply(res, 200, {
          schema: 'xiio.bins.dataforge-custody-health/v1',
          state: inspection.state,
          scan_state: inspection.scan_state,
          entries_examined: inspection.entries_examined,
          unclassified_entries: inspection.unclassified_entries,
          invalid_records: inspection.invalid_records,
          errors: inspection.errors,
          errors_truncated: inspection.errors_truncated,
          root_dir: rootDir,
          provider_effect: false,
          authority_granted: false,
          write_state: writeBound ? 'AUTHORITY_ADAPTER_BOUND' : 'AUTHORITY_ADAPTER_UNBOUND',
          writes_available: writeBound,
          read_only: !writeBound,
          verified_records: inspection.records,
          integrity_scope: 'CURRENT_AND_HISTORICAL_VERSION_READBACK',
          authority_dir: writeBound ? authorityAdapter.authority_dir : null,
        });
      }
      if (url.pathname === '/api/bins/dataforge/custody/version') {
        if (req.method !== 'GET') {
          return reply(res, 405, { error: 'METHOD_NOT_ALLOWED', authority_granted: false });
        }
        const coordinate = url.searchParams.get('coordinate_ref')?.trim();
        const version =
          url.searchParams.get('version')?.trim() || url.searchParams.get('version_ref')?.trim();
        if (!coordinate || url.searchParams.getAll('coordinate_ref').length !== 1) {
          return reply(res, 400, { error: 'COORDINATE_REF_REQUIRED', authority_granted: false });
        }
        if (!version || (url.searchParams.getAll('version').length + url.searchParams.getAll('version_ref').length) !== 1) {
          return reply(res, 400, { error: 'VERSION_REF_REQUIRED', authority_granted: false });
        }
        try {
          const row = await store.readPreservedVersion({ coordinateRef: coordinate, versionRef: version });
          const { content_bytes, ...safe } = row;
          return reply(res, 200, {
            ...safe,
            content_sha256: row.digest.value,
            content_bytes_present: Buffer.isBuffer(content_bytes),
          });
        } catch (error) {
          const code = String(error?.message || error);
          if (code === 'BINS_PRESERVED_RESOURCE_NOT_FOUND' || code === 'BINS_PRESERVED_VERSION_NOT_UNIQUE_OR_MISSING') {
            return reply(res, 404, { error: code, coordinate_ref: coordinate, version_ref: version, authority_granted: false });
          }
          if (code.startsWith('BINS_PRESERVED_')) {
            return reply(res, 409, { error: code, coordinate_ref: coordinate, version_ref: version, authority_granted: false });
          }
          throw error;
        }
      }
      if (url.pathname === '/api/bins/dataforge/custody') {
        if (req.method === 'POST') {
          if (!writeBound) {
            return reply(res, 503, {
              error: 'DATAFORGE_CUSTODY_WRITE_AUTHORITY_UNBOUND',
              authority_granted: false,
            });
          }
          let body;
          try {
            body = await readJsonBody(req);
          } catch (error) {
            const code = error?.code || error?.message;
            if (code === 'REQUEST_BODY_TOO_LARGE') {
              return reply(res, 413, { error: 'REQUEST_BODY_TOO_LARGE', authority_granted: false });
            }
            return reply(res, 400, { error: 'REQUEST_BODY_INVALID', authority_granted: false });
          }
          const authorizeArgs = {
            principal_ref: body.principal_ref || body.agent_id,
            agent_id: body.agent_id,
            root_ref: body.root_ref || body.workspace_root_ref,
            workspace_root_ref: body.workspace_root_ref,
            work_ref: body.work_ref || null,
            coordinate_ref: body.coordinate_ref,
            operation: 'custody.put',
          };
          const admission = await authorityAdapter.authorizeWrite(authorizeArgs);
          if (!admission?.admitted) {
            const status =
              admission?.reason === 'DATAFORGE_CUSTODY_WRITE_AUTHORITY_UNBOUND'
                ? 503
                : admission?.reason === 'AUTHORITY_REVOKED'
                  ? 403
                  : 403;
            return reply(res, status, {
              error: admission?.reason || 'AUTHORITY_DENIED',
              authority_granted: false,
              authority_ref: admission?.authority_ref || null,
            });
          }
          // Authorization-at-commit: re-check after authorizeWrite returns, before store.put.
          // Not a fully atomic commit primitive — production remains blocked without request auth.
          if (typeof _testBetweenAuthorizeAndPut === 'function') {
            await _testBetweenAuthorizeAndPut(admission);
          }
          const commitAdmission = await authorityAdapter.authorizeWrite(authorizeArgs);
          if (
            !commitAdmission?.admitted ||
            commitAdmission.authority_fingerprint !== admission.authority_fingerprint
          ) {
            return reply(res, 403, {
              error: 'AUTHORITY_CHANGED_BEFORE_STORE_PUT',
              authority_granted: false,
              authority_ref: admission.authority_ref || null,
              hard: ['AUTHORIZE_RETURN != COMMIT_AUTHORITY', 'TOCTOU_GAP_AFTER_AUTHORIZE != PASS'],
            });
          }
          try {
            const written = await store.put({
              coordinate_ref: body.coordinate_ref,
              root_ref: body.root_ref || body.workspace_root_ref,
              work_ref: body.work_ref || null,
              payload: body.payload,
              source_occurrence_ref: body.source_occurrence_ref || admission.authority_ref,
            });
            return reply(res, written.state === 'STORED' ? 201 : 200, {
              ...written,
              authority_granted: true,
              authority_ref: admission.authority_ref,
              decision_digest: admission.decision_digest,
              commit_authority_fingerprint: commitAdmission.authority_fingerprint,
            });
          } catch (error) {
            const code = String(error?.message || error);
            if (code === 'CUSTODY_COORDINATE_BINDING_CONFLICT') {
              return reply(res, 409, { error: code, authority_granted: true, authority_ref: admission.authority_ref });
            }
            if (code.startsWith('DATAFORGE_') || code.startsWith('CUSTODY_') || code.endsWith('_REQUIRED')) {
              return reply(res, 400, { error: code, authority_granted: true, authority_ref: admission.authority_ref });
            }
            throw error;
          }
        }
        if (req.method === 'GET') {
          const coordinate = url.searchParams.get('coordinate_ref')?.trim();
          if (!coordinate || url.searchParams.getAll('coordinate_ref').length !== 1) {
            return reply(res, 400, { error: 'COORDINATE_REF_REQUIRED', authority_granted: false });
          }
          const row = await store.get(coordinate);
          return row
            ? reply(res, 200, row)
            : reply(res, 404, { error: 'DATAFORGE_CUSTODY_NOT_FOUND', coordinate_ref: coordinate, authority_granted: false });
        }
      }
      return reply(res, 404, { error: 'NOT_FOUND', authority_granted: false });
    } catch (error) {
      return reply(res, 500, {
        error: 'DATAFORGE_CUSTODY_READBACK_FAILED',
        authority_granted: false,
        detail: String(error?.message || error).slice(0, 200),
      });
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.timeout = 10000;
  server.maxHeadersCount = 32;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.env.BINS_CUSTODY_API_ONLY !== '1' || process.env.HOST !== '127.0.0.1' || process.env.PORT !== '8796') {
    throw new Error('EXACT_EXISTING_API_ONLY_LOOPBACK_BINDING_REQUIRED');
  }
  const rootDir = process.env.XIIO_BINS_DATAFORGE_CUSTODY_ROOT;
  await inspectDataForgeCustodyStore(rootDir);
  const server = createDataForgeCustodyServer({ rootDir });
  server.listen(8796, '127.0.0.1');
}
