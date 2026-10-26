from pathlib import Path
import hashlib,importlib.util,json,subprocess,unittest
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parent
PACKAGE=BASE/'native-source-adoption/tree/native/hex/carrier/src-tauri/target/release/bundle/deb/XI-IO HEX DEV_0.1.0-dev.7_amd64.deb'
sha=lambda b:hashlib.sha256(b).hexdigest()
class Binding(unittest.TestCase):
 def test_only_declared_identity_replacements(self):
  manifest=json.loads((ROOT/'bootstrap-migration.json').read_text());original=(ROOT/'reference-dev6/install-from-github.sh').read_bytes();self.assertEqual(sha(original),manifest['source_script_sha256']);expected=original.decode()
  for before,after in manifest['replacement_fields'].items():expected=expected.replace(before,after)
  self.assertEqual((ROOT/'install-from-github.sh').read_text(),expected);self.assertEqual(sha(expected.encode()),manifest.get('final_script_sha256',manifest['draft_script_sha256']))
 def test_embedded_guard_is_standalone_and_logic_unchanged(self):
  text=(ROOT/'install-from-github.sh').read_text();guard=text.split("<<'XIIO_GUARD'\n",1)[1].split('\nXIIO_GUARD\n',1)[0]+'\n';self.assertEqual(guard,(ROOT/'transaction-guard/apt-guard.py').read_text())
  expected=(ROOT/'reference-dev6/apt-guard.py').read_text()
  for before,after in json.loads((ROOT/'bootstrap-migration.json').read_text())['replacement_fields'].items():expected=expected.replace(before,after)
  self.assertEqual(guard,expected)
 def test_actual_built_package_metadata_and_guard_digest(self):
  manifest=json.loads((ROOT/'bootstrap-migration.json').read_text())['artifact'];self.assertEqual(PACKAGE.stat().st_size,manifest['size']);self.assertEqual(sha(PACKAGE.read_bytes()),manifest['sha256'])
  for field,want in [('Package','xi-io-hex-dev'),('Version','0.1.0-dev.7'),('Architecture','amd64')]:self.assertEqual(subprocess.check_output(['dpkg-deb','-f',str(PACKAGE),field],text=True).strip(),want)
  spec=importlib.util.spec_from_file_location('guard',ROOT/'transaction-guard/apt-guard.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g);self.assertEqual(g.digest_file(str(PACKAGE)),manifest['sha256'])
 def test_immutable_artifact_commit_is_bound(self):
  text=(ROOT/'install-from-github.sh').read_text();manifest=json.loads((ROOT/'bootstrap-migration.json').read_text());commit=manifest['artifact_commit'];self.assertRegex(commit,r'^[0-9a-f]{40}$');self.assertEqual(text.count('/'+commit+'/deliveries/'),1);self.assertNotIn('__PIN_IMMUTABLE_ARTIFACT_COMMIT__',text);self.assertNotIn('2b162224ab9ad0e1dbc128d41bdcd90ca16acac9',text);self.assertIn('DPkg::ConfigurePending=true',text);self.assertIn("0.1.0-dev.7 install ok installed",text)
if __name__=='__main__':unittest.main(verbosity=2)
