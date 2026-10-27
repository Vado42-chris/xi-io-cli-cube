#!/usr/bin/env python3
"""Existing guard parity and bounded fake-APT shell flow; never host APT/sudo."""
import ast,hashlib,importlib.util,json,os,re,shutil,subprocess,tempfile,types,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
PRODUCT=HERE if (HERE/'install-from-github.sh').is_file() else HERE.parent
SCRIPT=(PRODUCT/'install-from-github.sh').read_text()
GUARD=SCRIPT.split("<<'XIIO_GUARD'\n",1)[1].split('\nXIIO_GUARD\n',1)[0]+'\n'
FROZEN_GUARD_NORMALIZED_SHA256='f2650e954bf3a042ecfa33d88ae30e97788d54cece5c3e2bb77845213f7cc5d8'
# Exact inherited fake-command fixture; never executes APT or sudo.
STUB="#!/usr/bin/python3\nimport os,sys,json\nfrom pathlib import Path\nname=Path(sys.argv[0]).name;case=os.environ['CASE'];root=Path(os.environ['FIX']);a=sys.argv[1:]\nwith (root/'trace').open('a') as f:f.write(json.dumps([name,*a])+'\\n')\nif name=='id':print('0' if case=='root' else '1000')\nelif name=='uname':print('Linux')\nelif name=='pgrep':sys.exit(0 if case=='running' else 2 if case=='pgrep_error' else 1)\nelif name=='curl':Path(a[a.index('--output')+1]).write_bytes(b'no real artifact - fixture')\nelif name=='sha256sum':sys.stdin.read();sys.exit(1 if case=='badchecksum' else 0)\nelif name=='dpkg-deb':\n key=a[-1];print({'Package':'wrong-package' if case=='wrongidentity' else 'xi-io-hex-dev','Version':'9.0' if case=='wrongversion' else '0.1.0-dev.7','Architecture':'arm64' if case=='wrongarch' else 'amd64'}[key])\nelif name=='dpkg':\n if a==['--print-architecture']:print('amd64')\n elif a[0]=='--compare-versions':sys.exit(0 if case=='downgrade' else 1)\nelif name=='dpkg-query':\n if (root/'installed').exists():print(('0.1.0-dev.7 install ok unpacked' if case=='unpacked' else '0.1.0-dev.7 install ok installed') if any('${Version} ${Status}' in x for x in a) else '0.1.0-dev.7',end='')\n elif case=='downgrade':print('0.1.0-dev.8',end='')\n else:sys.exit(1)\nelif name=='apt-get':\n assert '--simulate' in a,'No real package operation allowed in fixture'\n if case=='unrelated':print('Inst unrelated (1.0 repo [amd64])')\n elif case=='removal':print('Remv unrelated [1.0]')\n elif case=='configure_unrelated':print('Inst xi-io-hex-dev (0.1.0-dev.7 local [amd64])\\nConf unrelated (1.0 repo [amd64])')\n else:print('Inst xi-io-hex-dev (0.1.0-dev.7 local [amd64])\\nConf xi-io-hex-dev (0.1.0-dev.7 local [amd64])')\nelif name=='sudo':\n assert a[0]=='apt-get';(root/'installed').write_text('mock-only')\nelse:raise Exception(name)\n"
class Bootstrap(unittest.TestCase):
 def test_01_guard_algorithm_identical_except_exact_version_byte_pins(self):
  normalized=re.sub(r"^VERSION='[^']+'$","VERSION='@VERSION@'",GUARD,flags=re.M)
  normalized=re.sub(r"^SHA='[^']+'$","SHA='@SHA@'",normalized,flags=re.M)
  normalized=re.sub(r'before.st_size!=[0-9]+:', 'before.st_size!=@SIZE@:',normalized)
  self.assertEqual(hashlib.sha256(normalized.encode()).hexdigest(),FROZEN_GUARD_NORMALIZED_SHA256)
  self.assertIn("VERSION='0.1.0-dev.9'",GUARD);self.assertIn("SHA='87d367490c02c9627216156441d832ea6f39840979dae51cc08a23b2684fdf11'",GUARD);self.assertIn('before.st_size!=6672978:',GUARD)
 def test_02_embedded_helper_exact(self):self.assertEqual(SCRIPT.split("<<'XIIO_CONCIERGE'\n",1)[1].split('\nXIIO_CONCIERGE\n',1)[0]+'\n',(PRODUCT/'concierge-successor.py').read_text())
 def test_03_syntax_public_privacy_and_effect_scope(self):
  subprocess.run(['/bin/bash','-n',str(PRODUCT/'install-from-github.sh')],check=True)
  self.assertNotIn('/home/',SCRIPT);self.assertEqual(re.findall(r'\b[a-f0-9]{32}\b',SCRIPT),[])
  self.assertEqual(SCRIPT.count('sudo '),1)
  for x in ['DPkg::Lock::Timeout=0','Debug::NoLocking=false','DPkg::ConfigurePending=true','--no-remove','0.1.0-dev.9 install ok installed','dpkg --verify xi-io-hex-dev','--original-plan "$2" --prior-success "$4"']:self.assertIn(x,SCRIPT)
  for x in ['--adopt-existing-launcher','connection_profile.apply','systemctl start','gh auth login','NODE_PATH =','NODE_SHA =','ORIGINAL_PLAN =','PRIOR_RECEIPT =']:self.assertNotIn(x,SCRIPT)
 def test_04_actual_action_guard_matrix(self):
  g=types.ModuleType('guard');exec(GUARD,g.__dict__)
  raw=lambda line:('VERSION 3\nX=y\n\n'+line+'\n').encode()
  good='xi-io-hex-dev 0.1.0-dev.8 amd64 none < 0.1.0-dev.9 amd64 none /tmp/fixture.deb'
  self.assertEqual(g.check(raw(good),'0.1.0-dev.8',lambda p:g.SHA),1)
  self.assertEqual(g.check(raw(good.replace('/tmp/fixture.deb','**CONFIGURE**')),'0.1.0-dev.8',lambda p:g.SHA),1)
  for wrong in [good.replace('xi-io-hex-dev','other'),good.replace('0.1.0-dev.8','0.1.0-dev.7'),good.replace('0.1.0-dev.9','0.1.0-dev.10'),good.replace('/tmp/fixture.deb','**REMOVE**'),good.replace('amd64','arm64'),good.replace(' < ',' > ')]:
   with self.assertRaises(ValueError):g.check(raw(wrong),'0.1.0-dev.8',lambda p:g.SHA)
  with self.assertRaises(ValueError):g.check(raw(good),'0.1.0-dev.8',lambda p:'b'*64)
  with self.assertRaises(ValueError):g.check(b'VERSION 2\n\nx\n','',lambda p:g.SHA)
  with self.assertRaises(ValueError):g.check(b'x'*(2*1024*1024+1),'',lambda p:g.SHA)
 def test_05_shell_failclosed_matrix(self):
  stub=STUB
  stub=stub.replace('0.1.0-dev.8','0.1.0-dev.10').replace('0.1.0-dev.7','0.1.0-dev.9')
  stub=stub.replace("if a==['--print-architecture']:print('amd64')", "if a==['--print-architecture']:print('amd64')\n elif a==['--verify','xi-io-hex-dev']:\n  if case=='installed_drift':print('fixture payload drift');sys.exit(1)")
  results=[]
  for case in ['badchecksum','wrongidentity','wrongversion','wrongarch','unrelated','removal','cancel','happy','root','running','downgrade','pgrep_error','configure_unrelated','happy_lower','happy_mixed','blank','reinstall','yes','unpacked','installed_drift','concierge_failure']:
   with self.subTest(case=case),tempfile.TemporaryDirectory(prefix='hex-dev9-bootstrap-fixture-') as td:
    root=Path(td);bin=root/'bin';bin.mkdir();dispatch=bin/'dispatch';dispatch.write_text(stub);dispatch.chmod(0o755)
    for name in ['id','uname','pgrep','curl','sha256sum','dpkg-deb','dpkg','dpkg-query','apt-get','sudo']:(bin/name).symlink_to(dispatch)
    stage=root/'concierge-stage';stage.write_text("#!/usr/bin/python3\nimport json,os,sys\nfrom pathlib import Path\nr=Path(os.environ['FIX']);assert sys.argv[2:]==['--original-plan','1'*32,'--prior-success','2'*32]\nassert 'qualified existing offline custody producer' in Path(sys.argv[1]).read_text()\nwith (r/'trace').open('a') as f:f.write(json.dumps(['concierge'])+'\\n')\nsys.exit(2 if os.environ['CASE']=='concierge_failure' else 0)\n");stage.chmod(0o755)
    script=root/'bootstrap.sh';entry='/usr/bin/env -u PYTHONPATH -u PYTHONHOME -u PYTHONSTARTUP -u PYTHONINSPECT -u PYTHONUSERBASE -u LD_PRELOAD -u LD_LIBRARY_PATH /usr/bin/python3 -I -B "$concierge"';self.assertIn(entry,SCRIPT);script.write_text(SCRIPT.replace(entry,str(stage)+' "$concierge"'))
    env={**os.environ,'PATH':str(bin)+':/usr/bin:/bin','CASE':case,'FIX':str(root),'HOME':str(root)}
    answer={'cancel':'NO\n','happy_lower':'install\n','happy_mixed':'InStAlL\n','blank':'\n','reinstall':'reinstall\n','yes':'yes\n'}.get(case,'INSTALL\n')
    r=subprocess.run(['/bin/bash',str(script),'--original-plan','1'*32,'--prior-success','2'*32],input=answer,text=True,capture_output=True,env=env,timeout=15)
    trace=[json.loads(x) for x in (root/'trace').read_text().splitlines()];apt=any(x[0]=='sudo' for x in trace);helper=sum(x[0]=='concierge' for x in trace)
    happy=case in ['happy','happy_lower','happy_mixed'];partial=case in ['unpacked','installed_drift','concierge_failure']
    self.assertEqual(apt,happy or partial,(case,r.stdout,r.stderr,trace));self.assertEqual(helper,1 if happy or case=='concierge_failure' else 0,(case,r.stdout,r.stderr,trace));self.assertEqual(r.returncode==0,happy,(case,r.stdout,r.stderr))
    if helper:self.assertIn(['dpkg','--verify','xi-io-hex-dev'],trace);self.assertLess(next(i for i,x in enumerate(trace) if x[0]=='sudo'),next(i for i,x in enumerate(trace) if x[0]=='concierge'))
    results.append({'case':case,'state':'PASS','mock_apt_only':apt,'helper_calls':helper})
    for line in r.stdout.splitlines():
     if line.startswith('Temporary download and apt review: '):
      work=Path(line.split(': ',1)[1]);self.assertTrue(str(work).startswith('/tmp/xiio-hex-dev9.'));shutil.rmtree(work,ignore_errors=True)
  output=os.environ.get('XIIO_TEST_OUTPUT_DIR')
  if output:
   folder=Path(output);folder.mkdir(parents=True,exist_ok=True);(folder/'delivery-bootstrap-flow.json').write_text(json.dumps({'state':'PASS','cases':results,'actual_host_package_effects':0},indent=2)+'\n')
if __name__=='__main__':unittest.main(verbosity=2)
