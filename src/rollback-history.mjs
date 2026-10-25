// Read-only receipt projection. Selected JSON is untrusted evidence, not host state.
export const MAX_RECEIPT_BYTES = 64 * 1024;
export const MAX_RECEIPT_FILES = 32;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f]/.test(value);
export function parseInstallReceipt(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > MAX_RECEIPT_BYTES) throw new Error('Receipt exceeds 64 KiB');
  let value;
  try { value = JSON.parse(source); } catch { throw new Error('Receipt is not valid JSON'); }
  if (!object(value) || value.schema !== 'xiio.cli.install-receipt/v2') throw new Error('Expected xiio.cli.install-receipt/v2 object');
  for (const field of ['installed_at', 'repo', 'ref', 'source_sha', 'generation', 'prefix', 'platform', 'node']) {
    if (!text(value[field])) throw new Error(`Missing or invalid ${field}`);
  }
  if (!/^[0-9a-f]{40}$/.test(value.source_sha)) throw new Error('source_sha must be a 40-character commit SHA');
  // Generation is a bounded opaque basename, never interpreted as a path or authority.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(value.generation)) throw new Error('generation must be a bounded basename');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.installed_at) || !Number.isFinite(Date.parse(value.installed_at)) || new Date(value.installed_at).toISOString() !== value.installed_at) throw new Error('installed_at must be a valid installer UTC timestamp');
  if (!/^[\w.-]+\/[\w.-]+$/.test(value.repo)) throw new Error('repo must be owner/name');
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value.node) || Number(value.node.split('.')[0]) < 22) throw new Error('Pinned installer requires Node 22 or newer');
  if (!object(value.files) || !/^[0-9a-f]{64}$/.test(value.files['src/xiio.mjs']) || !/^[0-9a-f]{64}$/.test(value.files['config/service-catalog.json'])) throw new Error('Missing or invalid installer file SHA-256');
  if (value.models_installed !== 0) throw new Error('Pinned v2 installer records models_installed: 0');
  // Project only contract fields; never render imported HTML or execute paths.
  return Object.fromEntries(['schema','installed_at','repo','ref','source_sha','generation','prefix','platform','node','models_installed'].map(key=>[key,value[key]]).concat([['files', {'src/xiio.mjs':value.files['src/xiio.mjs'],'config/service-catalog.json':value.files['config/service-catalog.json']}]]));
}
export function groupInstallReceipts(receipts) {
  const rows = [];
  for (const receipt of receipts) {
    const scope = JSON.stringify([receipt.repo, receipt.prefix, receipt.platform]);
    const identity = JSON.stringify([scope, receipt.generation, receipt.source_sha, receipt.files['src/xiio.mjs']]);
    const signature = JSON.stringify(receipt);
    const existing = rows.find(row => row.identity === identity && row.signature === signature);
    if (existing) existing.copies += 1;
    else rows.push({scope, identity, signature, receipt, copies:1, conflict:false});
  }
  for (const row of rows) row.conflict = rows.some(other => other !== row && other.scope === row.scope && other.receipt.generation === row.receipt.generation);
  return rows; // Selection order only, never a rollback sequence.
}
export async function readSelectedReceipts(files) {
  if (files.length > MAX_RECEIPT_FILES) return {rows:[], errors:[`Select at most ${MAX_RECEIPT_FILES} receipts` ]};
  const receipts = [], errors = [];
  for (const file of files) {
    try {
      if (file.size > MAX_RECEIPT_BYTES) throw new Error('Receipt exceeds 64 KiB');
      receipts.push(parseInstallReceipt(await file.text()));
    } catch (error) { errors.push(`${String(file.name).slice(0,160)}: ${error instanceof Error ? error.message : 'Cannot read receipt'}`); }
  }
  return {rows:groupInstallReceipts(receipts), errors};
}
