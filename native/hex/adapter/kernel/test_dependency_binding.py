import hashlib,json,os,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from xiio_installer.manifest import load_manifest
from xiio_installer.transaction import apply_install
from xiio_installer.dependency_binding import compile_dependency_binding_receipt,DependencyBindingError
class T(unittest.TestCase):
 def test_exact_installed_export_becomes_non_authoritative_dependency_receipt(self):
  root=Path(tempfile.mkdtemp());payload=root/"payload";payload.mkdir();(payload/"provider.mjs").write_text("export const ok=true;")
  data=(payload/"provider.mjs").read_bytes();sha=hashlib.sha256(data).hexdigest();manifest_path=root/"manifest.json"
  manifest_path.write_text(json.dumps({"schema_version":"xiio-installer-product-manifest-v1","profile_id":"p","product_id":"node-product","display_name":"Node","version":"v","channel":"stable","fixture":False,
   "dependency_id":"node-authority","owner_repo":"owner/node","accepted_generation":"a"*40,"runtime_exports":{"provider_module":{"destination_scope":"xdg_data","destination":"xi/node/provider.mjs"}},
   "payload":[{"source":"provider.mjs","sha256":sha,"size":len(data),"destination_scope":"xdg_data","destination":"xi/node/provider.mjs","mode":"0644","overwrite":"backup_replace"}]}))
  env={"HOME":str(root/"home"),"XDG_DATA_HOME":str(root/"data"),"XDG_CONFIG_HOME":str(root/"config"),"XDG_STATE_HOME":str(root/"state"),"XDG_CACHE_HOME":str(root/"cache")}
  m=load_manifest(manifest_path);receipt=apply_install(m,payload,root/"install-receipt.json",env)
  out=compile_dependency_binding_receipt(m,receipt,env,binding_receipt_path=root/"binding.json");self.assertEqual(out["state"],"BOUND");self.assertEqual(out["dependency_id"],"node-authority");self.assertEqual(out["accepted_generation"],"a"*40);self.assertEqual(out["binding_receipt_path"],str((root/"binding.json").resolve()));self.assertEqual(out["fields"]["provider_module"],str((root/"data/xi/node/provider.mjs").resolve()));self.assertFalse(out["effect_authority"])
 def test_export_must_name_installed_manifest_destination(self):
  root=Path(tempfile.mkdtemp());p=root/"m.json";p.write_text(json.dumps({"schema_version":"xiio-installer-product-manifest-v1","profile_id":"p","product_id":"x","display_name":"X","version":"v","channel":"stable","fixture":False,"dependency_id":"d","owner_repo":"owner/repo","accepted_generation":"a"*40,"runtime_exports":{"bad":{"destination_scope":"xdg_data","destination":"x"}},"payload":[{"source":"x","sha256":"0"*64,"size":0,"destination_scope":"xdg_data","destination":"x"}]}));m=load_manifest(p)
  with self.assertRaisesRegex(DependencyBindingError,"NOT_INSTALLED"):compile_dependency_binding_receipt(m,{"schema_version":"xiio-installer-receipt-v1","product_id":"x","version":"v","entries":[]},{"HOME":str(root)},binding_receipt_path=root/"binding.json")
if __name__=="__main__":unittest.main()
