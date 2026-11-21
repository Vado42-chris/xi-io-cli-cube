import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from native.hex.adapter.build_publisher_package import (
    PublisherPackageError, compile_publisher_package,
)
from native.hex.adapter.kernel.xiio_installer.manifest import (
    load_manifest, verify_payload,
)
from native.hex.adapter.kernel.xiio_installer.transaction import (
    apply_install, rollback,
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


class PublisherHexPackageConsumerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.handoff = self.root / "publisher"
        (self.handoff / "web").mkdir(parents=True)
        (self.handoff / "hosting-handoff").mkdir()
        self.out = self.root / "publisher-product"
        self.html = b"<!doctype html><title>Publisher isolated DEV canary</title>"
        self.source_sha = "a" * 40
        self.write_handoff()

    def write_handoff(self, raw=None):
        if raw is not None:
            self.html = raw
        (self.handoff / "web" / "index.html").write_bytes(self.html)
        inventory = [{
            "path": "index.html", "bytes": len(self.html),
            "sha256": sha(self.html),
        }]
        handoff = {
            "schema": "xiio.shared-web-artifact-handoff/v1",
            "producer": {"source_sha": self.source_sha},
            "artifact": {
                "root_base": "browser_evidence_root",
                "root": "web", "entrypoint": "index.html",
                "inventory_sha256": sha(json.dumps(
                    inventory, separators=(",", ":")).encode()),
                "file_count": 1, "bytes": len(self.html),
            },
            "hosting": {"provider_effects": 0, "live_claim": False},
        }
        self.spec = handoff
        (self.handoff / "hosting-handoff" / "handoff.json").write_text(
            json.dumps(handoff))

    def test_existing_publisher_handoff_consumes_installer_manifest(self):
        receipt = compile_publisher_package(self.handoff, self.out)
        self.assertEqual(receipt["state"],
                         "PACKAGED_READBACK_VERIFIED_NOT_INSTALLED")
        self.assertFalse(receipt["effect_authority"])
        manifest = load_manifest(self.out / "manifest.json")
        self.assertEqual(manifest.product_id, "xiio-publisher")
        self.assertEqual(manifest.version, "source-" + self.source_sha[:12])
        self.assertEqual(verify_payload(manifest, self.out)[0]["sha256"],
                         sha(self.html))
        info = json.loads((self.out / "publisher-product.json").read_text())
        self.assertFalse(info["bins_resource_version_bound"])
        self.assertFalse(info["work_return_bound"])
        self.assertFalse(info["release_authority"])

    def test_disposable_native_linux_installer_readback_and_rollback(self):
        compile_publisher_package(self.handoff, self.out)
        manifest = load_manifest(self.out / "manifest.json")
        xdg = self.root / "xdg"
        env = {"HOME": str(xdg),
               "XDG_DATA_HOME": str(xdg / "data"),
               "XDG_CONFIG_HOME": str(xdg / "config"),
               "XDG_STATE_HOME": str(xdg / "state"),
               "XDG_CACHE_HOME": str(xdg / "cache")}
        receipt = self.root / "install-receipt.json"
        result = apply_install(manifest, self.out, receipt, env)
        installed = xdg / "data" / "xiio" / "publisher" / "index.html"
        self.assertEqual(installed.read_bytes(), self.html)
        self.assertEqual(sha(installed.read_bytes()), sha(self.html))
        self.assertTrue(receipt.is_file())
        rollback(receipt, env)
        self.assertFalse(installed.exists())
        self.assertTrue(result)

    def test_tampered_publisher_payload_blocks_without_output(self):
        self.write_handoff()
        (self.handoff / "web" / "index.html").write_bytes(self.html + b"X")
        with self.assertRaisesRegex(PublisherPackageError,
                                     "PUBLISHER_HANDOFF_INVENTORY_MISMATCH"):
            compile_publisher_package(self.handoff, self.out)
        self.assertFalse(self.out.exists())

    def test_tampered_inventory_or_source_generation_blocks(self):
        self.spec["artifact"]["inventory_sha256"] = "0" * 64
        (self.handoff / "hosting-handoff" / "handoff.json").write_text(
            json.dumps(self.spec))
        with self.assertRaisesRegex(PublisherPackageError,
                                     "PUBLISHER_HANDOFF_INVENTORY_MISMATCH"):
            compile_publisher_package(self.handoff, self.out)
        self.assertFalse(self.out.exists())
        self.write_handoff()
        self.spec["producer"]["source_sha"] = "not-a-commit"
        (self.handoff / "hosting-handoff" / "handoff.json").write_text(
            json.dumps(self.spec))
        with self.assertRaisesRegex(PublisherPackageError,
                                     "PUBLISHER_SOURCE_GENERATION_INVALID"):
            compile_publisher_package(self.handoff, self.out)

    def test_untrusted_handoff_symlink_and_no_overwrite(self):
        (self.handoff / "web" / "index.html").unlink()
        (self.handoff / "web" / "index.html").symlink_to(
            self.root / "external")
        (self.root / "external").write_bytes(self.html)
        with self.assertRaisesRegex(PublisherPackageError,
                                     "PUBLISHER_SOURCE_FILE_UNTRUSTED"):
            compile_publisher_package(self.handoff, self.out)
        self.write_handoff()
        (self.handoff / "web" / "index.html").unlink()
        self.write_handoff()
        compile_publisher_package(self.handoff, self.out)
        with self.assertRaisesRegex(PublisherPackageError,
                                     "PUBLISHER_OUTPUT_MUST_BE_NEW"):
            compile_publisher_package(self.handoff, self.out)

    def test_incomplete_handoff_must_not_be_claimed_as_release(self):
        self.spec["hosting"]["live_claim"] = True
        (self.handoff / "hosting-handoff" / "handoff.json").write_text(
            json.dumps(self.spec))
        with self.assertRaisesRegex(PublisherPackageError,
                                     "PUBLISHER_HANDOFF_SCOPE_UNQUALIFIED"):
            compile_publisher_package(self.handoff, self.out)
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
