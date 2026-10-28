// Offline HEX consumer of the byte-identical SDK SNAP 5.5 kernel.
// User-facing epoch fields are decimal STRINGS to avoid JSON.parse rounding a
// hostile numeric literal before the SDK can check Number.isSafeInteger.
// All computation stays in the bundled WebView. No credentials, network, files or effects.
import {snap55} from './sdk-snap55.mjs';

const ROOT_FIELDS = new Set(['questions', 'responses', 'journal', 'nowMs', 'decayMode']);
const QUESTION_FIELDS = new Set(['id', 'pillar']);
const JOURNAL_FIELDS = new Set(['timestamp', 'sensoryEntropy']);
const forbidden = /authorization|api[-_]?key|password|secret|token|cookie/i;

function fieldKeys(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('SNAP_INPUT_INVALID');
  for (const key of Object.keys(value)) {
    if (!fields.has(key) || ['__proto__','constructor','prototype'].includes(key) || forbidden.test(key))
      throw new TypeError('SNAP_INPUT_INVALID');
  }
}

export function exactDesktopEpoch(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value))
    throw new TypeError('SNAP_EPOCH_MUST_BE_DECIMAL_STRING');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || String(number) !== value)
    throw new TypeError('SNAP_EPOCH_NOT_EXACT');
  return number;
}

export function calculateDesktopSnap55(source) {
  if (typeof source !== 'string' || source.length > 65_536) throw new TypeError('SNAP_INPUT_BOUNDS');
  const input = JSON.parse(source, (key, value) => {
    if (['__proto__','constructor','prototype'].includes(key) || forbidden.test(key))
      throw new TypeError('SNAP_SENSITIVE_INPUT');
    return value;
  });
  fieldKeys(input, ROOT_FIELDS);
  if (!Object.hasOwn(input, 'nowMs')) throw new TypeError('SNAP_TIME_REQUIRED_FOR_REPLAY');
  if (!Array.isArray(input.questions) || input.questions.length > 256 ||
      !Array.isArray(input.journal ?? []) || (input.journal ?? []).length > 256)
    throw new TypeError('SNAP_INPUT_BOUNDS');
  for (const q of input.questions) fieldKeys(q, QUESTION_FIELDS);
  const journal = (input.journal ?? []).map(entry => {
    fieldKeys(entry, JOURNAL_FIELDS);
    return {...entry, timestamp: exactDesktopEpoch(entry.timestamp)};
  });
  const normalized = {
    questions: input.questions,
    responses: input.responses ?? {},
    journal,
    nowMs: exactDesktopEpoch(input.nowMs),
    decayMode: input.decayMode ?? 'legacy_efold18',
  };
  const result = snap55(normalized);
  // COMPUTED is a local calculation, never proof of clinical validity,
  // protected-data access, runtime authority, or installed consumer readback.
  return {
    schema: 'xiio.hex.desktop-snap55/v1',
    status: 'COMPUTED',
    source: '@xi-io/sdk/evaluation/hallbergmaths-snap55',
    source_commit: 'cfb7719d946443575e3b60d850d9923a7a6e2797',
    provider_effect: false,
    authority_granted: false,
    persistence: false,
    result,
  };
}
