"""Native HEX core release routing: no path/IP input, no forged approval."""
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import installer_adapter

ROLES = ("cli", "ibal", "switchboard", "bins", "ward", "inbox")


class CoreBundleNative(unittest.TestCase):
    def runtime_env(self, root):
        return {
            "HOME": str(root / "home"),
            "XDG_CONFIG_HOME": str(root / "config"),
            "XDG_DATA_HOME": str(root / "data"),
            "XDG_STATE_HOME": str(root / "state"),
            "XDG_CACHE_HOME": str(root / "cache"),
        }

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
            env = self.runtime_env(root)
            with patch.dict(os.environ, env, clear=False), patch.object(installer_adapter, "HERE", root):
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
                installed_view = {"schema_version":"xiio-installer-bundle-inspection-v1",
                                  "state":"INSTALLED_BYTES_VERIFIED","profile_id":"core-six",
                                  "lock_sha256":digest,"roles":{},"receipt_count":6,"first_red":None,
                                  "effects_authorized":False,"runtime_qualified":False,"device_connected":False}
                with patch.object(installer_adapter.child_bundle, "install_bundle", return_value=sentinel) as install, \
                     patch.object(installer_adapter.child_bundle, "inspect_bundle_install",
                                  side_effect=[{"state":"NOT_INSTALLED","receipt_count":0,"first_red":None}, installed_view, installed_view]):
                    actual = installer_adapter.handle({
                        "action": "bundle_apply", "lock_sha256": digest, "approved": True
                    })
                    self.assertEqual(actual["state"], sentinel["state"])
                    self.assertTrue(actual["journaled"])
                    self.assertIn("operation_id", actual)
                    install.assert_called_once()
                    args = install.call_args
                    self.assertEqual(args.kwargs["approved_lock_sha256"], digest)
                    self.assertEqual(args.args[0], root / "core-release.lock.json")

    def test_partial_unreceipted_effect_blocks_retry_across_process_state(self):
        with tempfile.TemporaryDirectory(prefix="xiio-native-core-") as d:
            root = Path(d)
            digest = self.valid_profile(root)
            env = self.runtime_env(root)
            first_dest = Path(env["XDG_DATA_HOME"]) / "xi-io/core/cli/cli.bin"
            calls = {"count": 0}
            def interrupted(*_args, **_kwargs):
                calls["count"] += 1
                first_dest.parent.mkdir(parents=True, exist_ok=True)
                first_dest.write_bytes(b"Synthetic cli content\n")
                raise RuntimeError("simulated process loss after first write")
            with patch.dict(os.environ, env, clear=False), patch.object(installer_adapter, "HERE", root), \
                 patch.object(installer_adapter.child_bundle, "install_bundle", side_effect=interrupted):
                with self.assertRaisesRegex(Exception, "BUNDLE_OUTCOME_UNCERTAIN_DO_NOT_RETRY"):
                    installer_adapter.handle({"action":"bundle_apply","lock_sha256":digest,"approved":True})
                self.assertEqual(calls["count"], 1)
                observed = installer_adapter.handle({"action":"bundle_inspect"})
                self.assertEqual(observed["phase"], "APPLY_OUTCOME_UNCERTAIN")
                self.assertTrue(observed["do_not_retry"])
                with self.assertRaisesRegex(Exception, "BUNDLE_OUTCOME_UNCERTAIN_OR_ALREADY_INSTALLED_DO_NOT_RETRY"):
                    installer_adapter.handle({"action":"bundle_apply","lock_sha256":digest,"approved":True})
                self.assertEqual(calls["count"], 1)
                self.assertTrue(observed["attempts"])
                self.assertEqual(observed["attempts"][-1]["final_state"], "unknown")

    def test_failed_no_effect_attempt_is_durably_reconciled_before_retry(self):
        with tempfile.TemporaryDirectory(prefix="xiio-native-core-") as d:
            root = Path(d)
            digest = self.valid_profile(root)
            env = self.runtime_env(root)
            with patch.dict(os.environ, env, clear=False), patch.object(installer_adapter, "HERE", root), \
                 patch.object(installer_adapter.child_bundle, "install_bundle", side_effect=RuntimeError("before effects")):
                with self.assertRaisesRegex(Exception, "BUNDLE_APPLY_FAILED_ROLLED_BACK"):
                    installer_adapter.handle({"action":"bundle_apply","lock_sha256":digest,"approved":True})
                observed = installer_adapter.handle({"action":"bundle_inspect"})
                self.assertEqual(observed["phase"], "RECONCILED_NOT_INSTALLED")
                self.assertTrue(observed["retry_allowed"])
                self.assertEqual(observed["attempts"][-1]["final_state"], "failed")

    def test_cross_process_custody_blocks_second_apply_but_not_inspection(self):
        with tempfile.TemporaryDirectory(prefix="xiio-native-core-") as d:
            root = Path(d)
            digest = self.valid_profile(root)
            env = self.runtime_env(root)
            lock = root / "core-release.lock.json"
            with patch.dict(os.environ, env, clear=False), patch.object(installer_adapter, "HERE", root):
                with installer_adapter.child_bundle.bundle_apply_custody(
                    lock, approved_lock_sha256=digest, env=env
                ):
                    observed = installer_adapter.handle({"action": "bundle_inspect"})
                    self.assertEqual(observed["phase"], "APPLY_IN_PROGRESS")
                    self.assertTrue(observed["do_not_retry"])
                    self.assertFalse(observed["retry_allowed"])
                    with self.assertRaisesRegex(Exception, "BUNDLE_APPLY_ALREADY_IN_PROGRESS"):
                        installer_adapter.handle({
                            "action": "bundle_apply", "lock_sha256": digest, "approved": True
                        })

    def test_inspection_snapshot_holds_shared_custody_against_writer_start(self):
        with tempfile.TemporaryDirectory(prefix="xiio-native-core-") as d:
            root = Path(d)
            digest = self.valid_profile(root)
            env = self.runtime_env(root)
            lock = root / "core-release.lock.json"
            with patch.dict(os.environ, env, clear=False), patch.object(installer_adapter, "HERE", root):
                with installer_adapter.child_bundle.bundle_inspection_custody(
                    lock, approved_lock_sha256=digest, env=env
                ) as custody:
                    observed = installer_adapter.child_bundle.inspect_bundle_install(
                        lock, approved_lock_sha256=digest, env=env, custody=custody
                    )
                    self.assertEqual(observed["state"], "NOT_INSTALLED")
                    with self.assertRaisesRegex(Exception, "BUNDLE_APPLY_ALREADY_IN_PROGRESS"):
                        with installer_adapter.child_bundle.bundle_apply_custody(
                            lock, approved_lock_sha256=digest, env=env
                        ):
                            pass

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
