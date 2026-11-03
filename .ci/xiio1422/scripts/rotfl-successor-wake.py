#!/usr/bin/env python3
import argparse
import base64
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys

WAKE_SCHEMA = "xiio.rotfl.successor-wake/v1"
INPUT_SCHEMA = "xiio.rotfl.next-input/v1"
CLAIM_SCHEMA = "xiio.rotfl.successor-wake-claim/v1"

def fail(code, rc):
    print(code, file=sys.stderr)
    raise SystemExit(rc)

def load_regular(path, missing, invalid):
    p = Path(path)
    if not p.is_file() or p.is_symlink():
        fail(missing, 40)
    try:
        return p, json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        fail(invalid, 41)

def effect_zero(value):
    return value in (0, False, "0", "NO_EFFECT")

def resolve(wake_path, wake_ref, next_ref, next_dir):
    if not wake_ref or not next_ref:
        fail("BLOCKED_SUCCESSOR_REFS_MISSING", 42)
    wake_file, wake = load_regular(
        wake_path,
        "BLOCKED_WAKE_RECEIPT_PATH_UNVERIFIED",
        "BLOCKED_WAKE_RECEIPT_INVALID_JSON",
    )
    if wake.get("schema") != WAKE_SCHEMA:
        fail("BLOCKED_WAKE_RECEIPT_SCHEMA_INVALID", 43)
    if wake.get("state") != "READY":
        fail("BLOCKED_WAKE_NOT_READY", 44)
    if str(wake.get("wake_ref") or "") != wake_ref:
        fail("BLOCKED_WAKE_REF_MISMATCH", 45)
    if str(wake.get("next_input_ref") or "") != next_ref:
        fail("BLOCKED_NEXT_INPUT_REF_MISMATCH", 46)
    if not effect_zero(wake.get("effect_authority")):
        fail("BLOCKED_WAKE_CLAIMS_EFFECT_AUTHORITY", 47)

    slot = hashlib.sha256(next_ref.encode("utf-8")).hexdigest() + ".json"
    next_file, nxt = load_regular(
        Path(next_dir) / slot,
        "BLOCKED_NEXT_FROZEN_INPUT_NOT_FOUND",
        "BLOCKED_NEXT_FROZEN_INPUT_INVALID_JSON",
    )
    if nxt.get("schema") != INPUT_SCHEMA:
        fail("BLOCKED_NEXT_FROZEN_INPUT_SCHEMA_INVALID", 48)
    if nxt.get("state") != "FROZEN":
        fail("BLOCKED_NEXT_FROZEN_INPUT_NOT_FROZEN", 49)
    if str(nxt.get("next_input_ref") or "") != next_ref:
        fail("BLOCKED_NEXT_FROZEN_INPUT_REF_MISMATCH", 50)
    if not effect_zero(nxt.get("effect_authority")):
        fail("BLOCKED_NEXT_INPUT_CLAIMS_EFFECT_AUTHORITY", 51)
    for key in ("case_root", "query", "work_ref", "source_generation"):
        if not isinstance(nxt.get(key), str) or not nxt[key].strip():
            fail("BLOCKED_NEXT_FROZEN_INPUT_" + key.upper() + "_MISSING", 52)

    digest = hashlib.sha256(next_file.read_bytes()).hexdigest()
    return wake_file, wake, next_file, nxt, digest

def read_rows(fh):
    fh.seek(0)
    rows = []
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            fail("WAKE_CONSUMPTION_LEDGER_INVALID_JSON", 60)
    return rows

def append_locked(fh, record):
    fh.seek(0, os.SEEK_END)
    fh.write(json.dumps(record, separators=(",", ":")) + "\n")
    fh.flush()
    os.fsync(fh.fileno())

def claim(args):
    _, _, _, nxt, digest = resolve(
        args.wake_path, args.wake_ref, args.next_ref, args.next_dir
    )
    ledger = Path(args.ledger)
    ledger.parent.mkdir(parents=True, exist_ok=True)
    ledger.touch(exist_ok=True)
    with ledger.open("r+", encoding="utf-8") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        prior = [r for r in read_rows(fh) if r.get("wake_ref") == args.wake_ref]
        if prior:
            last = prior[-1]
            same = (
                last.get("next_input_ref") == args.next_ref
                and last.get("next_input_sha256") == digest
            )
            if same:
                fail("WAKE_ALREADY_CLAIMED", 61)
            fail("WAKE_IDENTITY_COLLISION", 62)
        record = {
            "schema": CLAIM_SCHEMA,
            "state": "CLAIMED",
            "wake_ref": args.wake_ref,
            "next_input_ref": args.next_ref,
            "next_input_sha256": digest,
            "claimed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "effect_authority": 0,
        }
        append_locked(fh, record)

    values = (
        nxt["case_root"],
        nxt["query"],
        args.wake_ref,
        args.next_ref,
        digest,
    )
    if args.nul:
        for value in values:
            sys.stdout.buffer.write(value.encode("utf-8") + b"\0")
    else:
        print(
            json.dumps(
                {
                    "schema": CLAIM_SCHEMA,
                    "state": "CLAIMED",
                    "case_root_b64": base64.b64encode(values[0].encode()).decode(),
                    "query_b64": base64.b64encode(values[1].encode()).decode(),
                    "wake_ref": values[2],
                    "next_input_ref": values[3],
                    "next_input_sha256": values[4],
                    "effect_authority": 0,
                },
                separators=(",", ":"),
            )
        )

def complete(args):
    ledger = Path(args.ledger)
    if not ledger.is_file() or ledger.is_symlink():
        fail("WAKE_CLAIM_LEDGER_MISSING", 63)
    with ledger.open("r+", encoding="utf-8") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        prior = [r for r in read_rows(fh) if r.get("wake_ref") == args.wake_ref]
        if not prior or prior[-1].get("state") != "CLAIMED":
            fail("WAKE_CLAIM_NOT_CURRENT", 64)
        last = prior[-1]
        if (
            last.get("next_input_ref") != args.next_ref
            or last.get("next_input_sha256") != args.digest
        ):
            fail("WAKE_CLAIM_IDENTITY_MISMATCH", 65)
        record = {
            "schema": CLAIM_SCHEMA,
            "state": "CONSUMED",
            "wake_ref": args.wake_ref,
            "next_input_ref": args.next_ref,
            "next_input_sha256": args.digest,
            "successor_run_id": args.successor_run_id,
            "consumed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "effect_authority": 0,
        }
        append_locked(fh, record)
    print(json.dumps(record, separators=(",", ":")))

def parser():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate")
    for name in ("wake_path", "wake_ref", "next_ref", "next_dir"):
        v.add_argument("--" + name.replace("_", "-"), required=True)

    c = sub.add_parser("claim")
    for name in ("wake_path", "wake_ref", "next_ref", "next_dir", "ledger"):
        c.add_argument("--" + name.replace("_", "-"), required=True)
    c.add_argument("--nul", action="store_true")

    d = sub.add_parser("complete")
    for name in ("ledger", "wake_ref", "next_ref", "digest", "successor_run_id"):
        d.add_argument("--" + name.replace("_", "-"), required=True)
    return p

def main():
    args = parser().parse_args()
    if args.cmd == "validate":
        resolve(args.wake_path, args.wake_ref, args.next_ref, args.next_dir)
        print("PASS_SUCCESSOR_MATERIALIZED")
    elif args.cmd == "claim":
        claim(args)
    else:
        complete(args)

if __name__ == "__main__":
    main()
