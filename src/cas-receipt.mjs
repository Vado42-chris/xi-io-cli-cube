// Local target-format checks only: no authority, network, or host verification.
const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const resource = new RegExp(`^bins:resource:${uuid}$`);
const version = new RegExp(`^bins:resource:${uuid}:sha256:[0-9a-f]{64}$`);
const fields = new Set(['status', 'resource_ref', 'expected_version', 'actual_version', 'actual_sha256', 'timestamp', 'schema', 'competing_agent_id', 'recovery_action']);
export function validateCasReceipt(input) {
  const errors = [];
  let parsed;
  try { parsed = JSON.parse(input); }
  catch { return {valid: false, checked: true, errors: ['Input is not valid JSON']}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {valid: false, checked: true, errors: ['Receipt must be a JSON object']};
  }
  if (parsed.status !== 'REFUSED_STALE_VERSION') errors.push('status must be exactly "REFUSED_STALE_VERSION"');
  if (typeof parsed.resource_ref !== 'string' || !resource.test(parsed.resource_ref)) errors.push('resource_ref must be bins:resource:<canonical UUID>');
  for (const key of ['expected_version', 'actual_version']) {
    const value = parsed[key];
    if (typeof value !== 'string' || !version.test(value)) errors.push(`${key} must be a content-addressed version`);
    else if (value.startsWith('bins:') && !value.startsWith(`${parsed.resource_ref}:sha256:`)) errors.push(`${key} must identify resource_ref`);
  }
  if (typeof parsed.actual_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(parsed.actual_sha256)) errors.push('actual_sha256 must be a lowercase 64-character hex digest');
  else if (typeof parsed.actual_version === 'string' && parsed.actual_version.split(':').at(-1) !== parsed.actual_sha256) errors.push('actual_version digest must match actual_sha256');
  // A UTC target receipt must carry a real calendar date, not Date.parse coercions.
  const stamp = parsed.timestamp;
  const match = typeof stamp === 'string' && /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.exec(stamp);
  if (!match || !Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString().slice(0,10) !== match[1]) errors.push('timestamp must be a valid ISO 8601 UTC date string');
  for (const key of Object.keys(parsed)) {
    if (!fields.has(key)) errors.push(`Unknown field: ${key}`);
    else if (typeof parsed[key] !== 'string') errors.push(`${key} must be a string`);
  }
  if ('recovery_action' in parsed && !['FETCH_LATEST_VERSION_AND_REBASE', 'ABORT_AND_RETRY_WITH_NEW_WORK'].includes(parsed.recovery_action)) errors.push('Unsupported recovery_action');
  return {valid: errors.length === 0, checked: true, errors, parsed};
}
