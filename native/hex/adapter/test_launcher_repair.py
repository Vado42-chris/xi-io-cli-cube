"""Real offline two-generation upstream fixture; no user install is accessed.
python3 native/hex/adapter/test_launcher_repair.py
Optional XIIO_REPAIR_FIXTURE_ROOT selects an independently checked exact checkout.
The fixture helper and source payload are upstream files, not a fake repair.
"""
import hashlib, importlib.util, json, os, shutil, subprocess, sys, time, unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
FIXTURE_ROOT=Path(os.environ.get('XIIO_REPAIR_FIXTURE_ROOT',HERE.parents[2]/'tests/fixtures/cli-launcher-repair-pr15')).resolve()
assert hashlib.sha256((FIXTURE_ROOT/'test/launcher_repair_fixture.py').read_bytes()).hexdigest()=='752eba08991d61165eb294928736cd2f676ca22791acc1d031e27462800dd692','Exact upstream fixture helper required'
spec=importlib.util.spec_from_file_location('launcher_repair_fixture',FIXTURE_ROOT/'test/launcher_repair_fixture.py')
fixture_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture_module)
Fixture=fixture_module.Fixture;NODE=fixture_module.NODE
SHA='61fd09c0d0de09fb2b3aec4e94b34d013cd35ddc60eb44f86443a5d2b5812a4d'
hash_bytes=lambda b:hashlib.sha256(b).hexdigest()
assert hash_bytes((FIXTURE_ROOT/'install.mjs').read_bytes())==SHA,'Exact independently qualified PR15 fixture required'


def snapshot(root):
    return {str(p.relative_to(root)):(p.stat().st_mode&0o777,hash_bytes(p.read_bytes()) if p.is_file() else None) for p in root.rglob('*')}


class LauncherRepairIntegration(unittest.TestCase):
    def setUp(self):
        self.fixture=Fixture();self.f=self.fixture.__enter__();self.home=self.f.home
        # Existing actual launcher intentionally differs from prefix/bin, like Aries.
        self.bin=self.home/'.local/bin';self.bin.mkdir(parents=True)
        self.launcher=self.bin/'xi-io-cli'
        self.original=("#!/bin/sh\n# Existing historical launcher requiring PATH Node\nP='"+str(self.f.prefix)+"'\nexec node \"$P/versions/$(cat \"$P/current\")/src/xiio.mjs\" \"$@\"\n").encode()
        self.launcher.write_bytes(self.original);self.launcher.chmod(0o755)
        self.before=snapshot(self.f.prefix)
        self.adapter=HERE/'installer_adapter.py'
        self.env={'HOME':str(self.home),'XDG_STATE_HOME':str(self.home/'state'),'PATH':'/usr/bin:/bin'}
    def tearDown(self):self.fixture.__exit__(None,None,None)
    def call(self,req,program=None):
        args=['/usr/bin/python3','-I',str(self.adapter)] if program is None else ['/usr/bin/python3','-I','-c',program]
        r=subprocess.run(args,input=json.dumps(req),text=True,capture_output=True,env=self.env,timeout=110)
        self.assertEqual(r.returncode,0,r.stderr)
        try:return json.loads(r.stdout)
        except ValueError:self.fail(r.stdout+r.stderr)
    def prepare(self,**extra):
        r=self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE,**extra})
        self.assertTrue(r['ok'],r);return r['result']
    def apply(self,p,**extra):
        return self.call({'action':'apply_repair','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True,**extra})
    def assert_no_effect(self):
        self.assertEqual(snapshot(self.f.prefix),self.before)
        self.assertEqual(self.launcher.read_bytes(),self.original)
        self.assertEqual(sorted(x.name for x in self.bin.iterdir()),['xi-io-cli'])
    def copy_adapter(self):
        target=self.home/'isolated-bundle'
        shutil.copytree(HERE,target/'adapter',ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(HERE.parent/'cli-source',target/'cli-source')
        self.adapter=target/'adapter/installer_adapter.py'
        return target
    def journal(self,p):return self.home/'state/xi-io/installer/operations'/(p['plan_id']+'-apply_repair.jsonl')

    def test_exact_pr15_and_packaged_install_transport_coexist(self):
        source=HERE.parent/'cli-source'
        self.assertEqual(hash_bytes((source/'launcher-repair.install.mjs').read_bytes()),SHA)
        self.assertNotEqual(hash_bytes((source/'install.mjs').read_bytes()),SHA)
        self.assertIn('--packaged-source',(source/'install.mjs').read_text())
        self.assertEqual((source/'launcher-repair.install.mjs').read_bytes(),(FIXTURE_ROOT/'install.mjs').read_bytes())

    def test_real_actual_launcher_two_generations_preserved_and_readback(self):
        broken=subprocess.run([str(self.launcher),'version'],env=self.f.env,capture_output=True)
        self.assertEqual(broken.returncode,127)
        p=self.prepare();self.assert_no_effect()
        self.assertEqual(p['kind'],'launcher_repair');self.assertEqual(p['phase'],'PREPARED_REPAIR_NOT_APPLIED')
        self.assertEqual(p['repair_source']['ref'],'0f2b444abbe8f7a99c5f4520b1222c568eba6dd1')
        self.assertTrue(p['preserved_generation']['current']);self.assertTrue(p['preserved_generation']['previous'])
        self.assertEqual(p['original_launcher_sha256'],hash_bytes(self.original))
        r=self.apply(p);self.assertTrue(r['ok'],r);v=r['result']
        self.assertEqual(v['phase'],'LAUNCHER_REPAIR_READBACK_VERIFIED')
        self.assertFalse(v['full_cli_acceptance']);self.assertFalse(v['rollback_available'])
        self.assertEqual(snapshot(self.f.prefix),self.before)
        self.assertEqual(Path(p['backup']).read_bytes(),self.original)
        self.assertIn(('exec '+"'"+NODE+"'").encode(),self.launcher.read_bytes())
        actual=subprocess.run([str(self.launcher),'version'],env=self.f.env,text=True,capture_output=True,timeout=30)
        self.assertEqual(actual.returncode,0,actual.stderr);self.assertTrue(json.loads(actual.stdout)['integrity_verified'])
        self.assertTrue(self.call({'action':'readback','plan_id':p['plan_id']})['ok'])
        self.assertFalse(self.apply(p)['ok'])
        self.assertFalse(self.call({'action':'rollback','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True})['ok'])

    def test_explicit_approval_required_and_strict_fields(self):
        p=self.prepare()
        for extra in [{'approved':False},{'approval_digest':'0'*64},{'node':NODE}]:
            self.assertFalse(self.apply(p,**extra)['ok'])
        self.assert_no_effect();self.assertFalse(self.journal(p).exists())
        for extra in [{'bin_dir':'.'},{'prefix':'.'},{'node':'node'},{'components':['cli']}]:
            self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE,**extra})['ok'])
        self.assert_no_effect()

    def test_stale_approved_node_rejected_before_canonical_effect(self):
        selected=self.home/'approved-node';shutil.copy2(NODE,selected)
        p=self.prepare(node=str(selected))
        changed=self.home/'changed-node';changed.write_bytes(b'changed after approval');changed.chmod(0o755);changed.replace(selected)
        r=self.apply(p);self.assertFalse(r['ok'],r);self.assertIn('NODE_CHANGED',r['error'])
        self.assert_no_effect();self.assertFalse(self.journal(p).exists())

    def test_stale_launcher_and_same_byte_inode_replacement_rejected(self):
        for change in ['bytes','identity']:
            with self.subTest(change=change):
                p=self.prepare()
                if change=='bytes':self.launcher.write_bytes(self.original+b'# peer edit\n')
                else:
                    replacement=self.bin/'replacement';replacement.write_bytes(self.original);replacement.chmod(0o755);replacement.replace(self.launcher)
                expected=self.launcher.read_bytes()
                r=self.apply(p);self.assertFalse(r['ok'],r);self.assertIn('LAUNCHER_CHANGED',r['error'])
                self.assertEqual(self.launcher.read_bytes(),expected);self.assertFalse(self.journal(p).exists())
                self.launcher.write_bytes(self.original)

    def test_stale_source_resource_rejected_before_effect(self):
        bundle=self.copy_adapter();p=self.prepare()
        with (bundle/'cli-source/launcher-repair.install.mjs').open('ab') as f:f.write(b'\n// changed\n')
        r=self.apply(p);self.assertFalse(r['ok'],r);self.assertIn('REPAIR_SOURCE_NOT_EXACT',r['error'])
        self.assert_no_effect();self.assertFalse(self.journal(p).exists())

    def test_stale_canonical_verifier_rejected_before_effect(self):
        bundle=self.copy_adapter();p=self.prepare()
        with (bundle/'cli-source/launcher-repair.runtime-integrity.mjs').open('ab') as f:f.write(b'\n// changed\n')
        self.assertFalse(self.apply(p)['ok']);self.assert_no_effect();self.assertFalse(self.journal(p).exists())

    def test_stale_pointer_and_receipt_payload_refuse_without_staging(self):
        p=self.prepare();current=self.f.prefix/'current';original=current.read_bytes()
        current.write_bytes((self.f.prefix/'previous').read_bytes())
        r=self.apply(p);self.assertFalse(r['ok'],r);self.assertIn('PRESERVATION_CHANGED',r['error'])
        current.write_bytes(original);self.assert_no_effect();self.assertFalse(self.journal(p).exists())
        payload=self.f.prefix/'versions'/p['preserved_generation']['previous']/'src/xiio.mjs'
        payload.write_bytes(payload.read_bytes()+b'\n// drift\n')
        self.assertFalse(self.apply(p)['ok']);self.assertEqual(self.launcher.read_bytes(),self.original)
        self.assertFalse(self.journal(p).exists())
        self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok'])

    def test_unknown_history_pending_pointer_and_foreign_backup_stop_prepare(self):
        pointer=self.f.prefix/'.pointer-transaction.lock';pointer.write_text('{}')
        self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok']);pointer.unlink()
        backup=self.bin/('xi-io-cli.pre-v1-'+hash_bytes(self.original)[:12]);backup.write_bytes(b'foreign')
        self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok']);backup.unlink()
        self.assert_no_effect()
        current=self.f.prefix/'current';current.write_text('unrecognized-generation\n')
        self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok'])
        self.assertEqual(self.launcher.read_bytes(),self.original)

    def test_target_symlink_hardlink_and_directory_custody_refused(self):
        original=self.home/'original';original.write_bytes(self.original);original.chmod(0o755)
        self.launcher.unlink();self.launcher.symlink_to(original)
        self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok'])
        self.launcher.unlink();os.link(original,self.launcher)
        self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok'])
        self.launcher.unlink();self.launcher.write_bytes(self.original);self.launcher.chmod(0o755);self.bin.chmod(0o777)
        self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok'])
        self.bin.chmod(0o755);self.assert_no_effect()

    def test_post_effect_readback_loss_persists_unknown_and_blocks_new_plan(self):
        p=self.prepare()
        program="import sys,json;sys.path.insert(0,"+repr(str(HERE))+ ");import installer_adapter as a\nreal=a.run\ndef lost(argv,timeout=60):\n result=real(argv,timeout)\n if '--repair-launcher' in argv: raise RuntimeError('test: canonical effect finished but response was lost')\n return result\na.run=lost\na.main()"
        r=self.call({'action':'apply_repair','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True},program)
        self.assertFalse(r['ok'],r);self.assertIn('UNCERTAIN',r['error'])
        self.assertNotEqual(self.launcher.read_bytes(),self.original);self.assertEqual(snapshot(self.f.prefix),self.before)
        view=self.call({'action':'inspect','plan_id':p['plan_id']})['result']
        self.assertEqual(view['phase'],'LAUNCHER_REPAIR_OUTCOME_UNCERTAIN');self.assertTrue(view['do_not_retry']);self.assertEqual(view['recovery']['owner'],'canonical_cli_installer')
        self.assertFalse(self.apply(p)['ok'])
        journal_before=self.journal(p).read_bytes(); launcher_before=self.launcher.read_bytes()
        observation=self.call({'action':'readback','plan_id':p['plan_id']})
        self.assertTrue(observation['ok'],observation); observed=observation['result']
        self.assertTrue(observed['do_not_retry']);self.assertTrue(observed['recovery_required'])
        self.assertFalse(observed['full_cli_acceptance']);self.assertFalse(observed['observation_current'])
        self.assertEqual(observed['phase'],'LAUNCHER_REPAIR_OUTCOME_UNCERTAIN')
        self.assertEqual(observed['uncertain_observation']['launcher_bytes'],'EXPECTED_REPAIR')
        self.assertTrue(observed['uncertain_observation']['generation_history_bytes_unchanged'])
        self.assertIn('response was lost',observed['uncertain_observation']['recorded_failure'])
        self.assertEqual(self.journal(p).read_bytes(),journal_before)
        self.assertEqual(self.launcher.read_bytes(),launcher_before);self.assertEqual(snapshot(self.f.prefix),self.before)
        self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok'])

    def test_corrupt_journal_and_pending_canonical_intent_block_effect(self):
        p=self.prepare();j=self.journal(p);j.parent.mkdir(exist_ok=True);j.write_text('corrupt')
        self.assertFalse(self.apply(p)['ok']);self.assert_no_effect()
        j.unlink();intent=self.bin/'xi-io-cli.repair-intent.json';intent.write_text('{}')
        self.assertFalse(self.apply(p)['ok']);self.assertFalse(self.call({'action':'prepare_repair','prefix':str(self.f.prefix),'bin_dir':str(self.bin),'node':NODE})['ok'])
        intent.unlink();self.assert_no_effect()

    def test_response_deadline_keeps_canonical_transaction_alive_until_receipt(self):
        p=self.prepare();hook=self.home/'delay-after-capture.mjs'
        entered=self.home/'durable-child-entered';release=self.home/'release-child';deadline=self.home/'canonical-timeout.json'
        hook.write_text("import fs from 'node:fs';const rename=fs.renameSync;fs.renameSync=function(a,b){const value=rename.apply(this,arguments);if(String(b).endsWith('-captured')){fs.writeFileSync("+json.dumps(str(entered))+",String(process.pid));const stop=Date.now()+15000;while(!fs.existsSync("+json.dumps(str(release))+")&&Date.now()<stop)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);if(!fs.existsSync("+json.dumps(str(release))+"))throw Error('FIXTURE_GATE_NOT_RELEASED');}return value;};")
        # Instrument only the fixture invocation, not the production deadline or
        # canonical bytes. Recording the actual argument makes any finite inner
        # timeout regression fail even though this test uses a short caller wait.
        program="import sys,json;from pathlib import Path;sys.path.insert(0,"+repr(str(HERE))+");import installer_adapter as a\nreal=a.run\ndef delayed(argv,timeout=60):\n if '--repair-launcher' in argv:\n  Path("+repr(str(deadline))+").write_text(json.dumps(timeout))\n  argv=[argv[0],'--import',"+repr(str(hook))+",*argv[1:]]\n return real(argv,timeout)\na.run=delayed\na.main()"
        proc=subprocess.Popen(['/usr/bin/python3','-I','-c',program],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=self.env)
        request={'action':'apply_repair','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True}
        proc.stdin.write(json.dumps(request));proc.stdin.close();proc.stdin=None
        try:
            until=time.monotonic()+10
            while not entered.exists() and proc.poll() is None and time.monotonic()<until:time.sleep(.025)
            self.assertTrue(entered.exists(),'Canonical child did not reach durable captured boundary')
            self.assertIsNone(json.loads(deadline.read_text()),'Consequential canonical subprocess must have no adapter kill deadline')
            child=int(entered.read_text());os.kill(child,0)
            self.assertTrue((self.bin/'xi-io-cli.repair-intent.json').is_file())
            self.assertFalse(self.launcher.exists(),'Gate must pause after capture, before launcher publication')
            with self.assertRaises(subprocess.TimeoutExpired):proc.wait(timeout=.25)
            self.assertIsNone(proc.poll(),'Response waiting deadline must not kill the adapter owner')
            os.kill(child,0) # Actual Node child is still alive beyond caller wait.
            events=[json.loads(line) for line in self.journal(p).read_text().splitlines()]
            self.assertEqual([e['outcome'] for e in events],['started'])
            busy=self.call({'action':'inspect','plan_id':p['plan_id']})
            self.assertFalse(busy['ok']);self.assertEqual(busy['error'],'INSTALLER_BUSY')
        finally:
            release.write_text('complete the original transaction')
            out,err=proc.communicate(timeout=25)
        self.assertEqual(proc.returncode,0,err);reply=json.loads(out);self.assertTrue(reply['ok'],reply)
        self.assertEqual(reply['result']['phase'],'LAUNCHER_REPAIR_READBACK_VERIFIED')
        self.assertEqual(snapshot(self.f.prefix),self.before)
        self.assertEqual(Path(p['backup']).read_bytes(),self.original)
        self.assertTrue(self.call({'action':'readback','plan_id':p['plan_id']})['ok'])
        events=[json.loads(line) for line in self.journal(p).read_text().splitlines()]
        self.assertEqual([e['outcome'] for e in events],['started','passed'])

    def test_inspect_has_only_declared_state_and_lock_writes_not_target_effects(self):
        state=self.home/'state/xi-io/installer';self.assertFalse(state.exists())
        r=self.call({'action':'inspect'});self.assertTrue(r['ok'],r)
        self.assertTrue(state.is_dir());self.assertTrue((state/'native-adapter.lock').is_file())
        self.assertFalse((state/'native-plans').exists());self.assertFalse((state/'operations').exists())
        self.assert_no_effect()

    def test_canonical_durable_crash_recovery_not_adapter_retry(self):
        p=self.prepare();hook=self.home/'kill-after-capture.mjs'
        hook.write_text("import fs from 'node:fs';const rename=fs.renameSync;fs.renameSync=function(a,b){const result=rename.apply(this,arguments);if(String(b).endsWith('-captured'))process.kill(process.pid,'SIGKILL');return result;};")
        program="import sys;sys.path.insert(0,"+repr(str(HERE))+");import installer_adapter as a\nreal=a.run\ndef crash(argv,timeout=60):\n if '--repair-launcher' in argv:argv=[argv[0],'--import',"+repr(str(hook))+",*argv[1:]]\n return real(argv,timeout)\na.run=crash\na.main()"
        r=self.call({'action':'apply_repair','plan_id':p['plan_id'],'approval_digest':p['approval_digest'],'approved':True},program)
        self.assertFalse(r['ok']);self.assertTrue((self.bin/'xi-io-cli.repair-intent.json').is_file())
        self.assertFalse(self.apply(p)['ok'])
        canonical=HERE.parent/'cli-source/launcher-repair.install.mjs'
        result=subprocess.run([NODE,str(canonical),'--repair-launcher','--prefix',str(self.f.prefix),'--bin-dir',str(self.bin),'--expect-launcher-sha256',hash_bytes(self.original)],env=self.f.env,text=True,capture_output=True,timeout=60)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(json.loads(result.stdout)['state'],'RECOVERED_ORIGINAL_LAUNCHER')
        self.assertEqual(self.launcher.read_bytes(),self.original);self.assertEqual(snapshot(self.f.prefix),self.before)
        # Canonical recovery is not repair acceptance or permission to erase the
        # unknown OperationJournal. Further operation still requires review.
        self.assertTrue(self.call({'action':'inspect','plan_id':p['plan_id']})['result']['do_not_retry'])
        self.assertFalse(self.apply(p)['ok'])

    def test_quoted_existing_node_path_matches_canonical_launcher(self):
        selected=self.home/"approved'node";shutil.copy2(NODE,selected)
        p=self.prepare(node=str(selected));r=self.apply(p);self.assertTrue(r['ok'],r)
        self.assertEqual(hash_bytes(self.launcher.read_bytes()),p['expected_launcher_sha256'])
        self.assertTrue(self.call({'action':'readback','plan_id':p['plan_id']})['ok'])

    def test_readback_does_not_execute_tampered_launcher(self):
        p=self.prepare();self.assertTrue(self.apply(p)['ok'])
        sentinel=self.home/'must-not-execute';self.launcher.write_text('#!/bin/sh\ntouch '+str(sentinel)+'\n')
        self.assertFalse(self.call({'action':'readback','plan_id':p['plan_id']})['ok']);self.assertFalse(sentinel.exists())

    def test_same_prefix_bin_launcher_only_exemption_preserves_generations(self):
        self.bin=self.f.prefix/'bin';self.bin.mkdir();self.launcher=self.bin/'xi-io-cli';self.launcher.write_bytes(self.original);self.launcher.chmod(0o755)
        p=self.prepare();before=snapshot(self.f.prefix/'versions')
        r=self.apply(p);self.assertTrue(r['ok'],r)
        self.assertEqual(snapshot(self.f.prefix/'versions'),before)
        self.assertTrue(self.call({'action':'readback','plan_id':p['plan_id']})['ok'])

if __name__=='__main__':unittest.main(verbosity=2)
