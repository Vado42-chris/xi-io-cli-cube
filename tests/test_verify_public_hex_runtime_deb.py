"""Synthetic hostile contract for the actual Debian runtime-distribution guard."""
from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "scripts/verify-public-hex-runtime-deb.py"
spec = importlib.util.spec_from_file_location("hex_public_deb_gate", SOURCE)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
CLI = gate.CLI
ADAPTER = gate.ADAPTER


def bundle(entries):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        for path, body, kind in entries:
            tarinfo = tarfile.TarInfo(path)
            tarinfo.mode = 0o644
            tarinfo.type = kind
            if kind == tarfile.REGTYPE:
                tarinfo.size = len(body)
            elif kind == tarfile.SYMTYPE:
                tarinfo.linkname = "../outside"
            archive.addfile(tarinfo, io.BytesIO(body) if kind == tarfile.REGTYPE else None)
    return buffer.getvalue()


BASE = [
    (ADAPTER + "installer_adapter.py", b"print('runtime')\n", tarfile.REGTYPE),
    (CLI + "install.mjs", b"console.log('cli runtime')\n", tarfile.REGTYPE),
    (CLI + "SOURCE.json", b'{"source":"owner"}\n', tarfile.REGTYPE),
]
EXTRA = (CLI + "source/private-extra.mjs", b"secret-source-not-approved\n", tarfile.REGTYPE)


class RealDebContentGate(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(prefix="xiio-public-deb-gate-")
        self.addCleanup(folder.cleanup)
        self.approval = Path(folder.name) / "public-runtime-distribution.approval.json"

    def reviewed(self, entries=BASE, approved=True):
        scan = gate.scan_tar(bundle(entries))
        self.approval.write_text(json.dumps({
            "schema": "xiio.hex.public-runtime-owner-approval/v1",
            "scope": "CUBE_DEV10_PUBLIC_RUNTIME_ONLY",
            "owner_repository": "Vado42-chris/xi-io-cli",
            "source_commit": "a" * 40,
            "review_commit": "b" * 40,
            "owner_review_url": "https://github.com/Vado42-chris/xi-io-cli/issues/12",
            "approval_state": ("APPROVED_FOR_PUBLIC_RUNTIME_DISTRIBUTION"
                               if approved else "PENDING"),
            "files": scan["cli_files"],
        }))
        return scan

    def test_rejects_unreviewed_runtime_source_even_if_valid_js(self):
        scan = gate.scan_tar(bundle(BASE))
        with self.assertRaisesRegex(gate.Refused, "PRIVATE_RUNTIME_APPROVAL_ABSENT"):
            gate.qualify(scan, self.approval)

    def test_only_exact_reviewed_files_and_bytes_can_pass_code_gate(self):
        scan = self.reviewed()
        report = gate.qualify(scan, self.approval)
        self.assertEqual(report["state"], "RUNTIME_CONTENT_REVIEW_GATE_PASSED")
        self.assertFalse(report["private_owner_approval_independently_confirmed"])
        self.assertFalse(report["publication_performed"])

    def test_explicit_pending_owner_review_cannot_pass(self):
        scan = self.reviewed(approved=False)
        with self.assertRaisesRegex(gate.Refused, "PRIVATE_RUNTIME_APPROVAL_UNVERIFIED"):
            gate.qualify(scan, self.approval)

    def test_private_extra_source_is_not_inferred_approved(self):
        scan = self.reviewed()
        added = gate.scan_tar(bundle(BASE + [EXTRA]))
        with self.assertRaisesRegex(gate.Refused, "PRIVATE_RUNTIME_FILESET_UNAPPROVED"):
            gate.qualify(added, self.approval)
        self.assertEqual(scan["cli_files"].keys(), set(gate.load_approval(self.approval)["files"]))

    def test_tampered_private_payload_fails_even_matching_size(self):
        scan = self.reviewed()
        changed = [(name, (b"x" + data[1:] if name.endswith("install.mjs") else data), kind)
                   for name, data, kind in BASE]
        with self.assertRaisesRegex(gate.Refused, "PRIVATE_RUNTIME_BYTES_UNAPPROVED"):
            gate.qualify(gate.scan_tar(bundle(changed)), self.approval)

    def test_tests_and_docs_never_ship_even_if_runtime_approved(self):
        for name in ["test_adapter.py", "README.md", "local_steps/local_ai_status.test.mjs",
                     "kernel/__pycache__/worker.pyc", "fixtures/probe.json"]:
            with self.subTest(path=name):
                entries = BASE + [(ADAPTER + name, b"fixture\n", tarfile.REGTYPE)]
                scan = self.reviewed(entries)
                with self.assertRaisesRegex(gate.Refused, "DEBIAN_DEVELOPMENT_FILES_PRESENT"):
                    gate.qualify(scan, self.approval)

    def test_symlink_or_hardlink_under_cli_never_passes(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
            with self.subTest(kind=kind):
                scan = gate.scan_tar(bundle(BASE + [(CLI + "bad.mjs", b"", kind)]))
                self.assertIn(CLI + "bad.mjs", scan["unsafe_files"])
                self.reviewed()
                with self.assertRaisesRegex(gate.Refused, "DEBIAN_PRIVATE_RUNTIME_LINK_OR_TYPE_REFUSED"):
                    gate.qualify(scan, self.approval)

    def test_tar_path_traversal_refused_without_unpacking(self):
        raw = bundle(BASE + [(CLI + "../escape.json", b"pwned", tarfile.REGTYPE)])
        with self.assertRaisesRegex(gate.Refused, "DEBIAN_ARCHIVE_PATH_UNTRUSTED"):
            gate.scan_tar(raw)

    def test_duplicate_tar_path_refused(self):
        with self.assertRaisesRegex(gate.Refused, "DEBIAN_DUPLICATE_ARCHIVE_PATH"):
            gate.scan_tar(bundle(BASE + [BASE[-1]]))

    def test_missing_adapter_or_cli_refused(self):
        for rows in [BASE[:1], BASE[1:]]:
            with self.subTest(rows=rows):
                with self.assertRaisesRegex(gate.Refused, "DEBIAN_REQUIRED_RUNTIME_MISSING"):
                    gate.scan_tar(bundle(rows))

    def test_approval_cannot_be_a_nonowner_repository(self):
        scan = self.reviewed()
        doc = json.loads(self.approval.read_text())
        doc["owner_repository"] = "Vado42-chris/xi-io.net"
        self.approval.write_text(json.dumps(doc))
        with self.assertRaisesRegex(gate.Refused, "PRIVATE_RUNTIME_APPROVAL_UNVERIFIED"):
            gate.qualify(scan, self.approval)

    def test_developer_only_tar_member_without_payload_blocked(self):
        scan = gate.scan_tar(bundle(BASE + [(ADAPTER + "test_native.py", b"do tests", tarfile.REGTYPE)]))
        self.assertEqual(scan["development_files"], [ADAPTER + "test_native.py"])


if __name__ == "__main__":
    unittest.main()
