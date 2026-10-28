"""Hostile tests for published, uncredentialed Cube distribution qualification.

The entire test suite is synthetic, offline and non-publishing.
"""
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/qualify-public-core-six.py"
spec = importlib.util.spec_from_file_location("xiio_core_public_release", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

TAG = "xiio-core-six-20261028-alpha1"


class PublicCoreRelease(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory(prefix="xiio-core-release-hvt-")
        self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name)
        self.contents = {}
        products = []
        for role in module.ROLES:
            b = ("synthetic payload for " + role).encode()
            self.contents[role + ".bin"] = b
            manifest = {
                "schema_version": "xiio-installer-product-manifest-v1",
                "profile_id": "core-six",
                "product_id": "xi-io-" + role,
                "display_name": "XI-IO " + role,
                "version": "0.1.0-alpha.1",
                "channel": "alpha",
                "fixture": False,
                "payload": [{
                    "source": role + ".bin", "sha256": module.sha(b),
                    "size": len(b), "destination_scope": "xdg_data",
                    "destination": "xi-io/core/" + role + "/" + role + ".bin",
                    "mode": "0644", "overwrite": "fail",
                }],
            }
            raw = json.dumps(manifest, sort_keys=True).encode()
            (self.root / (role + ".json")).write_bytes(raw)
            self.contents[role + ".json"] = raw
            products.append({
                "role": role, "product_id": manifest["product_id"],
                "manifest": role + ".json",
                "manifest_sha256": module.sha(raw),
                "depends_on": [] if role == "cli" else ["cli"],
                "payload_urls": {role + ".bin":
                    module.RELEASE_ASSET_PREFIX + TAG + "/" + role + ".bin"},
            })
        lock = {
            "schema_version": "xiio-installer-bundle-profile-v1",
            "profile_id": "core-six", "fixture": False,
            "products": products,
        }
        self.lock = self.root / "core-release.lock.json"
        self.set_lock(lock)
        self.contents["PROVENANCE.json"] = b'{"schema":"xiio.core-public-provenance/v1"}'
        self.contents["SHA256SUMS"] = b"synthetic-checksum-index\n"

    def set_lock(self, lock):
        raw = json.dumps(lock, sort_keys=True).encode()
        self.lock.write_bytes(raw)
        self.contents["core-release.lock.json"] = raw

    def release(self, *, omit=(), additional=()):
        expected = module.qualify_local(self.lock, TAG)["expected_assets"]
        assets = []
        for name, (_, length) in expected.items():
            if name not in omit:
                assets.append({
                    "name": name, "size": length, "state": "uploaded",
                    "content_type": "application/octet-stream",
                    "browser_download_url":
                    module.RELEASE_ASSET_PREFIX + TAG + "/" + name,
                })
        for name in module.META_ASSETS:
            assets.append({
                "name": name, "size": len(self.contents[name]), "state": "uploaded",
                "content_type": "application/octet-stream",
                "browser_download_url": module.RELEASE_ASSET_PREFIX + TAG + "/" + name,
            })
        assets.extend(additional)
        return {
            "tag_name": TAG, "draft": False,
            "published_at": "2026-10-28T12:00:00Z",
            "assets": assets,
        }

    def test_exact_six_role_profile_qualifies_locally(self):
        result = module.qualify_local(self.lock, TAG)
        self.assertEqual(result["role_count"], 6)
        self.assertEqual(set(result["roles"]), set(module.ROLES))
        self.assertEqual(len(result["expected_assets"]), 13)
        self.assertEqual(result["state"], "LOCAL_LOCK_AND_OWNER_MANIFESTS_VALID")
        self.assertEqual(result["owner_distribution_approval"], "NOT_VERIFIED")
        self.assertEqual(result["native_install_readback"], "NOT_VERIFIED")

    def test_missing_lock_cannot_fake_a_release(self):
        self.lock.unlink()
        with self.assertRaisesRegex(module.Refused, "CORE_RELEASE_LOCK_UNPUBLISHED"):
            module.qualify_local(self.lock, TAG)

    def test_source_is_not_a_distribution_asset(self):
        lock = json.loads(self.lock.read_bytes())
        lock["products"][0]["payload_urls"]["bins.bin"] = (
            "https://raw.githubusercontent.com/Vado42-chris/xi-io_bins/main/index.js")
        self.set_lock(lock)
        with self.assertRaisesRegex(module.Refused, "CORE_PAYLOAD_NOT_IN_PUBLIC_CUBE_RELEASE"):
            module.qualify_local(self.lock, TAG)

    def test_private_repo_release_url_refused(self):
        lock = json.loads(self.lock.read_bytes())
        lock["products"][0]["payload_urls"]["bins.bin"] = (
            "https://github.com/Vado42-chris/xi-io_bins/releases/download/" +
            TAG + "/bins.bin")
        self.set_lock(lock)
        with self.assertRaisesRegex(module.Refused, "CORE_PAYLOAD_NOT_IN_PUBLIC_CUBE_RELEASE"):
            module.qualify_local(self.lock, TAG)

    def test_wrong_release_tag_and_encoded_name_refused(self):
        with self.assertRaisesRegex(module.Refused, "PUBLIC_CORE_RELEASE_TAG_INVALID"):
            module.qualify_local(self.lock, "../bad")
        for name in ("%2e%2e", "something%2Felse", "wrong name"):
            with self.subTest(name=name), self.assertRaisesRegex(
                    module.Refused, "CORE_PAYLOAD_ASSET_NAME_UNSAFE"):
                module.payload_asset(module.RELEASE_ASSET_PREFIX + TAG + "/" + name, TAG)

    def test_owner_release_requires_exact_assets(self):
        local = module.qualify_local(self.lock, TAG)
        with self.assertRaisesRegex(module.Refused, "PUBLIC_CORE_RELEASE_ASSETS_MISSING"):
            module.published_metadata(local, self.release(omit=("cli.bin",)))

    def test_unpublished_or_draft_release_refused(self):
        local = module.qualify_local(self.lock, TAG)
        data = self.release()
        data["draft"] = True
        with self.assertRaisesRegex(module.Refused, "PUBLIC_CORE_RELEASE_NOT_PUBLISHED"):
            module.published_metadata(local, data)

    def test_stale_asset_size_refused(self):
        local = module.qualify_local(self.lock, TAG)
        data = self.release()
        data["assets"][0]["size"] += 1
        with self.assertRaisesRegex(module.Refused, "PUBLIC_CORE_RELEASE_ASSET_METADATA_MISMATCH"):
            module.published_metadata(local, data)

    def test_duplicate_asset_refused(self):
        local = module.qualify_local(self.lock, TAG)
        data = self.release()
        data["assets"].append(dict(data["assets"][0]))
        with self.assertRaisesRegex(module.Refused, "PUBLIC_CORE_RELEASE_DUPLICATE_ASSET"):
            module.published_metadata(local, data)

    def test_metadata_is_not_byte_acceptance(self):
        local = module.qualify_local(self.lock, TAG)
        observed = module.published_metadata(local, self.release())
        self.assertEqual(observed["state"], "PUBLIC_RELEASE_METADATA_ONLY")
        self.assertEqual(observed["verified_assets"], 0)
        self.assertEqual(observed["native_install_readback"], "NOT_VERIFIED")

    def test_unapproved_extra_source_asset_is_refused(self):
        local = module.qualify_local(self.lock, TAG)
        unknown = {
            "name": "private-source.tar.gz", "size": 100,
            "state": "uploaded", "content_type": "application/gzip",
            "browser_download_url": module.RELEASE_ASSET_PREFIX + TAG +
                                    "/private-source.tar.gz",
        }
        with self.assertRaisesRegex(module.Refused, "PUBLIC_CORE_RELEASE_UNREVIEWED_EXTRA_OR_MISSING_METADATA_ASSETS"):
            module.published_metadata(local, self.release(additional=(unknown,)))

    def test_missing_public_provenance_is_refused(self):
        local = module.qualify_local(self.lock, TAG)
        data = self.release()
        data["assets"] = [a for a in data["assets"] if a["name"] != "PROVENANCE.json"]
        with self.assertRaisesRegex(module.Refused, "PUBLIC_CORE_RELEASE_UNREVIEWED_EXTRA_OR_MISSING_METADATA_ASSETS"):
            module.published_metadata(local, data)

    def test_all_public_bytes_reopened_and_verified(self):
        local = module.qualify_local(self.lock, TAG)
        calls = []
        def fetch(url, dest, size, hosts):
            name = url.rsplit("/", 1)[-1]
            self.assertIn(name, self.contents)
            self.assertEqual(size, len(self.contents[name]))
            self.assertIn("github.com", hosts)
            dest.write_bytes(self.contents[name])
            calls.append(name)
        with patch.object(module.child_bundle, "_fetch_https", side_effect=fetch):
            observed = module.published_metadata(local, self.release(), verify_bytes=True)
        self.assertEqual(observed["state"], "PUBLIC_RELEASE_BYTES_VERIFIED")
        self.assertEqual(observed["verified_assets"], 13)
        self.assertEqual(set(calls), set(self.contents) - module.META_ASSETS)
        self.assertEqual(observed["native_install_readback"], "NOT_VERIFIED")

    def test_tampered_download_refused_even_when_metadata_matches(self):
        local = module.qualify_local(self.lock, TAG)
        def fetch(url, dest, size, hosts):
            name = url.rsplit("/", 1)[-1]
            b = self.contents[name]
            dest.write_bytes(bytes([b[0] ^ 1]) + b[1:])
        with patch.object(module.child_bundle, "_fetch_https", side_effect=fetch):
            with self.assertRaisesRegex(module.Refused, "PUBLIC_CORE_RELEASE_BYTES_MISMATCH"):
                module.published_metadata(local, self.release(), verify_bytes=True)


if __name__ == "__main__":
    unittest.main()
