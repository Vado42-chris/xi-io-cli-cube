import { createHash } from "node:crypto";

export const DEVICE_BROKER_SCHEMA = "xiio.switchboard.device-broker/v1";
export const DEVICE_BROKER_CAPABILITY = "device.execute";

const ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,191}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FORBIDDEN = new Set([
  "command","commands","shell","script","argv","args","sudo","password","token",
  "secret","credentials","credential","authorization","cookie","privateKey",
  "ward_admit","authority_granted",
]);

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}
function exact(value, keys, code) {
  const row = object(value, code);
  const allowed = new Set(keys);
  for (const key of Object.keys(row)) if (!allowed.has(key)) fail(code + "_UNKNOWN_FIELD:" + key);
  return row;
}
function text(value, code, max=192) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || /[\r\n\0]/.test(value)) fail(code);
  return value;
}
function id(value, code) {
  const valueText = text(value, code);
  if (!ID.test(valueText)) fail(code);
  return valueText;
}
function sha(value, code) {
  const valueText = text(value, code, 64);
  if (!SHA256.test(valueText)) fail(code);
  return valueText;
}
function utc(value, code) {
  const valueText = text(value, code, 32);
  if (!UTC.test(valueText) || !Number.isFinite(Date.parse(valueText))) fail(code);
  return valueText;
}
function refs(value, code, {min=0,max=16}={}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(code);
  const out=value.map((v,i)=>id(v,code+"["+i+"]"));
  if (new Set(out).size !== out.length) fail(code+"_DUPLICATE");
  return Object.freeze([...out].sort());
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out={};
    for (const key of Object.keys(value).sort()) if (value[key] !== undefined) out[key]=stable(value[key]);
    return out;
  }
  return value;
}
export function digestBrokerValue(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function normalizeBrokerSession(value, observedAt) {
  const row=exact(value,[
    "state","sessionRef","principalRef","deviceRef","generation","evidenceRef",
    "observedAt","freshUntil"
  ],"DEVICE_SESSION_INVALID");
  if (row.state !== "AUTHENTICATED") fail("DEVICE_SESSION_AUTHENTICATION_REQUIRED");
  const session=Object.freeze({
    state:"AUTHENTICATED",
    sessionRef:id(row.sessionRef,"DEVICE_SESSION_REF_REQUIRED"),
    principalRef:id(row.principalRef,"DEVICE_SESSION_PRINCIPAL_REQUIRED"),
    deviceRef:id(row.deviceRef,"DEVICE_SESSION_DEVICE_REQUIRED"),
    generation:id(row.generation,"DEVICE_SESSION_GENERATION_REQUIRED"),
    evidenceRef:id(row.evidenceRef,"DEVICE_SESSION_EVIDENCE_REQUIRED"),
    observedAt:utc(row.observedAt,"DEVICE_SESSION_OBSERVED_AT_REQUIRED"),
    freshUntil:utc(row.freshUntil,"DEVICE_SESSION_FRESH_UNTIL_REQUIRED"),
  });
  const now=Date.parse(utc(observedAt,"DEVICE_BROKER_OBSERVED_AT_REQUIRED"));
  if (Date.parse(session.observedAt) > now) fail("DEVICE_SESSION_FROM_FUTURE");
  if (Date.parse(session.freshUntil) < now) fail("DEVICE_SESSION_STALE");
  return session;
}

const requestKeys=[
  "workRef","occurrenceId","generation","deviceRef","workerTargetRef","workerTargetDigest",
  "assignmentRef","leaseRef","principalRef","operationType","targetRefs","sourceGeneration",
  "installedGeneration","executorRef","executorDigest","requestedAt"
];
function normalizeRequest(value) {
  const row=exact(value,requestKeys,"DEVICE_JOB_REQUEST_INVALID");
  for (const key of Object.keys(row)) if (FORBIDDEN.has(key)) fail("DEVICE_JOB_FORBIDDEN_FIELD:"+key);
  return Object.freeze({
    workRef:id(row.workRef,"DEVICE_JOB_WORK_REQUIRED"),
    occurrenceId:id(row.occurrenceId,"DEVICE_JOB_OCCURRENCE_REQUIRED"),
    generation:id(row.generation,"DEVICE_JOB_GENERATION_REQUIRED"),
    deviceRef:id(row.deviceRef,"DEVICE_JOB_DEVICE_REQUIRED"),
    workerTargetRef:id(row.workerTargetRef,"DEVICE_JOB_TARGET_REQUIRED"),
    workerTargetDigest:sha(row.workerTargetDigest,"DEVICE_JOB_TARGET_DIGEST_REQUIRED"),
    assignmentRef:id(row.assignmentRef,"DEVICE_JOB_ASSIGNMENT_REQUIRED"),
    leaseRef:id(row.leaseRef,"DEVICE_JOB_LEASE_REQUIRED"),
    principalRef:id(row.principalRef,"DEVICE_JOB_PRINCIPAL_REQUIRED"),
    operationType:id(row.operationType,"DEVICE_JOB_OPERATION_REQUIRED"),
    targetRefs:refs(row.targetRefs,"DEVICE_JOB_TARGET_REFS",{min:1}),
    sourceGeneration:id(row.sourceGeneration,"DEVICE_JOB_SOURCE_GENERATION_REQUIRED"),
    installedGeneration:id(row.installedGeneration,"DEVICE_JOB_INSTALLED_GENERATION_REQUIRED"),
    executorRef:id(row.executorRef,"DEVICE_JOB_EXECUTOR_REQUIRED"),
    executorDigest:sha(row.executorDigest,"DEVICE_JOB_EXECUTOR_DIGEST_REQUIRED"),
    requestedAt:utc(row.requestedAt,"DEVICE_JOB_REQUESTED_AT_REQUIRED"),
  });
}

export function normalizeAdmittedDeviceJob(value) {
  const row=exact(value,[
    "state","jobRef","admissionRef","admissionEvidenceRef","request","createdAt"
  ],"ADMITTED_DEVICE_JOB_INVALID");
  if (row.state !== "ADMITTED") fail("ADMITTED_DEVICE_JOB_REQUIRED");
  const request=normalizeRequest(row.request);
  return Object.freeze({
    state:"ADMITTED",
    jobRef:id(row.jobRef,"DEVICE_JOB_REF_REQUIRED"),
    admissionRef:id(row.admissionRef,"DEVICE_JOB_ADMISSION_REF_REQUIRED"),
    admissionEvidenceRef:id(row.admissionEvidenceRef,"DEVICE_JOB_ADMISSION_EVIDENCE_REQUIRED"),
    request,
    createdAt:utc(row.createdAt,"DEVICE_JOB_CREATED_AT_REQUIRED"),
  });
}

export function compilePulledDeviceJob(admittedValue, delivery) {
  const admitted=normalizeAdmittedDeviceJob(admittedValue);
  const d=exact(delivery,["deliveryRef","deliveryGeneration","evidenceRef"],"DEVICE_DELIVERY_INVALID");
  const payload={
    jobRef:admitted.jobRef,
    deliveryRef:id(d.deliveryRef,"DEVICE_DELIVERY_REF_REQUIRED"),
    deliveryGeneration:id(d.deliveryGeneration,"DEVICE_DELIVERY_GENERATION_REQUIRED"),
    request:admitted.request,
  };
  return Object.freeze({
    state:"JOB",
    ...payload,
    evidenceRef:id(d.evidenceRef,"DEVICE_DELIVERY_EVIDENCE_REQUIRED"),
    jobDigest:digestBrokerValue(payload),
  });
}

export function validateBrokerResultPayload(value, expected={}) {
  const row=exact(value,[
    "jobRef","deliveryRef","deliveryGeneration","workRef","occurrenceId","generation",
    "deviceRef","sessionRef","resultDigest","deviceResult"
  ],"DEVICE_RESULT_INVALID");
  const out=Object.freeze({
    jobRef:id(row.jobRef,"DEVICE_RESULT_JOB_REF_REQUIRED"),
    deliveryRef:id(row.deliveryRef,"DEVICE_RESULT_DELIVERY_REF_REQUIRED"),
    deliveryGeneration:id(row.deliveryGeneration,"DEVICE_RESULT_DELIVERY_GENERATION_REQUIRED"),
    workRef:id(row.workRef,"DEVICE_RESULT_WORK_REQUIRED"),
    occurrenceId:id(row.occurrenceId,"DEVICE_RESULT_OCCURRENCE_REQUIRED"),
    generation:id(row.generation,"DEVICE_RESULT_GENERATION_REQUIRED"),
    deviceRef:id(row.deviceRef,"DEVICE_RESULT_DEVICE_REQUIRED"),
    sessionRef:id(row.sessionRef,"DEVICE_RESULT_SESSION_REQUIRED"),
    resultDigest:sha(row.resultDigest,"DEVICE_RESULT_DIGEST_REQUIRED"),
    deviceResult:object(row.deviceResult,"DEVICE_RESULT_BODY_REQUIRED"),
  });
  for (const [key,valueExpected] of Object.entries(expected || {})) {
    if (valueExpected != null && out[key] !== valueExpected) fail("DEVICE_RESULT_BINDING_MISMATCH:"+key);
  }
  if (out.deviceResult.returnCertified === true || out.deviceResult.applyReturn === true) {
    fail("BROKER_RESULT_CANNOT_SELF_CERTIFY_PARENT_RETURN");
  }
  // The received bytes, not a caller digest label, establish result identity.
  if (digestBrokerValue(out.deviceResult) !== out.resultDigest) {
    fail("DEVICE_RESULT_DIGEST_MISMATCH");
  }
  return out;
}

export function validateBrokerReturn(value, expected={}) {
  const row=exact(value,[
    "state","returnRef","jobRef","deliveryRef","deliveryGeneration","workRef","occurrenceId",
    "generation","deviceRef","sessionRef","resultDigest","evidenceRef","readbackRef"
  ],"DEVICE_RETURN_INVALID");
  if (row.state !== "RECORDED") fail("DEVICE_RETURN_NOT_RECORDED");
  const out=Object.freeze({
    state:"RECORDED",
    returnRef:id(row.returnRef,"DEVICE_RETURN_REF_REQUIRED"),
    jobRef:id(row.jobRef,"DEVICE_RETURN_JOB_REQUIRED"),
    deliveryRef:id(row.deliveryRef,"DEVICE_RETURN_DELIVERY_REQUIRED"),
    deliveryGeneration:id(row.deliveryGeneration,"DEVICE_RETURN_DELIVERY_GENERATION_REQUIRED"),
    workRef:id(row.workRef,"DEVICE_RETURN_WORK_REQUIRED"),
    occurrenceId:id(row.occurrenceId,"DEVICE_RETURN_OCCURRENCE_REQUIRED"),
    generation:id(row.generation,"DEVICE_RETURN_GENERATION_REQUIRED"),
    deviceRef:id(row.deviceRef,"DEVICE_RETURN_DEVICE_REQUIRED"),
    sessionRef:id(row.sessionRef,"DEVICE_RETURN_SESSION_REQUIRED"),
    resultDigest:sha(row.resultDigest,"DEVICE_RETURN_DIGEST_REQUIRED"),
    evidenceRef:id(row.evidenceRef,"DEVICE_RETURN_EVIDENCE_REQUIRED"),
    readbackRef:id(row.readbackRef,"DEVICE_RETURN_READBACK_REQUIRED"),
  });
  for (const [key,valueExpected] of Object.entries(expected || {})) {
    if (valueExpected != null && out[key] !== valueExpected) fail("DEVICE_RETURN_BINDING_MISMATCH:"+key);
  }
  return out;
}

async function jsonResponse(response, code) {
  if (!response || typeof response.ok !== "boolean") fail(code+"_TRANSPORT_INVALID");
  let body;
  try { body=await response.json(); } catch { fail(code+"_INVALID_JSON"); }
  if (!response.ok) {
    const error=new Error(body?.firstRed || body?.reason || code+"_HTTP_"+response.status);
    error.status=response.status;
    error.body=body;
    throw error;
  }
  return body;
}

export function createDeviceBrokerTransport({
  baseUrl,
  fetchImpl=globalThis.fetch,
  headers=()=>({}),
}={}) {
  const root=text(baseUrl,"DEVICE_BROKER_BASE_URL_REQUIRED",512).replace(/\/$/,"");
  if (!/^https:\/\//.test(root) && !/^http:\/\/127\.0\.0\.1(?::\d+)?/.test(root)) {
    fail("DEVICE_BROKER_SECURE_OR_LOOPBACK_URL_REQUIRED");
  }
  if (typeof fetchImpl !== "function") fail("DEVICE_BROKER_FETCH_REQUIRED");
  if (typeof headers !== "function") fail("DEVICE_BROKER_HEADERS_REQUIRED");
  const request=async(path,init={})=>{
    const extra=await headers();
    const response=await fetchImpl(root+path,{
      ...init,
      headers:{accept:"application/json",...(init.body?{"content-type":"application/json"}:{}),...(extra||{})},
    });
    return jsonResponse(response,"DEVICE_BROKER");
  };
  return Object.freeze({
    observeTime: async()=>request("/api/v1/device/time"),
    observeSession: async()=>request("/api/v1/device/session"),
    pullNext: async({expectedJobRef}={})=>request(
      "/api/v1/device/jobs/pull" + (expectedJobRef == null ? "" :
        "?expectedJobRef="+encodeURIComponent(id(expectedJobRef,"DEVICE_PULL_EXPECTED_JOB_REF_INVALID")))
    ),
    postResult: async(payload)=>request("/api/v1/device/results",{method:"POST",body:JSON.stringify(payload)}),
    readResultReturn: async(returnRef)=>request("/api/v1/device/returns/"+encodeURIComponent(id(returnRef,"DEVICE_RETURN_REF_REQUIRED"))),
  });
}
