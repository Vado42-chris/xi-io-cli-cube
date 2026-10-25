/**
 * Read-only projection of actual xi-io-cli V1 install metadata.
 * Source: xi-io-cli@54509965... install.mjs install-receipt/v2.
 *
 * This parser NEVER invents a previous version, release qualification,
 * host status, Rollback operation, Work/Attempt or device authority.
 * It never reads files itself, touches disk/network, or persists data.
 * Browser consumers explicitly supply selected local files.
 */
export const ROLLBACK_PROJECTION_SCHEMA = 'xiio.cli.rollback-history-local-import/v1';
const RECEIPT_SCHEMA = 'xiio.cli.install-receipt/v2';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;
const GENERATION = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const MAX_FILES = 256;
const MAX_RECEIPT_CHARS = 160_000;
const MAX_PROBLEMS = 12;

function error(problems, code) {
  if (problems.length < MAX_PROBLEMS) problems.push(code);
}
function safePath(value) {
  if (typeof value !== 'string' || value.length > 512 ||
      /[\\\r\n\0]/.test(value)) return null;
  const parts = value.replace(/^\/+/, '').split('/');
  if (parts.some(p => p === '..' || p === '.' || p === '')) return null;
  return parts.join('/');
}
function generation(value) {
  return typeof value === 'string' && GENERATION.test(value);
}
function receiptFromText(text) {
  if (typeof text !== 'string' || text.length > MAX_RECEIPT_CHARS) return null;
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema !== RECEIPT_SCHEMA || raw.repo !== 'Vado42-chris/xi-io-cli') return null;
  if (!generation(raw.generation) || !SHA40.test(raw.source_sha)) return null;
  if (!raw.files || typeof raw.files !== 'object' || Array.isArray(raw.files) ||
      !SHA64.test(raw.files['src/xiio.mjs'])) return null;
  if (typeof raw.installed_at !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(raw.installed_at) ||
      !Number.isFinite(Date.parse(raw.installed_at))) return null;
  return Object.freeze({
    generation: raw.generation,
    sourceSha: raw.source_sha,
    recordedBinarySha256: raw.files['src/xiio.mjs'],
    installedAt: raw.installed_at,
  });
}
/**
 * Input rows:
 * - {path:'.../versions/GEN/install-receipt.json',content:'...json...'}
 * - {path:'.../versions/GEN/src/xiio.mjs',sha256:'ACTUALLY_MEASURED_SHA256'}
 * - {path:'.../current',content:'GEN'}, {path:'.../previous',content:'GEN'}
 * For manual single-receipt imports, path 'install-receipt.json' is accepted.
 *
 * sha256 is computed externally from explicitly user-selected File bytes.
 * Never regard a self-declared digest as a verified binary.
 */
export function buildRollbackHistory(rows) {
  const problems = [];
  if (!Array.isArray(rows) || rows.length > MAX_FILES) {
    return Object.freeze({schema:ROLLBACK_PROJECTION_SCHEMA,state:'REFUSED_INPUT',entries:[],problems:['ROLLBACK_INPUT_LIMIT_OR_FORMAT'],pointers:{current:null,previous:null},qualified:false});
  }
  const receipts = new Map();
  const binaries = new Map();
  const pointers = {current:null,previous:null};
  const seenPointers = new Set();
  for (const row of rows) {
    const path = safePath(row?.path);
    if (!path) { error(problems,'INVALID_IMPORT_PATH'); continue; }
    const receiptMatch = path.match(/(?:^|\/)versions\/([^/]+)\/install-receipt\.json$/);
    const binaryMatch = path.match(/(?:^|\/)versions\/([^/]+)\/src\/xiio\.mjs$/);
    if (receiptMatch || path === 'install-receipt.json') {
      const receipt = receiptFromText(row.content);
      if (!receipt || (receiptMatch && receiptMatch[1] !== receipt.generation)) {
        error(problems,'INVALID_OR_MISBOUND_CLI_RECEIPT');
        continue;
      }
      if (receipts.has(receipt.generation)) {
        error(problems,'DUPLICATE_GENERATION_RECEIPT');
      } else receipts.set(receipt.generation, receipt);
      continue;
    }
    if (binaryMatch) {
      const gen = binaryMatch[1];
      if (!generation(gen) || !SHA64.test(row.sha256 || '')) {
        error(problems,'BINARY_DIGEST_UNAVAILABLE_OR_INVALID');
      } else if (binaries.has(gen)) {
        error(problems,'DUPLICATE_BINARY_EVIDENCE');
      } else binaries.set(gen,row.sha256);
      continue;
    }
    const name = path.split('/').at(-1);
    if (name === 'current' || name === 'previous') {
      if (seenPointers.has(name)) { error(problems,'DUPLICATE_ROLLBACK_POINTER'); continue; }
      seenPointers.add(name);
      const content = typeof row.content === 'string' ? row.content.trim() : '';
      if (!generation(content)) {
        error(problems,'INVALID_ROLLBACK_POINTER');
        continue;
      }
      pointers[name] = content;
    }
    // Everything else, including configs, secrets, and unrelated files, is ignored.
  }
  const entries = Array.from(receipts.values()).map(rec => {
    const actual = binaries.get(rec.generation) ?? null;
    return Object.freeze({
      generation: rec.generation,
      sourceSha: rec.sourceSha,
      installedAt: rec.installedAt,
      recordedBinarySha256: rec.recordedBinarySha256,
      observedBinarySha256: actual,
      byteState: actual == null ? 'NOT_READ' : actual === rec.recordedBinarySha256 ? 'BYTE_MATCH' : 'BYTE_MISMATCH',
      pointer: rec.generation === pointers.current && rec.generation === pointers.previous
        ? 'CURRENT_AND_PREVIOUS' : rec.generation === pointers.current ? 'CURRENT'
        : rec.generation === pointers.previous ? 'PREVIOUS' : 'HISTORICAL_RECORD',
      hostVerified: false,
      releaseQualified: false,
    });
  }).sort((a,b) => b.installedAt.localeCompare(a.installedAt) || a.generation.localeCompare(b.generation));
  if (entries.some(e=>e.byteState==='BYTE_MISMATCH')) error(problems,'CLI_BINARY_BYTE_MISMATCH');
  for(const label of ['current','previous']) {
    if (pointers[label] && !receipts.has(pointers[label])) error(problems,'POINTER_TARGET_RECEIPT_NOT_IMPORTED');
  }
  const state = problems.length ? 'REVIEW_REQUIRED'
    : entries.length ? 'RECORDED_ONLY' : 'NO_CLI_RECEIPTS';
  return Object.freeze({
    schema:ROLLBACK_PROJECTION_SCHEMA,
    state,
    entries,
    pointers:Object.freeze(pointers),
    problems,
    qualified:false,
  });
}
