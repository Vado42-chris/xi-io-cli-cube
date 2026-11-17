import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from native.hex.adapter.kernel.xiio_installer.manifest import (
    ManifestError,
    load_manifest,
    verify_payload,
)

ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "framework-runtime-cfe2776"
OWNER_REF = "cfe2776b08e1768882f95884fd52576e48f0550c"


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


class FrameworkPhysicalChainFixtureTests(unittest.TestCase):
    def test_exact_framework_owner_bytes_and_manifest_are_bound(self):
        source = json.loads((ROOT / "SOURCE.json").read_text(encoding="utf-8"))
        self.assertEqual(source["schema"], "xiio.hex.framework-runtime-source-adoption/v1")
        self.assertEqual(source["state"], "ACCEPTED_OWNER_BYTES_PACKAGED_FOR_PHYSICAL_CONSUMER_TEST")
        self.assertEqual(source["owner_repository"], "Vado42-chris/xi-io.net")
        self.assertEqual(source["owner_ref"], OWNER_REF)
        self.assertEqual(source["classification"], "TEST_DISTRIBUTION_FIXTURE_NOT_RUNTIME_AUTHORITY")
        self.assertFalse(source["effect_authority"])
        self.assertFalse(source["provider_effect"])
        self.assertFalse(source["billing_effect_authority"])

        for relative, expected in source["files"].items():
            with self.subTest(relative=relative):
                target = ROOT / relative
                self.assertTrue(target.is_file())
                self.assertFalse(target.is_symlink())
                data = target.read_bytes()
                self.assertEqual(len(data), expected["size"])
                self.assertEqual(hashlib.sha256(data).hexdigest(), expected["sha256"])
                self.assertEqual(git_blob(data), expected["git_blob"])

        manifest = load_manifest(ROOT / "framework-runtime.manifest.json")
        self.assertFalse(manifest.fixture)
        self.assertEqual(manifest.product_id, "xiio-framework-runtime")
        self.assertEqual(manifest.raw["dependency_id"], "framework-runtime")
        self.assertEqual(manifest.raw["owner_repo"], "Vado42-chris/xi-io.net")
        self.assertEqual(manifest.raw["accepted_generation"], OWNER_REF)
        self.assertEqual(
            set(manifest.raw["runtime_exports"]),
            {"current_assignment_module", "release_distribution_module"},
        )
        verified = verify_payload(manifest, ROOT)
        self.assertEqual(len(verified), len(source["files"]))
        by_source = {entry.source: entry for entry in manifest.entries}
        self.assertEqual(set(by_source), set(source["files"]))
        for relative, expected in source["files"].items():
            entry = by_source[relative]
            self.assertEqual(entry.sha256, expected["sha256"])
            self.assertEqual(entry.size, expected["size"])
            self.assertEqual(entry.destination, expected["destination"])
            self.assertEqual(entry.mode, 0o644)

    def test_substituted_framework_source_refuses_before_install(self):
        with tempfile.TemporaryDirectory() as td:
            copy = Path(td) / "fixture"
            shutil.copytree(ROOT, copy)
            target = copy / "scripts/lib/release-distribution-reader.mjs"
            target.write_text(target.read_text(encoding="utf-8") + "// substituted\n", encoding="utf-8")
            manifest = load_manifest(copy / "framework-runtime.manifest.json")
            with self.assertRaisesRegex(ManifestError, "payload (size|digest) mismatch"):
                verify_payload(manifest, copy)


if __name__ == "__main__":
    unittest.main()
