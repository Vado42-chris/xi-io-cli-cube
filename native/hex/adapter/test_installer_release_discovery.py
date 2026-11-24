import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import installer_adapter


class InstallerReleaseDiscoveryTests(unittest.TestCase):
    def fixture(self):
        td = tempfile.TemporaryDirectory()
        root = Path(td.name)
        module = root / "release-distribution-reader.mjs"
        module.write_text("export async function readReleaseDistribution(){return {}; }\n")
        os.chmod(module, 0o644)
        generation = "a" * 40
        receipt = root / "framework-runtime.binding.json"
        receipt.write_text(json.dumps({
            "schema": "xiio.installer-dependency-binding-receipt/v1",
            "state": "BOUND",
            "dependency_id": "framework-runtime",
            "owner_repo": "Vado42-chris/xi-io.net",
            "accepted_generation": generation,
            "binding_receipt_path": str(receipt.resolve()),
            "runtime_exports": {"release_distribution_module": {
                "sha256": hashlib.sha256(module.read_bytes()).hexdigest(),
                "mode": "0644",
            }},
            "fields": {"release_distribution_module": str(module.resolve())},
            "provider_effect": False,
            "effect_authority": False,
        }))
        os.chmod(receipt, 0o600)
        return td, receipt, generation

    def request(self, receipt, generation):
        return {
            "action": "release_discover",
            "product_ref": "sam-law",
            "consumer_ref": "hex-installer",
            "framework_binding_receipt": str(receipt.resolve()),
            "framework_generation": generation,
        }

    def lock(self, **overrides):
        value = {
            "schema": "xiio.release-distribution-lock/v1",
            "product_ref": "sam-law",
            "consumer_ref": "hex-installer",
            "release_generation": "sam-gen-7",
            "approved_lock_sha256": "b" * 64,
            "artifact_refs": [{"artifact_ref": "sam-package", "sha256": "c" * 64}],
            "provider_hosts": ["releases.example.com"],
            "lifecycle": "DISTRIBUTABLE",
            "adopter_current": True,
            "effect_authority": False,
            "installed": False,
            "entrypoint_qualification_ref": "qual:sam:7",
        }
        value.update(overrides)
        return value

    def test_qualified_discovery_is_read_only(self):
        td, receipt, generation = self.fixture()
        self.addCleanup(td.cleanup)
        with patch.object(
            installer_adapter.framework_release_reader,
            "build_framework_release_distribution_reader",
            return_value=lambda **_: self.lock(),
        ):
            out = installer_adapter.handle(self.request(receipt, generation))
        self.assertEqual(out["state"], "QUALIFIED")
        self.assertEqual(out["distribution"]["release_generation"], "sam-gen-7")
        self.assertFalse(out["effect_authority"])
        self.assertFalse(out["provider_effect"])

    def test_wrong_product_and_noncurrent_release_refuse(self):
        td, receipt, generation = self.fixture()
        self.addCleanup(td.cleanup)
        for lock, code in [
            (self.lock(product_ref="other"), "FRAMEWORK_RELEASE_DISTRIBUTION_COORDINATE_MISMATCH"),
            (self.lock(adopter_current=False), "FRAMEWORK_RELEASE_DISTRIBUTION_NOT_CURRENT"),
            (self.lock(lifecycle="STAGED"), "FRAMEWORK_RELEASE_DISTRIBUTION_NOT_CURRENT"),
        ]:
            with self.subTest(code=code), patch.object(
                installer_adapter.framework_release_reader,
                "build_framework_release_distribution_reader",
                return_value=lambda **_: lock,
            ):
                with self.assertRaisesRegex(Exception, code):
                    installer_adapter.handle(self.request(receipt, generation))

    def test_unverified_framework_binding_refuses(self):
        td, receipt, _ = self.fixture()
        self.addCleanup(td.cleanup)
        with self.assertRaisesRegex(Exception, "FRAMEWORK_RELEASE_DISTRIBUTION_UNVERIFIED"):
            installer_adapter.handle(self.request(receipt, "b" * 40))


if __name__ == "__main__":
    unittest.main()
