#!/usr/bin/env python3
"""Installed-driver regressions, not evidence of real model acceptance.

The installer and generated version/rollback processes below are real and use
only disposable prefixes. Its unchanged smoke may probe local Ollama discovery.
No model is downloaded or invoked. Inference/session data and resume PTYs are
explicit inert fixtures, used to falsify the qualification driver's joins.
"""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

import pexpect


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("installed_qualification_under_test", HERE / "qualify_real_ollama.py")
DRIVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DRIVER)


def fake_resume(mode, root, session_path, events):
    """A real PTY running inert protocol output, never the installed product."""
    root, session_path, events = Path(root), Path(session_path), Path(events)
    session = json.loads(session_path.read_bytes())
    count = sum(m["role"] == "user" for m in session["messages"])
    print("What would you like to build or work on?", flush=True)
    if mode != "missing_resume":
        print(f"Resumed {count} prior project turn(s).", flush=True)
    print("xi> ", end="", flush=True)
    for raw in sys.stdin:
        command = raw.rstrip("\r\n")
        with events.open("a") as output:
            output.write(json.dumps(command) + "\n")
        if command == "/details":
            if mode == "approval":
                print(DRIVER.APPROVAL, end="", flush=True)
                continue
            text = session["last_turn"]["text"]
            if mode == "wrong_receipt":
                text = text.replace("LOCAL_CAS_COMMITTED", "INERT_WRONG_RESULT")
            if mode == "wrong_narrative":
                text += "\nUnrecorded replacement narrative."
            print(text, flush=True)
            print("xi> ", end="", flush=True)
        elif command == "/exit":
            if mode == "changed_session":
                session_path.write_bytes(session_path.read_bytes() + b" ")
            if mode == "changed_note":
                (root / "project" / "NOTE.txt").write_bytes(b"status: reset\n")
            raise SystemExit(7 if mode == "nonzero_exit" else 0)
        else:
            raise SystemExit("inert resume received an inference or edit command")


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "--resume-fixture":
    fake_resume(*sys.argv[2:])
    raise SystemExit(0)


from test_real_ollama_qualification import edit_receipt  # Shared inert receipt fixture.


def seed_session(root, *, attempts=1):
    """Seed explicitly inert session data for driver tests, never installer data."""
    receipt = edit_receipt()
    text = DRIVER.MARKER + "\n" + json.dumps(receipt, indent=2)
    users = [DRIVER.READ_REQUEST] + [
        ("The previous proposal was refused without any file change. " if n > 1 else "") + DRIVER.EDIT_REQUEST
        for n in range(1, attempts + 1)]
    messages = []
    for user in users:
        messages.extend([{"role": "user", "content": user},
                         {"role": "assistant", "content": "INERT_FIXTURE_PRIOR_REPLY"}])
    messages[-1]["content"] = text
    session = {"schema": "xiio.cli.chat-session/v1", "workspace": str(root / "project"),
               "model": "qwen2.5:1.5b", "messages": messages,
               "last_turn": {"text": text, "receipt": receipt}}
    file = root / "state" / "chat" / (hashlib.sha256(str(root / "project").encode()).hexdigest()[:40] + ".json")
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(session, indent=2) + "\n")
    file.chmod(0o600)
    (root / "project").mkdir(exist_ok=True)
    (root / "project" / "NOTE.txt").write_bytes(DRIVER.AFTER)
    (root / f"edit-{attempts}.receipt.json").write_text(json.dumps(receipt))
    return file, session, receipt


def resume_child(root, mode="good", number=0):
    session_file = next((root / "state" / "chat").glob("*.json"))
    return pexpect.spawn(sys.executable, ["-B", str(Path(__file__).resolve()),
                         "--resume-fixture", mode, str(root), str(session_file),
                         str(root / f"inert-resume-{number}.commands.jsonl")],
                         encoding="utf-8", timeout=2, echo=False)


@contextlib.contextmanager
def replaced(file, data=None, mode=None):
    before, previous_mode = file.read_bytes(), stat.S_IMODE(file.stat().st_mode)
    try:
        if data is not None:
            file.write_bytes(data)
        if mode is not None:
            file.chmod(mode)
        yield
    finally:
        file.write_bytes(before)
        file.chmod(previous_mode)


class InstalledEntryTests(unittest.TestCase):
    def test_source_override_refuses_before_any_process(self):
        # Also runnable alone against the old driver. It fails because the old
        # main accepts XIIO_RUNTIME, not because an installed helper is absent.
        with tempfile.TemporaryDirectory(prefix="xiio-inert-source-override-") as temp:
            with mock.patch.dict(os.environ, {"XIIO_PROOF_ROOT": temp, "XIIO_RUNTIME": str(HERE / "src/xiio.mjs")}), \
                 mock.patch.object(DRIVER.pexpect, "spawn") as spawn, \
                 mock.patch.object(DRIVER, "run_proof", return_value={"approvals": 1, "rejected_proposals": 0}), \
                 contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(DRIVER.ProofFailure, "SOURCE_RUNTIME_OVERRIDE_REFUSED"):
                    DRIVER.main()
                spawn.assert_not_called()

    def test_actual_chat_entry_selects_only_generated_launcher(self):
        root = Path("/disposable/installed-proof")
        env = {"INERT_FIXTURE": "1"}
        with mock.patch.object(DRIVER.pexpect, "spawn") as spawn:
            DRIVER.spawn_installed(root, env)
        args, kwargs = spawn.call_args
        self.assertEqual(args, (str(root / "bin/xi-io-cli"),
                               ["chat", str(root / "project"), "--model", "qwen2.5:1.5b"]))
        self.assertIs(kwargs["env"], env)
        self.assertNotIn("node", args)
        self.assertNotIn("XIIO_RUNTIME", kwargs["env"])

    def test_isolation_preserves_home_and_proxy_and_pins_product_state(self):
        root = Path("/disposable/installed-proof")
        with mock.patch.dict(os.environ, {"HOME": "/inherited/home", "HTTPS_PROXY": "http://inherited.proxy"}):
            env = DRIVER.isolated_environment(root)
        self.assertEqual(env["HOME"], "/inherited/home")
        self.assertEqual(env["HTTPS_PROXY"], "http://inherited.proxy")
        for key in ["XIIO_CONFIG_DIR", "XIIO_STATE_DIR", "XDG_STATE_HOME", "XDG_CONFIG_HOME",
                    "XDG_DATA_HOME", "XDG_CACHE_HOME", "TMPDIR"]:
            self.assertEqual(Path(env[key]).parent, root)


class PhysicalInstallationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="xiio-real-installer-control-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        for name in ["config", "state", "tmp"]:
            (cls.root / name).mkdir()
        cls.env = DRIVER.isolated_environment(cls.root)
        cls.manifest, cls.payload = DRIVER.read_package(HERE)
        manifest_digest = hashlib.sha256((HERE / "packaged-source.json").read_bytes()).hexdigest()
        assert manifest_digest == "c0aa5d43c5af9095cf5e75fe678e171590ed553f5fe45a4e7921629115200041", "QUALIFICATION_MANIFEST_PIN_CHANGED"
        command = [shutil.which("node"), str(HERE / "install.mjs"), "--repo", "Vado42-chris/xi-io-cli",
                   "--ref", cls.manifest["source_sha"], "--packaged-source", str(HERE),
                   "--expect-packaged-manifest-sha256", manifest_digest,
                   "--prefix", str(cls.root / "prefix"), "--bin-dir", str(cls.root / "bin")]
        completed = subprocess.run(command, env=cls.env, capture_output=True, text=True, timeout=180)
        if completed.returncode != 0:
            raise AssertionError("real installer control failed: " + completed.stdout + completed.stderr)
        cls.report = json.loads(completed.stdout)
        cls.generation = cls.report["generation"]
        cls.installed = cls.root / "prefix/versions" / cls.generation

    def observe(self):
        return DRIVER.observe_installed(self.root, self.manifest, self.payload, self.env,
                                        "inert-regression-readback", self.generation, None)

    def test_real_install_and_fresh_generated_version_match_source(self):
        observed = self.observe()
        self.assertEqual(self.report["state"], "PASS")
        self.assertEqual(observed["generation"], self.generation)
        self.assertEqual(observed["files"], {p: DRIVER.digest(b) for p, b in self.payload.items()})
        process = json.loads((self.root / "inert-regression-readback.process.json").read_text())
        self.assertEqual(process["command"], [str(self.root / "bin/xi-io-cli"), "version"])

    def test_changed_current_or_previous_refuses_before_version(self):
        with replaced(self.root / "prefix/current", b"different-generation\n"), \
             mock.patch.object(DRIVER, "run_json") as run:
            with self.assertRaisesRegex(DRIVER.ProofFailure, "INSTALLED_CURRENT_MISMATCH"):
                self.observe()
            run.assert_not_called()
        previous = self.root / "prefix/previous"
        self.assertFalse(previous.exists())
        try:
            previous.write_text(self.generation)
            with self.assertRaisesRegex(DRIVER.ProofFailure, "INSTALLED_PREVIOUS_MISMATCH"):
                self.observe()
        finally:
            previous.unlink(missing_ok=True)

    def test_receipt_identity_and_payload_hash_tampering_refuse(self):
        file = self.installed / "install-receipt.json"
        receipt = json.loads(file.read_bytes())
        for key, value in [("source_sha", "0" * 40), ("ref", "0" * 40), ("repo", "other/repo"),
                           ("generation", "other-generation"), ("prefix", "/other/prefix"), ("files", {})]:
            with self.subTest(key=key), replaced(file, json.dumps({**receipt, key: value}).encode()), \
                 mock.patch.object(DRIVER, "run_json") as run:
                with self.assertRaisesRegex(DRIVER.ProofFailure, "INSTALLED_RECEIPT_MISMATCH"):
                    self.observe()
                run.assert_not_called()

    def test_actual_payload_bytes_and_private_mode_are_checked(self):
        file = self.installed / "src/xiio.mjs"
        with replaced(file, b"// inert changed payload\n"):
            with self.assertRaisesRegex(DRIVER.ProofFailure, "INSTALLED_PAYLOAD_MISMATCH"):
                self.observe()
        with replaced(file, mode=0o644):
            with self.assertRaisesRegex(DRIVER.ProofFailure, "INSTALLED_PAYLOAD_MODE_MISMATCH"):
                self.observe()

    def test_launcher_must_be_executable_and_fresh_version_must_agree(self):
        launcher = self.root / "bin/xi-io-cli"
        with replaced(launcher, mode=0o600):
            with self.assertRaisesRegex(DRIVER.ProofFailure, "INSTALLED_LAUNCHER_NOT_EXECUTABLE"):
                self.observe()
        good = self.observe()["version"]
        for key, value in [("state", "STAGED"), ("active_release", False), ("integrity_verified", False),
                           ("generation", "other"), ("current", "other"), ("source_sha", "0" * 40),
                           ("running_file_sha256", "0" * 64), ("receipt_file_sha256", "0" * 64)]:
            with self.subTest(key=key), mock.patch.object(DRIVER, "run_json", return_value={**good, key: value}):
                with self.assertRaisesRegex(DRIVER.ProofFailure, "INSTALLED_RUNNING_GENERATION_MISMATCH"):
                    self.observe()


class SavedSessionAndResumeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="xiio-inert-session-control-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.file, self.session, self.receipt = seed_session(self.root)

    def read(self):
        return DRIVER.read_saved_session(self.root, self.receipt, 1)

    def test_exact_fixture_history_and_receipt_are_retained(self):
        file, data, session = self.read()
        self.assertEqual(file, self.file)
        self.assertEqual(data, self.file.read_bytes())
        self.assertEqual(session["last_turn"]["receipt"], self.receipt)

    def test_wrong_identity_history_receipt_or_private_mode_refuses(self):
        bad_values = []
        for key, value in [("schema", "other"), ("workspace", "/other/workspace"), ("model", "other-model")]:
            bad_values.append({**self.session, key: value})
        for change in ["request", "roles", "missing_pair", "assistant", "receipt"]:
            value = copy.deepcopy(self.session)
            if change == "request": value["messages"][0]["content"] = "an unrelated request"
            elif change == "roles": value["messages"][0]["role"] = "assistant"
            elif change == "missing_pair": value["messages"] = value["messages"][2:]
            elif change == "assistant": value["messages"][-1]["content"] = "substituted narrative"
            else: value["last_turn"]["receipt"]["state"] = "FAILED"
            bad_values.append(value)
        for value in bad_values:
            with self.subTest(value=value), replaced(self.file, json.dumps(value).encode()):
                with self.assertRaisesRegex(DRIVER.ProofFailure, "SAVED_SESSION_MISMATCH"):
                    self.read()
        with replaced(self.file, mode=0o644):
            with self.assertRaisesRegex(DRIVER.ProofFailure, "SAVED_SESSION_MISMATCH"):
                self.read()

    def test_changed_project_bytes_refuse_saved_session_qualification(self):
        with replaced(self.root / "project/NOTE.txt", DRIVER.BEFORE):
            with self.assertRaisesRegex(DRIVER.ProofFailure, "SAVED_FILE_READBACK_MISMATCH"):
                self.read()

    def test_inert_fresh_process_reopens_exact_details_without_model_request(self):
        saved = self.read()
        with mock.patch.object(DRIVER, "spawn_installed", side_effect=lambda root, env: resume_child(root)):
            DRIVER.resume_installed(self.root, {}, saved, "inert-restart", timeout=2)
        commands = [json.loads(line) for line in (self.root / "inert-resume-0.commands.jsonl").read_text().splitlines()]
        self.assertEqual(commands, ["/details", "/exit"])
        self.assertEqual(self.file.read_bytes(), saved[1])

    def test_inert_restart_refuses_missing_resume_wrong_details_effects_and_bad_exit(self):
        modes = {"missing_resume": "CHAT_NOT_RESUMED", "wrong_receipt": "RESUMED_RECEIPT_MISMATCH",
                 "approval": "UNEXPECTED_RESUME_APPROVAL", "changed_session": "RESUME_CHANGED_SESSION",
                 "changed_note": "RESUME_CHANGED_FILE", "nonzero_exit": "RESUMED_CLI_EXIT_FAILED"}
        for mode, reason in modes.items():
            with self.subTest(mode=mode):
                seed_session(self.root)
                saved = self.read()
                with mock.patch.object(DRIVER, "spawn_installed", side_effect=lambda root, env: resume_child(root, mode)):
                    with self.assertRaisesRegex(DRIVER.ProofFailure, reason):
                        DRIVER.resume_installed(self.root, {}, saved, "inert-" + mode, timeout=2)


class JoinedLifecycleTests(unittest.TestCase):
    def run_case(self, mode="good"):
        temporary = tempfile.TemporaryDirectory(prefix="xiio-inert-lifecycle-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name) / "new-bench"
        commands, proof_calls, spawn_calls = [], [], []
        real_run = DRIVER.run_json

        def run(command, env, evidence):
            commands.append(command)
            if mode == "noop_rollback" and command[-1] == "rollback":
                return {"schema": "xiio.cli.rollback/v1", "state": "PASS",
                        "from": (root / "prefix/current").read_text().strip(),
                        "to": (root / "prefix/previous").read_text().strip()}
            result = real_run(command, env, evidence)
            if mode == "install_changed_sentinel" and "--packaged-source" in command:
                (root / "config/preserved-choice.txt").write_text("INERT_CORRUPTION")
            return result

        def spawn(bench, env):
            spawn_calls.append(bench)
            if len(spawn_calls) == 1:
                return mock.Mock(name="INERT_MODEL_CHILD")
            return resume_child(bench, number=len(spawn_calls))

        def inference(child, note, evidence):
            proof_calls.append(note)
            if mode == "post_effect_failure":
                note.write_bytes(b"status: failed-effect\n")
                raise DRIVER.ProofFailure("INERT_POST_EFFECT_FAILURE")
            seed_session(root)
            if mode == "transaction_changed_sentinel":
                (root / "config/preserved-choice.txt").write_text("INERT_CORRUPTION")
            return {"state": "PASS", "proposal_attempts": 1, "approvals": 1,
                    "rejected_proposals": 0, "fixture": "INERT_NOT_MODEL_ACCEPTANCE"}

        failure = result = None
        with mock.patch.object(DRIVER, "run_json", side_effect=run), \
             mock.patch.object(DRIVER, "spawn_installed", side_effect=spawn), \
             mock.patch.object(DRIVER, "run_proof", side_effect=inference):
            try:
                result = DRIVER.run_installed_proof(root, HERE)
            except Exception as error:
                failure = error
        return root, result, failure, commands, proof_calls, spawn_calls

    def test_real_installs_join_to_inert_transaction_restart_and_actual_rollback(self):
        root, result, failure, commands, proofs, spawns = self.run_case()
        if failure:
            raise failure
        self.assertEqual(result["completed_stages"], ["install-first", "installed-model-transaction", "restart-first",
                         "install-second", "restart-second", "rollback-reopen", "reverse-rollback-reopen"])
        self.assertEqual(result["state"], "PASS")
        self.assertTrue(result["same_source_generations"])
        self.assertFalse(result["canonical_cli_adoption"])
        self.assertEqual(len(proofs), 1)
        self.assertEqual(len(spawns), 5)
        self.assertEqual(sum("--packaged-source" in c for c in commands), 2)
        self.assertEqual(sum(c[-1] == "rollback" for c in commands), 2)
        for command in commands:
            if "--packaged-source" not in command:
                self.assertEqual(command[0], str(root / "bin/xi-io-cli"))
        self.assertEqual((root / "project/NOTE.txt").read_bytes(), DRIVER.AFTER)
        self.assertEqual(result["transaction"]["fixture"], "INERT_NOT_MODEL_ACCEPTANCE")

    def test_existing_bench_is_not_reset_or_retried(self):
        with tempfile.TemporaryDirectory(prefix="xiio-existing-proof-") as temp:
            root = Path(temp)
            (root / "NOTE.txt").write_bytes(b"keep failed observations\n")
            with mock.patch.object(DRIVER, "run_json") as run:
                with self.assertRaisesRegex(DRIVER.ProofFailure, "PROOF_ROOT_ALREADY_EXISTS"):
                    DRIVER.run_installed_proof(root, HERE)
                run.assert_not_called()
            self.assertEqual((root / "NOTE.txt").read_bytes(), b"keep failed observations\n")

    def test_failure_after_effect_preserves_bytes_and_never_retries(self):
        root, result, failure, commands, proofs, spawns = self.run_case("post_effect_failure")
        self.assertIsNone(result)
        self.assertRegex(str(failure), "INERT_POST_EFFECT_FAILURE")
        self.assertEqual(len(proofs), 1)
        self.assertEqual(len(spawns), 1)
        self.assertEqual(sum("--packaged-source" in c for c in commands), 1)
        self.assertEqual((root / "project/NOTE.txt").read_bytes(), b"status: failed-effect\n")
        self.assertEqual(json.loads((root / "installed-outcome.json").read_bytes())["state"], "FAIL")

    def test_claimed_rollback_without_pointer_transition_cannot_pass(self):
        _, result, failure, _, proofs, _ = self.run_case("noop_rollback")
        self.assertIsNone(result)
        self.assertIsInstance(failure, DRIVER.ProofFailure)
        self.assertRegex(str(failure), "INSTALLED_CURRENT_MISMATCH")
        self.assertEqual(len(proofs), 1)

    def test_first_install_and_transaction_cannot_rebaseline_changed_config(self):
        for mode, expected_proofs in [("install_changed_sentinel", 0), ("transaction_changed_sentinel", 1)]:
            with self.subTest(mode=mode):
                _, result, failure, commands, proofs, _ = self.run_case(mode)
                self.assertIsNone(result)
                self.assertIsInstance(failure, DRIVER.ProofFailure)
                self.assertRegex(str(failure), "LIFECYCLE_CHANGED_PRESERVED_FILE")
                self.assertEqual(len(proofs), expected_proofs)
                self.assertEqual(sum("--packaged-source" in c for c in commands), 1)


REAL_WORKFLOW = HERE.parents[2] / ".github/workflows/cli-real-ollama.yml"


class WorkflowOllamaProcessTests(unittest.TestCase):
    @staticmethod
    def startup_body():
        workflow = REAL_WORKFLOW.read_text()
        step = workflow.split("      - name: Start Ollama and pull bounded local model\n", 1)[1].split("\n      - name: ", 1)[0]
        body = step.split("        run: |\n", 1)[1]
        lines = body.rstrip().splitlines()
        if any(line.strip() and not line.startswith("          ") for line in lines):
            raise AssertionError("unexpected startup shell indentation")
        return "\n".join(line[10:] for line in lines)

    def run_startup(self, mode="healthy", runner="github-hosted"):
        # Real Bash/nohup, but every service, model and HTTP command resolves to
        # an inert stub. Even sudo is a Python logger, never a privilege change.
        with tempfile.TemporaryDirectory(prefix="xiio-inert-server-start-") as temp:
            root = Path(temp)
            bins = root / "bin"
            bins.mkdir()
            stub = "#!" + sys.executable + "\n" + '''import json, os, pathlib, sys, time
name = pathlib.Path(sys.argv[0]).name
with open(os.environ["INERT_EVENTS"], "a") as output:
    output.write(json.dumps({"command": name, "args": sys.argv[1:], "pid": os.getpid()}) + "\\n")
if name == "sudo":
    raise SystemExit(0 if sys.argv[1:] == ["systemctl", "stop", "ollama.service"] else 8)
if name == "curl":
    time.sleep(0.15)
    raise SystemExit(0)  # An unrelated listener can always look healthy.
if name == "ollama" and sys.argv[1:] == ["serve"]:
    pathlib.Path(os.environ["INERT_SERVER_PID"]).write_text(str(os.getpid()))
    time.sleep(0.02 if os.environ["INERT_MODE"] == "dead" else 10)
    raise SystemExit(7)
if name == "ollama" and sys.argv[1:] in (["pull", "qwen2.5:1.5b"], ["list"]):
    raise SystemExit(0)
raise SystemExit(9)
'''
            for name in ["sudo", "curl", "ollama"]:
                file = bins / name
                file.write_text(stub)
                file.chmod(0o700)
            env = {**os.environ, "PATH": str(bins) + os.pathsep + os.environ["PATH"],
                   "RUNNER_TEMP": str(root), "RUNNER_ENVIRONMENT": runner,
                   "INERT_EVENTS": str(root / "events.jsonl"), "INERT_MODE": mode,
                   "INERT_SERVER_PID": str(root / "owned-server.pid")}
            try:
                result = subprocess.run([shutil.which("bash"), "-c", self.startup_body()],
                                        cwd=root, env=env, text=True, capture_output=True, timeout=5)
                events_file = root / "events.jsonl"
                events = [json.loads(line) for line in events_file.read_text().splitlines()] if events_file.exists() else []
                return result, events
            finally:
                # Kill only this fixture's confirmed Python stub PID. Never use
                # a port, process-name match, systemctl, broad group or shell.
                pid_file = root / "owned-server.pid"
                if pid_file.exists():
                    pid = int(pid_file.read_text())
                    try:
                        command = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
                        if str(bins / "ollama").encode() in command:
                            os.kill(pid, signal.SIGTERM)
                            deadline = time.monotonic() + 1
                            while time.monotonic() < deadline:
                                try:
                                    if not Path(f"/proc/{pid}/cmdline").read_bytes():
                                        break
                                except FileNotFoundError:
                                    break
                                time.sleep(0.01)
                    except (FileNotFoundError, ProcessLookupError):
                        pass

    def test_actual_startup_body_accepts_live_owned_server(self):
        result, events = self.run_startup()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn({"command": "sudo", "args": ["systemctl", "stop", "ollama.service"]},
                      [{"command": e["command"], "args": e["args"]} for e in events])
        self.assertEqual(sum(e["command"] == "ollama" and e["args"] == ["serve"] for e in events), 1)
        self.assertTrue(any(e["command"] == "ollama" and e["args"] == ["list"] for e in events))

    def test_dead_owned_server_refuses_even_when_unrelated_health_is_ready(self):
        result, events = self.run_startup("dead")
        self.assertNotEqual(result.returncode, 0, "startup accepted a dead proof server using unrelated readiness")
        self.assertFalse(any(e["command"] == "ollama" and e["args"][0] == "pull" for e in events))

    def test_nonhosted_runner_refuses_before_service_or_process_effects(self):
        result, events = self.run_startup(runner="self-hosted")
        self.assertNotEqual(result.returncode, 0, "startup modified a non-disposable runner")
        self.assertEqual(events, [])

    def test_artifact_retains_physical_install_and_owned_server_evidence(self):
        artifact = REAL_WORKFLOW.read_text().split("      - name: Preserve real-inference evidence\n", 1)[1]
        for path in ["xiio-real-ollama/prefix/versions/**", "xiio-real-ollama/bin/xi-io-cli",
                     "xiio-real-ollama/config/**", "xiio-real-ollama/project/NOTE.txt", "ollama.pid"]:
            with self.subTest(path=path):
                self.assertIn("${{ runner.temp }}/" + path, artifact)


if __name__ == "__main__":
    unittest.main(verbosity=2)
