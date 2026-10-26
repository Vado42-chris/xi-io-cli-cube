import { createHash } from "node:crypto";
import {
  createOperationalApproval,
  createOperationalAttemptBase,
  createOperationalProposal,
  validateOperationalAdapterResult,
} from "./operational-job.ts";

export const DEVICE_EXECUTE_SCHEMA = "xiio.switchboard.device-execute/v1";
export const DEVICE_EXECUTE_ATTEMPT_SCHEMA = "xiio.switchboard.device-execute-attempt/v1";
export const DEVICE_EXECUTE_CAPABILITY_ID = "device.execute";

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const REQUEST_FIELDS = Object.freeze([
  "workRef","occurrenceId","generation","deviceRef","workerTargetRef","workerTargetDigest",
  "assignmentRef","leaseRef","principalRef","operationType","targetRefs","sourceGeneration",
  "installedGeneration","executorRef","executorDigest","requestedAt",
]);

const text = (value, key, max = 256) => {
  if (typeof value !== "string" || !value || value.length > max || /[\r\n\0]/.test(value)) {
    throw new TypeError(`${key}_INVALID`);
  }
  return value;
};

function locatorLike(value) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)
    || value.startsWith("/")
    || value.startsWith("./")
    || value.startsWith("../")
    || value.includes("\\")
    || /(^|\/)\.\.(\/|$)/.test(value);
}

const ref = (value, key) => {
  const candidate = text(value, key);
  if (!REF.test(candidate) || locatorLike(candidate)) throw new TypeError(`${key}_REF_INVALID`);
  return candidate;
};

function logicalRefOrNull(value, key) {
  try { return ref(value, key); } catch { return null; }
}

const sha256 = (value, key) => {
  const candidate = text(value, key, 64);
  if (!SHA.test(candidate)) throw new TypeError(`${key}_SHA256_INVALID`);
  return candidate;
};

const utc = (value, key) => {
  const candidate = text(value, key, 32);
  if (!UTC.test(candidate) || !Number.isFinite(Date.parse(candidate))) throw new TypeError(`${key}_UTC_INVALID`);
  return candidate;
};

const refs = (value, key) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) throw new TypeError(`${key}_INVALID`);
  const normalized = value.map((entry, index) => ref(entry, `${key}[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${key}_DUPLICATE`);
  return [...normalized].sort();
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = stable(value[key]);
    }
    return out;
  }
  return value;
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function byteView(value, key) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${key}_BYTES_REQUIRED`);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function digestBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

function request(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("REQUEST_INVALID");
  const unknown = Object.keys(raw).filter((key) => !REQUEST_FIELDS.includes(key));
  if (unknown.length) throw new TypeError(`REQUEST_FIELD_FORBIDDEN:${unknown.sort().join(",")}`);
  const out = Object.freeze({
    workRef: ref(raw.workRef, "workRef"),
    occurrenceId: ref(raw.occurrenceId, "occurrenceId"),
    generation: ref(raw.generation, "generation"),
    deviceRef: ref(raw.deviceRef, "deviceRef"),
    workerTargetRef: ref(raw.workerTargetRef, "workerTargetRef"),
    workerTargetDigest: sha256(raw.workerTargetDigest, "workerTargetDigest"),
    assignmentRef: ref(raw.assignmentRef, "assignmentRef"),
    leaseRef: ref(raw.leaseRef, "leaseRef"),
    principalRef: ref(raw.principalRef, "principalRef"),
    operationType: ref(raw.operationType, "operationType"),
    targetRefs: refs(raw.targetRefs, "targetRefs"),
    sourceGeneration: ref(raw.sourceGeneration, "sourceGeneration"),
    installedGeneration: ref(raw.installedGeneration, "installedGeneration"),
    executorRef: ref(raw.executorRef, "executorRef"),
    executorDigest: sha256(raw.executorDigest, "executorDigest"),
    requestedAt: utc(raw.requestedAt, "requestedAt"),
  });
  if (!out.principalRef.startsWith("principal:")) throw new TypeError("PRINCIPAL_REF_REQUIRED");
  if (out.sourceGeneration !== out.installedGeneration) throw new TypeError("SOURCE_INSTALL_GENERATION_MISMATCH");
  return out;
}

function resultShell(r, state, firstRed, extra = {}) {
  return {
    schema: DEVICE_EXECUTE_SCHEMA,
    state,
    firstRed,
    workRef: r.workRef,
    occurrenceId: r.occurrenceId,
    generation: r.generation,
    deviceRef: r.deviceRef,
    requestedAt: r.requestedAt,
    attemptedAt: null,
    jobId: null,
    idempotencyKey: null,
    semanticKey: null,
    claimRef: null,
    claimReadbackRef: null,
    wardGrantRef: null,
    targetObservationRef: null,
    executorQualificationRef: null,
    operationalReceipt: null,
    resultReadback: null,
    binsAttemptReceipt: null,
    authorityGranted: false,
    providerEffect: false,
    returnCertified: false,
    reconciled: false,
    ...extra,
  };
}

function observeTimeRed(r, observation) {
  if (!observation || observation.state !== "QUALIFIED") return "EXECUTION_TIME_NOT_QUALIFIED";
  if (
    !logicalRefOrNull(observation.clockRef, "clock.clockRef")
    || !logicalRefOrNull(observation.observationRef, "clock.observationRef")
    || !logicalRefOrNull(observation.evidenceRef, "clock.evidenceRef")
    || !logicalRefOrNull(observation.generation, "clock.generation")
    || !UTC.test(String(observation.observedAt || ""))
  ) return "EXECUTION_TIME_EVIDENCE_INVALID";
  if (Date.parse(observation.observedAt) < Date.parse(r.requestedAt)) return "EXECUTION_TIME_PRECEDES_REQUEST";
  return null;
}

const mismatch = (actual, expected, code) => actual === expected ? null : code;

function targetRed(r, target, at) {
  if (!target || target.state !== "QUALIFIED") return "WORKER_TARGET_NOT_QUALIFIED";
  for (const row of [
    [target.deviceRef, r.deviceRef, "DEVICE_REF_MISMATCH"],
    [target.workerTargetRef, r.workerTargetRef, "WORKER_TARGET_REF_MISMATCH"],
    [target.targetDefinitionDigest, r.workerTargetDigest, "WORKER_TARGET_DIGEST_MISMATCH"],
    [target.assignmentRef, r.assignmentRef, "ASSIGNMENT_REF_MISMATCH"],
    [target.leaseRef, r.leaseRef, "LEASE_REF_MISMATCH"],
    [target.principalRef, r.principalRef, "PRINCIPAL_REF_MISMATCH"],
    [target.capabilityId, DEVICE_EXECUTE_CAPABILITY_ID, "WORKER_TARGET_CAPABILITY_MISMATCH"],
    [target.operationType, r.operationType, "WORKER_TARGET_OPERATION_MISMATCH"],
    [target.effect, "read_only", "WORKER_TARGET_EFFECT_MISMATCH"],
    [target.sourceGeneration, r.sourceGeneration, "SOURCE_GENERATION_MISMATCH"],
    [target.installedGeneration, r.installedGeneration, "INSTALLED_GENERATION_MISMATCH"],
    [target.executorRef, r.executorRef, "EXECUTOR_REF_MISMATCH"],
    [target.executorDigest, r.executorDigest, "EXECUTOR_DIGEST_MISMATCH"],
  ]) {
    const red = mismatch(...row);
    if (red) return red;
  }
  if (
    !logicalRefOrNull(target.observationRef, "target.observationRef")
    || !logicalRefOrNull(target.qualificationRef, "target.qualificationRef")
    || !logicalRefOrNull(target.evidenceRef, "target.evidenceRef")
    || !logicalRefOrNull(target.executorQualificationRef, "target.executorQualificationRef")
    || !UTC.test(String(target.observedAt || ""))
    || !UTC.test(String(target.freshUntil || ""))
  ) return "TARGET_OBSERVATION_INVALID";
  const ms = Date.parse(at);
  if (Date.parse(target.observedAt) > ms || Date.parse(target.freshUntil) < ms) {
    return "WORKER_TARGET_OBSERVATION_STALE";
  }
  return null;
}

function grantRed(r, grant, target, at) {
  if (!grant || grant.state !== "ADMITTED") return "WARD_ADMISSION_REQUIRED";
  for (const row of [
    [grant.workRef, r.workRef, "WARD_WORK_MISMATCH"],
    [grant.occurrenceId, r.occurrenceId, "WARD_OCCURRENCE_MISMATCH"],
    [grant.generation, r.generation, "WARD_GENERATION_MISMATCH"],
    [grant.principalRef, r.principalRef, "WARD_PRINCIPAL_MISMATCH"],
    [grant.assignmentRef, r.assignmentRef, "WARD_ASSIGNMENT_MISMATCH"],
    [grant.leaseRef, r.leaseRef, "WARD_LEASE_MISMATCH"],
    [grant.deviceRef, r.deviceRef, "WARD_DEVICE_MISMATCH"],
    [grant.workerTargetRef, r.workerTargetRef, "WARD_WORKER_TARGET_MISMATCH"],
    [grant.workerTargetDigest, r.workerTargetDigest, "WARD_WORKER_TARGET_DIGEST_MISMATCH"],
    [grant.capabilityId, DEVICE_EXECUTE_CAPABILITY_ID, "WARD_CAPABILITY_MISMATCH"],
    [grant.operationType, r.operationType, "WARD_OPERATION_MISMATCH"],
    [grant.effect, "read_only", "WARD_EFFECT_MISMATCH"],
    [grant.sourceGeneration, r.sourceGeneration, "WARD_SOURCE_GENERATION_MISMATCH"],
    [grant.installedGeneration, r.installedGeneration, "WARD_INSTALLED_GENERATION_MISMATCH"],
    [grant.executorRef, r.executorRef, "WARD_EXECUTOR_REF_MISMATCH"],
    [grant.executorDigest, r.executorDigest, "WARD_EXECUTOR_DIGEST_MISMATCH"],
    [grant.executorQualificationRef, target.executorQualificationRef, "WARD_EXECUTOR_QUALIFICATION_MISMATCH"],
  ]) {
    const red = mismatch(...row);
    if (red) return red;
  }
  if (
    !logicalRefOrNull(grant.grantRef, "grant.grantRef")
    || !logicalRefOrNull(grant.evidenceRef, "grant.evidenceRef")
    || !UTC.test(String(grant.decidedAt || ""))
    || !UTC.test(String(grant.expiresAt || ""))
  ) return "WARD_EVIDENCE_INVALID";
  const requested = Date.parse(r.requestedAt);
  const measured = Date.parse(at);
  const decided = Date.parse(grant.decidedAt);
  const expires = Date.parse(grant.expiresAt);
  if (decided < requested || decided > measured || expires < measured) return "WARD_GRANT_EXPIRED_OR_NOT_YET_VALID";
  return null;
}

function executorRed(r, resolved, target, at) {
  if (!resolved || resolved.executorRef !== r.executorRef || resolved.executorDigest !== r.executorDigest || !resolved.adapter) {
    return "EXECUTOR_BINDING_MISMATCH";
  }
  const q = resolved.qualification;
  if (!q || q.state !== "QUALIFIED") return "EXECUTOR_NOT_QUALIFIED";
  for (const row of [
    [q.executorRef, r.executorRef, "EXECUTOR_QUALIFICATION_REF_MISMATCH"],
    [q.executorDigest, r.executorDigest, "EXECUTOR_QUALIFICATION_DIGEST_MISMATCH"],
    [q.capabilityId, DEVICE_EXECUTE_CAPABILITY_ID, "EXECUTOR_QUALIFICATION_CAPABILITY_MISMATCH"],
    [q.operationType, r.operationType, "EXECUTOR_QUALIFICATION_OPERATION_MISMATCH"],
    [q.effect, "read_only", "EXECUTOR_QUALIFICATION_EFFECT_MISMATCH"],
    [q.qualificationRef, target.executorQualificationRef, "EXECUTOR_QUALIFICATION_TARGET_MISMATCH"],
  ]) {
    const red = mismatch(...row);
    if (red) return red;
  }
  if (
    !logicalRefOrNull(q.qualificationRef, "executor.qualificationRef")
    || !logicalRefOrNull(q.evidenceRef, "executor.evidenceRef")
    || !UTC.test(String(q.observedAt || ""))
    || !UTC.test(String(q.freshUntil || ""))
  ) return "EXECUTOR_QUALIFICATION_INVALID";
  const ms = Date.parse(at);
  if (Date.parse(q.observedAt) > ms || Date.parse(q.freshUntil) < ms) return "EXECUTOR_QUALIFICATION_STALE";
  if (resolved.adapter.adapterId !== q.adapterId) return "EXECUTOR_ADAPTER_ID_MISMATCH";
  if (!Array.isArray(resolved.adapter.capabilities) || !resolved.adapter.capabilities.includes(DEVICE_EXECUTE_CAPABILITY_ID)) {
    return "EXECUTOR_ADAPTER_CAPABILITY_MISMATCH";
  }
  if (!Array.isArray(resolved.adapter.effects) || !resolved.adapter.effects.includes("read_only")) {
    return "EXECUTOR_ADAPTER_EFFECT_MISMATCH";
  }
  if (typeof resolved.adapter.execute !== "function") return "EXECUTOR_ADAPTER_EXECUTE_MISSING";
  return null;
}

function semanticKey(r) {
  // One immutable operation identity across qualified executor/model changes.
  // The subject device, Work occurrence/generation, operation and target set
  // determine exactly-once semantics. Assignment, lease, principal, target
  // qualification and executor belong to each attempted execution, not here.
  // Cross-device migration requires its own admitted semantic operation.
  return `device-execute:${digestJson({
    workRef: r.workRef,
    occurrenceId: r.occurrenceId,
    generation: r.generation,
    deviceRef: r.deviceRef,
    operationType: r.operationType,
    targetRefs: r.targetRefs,
  })}`;
}

function claimReadbackRed(r, raw, claimInput, response) {
  const key = claimInput.semanticKey;
  if (!raw || raw.state !== "CLAIMED" || raw.durable !== true || raw.transactionalUnique !== true) {
    return "DURABLE_CLAIM_READBACK_REQUIRED";
  }
  // A duplicate's readback is the ORIGINAL immutable claim, not a claim
  // minted for the replacement executor. Reject any altered logical subject,
  // but retain original assignment/executor/proposal provenance verbatim.
  const duplicate = response?.state === "DUPLICATE" || !!raw.existingReceiptRef;
  const operationBindings = [
    [raw.semanticKey, key, "CLAIM_SEMANTIC_KEY_MISMATCH"],
    [raw.workRef, r.workRef, "CLAIM_WORK_MISMATCH"],
    [raw.occurrenceId, r.occurrenceId, "CLAIM_OCCURRENCE_MISMATCH"],
    [raw.generation, r.generation, "CLAIM_GENERATION_MISMATCH"],
    [raw.deviceRef, r.deviceRef, "CLAIM_DEVICE_MISMATCH"],
  ];
  const attemptBindings = [
    [raw.proposalId, claimInput.proposalId, "CLAIM_PROPOSAL_ID_MISMATCH"],
    [raw.proposalDigest, claimInput.proposalDigest, "CLAIM_PROPOSAL_DIGEST_MISMATCH"],
    [raw.workerTargetRef, r.workerTargetRef, "CLAIM_WORKER_TARGET_MISMATCH"],
    [raw.workerTargetDigest, r.workerTargetDigest, "CLAIM_WORKER_TARGET_DIGEST_MISMATCH"],
    [raw.assignmentRef, r.assignmentRef, "CLAIM_ASSIGNMENT_MISMATCH"],
    [raw.leaseRef, r.leaseRef, "CLAIM_LEASE_MISMATCH"],
    [raw.principalRef, r.principalRef, "CLAIM_PRINCIPAL_MISMATCH"],
    [raw.sourceGeneration, r.sourceGeneration, "CLAIM_SOURCE_GENERATION_MISMATCH"],
    [raw.installedGeneration, r.installedGeneration, "CLAIM_INSTALLED_GENERATION_MISMATCH"],
    [raw.executorRef, r.executorRef, "CLAIM_EXECUTOR_REF_MISMATCH"],
    [raw.executorDigest, r.executorDigest, "CLAIM_EXECUTOR_DIGEST_MISMATCH"],
  ];
  for (const row of duplicate ? operationBindings : [...operationBindings, ...attemptBindings]) {
    const red = mismatch(...row);
    if (red) return red;
  }
  if (duplicate) {
    // Historical claim metadata must still be intact and typed; it must not
    // be compared to the NEW attempt, whose Ward/target/executor qualification
    // was already re-observed and admitted before querying the claim store.
    if (!logicalRefOrNull(raw.proposalId, "claim.proposalId")
      || typeof raw.proposalDigest !== "string" || !SHA.test(raw.proposalDigest)
      || !logicalRefOrNull(raw.workerTargetRef, "claim.workerTargetRef")
      || typeof raw.workerTargetDigest !== "string" || !SHA.test(raw.workerTargetDigest)
      || !logicalRefOrNull(raw.assignmentRef, "claim.assignmentRef")
      || !logicalRefOrNull(raw.leaseRef, "claim.leaseRef")
      || !logicalRefOrNull(raw.principalRef, "claim.principalRef")
      || !logicalRefOrNull(raw.sourceGeneration, "claim.sourceGeneration")
      || !logicalRefOrNull(raw.installedGeneration, "claim.installedGeneration")
      || !logicalRefOrNull(raw.executorRef, "claim.executorRef")
      || typeof raw.executorDigest !== "string" || !SHA.test(raw.executorDigest)) {
      return "PRIOR_CLAIM_PROVENANCE_INVALID";
    }
  }
  if (
    !logicalRefOrNull(raw.claimRef, "claim.claimRef")
    || !logicalRefOrNull(raw.claimStoreRef, "claim.claimStoreRef")
    || !logicalRefOrNull(raw.evidenceRef, "claim.evidenceRef")
    || !logicalRefOrNull(raw.claimGeneration, "claim.claimGeneration")
  ) return "CLAIM_READBACK_EVIDENCE_INVALID";
  if (response?.claimRef && response.claimRef !== raw.claimRef) return "CLAIM_RESPONSE_READBACK_MISMATCH";
  return null;
}

function verifyResultReadback(raw, expectedResourceRef, expectedOccurrenceRef) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("BINS_RESULT_READBACK_INVALID");
  const resourceRef = ref(raw.resourceRef, "result.resourceRef");
  const versionRef = ref(raw.versionRef, "result.versionRef");
  const storageBindingRef = ref(raw.storageBindingRef, "result.storageBindingRef");
  const occurrenceRef = ref(raw.occurrenceRef, "result.occurrenceRef");
  const readbackRef = ref(raw.readbackRef, "result.readbackRef");
  if (resourceRef !== expectedResourceRef || occurrenceRef !== expectedOccurrenceRef) throw new TypeError("BINS_RESULT_BINDING_MISMATCH");
  const expectedSha256 = sha256(raw.sha256, "result.sha256");
  const expectedBytes = Number(raw.bytes);
  if (!Number.isInteger(expectedBytes) || expectedBytes < 0) throw new TypeError("BINS_RESULT_SIZE_INVALID");
  const content = byteView(raw.contentBytes, "result.content");
  const observedSha256 = digestBytes(content);
  const observedBytes = content.byteLength;
  if (expectedSha256 !== observedSha256 || expectedBytes !== observedBytes) throw new TypeError("BINS_RESULT_BYTE_READBACK_MISMATCH");
  return Object.freeze({
    occurrenceRef,
    resourceRef,
    versionRef,
    storageBindingRef,
    sha256: observedSha256,
    bytes: observedBytes,
    readbackRef,
    fullBytesRetrieved: true,
  });
}

function localOperationalReceipt({ key, state, firstRed, adapterInvoked = false, mutationPerformed = false }) {
  return Object.freeze({
    schemaVersion: "device-execute-local",
    jobId: null,
    attemptId: `device-attempt:${digestJson({ semanticKey: key, state, firstRed })}`,
    status: state === "OUTCOME_UNKNOWN" ? "outcome_unknown" : state === "BLOCKED" ? "blocked" : "failed",
    evidenceState: state === "OUTCOME_UNKNOWN" ? "unknown" : state === "BLOCKED" ? "blocked" : "failed",
    execution: { adapterInvoked, mutationPerformed },
    evidence: { redacted: false, redactionProvenanceRef: null, refs: [], observedResourceRefs: [] },
    failure: { failureClassId: firstRed },
  });
}

function attemptEnvelope({
  r, target, grant, qualification, semanticKeyValue, claimRef, claimReadbackRef,
  op, resultReadback, attemptedAt, terminalState, firstRed,
}) {
  return Object.freeze(stable({
    schema: DEVICE_EXECUTE_ATTEMPT_SCHEMA,
    semanticKey: semanticKeyValue,
    terminalState,
    firstRed: firstRed || null,
    workRef: r.workRef,
    occurrenceId: r.occurrenceId,
    generation: r.generation,
    deviceRef: r.deviceRef,
    workerTargetRef: r.workerTargetRef,
    workerTargetDigest: r.workerTargetDigest,
    targetObservationRef: target?.observationRef || null,
    assignmentRef: r.assignmentRef,
    leaseRef: r.leaseRef,
    principalRef: r.principalRef,
    wardGrantRef: grant?.grantRef || null,
    capabilityId: DEVICE_EXECUTE_CAPABILITY_ID,
    operationType: r.operationType,
    sourceGeneration: r.sourceGeneration,
    installedGeneration: r.installedGeneration,
    executorRef: r.executorRef,
    executorDigest: r.executorDigest,
    executorQualificationRef: qualification?.qualificationRef || null,
    claimRef,
    claimReadbackRef,
    jobId: op?.jobId || null,
    attemptId: op?.attemptId || null,
    operationalStatus: op?.status || null,
    operationalFailureClass: op?.failure?.failureClassId || null,
    providerEffect: op?.execution?.mutationPerformed ?? null,
    resultReadback: resultReadback || null,
    attemptedAt,
    returnCertified: false,
  }));
}

function encodeEnvelope(envelope) {
  return new TextEncoder().encode(JSON.stringify(stable(envelope)) + "\n");
}

function verifyAttemptReadback(raw, receiptMeta, expectedBytes, semanticKeyValue) {
  if (!receiptMeta || receiptMeta.durable !== true) throw new TypeError("BINS_ATTEMPT_RECEIPT_INVALID");
  const receiptRef = ref(receiptMeta.receiptRef, "attempt.receiptRef");
  const expectedSha = sha256(receiptMeta.sha256, "attempt.sha256");
  const expectedSize = Number(receiptMeta.bytes);
  if (!Number.isInteger(expectedSize) || expectedSize <= 0) throw new TypeError("BINS_ATTEMPT_RECEIPT_INVALID");
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.receiptRef !== receiptRef) {
    throw new TypeError("BINS_ATTEMPT_READBACK_INVALID");
  }
  const content = byteView(raw.contentBytes, "attempt.content");
  const observedSha = digestBytes(content);
  if (observedSha !== expectedSha || content.byteLength !== expectedSize || !sameBytes(content, expectedBytes)) {
    throw new TypeError("BINS_ATTEMPT_READBACK_MISMATCH");
  }
  const decoded = JSON.parse(new TextDecoder().decode(content));
  if (decoded.schema !== DEVICE_EXECUTE_ATTEMPT_SCHEMA || decoded.semanticKey !== semanticKeyValue) {
    throw new TypeError("BINS_ATTEMPT_BINDING_MISMATCH");
  }
  return Object.freeze({
    receiptRef,
    sha256: observedSha,
    bytes: content.byteLength,
    readbackRef: ref(raw.readbackRef, "attempt.readbackRef"),
    durable: true,
    fullBytesRetrieved: true,
  });
}

function reconcileExistingReceipt(raw, receiptRefValue, r, semanticKeyValue) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.receiptRef !== receiptRefValue) {
    throw new TypeError("DUPLICATE_RECEIPT_READBACK_INVALID");
  }
  const content = byteView(raw.contentBytes, "duplicate.content");
  const decoded = JSON.parse(new TextDecoder().decode(content));
  if (
    decoded.schema !== DEVICE_EXECUTE_ATTEMPT_SCHEMA
    || decoded.semanticKey !== semanticKeyValue
    || decoded.workRef !== r.workRef
    || decoded.occurrenceId !== r.occurrenceId
    || decoded.generation !== r.generation
    || decoded.deviceRef !== r.deviceRef
  ) throw new TypeError("DUPLICATE_RECEIPT_BINDING_MISMATCH");
  return {
    envelope: decoded,
    receipt: Object.freeze({
      receiptRef: receiptRefValue,
      sha256: digestBytes(content),
      bytes: content.byteLength,
      readbackRef: ref(raw.readbackRef, "duplicate.readbackRef"),
      durable: true,
      fullBytesRetrieved: true,
    }),
  };
}

async function persistOutcome({
  r, ports, target, grant, qualification, semanticKeyValue, claimRef, claimReadbackRef,
  op, resultReadback, attemptedAt, terminalState, firstRed, common,
}) {
  const envelope = attemptEnvelope({
    r, target, grant, qualification, semanticKeyValue, claimRef, claimReadbackRef,
    op, resultReadback, attemptedAt, terminalState, firstRed,
  });
  const attemptBytes = encodeEnvelope(envelope);
  const attemptSha = digestBytes(attemptBytes);

  let receiptMeta;
  try {
    receiptMeta = await ports.recordAttempt({
      attemptEnvelope: envelope,
      contentBytes: attemptBytes,
      sha256: attemptSha,
      bytes: attemptBytes.byteLength,
    });
  } catch {
    return resultShell(r, "OUTCOME_UNKNOWN", "BINS_ATTEMPT_RECORD_OUTCOME_UNKNOWN", {
      ...common,
      attemptedAt,
      operationalReceipt: op,
      resultReadback,
      providerEffect: op?.execution?.mutationPerformed ?? null,
    });
  }

  if (
    !receiptMeta
    || receiptMeta.durable !== true
    || receiptMeta.sha256 !== attemptSha
    || receiptMeta.bytes !== attemptBytes.byteLength
  ) {
    return resultShell(r, "OUTCOME_UNKNOWN", "BINS_ATTEMPT_RECEIPT_UNVERIFIED", {
      ...common,
      attemptedAt,
      operationalReceipt: op,
      resultReadback,
      providerEffect: op?.execution?.mutationPerformed ?? null,
    });
  }

  let receipt;
  try {
    const receiptRef = ref(receiptMeta.receiptRef, "attempt.receiptRef");
    receipt = verifyAttemptReadback(
      await ports.readAttemptReceipt(receiptRef),
      { ...receiptMeta, receiptRef },
      attemptBytes,
      semanticKeyValue,
    );
  } catch {
    return resultShell(r, "OUTCOME_UNKNOWN", "BINS_ATTEMPT_READBACK_UNVERIFIED", {
      ...common,
      attemptedAt,
      operationalReceipt: op,
      resultReadback,
      binsAttemptReceipt: receiptMeta,
      providerEffect: op?.execution?.mutationPerformed ?? null,
    });
  }

  return resultShell(r, terminalState, firstRed || null, {
    ...common,
    attemptedAt,
    operationalReceipt: op,
    resultReadback,
    binsAttemptReceipt: receipt,
    providerEffect: op?.execution?.mutationPerformed ?? null,
  });
}

async function observeQualifiedTime(r, ports, phase) {
  let observed;
  try { observed = await ports.observeTime({ request: r, phase }); }
  catch { return { red: "EXECUTION_TIME_OBSERVATION_FAILED", observed: null }; }
  const red = observeTimeRed(r, observed);
  return { red, observed };
}

export async function executeDeviceRead(raw, ports) {
  const r = request(raw);
  for (const name of [
    "observeTime","observeTarget","authorize","claim","readClaim","resolveExecutor",
    "readResult","recordAttempt","readAttemptReceipt",
  ]) {
    if (typeof ports?.[name] !== "function") return resultShell(r, "BLOCKED", `DEVICE_EXECUTE_PORT_MISSING:${name}`);
  }

  const initialClock = await observeQualifiedTime(r, ports, "ADMISSION");
  if (initialClock.red) return resultShell(r, "BLOCKED", initialClock.red);
  const admissionAt = initialClock.observed.observedAt;

  let initialTarget;
  try { initialTarget = await ports.observeTarget(r, { phase: "ADMISSION", observedAt: admissionAt }); }
  catch { return resultShell(r, "BLOCKED", "WORKER_TARGET_OBSERVATION_FAILED", { attemptedAt: admissionAt }); }
  const initialTargetRed = targetRed(r, initialTarget, admissionAt);
  if (initialTargetRed) return resultShell(r, "BLOCKED", initialTargetRed, { attemptedAt: admissionAt });

  let initialGrant;
  try { initialGrant = await ports.authorize(r, initialTarget, { phase: "ADMISSION", observedAt: admissionAt }); }
  catch {
    return resultShell(r, "BLOCKED", "WARD_ADMISSION_OBSERVATION_FAILED", {
      attemptedAt: admissionAt,
      targetObservationRef: initialTarget.observationRef,
    });
  }
  const initialGrantRed = grantRed(r, initialGrant, initialTarget, admissionAt);
  if (initialGrantRed) return resultShell(r, "BLOCKED", initialGrantRed, {
    attemptedAt: admissionAt,
    targetObservationRef: initialTarget.observationRef,
  });

  let initialExecutor;
  try { initialExecutor = await ports.resolveExecutor(r, initialTarget, initialGrant, { phase: "ADMISSION", observedAt: admissionAt }); }
  catch {
    return resultShell(r, "BLOCKED", "EXECUTOR_RESOLUTION_FAILED", {
      attemptedAt: admissionAt,
      targetObservationRef: initialTarget.observationRef,
      wardGrantRef: initialGrant.grantRef,
      authorityGranted: true,
    });
  }
  const initialExecutorRed = executorRed(r, initialExecutor, initialTarget, admissionAt);
  if (initialExecutorRed) return resultShell(r, "BLOCKED", initialExecutorRed, {
    attemptedAt: admissionAt,
    targetObservationRef: initialTarget.observationRef,
    wardGrantRef: initialGrant.grantRef,
    authorityGranted: true,
  });

  const proposal = createOperationalProposal({
    operationType: r.operationType,
    adapterId: initialExecutor.adapter.adapterId,
    capabilityId: DEVICE_EXECUTE_CAPABILITY_ID,
    effect: "read_only",
    targetRefs: [...new Set([r.workRef, r.deviceRef, ...r.targetRefs])],
    credentialRefs: [],
    requestedAt: r.requestedAt,
  });
  const key = semanticKey(r);
  const claimInput = {
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    idempotencyKey: key,
    semanticKey: key,
    workRef: r.workRef,
    occurrenceId: r.occurrenceId,
    generation: r.generation,
    deviceRef: r.deviceRef,
    workerTargetRef: r.workerTargetRef,
    workerTargetDigest: r.workerTargetDigest,
    assignmentRef: r.assignmentRef,
    leaseRef: r.leaseRef,
    principalRef: r.principalRef,
    sourceGeneration: r.sourceGeneration,
    installedGeneration: r.installedGeneration,
    executorRef: r.executorRef,
    executorDigest: r.executorDigest,
  };

  let claimResponse = null;
  let claimAckLost = false;
  try { claimResponse = await ports.claim(claimInput); }
  catch { claimAckLost = true; }

  let claimReadback;
  try { claimReadback = await ports.readClaim({ semanticKey: key }); }
  catch {
    return resultShell(r, "BLOCKED", claimAckLost ? "CLAIM_ACK_LOST_UNRECONCILED" : "DURABLE_CLAIM_READBACK_FAILED", {
      attemptedAt: admissionAt,
      semanticKey: key,
      idempotencyKey: key,
      authorityGranted: true,
    });
  }
  const claimFailure = claimReadbackRed(r, claimReadback, claimInput, claimResponse);
  if (claimFailure) return resultShell(r, "BLOCKED", claimFailure, {
    attemptedAt: admissionAt,
    semanticKey: key,
    idempotencyKey: key,
    authorityGranted: true,
  });
  if (claimAckLost) {
    return resultShell(r, "BLOCKED", "CLAIM_ACK_LOST_RECONCILE_REQUIRED", {
      attemptedAt: admissionAt,
      semanticKey: key,
      idempotencyKey: key,
      claimRef: claimReadback.claimRef,
      claimReadbackRef: claimReadback.evidenceRef,
      authorityGranted: true,
    });
  }

  const commonClaim = {
    semanticKey: key,
    idempotencyKey: key,
    claimRef: claimReadback.claimRef,
    claimReadbackRef: claimReadback.evidenceRef,
    authorityGranted: true,
  };

  if (claimResponse?.state === "DUPLICATE" || claimReadback.existingReceiptRef) {
    const existingReceiptRef = logicalRefOrNull(
      claimReadback.existingReceiptRef || claimResponse?.existingReceiptRef,
      "duplicate.existingReceiptRef",
    );
    if (!existingReceiptRef) return resultShell(r, "BLOCKED", "DUPLICATE_CLAIM_IN_FLIGHT", commonClaim);
    try {
      const prior = reconcileExistingReceipt(
        await ports.readAttemptReceipt(existingReceiptRef),
        existingReceiptRef,
        r,
        key,
      );
      const terminal = prior.envelope.terminalState;
      return resultShell(r, terminal, terminal === "RESULT_RECORDED" ? null : `DUPLICATE_PRIOR_${terminal}`, {
        ...commonClaim,
        attemptedAt: prior.envelope.attemptedAt || admissionAt,
        jobId: prior.envelope.jobId || null,
        targetObservationRef: prior.envelope.targetObservationRef || null,
        wardGrantRef: prior.envelope.wardGrantRef || null,
        executorQualificationRef: prior.envelope.executorQualificationRef || null,
        resultReadback: prior.envelope.resultReadback || null,
        binsAttemptReceipt: prior.receipt,
        providerEffect: prior.envelope.providerEffect ?? null,
        reconciled: true,
      });
    } catch {
      return resultShell(r, "OUTCOME_UNKNOWN", "DUPLICATE_CLAIM_RECONCILIATION_FAILED", {
        ...commonClaim,
        providerEffect: null,
      });
    }
  }

  if (claimResponse?.state !== "CLAIMED" || claimResponse.claimRef !== claimReadback.claimRef) {
    return resultShell(r, "BLOCKED", "CLAIM_NOT_ADMITTED", commonClaim);
  }

  const preClock = await observeQualifiedTime(r, ports, "PRE_EFFECT");
  const preEffectAt = preClock.observed?.observedAt || admissionAt;
  if (preClock.red) {
    const op = localOperationalReceipt({ key, state: "BLOCKED", firstRed: preClock.red });
    return persistOutcome({
      r, ports, target: initialTarget, grant: initialGrant,
      qualification: initialExecutor.qualification, semanticKeyValue: key,
      claimRef: claimReadback.claimRef, claimReadbackRef: claimReadback.evidenceRef,
      op, resultReadback: null, attemptedAt: preEffectAt,
      terminalState: "BLOCKED", firstRed: preClock.red, common: commonClaim,
    });
  }

  let targetNow;
  try { targetNow = await ports.observeTarget(r, { phase: "PRE_EFFECT", observedAt: preEffectAt }); }
  catch { targetNow = null; }
  const targetNowRed = targetRed(r, targetNow, preEffectAt);
  if (targetNowRed) {
    const op = localOperationalReceipt({ key, state: "BLOCKED", firstRed: targetNowRed });
    return persistOutcome({
      r, ports, target: targetNow || initialTarget, grant: initialGrant,
      qualification: initialExecutor.qualification, semanticKeyValue: key,
      claimRef: claimReadback.claimRef, claimReadbackRef: claimReadback.evidenceRef,
      op, resultReadback: null, attemptedAt: preEffectAt,
      terminalState: "BLOCKED", firstRed: targetNowRed, common: commonClaim,
    });
  }

  let grantNow;
  try { grantNow = await ports.authorize(r, targetNow, { phase: "PRE_EFFECT", observedAt: preEffectAt }); }
  catch { grantNow = null; }
  const grantNowRed = grantRed(r, grantNow, targetNow, preEffectAt);
  if (grantNowRed) {
    const op = localOperationalReceipt({ key, state: "BLOCKED", firstRed: grantNowRed });
    return persistOutcome({
      r, ports, target: targetNow, grant: grantNow || initialGrant,
      qualification: initialExecutor.qualification, semanticKeyValue: key,
      claimRef: claimReadback.claimRef, claimReadbackRef: claimReadback.evidenceRef,
      op, resultReadback: null, attemptedAt: preEffectAt,
      terminalState: "BLOCKED", firstRed: grantNowRed, common: commonClaim,
    });
  }

  let executorNow;
  try { executorNow = await ports.resolveExecutor(r, targetNow, grantNow, { phase: "PRE_EFFECT", observedAt: preEffectAt }); }
  catch { executorNow = null; }
  const executorNowRed = executorRed(r, executorNow, targetNow, preEffectAt);
  if (executorNowRed || executorNow.executorDigest !== initialExecutor.executorDigest || executorNow.adapter.adapterId !== initialExecutor.adapter.adapterId) {
    const red = executorNowRed || "EXECUTOR_CHANGED_AFTER_CLAIM";
    const op = localOperationalReceipt({ key, state: "BLOCKED", firstRed: red });
    return persistOutcome({
      r, ports, target: targetNow, grant: grantNow,
      qualification: executorNow?.qualification || initialExecutor.qualification, semanticKeyValue: key,
      claimRef: claimReadback.claimRef, claimReadbackRef: claimReadback.evidenceRef,
      op, resultReadback: null, attemptedAt: preEffectAt,
      terminalState: "BLOCKED", firstRed: red, common: commonClaim,
    });
  }

  const approval = createOperationalApproval(proposal, {
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    approvalClassId: proposal.approvalClassId,
    actorRef: r.principalRef,
    decidedAt: grantNow.decidedAt,
    decision: "approve",
  });

  const prepared = createOperationalAttemptBase(proposal, approval, preEffectAt);
  let op;
  let rawAdapterResult;
  try {
    rawAdapterResult = await executorNow.adapter.execute(prepared.assignment);
  } catch {
    op = {
      ...prepared.receiptBase,
      status: "outcome_unknown",
      evidenceState: "unknown",
      execution: { adapterInvoked: true, mutationPerformed: null },
      evidence: { redacted: false, redactionProvenanceRef: null, refs: [], observedResourceRefs: [] },
      failure: {
        failureClassId: "adapter_exception",
        stage: "AdapterAttempt",
        message: "The adapter invocation ended without a trustworthy result. Reconcile the target before any retry.",
        proposedNextAction: "Read authoritative target and attempt custody before retry.",
        adapterFailureCode: null,
      },
    };
  }

  if (!op) {
    let result;
    try {
      result = validateOperationalAdapterResult(rawAdapterResult);
    } catch {
      op = {
        ...prepared.receiptBase,
        status: "outcome_unknown",
        evidenceState: "unknown",
        execution: { adapterInvoked: true, mutationPerformed: null },
        evidence: { redacted: false, redactionProvenanceRef: null, refs: [], observedResourceRefs: [] },
        failure: {
          failureClassId: "adapter_result_invalid",
          stage: "AdapterAttempt",
          message: "The adapter returned an untrustworthy result. Reconcile the target before retry.",
          proposedNextAction: "Read authoritative target and attempt custody before retry.",
          adapterFailureCode: null,
        },
      };
    }
    if (result) {
      if (result.mutationPerformed) {
        op = {
          ...prepared.receiptBase,
          status: "failed",
          evidenceState: "failed",
          execution: { adapterInvoked: true, mutationPerformed: true },
          evidence: { redacted: false, redactionProvenanceRef: null, refs: result.evidenceRefs, observedResourceRefs: result.observedResourceRefs },
          failure: {
            failureClassId: "effect_boundary_violation",
            stage: "AdapterAttempt",
            message: "A read-only device adapter reported mutation.",
            proposedNextAction: "Quarantine the executor and reconcile current target state before retry.",
            adapterFailureCode: null,
          },
        };
      } else if (result.outcome === "succeeded") {
        op = {
          ...prepared.receiptBase,
          status: "succeeded",
          evidenceState: "reported",
          execution: { adapterInvoked: true, mutationPerformed: false },
          evidence: { redacted: false, redactionProvenanceRef: null, refs: result.evidenceRefs, observedResourceRefs: result.observedResourceRefs },
          failure: null,
        };
      } else {
        op = {
          ...prepared.receiptBase,
          status: result.outcome === "blocked" ? "blocked" : "failed",
          evidenceState: result.outcome === "blocked" ? "blocked" : "failed",
          execution: { adapterInvoked: true, mutationPerformed: false },
          evidence: { redacted: false, redactionProvenanceRef: null, refs: result.evidenceRefs, observedResourceRefs: result.observedResourceRefs },
          failure: {
            failureClassId: result.outcome === "blocked" ? "adapter_blocked" : "adapter_failed",
            stage: "AdapterAttempt",
            message: result.outcome === "blocked"
              ? "The qualified device adapter reported a blocked outcome."
              : "The qualified device adapter reported a failed outcome.",
            proposedNextAction: "Inspect qualified evidence and reconcile current target state before retrying.",
            adapterFailureCode: result.failure.code,
          },
        };
      }
    }
  }

  const common = {
    ...commonClaim,
    jobId: op.jobId || null,
    attemptedAt: preEffectAt,
    wardGrantRef: grantNow.grantRef,
    targetObservationRef: targetNow.observationRef,
    executorQualificationRef: executorNow.qualification.qualificationRef,
  };

  if (op.status === "succeeded" && op.execution.mutationPerformed) {
    return persistOutcome({
      r, ports, target: targetNow, grant: grantNow, qualification: executorNow.qualification,
      semanticKeyValue: key, claimRef: claimReadback.claimRef, claimReadbackRef: claimReadback.evidenceRef,
      op, resultReadback: null, attemptedAt: preEffectAt,
      terminalState: "FAILED", firstRed: "READ_ONLY_MUTATION_REPORTED", common,
    });
  }

  let resultReadback = null;
  if (op.status === "succeeded") {
    if (op.evidence.observedResourceRefs.length !== 1) {
      return persistOutcome({
        r, ports, target: targetNow, grant: grantNow, qualification: executorNow.qualification,
        semanticKeyValue: key, claimRef: claimReadback.claimRef, claimReadbackRef: claimReadback.evidenceRef,
        op, resultReadback: null, attemptedAt: preEffectAt,
        terminalState: "FAILED", firstRed: "ONE_BINS_RESULT_RESOURCE_REQUIRED", common,
      });
    }
    try {
      resultReadback = verifyResultReadback(
        await ports.readResult(op.evidence.observedResourceRefs[0]),
        op.evidence.observedResourceRefs[0],
        r.occurrenceId,
      );
    } catch {
      return persistOutcome({
        r, ports, target: targetNow, grant: grantNow, qualification: executorNow.qualification,
        semanticKeyValue: key, claimRef: claimReadback.claimRef, claimReadbackRef: claimReadback.evidenceRef,
        op, resultReadback: null, attemptedAt: preEffectAt,
        terminalState: "OUTCOME_UNKNOWN", firstRed: "BINS_RESULT_READBACK_UNVERIFIED", common,
      });
    }
  }

  const terminalState = op.status === "succeeded"
    ? "RESULT_RECORDED"
    : op.status === "blocked"
      ? "BLOCKED"
      : op.status === "outcome_unknown"
        ? "OUTCOME_UNKNOWN"
        : "FAILED";
  const firstRed = terminalState === "RESULT_RECORDED" ? null : `OPERATIONAL_JOB_${op.status.toUpperCase()}`;

  return persistOutcome({
    r, ports, target: targetNow, grant: grantNow, qualification: executorNow.qualification,
    semanticKeyValue: key, claimRef: claimReadback.claimRef, claimReadbackRef: claimReadback.evidenceRef,
    op, resultReadback, attemptedAt: preEffectAt,
    terminalState, firstRed, common,
  });
}
