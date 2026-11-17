from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "native/hex/adapter/kernel"))

from native.hex.adapter.framework_release_reader import build_framework_release_distribution_reader
from native.hex.adapter.child_bundle import BundleError

COMPOSED = r"""
export async function readReleaseDistribution({product_ref,consumer_ref}) {
 if(product_ref==='product:stale') throw Error('ADOPTER_GENERATION_STALE');
 return {schema:'xiio.release-distribution-lock/v1',product_ref,consumer_ref,
  release_generation:'gen-7',approved_lock_sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  provider_hosts:['releases.example.com'],lifecycle:'DISTRIBUTABLE',adopter_current:true,
  effect_authority:false,installed:false,entrypoint_qualification_ref:'qual:7'};
}
"""

LEGACY_COMPILER_ONLY = r"""
export async function compileReleaseDistributionLock() { return {}; }
"""

class FrameworkReleaseReaderTests(unittest.TestCase):
    def test_exact_installed_framework_composed_reader_is_used(self):
        with tempfile.TemporaryDirectory() as td:
            module=Path(td)/"release-distribution-reader.mjs"; module.write_text(COMPOSED)
            reader=build_framework_release_distribution_reader(framework_release_distribution_module=module)
            out=reader(product_ref="product:alpha",consumer_ref="consumer:hex")
            self.assertEqual(out["schema"],"xiio.release-distribution-lock/v1")
            self.assertEqual(out["product_ref"],"product:alpha")
            self.assertEqual(out["consumer_ref"],"consumer:hex")
            self.assertEqual(out["entrypoint_qualification_ref"],"qual:7")

    def test_framework_refusal_is_not_reimplemented_or_weakened(self):
        with tempfile.TemporaryDirectory() as td:
            module=Path(td)/"release-distribution-reader.mjs"; module.write_text(COMPOSED)
            reader=build_framework_release_distribution_reader(framework_release_distribution_module=module)
            with self.assertRaisesRegex(BundleError,"BUNDLE_FRAMEWORK_RELEASE_READER_REFUSED"):
                reader(product_ref="product:stale",consumer_ref="consumer:hex")

    def test_legacy_compiler_without_composed_reader_is_refused(self):
        with tempfile.TemporaryDirectory() as td:
            module=Path(td)/"release-distribution-reader.mjs"; module.write_text(LEGACY_COMPILER_ONLY)
            reader=build_framework_release_distribution_reader(framework_release_distribution_module=module)
            with self.assertRaisesRegex(BundleError,"BUNDLE_FRAMEWORK_RELEASE_READER_REFUSED"):
                reader(product_ref="product:alpha",consumer_ref="consumer:hex")

    def test_module_must_be_absolute_regular_nonsymlink(self):
        with self.assertRaisesRegex(BundleError,"PATH_REQUIRED"):
            build_framework_release_distribution_reader(
                framework_release_distribution_module=Path("relative.mjs"))

if __name__ == "__main__":
    unittest.main()
