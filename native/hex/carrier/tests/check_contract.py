import json,pathlib,unittest
root=pathlib.Path(__file__).resolve().parents[1]
class Contract(unittest.TestCase):
 def test_local_only(self):
  s=(root/'src-tauri/src/lib.rs').read_text();self.assertIn('WebviewUrl::App',s);self.assertNotIn('WebviewUrl::External',s);self.assertIn('on_navigation',s)
 def test_fixed_python_no_shell(self):
  s=(root/'src-tauri/src/transport.rs').read_text();self.assertIn('let mut cmd = Command::new("/usr/bin/python3");',s);self.assertIn('cmd.arg("-I").arg("-B").arg(&adapter);',s);self.assertIn('.env_clear()',s);self.assertNotIn('.kill(',s);self.assertNotIn('Command::new("sh")',s);self.assertIn('try_lock()',s)
 def test_permissions(self):
  c=json.loads((root/'src-tauri/capabilities/hex-local.json').read_text());self.assertNotIn('remote',c);self.assertEqual(c['permissions'],[])
  c=json.loads((root/'src-tauri/tauri.conf.json').read_text());self.assertTrue(c['bundle']['active']);self.assertNotIn('devUrl',c['build']);self.assertTrue(c['app']['withGlobalTauri'])
 def test_existing_window_contract(self):
  s=(root/'src-tauri/src/lib.rs').read_text()
  for action in ['state','drag','minimize','maximize','close','resize']:self.assertIn('"'+action+'"',s)
  self.assertIn('native_product_window',s)
 def test_finite_request(self):
  s=(root/'src-tauri/src/protocol.rs').read_text();self.assertIn('deny_unknown_fields',s)
  for action in ['Inspect','Prepare','Readback','Apply','Rollback']:self.assertIn(action,s)
if __name__=='__main__':unittest.main()
