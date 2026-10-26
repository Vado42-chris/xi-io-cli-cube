import { createHash } from "node:crypto";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const CREDENTIAL_REF = /^credential-ref:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EVIDENCE_REF = /^(evidence|receipt|observation|log):[A-Za-z0-9][A-Za-z0-9._:/-]{0,247}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const APPROVAL_FRESHNESS_MS = 60 * 60 * 1000;

export type OperationalEffect = "read_only" | "external_mutation";
export type OperationalJobStatus = "blocked" | "failed" | "outcome_unknown" | "succeeded";
export type OperationalEvidenceState = "blocked" | "failed" | "unknown" | "reported";

export interface OperationalProposal {
  schemaVersion: "1.0";
  proposalId: string;
  proposalDigest: string;
  operationType: string;
  adapterId: string;
  capabilityId: string;
  effect: OperationalEffect;
  targetRefs: string[];
  credentialRefs: string[];
  approvalClassId: "bounded-read" | "consequential-external";
  requestedAt: string;
  executionAuthority: "none";
}

export interface OperationalApproval {
  schemaVersion: "1.0";
  approvalDecisionId: string;
  proposalId: string;
  proposalDigest: string;
  approvalClassId: OperationalProposal["approvalClassId"];
  actorRef: string;
  decidedAt: string;
  decision: "approve";
  authenticationState: "not_verified_by_001a";
}

export interface OperationalFailure {
  failureClassId:
    | "approval_missing"
    | "approval_invalid"
    | "approval_expired"
    | "effect_not_authorized"
    | "adapter_mismatch"
    | "capability_unavailable"
    | "adapter_blocked"
    | "adapter_failed"
    | "effect_boundary_violation"
    | "adapter_exception"
    | "adapter_result_invalid"
    | "device_execute_requires_qualified_wrapper";
  stage: "ApprovalDecision" | "AdapterDispatch" | "AdapterAttempt";
  message: string;
  proposedNextAction: string;
  adapterFailureCode: string | null;
}

export interface OperationalJobReceipt {
  schemaVersion: "1.0";
  jobId: string;
  attemptId: string;
  correlationId: string;
  idempotencyKey: string;
  proposalId: string;
  proposalDigest: string;
  approvalDecisionId: string | null;
  approvalAuthenticationState: "not_verified_by_001a";
  operationType: string;
  adapterId: string;
  capabilityId: string;
  effect: OperationalEffect;
  targetRefs: string[];
  credentialRefs: string[];
  status: OperationalJobStatus;
  evidenceState: OperationalEvidenceState;
  observedAt: string;
  execution: {
    adapterInvoked: boolean;
    mutationPerformed: boolean | null;
  };
  authority: {
    attempt: boolean;
    verify: "none";
    deploy: "none";
    publish: "none";
    live: "none";
  };
  evidence: {
    redacted: boolean;
    redactionProvenanceRef: string | null;
    refs: string[];
    observedResourceRefs: string[];
  };
  failure: OperationalFailure | null;
  projections: {
    verified: false;
    deployed: false;
    live: false;
    published: false;
  };
  persistence: {
    durableJobStore: false;
    durableIdempotencyClaim: false;
  };
}

export interface OperationalAdapterAssignment {
  jobId: string;
  attemptId: string;
  correlationId: string;
  proposalId: string;
  proposalDigest: string;
  operationType: string;
  capabilityId: string;
  effect: OperationalEffect;
  targetRefs: readonly string[];
  credentialRefs: readonly string[];
  approvalDecisionId: string;
}

export interface OperationalAdapterResult {
  outcome: "succeeded" | "blocked" | "failed";
  mutationPerformed: boolean;
  evidenceRefs: string[];
  observedResourceRefs: string[];
  failure: {
    code: string;
    message: string;
    proposedNextAction: string;
  } | null;
}

export interface OperationalAdapter {
  adapterId: string;
  capabilities: readonly string[];
  effects: readonly OperationalEffect[];
  execute(assignment: OperationalAdapterAssignment): Promise<OperationalAdapterResult> | OperationalAdapterResult;
}

function fail(message: string): never {
  throw new Error(`Invalid operational job: ${message}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const candidate = object(value, label);
  const actual = Object.keys(candidate).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    const unknown = actual.filter((key) => !expected.includes(key));
    const missing = expected.filter((key) => !actual.includes(key));
    fail(`${label} has unsupported fields${unknown.length ? ` (${unknown.join(", ")})` : ""}${missing.length ? ` and is missing ${missing.join(", ")}` : ""}.`);
  }
  return candidate;
}

function requestObject(value: unknown): Record<string, unknown> {
  const candidate = object(value, "execution request");
  const allowed = ["proposal", "approval", "adapter", "observedAt"];
  const unknown = Object.keys(candidate).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(`execution request has unsupported fields (${unknown.join(", ")}).`);
  for (const required of ["proposal", "adapter", "observedAt"]) {
    if (!(required in candidate)) fail(`execution request is missing ${required}.`);
  }
  return candidate;
}

function text(value: unknown, label: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\r\n\0]/.test(value)) {
    fail(`${label} must be a bounded single-line string.`);
  }
  return value;
}

function safeId(value: unknown, label: string): string {
  const candidate = text(value, label, 128);
  if (!SAFE_ID.test(candidate)) fail(`${label} must be a safe logical identifier.`);
  return candidate;
}

function safeRef(value: unknown, label: string): string {
  const candidate = text(value, label, 256);
  if (
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(candidate)
    || candidate.startsWith("/")
    || candidate.startsWith("./")
    || candidate.startsWith("../")
    || candidate.includes("\\")
    || /(^|\/)\.\.(\/|$)/.test(candidate)
  ) fail(`${label} must be a logical reference, not a URL or filesystem locator.`);
  if (!SAFE_REF.test(candidate)) fail(`${label} must be a logical reference, not raw content.`);
  return candidate;
}

function utc(value: unknown, label: string): string {
  const candidate = text(value, label, 32);
  if (!UTC.test(candidate) || !Number.isFinite(Date.parse(candidate))) fail(`${label} must be a strict UTC timestamp.`);
  return candidate;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function refs(
  value: unknown,
  label: string,
  options: { kind?: "generic" | "credential" | "evidence"; min?: number; max?: number } = {},
): string[] {
  const { kind = "generic", min = 0, max = 16 } = options;
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain between ${min} and ${max} references.`);
  }
  const normalized = value.map((entry, index) => {
    const ref = safeRef(entry, `${label}[${index}]`);
    if (kind === "credential" && !CREDENTIAL_REF.test(ref)) {
      fail(`${label}[${index}] must be a credential-ref logical reference. Credential values are forbidden.`);
    }
    if (kind === "evidence" && !EVIDENCE_REF.test(ref)) {
      fail(`${label}[${index}] must be an evidence, receipt, observation, or log reference.`);
    }
    return ref;
  });
  if (new Set(normalized).size !== normalized.length) fail(`${label} must not contain duplicate references.`);
  return normalized.sort();
}

function reservedDeviceSurface(proposal: OperationalProposal): boolean {
  return proposal.capabilityId === "device.execute"
    || proposal.operationType.startsWith("device.")
    || proposal.operationType.startsWith("device-")
    || proposal.operationType.startsWith("host.")
    || proposal.operationType.startsWith("host-")
    || proposal.operationType.startsWith("remote.")
    || proposal.operationType.startsWith("remote-")
    || proposal.targetRefs.some((target) =>
      target.startsWith("device:")
      || target.startsWith("worker-target:")
      || target.startsWith("host:")
      || target.startsWith("remote-host:")
    );
}

function approvalClass(effect: OperationalEffect): OperationalProposal["approvalClassId"] {
  return effect === "read_only" ? "bounded-read" : "consequential-external";
}

export function createOperationalProposal(value: unknown): OperationalProposal {
  const input = exactKeys(
    value,
    ["operationType", "adapterId", "capabilityId", "effect", "targetRefs", "credentialRefs", "requestedAt"],
    "proposal",
  );
  const operationType = safeId(input.operationType, "proposal.operationType");
  const adapterId = safeId(input.adapterId, "proposal.adapterId");
  const capabilityId = safeId(input.capabilityId, "proposal.capabilityId");
  if (input.effect !== "read_only" && input.effect !== "external_mutation") {
    fail("proposal.effect must be read_only or external_mutation.");
  }
  const effect = input.effect as OperationalEffect;
  const targetRefs = refs(input.targetRefs, "proposal.targetRefs", { min: 1, max: 16 });
  const credentialRefs = refs(input.credentialRefs, "proposal.credentialRefs", { kind: "credential", max: 8 });
  const requestedAt = utc(input.requestedAt, "proposal.requestedAt");
  const canonical = {
    operationType,
    adapterId,
    capabilityId,
    effect,
    targetRefs,
    credentialRefs,
    approvalClassId: approvalClass(effect),
    requestedAt,
  };
  const proposalDigest = digest(canonical);
  return {
    schemaVersion: "1.0",
    proposalId: `operation-proposal:${proposalDigest}`,
    proposalDigest,
    ...canonical,
    executionAuthority: "none",
  };
}

function normalizeProposal(value: unknown): OperationalProposal {
  const candidate = object(value, "proposal");
  const recreated = createOperationalProposal({
    operationType: candidate.operationType,
    adapterId: candidate.adapterId,
    capabilityId: candidate.capabilityId,
    effect: candidate.effect,
    targetRefs: candidate.targetRefs,
    credentialRefs: candidate.credentialRefs,
    requestedAt: candidate.requestedAt,
  });
  if (candidate.schemaVersion !== undefined) {
    if (candidate.schemaVersion !== "1.0" || candidate.proposalId !== recreated.proposalId || candidate.proposalDigest !== recreated.proposalDigest) {
      fail("proposal identity does not match its canonical contents.");
    }
  }
  return recreated;
}

export function createOperationalApproval(proposalValue: unknown, approvalValue: unknown): OperationalApproval {
  const proposal = normalizeProposal(proposalValue);
  const input = exactKeys(
    approvalValue,
    ["proposalId", "proposalDigest", "approvalClassId", "actorRef", "decidedAt", "decision"],
    "approval",
  );
  const proposalId = text(input.proposalId, "approval.proposalId");
  const proposalDigest = text(input.proposalDigest, "approval.proposalDigest", 64);
  const actorRef = safeRef(input.actorRef, "approval.actorRef");
  if (!actorRef.startsWith("principal:")) fail("approval.actorRef must be a principal: logical reference.");
  const decidedAt = utc(input.decidedAt, "approval.decidedAt");
  if (Date.parse(decidedAt) < Date.parse(proposal.requestedAt)) {
    fail("approval.decidedAt must not precede proposal.requestedAt.");
  }
  if (input.decision !== "approve") fail("approval.decision must be approve for execution admission.");
  if (proposalId !== proposal.proposalId || proposalDigest !== proposal.proposalDigest) {
    fail("approval must bind the exact proposal ID and digest.");
  }
  if (input.approvalClassId !== proposal.approvalClassId) fail("approval.approvalClassId must match the proposal.");
  return {
    schemaVersion: "1.0",
    approvalDecisionId: `operation-approval:${digest({
      proposalDigest,
      approvalClassId: proposal.approvalClassId,
      actorRef,
      decidedAt,
      decision: "approve",
    })}`,
    proposalId,
    proposalDigest,
    approvalClassId: proposal.approvalClassId,
    actorRef,
    decidedAt,
    decision: "approve",
    // 001A proves structural binding only. The caller/auth surface must later prove
    // that actorRef belongs to an authenticated and authorized principal.
    authenticationState: "not_verified_by_001a",
  };
}

function normalizeApproval(value: unknown, proposal: OperationalProposal): OperationalApproval {
  const candidate = object(value, "approval");
  const recreated = createOperationalApproval(proposal, {
    proposalId: candidate.proposalId,
    proposalDigest: candidate.proposalDigest,
    approvalClassId: candidate.approvalClassId,
    actorRef: candidate.actorRef,
    decidedAt: candidate.decidedAt,
    decision: candidate.decision,
  });
  if (candidate.schemaVersion !== undefined) {
    if (candidate.schemaVersion !== "1.0" || candidate.approvalDecisionId !== recreated.approvalDecisionId) {
      fail("approval identity does not match its canonical contents.");
    }
  }
  return recreated;
}

export function createOperationalJobIdentity(proposalValue: unknown, approvalValue: unknown) {
  const proposal = normalizeProposal(proposalValue);
  const approval = normalizeApproval(approvalValue, proposal);
  const identity = {
    proposalDigest: proposal.proposalDigest,
    approvalDecisionId: approval.approvalDecisionId,
    adapterId: proposal.adapterId,
    capabilityId: proposal.capabilityId,
  };
  const jobDigest = digest(identity);
  return Object.freeze({
    jobId: `operational-job:${jobDigest}`,
    correlationId: `corr:${jobDigest}`,
    idempotencyKey: `opidem:${jobDigest}`,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    approvalDecisionId: approval.approvalDecisionId,
  });
}

function receiptBase(proposal: OperationalProposal, approvalDecisionId: string | null, observedAt: string, attempted = false) {
  const identity = {
    proposalDigest: proposal.proposalDigest,
    approvalDecisionId: approvalDecisionId ?? "none",
    adapterId: proposal.adapterId,
    capabilityId: proposal.capabilityId,
  };
  const jobDigest = digest(identity);
  const attemptDigest = digest({ ...identity, observedAt });
  return {
    schemaVersion: "1.0" as const,
    jobId: `operational-job:${jobDigest}`,
    attemptId: `operation-attempt:${attemptDigest}`,
    correlationId: `corr:${jobDigest}`,
    idempotencyKey: `opidem:${jobDigest}`,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    approvalDecisionId,
    approvalAuthenticationState: "not_verified_by_001a" as const,
    operationType: proposal.operationType,
    adapterId: proposal.adapterId,
    capabilityId: proposal.capabilityId,
    effect: proposal.effect,
    targetRefs: [...proposal.targetRefs],
    credentialRefs: [...proposal.credentialRefs],
    observedAt,
    authority: { attempt: attempted, verify: "none" as const, deploy: "none" as const, publish: "none" as const, live: "none" as const },
    projections: { verified: false as const, deployed: false as const, live: false as const, published: false as const },
    persistence: { durableJobStore: false as const, durableIdempotencyClaim: false as const },
  };
}

function blockedReceipt(
  proposal: OperationalProposal,
  approvalDecisionId: string | null,
  observedAt: string,
  failure: Omit<OperationalFailure, "adapterFailureCode"> & { adapterFailureCode?: string | null },
): OperationalJobReceipt {
  return {
    ...receiptBase(proposal, approvalDecisionId, observedAt),
    status: "blocked",
    evidenceState: "blocked",
    execution: { adapterInvoked: false, mutationPerformed: false },
    evidence: { redacted: false, redactionProvenanceRef: null, refs: [], observedResourceRefs: [] },
    failure: { ...failure, adapterFailureCode: failure.adapterFailureCode ?? null },
  };
}

export function validateOperationalAdapterResult(value: unknown): OperationalAdapterResult {
  const result = exactKeys(value, ["outcome", "mutationPerformed", "evidenceRefs", "observedResourceRefs", "failure"], "adapter result");
  if (!["succeeded", "blocked", "failed"].includes(String(result.outcome))) fail("adapter result outcome is invalid.");
  if (typeof result.mutationPerformed !== "boolean") fail("adapter result mutationPerformed must be boolean.");
  const evidenceRefs = refs(result.evidenceRefs, "adapter result.evidenceRefs", { kind: "evidence", max: 32 });
  const observedResourceRefs = refs(result.observedResourceRefs, "adapter result.observedResourceRefs", { max: 32 });

  let failure: OperationalAdapterResult["failure"] = null;
  if (result.failure !== null) {
    const raw = exactKeys(result.failure, ["code", "message", "proposedNextAction"], "adapter result.failure");
    failure = {
      code: safeId(raw.code, "adapter result.failure.code"),
      message: text(raw.message, "adapter result.failure.message", 512),
      proposedNextAction: text(raw.proposedNextAction, "adapter result.failure.proposedNextAction", 512),
    };
  }

  if (result.outcome === "succeeded") {
    if (failure) fail("successful adapter results must not carry a failure.");
    if (evidenceRefs.length === 0) fail("successful adapter results require at least one evidence reference.");
  } else if (!failure) {
    fail("blocked or failed adapter results require a bounded failure.");
  }

  return {
    outcome: result.outcome as OperationalAdapterResult["outcome"],
    mutationPerformed: result.mutationPerformed,
    evidenceRefs,
    observedResourceRefs,
    failure,
  };
}

export function createOperationalAttemptBase(
  proposalValue: unknown,
  approvalValue: unknown,
  observedAtValue: unknown,
) {
  const proposal = normalizeProposal(proposalValue);
  const approval = normalizeApproval(approvalValue, proposal);
  const observedAt = utc(observedAtValue, "observedAt");
  const base = receiptBase(proposal, approval.approvalDecisionId, observedAt, true);
  return Object.freeze({
    proposal,
    approval,
    observedAt,
    receiptBase: Object.freeze(base),
    assignment: Object.freeze({
      jobId: base.jobId,
      attemptId: base.attemptId,
      correlationId: base.correlationId,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      operationType: proposal.operationType,
      capabilityId: proposal.capabilityId,
      effect: proposal.effect,
      targetRefs: Object.freeze([...proposal.targetRefs]),
      credentialRefs: Object.freeze([...proposal.credentialRefs]),
      approvalDecisionId: approval.approvalDecisionId,
    }),
  });
}

async function executeOperationalJobCore(
  rawInput: unknown,
): Promise<OperationalJobReceipt> {
  const input = requestObject(rawInput);
  const proposal = normalizeProposal(input.proposal);
  const observedAt = utc(input.observedAt, "observedAt");
  const adapter = input.adapter as OperationalAdapter;

  if (reservedDeviceSurface(proposal)) {
    return blockedReceipt(proposal, null, observedAt, {
      failureClassId: "device_execute_requires_qualified_wrapper",
      stage: "AdapterDispatch",
      message: "Device and host execution require the qualified device.execute boundary.",
      proposedNextAction: "Route the operation through the current device.execute consumer with WorkerTarget, Ward, claim, executor and BINS custody.",
    });
  }

  if (input.approval === undefined || input.approval === null) {
    return blockedReceipt(proposal, null, observedAt, {
      failureClassId: "approval_missing",
      stage: "ApprovalDecision",
      message: "Execution is blocked because no approval decision was supplied.",
      proposedNextAction: "Approve the exact current proposal before retrying.",
    });
  }

  let approval: OperationalApproval;
  try {
    approval = normalizeApproval(input.approval, proposal);
  } catch {
    return blockedReceipt(proposal, null, observedAt, {
      failureClassId: "approval_invalid",
      stage: "ApprovalDecision",
      message: "Execution is blocked because the approval is invalid or does not bind the current proposal.",
      proposedNextAction: "Create a fresh approval bound to the current proposal digest.",
    });
  }

  const decidedMs = Date.parse(approval.decidedAt);
  const observedMs = Date.parse(observedAt);
  if (observedMs < decidedMs || observedMs - decidedMs > APPROVAL_FRESHNESS_MS) {
    return blockedReceipt(proposal, approval.approvalDecisionId, observedAt, {
      failureClassId: "approval_expired",
      stage: "ApprovalDecision",
      message: "The approval is outside the one-hour execution freshness window.",
      proposedNextAction: "Re-approve the unchanged proposal digest before retrying.",
    });
  }

  // 001A intentionally proves only bounded read execution. Consequential provider
  // mutation requires durable persistence/idempotency and a separately admitted gate.
  if (proposal.effect !== "read_only") {
    return blockedReceipt(proposal, approval.approvalDecisionId, observedAt, {
      failureClassId: "effect_not_authorized",
      stage: "AdapterDispatch",
      message: "SWB-OPJOB-001A authorizes read-only adapter attempts only.",
      proposedNextAction: "Use a read-only capability or wait for a separately admitted consequential-mutation gate.",
    });
  }

  const adapterId = safeId(adapter?.adapterId, "adapter.adapterId");
  if (adapterId !== proposal.adapterId) {
    return blockedReceipt(proposal, approval.approvalDecisionId, observedAt, {
      failureClassId: "adapter_mismatch",
      stage: "AdapterDispatch",
      message: "The supplied adapter identity does not match the approved proposal.",
      proposedNextAction: "Dispatch only to the adapter named by the approved proposal.",
    });
  }
  if (!Array.isArray(adapter.capabilities) || !adapter.capabilities.includes(proposal.capabilityId)) {
    return blockedReceipt(proposal, approval.approvalDecisionId, observedAt, {
      failureClassId: "capability_unavailable",
      stage: "AdapterDispatch",
      message: "The approved capability is not declared by the selected adapter.",
      proposedNextAction: "Select a qualified adapter that declares the exact capability.",
    });
  }
  if (!Array.isArray(adapter.effects) || !adapter.effects.includes("read_only")) {
    return blockedReceipt(proposal, approval.approvalDecisionId, observedAt, {
      failureClassId: "capability_unavailable",
      stage: "AdapterDispatch",
      message: "The selected adapter does not declare the approved read-only effect.",
      proposedNextAction: "Select an adapter with a qualified read-only capability.",
    });
  }
  if (typeof adapter.execute !== "function") fail("adapter.execute must be a function.");

  const base = receiptBase(proposal, approval.approvalDecisionId, observedAt, true);
  const assignment: OperationalAdapterAssignment = {
    jobId: base.jobId,
    attemptId: base.attemptId,
    correlationId: base.correlationId,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    operationType: proposal.operationType,
    capabilityId: proposal.capabilityId,
    effect: proposal.effect,
    targetRefs: [...proposal.targetRefs],
    credentialRefs: [...proposal.credentialRefs],
    approvalDecisionId: approval.approvalDecisionId,
  };

  let rawResult: unknown;
  try {
    rawResult = await adapter.execute(assignment);
  } catch {
    return {
      ...base,
      status: "outcome_unknown",
      evidenceState: "unknown",
      execution: { adapterInvoked: true, mutationPerformed: null },
      evidence: { redacted: false, redactionProvenanceRef: null, refs: [], observedResourceRefs: [] },
      failure: {
        failureClassId: "adapter_exception",
        stage: "AdapterAttempt",
        message: "The adapter invocation ended without a trustworthy result. Reconcile the target before any retry.",
        proposedNextAction: "Read the authoritative target and existing attempt custody before deciding whether retry is safe.",
        adapterFailureCode: null,
      },
    };
  }

  let result: OperationalAdapterResult;
  try {
    result = validateOperationalAdapterResult(rawResult);
  } catch {
    return {
      ...base,
      status: "outcome_unknown",
      evidenceState: "unknown",
      execution: { adapterInvoked: true, mutationPerformed: null },
      evidence: { redacted: false, redactionProvenanceRef: null, refs: [], observedResourceRefs: [] },
      failure: {
        failureClassId: "adapter_result_invalid",
        stage: "AdapterAttempt",
        message: "The adapter returned a result that cannot establish what happened. Reconcile the target before any retry.",
        proposedNextAction: "Read the authoritative target and existing attempt custody before deciding whether retry is safe.",
        adapterFailureCode: null,
      },
    };
  }

  if (result.mutationPerformed) {
    return {
      ...base,
      status: "failed",
      evidenceState: "failed",
      execution: { adapterInvoked: true, mutationPerformed: true },
      evidence: { redacted: false, redactionProvenanceRef: null, refs: result.evidenceRefs, observedResourceRefs: result.observedResourceRefs },
      failure: {
        failureClassId: "effect_boundary_violation",
        stage: "AdapterAttempt",
        message: "A read-only OperationalJob reported a mutation. The attempt is failed and cannot advance.",
        proposedNextAction: "Quarantine the adapter, inspect its evidence, and do not retry until the mutation boundary is explained.",
        adapterFailureCode: null,
      },
    };
  }

  if (result.outcome === "succeeded") {
    return {
      ...base,
      status: "succeeded",
      evidenceState: "reported",
      execution: { adapterInvoked: true, mutationPerformed: false },
      evidence: { redacted: false, redactionProvenanceRef: null, refs: result.evidenceRefs, observedResourceRefs: result.observedResourceRefs },
      failure: null,
    };
  }

  return {
    ...base,
    status: result.outcome === "blocked" ? "blocked" : "failed",
    evidenceState: result.outcome === "blocked" ? "blocked" : "failed",
    execution: { adapterInvoked: true, mutationPerformed: false },
    evidence: { redacted: false, redactionProvenanceRef: null, refs: result.evidenceRefs, observedResourceRefs: result.observedResourceRefs },
    failure: {
      failureClassId: result.outcome === "blocked" ? "adapter_blocked" : "adapter_failed",
      stage: "AdapterAttempt",
      message: result.outcome === "blocked"
        ? "The qualified adapter reported a blocked outcome."
        : "The qualified adapter reported a failed outcome.",
      proposedNextAction: "Inspect qualified evidence and reconcile current target state before retrying.",
      adapterFailureCode: result.failure!.code,
    },
  };
}

export async function executeOperationalJob(rawInput: unknown): Promise<OperationalJobReceipt> {
  return executeOperationalJobCore(rawInput);
}

/**
 * Compatibility shim only. Device/host execution authority no longer exists in
 * the generic OperationalJob layer. Callers must use the canonical #18
 * executeDeviceRead path, which independently resolves WorkerTarget, Ward,
 * durable claim, executor qualification and BINS custody.
 */
/**
 * Compatibility shim only. Device/host execution authority never exists in
 * the generic OperationalJob layer. The canonical #18 path is executeDeviceRead,
 * which performs WorkerTarget, Ward, durable claim, executor and BINS checks
 * before invoking a registered adapter.
 */
export async function executeQualifiedDeviceOperationalJob(
  rawInput: unknown,
  _deviceQualification: unknown,
): Promise<OperationalJobReceipt> {
  return executeOperationalJobCore(rawInput);
}

export function createFixtureReadOnlyAdapter(input: {
  adapterId: string;
  capabilityId: string;
  evidenceRefs?: string[];
  observedResourceRefs?: string[];
  outcome?: "succeeded" | "blocked" | "failed";
  mutationPerformed?: boolean;
}): OperationalAdapter {
  const adapterId = safeId(input.adapterId, "fixture.adapterId");
  const capabilityId = safeId(input.capabilityId, "fixture.capabilityId");
  const evidenceRefs = refs(input.evidenceRefs ?? ["evidence:fixture:read-only"], "fixture.evidenceRefs", { kind: "evidence", max: 32 });
  const observedResourceRefs = refs(input.observedResourceRefs ?? [], "fixture.observedResourceRefs", { max: 32 });
  const outcome = input.outcome ?? "succeeded";
  const mutationPerformed = input.mutationPerformed ?? false;

  return {
    adapterId,
    capabilities: [capabilityId],
    effects: ["read_only"],
    execute() {
      return {
        outcome,
        mutationPerformed,
        evidenceRefs: [...evidenceRefs],
        observedResourceRefs: [...observedResourceRefs],
        failure: outcome === "succeeded" ? null : {
          code: outcome === "blocked" ? "fixture_blocked" : "fixture_failed",
          message: outcome === "blocked" ? "The fixture adapter is deliberately blocked." : "The fixture adapter deliberately failed.",
          proposedNextAction: "Inspect the bounded fixture evidence before retrying.",
        },
      };
    },
  };
}

export function assertOperationalReceiptCannotSelfPromote(receipt: OperationalJobReceipt): void {
  if (receipt.authority.attempt !== receipt.execution.adapterInvoked) {
    throw new Error("OperationalJob attempt authority must equal observed adapter invocation.");
  }
  if (receipt.evidence.redacted && !receipt.evidence.redactionProvenanceRef) {
    throw new Error("A redacted evidence claim requires explicit redaction provenance.");
  }
  if (receipt.projections.verified || receipt.projections.deployed || receipt.projections.live || receipt.projections.published) {
    throw new Error("OperationalJob attempt evidence cannot self-promote to a later lifecycle state.");
  }
  if (receipt.authority.verify !== "none" || receipt.authority.deploy !== "none" || receipt.authority.publish !== "none" || receipt.authority.live !== "none") {
    throw new Error("OperationalJob attempt evidence cannot claim verification, deployment, publication, or live authority.");
  }
  if (receipt.persistence.durableJobStore || receipt.persistence.durableIdempotencyClaim) {
    throw new Error("SWB-OPJOB-001A must not claim durable job persistence or exactly-once execution.");
  }
  if (receipt.approvalAuthenticationState !== "not_verified_by_001a") {
    throw new Error("SWB-OPJOB-001A must not claim authenticated approval authority.");
  }
}
