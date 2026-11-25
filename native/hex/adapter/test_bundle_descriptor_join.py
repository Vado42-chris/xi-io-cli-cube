"""Exact Cube #36 consumption regressions, no new Installer engine or authority."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from test_bundle import BundleFixture, load_bundle_profile, install_bundle, BundleError


def sha(data):
    return hashlib.sha256(data).hexdigest()


class ProductDescriptorReleaseJoinTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="xiio-descriptor-join-")
        self.addCleanup(self.temp.cleanup)
        self.f = BundleFixture(Path(self.temp.name))
        self.root_generation = "a" * 40
        self.worker_generation = "b" * 40
        # Product root has a declared transitive runtime dependency but
        # does not manufacture an export binding for itself.
        self.f.child("publisher", depends_on=("worker",), fixture=False)
        self.f.child("worker", fixture=False)
        self.f.rows[0]["release_generation"] = self.root_generation
        self.f.rows[1]["release_generation"] = self.worker_generation
        self.descriptor = {
            "schema": "xiio.installer-dependency-descriptor/v1",
            "dependency_id": "worker",
            "product_id": "xi-io-worker",
            "owner_repo": "owner/worker",
            "accepted_generation": self.worker_generation,
            "runtime_exports": {
                "module": {
                    "destination_scope": "xdg_data",
                    "destination": "xi-io/worker/worker.bin",
                },
            },
        }
        self.attach_descriptor()

    def attach_descriptor(self):
        encoded = json.dumps(self.descriptor, sort_keys=True).encode()
        (self.f.root / "worker.descriptor.json").write_bytes(encoded)
        row = self.f.rows[1]
        row["descriptor_ref"] = "worker.descriptor.json"
        row["descriptor_sha256"] = sha(encoded)

    def lock(self):
        return self.f.lock(fixture=False, profile_mode="product",
                           product_root_role="publisher")

    def assert_pre_effect_refusal(self, code):
        lock, approved = self.lock()
        attempts = []
        with self.assertRaisesRegex(BundleError, code):
            install_bundle(lock, approved_lock_sha256=approved,
                           env=self.f.env, fetch=lambda *a: attempts.append(a))
        self.assertEqual(attempts, [])
        self.assertFalse((Path(self.f.env["XDG_DATA_HOME"])/"xi-io").exists())

    def test_full_product_lock_consumes_separate_descriptor_and_generation(self):
        lock, approved = self.lock()
        profile = load_bundle_profile(lock)
        self.assertEqual(profile["ordered_roles"], ("worker", "publisher"))
        self.assertEqual(profile["release_generations"], {
            "worker": self.worker_generation,
            "publisher": self.root_generation,
        })
        self.assertEqual(profile["product_descriptors"]["worker"]["generation"],
                         self.worker_generation)
        self.assertNotIn("accepted_generation",
                         json.loads((self.f.root/"worker.manifest.json").read_text()))
        self.assertNotIn("runtime_exports",
                         json.loads((self.f.root/"worker.manifest.json").read_text()))
        result = install_bundle(lock, approved_lock_sha256=approved,
                                env=self.f.env, fetch=self.f.fetch)
        self.assertEqual(result["state"], "INSTALLED_BYTES_VERIFIED")
        self.assertEqual(result["roles"], ["worker", "publisher"])
        self.assertEqual(result["receipt_count"], 2)
        self.assertEqual(result["release_distribution_receipts"]["publisher"]
                         ["receipt"]["release_generation"], self.root_generation)
        self.assertEqual(result["release_distribution_receipts"]["worker"]
                         ["receipt"]["release_generation"], self.worker_generation)
        bind = result["dependency_binding_receipts"]["worker"]["receipt"]
        self.assertEqual(bind["accepted_generation"], self.worker_generation)
        self.assertEqual(bind["dependency_id"], "worker")
        self.assertEqual(bind["runtime_exports"]["module"]["sha256"],
                         sha(b"worker delivered\n"))
        self.assertFalse(bind["effect_authority"])
        self.assertFalse(result["runtime_qualified"])
        self.assertFalse(result["authority_granted"])

    def test_missing_descriptor_blocks_before_fetch(self):
        del self.f.rows[1]["descriptor_ref"]
        del self.f.rows[1]["descriptor_sha256"]
        self.assert_pre_effect_refusal("BUNDLE_RUNTIME_DEPENDENCY_DESCRIPTOR_REQUIRED")

    def test_missing_release_generation_blocks_before_fetch(self):
        del self.f.rows[0]["release_generation"]
        self.assert_pre_effect_refusal("BUNDLE_PRODUCT_FIELDS_INVALID|BUNDLE_RELEASE_GENERATION_UNBOUND")

    def test_missing_base_product_fields_refuse_before_fetch(self):
        row = self.f.rows[0]
        for field in ("role", "product_id", "manifest", "manifest_sha256",
                      "depends_on", "payload_urls"):
            with self.subTest(field=field):
                value = row.pop(field)
                try:
                    self.assert_pre_effect_refusal("BUNDLE_PRODUCT_FIELDS_INVALID")
                finally:
                    row[field] = value

    def test_foreign_descriptor_identity_blocks_before_fetch(self):
        self.descriptor["product_id"] = "foreign-product"
        self.attach_descriptor()
        self.assert_pre_effect_refusal("BUNDLE_DESCRIPTOR_CONTRACT_INVALID")

    def test_stale_descriptor_generation_blocks_before_fetch(self):
        self.descriptor["accepted_generation"] = "c" * 40
        self.attach_descriptor()
        self.assert_pre_effect_refusal("BUNDLE_DESCRIPTOR_RELEASE_GENERATION_MISMATCH")

    def test_mutated_descriptor_bytes_blocks_before_fetch(self):
        # Digest in the lock remains the previously approved version.
        (self.f.root/"worker.descriptor.json").write_bytes(b"{}")
        self.assert_pre_effect_refusal("BUNDLE_DESCRIPTOR_DIGEST_MISMATCH")

    def test_unexpected_descriptor_fields_refused_before_fetch(self):
        self.f.rows[1]["unexpected"] = "not-authorized"
        self.assert_pre_effect_refusal("BUNDLE_PRODUCT_FIELDS_INVALID")

    def test_strict_product_manifest_refuses_misplaced_runtime_exports(self):
        manifest_path = self.f.root/"worker.manifest.json"
        m = json.loads(manifest_path.read_text())
        m["accepted_generation"] = self.worker_generation
        m["runtime_exports"] = self.descriptor["runtime_exports"]
        raw = json.dumps(m, sort_keys=True).encode()
        manifest_path.write_bytes(raw)
        self.f.rows[1]["manifest_sha256"] = sha(raw)
        self.assert_pre_effect_refusal("BUNDLE_PRODUCT_MANIFEST_METADATA_MISPLACED")

    def test_wrong_descriptor_export_refuses_before_fetch(self):
        self.descriptor["runtime_exports"]["module"]["destination"] = "missing/entry"
        self.attach_descriptor()
        self.assert_pre_effect_refusal("BUNDLE_DESCRIPTOR_CONTRACT_INVALID")

    def test_same_source_cannot_mint_release_authority_from_lock(self):
        lock, _ = self.lock()
        profile = load_bundle_profile(lock)
        self.assertEqual(profile["runtime_authority"], False)
        self.assertEqual(profile["release_source_observed"], True)


if __name__ == "__main__":
    unittest.main()
