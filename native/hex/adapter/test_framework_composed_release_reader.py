from pathlib import Path
import tempfile,unittest
from native.hex.adapter.framework_release_reader import build_framework_release_distribution_reader
MODULE="""export async function readReleaseDistribution({product_ref,consumer_ref}){return {schema:'xiio.release-distribution-lock/v1',product_ref,consumer_ref,release_generation:'g1',approved_lock_sha256:'a'.repeat(64),provider_hosts:['releases.example.com'],lifecycle:'DISTRIBUTABLE',adopter_current:true,effect_authority:false,installed:false}}"""
class ComposedReaderTests(unittest.TestCase):
 def test_hex_supplies_only_coordinates_to_installed_framework_reader(self):
  with tempfile.TemporaryDirectory() as td:
   module=Path(td)/'release-distribution-reader.mjs';module.write_text(MODULE)
   reader=build_framework_release_distribution_reader(framework_release_distribution_module=module)
   out=reader(product_ref='product:a',consumer_ref='consumer:hex')
   self.assertEqual(out['product_ref'],'product:a');self.assertEqual(out['consumer_ref'],'consumer:hex')
 def test_bare_compiler_export_refuses(self):
  with tempfile.TemporaryDirectory() as td:
   module=Path(td)/'release-distribution-lock.mjs';module.write_text("export async function compileReleaseDistributionLock(){}")
   reader=build_framework_release_distribution_reader(framework_release_distribution_module=module)
   with self.assertRaisesRegex(Exception,'BUNDLE_FRAMEWORK_RELEASE_READER_REFUSED'): reader(product_ref='product:a',consumer_ref='consumer:hex')
if __name__=='__main__':unittest.main()
