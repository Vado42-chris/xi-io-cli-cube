"""Native HEX core release routing: no path/IP input, no forged approval."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import installer_adapter

ROLES = ("cli", "ibal", "switchboard", "bins", "ward", "inbox")


class CoreBundleNative(unittest.TestCase):
    def test_no_published_profile_refuses_without_host_configuration(self):
        with tempfile.TemporaryDirectory(prefix="xiio-native-core-") as d:
            with patch.object(installer_adapter, "HERE", Path(d)):
                observed = installer_adapter.handle({"action": "bundle_inspect"})
                self.assertEqual(observed["phase"], "BLOCKED_RELEASE_PROFILE_UNPUBLISHED")
                self.assertEqual(set(observed["missing_roles"]), set(ROLES))
                self.assertFalse(observed["installable"])
                with self.assertRaisesRegex(Exception, "BUNDLE_RELEASE_PROFILE_UNPUBLISHED"):
                    installer_adapter.handle({"action": "bundle_apply",
                                              "lock_sha256": "a" * 64, "approved": True})

    def valid_profile(self, root):
        products = []
        for role in ROLES:
            raw = ("Synthetic " + role + " content\n").encode()
            manifest = {
                "schema_version": "xiio-installer-product-manifest-v1",
                "profile_id": "core-six", "product_id": "xi-io-" + role,
                "display_name": "XI-IO " + role, "version": "0.0.1",
                "channel": "alpha", "fixture": False,
                "payload": [{
                    "source": role + ".bin",
                    "sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw),
                    "destination_scope": "xdg_data",
                    "destination": "xi-io/core/" + role + "/" + role + ".bin",
                    "mode": "0644", "overwrite": "fail",
                }],
            }
            data = json.dumps(manifest, sort_keys=True).encode()
            (root / (role + ".json")).write_bytes(data)
            products.append({
                "role": role, "product_id": manifest["product_id"],
                "manifest": role + ".json",
                "manifest_sha256": hashlib.sha256(data).hexdigest(),
                "depends_on": ["cli"] if role != "cli" else [],
                "payload_urls": {role + ".bin": "https://github.com/synthetic/" + role + ".bin"},
            })
        bundle = {"schema_version": "xiio-installer-bundle-profile-v1",
                  "profile_id": "core-six", "fixture": False, "products": products}
        lock = json.dumps(bundle, sort_keys=True).encode()
        (root / "core-release.lock.json").write_bytes(lock)
        return hashlib.sha256(lock).hexdigest()

    def test_review_and_exact_approval_call_existing_bundle_not_fake_authority(self):
        with tempfile.TemporaryDirectory(prefix="xiio-native-core-") as d:
            root = Path(d)
            digest = self.valid_profile(root)
            with patch.object(installer_adapter, "HERE", root):
                view = installer_adapter.handle({"action": "bundle_inspect"})
                self.assertEqual(view["phase"], "REVIEW_REQUIRED")
                self.assertEqual(view["lock_sha256"], digest)
                self.assertEqual(set(view["components"]), set(ROLES))
                self.assertFalse(view["device_connected"])
                for bad in (
                    {"action": "bundle_apply", "lock_sha256": "b" * 64, "approved": True},
                    {"action": "bundle_apply", "lock_sha256": digest, "approved": False},
                    {"action": "bundle_inspect", "url": "https://untrusted.example"},
                ):
                    with self.subTest(bad=bad):
                        with self.assertRaises(Exception):
                            installer_adapter.handle(bad)
                sentinel = {"schema_version": "xiio-installer-bundle-result-v1",
                            "state": "INSTALLED_BYTES_VERIFIED", "authority_granted": False,
                            "device_connected": False, "child_services_started": False}
                with patch.object(installer_adapter.child_bundle, "install_bundle",
                                  return_value=sentinel) as install:
                    actual = installer_adapter.handle({
                        "action": "bundle_apply", "lock_sha256": digest, "approved": True
                    })
                    self.assertEqual(actual, sentinel)
                    install.assert_called_once()
                    args = install.call_args
                    self.assertEqual(args.kwargs["approved_lock_sha256"], digest)
                    self.assertEqual(args.args[0], root / "core-release.lock.json")

    def test_fixture_lock_never_becomes_native_prod_release(self):
        with tempfile.TemporaryDirectory(prefix="xiio-native-core-") as d:
            root = Path(d)
            self.valid_profile(root)
            lock = root / "core-release.lock.json"
            raw = json.loads(lock.read_text())
            raw["fixture"] = True
            # It must fail at manifest/profile fixture disagreement, and cannot
            # be treated as an approved production bundle.
            lock.write_text(json.dumps(raw))
            with patch.object(installer_adapter, "HERE", root):
                with self.assertRaises(Exception):
                    installer_adapter.handle({"action": "bundle_inspect"})


if __name__ == "__main__":
    unittest.main()
