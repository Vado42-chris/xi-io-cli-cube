// Pasted JSON is a report, never independent evidence of the installed host.
export const MAX_VERSION_REPORT_BYTES = 64 * 1024;
// This P1 warning is about *pasted terminal text*, not a host attestation.
// Historical xiio.cli.version/v1 has no node_path, so absence means NOT_REPORTED.
export function diagnoseP1FromPastedText(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_VERSION_REPORT_BYTES) return null;
  const text=input.trim();
  if (!text || text.startsWith('{') || text.startsWith('[')) return null;
  const failed=text.split(/\r?\n/).some(line =>
    /^(?:bash|sh|zsh|fish)(?::[^:]*)?:\s*(?:xi-io-cli:\s*)?(?:command not found|no such file or directory)|^(?:xi-io-cli:\s*command not found|zsh:\s*command not found:\s*xi-io-cli)|\bxi-io-cli:\s*ENOENT\b/i.test(line));
  if (failed) return {
    type:'violation',
    title:'P1 Invariant Violation: Missing CLI Binary Path',
    message:'Pasted terminal output reports xi-io-cli was not launched. Inspect the installed executable/launcher on the actual host. Pasted text cannot qualify host connectivity.'
  };
  const envNode=/^#!\/usr\/bin\/env\s+node(?:\s|$)/m.test(text);
  const shellNode=/^#!\/bin\/(?:sh|bash)\s*$/m.test(text)
    && /(?:^|\n)\s*(?:exec\s+)?node(?:\s|$)/m.test(text);
  if (envNode || shellNode) return {
    type:'warning',
    title:'P1 Invariant Warning: Non-Standard Shell Wrapper',
    message:'Pasted wrapper text uses ambient PATH to find Node. P1 requires the installed launcher to use the validated absolute fs.realpathSync(process.execPath) executable. This warning is NOT an independent installed-host proof.'
  };
  return null;
}

/** @returns {{status:'idle'|'valid'|'mismatch'|'invalid', detectedSha?:string, details?:string, p1Notice?:{type:'warning'|'violation',title:string,message:string}}} */
export function compareVersionReport(input, expectedSourceSha) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_VERSION_REPORT_BYTES) {
    return {status:'invalid', details:'Version report must be JSON no larger than 64 KiB.'};
  }
  if (!input.trim()) return {status:'idle'};
  let report;
  try { report=JSON.parse(input); }
  catch {
    const p1Notice=diagnoseP1FromPastedText(input);
    return {status:'invalid',
      details: p1Notice ? 'REPORTED P1 LAUNCHER DIAGNOSTIC ONLY; not xiio.cli.version/v1 JSON, no verified source/digest/host.' :
        'Paste the complete xiio.cli.version/v1 JSON object, not a raw hash or terminal prose.',
      ...(p1Notice ? {p1Notice} : {})
    };
  }
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
