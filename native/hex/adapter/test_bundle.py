"""Actual existing-kernel child bundle tests, disposable paths, zero network/host effects."""
import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "kernel"))

from child_bundle import (BundleError, load_bundle_profile,
                                   install_bundle)
from xiio_installer.transaction import rollback


def sha(value):
    return hashlib.sha256(value).hexdigest()


class BundleFixture:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(exist_ok=True)
        self.env = {
            "HOME": str(root),
            "XDG_CONFIG_HOME": str(root / "config"),
            "XDG_DATA_HOME": str(root / "data"),
            "XDG_STATE_HOME": str(root / "state"),
            "XDG_CACHE_HOME": str(root / "cache"),
        }
        self.payloads = {}
        self.rows = []

    def child(self, role, *, depends_on=(), bytes_=None, destination=None,
              fixture=True, overwrite="fail"):
        b = bytes_ if bytes_ is not None else (role + " delivered\n").encode()
        url = "https://github.com/xiio-test/releases/" + role + ".bin"
        self.payloads[url] = b
        name = role + ".manifest.json"
        source = role + ".bin"
        product_id = "xi-io-" + role
        manifest = {
            "schema_version": "xiio-installer-product-manifest-v1",
            "profile_id": "core-test",
            "product_id": product_id,
            "display_name": "XIIO " + role,
            "version": "0.0.1-fixture" if fixture else "0.0.1",
            "channel": "fixture" if fixture else "alpha",
            "fixture": fixture,
            "payload": [{
                "source": source,
                "sha256": sha(b),
                "size": len(b),
                "destination_scope": "xdg_data",
                "destination": destination or "xi-io/" + role + "/" + source,
                "mode": "0644",
                "overwrite": overwrite,
            }],
        }
        raw = json.dumps(manifest, sort_keys=True).encode()
        (self.root / name).write_bytes(raw)
        self.rows.append({
            "role": role, "product_id": product_id,
            "manifest": name, "manifest_sha256": sha(raw),
            "depends_on": list(depends_on), "payload_urls": {source: url},
        })
        return self

    def lock(self, *, fixture=True):
        raw = json.dumps({
            "schema_version": "xiio-installer-bundle-profile-v1",
            "profile_id": "core-test", "fixture": fixture,
            "products": self.rows,
        }, sort_keys=True).encode()
        path = self.root / "bundle.lock.json"
        path.write_bytes(raw)
        return path, sha(raw)

    def fetch(self, url, output, limit):
        if url not in self.payloads:
            raise ValueError("UNEXPECTED_FIXTURE_URL")
        content = self.payloads[url]
        if len(content) > limit:
            raise ValueError("OVER_LIMIT")
        output.write_bytes(content)


class BundleTests(unittest.TestCase):
    def fixture(self):
        td = tempfile.TemporaryDirectory(prefix="xiio-bundle-fixture-")
        self.addCleanup(td.cleanup)
        return BundleFixture(Path(td.name))

    def test_two_children_install_in_dependency_order_and_manual_rollback(self):
        f = self.fixture()
        f.child("bins", depends_on=("cli",)).child("cli")
        lock, digest = f.lock()
        p = load_bundle_profile(lock)
        self.assertEqual(p["ordered_roles"], ("cli", "bins"))
        r = install_bundle(lock, approved_lock_sha256=digest,
                           env=f.env, fetch=f.fetch)
        self.assertEqual(r["state"], "INSTALLED_BYTES_VERIFIED")
        self.assertEqual(r["receipt_count"], 2)
        self.assertFalse(r["runtime_qualified"])
        self.assertFalse(r["device_connected"])
        self.assertFalse(r["authority_granted"])
        self.assertFalse(r["child_services_started"])
        cli = Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin"
        bins = Path(f.env["XDG_DATA_HOME"]) / "xi-io/bins/bins.bin"
        self.assertEqual(cli.read_bytes(), f.payloads["https://github.com/xiio-test/releases/cli.bin"])
        self.assertEqual(bins.read_bytes(), f.payloads["https://github.com/xiio-test/releases/bins.bin"])
        receipts = list((Path(f.env["XDG_STATE_HOME"]) /
                         "xi-io/installer/bundles/core-test").glob("*.receipt.json"))
        self.assertEqual(len(receipts), 2)
        for item in reversed(receipts):
            rollback(item, f.env)
        self.assertFalse(cli.exists())
        self.assertFalse(bins.exists())

    def test_digest_mismatch_blocks_every_product_before_install(self):
        f = self.fixture()
        f.child("cli").child("ward")
        lock, digest = f.lock()
        url = "https://github.com/xiio-test/releases/ward.bin"
        f.payloads[url] = b"X" * len(f.payloads[url])
        with self.assertRaisesRegex(BundleError, "BUNDLE_DOWNLOADED_SIZE_MISMATCH|BUNDLE_DOWNLOADED_DIGEST_MISMATCH"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin").exists())

    def test_wrong_approval_never_fetches(self):
        f = self.fixture()
        f.child("cli")
        lock, _digest = f.lock()
        def do_not_fetch(*_):
            raise AssertionError("DOWNLOAD_OR_EFFECT_BEFORE_APPROVAL")
        with self.assertRaisesRegex(BundleError, "BUNDLE_APPROVAL_DIGEST_MISMATCH"):
            install_bundle(lock, approved_lock_sha256="a"*64,
                           env=f.env, fetch=do_not_fetch)

    def test_loop_and_missing_dependency_rejected_before_effect(self):
        f = self.fixture()
        f.child("cli", depends_on=("bins",)).child("bins", depends_on=("cli",))
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_DEPENDENCY_CYCLE"):
            load_bundle_profile(lock)
        f.rows[1]["depends_on"] = ["elsewhere"]
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_DEPENDENCY_NOT_IN_PROFILE"):
            load_bundle_profile(lock)

    def test_nonfixture_baseline_refuses_missing_products(self):
        f = self.fixture()
        f.child("cli", fixture=False)
        lock, _ = f.lock(fixture=False)
        with self.assertRaisesRegex(BundleError, "BUNDLE_BASELINE_REQUIRED_PRODUCT_MISSING"):
            load_bundle_profile(lock)

    def test_duplicate_destinations_rejected(self):
        f = self.fixture()
        f.child("cli", destination="xi-io/shared/common.bin")
        f.child("bins", destination="xi-io/shared/common.bin")
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_DESTINATION_COLLISION"):
            load_bundle_profile(lock)

    def test_http_urls_and_embedded_credentials_rejected(self):
        f = self.fixture()
        f.child("cli")
        f.rows[0]["payload_urls"]["cli.bin"] = "http://github.com/xiio-test/cli.bin"
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_URL_NOT_APPROVED"):
            load_bundle_profile(lock)
        f.rows[0]["payload_urls"]["cli.bin"] = "https://user:token@github.com/xiio-test/cli.bin"
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_URL_NOT_APPROVED"):
            load_bundle_profile(lock)

    def test_manifest_tamper_rejected_before_fetch(self):
        f = self.fixture()
        f.child("cli")
        lock, _ = f.lock()
        manifest = f.root / "cli.manifest.json"
        manifest.write_text(manifest.read_text().replace("XIIO cli", "XIIO tampered"))
        with self.assertRaisesRegex(BundleError, "BUNDLE_MANIFEST_DIGEST_MISMATCH"):
            load_bundle_profile(lock)

    def test_symlinked_manifest_rejected(self):
        f = self.fixture()
        f.child("cli")
        lock, _ = f.lock()
        (f.root / "cli.manifest.json").rename(f.root / "real-manifest.json")
        (f.root / "cli.manifest.json").symlink_to(f.root / "real-manifest.json")
        with self.assertRaisesRegex(BundleError, "BUNDLE_MANIFEST_PATH_ESCAPES_LOCK"):
            load_bundle_profile(lock)

    def test_legacy_backup_replace_not_automatically_admitted(self):
        f = self.fixture()
        f.child("cli", overwrite="backup_replace")
        lock, _ = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_REPLACEMENT_NOT_ADMITTED"):
            load_bundle_profile(lock)

    def test_bounded_mid_bundle_failure_rolls_back_first_product(self):
        f = self.fixture()
        f.child("cli").child("ward", depends_on=("cli",))
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_APPLY_FAILED_ROLLED_BACK"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env,
                           fetch=f.fetch, fail_after_product=1)
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin").exists())
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/ward/ward.bin").exists())

    def test_existing_user_file_is_not_overwritten(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        original = Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin"
        original.parent.mkdir(parents=True)
        original.write_text("PRESERVE USER BYTES\n")
        with self.assertRaisesRegex(Exception, "destination|already exists|overwrite|BUNDLE"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(original.read_bytes(), b"PRESERVE USER BYTES\n")


if __name__ == "__main__":
    unittest.main()
