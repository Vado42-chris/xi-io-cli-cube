"""Fixture-specific PTY driver for the existing real-Ollama qualification.

This is not a product verifier or an authorization API. A terminal preview is
not lossless, so approval screening never replaces raw receipt and byte checks.
Rejected proposals remain in the same conversation. An approved effect is never
retried, repaired or reset by this driver.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import time

import pexpect


BEFORE = b"status: old\n"
AFTER = b"status: new\n"
PROMPT = "xi> "
APPROVAL = "Approve this exact action? [y/N]: "
FOOTER = "/details shows the full execution receipt and model reply."
MARKER = "Actual execution receipt (CLI-observed, not model claims):"
EDIT_REQUEST = (
    'Read NOTE.txt first, then use edit_workspace_file with path="NOTE.txt", '
    'old_text="status: old" and new_text="status: new". Both replacement '
    'arguments contain no newline characters. Preserve the existing trailing '
    'newline and all other bytes. Propose only this one edit, then verify it.'
)


class ProofFailure(RuntimeError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, reason):
    if not condition:
        raise ProofFailure(reason)


def _proposal_fields(preview):
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", preview)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if text.count("| REVIEW PROPOSED ACTION") != 1 or text.count("Proposed ") != 1:
        return None
    match = re.search(
        r"(?:^|\n)(\+-{2,}\+)\n"
        r"\| REVIEW PROPOSED ACTION\n"
        r"\| Proposed change to NOTE\.txt \(line 1\):\n"
        r"\| - ([^\n]+)\n"
        r"\| \+ ([^\n]*)\n"
        r"\| Everything else in the file stays exactly as it is\.\n"
        r"\| Nothing changes until you approve\.\n"
        r"\1\n?\Z", text,
    )
    return match.groups()[1:] if match else None


def qualifies_proposal(preview):
    """Screen only this fixture's displayed edit, not arbitrary tool authority."""
    return _proposal_fields(preview) == ("status: old", "status: new")


def facts_of(receipt, state):
    require(isinstance(receipt, dict), "RECEIPT_NOT_AN_OBJECT")
    require({"schema", "source", "state", "request_fulfillment", "first_red",
             "provider_error", "tool_results"} <= set(receipt)
            and receipt.get("schema") == "xiio.cli.execution-return/v1"
            and receipt.get("source") == "provider"
            and receipt.get("state") == state
            and receipt.get("request_fulfillment") == "NOT_EVALUATED",
            "EXECUTION_RECEIPT_IDENTITY_MISMATCH")
    facts = receipt.get("tool_results")
    require(isinstance(facts, list) and facts
            and all(isinstance(f, dict) and {"name", "state", "reason", "arguments", "result"} <= set(f)
                    and isinstance(f.get("arguments"), dict)
                    and isinstance(f.get("result"), dict) for f in facts),
            "TOOL_RECEIPT_MISSING")
    return facts


def checked_read(fact, allowed_bytes):
    result = fact["result"]
    require(fact.get("name") == "read_workspace_file"
            and fact.get("state") == "SUCCEEDED" and fact.get("reason") is None
            and fact["arguments"].get("path") == "NOTE.txt"
            and result.get("path") == "NOTE.txt"
            and result.get("full_content_returned") is True
            and result.get("bins_version_qualified") is False,
            "REAL_OLLAMA_READ_RECEIPT_MISMATCH")
    require(any(result.get("content") == data.decode("utf-8")
                and result.get("sha256") == digest(data)
                and result.get("byte_length") == len(data)
                and type(result.get("byte_length")) is int
                for data in allowed_bytes), "REAL_OLLAMA_READBACK_MISSING")


def validate_read_receipt(receipt):
    facts = facts_of(receipt, "TOOL_RESULTS_RECORDED")
    require(receipt.get("first_red") is None and receipt.get("provider_error") is None,
            "READ_TURN_INCOMPLETE")
    for fact in facts:
        checked_read(fact, [BEFORE])


def validate_refusal_receipt(receipt):
    facts = facts_of(receipt, "FAILED")
    reason = "HUMAN_APPROVAL_REQUIRED"
    require(receipt.get("first_red") == reason and receipt.get("provider_error") == reason,
            "REFUSAL_RECEIPT_MISSING")
    refused = [f for f in facts if f.get("state") == "FAILED"]
    require(len(refused) == 1 and refused[0].get("reason") == reason
            and refused[0]["result"] == {"state": "FAIL", "reason": reason},
            "REFUSAL_EFFECT_UNCERTAIN")
    args = refused[0]["arguments"]
    require(refused[0].get("name") == "edit_workspace_file"
            and args.get("path") == "NOTE.txt"
            and isinstance(args.get("old_text"), str)
            and isinstance(args.get("new_text"), str) and "content" not in args,
            "UNRELATED_PROPOSAL_REFUSED")
    for fact in facts:
        if fact is not refused[0]:
            checked_read(fact, [BEFORE])


def validate_edit_receipt(receipt):
    facts = facts_of(receipt, "TOOL_RESULTS_RECORDED")
    require(receipt.get("first_red") is None and receipt.get("provider_error") is None,
            "EDIT_TURN_INCOMPLETE")
    edits = [f for f in facts if f.get("name") == "edit_workspace_file"]
    require(len(edits) == 1, "EXPECTED_ONE_EDIT_RECEIPT")
    fact = edits[0]
    args, result = fact["arguments"], fact["result"]
    require(fact.get("state") == "SUCCEEDED" and fact.get("reason") is None
            and args.get("path") == "NOTE.txt"
            and args.get("old_text") == "status: old"
            and args.get("new_text") == "status: new"
            and set(args) <= {"path", "old_text", "new_text", "expected_sha256"}
            and ("expected_sha256" not in args or args["expected_sha256"] == digest(BEFORE))
            and ("created" not in result or result["created"] is False),
            "APPROVED_EDIT_ARGUMENTS_MISMATCH")
    expected = {
        "state": "LOCAL_CAS_COMMITTED", "guard": "SAME_HOST_COOPERATIVE_FILE_LOCK",
        "path": "NOTE.txt", "line": 1,
        "sha256_before": digest(BEFORE), "sha256_after": digest(AFTER),
        "bytes_before": len(BEFORE), "bytes_after": len(AFTER),
        "readback_matches": True, "bytes_outside_change_preserved": True,
        "bins_version_qualified": False, "ward_authority_granted": False,
        "remote_execution_qualified": False,
    }
    require(all(result.get(k) == v and type(result.get(k)) is type(v)
                for k, v in expected.items()), "EDIT_CAS_RECEIPT_MISMATCH")
    for other in facts:
        if other is not fact:
            checked_read(other, [BEFORE, AFTER])


def run_proof(child, note_path, evidence_root, *, edit_timeout=240, max_proposals=3):
    """Run one session, with bounded corrections only after a proven no-effect refusal."""
    note_path, evidence_root = Path(note_path), Path(evidence_root)
    require(1 <= max_proposals <= 3, "INVALID_PROPOSAL_BOUND")
    outcome = {"state": "FAIL", "approvals": 0, "rejected_proposals": 0,
               "proposal_attempts": 0}
    evidence_root.mkdir(parents=True, exist_ok=True)

    def save(name, value):
        (evidence_root / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def expect(patterns, deadline):
        remaining = deadline - time.monotonic()
        require(remaining > 0, "REAL_OLLAMA_PROOF_TIMEOUT")
        try:
            return child.expect_exact(patterns, timeout=remaining)
        except pexpect.EOF as error:
            raise ProofFailure("CLI_EXITED_BEFORE_PROOF_COMPLETED") from error
        except pexpect.TIMEOUT as error:
            raise ProofFailure("REAL_OLLAMA_PROOF_TIMEOUT") from error

    def completed_turn(deadline):
        if expect([FOOTER, APPROVAL], deadline) != 0:
            child.sendline("no")
            raise ProofFailure("UNEXPECTED_ADDITIONAL_APPROVAL")
        expect(PROMPT, deadline)

    def details(name, deadline):
        child.sendline("/details")
        expect(MARKER, deadline)
        expect(PROMPT, deadline)
        raw = child.before.replace("\r\n", "\n").replace("\r", "\n")
        try:
            receipt, _ = json.JSONDecoder().raw_decode(raw.lstrip())
        except (ValueError, TypeError) as error:
            raise ProofFailure("EXECUTION_RECEIPT_JSON_INVALID") from error
        save(name, receipt)
        return receipt

    try:
        require(note_path.read_bytes() == BEFORE, "FIXTURE_PREIMAGE_MISMATCH")
        deadline = time.monotonic() + min(180, edit_timeout)
        expect("What would you like to build or work on?", deadline)
        expect(PROMPT, deadline)
        child.sendline("Read NOTE.txt using your file tool. Tell me the exact current status. Do not guess.")
        completed_turn(deadline)
        validate_read_receipt(details("read.receipt.json", deadline))
        require(note_path.read_bytes() == BEFORE, "READ_CHANGED_FIXTURE")

        deadline = time.monotonic() + edit_timeout
        for attempt in range(1, max_proposals + 1):
            outcome["proposal_attempts"] = attempt
            child.sendline(("The previous proposal was refused without any file change. "
                            if attempt > 1 else "") + EDIT_REQUEST)
            if expect([APPROVAL, FOOTER], deadline) != 0:
                expect(PROMPT, deadline)
                details(f"edit-{attempt}.receipt.json", deadline)
                raise ProofFailure("REAL_OLLAMA_EDIT_PROPOSAL_MISSING")
            preview = child.before
            (evidence_root / f"proposal-{attempt}.txt").write_text(preview, encoding="utf-8")
            require(note_path.read_bytes() == BEFORE, "FIXTURE_CHANGED_BEFORE_APPROVAL")
            approved = qualifies_proposal(preview)
            child.sendline("yes" if approved else "no")
            outcome["approvals" if approved else "rejected_proposals"] += 1
            completed_turn(deadline)
            receipt = details(f"edit-{attempt}.receipt.json", deadline)
            if not approved:
                require(note_path.read_bytes() == BEFORE, "REFUSED_PROPOSAL_CHANGED_FIXTURE")
                validate_refusal_receipt(receipt)
                fields = _proposal_fields(preview)
                refused = next(f for f in receipt["tool_results"] if f["state"] == "FAILED")
                require(fields is not None and fields == (refused["arguments"]["old_text"],
                                                          refused["arguments"]["new_text"]),
                        "UNRECOGNIZED_PROPOSAL_REFUSED")
                continue
            # There is no retry or file reset below this point, even if the
            # preview looked correct but concealed newline differences.
            validate_edit_receipt(receipt)
            require(note_path.read_bytes() == AFTER, "INDEPENDENT_FILE_READBACK_MISMATCH")
            child.sendline("/exit")
            expect(pexpect.EOF, time.monotonic() + 30)
            require(note_path.read_bytes() == AFTER, "FILE_CHANGED_ON_EXIT")
            outcome.update(state="PASS", sha256_after=digest(AFTER))
            return outcome
        raise ProofFailure("REAL_OLLAMA_PROPOSAL_LIMIT")
    except Exception as error:
        outcome["reason"] = str(error)
        raise
    finally:
        # These are the driver's real observations, not a generated product
        # receipt. Preserve failure bytes as well as success bytes for diagnosis.
        if note_path.is_file():
            observed = note_path.read_bytes()
            (evidence_root / "observed-NOTE.txt").write_bytes(observed)
            outcome["observed_sha256"] = digest(observed)
        save("outcome.json", outcome)


def main():
    root = Path(os.environ["XIIO_PROOF_ROOT"])
    runtime = Path(os.environ["XIIO_RUNTIME"])
    root.mkdir(parents=True, exist_ok=True)
    child = pexpect.spawn(
        "node", [str(runtime), "chat", str(root / "project"), "--model", "qwen2.5:1.5b"],
        encoding="utf-8", timeout=180,
        env={**os.environ, "XIIO_MODEL": "qwen2.5:1.5b", "XIIO_TOOL_MODE": "structured"},
    )
    with (root / "transcript.txt").open("w", encoding="utf-8") as log:
        child.logfile = log
        try:
            result = run_proof(child, root / "project" / "NOTE.txt", root)
        finally:
            child.close(force=True)
    print("REAL_OLLAMA_READ=PASS")
    print("REAL_OLLAMA_APPROVED_EDIT=PASS")
    print("INDEPENDENT_FILE_READBACK=PASS")
    print("APPROVAL_COUNT=" + str(result["approvals"]))
    print("REJECTED_PROPOSALS=" + str(result["rejected_proposals"]))
    print("FIRST_ATTEMPT_PROPOSAL=" + ("PASS" if result["rejected_proposals"] == 0 else "REFUSED"))


if __name__ == "__main__":
    main()
