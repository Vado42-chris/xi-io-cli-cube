from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "native/hex/adapter/kernel"))

from native.hex.adapter.framework_release_reader import build_framework_release_distribution_reader
from native.hex.adapter.child_bundle import BundleError


MODULE = r"""
export async function compileReleaseDistributionLock({product_ref,consumer_ref,readAcceptedRelease,readCurrentAdopter,readEntrypointQualification}) {
 const release=await readAcceptedRelease({product_ref});
 const adopter=await readCurrentAdopter({consumer_ref,product_ref});
 const qualification=await readEntrypointQualification({product_ref,release_generation:release.release_generation});
 if(qualification.artifact_generation!==release.release_generation) throw Error('ENTRYPOINT_QUALIFICATION_NOT_CURRENT');
 if(release.release_generation!==adopter.release_generation) throw Error('ADOPTER_GENERATION_STALE');
 return {schema:'xiio.release-distribution-lock/v1',product_ref,consumer_ref,
  release_generation:release.release_generation,approved_lock_sha256:release.approved_lock_sha256,
  provider_hosts:release.provider_hosts,lifecycle:'DISTRIBUTABLE',adopter_current:true,
  effect_authority:false,installed:false,entrypoint_qualification_ref:qualification.qualification_digest};
}
"""


class FrameworkReleaseReaderTests(unittest.TestCase):
    def test_exact_installed_framework_compiler_is_used(self):
        with tempfile.TemporaryDirectory() as td:
            module=Path(td)/"release-distribution-lock.mjs"; module.write_text(MODULE)
            calls=[]
            reader=build_framework_release_distribution_reader(
                framework_release_distribution_module=module,
                read_accepted_release=lambda **kw: calls.append(("release",kw)) or {
                    "release_generation":"gen-7","approved_lock_sha256":"a"*64,
                    "provider_hosts":["releases.example.com"],
                    "entrypoint_qualification_ref":"qual:7"},
                read_current_adopter=lambda **kw: calls.append(("adopter",kw)) or {
                    "release_generation":"gen-7"},
                read_entrypoint_qualification=lambda **kw: calls.append(("entrypoint",kw)) or {
                    "artifact_generation":"gen-7","qualification_digest":"qual:7"})
            out=reader(product_ref="product:alpha",consumer_ref="consumer:hex")
            self.assertEqual(out["schema"],"xiio.release-distribution-lock/v1")
            self.assertEqual(out["entrypoint_qualification_ref"],"qual:7")
            self.assertEqual(calls,[("release",{"product_ref":"product:alpha"}),
                                    ("adopter",{"consumer_ref":"consumer:hex","product_ref":"product:alpha"}),
                                    ("entrypoint",{"product_ref":"product:alpha","release_generation":"gen-7"})])

    def test_framework_refusal_is_not_reimplemented_or_weakened(self):
        with tempfile.TemporaryDirectory() as td:
            module=Path(td)/"release-distribution-lock.mjs"; module.write_text(MODULE)
            reader=build_framework_release_distribution_reader(
                framework_release_distribution_module=module,
                read_accepted_release=lambda **_: {"release_generation":"gen-7","approved_lock_sha256":"a"*64,"provider_hosts":["releases.example.com"]},
                read_current_adopter=lambda **_: {"release_generation":"gen-6"},
                read_entrypoint_qualification=lambda **_: {"artifact_generation":"gen-7","qualification_digest":"qual:7"})
            with self.assertRaisesRegex(BundleError,"BUNDLE_FRAMEWORK_RELEASE_COMPILATION_REFUSED"):
                reader(product_ref="product:alpha",consumer_ref="consumer:hex")

    def test_entrypoint_reader_is_mandatory(self):
        with tempfile.TemporaryDirectory() as td:
            module=Path(td)/"release-distribution-lock.mjs"; module.write_text(MODULE)
            with self.assertRaisesRegex(BundleError,"BUNDLE_ENTRYPOINT_QUALIFICATION_READER_UNBOUND"):
                build_framework_release_distribution_reader(
                    framework_release_distribution_module=module,
                    read_accepted_release=lambda **_: {},
                    read_current_adopter=lambda **_: {},
                    read_entrypoint_qualification=None)

    def test_module_must_be_absolute_regular_nonsymlink(self):
        with self.assertRaisesRegex(BundleError,"PATH_REQUIRED"):
            build_framework_release_distribution_reader(
                framework_release_distribution_module=Path("relative.mjs"),
                read_accepted_release=lambda **_: {},read_current_adopter=lambda **_: {},
                read_entrypoint_qualification=lambda **_: {})


if __name__ == "__main__":
    unittest.main()
