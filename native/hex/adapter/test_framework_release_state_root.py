from pathlib import Path
import os,tempfile,unittest
from unittest.mock import patch
from native.hex.adapter.framework_release_reader import build_framework_release_distribution_reader
MODULE="""export async function readReleaseDistribution({product_ref,consumer_ref}){return {schema:'xiio.release-distribution-lock/v1',product_ref,consumer_ref,state_root:process.env.XDG_STATE_HOME||null}}"""
class StateRootTests(unittest.TestCase):
 def test_installed_framework_reader_receives_hex_state_root(self):
  with tempfile.TemporaryDirectory() as td:
   module=Path(td)/'reader.mjs';module.write_text(MODULE)
   state=str(Path(td)/'state')
   with patch.dict(os.environ,{'XDG_STATE_HOME':state},clear=False):
    out=build_framework_release_distribution_reader(framework_release_distribution_module=module)(product_ref='product:a',consumer_ref='consumer:hex')
   self.assertEqual(out['state_root'],state)
 def test_unrelated_environment_is_not_forwarded(self):
  with tempfile.TemporaryDirectory() as td:
   module=Path(td)/'reader.mjs';module.write_text("export async function readReleaseDistribution(){return {secret:process.env.SHOULD_NOT_CROSS||null}}" )
   with patch.dict(os.environ,{'SHOULD_NOT_CROSS':'secret'},clear=False):
    out=build_framework_release_distribution_reader(framework_release_distribution_module=module)(product_ref='p',consumer_ref='c')
   self.assertIsNone(out['secret'])
if __name__=='__main__':unittest.main()
