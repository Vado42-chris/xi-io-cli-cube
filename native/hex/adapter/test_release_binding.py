import hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import sys
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'kernel'))
from native.hex.adapter.release_binding import install_from_release_binding,install_from_distribution_reader
from native.hex.adapter.child_bundle import BundleError

class ReleaseBindingTests(unittest.TestCase):
 def fixture(self):
  td=tempfile.TemporaryDirectory(); root=Path(td.name); lock=root/'bundle.json'
  manifest=root/'manifest.json'; manifest.write_text(json.dumps({"schema_version":"xiio-installer-product-manifest-v1","profile_id":"release-binding-test","product_id":"product-demo","display_name":"Product Demo","version":"1.0.0","channel":"fixture","fixture":True,"payload":[{"source":"demo.bin","sha256":"0000000000000000000000000000000000000000000000000000000000000000","size":1,"destination_scope":"xdg_data","destination":"xi-io/demo/demo.bin","mode":"0644","overwrite":"fail"}]}))
  msha=hashlib.sha256(manifest.read_bytes()).hexdigest()
  lock.write_text(json.dumps({"schema_version":"xiio-installer-bundle-profile-v1","profile_id":"demo","fixture":True,"products":[{"role":"demo","product_id":"product-demo","manifest":"manifest.json","manifest_sha256":msha,"depends_on":[],"payload_urls":{"demo.bin":"https://releases.example.test/demo.bin"}}]},separators=(',',':')))
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

 def test_framework_distribution_reader_is_authority_source(self):
  td,lock,r,a=self.fixture();self.addCleanup(td.cleanup)
  binding={"schema":"xiio.release-distribution-lock/v1","release_ref":r["release_ref"],
   "product_ref":"product-demo","consumer_ref":"consumer:hex","release_generation":"g1",
   "approved_lock_sha256":r["approved_lock_sha256"],"manifest_ref":"manifest:demo:g1",
   "provider_hosts":["releases.example.test"],"lifecycle":"DISTRIBUTABLE",
   "adopter_current":True,"effect_authority":False,"installed":False}
  reads=[]
  def reader(**coords): reads.append(coords); return binding
  env={"XDG_STATE_HOME":str(lock.parent/"state"),"XDG_DATA_HOME":str(lock.parent/"data"),"XDG_CONFIG_HOME":str(lock.parent/"config"),"XDG_CACHE_HOME":str(lock.parent/"cache")}
  with patch('native.hex.adapter.release_binding.install_bundle',return_value={"state":"INSTALLED_BYTES_VERIFIED","profile_id":"demo","roles":["demo"]}) as install:
   out=install_from_distribution_reader(lock,product_ref="product-demo",consumer_ref="consumer:hex",
      read_release_distribution=reader,env=env,fetch=lambda *_:None)
   self.assertEqual(out["state"],"INSTALLED_BYTES_VERIFIED")
   receipt=json.loads(Path(out["release_distribution_receipt"]).read_text())
   self.assertEqual(receipt["release_generation"],"g1")
   self.assertEqual(receipt["product_ref"],"product-demo")
   self.assertEqual(receipt["consumer_ref"],"consumer:hex")
   self.assertEqual(receipt["approved_lock_sha256"],r["approved_lock_sha256"])
   self.assertTrue(receipt["readback_verified"])
   self.assertEqual(reads,[{"product_ref":"product-demo","consumer_ref":"consumer:hex"}])
   self.assertEqual(install.call_args.kwargs["allowed_hosts"],frozenset({"releases.example.test"}))

 def test_framework_distribution_substitution_refuses_before_install(self):
  td,lock,r,a=self.fixture();self.addCleanup(td.cleanup)
  base={"schema":"xiio.release-distribution-lock/v1","release_ref":r["release_ref"],
   "product_ref":"product-demo","consumer_ref":"consumer:hex","release_generation":"g1",
   "approved_lock_sha256":r["approved_lock_sha256"],"manifest_ref":"manifest:demo:g1",
   "provider_hosts":["releases.example.test"],"lifecycle":"DISTRIBUTABLE",
   "adopter_current":True,"effect_authority":False,"installed":False}
  cases=[({"product_ref":"other"},"BUNDLE_RELEASE_PRODUCT_MISMATCH"),
         ({"consumer_ref":"other"},"BUNDLE_RELEASE_CONSUMER_MISMATCH"),
         ({"lifecycle":"CANDIDATE"},"BUNDLE_RELEASE_DISTRIBUTION_NOT_CURRENT"),
         ({"adopter_current":False},"BUNDLE_RELEASE_DISTRIBUTION_NOT_CURRENT"),
         ({"effect_authority":True},"BUNDLE_RELEASE_DISTRIBUTION_NOT_CURRENT"),
         ({"installed":True},"BUNDLE_RELEASE_DISTRIBUTION_NOT_CURRENT"),
         ({"approved_lock_sha256":"a"*64},"BUNDLE_RELEASE_LOCK_DIGEST_MISMATCH"),
         ({"provider_hosts":["evil.example.test"]},"BUNDLE_URL_NOT_APPROVED")]
  for patching,code in cases:
   binding={**base,**patching}
   with self.subTest(code=code),patch('native.hex.adapter.release_binding.install_bundle') as install:
    with self.assertRaisesRegex(BundleError,code):
     install_from_distribution_reader(lock,product_ref="product-demo",consumer_ref="consumer:hex",
       read_release_distribution=lambda **_:binding)
    install.assert_not_called()

if __name__=="__main__":unittest.main()
