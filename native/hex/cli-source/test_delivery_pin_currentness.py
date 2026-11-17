#!/usr/bin/env python3
"""Exercise the receiving verifier against the package it actually distributes."""
import hashlib
import importlib.util
import json
import pathlib
import unittest
from unittest import mock

SOURCE = pathlib.Path(__file__).resolve().parent
HEX = SOURCE.parent
REPO = HEX.parent.parent
spec = importlib.util.spec_from_file_location("hex_cli_delivery", HEX / "download-install-cli.py")
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class DeliveryPinCurrentness(unittest.TestCase):
    def test_receiving_verifier_accepts_its_committed_package(self):
        manifest = delivery.verify(SOURCE)
        self.assertEqual(manifest["source_sha"], delivery.SOURCE_SHA)
        self.assertEqual(set(manifest["files"]), set(delivery.FILES))

    def test_composition_projection_matches_current_package_not_old_hashes(self):
        receipt = json.loads((HEX / "COMPOSED-packaged-source.receipt.json").read_bytes())
        manifest = json.loads((SOURCE / "packaged-source.json").read_bytes())
        self.assertEqual(receipt["state"], "COMPOSED_NOT_ACTIVATED")
        self.assertEqual(receipt["source_sha"], manifest["source_sha"])
        self.assertEqual(receipt["payload_files"], len(manifest["files"]))
        self.assertEqual(receipt["manifest_sha256"], sha256(SOURCE / "packaged-source.json"))
        self.assertEqual(receipt["installer_sha256"], sha256(SOURCE / "install.mjs"))

    def test_nvm_discovery_pins_match_the_accepted_embedded_owner_bytes(self):
        adoption = json.loads((HEX / "SOURCE-ADOPTION.json").read_bytes())
        owner_blobs = adoption["kernel"]["files_unchanged_git_blob"]
        for relative, expected in delivery.DISCOVERY_FILES.items():
            with self.subTest(relative=relative):
                data = (REPO / relative).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), expected)
                if "/kernel/xiio_installer/" in relative:
                    blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
                    self.assertEqual(blob, owner_blobs[pathlib.Path(relative).name])

    def test_wrong_manifest_pin_still_refuses_before_manifest_parse(self):
        with mock.patch.object(delivery, "MANIFEST_SHA", "0" * 64), \
                mock.patch.object(delivery.json, "loads", side_effect=AssertionError("MUST_NOT_PARSE")):
            with self.assertRaisesRegex(RuntimeError, "^MANIFEST_HASH_MISMATCH$"):
                delivery.verify(SOURCE)

    def test_wrong_installer_pin_still_refuses_before_payload_reads(self):
        real_read = pathlib.Path.read_bytes
        def only_metadata(path):
            if path not in (SOURCE / "packaged-source.json", SOURCE / "install.mjs"):
                raise AssertionError("MUST_NOT_READ_PAYLOAD:" + str(path))
            return real_read(path)
        with mock.patch.object(delivery, "INSTALLER_SHA", "0" * 64), \
                mock.patch.object(pathlib.Path, "read_bytes", only_metadata):
            with self.assertRaisesRegex(RuntimeError, "^INSTALLER_HASH_MISMATCH$"):
                delivery.verify(SOURCE)


if __name__ == "__main__":
    unittest.main()
