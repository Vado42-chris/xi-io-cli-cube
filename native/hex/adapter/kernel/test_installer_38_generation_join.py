import json,tempfile,unittest
from pathlib import Path
from .xiio_installer.runtime_profile import load_runtime_profile,RuntimeProfileError
G="a"*40
class Installer38GenerationJoinTests(unittest.TestCase):
 def write(self,root,*,dep_generation=G,service_generation=G,unit="xiio-provider.service",service_unit=None,omit_service_generation=False):
  row={"schema_version":"xiio-installer-runtime-profile-v1","profile_id":"p","generation":"f"*40,"product_id":"product","default_permissions":[],"optional_permissions":[],"update_policy_default":"MANUAL","dependencies":[{"dependency_id":"provider","owner_repo":"owner/provider","accepted_generation":dep_generation,"materializer":"install-provider","required_for_permissions":[],"expected_unit":unit}],"services":[{"service_id":"provider","unit":service_unit or unit,"health_url":"http://127.0.0.1:8870/health","required_permissions":[],"required":True,"generation_field":"installed_generation","declared_generation":service_generation}]}
  if omit_service_generation: row["services"][0].pop("declared_generation")
  p=root/"runtime.json";p.write_text(json.dumps(row));return p
 def test_dependency_service_generation_join_accepts_exact_owner_generation(self):
  with tempfile.TemporaryDirectory() as td:
   p=load_runtime_profile(self.write(Path(td)));self.assertEqual(p.dependencies[0].accepted_generation,p.services[0].declared_generation)
 def test_dependency_service_generation_mismatch_refuses(self):
  with tempfile.TemporaryDirectory() as td:
   with self.assertRaisesRegex(RuntimeProfileError,"DEPENDENCY_SERVICE_GENERATION_MISMATCH:provider"):load_runtime_profile(self.write(Path(td),service_generation="b"*40))
 def test_dependency_expected_unit_requires_declared_service(self):
  with tempfile.TemporaryDirectory() as td:
   with self.assertRaisesRegex(RuntimeProfileError,"DEPENDENCY_SERVICE_UNIT_UNDECLARED:provider"):load_runtime_profile(self.write(Path(td),service_unit="other.service"))
 def test_dependency_service_must_declare_component_generation(self):
  with tempfile.TemporaryDirectory() as td:
   with self.assertRaisesRegex(RuntimeProfileError,"DEPENDENCY_SERVICE_GENERATION_UNDECLARED:provider"):load_runtime_profile(self.write(Path(td),omit_service_generation=True))
if __name__=="__main__":unittest.main()
