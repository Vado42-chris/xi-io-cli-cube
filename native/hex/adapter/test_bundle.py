"""Actual existing-kernel child bundle tests, disposable paths, zero network/host effects."""
import hashlib
import json
import multiprocessing as mp
import os
import sys
import tempfile
import unittest
from unittest.mock import patch
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

    def lock(self, *, fixture=True, profile_mode="suite", product_root_role=None):
        profile = {
            "schema_version": "xiio-installer-bundle-profile-v1",
            "profile_id": "core-test", "fixture": fixture,
            "products": self.rows,
        }
        if profile_mode == "product":
            profile["profile_mode"] = "product"
            profile["product_root_role"] = product_root_role
        raw = json.dumps(profile, sort_keys=True).encode()
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


    def test_product_profile_installs_only_selected_root_and_transitive_dependencies(self):
        f = self.fixture()
        f.child("bins", fixture=False).child("ward", fixture=False, depends_on=("bins",)).child(
            "sam-law", fixture=False, depends_on=("ward",)
        )
        lock, digest = f.lock(fixture=False, profile_mode="product", product_root_role="sam-law")
        profile = load_bundle_profile(lock)
        self.assertEqual(profile["profile_mode"], "product")
        self.assertEqual(profile["product_root_role"], "sam-law")
        self.assertEqual(profile["ordered_roles"], ("bins", "ward", "sam-law"))
        self.assertEqual(set(profile["products"]), {"bins", "ward", "sam-law"})
        self.assertEqual(len(profile["products"]), 3)
        fetched = []
        def fetch(url, output, limit):
            fetched.append(url)
            f.fetch(url, output, limit)
        result = install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=fetch)
        self.assertEqual(result["receipt_count"], 3)
        self.assertEqual(len(fetched), 3)
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/unrelated/unrelated.bin").exists())

    def test_precommand_noexec_before_download_and_first_product_effect(self):
        f = self.fixture()
        f.child("cli")
        manifest_path = f.root / "cli.manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["payload"][0]["mode"] = "0755"
        raw = json.dumps(manifest, sort_keys=True).encode()
        manifest_path.write_bytes(raw)
        f.rows[0]["manifest_sha256"] = sha(raw)
        lock, digest = f.lock()
        fetched = []
        def not_fetched(*args):
            fetched.append(args)
            raise AssertionError("DOWNLOAD_WAS_ALLOWED_BEFORE_FILESYSTEM_PROOF")
        with patch("xiio_installer.transaction.subprocess.run",
                   side_effect=PermissionError("NTFS/noexec EACCES")) as launch:
            with self.assertRaisesRegex(BundleError, "BUNDLE_FILESYSTEM_UNQUALIFIED"):
                install_bundle(lock, approved_lock_sha256=digest,
                               env=f.env, fetch=not_fetched)
            launch.assert_called()
        self.assertEqual(fetched, [])
        state_root = Path(f.env["XDG_STATE_HOME"]) / "xi-io/installer/bundles/core-test"
        self.assertFalse(state_root.exists())
        self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / "xi-io/cli/cli.bin").exists())
        self.assertEqual(list(f.root.rglob(".xiio-fs-probe-*")), [])

    def test_precommand_must_cover_every_child_before_download(self):
        f = self.fixture()
        f.child("cli").child("bins", depends_on=("cli",))
        lock, digest = f.lock()
        checked = []
        def bounded_probe(manifests, roots, **kwargs):
            checked.extend((item[0].product_id, item[1]) for item in manifests)
            raise ValueError("UNQUALIFIED_SECOND_CHILD")
        with patch("child_bundle.qualify_precommand_manifests",
                   side_effect=bounded_probe):
            with self.assertRaises(ValueError):
                install_bundle(lock, approved_lock_sha256=digest,
                               env=f.env, fetch=lambda *_: self.fail("download before preflight"))
        self.assertEqual([item[0] for item in checked], ["xi-io-cli", "xi-io-bins"])

    def test_product_profile_refuses_extra_unrelated_role_instead_of_silently_installing_it(self):
        f = self.fixture()
        f.child("dependency").child("selected", depends_on=("dependency",)).child("unrelated")
        lock, _ = f.lock(profile_mode="product", product_root_role="selected")
        with self.assertRaisesRegex(BundleError, "BUNDLE_PRODUCT_PROFILE_NOT_EXACT_DEPENDENCY_CLOSURE"):
            load_bundle_profile(lock)

    def test_product_profile_requires_existing_selected_root(self):
        f = self.fixture()
        f.child("dependency")
        lock, _ = f.lock(profile_mode="product", product_root_role="missing")
        with self.assertRaisesRegex(BundleError, "BUNDLE_PRODUCT_ROOT_NOT_IN_PROFILE"):
            load_bundle_profile(lock)

    def test_product_profile_detects_transitive_missing_dependency_and_cycle(self):
        f = self.fixture()
        f.child("dependency", depends_on=("missing",)).child("selected", depends_on=("dependency",))
        lock, _ = f.lock(profile_mode="product", product_root_role="selected")
        with self.assertRaisesRegex(BundleError, "BUNDLE_DEPENDENCY_NOT_IN_PROFILE"):
            load_bundle_profile(lock)
        f.rows[0]["depends_on"] = ["selected"]
        lock, _ = f.lock(profile_mode="product", product_root_role="selected")
        with self.assertRaisesRegex(BundleError, "BUNDLE_DEPENDENCY_CYCLE"):
            load_bundle_profile(lock)

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

    def test_cube9_symlinked_xdg_state_root_refused_without_side_effects(self):
        f = self.fixture()
        outside = f.root / "outside"
        outside.mkdir()
        state_link = f.root / "symlinked_state"
        state_link.symlink_to(outside, target_is_directory=True)
        f.env["XDG_STATE_HOME"] = str(state_link)
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertFalse((outside / "xi-io").exists())

    def test_cube9_symlinked_intermediate_parent_refused_without_side_effects(self):
        f = self.fixture()
        outside = f.root / "outside"
        outside.mkdir()
        state_dir = Path(f.env["XDG_STATE_HOME"])
        state_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / "xi-io").symlink_to(outside, target_is_directory=True)
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertFalse((outside / "installer").exists())

    def test_cube9_symlinked_leaf_refused(self):
        f = self.fixture()
        outside = f.root / "outside"
        outside.mkdir()
        bundles_dir = Path(f.env["XDG_STATE_HOME"]) / "xi-io" / "installer" / "bundles"
        bundles_dir.mkdir(parents=True, exist_ok=True)
        (bundles_dir / "core-test").symlink_to(outside, target_is_directory=True)
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(len(list(outside.iterdir())), 0)

    def test_cube9_readonly_ancestor_refused(self):
        f = self.fixture()
        state_dir = Path(f.env["XDG_STATE_HOME"])
        state_dir.mkdir(parents=True, exist_ok=True)
        xiio_dir = state_dir / "xi-io"
        xiio_dir.mkdir(mode=0o500)
        f.child("cli")
        lock, digest = f.lock()
        # When non-root or when permissions fail at the OS level:
        with patch("os.mkdir", side_effect=PermissionError(13, "Permission denied")):
            with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
                install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)

    def test_cube9_file_ancestor_refused(self):
        f = self.fixture()
        state_dir = Path(f.env["XDG_STATE_HOME"])
        state_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / "xi-io").write_text("regular file")
        f.child("cli")
        lock, digest = f.lock()
        with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)

    def test_cube9_concurrent_symlink_swap_refused(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        real_open = os.open
        def hostile_open(path, flags, *args, **kwargs):
            if flags & os.O_NOFOLLOW and "installer" in str(path):
                raise OSError(40, "Too many levels of symbolic links")
            return real_open(path, flags, *args, **kwargs)
        with patch("os.open", side_effect=hostile_open):
            with self.assertRaisesRegex(BundleError, "BUNDLE_STATE_ROOT_UNTRUSTED"):
                install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)

    def test_cube9_normal_clean_path_creates_strict_state_root(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        r = install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(r["state"], "INSTALLED_BYTES_VERIFIED")
        state_root = Path(f.env["XDG_STATE_HOME"]) / "xi-io" / "installer" / "bundles" / "core-test"
        self.assertTrue(state_root.is_dir())
        self.assertFalse(state_root.is_symlink())
        self.assertEqual(state_root.stat().st_mode & 0o777, 0o700)

    def test_six_product_baseline_transaction_and_rollback(self):
        f = self.fixture()
        f.child("cli", fixture=False)
        f.child("ibal", depends_on=("cli",), fixture=False)
        f.child("switchboard", depends_on=("cli",), fixture=False)
        f.child("bins", depends_on=("cli",), fixture=False)
        f.child("ward", depends_on=("cli",), fixture=False)
        f.child("inbox", depends_on=("cli", "ward"), fixture=False)
        lock, digest = f.lock(fixture=False)
        p = load_bundle_profile(lock)
        self.assertEqual(len(p["ordered_roles"]), 6)
        self.assertEqual(p["ordered_roles"][0], "cli")
        self.assertGreater(p["ordered_roles"].index("inbox"), p["ordered_roles"].index("ward"))
        self.assertGreater(p["ordered_roles"].index("inbox"), p["ordered_roles"].index("cli"))
        res = install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        self.assertEqual(res["state"], "INSTALLED_BYTES_VERIFIED")
        self.assertEqual(res["receipt_count"], 6)
        for role in ("cli", "ibal", "switchboard", "bins", "ward", "inbox"):
            self.assertTrue((Path(f.env["XDG_DATA_HOME"]) / f"xi-io/{role}/{role}.bin").exists())
        receipts = sorted((Path(f.env["XDG_STATE_HOME"]) / "xi-io/installer/bundles/core-test").glob("*.receipt.json"))
        self.assertEqual(len(receipts), 6)
        for item in reversed(receipts):
            rollback(item, f.env)
        for role in ("cli", "ibal", "switchboard", "bins", "ward", "inbox"):
            self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / f"xi-io/{role}/{role}.bin").exists())

    def test_six_product_baseline_mid_transaction_rollback_cleans_prior_applied(self):
        f = self.fixture()
        f.child("cli", fixture=False)
        f.child("ibal", depends_on=("cli",), fixture=False)
        f.child("switchboard", depends_on=("cli",), fixture=False)
        f.child("bins", depends_on=("cli",), fixture=False)
        f.child("ward", depends_on=("cli",), fixture=False)
        f.child("inbox", depends_on=("cli", "ward"), fixture=False)
        lock, digest = f.lock(fixture=False)
        with self.assertRaisesRegex(BundleError, "BUNDLE_APPLY_FAILED_ROLLED_BACK"):
            install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch, fail_after_product=3)
        # All products must have been rolled back cleanly
        for role in ("cli", "ibal", "switchboard", "bins", "ward", "inbox"):
            self.assertFalse((Path(f.env["XDG_DATA_HOME"]) / f"xi-io/{role}/{role}.bin").exists())

    def test_two_process_overlapping_install_refused_via_cross_process_lock(self):
        f = self.fixture()
        f.child("cli")
        lock, digest = f.lock()
        barrier = mp.Queue()
        done = mp.Queue()
        p1 = mp.Process(target=_concurrency_worker, args=(lock, digest, f.env, barrier, done))
        p1.start()
        try:
            status = barrier.get(timeout=5)
            self.assertEqual(status, "LOCKED_AND_FETCHING")
            # Process 2 attempts concurrent install while Process 1 is in acquisition stage
            with self.assertRaisesRegex(BundleError, "BUNDLE_INSTALLATION_IN_PROGRESS"):
                install_bundle(lock, approved_lock_sha256=digest, env=f.env, fetch=f.fetch)
        finally:
            done.put("RELEASE")
            p1.join(timeout=5)


def _concurrency_worker(lock, digest, env, barrier, done):
    def slow_fetch(url, output, limit):
        barrier.put("LOCKED_AND_FETCHING")
        done.get(timeout=10)
        output.write_bytes(b"cli delivered\n")
    try:
        install_bundle(lock, approved_lock_sha256=digest, env=env, fetch=slow_fetch)
    except Exception as exc:
        barrier.put(f"ERROR: {exc}")


if __name__ == "__main__":
    unittest.main()
