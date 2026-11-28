#!/usr/bin/env python3
"""Qualification of the existing CLI composer with disposable Git source trees."""
import ast, hashlib, json, pathlib, shutil, subprocess, sys, tempfile, unittest

COMPOSER = pathlib.Path(__file__).resolve().with_name("compose-cli-packaged-source.py")
SOURCE = COMPOSER.read_text()
FILES = next(ast.literal_eval(n.value) for n in ast.parse(SOURCE).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='FILES' for t in n.targets))
MISSING = {'src/local-ops.mjs','src/sdk-provider-state.mjs','src/sdk/audhd-command.mjs','src/sdk/tool-verb-fidelity.mjs','src/sdk/local-work-packet.mjs','src/sdk/qualified-command-executor.mjs','src/sdk/local-worker-host.mjs','config/batches/starter-regression-20261031.json'}

def hash_bytes(b): return hashlib.sha256(b).hexdigest()

def snapshot(p): return {str(x.relative_to(p)):hash_bytes(x.read_bytes()) for x in p.rglob('*') if x.is_file() and not x.is_symlink()}

class Composition(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='cube-composer-')
        self.base=pathlib.Path(self.tmp.name)
        self.src=self.base/'cli'; self.src.mkdir()
        self.hex=self.base/'cube'/'native'/'hex'; self.hex.mkdir(parents=True)
        self.dest=self.hex/'cli-source'; self.dest.mkdir()
        shutil.copyfile(COMPOSER,self.hex/COMPOSER.name)
        for rel in FILES: self.put(self.dest/rel,'incumbent synthetic payload: '+rel)
        self.put(self.dest/'install.mjs',"// --packaged-source\nconst PAYLOAD_FILES=Object.freeze(['previous']);\n")
        self.put(self.dest/'SOURCE.json',json.dumps({'current_packaged_payload':{'ref':'a'*40},'offline_installer_successor':{'sha256':'0'*64}}))
        self.put(self.dest/'packaged-source.json','incumbent manifest')
        self.put(self.hex/'download-install-cli.py',f'SOURCE_SHA="{"a"*40}"\nINSTALLER_SHA="{"b"*64}"\nMANIFEST_SHA="{"c"*64}"\nFILES=["previous"]\n')
        self.put(self.hex/'COMPOSED-packaged-source.receipt.json','incumbent receipt')
        subprocess.run(['git','init','-q',str(self.src)],check=True)
    def tearDown(self): self.tmp.cleanup()
    def put(self,p,s): p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
    def populate(self,missing=()):
        for rel in FILES:
            if rel not in missing: self.put(self.src/rel,'candidate synthetic payload: '+rel)
        subprocess.run(['git','-C',str(self.src),'add','.'],check=True)
        subprocess.run(['git','-C',str(self.src),'-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-qm','synthetic source shape'],check=True)
    def run_composer(self):
        return subprocess.run([sys.executable,str(self.hex/COMPOSER.name),str(self.src)],capture_output=True,text=True,timeout=10)
    def unchanged(self,before,r):
        self.assertNotEqual(r.returncode,0)
        after=snapshot(self.hex)
        changed=sorted(k for k in set(before)|set(after) if before.get(k)!=after.get(k))
        self.assertEqual(changed,[],f'exit={r.returncode}; stderr={r.stderr.strip()}; changed={changed}')
    def test_missing_eight_from_target_tree_shape(self):
        self.populate(MISSING); before=snapshot(self.hex)
        r=self.run_composer();self.assertIn('MISSING_PAYLOAD_FILE:',r.stderr);self.unchanged(before,r)
    def test_last_payload_missing(self):
        self.populate({FILES[-1]});before=snapshot(self.hex)
        r=self.run_composer();self.assertIn('MISSING_PAYLOAD_FILE:',r.stderr);self.unchanged(before,r)
    def test_untracked_required_payload_is_not_exact_head(self):
        self.populate({FILES[-1]});self.put(self.src/FILES[-1],'untracked supplement');before=snapshot(self.hex)
        r=self.run_composer();self.unchanged(before,r)
    def test_absent_adapter(self):
        self.populate();(self.dest/'install.mjs').unlink();before=snapshot(self.hex)
        r=self.run_composer();self.assertIn('HEX_INSTALL_ADAPTATION_MISSING',r.stderr);self.unchanged(before,r)
    def test_bad_source_metadata(self):
        self.populate();self.put(self.dest/'SOURCE.json','not JSON');before=snapshot(self.hex)
        r=self.run_composer();self.unchanged(before,r)
    def test_missing_pin_rewrite(self):
        self.populate();self.put(self.hex/'download-install-cli.py','FILES=["previous"]\n');before=snapshot(self.hex)
        r=self.run_composer();self.unchanged(before,r)
    def test_complete_source_candidate(self):
        self.populate();r=self.run_composer();self.assertEqual(r.returncode,0,r.stderr)
        manifest=json.loads((self.dest/'packaged-source.json').read_text())
        receipt=json.loads((self.hex/'COMPOSED-packaged-source.receipt.json').read_text())
        provenance=json.loads((self.dest/'SOURCE.json').read_text())
        source_sha=subprocess.check_output(['git','-C',str(self.src),'rev-parse','HEAD'],text=True).strip()
        self.assertEqual(manifest['source_sha'],source_sha)
        self.assertEqual(receipt['source_sha'],source_sha)
        self.assertEqual(provenance['current_packaged_payload']['ref'],source_sha)
        self.assertEqual(set(manifest['files']),set(FILES))
        for rel in FILES:
            data=(self.dest/rel).read_bytes()
            self.assertEqual(data,(self.src/rel).read_bytes())
            self.assertEqual(manifest['files'][rel],{'sha256':hash_bytes(data),'size':len(data)})
        self.assertEqual(receipt['manifest_sha256'],hash_bytes((self.dest/'packaged-source.json').read_bytes()))
        self.assertEqual(receipt['installer_sha256'],hash_bytes((self.dest/'install.mjs').read_bytes()))
        self.assertEqual(receipt['state'],'COMPOSED_NOT_ACTIVATED')
    def test_dirty_source_refusal(self):
        self.populate();self.put(self.src/FILES[0],'modified');before=snapshot(self.hex)
        r=self.run_composer();self.assertIn('CLI_WORKTREE_DIRTY',r.stderr);self.unchanged(before,r)

if __name__=='__main__':unittest.main(verbosity=2)
