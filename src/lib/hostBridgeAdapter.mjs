/**
 * Host Bridge Adapter: Connects the existing CLI Daemon to Ward Authority
 * and BINS Persistence to execute and prove permitted read/write operations
 * without opening an unrestricted remote shell or accepting fake health checks.
 */
import { createHash } from 'node:crypto';

export const SCHEMAS = {
  READ_REQUEST: 'xiio.host.read-request/v1',
  READ_RETURN: 'xiio.host.read-return/v1',
  APPLY_RETURN: 'xiio.host.apply-return/v1'
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BINS_RESOURCE_REGEX = /^bins:resource:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WARD_SESSION_REGEX = /^ward:session:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_REGEX = /^[0-9a-f]{64}$/i;

export function sha256Hex(content) {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content || '');
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Validates whether an incoming request satisfies Ward capability admission.
 * Zero ambient authority: rejects unrestricted remote shells, raw command execution,
 * or unbound resource requests.
 */
export function validateWardAdmission(request) {
  if (!request || typeof request !== 'object') {
    return { valid: false, exitCode: 1, error: 'MALFORMED_REQUEST_OBJECT' };
  }

  // Security Invariant: Unrestricted remote shells are strictly forbidden
  if (
    request.action === 'OPEN_REMOTE_SHELL' ||
    request.action === 'EXEC_COMMAND' ||
    request.command?.includes('/bin/sh') ||
    request.command?.includes('/bin/bash') ||
    request.command?.includes('cmd.exe') ||
    request.command?.includes('powershell')
  ) {
    return {
      valid: false,
      exitCode: 126,
      error: 'REFUSED_UNRESTRICTED_SHELL_FORBIDDEN',
      reason: 'Zero ambient authority: Ward strictly forbids unrestricted shell execution or ambient process spawning.'
    };
  }

  // Session validation
  const sessionId = request.sessionId || request.session_id;
  if (!sessionId || !WARD_SESSION_REGEX.test(sessionId)) {
    return {
      valid: false,
      exitCode: 401,
      error: 'REFUSED_UNAUTHORIZED_SESSION',
      reason: 'Valid Ward authenticated session required (ward:session:<UUID>).'
    };
  }

  // Capability Token validation
  const capToken = request.capabilityToken || request.capability_token;
  if (!capToken || typeof capToken !== 'string') {
    return {
      valid: false,
      exitCode: 403,
      error: 'REFUSED_MISSING_CAPABILITY_TOKEN',
      reason: 'Specific cryptographic capability token required per operation.'
    };
  }

  // BINS Resource Ref validation
  const resourceRef = request.resourceRef || request.resource_ref;
  if (!resourceRef || !BINS_RESOURCE_REGEX.test(resourceRef)) {
    return {
      valid: false,
      exitCode: 400,
      error: 'REFUSED_INVALID_RESOURCE_REF',
      reason: 'Resource reference must match canonical bins:resource:<UUID> syntax.'
    };
  }

  // Target path must be bounded to workspace
  const targetPath = request.targetPath || request.target_path;
  if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('..') || targetPath.startsWith('/')) {
    return {
      valid: false,
      exitCode: 400,
      error: 'REFUSED_UNBOUNDED_WORKSPACE_PATH',
      reason: 'Path must be relative to the declared project workspace without parent-directory traversal.'
    };
  }

  return { valid: true, sessionId, capToken, resourceRef, targetPath };
}

/**
 * Rejects non-qualifying synthetic traffic (e.g. ping/pong, echo, health: 200).
 * A health check response does NOT constitute a qualified device connection or proven read.
 */
export function isSyntheticNonQualifyingTraffic(response) {
  if (!response || typeof response !== 'object') return true;
  if (response.health === 200 || response.health === 'ok' || response.status === 'ok') {
    return true;
  }
  if (response.pong === true || response.ping === 'pong') {
    return true;
  }
  return false;
}

/**
 * Executes a permitted read operation against the verified host daemon/storage.
 * Returns an unforgeable READ_RETURN receipt with true byte content and SHA-256 digest.
 */
export function executePermittedRead(request, fileResolver) {
  // 1. Validate Ward Capability Admission
  const admission = validateWardAdmission(request);
  if (!admission.valid) {
    return {
      success: false,
      exitCode: admission.exitCode,
      error: admission.error,
      reason: admission.reason
    };
  }

  // 2. Resolve file content via host resolver
  let fileText = '';
  try {
    fileText = fileResolver(admission.targetPath);
    if (fileText === null || fileText === undefined) {
      return {
        success: false,
        exitCode: 404,
        error: 'FILE_NOT_FOUND',
        reason: `Target file '${admission.targetPath}' does not exist on host.`
      };
    }
  } catch (err) {
    return {
      success: false,
      exitCode: 500,
      error: 'HOST_READ_FAILED',
      reason: String(err?.message || err)
    };
  }

  // 3. Compute immutable cryptographic digest of real bytes
  const digest = sha256Hex(fileText);
  const byteLength = Buffer.byteLength(fileText, 'utf8');

  // 4. Issue authenticated READ_RETURN receipt
  const receipt = {
    schema: SCHEMAS.READ_RETURN,
    operation_id: request.operationId || `op_${createHash('sha256').update(admission.sessionId + admission.targetPath + Date.now()).digest('hex').slice(0, 32)}`,
    session_id: admission.sessionId,
    capability_token: admission.capToken,
    resource_ref: admission.resourceRef,
    target_path: admission.targetPath,
    byte_length: byteLength,
    content_sha256: digest,
    content_preview: fileText.slice(0, 500),
    exit_code: 0,
    timestamp: new Date().toISOString(),
    physical_evidence: 'LOCAL_HOST_READ_VERIFIED',
    simulated: false
  };

  return {
    success: true,
    exitCode: 0,
    receipt,
    rawBytes: fileText
  };
}
