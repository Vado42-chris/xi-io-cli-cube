import importlib.util,pathlib,tempfile,json,unittest,sys
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('delivery',ROOT/'download-install-cli.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
SOURCES={p:(ROOT.parent.parent/p).read_text() for p in m.DISCOVERY_FILES}
class Discovery(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='xiio-node-discovery-');self.root=pathlib.Path(self.tmp.name);self.home=self.root/'home';self.home.mkdir();self.cache=self.root/'cache';self.calls=[];self.original_which=m.shutil.which;self.original_get=m.get_file
  m.shutil.which=lambda name:None
  def fetch(carrier,name,source_path=None):self.calls.append(source_path);return SOURCES[source_path].encode()
  m.get_file=fetch
  for name in ['xiio_installer.discovery','xiio_installer']:sys.modules.pop(name,None)
 def tearDown(self):m.shutil.which=self.original_which;m.get_file=self.original_get;self.tmp.cleanup()
 def node(self,version):
  p=self.home/'.nvm/versions/node'/version/'bin/node';p.parent.mkdir(parents=True);p.write_text('metadata-only fixture; never execute');p.chmod(0o700);return p
 def test_path_runtime_is_preserved_without_discovery(self):
  m.shutil.which=lambda _: '/qualified/path/node';self.assertEqual(m.resolve_existing_node('a'*40,self.cache,self.home),'/qualified/path/node');self.assertEqual(self.calls,[])
 def test_existing_nvm_primitive_selects_highest_installed_candidate(self):
  self.node('v22.13.0');chosen=self.node('v24.11.1');self.assertEqual(m.resolve_existing_node('a'*40,self.cache,self.home),str(chosen));self.assertEqual(len(self.calls),3);self.assertEqual(chosen.read_text(),'metadata-only fixture; never execute')
 def test_verified_helper_cache_is_reused(self):
  chosen=self.node('v24.11.1');m.resolve_existing_node('a'*40,self.cache,self.home);self.assertEqual(m.resolve_existing_node('a'*40,self.cache,self.home),str(chosen));self.assertEqual(len(self.calls),3)
 def test_tampered_discovery_module_is_refused(self):
  self.node('v24.11.1');m.resolve_existing_node('a'*40,self.cache,self.home);p=self.cache/'runtime-discovery'/('a'*40)/'native/hex/adapter/install_preflight.py';p.write_text('tampered');self.assertRaisesRegex(RuntimeError,'DISCOVERY_SOURCE_CHANGED',m.resolve_existing_node,'a'*40,self.cache,self.home)
 def test_wrong_download_hash_never_imports_code(self):
  m.get_file=lambda *args,**kwargs:b'raise Exception("MUST_NOT_EXECUTE")';self.assertRaisesRegex(RuntimeError,'DISCOVERY_SOURCE_HASH_MISMATCH',m.resolve_existing_node,'a'*40,self.cache,self.home)
 def test_symlinked_nvm_candidate_is_not_selected(self):
  actual=self.root/'not-a-runtime';actual.write_text('fixture');actual.chmod(0o700);p=self.home/'.nvm/versions/node/v24.11.1/bin/node';p.parent.mkdir(parents=True);p.symlink_to(actual);self.assertNotEqual(m.resolve_existing_node('a'*40,self.cache,self.home),str(p))
unittest.main()
