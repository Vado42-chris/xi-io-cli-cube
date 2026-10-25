import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWardAdmission,
  isSyntheticNonQualifyingTraffic,
  executePermittedRead,
  sha256Hex,
  SCHEMAS
} from '../src/lib/hostBridgeAdapter.mjs';

const VALID_SESSION = 'ward:session:3fa85f64-5717-4562-b3fc-2c963f66afa6';
const VALID_RESOURCE = 'bins:resource:3fa85f64-5717-4562-b3fc-2c963f66afa6';
const VALID_CAP = 'ward:capability:file:read:v1';

test('host bridge: validateWardAdmission enforces session, capability token, and canonical resource ref', () => {
  // Valid request
  const valid = validateWardAdmission({
    sessionId: VALID_SESSION,
    capabilityToken: VALID_CAP,
    resourceRef: VALID_RESOURCE,
    targetPath: 'src/index.ts'
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.targetPath, 'src/index.ts');

  // Missing session fails with 401
  const noSession = validateWardAdmission({
    capabilityToken: VALID_CAP,
    resourceRef: VALID_RESOURCE,
    targetPath: 'src/index.ts'
  });
  assert.equal(noSession.valid, false);
  assert.equal(noSession.exitCode, 401);

  // Missing capability token fails with 403
  const noCap = validateWardAdmission({
    sessionId: VALID_SESSION,
    resourceRef: VALID_RESOURCE,
    targetPath: 'src/index.ts'
  });
  assert.equal(noCap.valid, false);
  assert.equal(noCap.exitCode, 403);

  // Unbounded path traversal fails with 400
  const traversal = validateWardAdmission({
    sessionId: VALID_SESSION,
    capabilityToken: VALID_CAP,
    resourceRef: VALID_RESOURCE,
    targetPath: '../outside/secret.txt'
  });
  assert.equal(traversal.valid, false);
  assert.equal(traversal.exitCode, 400);

  const absolutePath = validateWardAdmission({
    sessionId: VALID_SESSION,
    capabilityToken: VALID_CAP,
    resourceRef: VALID_RESOURCE,
    targetPath: '/etc/shadow'
  });
  assert.equal(absolutePath.valid, false);
  assert.equal(absolutePath.exitCode, 400);
});

test('host bridge: validateWardAdmission strictly forbids unrestricted remote shell access (exit code 126)', () => {
  const shellRequests = [
    { action: 'OPEN_REMOTE_SHELL', sessionId: VALID_SESSION, capabilityToken: VALID_CAP, resourceRef: VALID_RESOURCE, targetPath: 'run.sh' },
    { action: 'EXEC_COMMAND', command: '/bin/sh -i', sessionId: VALID_SESSION, capabilityToken: VALID_CAP, resourceRef: VALID_RESOURCE, targetPath: 'run.sh' },
    { action: 'EXEC_COMMAND', command: '/bin/bash -c "cat /etc/passwd"', sessionId: VALID_SESSION, capabilityToken: VALID_CAP, resourceRef: VALID_RESOURCE, targetPath: 'run.sh' },
    { action: 'EXEC_COMMAND', command: 'cmd.exe /c dir', sessionId: VALID_SESSION, capabilityToken: VALID_CAP, resourceRef: VALID_RESOURCE, targetPath: 'run.sh' }
  ];

  for (const req of shellRequests) {
    const res = validateWardAdmission(req);
    assert.equal(res.valid, false);
    assert.equal(res.exitCode, 126);
    assert.equal(res.error, 'REFUSED_UNRESTRICTED_SHELL_FORBIDDEN');
  }
});

test('host bridge: isSyntheticNonQualifyingTraffic detects and disqualifies health pings as evidence', () => {
  assert.equal(isSyntheticNonQualifyingTraffic({ health: 200 }), true);
  assert.equal(isSyntheticNonQualifyingTraffic({ status: 'ok' }), true);
  assert.equal(isSyntheticNonQualifyingTraffic({ pong: true }), true);
  assert.equal(isSyntheticNonQualifyingTraffic({ ping: 'pong' }), true);

  // A real content receipt is NOT synthetic
  assert.equal(isSyntheticNonQualifyingTraffic({
    schema: SCHEMAS.READ_RETURN,
    content_sha256: 'a'.repeat(64),
    byte_length: 120
  }), false);
});

test('host bridge: executePermittedRead executes permitted read and returns unforgeable READ_RETURN receipt with real byte digest', () => {
  const sampleFileContent = 'export function calculateTotal(items: number[]): number {\n  return items.reduce((a, b) => a + b, 0);\n}\n';
  const expectedDigest = sha256Hex(sampleFileContent);

  const mockFileResolver = (path) => {
    if (path === 'src/math.ts') {
      return sampleFileContent;
    }
    return null;
  };

  const req = {
    sessionId: VALID_SESSION,
    capabilityToken: VALID_CAP,
    resourceRef: VALID_RESOURCE,
    targetPath: 'src/math.ts'
  };

  const result = executePermittedRead(req, mockFileResolver);
  assert.equal(result.success, true);
  assert.equal(result.exitCode, 0);

  const receipt = result.receipt;
  assert.equal(receipt.schema, SCHEMAS.READ_RETURN);
  assert.equal(receipt.session_id, VALID_SESSION);
  assert.equal(receipt.capability_token, VALID_CAP);
  assert.equal(receipt.resource_ref, VALID_RESOURCE);
  assert.equal(receipt.target_path, 'src/math.ts');
  assert.equal(receipt.content_sha256, expectedDigest);
  assert.equal(receipt.byte_length, Buffer.byteLength(sampleFileContent, 'utf8'));
  assert.equal(receipt.physical_evidence, 'LOCAL_HOST_READ_VERIFIED');
  assert.equal(receipt.simulated, false);
  assert.ok(receipt.operation_id.startsWith('op_'));

  // Missing file fails with 404
  const missingReq = { ...req, targetPath: 'src/nonexistent.ts' };
  const missingResult = executePermittedRead(missingReq, mockFileResolver);
  assert.equal(missingResult.success, false);
  assert.equal(missingResult.exitCode, 404);
});
