import hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from native.hex.adapter.release_binding import install_from_release_binding
from native.hex.adapter.child_bundle import BundleError

class ReleaseBindingTests(unittest.TestCase):
 def fixture(self):
  td=tempfile.TemporaryDirectory(); root=Path(td.name); lock=root/'bundle.json'
  manifest=root/'manifest.json'; manifest.write_text(json.dumps({"schema_version":"xiio-installer-product-manifest-v1","profile_id":"release-binding-test","product_id":"product-demo","display_name":"Product Demo","version":"1.0.0","channel":"fixture","fixture":True,"payload":[]}))
  msha=hashlib.sha256(manifest.read_bytes()).hexdigest()
  lock.write_text(json.dumps({"schema_version":"xiio-installer-bundle-profile-v1","profile_id":"demo","fixture":True,"products":[{"role":"demo","product_id":"product-demo","manifest":"manifest.json","manifest_sha256":msha,"depends_on":[],"payload_urls":{}}]},separators=(',',':')))
  sha=hashlib.sha256(lock.read_bytes()).hexdigest()
  release={"schema":"xiio.framework.distributable-release-projection/v1","release_ref":"release:1","product_ref":"product-demo","release_generation":"g1","approved_lock_sha256":sha,"provider_hosts":["releases.example.test"],"lifecycle":"DISTRIBUTABLE","effect_authority":False}
  adopter={"schema":"xiio.framework.release-adopter-lock/v1","adopter_lock_ref":"adopter:hex:1","consumer_ref":"consumer:hex","product_ref":"product-demo","release_ref":"release:1","release_generation":"g1","approved_lock_sha256":sha,"provider_hosts":["releases.example.test"],"state":"ADOPTED_CURRENT","effect_authority":False}
  return td,lock,release,adopter
 def test_exact_binding_reaches_existing_installer(self):
  td,lock,r,a=self.fixture();self.addCleanup(td.cleanup)
  with patch('native.hex.adapter.release_binding.install_bundle',return_value={"state":"INSTALLED"}) as install:
   out=install_from_release_binding(lock,release=r,adopter=a,expected_product_ref="product-demo")
   self.assertEqual(out["state"],"INSTALLED")
   self.assertEqual(install.call_args.kwargs["allowed_hosts"],frozenset({"releases.example.test"}))
 def test_refuses_missing_stale_wrong_or_substituted_binding_before_install(self):
  cases=[]
  td,lock,r,a=self.fixture();self.addCleanup(td.cleanup)
  cases.extend([
   ({**r,"lifecycle":"CANDIDATE"},a,"BUNDLE_RELEASE_NOT_DISTRIBUTABLE"),
   (r,{**a,"state":"STALE"},"BUNDLE_ADOPTER_LOCK_CURRENT_REQUIRED"),
   ({**r,"product_ref":"product-other"},a,"BUNDLE_RELEASE_PRODUCT_MISMATCH"),
   (r,{**a,"release_generation":"old"},"BUNDLE_RELEASE_ADOPTER_BINDING_MISMATCH"),
   (r,{**a,"provider_hosts":["evil.example.test"]},"BUNDLE_RELEASE_HOST_BINDING_MISMATCH"),
  ])
  for rr,aa,code in cases:
   with self.subTest(code=code),patch('native.hex.adapter.release_binding.install_bundle') as install:
    with self.assertRaisesRegex(BundleError,code):
     install_from_release_binding(lock,release=rr,adopter=aa,expected_product_ref="product-demo")
    install.assert_not_called()
if __name__=="__main__":unittest.main()
