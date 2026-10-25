// Pasted JSON is a report, never independent evidence of the installed host.
export const MAX_VERSION_REPORT_BYTES = 64 * 1024;
/** @returns {{status:'idle'|'valid'|'mismatch'|'invalid', detectedSha?:string, details?:string}} */
export function compareVersionReport(input, expectedSourceSha) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_VERSION_REPORT_BYTES) {
    return {status:'invalid', details:'Version report must be JSON no larger than 64 KiB.'};
  }
  if (!input.trim()) return {status:'idle'};
  let report;
  try { report=JSON.parse(input); }
  catch { return {status:'invalid',details:'Paste the complete xiio.cli.version/v1 JSON object, not a raw hash or terminal prose.'}; }
  if (!report || typeof report!=='object' || Array.isArray(report) || report.schema!=='xiio.cli.version/v1' || report.product!=='xi-io: CLI') {
    return {status:'invalid',details:'Expected a xiio.cli.version/v1 object from xi-io: CLI.'};
  }
  if (typeof report.source_sha!=='string' || !/^[0-9a-f]{40}$/.test(report.source_sha)) {
    return {status:'invalid',details:'source_sha must be a complete lowercase 40-character Git commit SHA.'};
  }
  for (const key of ['running_file_sha256','receipt_file_sha256']) {
    if (typeof report[key]!=='string' || !/^[0-9a-f]{64}$/.test(report[key])) {
      return {status:'invalid',detectedSha:report.source_sha,details:`${key} must be a complete lowercase 64-character SHA-256 digest; missing receipt evidence cannot establish a reported match.`};
    }
  }
  if (!/^[0-9a-f]{40}$/.test(expectedSourceSha)) return {status:'invalid',details:'Candidate source pin is invalid.'};
  if (report.source_sha!==expectedSourceSha) {
    return {status:'mismatch',detectedSha:report.source_sha,details:'REPORTED SOURCE MISMATCH: source_sha does not match the pinned candidate. No repaired-candidate status is inferred.'};
  }
  if (report.running_file_sha256!==report.receipt_file_sha256) {
    return {status:'mismatch',detectedSha:report.source_sha,details:'REPORTED DIGEST MISMATCH: running_file_sha256 differs from receipt_file_sha256.'};
  }
  return {status:'valid',detectedSha:report.source_sha,details:'REPORTED COMPARISON MATCH: source pin and the two supplied file digests agree. Pasted fields are not independent host, installation, or byte-readback verification. Node executable path and wrapper type are NOT_REPORTED by the pinned schema; wrapper status is UNKNOWN. Extra pasted wrapper/path fields are not evidence.'};
}
