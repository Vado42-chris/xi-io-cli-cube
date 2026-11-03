#!/usr/bin/env bash
# Durable #1422 yield + successor hostile bundle.
# Hard: CLOUD_SCRATCH!=DELIVERY · REPORT!=DONE · SCHEMA_PASS!=FOUR_REDS_CLOSED
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AP="$ROOT/scripts/xiio-rotfl-autopilot"
HELPER="$ROOT/scripts/rotfl-successor-wake.py"
pass=0
fail=0
results=()

record() {
  local id="$1" want="$2" got="$3" rc="$4"
  if printf '%s' "$got" | grep -Eq "$want"; then
    results+=("PASS|$id|rc=$rc|$got")
    pass=$((pass + 1))
  else
    results+=("FAIL|$id|want=$want|got=$got|rc=$rc")
    fail=$((fail + 1))
  fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export XIIO_ROTFL_LEDGER_DIR="$tmp/ledger"
mkdir -p "$XIIO_ROTFL_LEDGER_DIR/next-inputs"
printf 'return\n' > "$tmp/owner-return.proof"
printf 'readback\n' > "$tmp/reverse-readback.proof"
cat > "$tmp/principal.bind.json" <<'JSON'
{"schema":"xiio.rotfl.principal-binding/v1","principal_ref":"principal:ibal","principal_type":"agent","source":"owner_registry_resolve"}
JSON
cat > "$tmp/assignment.bind.json" <<'JSON'
{"schema":"xiio.rotfl.assignment-binding/v1","assignment_ref":"wa:1","assignment_generation":"generation:1","principal_ref":"principal:ibal","source":"owner_registry_resolve"}
JSON
next_ref="next:1"
wake_ref="wake:1"
next_slot="$(python3 - "$next_ref" <<'PY'
import hashlib,sys
print(hashlib.sha256(sys.argv[1].encode()).hexdigest()+'.json')
PY
)"
cat > "$XIIO_ROTFL_LEDGER_DIR/next-inputs/$next_slot" <<JSON
{"schema":"xiio.rotfl.next-input/v1","state":"FROZEN","next_input_ref":"$next_ref","case_root":"$tmp/case","query":"continue exact frozen work","work_ref":"work:1","source_generation":"generation:1","effect_authority":0}
JSON
mkdir -p "$tmp/case"
cat > "$tmp/wake.proof" <<JSON
{"schema":"xiio.rotfl.successor-wake/v1","state":"READY","wake_ref":"$wake_ref","next_input_ref":"$next_ref","effect_authority":0}
JSON


make_proof() {
  local out="$1" apply="${2:-APPLY_RETURN_APPLIED_READBACK_VERIFIED}" silent="${3:-0}" wake_auth="${4:-0}" run_id="${5:-run:1}" agent_id="${6:-agent:ibal:r1}" gen="${7:-generation:1}" wake_path="${8:-$tmp/wake.proof}" proof_next="${9:-$next_ref}" proof_wake="${10:-$wake_ref}"
  cat > "$out" <<JSON
{"schema":"xiio.rotfl.lifecycle-owner-proof/v1","run_id":"$run_id","agent_id":"$agent_id","principal_ref":"principal:ibal","assignment_ref":"wa:1","assignment_generation":"$gen","principal_binding_path":"$tmp/principal.bind.json","assignment_binding_path":"$tmp/assignment.bind.json","worker_return_state":"RETURN_LINEAGE_BOUND","apply_return_verdict":"$apply","affected_return_state":"CURRENT","silent_remainder":$silent,"next_input_ref":"$proof_next","wake_ref":"$proof_wake","wake_effect_authority":$wake_auth,"owner_return_path":"$tmp/owner-return.proof","reverse_readback_path":"$tmp/reverse-readback.proof","wake_receipt_path":"$wake_path"}
JSON
}

run_gate() {
  local receipt="$1"; shift
  OUT="$(bash "$AP" gate --receipt "$receipt" "$@" 2>/dev/null || true)"
  RC=0
  bash "$AP" gate --receipt "$receipt" "$@" >/dev/null 2>&1 || RC=$?
}

# 1 numeric silent_remainder
make_proof "$tmp/numeric.json"
run_gate "$tmp/numeric.json" --run-id run:1 --agent-id agent:ibal:r1
record "01_numeric_silent_remainder" "PASS_CONTINUATION_DRAINED" "$OUT" "$RC"

# 2 fabricated / missing owner evidence
cat > "$tmp/fabricated.json" <<'JSON'
{"schema":"xiio.rotfl.lifecycle-owner-proof/v1","run_id":"run:1","agent_id":"agent:ibal:r1","principal_ref":"principal:ibal","assignment_ref":"wa:1","assignment_generation":"generation:1","worker_return_state":"RETURN_LINEAGE_BOUND","apply_return_verdict":"APPLY_RETURN_APPLIED_READBACK_VERIFIED","affected_return_state":"CURRENT","silent_remainder":"0","next_input_ref":"next:1","wake_ref":"wake:1","wake_effect_authority":"0"}
JSON
run_gate "$tmp/fabricated.json" --run-id run:1 --agent-id agent:ibal:r1
record "02_missing_owner_evidence" "BLOCKED_OWNER_|BLOCKED_OWNER_PRINCIPAL|BLOCKED_OWNER_ASSIGNMENT|BLOCKED_OWNER_RETURN|BLOCKED_REVERSE|BLOCKED_WAKE" "$OUT" "$RC"

# 3 unapplied return + nonzero exit
make_proof "$tmp/unapplied.json" WAIT_APPLY_RETURN
run_gate "$tmp/unapplied.json" --run-id run:1 --agent-id agent:ibal:r1
if printf '%s' "$OUT" | grep -q 'BLOCKED_OWNER_APPLY_RETURN_UNVERIFIED' && [ "$RC" -ne 0 ]; then
  results+=("PASS|03_unapplied_nonzero_exit|rc=$RC|$OUT"); pass=$((pass+1))
else
  results+=("FAIL|03_unapplied_nonzero_exit|got=$OUT|rc=$RC"); fail=$((fail+1))
fi

# 4 stale run_id
make_proof "$tmp/stale_run.json" APPLY_RETURN_APPLIED_READBACK_VERIFIED 0 0 run:old
run_gate "$tmp/stale_run.json" --run-id run:current --agent-id agent:ibal:r1
record "04_stale_run_id" "BLOCKED_LIFECYCLE_RUN_ID_MISMATCH" "$OUT" "$RC"

# 5 stale assignment generation acceptance
make_proof "$tmp/stale_asg.json"
OUT="$(XIIO_ASSIGNMENT_GENERATION=generation:current bash "$AP" gate --receipt "$tmp/stale_asg.json" --run-id run:1 --agent-id agent:ibal:r1 2>/dev/null || true)"
RC=0; XIIO_ASSIGNMENT_GENERATION=generation:current bash "$AP" gate --receipt "$tmp/stale_asg.json" --run-id run:1 --agent-id agent:ibal:r1 >/dev/null 2>&1 || RC=$?
record "05_stale_assignment_generation" "BLOCKED_STALE_ASSIGNMENT_GENERATION" "$OUT" "$RC"

# 6 model as principal
cat > "$tmp/model.json" <<JSON
{"schema":"xiio.rotfl.lifecycle-owner-proof/v1","run_id":"run:1","agent_id":"agent:ibal:r1","principal_ref":"ollama:llama3","assignment_ref":"wa:1","assignment_generation":"generation:1","principal_binding_path":"$tmp/principal.bind.json","assignment_binding_path":"$tmp/assignment.bind.json","worker_return_state":"RETURN_LINEAGE_BOUND","apply_return_verdict":"APPLY_RETURN_APPLIED_READBACK_VERIFIED","affected_return_state":"CURRENT","silent_remainder":0,"next_input_ref":"next:1","wake_ref":"wake:1","wake_effect_authority":0,"owner_return_path":"$tmp/owner-return.proof","reverse_readback_path":"$tmp/reverse-readback.proof","wake_receipt_path":"$tmp/wake.proof"}
JSON
run_gate "$tmp/model.json" --run-id run:1 --agent-id agent:ibal:r1
record "06_model_as_principal" "BLOCKED_MODEL_OR_SESSION_AS_PRINCIPAL|BLOCKED_PRINCIPAL_REF_NOT_USERPRINCIPAL" "$OUT" "$RC"

# 7 no principal binding (caller assert)
make_proof "$tmp/nobind.json"
python3 - "$tmp/nobind.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p)); d.pop('principal_binding_path',None); d.pop('assignment_binding_path',None); json.dump(d,open(p,'w'),separators=(',',':'))
PY
run_gate "$tmp/nobind.json" --run-id run:1 --agent-id agent:ibal:r1 --principal-ref principal:ibal --assignment-ref wa:1
record "07_caller_assert_without_owner_binding" "BLOCKED_OWNER_PRINCIPAL_BINDING_UNVERIFIED|BLOCKED_OWNER_ASSIGNMENT_BINDING_UNVERIFIED" "$OUT" "$RC"

mv "$XIIO_ROTFL_LEDGER_DIR/next-inputs/$next_slot" "$tmp/held-next.json"
make_proof "$tmp/missing-next.json"
run_gate "$tmp/missing-next.json" --run-id run:1 --agent-id agent:ibal:r1
record "08_missing_frozen_next_input" "BLOCKED_NEXT_FROZEN_INPUT_NOT_FOUND" "$OUT" "$RC"
mv "$tmp/held-next.json" "$XIIO_ROTFL_LEDGER_DIR/next-inputs/$next_slot"

cat > "$tmp/wake-mismatch.proof" <<JSON
{"schema":"xiio.rotfl.successor-wake/v1","state":"READY","wake_ref":"wake:OTHER","next_input_ref":"$next_ref","effect_authority":0}
JSON
make_proof "$tmp/wake-mismatch.json" APPLY_RETURN_APPLIED_READBACK_VERIFIED 0 0 run:1 agent:ibal:r1 generation:1 "$tmp/wake-mismatch.proof"
run_gate "$tmp/wake-mismatch.json" --run-id run:1 --agent-id agent:ibal:r1
record "09_wake_ref_mismatch" "BLOCKED_WAKE_REF_MISMATCH" "$OUT" "$RC"

cp "$XIIO_ROTFL_LEDGER_DIR/next-inputs/$next_slot" "$tmp/next.good"
python3 - "$XIIO_ROTFL_LEDGER_DIR/next-inputs/$next_slot" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p)); d['effect_authority']=1; json.dump(d,open(p,'w'),separators=(',',':'))
PY
make_proof "$tmp/next-effect.json"
run_gate "$tmp/next-effect.json" --run-id run:1 --agent-id agent:ibal:r1
record "10_next_input_effect_authority" "BLOCKED_NEXT_INPUT_CLAIMS_EFFECT_AUTHORITY" "$OUT" "$RC"
mv "$tmp/next.good" "$XIIO_ROTFL_LEDGER_DIR/next-inputs/$next_slot"

claim="$(python3 "$HELPER" claim --wake-path "$tmp/wake.proof" --wake-ref "$wake_ref" --next-ref "$next_ref" --next-dir "$XIIO_ROTFL_LEDGER_DIR/next-inputs" --ledger "$XIIO_ROTFL_LEDGER_DIR/wake-consumption.jsonl" 2>"$tmp/claim.err")"
rc=$?
record "11_successor_claim" '"state":"CLAIMED".*"next_input_ref":"next:1"' "$claim" "$rc"
claim_digest="$(python3 - "$claim" <<'PY'
import json,sys
print(json.loads(sys.argv[1])['next_input_sha256'])
PY
)"

OUT="$(python3 "$HELPER" claim --wake-path "$tmp/wake.proof" --wake-ref "$wake_ref" --next-ref "$next_ref" --next-dir "$XIIO_ROTFL_LEDGER_DIR/next-inputs" --ledger "$XIIO_ROTFL_LEDGER_DIR/wake-consumption.jsonl" 2>&1 || true)"
RC=0
python3 "$HELPER" claim --wake-path "$tmp/wake.proof" --wake-ref "$wake_ref" --next-ref "$next_ref" --next-dir "$XIIO_ROTFL_LEDGER_DIR/next-inputs" --ledger "$XIIO_ROTFL_LEDGER_DIR/wake-consumption.jsonl" >/dev/null 2>&1 || RC=$?
record "12_wake_replay_refused" "WAKE_ALREADY_CLAIMED" "$OUT" "$RC"

OUT="$(python3 "$HELPER" complete --ledger "$XIIO_ROTFL_LEDGER_DIR/wake-consumption.jsonl" --wake-ref "$wake_ref" --next-ref "$next_ref" --digest "$claim_digest" --successor-run-id run:2 2>&1)"
RC=$?
record "13_claim_completion" '"state":"CONSUMED".*"successor_run_id":"run:2"' "$OUT" "$RC"

OUT="$(python3 "$HELPER" claim --wake-path "$tmp/wake.proof" --wake-ref "$wake_ref" --next-ref "$next_ref" --next-dir "$XIIO_ROTFL_LEDGER_DIR/next-inputs" --ledger "$XIIO_ROTFL_LEDGER_DIR/wake-consumption.jsonl" 2>&1 || true)"
RC=0
python3 "$HELPER" claim --wake-path "$tmp/wake.proof" --wake-ref "$wake_ref" --next-ref "$next_ref" --next-dir "$XIIO_ROTFL_LEDGER_DIR/next-inputs" --ledger "$XIIO_ROTFL_LEDGER_DIR/wake-consumption.jsonl" >/dev/null 2>&1 || RC=$?
record "14_consumed_wake_replay_refused" "WAKE_ALREADY_CLAIMED" "$OUT" "$RC"

src="$(cat "$AP")"
if printf '%s' "$src" | grep -Fq 'lifecycle_gate "$XIIO_ROTFL_LIFECYCLE_RECEIPT" "$pending_run"' &&
   ! printf '%s' "$src" | grep -Fq 'lifecycle_gate "$XIIO_ROTFL_LIFECYCLE_RECEIPT" UNKNOWN'; then
  results+=("PASS|15_wait_binds_exact_run|source"); pass=$((pass+1))
else
  results+=("FAIL|15_wait_binds_exact_run|source contract missing"); fail=$((fail+1))
fi

if printf '%s' "$src" | grep -Fq 'run_once "$successor_case" "$successor_query" "$interval" __NONE__' &&
   printf '%s' "$src" | grep -Fq 'successor_complete "$successor_wake" "$successor_next" "$successor_digest" "$successor_run"'; then
  results+=("PASS|16_pass_executes_and_consumes_successor|source"); pass=$((pass+1))
else
  results+=("FAIL|16_pass_executes_and_consumes_successor|source contract missing"); fail=$((fail+1))
fi

if ! printf '%s' "$src" | grep -Fq 'PASS drains to SLEEPING without new Ollama run.' &&
   ! printf '%s' "$src" | grep -Fq 'write_heartbeat SLEEPING "$case_root" UNKNOWN NONE "$interval"'; then
  results+=("PASS|17_pass_does_not_sleep_forever|source"); pass=$((pass+1))
else
  results+=("FAIL|17_pass_does_not_sleep_forever|stale sleeping path present"); fail=$((fail+1))
fi


# 18 white-label autopilot must not silently route every Work item into SAM_LAW.
if ! printf '%s' "$src" | grep -Fq 'Hallberg-v-Andersen' &&
   ! printf '%s' "$src" | grep -Fq -- '--to sam_law' &&
   printf '%s' "$src" | grep -Fq 'XIIO_ROTFL_AIMAIL_TO'; then
  results+=("PASS|18_no_product_specific_aimail_bleed|source"); pass=$((pass+1))
else
  results+=("FAIL|18_no_product_specific_aimail_bleed|hard-coded product route present"); fail=$((fail+1))
fi

printf '{"schema":"xiio.rotfl.yield-hostile-bundle/v2","cases":18,"pass":%s,"fail":%s,"effect_authority":0,"completion_credit":0,"hard":["CLOUD_SCRATCH!=DELIVERY","REPORT!=DONE","PASS_CONTINUATION_DRAINED=>EXACTLY_ONE_FROZEN_SUCCESSOR_ATTEMPT","WAKE_REPLAY!=NEW_ATTEMPT"],"results":[' "$pass" "$fail"
first=1
for r in "${results[@]}"; do
  [ "$first" = 1 ] || printf ','
  first=0
  printf '"%s"' "$(printf '%s' "$r" | sed 's/"/\\"/g')"
done
printf ']}\n'
exit "$fail"
