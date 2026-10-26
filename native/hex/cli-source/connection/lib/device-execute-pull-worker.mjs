import { createHash } from "node:crypto";
import { DEVICE_EXECUTE_CAPABILITY_ID, executeDeviceRead } from "./device-execute.mjs";

export const DEVICE_PULL_SCHEMA = "xiio.switchboard.device-execute-pull/v1";
export const DEVICE_PULL_RESULT_SCHEMA = "xiio.switchboard.device-execute-pull-result/v1";

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

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

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function ref(value, key) {
  if (typeof value !== "string" || !REF.test(value) || /[\r\n\0]/.test(value)) throw new TypeError(`${key}_REF_INVALID`);
  if (
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)
    || value.startsWith("/")
    || value.startsWith("./")
    || value.startsWith("../")
    || value.includes("\\")
  ) throw new TypeError(`${key}_LOCATOR_FORBIDDEN`);
  return value;
}

function sha(value, key) {
  if (typeof value !== "string" || !SHA.test(value)) throw new TypeError(`${key}_SHA256_INVALID`);
  return value;
}

function utc(value, key) {
  if (typeof value !== "string" || !UTC.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError(`${key}_UTC_INVALID`);
  return value;
}

function shell(deviceRef, state, firstRed, extra = {}) {
  return {
    schema: DEVICE_PULL_RESULT_SCHEMA,
    state,
    firstRed,
    deviceRef,
    capabilityId: DEVICE_EXECUTE_CAPABILITY_ID,
    sessionRef: null,
    jobRef: null,
    deliveryRef: null,
    deliveryGeneration: null,
    resultDigest: null,
    resultReturnRef: null,
    resultReturnReadbackRef: null,
    deviceResult: null,
    brokerReturned: false,
    returnCertified: false,
    applyReturn: false,
    effectAuthority: 0,
    ...extra,
  };
}

function sessionRed(deviceRef, now, session) {
  if (!session || session.state !== "AUTHENTICATED") return "DEVICE_SESSION_NOT_AUTHENTICATED";
  if (
    !ref(session.sessionRef, "session.sessionRef")
    || !ref(session.principalRef, "session.principalRef")
    || !ref(session.deviceRef, "session.deviceRef")
    || !ref(session.generation, "session.generation")
    || !ref(session.evidenceRef, "session.evidenceRef")
    || !utc(session.observedAt, "session.observedAt")
    || !utc(session.freshUntil, "session.freshUntil")
  ) return "DEVICE_SESSION_EVIDENCE_INVALID";
  if (session.deviceRef !== deviceRef) return "DEVICE_SESSION_DEVICE_MISMATCH";
  const measured = Date.parse(now);
  if (Date.parse(session.observedAt) > measured || Date.parse(session.freshUntil) < measured) return "DEVICE_SESSION_STALE";
  return null;
}

function pullTime(raw) {
  if (!raw || raw.state !== "QUALIFIED") throw new TypeError("PULL_TIME_NOT_QUALIFIED");
  ref(raw.clockRef, "clock.clockRef");
  ref(raw.observationRef, "clock.observationRef");
  ref(raw.evidenceRef, "clock.evidenceRef");
  ref(raw.generation, "clock.generation");
  return utc(raw.observedAt, "clock.observedAt");
}

function validatePulledJob(deviceRef, session, raw) {
  if (!raw || raw.state !== "JOB") throw new TypeError("PULL_JOB_INVALID");
  const deliveryRef = ref(raw.deliveryRef, "job.deliveryRef");
  const deliveryGeneration = ref(raw.deliveryGeneration, "job.deliveryGeneration");
  const jobRef = ref(raw.jobRef, "job.jobRef");
  const evidenceRef = ref(raw.evidenceRef, "job.evidenceRef");
  const jobDigest = sha(raw.jobDigest, "job.jobDigest");
  if (!raw.request || typeof raw.request !== "object" || Array.isArray(raw.request)) throw new TypeError("PULL_JOB_REQUEST_INVALID");

  for (const forbidden of ["command","commands","shell","script","argv","args","sudo","password","token","secret","credentials"]) {
    if (Object.hasOwn(raw, forbidden) || Object.hasOwn(raw.request, forbidden)) throw new TypeError(`PULL_JOB_FORBIDDEN_FIELD:${forbidden}`);
  }

  if (raw.request.deviceRef !== deviceRef) throw new TypeError("PULL_JOB_DEVICE_MISMATCH");
  if (raw.request.principalRef !== session.principalRef) throw new TypeError("PULL_JOB_PRINCIPAL_MISMATCH");

  const expected = digest({
    jobRef,
    deliveryRef,
    deliveryGeneration,
    request: raw.request,
  });
  if (jobDigest !== expected) throw new TypeError("PULL_JOB_DIGEST_MISMATCH");

  return {
    jobRef,
    deliveryRef,
    deliveryGeneration,
    evidenceRef,
    jobDigest,
    request: raw.request,
  };
}

function validatePendingResult(deviceRef, raw) {
  if (!raw || raw.state !== "RESULT_PENDING") throw new TypeError("BROKER_PENDING_RESULT_INVALID");
  const pending = {
    returnRef: ref(raw.returnRef, "pending.returnRef"),
    jobRef: ref(raw.jobRef, "pending.jobRef"),
    deliveryRef: ref(raw.deliveryRef, "pending.deliveryRef"),
    deliveryGeneration: ref(raw.deliveryGeneration, "pending.deliveryGeneration"),
    workRef: ref(raw.workRef, "pending.workRef"),
    occurrenceId: ref(raw.occurrenceId, "pending.occurrenceId"),
    generation: ref(raw.generation, "pending.generation"),
    deviceRef: ref(raw.deviceRef, "pending.deviceRef"),
    sessionRef: ref(raw.sessionRef, "pending.sessionRef"),
    resultDigest: sha(raw.resultDigest, "pending.resultDigest"),
  };
  if (pending.deviceRef !== deviceRef) throw new TypeError("BROKER_PENDING_DEVICE_MISMATCH");
  return pending;
}

function verifyResultBinding(job, result) {
  if (!result || result.schema !== "xiio.switchboard.device-execute/v1") throw new TypeError("DEVICE_RESULT_SCHEMA_INVALID");
  for (const [actual, expected, code] of [
    [result.workRef, job.request.workRef, "DEVICE_RESULT_WORK_MISMATCH"],
    [result.occurrenceId, job.request.occurrenceId, "DEVICE_RESULT_OCCURRENCE_MISMATCH"],
    [result.generation, job.request.generation, "DEVICE_RESULT_GENERATION_MISMATCH"],
    [result.deviceRef, job.request.deviceRef, "DEVICE_RESULT_DEVICE_MISMATCH"],
  ]) if (actual !== expected) throw new TypeError(code);
}

function returnReadbackRed(expected, raw) {
  if (!raw || raw.state !== "RECORDED") return "BROKER_RESULT_READBACK_REQUIRED";
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (raw[field] !== expectedValue) return `BROKER_RESULT_${field.toUpperCase()}_MISMATCH`;
  }
  if (!ref(raw.readbackRef, "return.readbackRef") || !ref(raw.evidenceRef, "return.evidenceRef")) {
    return "BROKER_RESULT_READBACK_EVIDENCE_INVALID";
  }
  return null;
}

export async function pullDeviceExecuteOnce({ deviceRef: rawDeviceRef, transport, devicePorts, expectedJobRef = null }) {
  const deviceRef = ref(rawDeviceRef, "deviceRef");
  let pinnedJobRef = null;
  try { if (expectedJobRef != null) pinnedJobRef = ref(expectedJobRef,"expectedJobRef"); }
  catch { return shell(deviceRef,"BLOCKED","PULL_EXPECTED_JOB_REF_INVALID"); }
  for (const name of ["observeTime","observeSession","pullNext","postResult","readResultReturn"]) {
    if (typeof transport?.[name] !== "function") return shell(deviceRef, "BLOCKED", `DEVICE_PULL_PORT_MISSING:${name}`);
  }

  let now;
  try { now = pullTime(await transport.observeTime({ phase: "PULL", deviceRef })); }
  catch { return shell(deviceRef, "BLOCKED", "DEVICE_PULL_TIME_UNVERIFIED"); }

  let session;
  try { session = await transport.observeSession({ deviceRef, observedAt: now }); }
  catch { return shell(deviceRef, "BLOCKED", "DEVICE_SESSION_OBSERVATION_FAILED"); }
  let sessionFailure;
  try { sessionFailure = sessionRed(deviceRef, now, session); }
  catch { sessionFailure = "DEVICE_SESSION_EVIDENCE_INVALID"; }
  if (sessionFailure) return shell(deviceRef, "BLOCKED", sessionFailure);

  let pulled;
  try {
    pulled = await transport.pullNext({
      deviceRef,
      sessionRef: session.sessionRef,
      principalRef: session.principalRef,
      sessionGeneration: session.generation,
      capabilityId: DEVICE_EXECUTE_CAPABILITY_ID,
      expectedJobRef: pinnedJobRef,
    });
  } catch {
    return shell(deviceRef, "WAIT_TRANSPORT", "DEVICE_PULL_UNAVAILABLE", {
      sessionRef: session.sessionRef,
    });
  }

  if (pulled?.state === "WAIT_JOB_UNAVAILABLE") {
    return pinnedJobRef && pulled.jobRef === pinnedJobRef
      ? shell(deviceRef, "WAIT_TRANSPORT", "PULL_EXPECTED_JOB_NOT_AVAILABLE", {
          sessionRef: session.sessionRef, jobRef: pinnedJobRef,
        })
      : shell(deviceRef, "BLOCKED", "BROKER_JOB_PIN_INVALID", { sessionRef: session.sessionRef });
  }
  if (pinnedJobRef && pulled?.state !== "EMPTY" && pulled?.jobRef !== pinnedJobRef) {
    return shell(deviceRef, "BLOCKED", "PULL_EXPECTED_JOB_MISMATCH", {
      sessionRef: session.sessionRef, jobRef: pinnedJobRef,
    });
  }
  if (pulled?.state === "EMPTY") {
    return pinnedJobRef
      ? shell(deviceRef, "WAIT_TRANSPORT", "PULL_EXPECTED_JOB_NOT_AVAILABLE", {
          sessionRef: session.sessionRef, jobRef: pinnedJobRef,
        })
      : shell(deviceRef, "EMPTY", null, { sessionRef: session.sessionRef });
  }

  if (pulled?.state === "RESULT_PENDING") {
    let pending;
    try { pending = validatePendingResult(deviceRef, pulled); }
    catch (error) {
      return shell(deviceRef, "BLOCKED", error?.message || "BROKER_PENDING_RESULT_INVALID", {
        sessionRef: session.sessionRef,
      });
    }

    let readback;
    try { readback = await transport.readResultReturn(pending.returnRef); }
    catch {
      return shell(deviceRef, "RESULT_UNRETURNED", "BROKER_RESULT_READBACK_FAILED", {
        sessionRef: session.sessionRef,
        jobRef: pending.jobRef,
        deliveryRef: pending.deliveryRef,
        deliveryGeneration: pending.deliveryGeneration,
        resultDigest: pending.resultDigest,
        resultReturnRef: pending.returnRef,
      });
    }

    let readbackFailure;
    try { readbackFailure = returnReadbackRed(pending, readback); }
    catch { readbackFailure = "BROKER_RESULT_READBACK_INVALID"; }
    if (readbackFailure) {
      return shell(deviceRef, "RESULT_UNRETURNED", readbackFailure, {
        sessionRef: session.sessionRef,
        jobRef: pending.jobRef,
        deliveryRef: pending.deliveryRef,
        deliveryGeneration: pending.deliveryGeneration,
        resultDigest: pending.resultDigest,
        resultReturnRef: pending.returnRef,
      });
    }

    return shell(deviceRef, "RESULT_RETURNED_TO_BROKER", null, {
      sessionRef: session.sessionRef,
      jobRef: pending.jobRef,
      deliveryRef: pending.deliveryRef,
      deliveryGeneration: pending.deliveryGeneration,
      resultDigest: pending.resultDigest,
      resultReturnRef: pending.returnRef,
      resultReturnReadbackRef: readback.readbackRef,
      brokerReturned: true,
      returnCertified: false,
      applyReturn: false,
    });
  }

  let job;
  try { job = validatePulledJob(deviceRef, session, pulled); }
  catch (error) {
    return shell(deviceRef, "BLOCKED", error?.message || "PULL_JOB_INVALID", {
      sessionRef: session.sessionRef,
    });
  }

  const common = {
    sessionRef: session.sessionRef,
    jobRef: job.jobRef,
    deliveryRef: job.deliveryRef,
    deliveryGeneration: job.deliveryGeneration,
  };

  let result;
  try { result = await executeDeviceRead(job.request, devicePorts); }
  catch {
    return shell(deviceRef, "RESULT_UNRETURNED", "DEVICE_EXECUTE_RESULT_UNAVAILABLE", common);
  }
  try { verifyResultBinding(job, result); }
  catch {
    return shell(deviceRef, "RESULT_UNRETURNED", "DEVICE_EXECUTE_RESULT_BINDING_INVALID", {
      ...common,
      deviceResult: result,
    });
  }

  const resultDigest = digest(result);
  const returnPayload = stable({
    jobRef: job.jobRef,
    deliveryRef: job.deliveryRef,
    deliveryGeneration: job.deliveryGeneration,
    workRef: job.request.workRef,
    occurrenceId: job.request.occurrenceId,
    generation: job.request.generation,
    deviceRef,
    sessionRef: session.sessionRef,
    resultDigest,
    deviceResult: result,
  });

  let posted;
  try { posted = await transport.postResult(returnPayload); }
  catch {
    return shell(deviceRef, "RESULT_UNRETURNED", "BROKER_RESULT_POST_OUTCOME_UNKNOWN", {
      ...common,
      resultDigest,
      deviceResult: result,
    });
  }
  if (!posted || posted.state !== "RECORDED") {
    return shell(deviceRef, "RESULT_UNRETURNED", "BROKER_RESULT_NOT_RECORDED", {
      ...common,
      resultDigest,
      deviceResult: result,
    });
  }

  let resultReturnRef;
  try { resultReturnRef = ref(posted.returnRef, "result.returnRef"); }
  catch {
    return shell(deviceRef, "RESULT_UNRETURNED", "BROKER_RESULT_RETURN_REF_INVALID", {
      ...common,
      resultDigest,
      deviceResult: result,
    });
  }

  let readback;
  try { readback = await transport.readResultReturn(resultReturnRef); }
  catch {
    return shell(deviceRef, "RESULT_UNRETURNED", "BROKER_RESULT_READBACK_FAILED", {
      ...common,
      resultDigest,
      resultReturnRef,
      deviceResult: result,
    });
  }

  const expected = {
    returnRef: resultReturnRef,
    jobRef: job.jobRef,
    deliveryRef: job.deliveryRef,
    deliveryGeneration: job.deliveryGeneration,
    workRef: job.request.workRef,
    occurrenceId: job.request.occurrenceId,
    generation: job.request.generation,
    deviceRef,
    sessionRef: session.sessionRef,
    resultDigest,
  };
  let readbackFailure;
  try { readbackFailure = returnReadbackRed(expected, readback); }
  catch { readbackFailure = "BROKER_RESULT_READBACK_INVALID"; }
  if (readbackFailure) {
    return shell(deviceRef, "RESULT_UNRETURNED", readbackFailure, {
      ...common,
      resultDigest,
      resultReturnRef,
      deviceResult: result,
    });
  }

  return shell(deviceRef, "RESULT_RETURNED_TO_BROKER", null, {
    ...common,
    resultDigest,
    resultReturnRef,
    resultReturnReadbackRef: readback.readbackRef,
    deviceResult: result,
    brokerReturned: true,
    // Broker return is not parent RETURN/APPLY_RETURN.
    returnCertified: false,
    applyReturn: false,
  });
}
