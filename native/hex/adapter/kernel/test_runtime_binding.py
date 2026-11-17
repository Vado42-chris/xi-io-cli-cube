import json,os,tempfile,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from xiio_installer.runtime_profile import load_runtime_profile
from xiio_installer.runtime_binding import load_runtime_binding_profile,materialize_runtime_bindings,runtime_binding_destination,RuntimeBindingError
G="a"*40
class T(unittest.TestCase):
 def setUp(self):
  self.d=Path(tempfile.mkdtemp());self.rp=self.d/"runtime.json";self.bp=self.d/"bindings.json";self.env=self.d/"runtime.env"
  self.rp.write_text(json.dumps({"schema_version":"xiio-installer-runtime-profile-v1","profile_id":"p","generation":"g","product_id":"product","default_permissions":[],"optional_permissions":[],"update_policy_default":"MANUAL","services":[],"dependencies":[{"dependency_id":"node-authority","owner_repo":"owner/node","accepted_generation":G,"materializer":"installed-receipt","required_for_permissions":[]}]}))
  self.bp.write_text(json.dumps({"schema_version":"xiio.product-runtime-binding-profile/v1","product_id":"product","destination":"xi-io/product/runtime.env","bindings":[{"key":"PRODUCT_NODE_MODULE","source_role":"node-authority","source_field":"provider_module"}]}))
 def receipt(self,**kw):
  import hashlib
  generation=kw.get("accepted_generation",G);provider=self.d/"provider.mjs";provider.write_text("export const provider=true;\\n");provider.chmod(0o644)
  receipt=self.d/("binding-"+generation[:8]+".json")
  row={"schema":"xiio.installer-dependency-binding-receipt/v1","state":"BOUND","dependency_id":"node-authority","owner_repo":"owner/node","accepted_generation":generation,"binding_receipt_path":str(receipt.resolve()),"runtime_exports":{"provider_module":{"destination_scope":"xdg_data","destination":"xi-io/node/provider.mjs","sha256":hashlib.sha256(provider.read_bytes()).hexdigest(),"mode":"0644"}},"fields":{"provider_module":str(provider.resolve())},"provider_effect":False,"effect_authority":False}
  receipt.write_text(json.dumps(row));receipt.chmod(0o600);return str(receipt)
 def test_destination_is_profile_relative_under_xdg_config(self):
  b=load_runtime_binding_profile(self.bp);target=runtime_binding_destination(b,{"HOME":str(self.d/"home"),"XDG_CONFIG_HOME":str(self.d/"cfg")})
  self.assertEqual(target,(self.d/"cfg/xi-io/product/runtime.env").resolve())
 def test_module_dependency_needs_no_fake_systemd_unit(self):
  p=load_runtime_profile(self.rp);self.assertIsNone(p.dependencies[0].expected_unit)
 def test_materializes_private_exact_receipt_value(self):
  p=load_runtime_profile(self.rp);b=load_runtime_binding_profile(self.bp);r=materialize_runtime_bindings(p,b,{"node-authority":self.receipt()},self.env)
  self.assertEqual(self.env.read_text(),f"PRODUCT_NODE_MODULE={self.d / 'provider.mjs'}\n");self.assertEqual(os.stat(self.env).st_mode&0o777,0o600);self.assertEqual(r["effect_authority"],False)
 def test_substituted_generation_refuses_before_write(self):
  p=load_runtime_profile(self.rp);b=load_runtime_binding_profile(self.bp)
  with self.assertRaisesRegex(RuntimeBindingError,"RUNTIME_BINDING_RECEIPT_UNVERIFIED"): materialize_runtime_bindings(p,b,{"node-authority":self.receipt(accepted_generation="b"*40)},self.env)
  self.assertFalse(self.env.exists())
 def test_undeclared_role_and_missing_field_refuse(self):
  p=load_runtime_profile(self.rp);raw=json.loads(self.bp.read_text());raw["bindings"][0]["source_role"]="foreign";self.bp.write_text(json.dumps(raw));b=load_runtime_binding_profile(self.bp)
  with self.assertRaisesRegex(RuntimeBindingError,"UNDECLARED"): materialize_runtime_bindings(p,b,{},self.env)
if __name__=="__main__":unittest.main()
