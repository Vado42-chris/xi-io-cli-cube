#!/usr/bin/env python3
"""Hostile controls for installed Ollama proof-custody verification."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest

from verify_installed_evidence_custody import CustodyError, verify


FIRST = "a" * 12 + "-20261117T120000Z-first"
SECOND = "a" * 12 + "-20261117T120100Z-second"
SOURCE = "a" * 40
PAYLOAD = b"export const qualified = true;\n"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write(path: Path, data: bytes | str, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        data = data.encode()
    path.write_bytes(data)
    path.chmod(mode)


def seed(root: Path) -> None:
    for name in ["bin", "prefix/versions", "state/chat", "config", "project"]:
        (root / name).mkdir(parents=True, exist_ok=True)
    write(root / "bin/xi-io-cli", "#!/bin/sh\nexit 0\n", 0o755)
    write(root / "prefix/current", SECOND + "\n", 0o600)
    write(root / "prefix/previous", FIRST + "\n", 0o600)
    for generation in [FIRST, SECOND]:
        generation_root = root / "prefix/versions" / generation
        payload = generation_root / "src/xiio.mjs"
        write(payload, PAYLOAD, 0o600)
        receipt = {
            "schema": "xiio.cli.install-receipt/v2",
            "repo": "Vado42-chris/xi-io-cli",
            "ref": SOURCE,
            "source_sha": SOURCE,
            "generation": generation,
            "prefix": str(root / "prefix"),
            "files": {"src/xiio.mjs": sha(PAYLOAD)},
        }
        write(generation_root / "install-receipt.json",
              json.dumps(receipt, sort_keys=True) + "\n", 0o600)
    session = {
        "schema": "xiio.cli.chat-session/v1",
        "workspace": str(root / "project"),
        "model": "qwen2.5:1.5b",
        "messages": [{"role": "user", "content": "read"},
                     {"role": "assistant", "content": "status: new"}],
    }
    write(root / "state/chat/session.json", json.dumps(session) + "\n", 0o600)
    write(root / "config/active-workspace", str(root / "project") + "\n", 0o600)
    write(root / "config/preserved-choice.txt", "keep local choices\n", 0o644)
    write(root / "project/NOTE.txt", "status: new\n", 0o644)
    outcome = {
        "state": "PASS",
        "first_generation": FIRST,
        "second_generation": SECOND,
        "same_source_generations": True,
        "canonical_cli_adoption": False,
        "ward_authority_granted": False,
        "bins_version_qualified": False,
        "consumed_return_qualified": False,
    }
    write(root / "installed-outcome.json", json.dumps(outcome) + "\n", 0o644)


class InstalledEvidenceCustodyTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="xiio-evidence-custody-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).absolute()
        seed(self.root)

    def assert_refuses(self, reason: str) -> None:
        with self.assertRaisesRegex(CustodyError, reason):
            verify(self.root)
        self.assertFalse((self.root / "evidence-custody.json").exists())

    def test_valid_private_installed_evidence_is_independently_reopened(self):
        result = verify(self.root)
        self.assertEqual(result["state"], "INSTALLED_OLLAMA_EVIDENCE_CUSTODY_VERIFIED")
        self.assertEqual(result["source_sha"], SOURCE)
        self.assertEqual(set(result["pointers"].values()), {FIRST, SECOND})
        evidence = self.root / "evidence-custody.json"
        self.assertEqual(stat.S_IMODE(evidence.stat().st_mode), 0o600)
        self.assertEqual(json.loads(evidence.read_text())["provider_effect"], False)

    def test_world_writable_or_wrong_mode_launcher_refuses(self):
        (self.root / "bin/xi-io-cli").chmod(0o777)
        self.assert_refuses("EVIDENCE_FILE_WRITABLE_BY_OTHERS:bin/xi-io-cli")

    def test_permissive_install_receipt_refuses(self):
        (self.root / "prefix/versions" / FIRST / "install-receipt.json").chmod(0o644)
        self.assert_refuses("EVIDENCE_FILE_MODE_INVALID:prefix/versions/.*/install-receipt.json")

    def test_permissive_pointer_or_chat_session_refuses(self):
        for relative, reason in [
            ("prefix/current", "EVIDENCE_FILE_MODE_INVALID:prefix/current"),
            ("state/chat/session.json", "EVIDENCE_FILE_MODE_INVALID:state/chat/session.json"),
        ]:
            with self.subTest(relative=relative):
                (self.root / relative).chmod(0o644)
                self.assert_refuses(reason)
                (self.root / relative).chmod(0o600)

    def test_hard_linked_launcher_refuses(self):
        os.link(self.root / "bin/xi-io-cli", self.root / "bin/launcher-alias")
        self.assert_refuses("EVIDENCE_FILE_CUSTODY_INVALID:bin/xi-io-cli")

    def test_permissive_payload_or_config_refuses(self):
        payload = self.root / "prefix/versions" / FIRST / "src/xiio.mjs"
        payload.chmod(0o644)
        self.assert_refuses("EVIDENCE_FILE_MODE_INVALID:prefix/versions/.*/src/xiio.mjs")
        payload.chmod(0o600)
        (self.root / "config/preserved-choice.txt").chmod(0o666)
        self.assert_refuses("EVIDENCE_FILE_WRITABLE_BY_OTHERS:config/preserved-choice.txt")

    def test_promoted_authority_or_collapsed_generations_refuses(self):
        outcome_path = self.root / "installed-outcome.json"
        outcome = json.loads(outcome_path.read_text())
        outcome["ward_authority_granted"] = True
        outcome_path.write_text(json.dumps(outcome) + "\n")
        self.assert_refuses("EVIDENCE_CLAIM_CEILING_VIOLATED")
        outcome["ward_authority_granted"] = False
        outcome["second_generation"] = FIRST
        outcome_path.write_text(json.dumps(outcome) + "\n")
        self.assert_refuses("EVIDENCE_CLAIM_CEILING_VIOLATED")


if __name__ == "__main__":
    unittest.main(verbosity=2)
