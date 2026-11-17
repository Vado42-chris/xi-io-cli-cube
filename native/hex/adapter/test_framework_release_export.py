import hashlib,json,os,tempfile,unittest
from pathlib import Path
from native.hex.adapter.framework_release_export import (
    resolve_framework_release_distribution_module,
    FrameworkReleaseExportError,
)

class FrameworkReleaseExportTests(unittest.TestCase):
 def fixture(self):
  td=tempfile.TemporaryDirectory();root=Path(td.name)
  module=root/"release-distribution-lock.mjs";module.write_text("export const marker=true;\n")
  os.chmod(module,0o644)
  generation="a"*40
  receipt=root/"framework-runtime.binding.json"
  value={
   "schema":"xiio.installer-dependency-binding-receipt/v1","state":"BOUND",
   "dependency_id":"framework-runtime","owner_repo":"Vado42-chris/xi-io.net",
   "accepted_generation":generation,"binding_receipt_path":str(receipt.resolve()),
   "runtime_exports":{"release_distribution_module":{"sha256":hashlib.sha256(module.read_bytes()).hexdigest(),"mode":"0644"}},
   "fields":{"release_distribution_module":str(module.resolve())},
   "provider_effect":False,"effect_authority":False,
  }
  receipt.write_text(json.dumps(value));os.chmod(receipt,0o600)
  return td,receipt,module,generation,value

 def test_verified_persisted_binding_resolves_exact_framework_export(self):
  td,receipt,module,generation,_=self.fixture();self.addCleanup(td.cleanup)
  out=resolve_framework_release_distribution_module(receipt,expected_framework_generation=generation)
  self.assertEqual(out["state"],"VERIFIED")
  self.assertEqual(out["release_distribution_module"],str(module.resolve()))
  self.assertTrue(out["custody_verified"])
  self.assertFalse(out["effect_authority"])

 def test_refuses_stale_generation_tamper_missing_export_and_symlink(self):
  td,receipt,module,generation,value=self.fixture();self.addCleanup(td.cleanup)
  with self.assertRaisesRegex(FrameworkReleaseExportError,"FRAMEWORK_RUNTIME_BINDING_UNVERIFIED"):
   resolve_framework_release_distribution_module(receipt,expected_framework_generation="b"*40)
  module.write_text("tampered\n")
  with self.assertRaisesRegex(FrameworkReleaseExportError,"FRAMEWORK_RUNTIME_BINDING_UNVERIFIED"):
   resolve_framework_release_distribution_module(receipt,expected_framework_generation=generation)

  td2,receipt2,module2,generation2,value2=self.fixture();self.addCleanup(td2.cleanup)
  value2["runtime_exports"]={};value2["fields"]={}
  receipt2.write_text(json.dumps(value2));os.chmod(receipt2,0o600)
  with self.assertRaisesRegex(FrameworkReleaseExportError,"FRAMEWORK_RUNTIME_BINDING_UNVERIFIED"):
   resolve_framework_release_distribution_module(receipt2,expected_framework_generation=generation2)

  td3,receipt3,module3,generation3,value3=self.fixture();self.addCleanup(td3.cleanup)
  target=module3.with_name("target.mjs");module3.rename(target);module3.symlink_to(target)
  value3["runtime_exports"]["release_distribution_module"]["sha256"]=hashlib.sha256(target.read_bytes()).hexdigest()
  receipt3.write_text(json.dumps(value3));os.chmod(receipt3,0o600)
  with self.assertRaisesRegex(FrameworkReleaseExportError,"FRAMEWORK_RUNTIME_BINDING_UNVERIFIED"):
   resolve_framework_release_distribution_module(receipt3,expected_framework_generation=generation3)

if __name__=="__main__":unittest.main()
