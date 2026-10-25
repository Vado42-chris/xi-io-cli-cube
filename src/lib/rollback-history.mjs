/**
 * Read-only projection of CLI V1's ACTUAL on-disk rollback layout:
 *   <prefix>/current, <prefix>/previous (generation pointer text files)
 *   <prefix>/versions/<generation>/install-receipt.json (v2 per-generation)
 *   <prefix>/versions/<generation>/src/xiio.mjs (optional byte check)
 *
 * There is no single CLI V1 rollback-history.json authority. Selected files
 * are untrusted local data, not permission to install, roll back, or run tools.
 */
const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;
const GENERATION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const RECEIPT = /(?:^|\/)versions\/([^/]+)\/install-receipt\.json$/;
const EXECUTABLE = /(?:^|\/)versions\/([^/]+)\/src\/xiio\.mjs$/;
const MAX_RECORDS = 128;
const MAX_TEXT = 64 * 1024;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function cleanPath(value) {
  const text = String(value || '').replaceAll('\\', '/');
  if (text.includes('\0') || text.split('/').some(part => part === '..')) return '';
  return text;
}
function pointerName(path) {
  if (/(?:^|\/)current$/.test(path)) return 'current';
  if (/(?:^|\/)previous$/.test(path)) return 'previous';
  return null;
}
export function classifyRollbackFile(path) {
  const clean = cleanPath(path);
  if (!clean) return null;
  if (RECEIPT.test(clean) || clean === 'install-receipt.json') return 'receipt';
  if (EXECUTABLE.test(clean)) return 'executable';
  return pointerName(clean) ? 'pointer' : null;
}

/**
 * @param {Array<{path:string, content?:string, sha256?:string}>} records
 * sha256 is calculated from the user-selected executable bytes by the caller,
 * not asserted by a remote host or this parser.
 */
export function parseRollbackHistory(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) {
    return {state: 'INVALID', firstRed: 'ROLLBACK_FILE_COUNT_INVALID', rows: [], errors: ['Select at most 128 relevant CLI files.']};
  }
  const errors = [];
  const receipts = new Map();
  const binaries = new Map();
  const pointers = {current: null, previous: null};
  const suppliedPointers = new Set();

  for (const input of records) {
    const path = cleanPath(input?.path);
    const kind = classifyRollbackFile(path);
    if (!kind) continue;
    if (kind === 'pointer') {
      const name = pointerName(path);
      if (suppliedPointers.has(name)) { errors.push('Duplicate ' + name + ' pointer: selection is ambiguous.'); continue; }
      suppliedPointers.add(name);
      if (typeof input.content !== 'string' || input.content.length > 256) {
        errors.push('Invalid ' + name + ' pointer.'); continue;
      }
      const value = input.content.trim();
      if (value && !GENERATION.test(value)) { errors.push('Unsafe ' + name + ' generation pointer.'); continue; }
      pointers[name] = value || null;
      continue;
    }
    if (kind === 'executable') {
      const generation = path.match(EXECUTABLE)?.[1];
      if (!generation || !GENERATION.test(generation) || typeof input.sha256 !== 'string' || !SHA64.test(input.sha256)) {
        errors.push('Executable digest is absent or malformed.'); continue;
      }
      if (binaries.has(generation)) errors.push('Duplicate executable for ' + generation + '.');
      else binaries.set(generation, input.sha256);
      continue;
    }
    if (typeof input.content !== 'string' || input.content.length > MAX_TEXT) {
      errors.push('Installation receipt exceeds 64 KiB or is not readable.'); continue;
    }
    let data;
    try { data = JSON.parse(input.content); }
    catch { errors.push('Unparseable CLI install-receipt JSON.'); continue; }
    if (!isObject(data) || data.schema !== 'xiio.cli.install-receipt/v2' ||
        data.repo !== 'Vado42-chris/xi-io-cli' ||
        typeof data.generation !== 'string' || !GENERATION.test(data.generation) ||
        !SHA40.test(data.source_sha) || !isObject(data.files) ||
        !SHA64.test(data.files['src/xiio.mjs']) ||
        typeof data.installed_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(data.installed_at) ||
        !Number.isFinite(Date.parse(data.installed_at)) ||
        !['linux','win32','darwin'].includes(data.platform)) {
      errors.push('Invalid or unsupported CLI install-receipt/v2.'); continue;
    }
    const pathGeneration = path.match(RECEIPT)?.[1];
    if (pathGeneration && pathGeneration !== data.generation) {
      errors.push('Receipt generation does not match its folder.'); continue;
    }
    if (receipts.has(data.generation)) {
      errors.push('Duplicate generation receipt: ' + data.generation + '.'); continue;
    }
    receipts.set(data.generation, {
      generation: data.generation,
      installedAt: data.installed_at,
      sourceSha: data.source_sha,
      binarySha256: data.files['src/xiio.mjs'],
      platform: data.platform,
    });
  }
  if (pointers.current && pointers.previous && pointers.current === pointers.previous) {
    errors.push('Current and previous pointers refer to the same generation.');
  }
  for (const name of ['current', 'previous']) {
    if (pointers[name] && !receipts.has(pointers[name])) {
      errors.push(name + ' points to a generation without a selected receipt.');
    }
  }
  const rows = [...receipts.values()].map(record => {
    const actual = binaries.get(record.generation) || null;
    if (actual && actual !== record.binarySha256) {
      errors.push('Selected executable bytes differ from receipt for ' + record.generation + '.');
    }
    return {
      ...record,
      pointer: pointers.current === record.generation ? 'current' : pointers.previous === record.generation ? 'previous' : 'retained',
      byteCheck: !actual ? 'NOT_CHECKED' : actual === record.binarySha256 ? 'MATCHED_SELECTED_BYTES' : 'MISMATCH',
    };
  }).sort((a,b) => b.installedAt.localeCompare(a.installedAt) || a.generation.localeCompare(b.generation));
  const state = errors.length ? 'PARTIAL' : rows.length ? 'RECORDED' : 'EMPTY';
  return {
    state,
    firstRed: errors.length ? 'ROLLBACK_INPUT_INVALID_OR_UNVERIFIED' : rows.length ? null : 'ROLLBACK_METADATA_NOT_SELECTED',
    rows,
    errors,
    pointers,
    qualification: 'RECEIPT_PROJECTION_ONLY',
  };
}
