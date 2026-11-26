#!/usr/bin/env python3
"""Deterministic consumer controls, never an Ollama/model qualification.

The PTY child below is an inert Python CLI with the accepted CLI's presentation
and receipt protocol. It writes only the test's disposable NOTE.txt and input
log. pexpect is required, not silently skipped, so delivery qualification cannot
pass without exercising its terminal boundary.
"""
import copy
import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import time
import unittest


HERE = pathlib.Path(__file__).resolve().parent
OLD = b"status: old\n"
NEW = b"status: new\n"
OLD_SHA = hashlib.sha256(OLD).hexdigest()
NEW_SHA = hashlib.sha256(NEW).hexdigest()
MARKER = "Actual execution receipt (CLI-observed, not model claims):"
FOOTER = "/details shows the full execution receipt and model reply."
APPROVAL = "Approve this exact action? [y/N]: "
NOTE_NAME = "NOTE.txt"


def frame(lines):
    border = "+" + "-" * 78 + "+"
    return "\n".join([border, "| REVIEW PROPOSED ACTION"] +
                     ["| " + line for line in lines] +
                     ["| Nothing changes until you approve.", border])


GOOD_LINES = [
    "Proposed change to NOTE.txt (line 1):",
    "- status: old",
    "+ status: new",
    "Everything else in the file stays exactly as it is.",
]
GOOD_PREVIEW = frame(GOOD_LINES)


def receipt(results, *, state="TOOL_RESULTS_RECORDED", first_red=None):
    return {
        "schema": "xiio.cli.execution-return/v1",
        "source": "provider",
        "state": state,
        "first_red": first_red,
        "provider_error": None,
        "request_fulfillment": "NOT_EVALUATED",
        "tool_results": results,
    }


def read_receipt():
    return receipt([{
        "name": "read_workspace_file",
        "arguments": {"path": NOTE_NAME},
        "state": "SUCCEEDED",
        "reason": None,
        "result": {
            "path": NOTE_NAME,
            "content": OLD.decode(),
            "sha256": OLD_SHA,
            "byte_length": len(OLD),
            "full_content_returned": True,
            "bins_version_qualified": False,
        },
    }])


def edit_receipt():
    return receipt([{
        "name": "edit_workspace_file",
        "arguments": {
            "path": NOTE_NAME,
            "old_text": "status: old",
            "new_text": "status: new",
            "expected_sha256": OLD_SHA,
        },
        "state": "SUCCEEDED",
        "reason": None,
        "result": {
            "path": NOTE_NAME,
            "line": 1,
            "state": "LOCAL_CAS_COMMITTED",
            "guard": "SAME_HOST_COOPERATIVE_FILE_LOCK",
            "sha256_before": OLD_SHA,
            "sha256_after": NEW_SHA,
            "bytes_before": len(OLD),
            "bytes_after": len(NEW),
            "readback_matches": True,
            "bytes_outside_change_preserved": True,
            "bins_version_qualified": False,
            "ward_authority_granted": False,
            "remote_execution_qualified": False,
        },
    }])


def refusal_receipt(name="edit_workspace_file", arguments=None):
    value = receipt([{
        "name": name,
        "arguments": arguments or {
            "path": NOTE_NAME, "old_text": "status: old", "new_text": "status: changed",
        },
        "state": "FAILED",
        "reason": "HUMAN_APPROVAL_REQUIRED",
        "result": {"state": "FAIL", "reason": "HUMAN_APPROVAL_REQUIRED"},
    }], state="FAILED", first_red="HUMAN_APPROVAL_REQUIRED")
    value["provider_error"] = "HUMAN_APPROVAL_REQUIRED"
    return value


def _fake_cli(mode, note, events):
    """A bounded inert child process, invoked only by PTY tests below."""
    note = pathlib.Path(note)
    events = pathlib.Path(events)

    def log(kind, **details):
        with events.open("a", encoding="utf-8") as output:
            output.write(json.dumps({"kind": kind, **details}) + "\n")

    def emit(text, *, end="\n"):
        print(text, end=end, flush=True)

    def prompt():
        emit("YOU · xi> ", end="")

    def ask():
        raw = sys.stdin.readline()
        if not raw:
            raise SystemExit(0)
        line = raw.rstrip("\r\n")
        log("input", line=line)
        return line

    def finish():
        emit(FOOTER)
        prompt()

    if mode == "eof_before_banner":
        return
    emit("\nIbal · xi-io CLI\nProject: " + str(note.parent) +
         "\nLocal model: INERT_PTY_FIXTURE\nWhat would you like to build or work on?\n"
         "/menu offers next-step options; /help shows commands. Changes still need your approval. "
         "/queue shows waiting tasks; /cancel all cancels and clears them.\n"
         "Project chat resumes locally on this computer. /clear removes its saved history.")
    prompt()
    last = None
    read_done = False
    proposals = 0
    while True:
        line = ask()
        if line == "/exit":
            emit("See you next time.")
            if mode == "nonzero_exit":
                raise SystemExit(7)
            return
        if line == "/details":
            if mode == "missing_receipt" and proposals:
                emit("The edit is complete. Everything worked.")
            elif mode == "malformed_receipt" and proposals:
                emit(MARKER + "\n{not valid json}")
            elif mode == "eof_during_details" and proposals:
                return
            else:
                emit(MARKER)
                emit(json.dumps(last, indent=2))
                emit("Model reply (unverified narrative; not an execution receipt):\nDone.")
            prompt()
            continue
        if not read_done:
            log("read_request", line=line)
            if mode == "eof_during_read":
                return
            if mode == "timeout_during_read":
                time.sleep(5)
                return
            last = read_receipt()
            if mode == "bad_read_receipt":
                last["tool_results"][0]["result"]["sha256"] = "0" * 64
            if line.startswith("/"):
                last["source"] = "direct_read"
            read_done = True
            emit("Read NOTE.txt (12 bytes), file content returned.")
            finish()
            continue

        proposals += 1
        log("proposal_request", number=proposals, line=line)
        if mode == "eof_before_proposal":
            return
        if mode == "timeout_before_proposal":
            time.sleep(5)
            return
        if mode == "prose_only":
            last = receipt([], state="NO_TOOL_EXECUTION")
            emit("I have completed the requested edit successfully.")
            finish()
            continue

        preview = GOOD_PREVIEW
        rejected = None
        wrong = mode == "always_bad" or (mode in {
            "bad_then_good", "wrong_path", "create_file", "command", "malformed_preview",
            "extra_diff", "two_frames", "refusal_changed_note", "bad_refusal_receipt",
        } and proposals == 1)
        if wrong:
            bad_lines = list(GOOD_LINES)
            # Captured model failure: replacing only "old" with "status: new"
            # would duplicate the status prefix if blindly approved.
            bad_lines[1] = "- old"
            preview = frame(bad_lines)
            rejected = refusal_receipt(arguments={
                "path": NOTE_NAME, "old_text": "old", "new_text": "status: new",
            })
            if mode == "wrong_path":
                bad_lines[0] = "Proposed change to OTHER.txt (line 1):"
                preview = frame(bad_lines)
                rejected["tool_results"][0]["arguments"]["path"] = "OTHER.txt"
            elif mode == "create_file":
                preview = frame(["Proposed new file NOTE.txt (12 bytes):", "+ status: new"])
                rejected = refusal_receipt(arguments={"path": NOTE_NAME, "content": NEW.decode()})
            elif mode == "command":
                preview = frame([
                    "Proposed command (sandboxed: project folder writable, no network, rest of the computer hidden or read-only, 30s limit):",
                    "  printf status: new", "in " + str(note.parent),
                ])
                rejected = refusal_receipt("run_workspace_command", {"command": "printf status: new"})
            elif mode == "malformed_preview":
                preview = "Proposed change to NOTE.txt (line 1):\n- status: old\n+ status: new"
            elif mode == "extra_diff":
                preview = frame(GOOD_LINES[:-1] + ["+ unauthorized extra line", GOOD_LINES[-1]])
            elif mode == "two_frames":
                preview = GOOD_PREVIEW + "\n" + GOOD_PREVIEW
        emit(preview)
        emit(APPROVAL, end="")
        answer = ask()
        log("approval", number=proposals, answer=answer)
        if answer.lower() in ("y", "yes"):
            if mode == "failure_after_yes":
                last = refusal_receipt()
                last["first_red"] = "FILE_CHANGED_SINCE_APPROVAL"
                last["tool_results"][0]["reason"] = "FILE_CHANGED_SINCE_APPROVAL"
                last["tool_results"][0]["result"]["reason"] = "FILE_CHANGED_SINCE_APPROVAL"
            else:
                data = b"status: new" if mode == "newline_ambiguity" else NEW
                if wrong:
                    # Reflect the wrong replacement's actual effect, not the
                    # user's intended final bytes, if a driver regresses to yes.
                    data = b"status: status: new\n"
                note.write_bytes(data)
                log("effect", bytes=data.decode())
                last = edit_receipt()
                if mode == "newline_ambiguity":
                    fact = last["tool_results"][0]
                    fact["arguments"]["old_text"] = "status: old\n"
                    fact["result"]["sha256_after"] = hashlib.sha256(data).hexdigest()
                    fact["result"]["bytes_after"] = len(data)
                elif mode == "false_edit_receipt":
                    last["tool_results"][0]["result"]["readback_matches"] = False
                elif mode == "extra_successful_edit":
                    last["tool_results"].append(copy.deepcopy(last["tool_results"][0]))
            if mode == "second_approval":
                emit(GOOD_PREVIEW)
                emit(APPROVAL, end="")
                second = ask()
                log("unexpected_approval", answer=second)
                if second.lower() in ("y", "yes"):
                    log("unexpected_effect")
            if mode == "eof_after_yes":
                return
            if mode == "timeout_after_yes":
                time.sleep(5)
                return
        else:
            last = rejected or refusal_receipt()
            if mode == "refusal_changed_note":
                note.write_bytes(b"status: unapproved\n")
                log("unapproved_effect")
            if mode == "bad_refusal_receipt":
                last = edit_receipt()
        finish()


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "--fake-cli":
    _fake_cli(*sys.argv[2:])
    raise SystemExit(0)


try:
    import pexpect
except ImportError as error:
    raise RuntimeError("PEXPECT_REQUIRED_FOR_TERMINAL_REGRESSION") from error

SPEC = importlib.util.spec_from_file_location("real_ollama_qualification_under_test", HERE / "qualify_real_ollama.py")
DRIVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DRIVER)


class ReceiptAndPreviewTests(unittest.TestCase):
    def assert_typed_failure(self, call, *args):
        with self.assertRaises(DRIVER.ProofFailure) as raised:
            call(*args)
        self.assertRegex(str(raised.exception), r"^[A-Z][A-Z0-9_]*(?::|$)")

    def test_only_exact_framed_preview_qualifies(self):
        self.assertIs(DRIVER.qualifies_proposal(GOOD_PREVIEW), True)
        self.assertIs(DRIVER.qualifies_proposal(GOOD_PREVIEW.replace("\n", "\r\n")), True)
        self.assertIs(DRIVER.qualifies_proposal("\x1b[32m" + GOOD_PREVIEW + "\x1b[0m"), True)
        self.assertIs(DRIVER.qualifies_proposal("YOU · request echo and prompt redraw\n" + GOOD_PREVIEW), True)

    def test_wrong_path_create_command_malformed_and_extra_diff_do_not_qualify(self):
        invalid = [
            "\n".join(GOOD_LINES),
            GOOD_PREVIEW.replace("NOTE.txt", "OTHER.txt"),
            GOOD_PREVIEW.replace("NOTE.txt", "../NOTE.txt"),
            GOOD_PREVIEW.replace("(line 1)", "(line 2)"),
            GOOD_PREVIEW.replace("- status: old", "- status: NEW"),
            GOOD_PREVIEW.replace("+ status: new", "+ status: unexpected"),
            GOOD_PREVIEW.replace("+ status: new", "+ status: new\n| + extra"),
            GOOD_PREVIEW.replace("| REVIEW PROPOSED ACTION\n", ""),
            GOOD_PREVIEW.replace("| Nothing changes until you approve.\n", ""),
            GOOD_PREVIEW + "\n" + GOOD_PREVIEW,
            GOOD_PREVIEW + "\nAlso run a command.",
            frame(["Proposed command:", "  echo done"]) + "\n" + GOOD_PREVIEW,
            frame(["Proposed new file NOTE.txt (12 bytes):", "+ status: new"]),
            frame(["Proposed command:", "  echo done"]),
            "", "Everything is ready. Approve the change.",
        ]
        for preview in invalid:
            with self.subTest(preview=preview):
                self.assertIs(DRIVER.qualifies_proposal(preview), False)

    def test_current_read_edit_and_refusal_receipts_are_accepted(self):
        for validate, value in [
            (DRIVER.validate_read_receipt, read_receipt()),
            (DRIVER.validate_edit_receipt, edit_receipt()),
            (DRIVER.validate_refusal_receipt, refusal_receipt()),
        ]:
            with self.subTest(validator=validate.__name__):
                self.assertIsNone(validate(value))

    def test_read_receipt_requires_real_provider_exact_bytes_and_full_read(self):
        for key, value in [
            ("schema", "not-a-receipt"), ("source", "direct_read"),
            ("state", "FAILED"), ("tool_results", []),
        ]:
            bad = read_receipt(); bad[key] = value
            with self.subTest(key=key):
                self.assert_typed_failure(DRIVER.validate_read_receipt, bad)
        for key, values in {
            "path": ["OTHER.txt", None], "content": ["status: new\n", None],
            "sha256": ["0" * 64, None], "byte_length": [0, "12", 12.0, True, None],
            "full_content_returned": [False, "true", 1, None],
            "bins_version_qualified": [True, "false", 0, None],
        }.items():
            for value in values:
                bad = read_receipt(); bad["tool_results"][0]["result"][key] = value
                with self.subTest(key=key, value=value):
                    self.assert_typed_failure(DRIVER.validate_read_receipt, bad)

    def test_edit_receipt_requires_exact_raw_tool_arguments(self):
        for key, values in {
            "path": ["OTHER.txt", "../NOTE.txt", None],
            "old_text": ["status: old\n", "status: old\r\n", "old", None],
            "new_text": ["status: new\n", "status: new\nextra", "new", None],
        }.items():
            for value in values:
                bad = edit_receipt(); bad["tool_results"][0]["arguments"][key] = value
                with self.subTest(key=key, value=value):
                    self.assert_typed_failure(DRIVER.validate_edit_receipt, bad)

    def test_edit_receipt_requires_exact_cas_hash_and_boolean_observations(self):
        mutations = {
            "path": ["OTHER.txt"], "state": ["PASS", "FAIL"],
            "guard": ["NONE", None], "sha256_before": ["0" * 64, None],
            "sha256_after": ["0" * 64, None], "bytes_before": [0, "12", True],
            "bytes_after": [0, "12", True],
            "readback_matches": [False, "true", 1, None],
            "bytes_outside_change_preserved": [False, "true", 1, None],
            "bins_version_qualified": [True, "false", 0, 1, None],
            "ward_authority_granted": [True, "false", 0, 1, None],
            "remote_execution_qualified": [True, "false", 0, 1, None],
            "created": [True, 1, "true"],
        }
        for key, values in mutations.items():
            for value in values:
                bad = edit_receipt(); bad["tool_results"][0]["result"][key] = value
                with self.subTest(key=key, value=value):
                    self.assert_typed_failure(DRIVER.validate_edit_receipt, bad)

    def test_missing_receipt_fields_raise_typed_failure(self):
        for factory, validate in [
            (read_receipt, DRIVER.validate_read_receipt),
            (edit_receipt, DRIVER.validate_edit_receipt),
            (refusal_receipt, DRIVER.validate_refusal_receipt),
        ]:
            for value in [None, [], {}, "Done", {"state": "PASS"}]:
                with self.subTest(validator=validate.__name__, value=value):
                    self.assert_typed_failure(validate, value)
            for key in ["name", "arguments", "state", "result"]:
                bad = factory(); del bad["tool_results"][0][key]
                with self.subTest(validator=validate.__name__, missing=key):
                    self.assert_typed_failure(validate, bad)

    def test_additional_successful_edit_or_command_does_not_qualify(self):
        for extra in [
            edit_receipt()["tool_results"][0],
            {"name": "run_workspace_command", "arguments": {"command": "echo done"},
             "state": "SUCCEEDED", "reason": None, "result": {"status": 0}},
        ]:
            bad = edit_receipt(); bad["tool_results"].append(copy.deepcopy(extra))
            with self.subTest(extra=extra["name"]):
                self.assert_typed_failure(DRIVER.validate_edit_receipt, bad)

    def test_refusal_cannot_be_success_missing_or_unrelated_failure(self):
        for value in [edit_receipt(), receipt([]), receipt([], state="FAILED")]:
            self.assert_typed_failure(DRIVER.validate_refusal_receipt, value)
        for key, value in [("state", "SUCCEEDED"), ("reason", "SOMETHING_ELSE")]:
            bad = refusal_receipt(); bad["tool_results"][0][key] = value
            self.assert_typed_failure(DRIVER.validate_refusal_receipt, bad)
        bad = refusal_receipt(); bad["tool_results"].append(edit_receipt()["tool_results"][0])
        self.assert_typed_failure(DRIVER.validate_refusal_receipt, bad)

    def test_unrelated_refusals_do_not_authorize_a_correction(self):
        unrelated = [
            refusal_receipt("run_workspace_command", {"command": "echo done"}),
            refusal_receipt(arguments={"path": "OTHER.txt", "old_text": "old", "new_text": "new"}),
            refusal_receipt(arguments={"path": NOTE_NAME, "content": NEW.decode()}),
        ]
        for value in unrelated:
            self.assert_typed_failure(DRIVER.validate_refusal_receipt, value)

    def test_real_workflow_uses_driver_and_qualifies_terminal_dependency(self):
        repo = HERE.parents[2]
        workflow = (repo / ".github/workflows/cli-real-ollama.yml").read_text()
        payload = (repo / ".github/workflows/cli-payload-current.yml").read_text()
        driver_path = "native/hex/cli-source/qualify_real_ollama.py"
        test_path = "native/hex/cli-source/test_real_ollama_qualification.py"
        self.assertIn("python3-pexpect", workflow)
        self.assertIn("python3 -B " + test_path, workflow)
        self.assertIn("python3 -B " + driver_path, workflow)
        self.assertLess(workflow.index("python3-pexpect"), workflow.index("python3 -B " + test_path))
        self.assertLess(workflow.index("python3 -B " + test_path), workflow.index("python3 -B " + driver_path))
        self.assertIn('XIIO_PROOF_ROOT="$work" python3 -B ' + driver_path, workflow)
        self.assertNotIn("XIIO_RUNTIME=", workflow, "source invocation is not installed qualification")
        self.assertNotIn("child.sendline", workflow, "workflow must not retain a blanket yes path")
        self.assertIn("python3-pexpect", payload)
        self.assertLess(payload.index("python3-pexpect"), payload.index('python3 -B "$test_file"'))


class TerminalProofTests(unittest.TestCase):
    def run_case(self, mode, *, expect_pass=False, max_proposals=3):
        with tempfile.TemporaryDirectory(prefix="xiio-inert-ollama-driver-") as temporary:
            root = pathlib.Path(temporary)
            note = root / NOTE_NAME
            note.write_bytes(OLD)
            events = root / "child-inputs.jsonl"
            evidence = root / "evidence"
            evidence.mkdir()
            child = pexpect.spawn(sys.executable, ["-B", str(pathlib.Path(__file__).resolve()),
                                  "--fake-cli", mode, str(note), str(events)],
                                  encoding="utf-8", timeout=1, echo=False)
            child.delaybeforesend = 0
            result = failure = None
            try:
                result = DRIVER.run_proof(child, note, evidence,
                                          edit_timeout=0.2 if "timeout_" in mode else 1,
                                          max_proposals=max_proposals)
            except Exception as error:
                failure = error
            finally:
                if failure is not None and not child.closed:
                    # Let the inert child record a final explicit no before it
                    # is closed. This is a bounded EOF wait, not an edit retry.
                    try:
                        child.expect_exact(pexpect.EOF, timeout=0.1)
                    except (pexpect.EOF, pexpect.TIMEOUT):
                        pass
                child.close(force=True)
            history = [json.loads(line) for line in events.read_text().splitlines()] if events.exists() else []
            if expect_pass:
                if failure:
                    raise failure
                self.assertEqual(result["state"], "PASS")
                self.assertEqual(result["approvals"], 1)
                self.assertEqual(result["sha256_after"], NEW_SHA)
                self.assertEqual(note.read_bytes(), NEW)
                self.assertTrue((evidence / "read.receipt.json").is_file())
                self.assertTrue((evidence / "outcome.json").is_file())
            else:
                self.assertIsInstance(failure, DRIVER.ProofFailure,
                                      "unqualified run returned " + repr(result) + "; failure=" + repr(failure))
                self.assertRegex(str(failure), r"^[A-Z][A-Z0-9_]*(?::|$)")
            return result, history, note.read_bytes(), failure

    @staticmethod
    def approvals(history):
        return [row["answer"] for row in history if row["kind"] in ("approval", "unexpected_approval")]

    def test_good_proposal_gets_exactly_one_yes_after_observed_read(self):
        result, history, _, _ = self.run_case("good", expect_pass=True)
        self.assertEqual(self.approvals(history), ["yes"])
        self.assertEqual(result["rejected_proposals"], 0)
        self.assertEqual(result["proposal_attempts"], 1)
        self.assertEqual(len([row for row in history if row["kind"] == "effect"]), 1)
        read = next(row for row in history if row["kind"] == "read_request")
        self.assertFalse(read["line"].startswith("/"), "a direct /read is not an Ollama tool read")

    def test_wrong_proposal_is_denied_then_corrected_in_same_conversation(self):
        result, history, _, _ = self.run_case("bad_then_good", expect_pass=True)
        self.assertEqual(self.approvals(history), ["no", "yes"])
        self.assertEqual(result["rejected_proposals"], 1)
        self.assertEqual(result["proposal_attempts"], 2)
        self.assertEqual(len([row for row in history if row["kind"] == "read_request"]), 1)
        self.assertEqual(len([row for row in history if row["kind"] == "effect"]), 1)

    def test_repeated_wrong_proposals_stop_at_bound_without_effect(self):
        _, history, data, _ = self.run_case("always_bad")
        self.assertEqual(self.approvals(history), ["no", "no", "no"])
        self.assertEqual(len([row for row in history if row["kind"] == "proposal_request"]), 3)
        self.assertEqual(data, OLD)

    def test_lower_proposal_bound_is_respected(self):
        _, history, data, _ = self.run_case("always_bad", max_proposals=1)
        self.assertEqual(self.approvals(history), ["no"])
        self.assertEqual(len([row for row in history if row["kind"] == "proposal_request"]), 1)
        self.assertEqual(data, OLD)

    def test_out_of_range_bound_never_requests_work(self):
        for bound in [0, 4]:
            with self.subTest(bound=bound):
                _, history, data, _ = self.run_case("good", max_proposals=bound)
                self.assertEqual(self.approvals(history), [])
                self.assertFalse(any(row["kind"] == "proposal_request" for row in history))
                self.assertEqual(data, OLD)

    def test_wrong_path_create_command_malformed_extra_diff_and_two_frames_abort(self):
        for mode in ["wrong_path", "create_file", "command", "malformed_preview", "extra_diff", "two_frames"]:
            with self.subTest(mode=mode):
                _, history, data, _ = self.run_case(mode)
                self.assertEqual(self.approvals(history), ["no"])
                self.assertEqual(data, OLD)
                self.assertEqual(len([row for row in history if row["kind"] == "proposal_request"]), 1)

    def test_second_approval_is_denied_never_approved(self):
        _, history, _, _ = self.run_case("second_approval")
        self.assertEqual(self.approvals(history), ["yes", "no"])
        self.assertFalse(any(row["kind"] == "unexpected_effect" for row in history))

    def test_failure_after_yes_never_retries_or_approves_again(self):
        for mode in ["failure_after_yes", "false_edit_receipt", "extra_successful_edit",
                     "eof_after_yes", "timeout_after_yes", "missing_receipt",
                     "malformed_receipt", "eof_during_details"]:
            with self.subTest(mode=mode):
                _, history, _, _ = self.run_case(mode)
                self.assertEqual(self.approvals(history), ["yes"])
                self.assertEqual(len([row for row in history if row["kind"] == "proposal_request"]), 1)

    def test_correct_looking_newline_ambiguity_never_gets_pass(self):
        _, history, data, _ = self.run_case("newline_ambiguity")
        self.assertEqual(self.approvals(history), ["yes"])
        self.assertEqual(data, b"status: new")
        self.assertNotEqual(data, NEW)

    def test_nonzero_exit_after_successful_edit_is_not_pass(self):
        _, history, data, failure = self.run_case("nonzero_exit")
        self.assertEqual(str(failure), "CLI_EXIT_FAILED")
        self.assertEqual(self.approvals(history), ["yes"])
        self.assertEqual(data, NEW)
        self.assertEqual(len([row for row in history if row["kind"] == "effect"]), 1)

    def test_refusal_requires_unchanged_note_and_actual_failed_receipt(self):
        for mode in ["refusal_changed_note", "bad_refusal_receipt"]:
            with self.subTest(mode=mode):
                _, history, _, _ = self.run_case(mode)
                self.assertEqual(self.approvals(history), ["no"])
                self.assertEqual(len([row for row in history if row["kind"] == "proposal_request"]), 1)

    def test_completion_prose_without_edit_proposal_is_not_pass(self):
        _, history, data, _ = self.run_case("prose_only")
        self.assertEqual(self.approvals(history), [])
        self.assertEqual(data, OLD)

    def test_premature_eof_timeout_or_bad_read_receipt_never_approves(self):
        for mode in ["eof_before_banner", "eof_during_read", "timeout_during_read",
                     "eof_before_proposal", "timeout_before_proposal", "bad_read_receipt"]:
            with self.subTest(mode=mode):
                _, history, data, _ = self.run_case(mode)
                self.assertEqual(self.approvals(history), [])
                self.assertEqual(data, OLD)


if __name__ == "__main__":
    unittest.main(verbosity=2)
