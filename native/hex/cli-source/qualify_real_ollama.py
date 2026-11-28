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
import shutil
import stat
import subprocess
import time

import pexpect


BEFORE = b"status: old\n"
AFTER = b"status: new\n"
PROMPT = "xi> "
APPROVAL = "Approve this exact action? [y/N]: "
FOOTER = "/details shows the full execution receipt and model reply."
MARKER = "Actual execution receipt (CLI-observed, not model claims):"
READ_REQUEST = "Read NOTE.txt using your file tool. Tell me the exact current status. Do not guess."
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
        child.sendline(READ_REQUEST)
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
            child.close()
            require(child.exitstatus == 0 and child.signalstatus is None, "CLI_EXIT_FAILED")
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


def regular_bytes(file):
    file = Path(file)
    observed = file.lstat()
    require(stat.S_ISREG(observed.st_mode) and observed.st_nlink == 1
            and file.resolve() == file.absolute(), "PROOF_FILE_CUSTODY_INVALID")
    return file.read_bytes()


def save_json(file, value):
    Path(file).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def isolated_environment(root):
    # Preserve HOME and the inherited network configuration. All product-owned
    # state and installer smoke-test scratch space live inside this fresh bench.
    return {**os.environ, "XIIO_CONFIG_DIR": str(root / "config"),
            "XIIO_STATE_DIR": str(root / "state"),
            "XDG_STATE_HOME": str(root / "xdg-state"),
            "XDG_CONFIG_HOME": str(root / "xdg-config"),
            "XDG_DATA_HOME": str(root / "xdg-data"),
            "XDG_CACHE_HOME": str(root / "xdg-cache"),
            "TMPDIR": str(root / "tmp"),
            "XIIO_MODEL": "qwen2.5:1.5b", "XIIO_TOOL_MODE": "structured"}


def read_package(package):
    manifest_bytes = regular_bytes(package / "packaged-source.json")
    manifest = json.loads(manifest_bytes)
    composed = json.loads(regular_bytes(package.parent / "COMPOSED-packaged-source.receipt.json"))
    source = json.loads(regular_bytes(package / "SOURCE.json"))
    require(manifest.get("schema") == "xiio.cli.packaged-source/v1"
            and re.fullmatch(r"[0-9a-f]{40}", manifest.get("source_sha", ""))
            and composed.get("source_sha") == manifest["source_sha"]
            and composed.get("manifest_sha256") == digest(manifest_bytes)
            and composed.get("installer_sha256") == digest(regular_bytes(package / "install.mjs"))
            and source["current_packaged_payload"]["ref"] == manifest["source_sha"]
            and source["current_packaged_payload"]["files"] == manifest["files"],
            "PACKAGED_SOURCE_CUSTODY_MISMATCH")
    payload = {}
    for relative, expected in manifest["files"].items():
        require(not Path(relative).is_absolute() and ".." not in Path(relative).parts,
                "PACKAGED_PATH_INVALID")
        data = regular_bytes(package / relative)
        require(digest(data) == expected["sha256"] and len(data) == expected["size"],
                "PACKAGED_PAYLOAD_MISMATCH")
        payload[relative] = data
    require(payload and len(payload) == composed["payload_files"], "PACKAGED_PAYLOAD_MISSING")
    return manifest, payload


def run_json(command, env, evidence):
    result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=180)
    save_json(evidence, {"command": command, "returncode": result.returncode,
                         "stdout": result.stdout, "stderr": result.stderr})
    require(result.returncode == 0, "INSTALLED_PROCESS_FAILED")
    try:
        value = json.loads(result.stdout)
    except ValueError as error:
        raise ProofFailure("INSTALLED_PROCESS_JSON_INVALID") from error
    require(isinstance(value, dict), "INSTALLED_PROCESS_JSON_INVALID")
    return value


def observe_installed(root, manifest, payload, env, label, generation, previous):
    prefix, launcher = root / "prefix", root / "bin" / "xi-io-cli"
    require(re.fullmatch(r"[0-9a-f]{12}-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9_-]+", generation),
            "INSTALLED_GENERATION_INVALID")
    require(regular_bytes(prefix / "current").decode().strip() == generation,
            "INSTALLED_CURRENT_MISMATCH")
    actual_previous = regular_bytes(prefix / "previous").decode().strip() if (prefix / "previous").exists() else None
    require(actual_previous == previous, "INSTALLED_PREVIOUS_MISMATCH")
    installed = prefix / "versions" / generation
    receipt_bytes = regular_bytes(installed / "install-receipt.json")
    receipt = json.loads(receipt_bytes)
    expected_hashes = {relative: digest(data) for relative, data in payload.items()}
    require(receipt.get("schema") == "xiio.cli.install-receipt/v2"
            and receipt.get("source_sha") == manifest["source_sha"]
            and receipt.get("ref") == manifest["source_sha"]
            and receipt.get("repo") == "Vado42-chris/xi-io-cli"
            and receipt.get("generation") == generation
            and receipt.get("prefix") == str(prefix)
            and receipt.get("files") == expected_hashes,
            "INSTALLED_RECEIPT_MISMATCH")
    for relative, expected in payload.items():
        file = installed / relative
        require(regular_bytes(file) == expected, "INSTALLED_PAYLOAD_MISMATCH")
        require(stat.S_IMODE(file.stat().st_mode) == 0o600, "INSTALLED_PAYLOAD_MODE_MISMATCH")
    launcher_bytes = regular_bytes(launcher)
    require(os.access(launcher, os.X_OK), "INSTALLED_LAUNCHER_NOT_EXECUTABLE")
    version = run_json([str(launcher), "version"], env, root / (label + ".process.json"))
    require(version.get("schema") == "xiio.cli.version/v1" and version.get("state") == "PASS"
            and version.get("integrity_verified") is True and version.get("active_release") is True
            and version.get("generation") == generation and version.get("current") == generation
            and version.get("previous") == previous and version.get("source_sha") == manifest["source_sha"]
            and version.get("ref") == manifest["source_sha"]
            and version.get("running_file_sha256") == expected_hashes["src/xiio.mjs"]
            and version.get("receipt_file_sha256") == expected_hashes["src/xiio.mjs"],
            "INSTALLED_RUNNING_GENERATION_MISMATCH")
    observation = {"generation": generation, "previous": previous, "version": version,
                   "receipt_sha256": digest(receipt_bytes), "launcher_sha256": digest(launcher_bytes),
                   "files": expected_hashes}
    save_json(root / (label + ".observation.json"), observation)
    return observation


def spawn_installed(root, env):
    # The generated launcher is the only chat entry. No source-path override.
    return pexpect.spawn(str(root / "bin" / "xi-io-cli"),
                         ["chat", str(root / "project"), "--model", "qwen2.5:1.5b"],
                         encoding="utf-8", timeout=180, env=env)


def read_saved_session(root, edit_receipt, proposal_attempts):
    project = root / "project"
    file = root / "state" / "chat" / (digest(str(project).encode())[:40] + ".json")
    data = regular_bytes(file)
    session = json.loads(data)
    require(type(proposal_attempts) is int and 1 <= proposal_attempts <= 3, "INVALID_PROPOSAL_BOUND")
    expected_users = [READ_REQUEST] + [
        ("The previous proposal was refused without any file change. " if attempt > 1 else "") + EDIT_REQUEST
        for attempt in range(1, proposal_attempts + 1)]
    require(stat.S_IMODE(file.stat().st_mode) == 0o600
            and session.get("schema") == "xiio.cli.chat-session/v1"
            and session.get("workspace") == str(project) and session.get("model") == "qwen2.5:1.5b"
            and isinstance(session.get("messages"), list)
            and all(isinstance(m, dict) and m.get("role") in ("user", "assistant")
                    and isinstance(m.get("content"), str) for m in session["messages"])
            and len(session["messages"]) == 2 * len(expected_users)
            and [m["role"] for m in session["messages"]] == ["user", "assistant"] * len(expected_users)
            and [m["content"] for m in session["messages"] if m["role"] == "user"] == expected_users
            and session.get("last_turn", {}).get("receipt") == edit_receipt
            and isinstance(session.get("last_turn", {}).get("text"), str)
            and session["last_turn"]["text"].startswith(MARKER)
            and session["messages"][-1]["content"] == session["last_turn"]["text"],
            "SAVED_SESSION_MISMATCH")
    validate_edit_receipt(edit_receipt)
    require(regular_bytes(project / "NOTE.txt") == AFTER, "SAVED_FILE_READBACK_MISMATCH")
    return file, data, session


def resume_installed(root, env, saved, label, timeout=30):
    file, original, session = saved
    child = spawn_installed(root, env)
    with (root / (label + ".transcript.txt")).open("w", encoding="utf-8") as log:
        child.logfile = log
        try:
            child.expect_exact("What would you like to build or work on?", timeout=timeout)
            child.expect_exact(PROMPT, timeout=timeout)
            count = sum(m["role"] == "user" for m in session["messages"])
            require(f"Resumed {count} prior project turn(s)." in child.before, "CHAT_NOT_RESUMED")
            child.sendline("/details")
            require(child.expect_exact([MARKER, APPROVAL], timeout=timeout) == 0,
                    "UNEXPECTED_RESUME_APPROVAL")
            require(child.expect_exact([PROMPT, APPROVAL], timeout=timeout) == 0,
                    "UNEXPECTED_RESUME_APPROVAL")
            details = child.before.replace("\r\n", "\n").replace("\r", "\n")
            receipt, _ = json.JSONDecoder().raw_decode(details.lstrip())
            require(receipt == session["last_turn"]["receipt"]
                    and (MARKER + details).startswith(session["last_turn"]["text"] + "\n"),
                    "RESUMED_RECEIPT_MISMATCH")
            save_json(root / (label + ".receipt.json"), receipt)
            child.sendline("/exit")
            child.expect_exact(pexpect.EOF, timeout=timeout)
            child.close()
            require(child.exitstatus == 0 and child.signalstatus is None, "RESUMED_CLI_EXIT_FAILED")
            require(regular_bytes(file) == original, "RESUME_CHANGED_SESSION")
            require(regular_bytes(root / "project" / "NOTE.txt") == AFTER, "RESUME_CHANGED_FILE")
        finally:
            child.close(force=True)


def run_installed_proof(root, package):
    root, package = Path(root).absolute(), Path(package).absolute()
    require(root.resolve() == root and package.resolve() == package, "PROOF_ROOT_SYMLINK")
    manifest, payload = read_package(package)
    # The external HEX downloader pin is the receiving authority. Computing a
    # fresh digest from supplied package bytes would let those bytes self-certify.
    wrapper = package.parent / "download-install-cli.py"
    require(wrapper.is_file() and not wrapper.is_symlink(), "EXTERNAL_MANIFEST_PIN_UNBOUND")
    pins = re.findall(r'^MANIFEST_SHA="([0-9a-f]{64})"
    require(not root.exists(), "PROOF_ROOT_ALREADY_EXISTS")
    root.mkdir(mode=0o700)
    for name in ["config", "state", "xdg-state", "xdg-config", "xdg-data", "xdg-cache", "tmp", "project"]:
        (root / name).mkdir(mode=0o700)
    (root / "project" / "NOTE.txt").write_bytes(BEFORE)
    (root / "config" / "preserved-choice.txt").write_bytes(b"keep local choices\n")
    env = isolated_environment(root)
    launcher = root / "bin" / "xi-io-cli"
    protected = {root / "config" / "preserved-choice.txt": b"keep local choices\n"}
    outcome = {"state": "FAIL", "completed_stages": [], "installed_launcher": str(launcher),
               "source_sha": manifest["source_sha"], "same_source_generations": True,
               "canonical_cli_adoption": False, "ward_authority_granted": False,
               "bins_version_qualified": False, "consumed_return_qualified": False}

    def preserve():
        for file, before in protected.items():
            require(regular_bytes(file) == before, "LIFECYCLE_CHANGED_PRESERVED_FILE")

    def install(label, previous):
        node = shutil.which("node")
        require(node is not None, "NODE_NOT_AVAILABLE")
        report = run_json([node, str(package / "install.mjs"), "--repo", "Vado42-chris/xi-io-cli",
                           "--ref", manifest["source_sha"], "--packaged-source", str(package),
                           "--expect-packaged-manifest-sha256", manifest_pin,
                           "--prefix", str(root / "prefix"), "--bin-dir", str(root / "bin")],
                          env, root / (label + ".process.json"))
        require(report.get("state") == "PASS" and report.get("schema") == "xiio.cli.install/v1"
                and report.get("previous") == previous and report.get("generation") != previous
                and report.get("launcher") == str(launcher)
                and report.get("launcher_sha256") == digest(regular_bytes(launcher)),
                "INSTALL_RESULT_MISMATCH")
        generation = report["generation"]
        observe_installed(root, manifest, payload, env, label + "-version", generation, previous)
        preserve()
        installed = root / "prefix" / "versions" / generation
        for file in [launcher, installed / "install-receipt.json", *(installed / name for name in payload)]:
            protected[file] = regular_bytes(file)
        outcome["completed_stages"].append(label)
        return generation

    def reopen(label, current, previous, saved):
        observe_installed(root, manifest, payload, env, label + "-version", current, previous)
        resume_installed(root, env, saved, label)
        preserve()
        outcome["completed_stages"].append(label)

    try:
        first = install("install-first", None)
        child = spawn_installed(root, env)
        with (root / "transcript.txt").open("w", encoding="utf-8") as log:
            child.logfile = log
            try:
                result = run_proof(child, root / "project" / "NOTE.txt", root)
            finally:
                child.close(force=True)
        preserve()
        outcome["completed_stages"].append("installed-model-transaction")
        edit_receipt = json.loads(regular_bytes(root / f"edit-{result['proposal_attempts']}.receipt.json"))
        saved = read_saved_session(root, edit_receipt, result["proposal_attempts"])
        protected[saved[0]] = saved[1]
        protected[root / "project" / "NOTE.txt"] = AFTER
        for file in (root / "config").rglob("*"):
            if file.is_file():
                protected[file] = regular_bytes(file)
        reopen("restart-first", first, None, saved)
        second = install("install-second", first)
        reopen("restart-second", second, first, saved)
        for label, before, after in [("rollback", second, first), ("reverse-rollback", first, second)]:
            rollback = run_json([str(launcher), "rollback"], env, root / (label + ".process.json"))
            require(rollback.get("schema") == "xiio.cli.rollback/v1" and rollback.get("state") == "PASS"
                    and rollback.get("from") == before and rollback.get("to") == after,
                    "ROLLBACK_RESULT_MISMATCH")
            reopen(label + "-reopen", after, before, saved)
        outcome.update(state="PASS", first_generation=first, second_generation=second,
                       transaction=result, session_sha256=digest(saved[1]),
                       preserved_files={str(file.relative_to(root)): digest(data)
                                        for file, data in protected.items()})
        return outcome
    except Exception as error:
        outcome["reason"] = str(error)
        raise
    finally:
        save_json(root / "installed-outcome.json", outcome)


def main():
    require("XIIO_RUNTIME" not in os.environ, "SOURCE_RUNTIME_OVERRIDE_REFUSED")
    outcome = run_installed_proof(Path(os.environ["XIIO_PROOF_ROOT"]), Path(__file__).resolve().parent)
    result = outcome["transaction"]
    print("REAL_OLLAMA_READ=PASS")
    print("REAL_OLLAMA_APPROVED_EDIT=PASS")
    print("INDEPENDENT_FILE_READBACK=PASS")
    print("APPROVAL_COUNT=" + str(result["approvals"]))
    print("REJECTED_PROPOSALS=" + str(result["rejected_proposals"]))
    print("FIRST_ATTEMPT_PROPOSAL=" + ("PASS" if result["rejected_proposals"] == 0 else "REFUSED"))
    print("INSTALLED_LAUNCHER_TRANSACTION=PASS")
    print("PERSISTED_CHAT_RESTART=PASS")
    print("SAME_SOURCE_ROLLBACK_AND_REOPEN=PASS")


if __name__ == "__main__":
    main()
,
                      wrapper.read_text(encoding="utf-8"), flags=re.MULTILINE)
    require(len(pins) == 1, "EXTERNAL_MANIFEST_PIN_UNBOUND")
    manifest_pin = pins[0]
    require(digest((package / "packaged-source.json").read_bytes()) == manifest_pin,
            "EXTERNAL_MANIFEST_PIN_MISMATCH")
    # Never reset an existing bench or manufacture a passing post-effect retry.
    require(not root.exists(), "PROOF_ROOT_ALREADY_EXISTS")
    root.mkdir(mode=0o700)
    for name in ["config", "state", "xdg-state", "xdg-config", "xdg-data", "xdg-cache", "tmp", "project"]:
        (root / name).mkdir(mode=0o700)
    (root / "project" / "NOTE.txt").write_bytes(BEFORE)
    (root / "config" / "preserved-choice.txt").write_bytes(b"keep local choices\n")
    env = isolated_environment(root)
    launcher = root / "bin" / "xi-io-cli"
    protected = {root / "config" / "preserved-choice.txt": b"keep local choices\n"}
    outcome = {"state": "FAIL", "completed_stages": [], "installed_launcher": str(launcher),
               "source_sha": manifest["source_sha"], "same_source_generations": True,
               "canonical_cli_adoption": False, "ward_authority_granted": False,
               "bins_version_qualified": False, "consumed_return_qualified": False}

    def preserve():
        for file, before in protected.items():
            require(regular_bytes(file) == before, "LIFECYCLE_CHANGED_PRESERVED_FILE")

    def install(label, previous):
        node = shutil.which("node")
        require(node is not None, "NODE_NOT_AVAILABLE")
        report = run_json([node, str(package / "install.mjs"), "--repo", "Vado42-chris/xi-io-cli",
                           "--ref", manifest["source_sha"], "--packaged-source", str(package),
                           "--prefix", str(root / "prefix"), "--bin-dir", str(root / "bin")],
                          env, root / (label + ".process.json"))
        require(report.get("state") == "PASS" and report.get("schema") == "xiio.cli.install/v1"
                and report.get("previous") == previous and report.get("generation") != previous
                and report.get("launcher") == str(launcher)
                and report.get("launcher_sha256") == digest(regular_bytes(launcher)),
                "INSTALL_RESULT_MISMATCH")
        generation = report["generation"]
        observe_installed(root, manifest, payload, env, label + "-version", generation, previous)
        preserve()
        installed = root / "prefix" / "versions" / generation
        for file in [launcher, installed / "install-receipt.json", *(installed / name for name in payload)]:
            protected[file] = regular_bytes(file)
        outcome["completed_stages"].append(label)
        return generation

    def reopen(label, current, previous, saved):
        observe_installed(root, manifest, payload, env, label + "-version", current, previous)
        resume_installed(root, env, saved, label)
        preserve()
        outcome["completed_stages"].append(label)

    try:
        first = install("install-first", None)
        child = spawn_installed(root, env)
        with (root / "transcript.txt").open("w", encoding="utf-8") as log:
            child.logfile = log
            try:
                result = run_proof(child, root / "project" / "NOTE.txt", root)
            finally:
                child.close(force=True)
        preserve()
        outcome["completed_stages"].append("installed-model-transaction")
        edit_receipt = json.loads(regular_bytes(root / f"edit-{result['proposal_attempts']}.receipt.json"))
        saved = read_saved_session(root, edit_receipt, result["proposal_attempts"])
        protected[saved[0]] = saved[1]
        protected[root / "project" / "NOTE.txt"] = AFTER
        for file in (root / "config").rglob("*"):
            if file.is_file():
                protected[file] = regular_bytes(file)
        reopen("restart-first", first, None, saved)
        second = install("install-second", first)
        reopen("restart-second", second, first, saved)
        for label, before, after in [("rollback", second, first), ("reverse-rollback", first, second)]:
            rollback = run_json([str(launcher), "rollback"], env, root / (label + ".process.json"))
            require(rollback.get("schema") == "xiio.cli.rollback/v1" and rollback.get("state") == "PASS"
                    and rollback.get("from") == before and rollback.get("to") == after,
                    "ROLLBACK_RESULT_MISMATCH")
            reopen(label + "-reopen", after, before, saved)
        outcome.update(state="PASS", first_generation=first, second_generation=second,
                       transaction=result, session_sha256=digest(saved[1]),
                       preserved_files={str(file.relative_to(root)): digest(data)
                                        for file, data in protected.items()})
        return outcome
    except Exception as error:
        outcome["reason"] = str(error)
        raise
    finally:
        save_json(root / "installed-outcome.json", outcome)


def main():
    require("XIIO_RUNTIME" not in os.environ, "SOURCE_RUNTIME_OVERRIDE_REFUSED")
    outcome = run_installed_proof(Path(os.environ["XIIO_PROOF_ROOT"]), Path(__file__).resolve().parent)
    result = outcome["transaction"]
    print("REAL_OLLAMA_READ=PASS")
    print("REAL_OLLAMA_APPROVED_EDIT=PASS")
    print("INDEPENDENT_FILE_READBACK=PASS")
    print("APPROVAL_COUNT=" + str(result["approvals"]))
    print("REJECTED_PROPOSALS=" + str(result["rejected_proposals"]))
    print("FIRST_ATTEMPT_PROPOSAL=" + ("PASS" if result["rejected_proposals"] == 0 else "REFUSED"))
    print("INSTALLED_LAUNCHER_TRANSACTION=PASS")
    print("PERSISTED_CHAT_RESTART=PASS")
    print("SAME_SOURCE_ROLLBACK_AND_REOPEN=PASS")


if __name__ == "__main__":
    main()
