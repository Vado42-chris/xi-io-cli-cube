import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "kernel"))

import native_product_receiver as receiver


class NativeProductReceiverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="xiio-product-receiver-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.receipt = self.root / "framework.binding.json"
        self.receipt.write_text("{}\n", encoding="utf-8")
        self.module = self.root / "release-reader.mjs"
        self.module.write_text("export const fixture=true;\n", encoding="utf-8")
        self.lock = self.root / "bundle.lock.json"
        self.lock.write_text(json.dumps({
            "schema_version": "xiio-installer-bundle-profile-v1",
            "profile_id": "sam-product",
            "fixture": False,
            "profile_mode": "product",
            "product_root_role": "sam",
            "products": [
                {"role": "sdk", "product_id": "xi-io-sdk", "manifest": "sdk.json",
                 "manifest_sha256": "1" * 64, "depends_on": [], "payload_urls": {}},
                {"role": "sam", "product_id": "xi-io-sam-law", "manifest": "sam.json",
                 "manifest_sha256": "2" * 64, "depends_on": ["sdk"], "payload_urls": {}},
            ],
        }, sort_keys=True), encoding="utf-8")
        self.lock_sha = hashlib.sha256(self.lock.read_bytes()).hexdigest()
        self.node = {"path": "/usr/bin/node", "sha256": "a" * 64, "version": "v24.22.1"}
        sdk = SimpleNamespace(product_id="xi-io-sdk", display_name="XI-IO SDK",
                              version="1.0.0", channel="stable")
        sam = SimpleNamespace(product_id="xi-io-sam-law", display_name="SAM_LAW",
                              version="1.0.0", channel="stable")
        self.profile = {
            "profile_id": "sam-product", "fixture": False, "profile_mode": "product",
            "product_root_role": "sam", "lock_sha256": self.lock_sha,
            "ordered_roles": ("sdk", "sam"),
            "products": {"sdk": (sdk, {}, ()), "sam": (sam, {}, ("sdk",))},
        }
        self.binding = {
            "schema": "xiio.release-distribution-lock/v1",
            "product_ref": "xi-io-sam-law",
            "consumer_ref": receiver.CONSUMER_REF,
            "release_ref": "release:sam:1",
            "release_generation": "b" * 40,
            "approved_lock_sha256": self.lock_sha,
            "provider_hosts": ["packages.example.org"],
            "lifecycle": "DISTRIBUTABLE",
            "adopter_current": True,
            "entrypoint_qualification_ref": "entrypoint:sam:1",
            "effect_authority": False,
            "installed": False,
        }

    def patches(self):
        return (
            patch.object(
                receiver.framework_release_export,
                "resolve_framework_release_distribution_module",
                return_value={"release_distribution_module": str(self.module)},
            ),
            patch.object(
                receiver.framework_release_reader,
                "build_framework_release_distribution_reader",
                return_value=lambda **_kwargs: dict(self.binding),
            ),
            patch.object(receiver, "load_bundle_profile", return_value=self.profile),
        )

    def inspect(self):
        one, two, three = self.patches()
        with one, two, three:
            return receiver.inspect_product_release(
                release_lock=str(self.lock),
                framework_binding_receipt=str(self.receipt),
                framework_generation="c" * 40,
                node=self.node,
            )

    def test_inspect_derives_product_and_exact_dependency_closure(self):
        review = self.inspect()
        self.assertEqual(review["schema"], receiver.REVIEW_SCHEMA)
        self.assertEqual(review["phase"], "PRODUCT_REVIEW_REQUIRED")
        self.assertEqual(review["product_ref"], "xi-io-sam-law")
        self.assertEqual(review["ordered_roles"], ["sdk", "sam"])
        self.assertEqual([row["product_ref"] for row in review["products"]],
                         ["xi-io-sdk", "xi-io-sam-law"])
        self.assertRegex(review["review_digest"], r"^[0-9a-f]{64}$")
        for key in ("installed_bytes_verified", "runtime_generation_verified",
                    "services_started", "product_api_admitted",
                    "entitlement_admitted", "billing_admitted",
                    "ward_effect_authorized", "effect_authority",
                    "provider_effect", "return_applied"):
            self.assertIs(review[key], False, key)

    def test_suite_lock_refuses_before_framework_reader(self):
        value = json.loads(self.lock.read_text(encoding="utf-8"))
        value.pop("product_root_role")
        value["profile_mode"] = "suite"
        self.lock.write_text(json.dumps(value), encoding="utf-8")
        with patch.object(
            receiver.framework_release_export,
            "resolve_framework_release_distribution_module",
        ) as resolver:
            with self.assertRaisesRegex(receiver.ProductReceiverError,
                                        "^PRODUCT_PROFILE_REQUIRED$"):
                receiver.inspect_product_release(
                    release_lock=str(self.lock),
                    framework_binding_receipt=str(self.receipt),
                    framework_generation="c" * 40,
                    node=self.node,
                )
        resolver.assert_not_called()

    def test_distribution_lock_digest_mismatch_refuses_before_profile_parse(self):
        self.binding["approved_lock_sha256"] = "0" * 64
        one, two, three = self.patches()
        with one, two, three as profile:
            with self.assertRaisesRegex(receiver.ProductReceiverError,
                                        "^PRODUCT_RELEASE_LOCK_DIGEST_MISMATCH$"):
                receiver.inspect_product_release(
                    release_lock=str(self.lock),
                    framework_binding_receipt=str(self.receipt),
                    framework_generation="c" * 40,
                    node=self.node,
                )
        profile.assert_not_called()

    def test_apply_reopens_review_and_consumes_existing_installer(self):
        review = self.inspect()
        installed = {
            "state": "INSTALLED_BYTES_VERIFIED",
            "profile_id": "sam-product",
            "lock_sha256": self.lock_sha,
            "roles": ["sdk", "sam"],
            "runtime_qualified": False,
            "authority_granted": False,
        }
        one, two, three = self.patches()
        with one, two, three, patch.object(
            receiver.release_binding,
            "install_from_installed_framework_release",
            return_value=installed,
        ) as effect:
            result = receiver.apply_product_release(
                release_lock=str(self.lock),
                framework_binding_receipt=str(self.receipt),
                framework_generation="c" * 40,
                node=self.node,
                review_digest=review["review_digest"],
                approved=True,
            )
        effect.assert_called_once_with(
            self.lock,
            product_ref="xi-io-sam-law",
            consumer_ref=receiver.CONSUMER_REF,
            framework_binding_receipt=self.receipt,
            expected_framework_generation="c" * 40,
            node_binary="/usr/bin/node",
        )
        self.assertEqual(result["phase"],
                         "PRODUCT_BYTES_INSTALLED_READBACK_VERIFIED")
        self.assertTrue(result["installed_bytes_verified"])
        self.assertFalse(result["runtime_generation_verified"])
        self.assertFalse(result["ward_effect_authorized"])
        self.assertFalse(result["return_applied"])

    def test_stale_review_and_missing_approval_never_reach_installer(self):
        with patch.object(
            receiver.release_binding,
            "install_from_installed_framework_release",
        ) as effect:
            with self.assertRaisesRegex(receiver.ProductReceiverError,
                                        "^PRODUCT_EXACT_APPROVAL_REQUIRED$"):
                receiver.apply_product_release(
                    release_lock=str(self.lock),
                    framework_binding_receipt=str(self.receipt),
                    framework_generation="c" * 40,
                    node=self.node,
                    review_digest="d" * 64,
                    approved=False,
                )
        effect.assert_not_called()
        one, two, three = self.patches()
        with one, two, three, patch.object(
            receiver.release_binding,
            "install_from_installed_framework_release",
        ) as effect:
            with self.assertRaisesRegex(receiver.ProductReceiverError,
                                        "^PRODUCT_RELEASE_CHANGED_SINCE_REVIEW$"):
                receiver.apply_product_release(
                    release_lock=str(self.lock),
                    framework_binding_receipt=str(self.receipt),
                    framework_generation="c" * 40,
                    node=self.node,
                    review_digest="d" * 64,
                    approved=True,
                )
        effect.assert_not_called()


class InstallerAdapterProductDispatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import installer_adapter
        cls.adapter = installer_adapter

    def request(self, action="product_inspect"):
        value = {
            "action": action,
            "release_lock": "/tmp/product/bundle.lock.json",
            "framework_binding_receipt": "/tmp/framework.binding.json",
            "framework_generation": "c" * 40,
            "node": "/usr/bin/node",
        }
        if action == "product_apply":
            value.update(review_digest="d" * 64, approved=True)
        return value

    def test_wrapper_dispatches_only_exact_product_fields(self):
        expected = {"phase": "PRODUCT_REVIEW_REQUIRED"}
        with patch.object(self.adapter, "node_identity",
                          return_value={"path": "/usr/bin/node",
                                        "sha256": "a" * 64,
                                        "version": "v24.22.1"}), \
             patch.object(self.adapter.native_product_receiver,
                          "inspect_product_release",
                          return_value=expected) as inspect, \
             patch.object(self.adapter, "_CORE_HANDLE") as core:
            self.assertEqual(self.adapter.handle(self.request()), expected)
        inspect.assert_called_once()
        core.assert_not_called()
        invalid = self.request()
        invalid["product_ref"] = "caller-forged"
        with self.assertRaisesRegex(self.adapter.Refused,
                                    "^PRODUCT_RECEIVER_FIELDS_INVALID$"):
            self.adapter.handle(invalid)

    def test_apply_requires_exact_review_and_explicit_approval(self):
        request = self.request("product_apply")
        with patch.object(self.adapter, "node_identity",
                          return_value={"path": "/usr/bin/node",
                                        "sha256": "a" * 64,
                                        "version": "v24.22.1"}), \
             patch.object(self.adapter.native_product_receiver,
                          "apply_product_release",
                          return_value={"phase":
                              "PRODUCT_BYTES_INSTALLED_READBACK_VERIFIED"}) as apply:
            result = self.adapter.handle(request)
        self.assertEqual(result["phase"],
                         "PRODUCT_BYTES_INSTALLED_READBACK_VERIFIED")
        apply.assert_called_once()
        request["approved"] = False
        with self.assertRaisesRegex(self.adapter.Refused,
                                    "^PRODUCT_EXACT_APPROVAL_REQUIRED$"):
            self.adapter.handle(request)


if __name__ == "__main__":
    unittest.main()
