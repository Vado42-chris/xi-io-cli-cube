from pathlib import Path
import hashlib, json, subprocess
from unittest.mock import patch
from native.hex.adapter.child_bundle import BundleError
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
 def test_shared_release_reader_isolates_three_product_profiles(self):
  # Labels identify interested consumer lanes; IDs and records are fixture-only.
  # VR-PC Stage asset readback is a separate downstream transaction.
  lanes=(('publisher','fixture:release-a'),('sam-law','fixture:release-b'),('vr-pc','fixture:release-c'))
  fixture=Path(__file__).resolve().parents[1]/'fixtures'/'framework-runtime-cfe2776'
  source=json.loads((fixture/'SOURCE.json').read_text())
  def pinned(name):
   relative='scripts/lib/'+name
   target=fixture/relative
   self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(),source['files'][relative]['sha256'])
   return target
  module=pinned('release-distribution-reader.mjs')
  pinned('release-distribution-lock.mjs')
  owner=pinned('release-authoritative-readback.mjs')
  writer="""
import {persistAcceptedRelease,persistCurrentAdopter,persistEntrypointQualification} from OWNER_MODULE;
const {product_ref,consumer_ref,release_generation,mode,seed}=JSON.parse(process.argv[1]);
const release_ref='fixture:record:'+seed;
const approved_lock_sha256=seed.repeat(64);
const row={product_ref,release_ref,release_generation,approved_lock_sha256,provider_hosts:['releases.example.test'],effect_authority:false};
persistAcceptedRelease({...row,schema:'xiio.framework.distributable-release-projection/v1',
 artifact_refs:['fixture:artifact:'+seed],manifest_refs:['fixture:manifest:'+seed],
 qualification_ref:'fixture:qualification:'+seed,lifecycle:'DISTRIBUTABLE'});
if (mode==='complete') persistCurrentAdopter({...row,schema:'xiio.framework.release-adopter-lock/v1',
 adopter_lock_ref:'fixture:adopter:'+seed,consumer_ref,currentness_ref:'fixture:current:'+seed,state:'ADOPTED_CURRENT'});
persistEntrypointQualification({schema:'xiio.framework.entrypoint-qualification/v1',
 state:'QUALIFIED',artifact_generation:release_generation,entrypoints:[],qualification_digest:approved_lock_sha256,
 effect_authority:false,provider_effect:false},{product_ref});
""".replace('OWNER_MODULE',json.dumps(owner.as_uri()))
  consumer='consumer:hex'
  with tempfile.TemporaryDirectory() as td, patch.dict('os.environ',{'XDG_STATE_HOME':td}):
   read=build_framework_release_distribution_reader(framework_release_distribution_module=module)
   def seed(product, digit, mode):
    request=dict(product_ref=product,consumer_ref=consumer,release_generation=digit*40,mode=mode,seed=digit)
    result=subprocess.run(['node','--input-type=module','-e',writer,json.dumps(request)],capture_output=True,text=True,timeout=15)
    self.assertEqual(result.returncode,0,result.stderr)
   def refused(product, wanted_consumer=consumer):
    with self.assertRaisesRegex(BundleError,'BUNDLE_FRAMEWORK_RELEASE_READER_REFUSED'):
     read(product_ref=product,consumer_ref=wanted_consumer)
   def reopened(product,digit):
    result=read(product_ref=product,consumer_ref=consumer)
    self.assertEqual((result['product_ref'],result['consumer_ref']), (product,consumer))
    self.assertEqual(result['release_generation'],digit*40)
    self.assertEqual(result['approved_lock_sha256'],digit*64)
    self.assertFalse(result['effect_authority'])
    self.assertFalse(result['installed'])
   for i,(label,product) in enumerate(lanes,1):
    with self.subTest(product=label):
     refused(product)
     digit=str(i)
     seed(product,digit,'release-only')
     refused(product)
     seed(product,digit,'complete')
     reopened(product,digit)
     refused(product,'consumer:wrong')
   seed(lanes[1][1],'4','release-only')
   refused(lanes[1][1]) # stale adopter from SAM must not be borrowed or carried forward
   reopened(lanes[0][1],'1')
   reopened(lanes[2][1],'3')

if __name__=='__main__':unittest.main()
