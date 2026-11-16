import tempfile,unittest
from pathlib import Path
from native.hex.adapter.kernel.xiio_installer.runtime_profile import load_runtime_profile
from native.hex.adapter.kernel.xiio_installer.runtime_config import materialize_runtime_config,RuntimeConfigError
class RuntimeConfigTests(unittest.TestCase):
 def profile(self,root):
  p=root/"profile.json";p.write_text('{"schema_version":"xiio-installer-runtime-profile-v1","profile_id":"demo","generation":"g1","product_id":"demo","services":[],"dependencies":[],"default_permissions":[],"optional_permissions":["SERVER_CONFIG_UPDATE"],"update_policy_default":"MANUAL"}')
  return load_runtime_profile(p)
 def test_private_atomic_exact_config(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);out=materialize_runtime_config(self.profile(root),bindings={"XIIO_A":"/installed/a","XIIO_B":"generation:1"},destination="xi-io/demo/runtime.env",grants=["SERVER_CONFIG_UPDATE"],xdg_config_home=root/"config")
   target=root/"config/xi-io/demo/runtime.env";self.assertEqual(target.read_text(),"XIIO_A=/installed/a\nXIIO_B=generation:1\n");self.assertEqual(target.stat().st_mode&0o777,0o600);self.assertTrue(out["readback_verified"]);self.assertFalse(out["effect_authority"])
 def test_refuses_ungranted_or_executable_values(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);p=self.profile(root)
   with self.assertRaisesRegex(RuntimeConfigError,"NOT_GRANTED"):materialize_runtime_config(p,bindings={"XIIO_A":"x"},destination="x.env",grants=[],xdg_config_home=root/"config")
   with self.assertRaisesRegex(RuntimeConfigError,"VALUE_INVALID"):materialize_runtime_config(p,bindings={"XIIO_A":"x\nEVIL=y"},destination="x.env",grants=["SERVER_CONFIG_UPDATE"],xdg_config_home=root/"config")
if __name__=="__main__":unittest.main()
