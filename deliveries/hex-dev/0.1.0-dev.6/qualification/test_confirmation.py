from pathlib import Path
import tempfile,os,subprocess,json,hashlib
SCRIPT=Path(__file__).resolve().parents[1]/'install-from-github.sh'
STUB='''#!/usr/bin/python3
import os,sys,json
from pathlib import Path
name=Path(sys.argv[0]).name;case=os.environ['CASE'];root=Path(os.environ['FIX']);a=sys.argv[1:]
with (root/'trace').open('a') as f:f.write(json.dumps([name,*a])+'\\n')
if name=='id':print('0' if case=='root' else '1000')
elif name=='uname':print('Linux')
elif name=='pgrep':sys.exit(0 if case=='running' else 2 if case=='pgrep_error' else 1)
elif name=='curl':Path(a[a.index('--output')+1]).write_bytes(b'no real artifact - fixture')
elif name=='sha256sum':sys.stdin.read();sys.exit(1 if case=='badchecksum' else 0)
elif name=='dpkg-deb':
 key=a[-1];print({'Package':'wrong-package' if case=='wrongidentity' else 'xi-io-hex-dev','Version':'9.0' if case=='wrongversion' else '0.1.0-dev.6','Architecture':'arm64' if case=='wrongarch' else 'amd64'}[key])
elif name=='dpkg':
 if a==['--print-architecture']:print('amd64')
 elif a[0]=='--compare-versions':sys.exit(0 if case=='downgrade' else 1)
elif name=='dpkg-query':
 if (root/'installed').exists():print('0.1.0-dev.6',end='')
 elif case=='downgrade':print('0.1.0-dev.7',end='')
 else:sys.exit(1)
elif name=='apt-get':
 assert '--simulate' in a,'No real package operation allowed in fixture'
 if case=='unrelated':print('Inst unrelated (1.0 repo [amd64])')
 elif case=='removal':print('Remv unrelated [1.0]')
 elif case=='configure_unrelated':print('Inst xi-io-hex-dev (0.1.0-dev.6 local [amd64])\\nConf unrelated (1.0 repo [amd64])')
 else:print('Inst xi-io-hex-dev (0.1.0-dev.6 local [amd64])\\nConf xi-io-hex-dev (0.1.0-dev.6 local [amd64])')
elif name=='sudo':
 assert a[0]=='apt-get';(root/'installed').write_text('mock-only')
else:raise Exception(name)
'''
results=[]
for case in ['badchecksum','wrongidentity','wrongversion','wrongarch','unrelated','removal','cancel','happy','root','running','downgrade','pgrep_error','configure_unrelated','happy_lower','happy_mixed','blank','reinstall','yes']:
 with tempfile.TemporaryDirectory(prefix='hex-bootstrap-review-') as raw:
  root=Path(raw);bin=root/'bin';bin.mkdir();dispatch=bin/'dispatch';dispatch.write_text(STUB);dispatch.chmod(0o755)
  for name in ['id','uname','pgrep','curl','sha256sum','dpkg-deb','dpkg','dpkg-query','apt-get','sudo']:(bin/name).symlink_to(dispatch)
  env={**os.environ,'PATH':str(bin)+':/usr/bin:/bin','CASE':case,'FIX':str(root),'TMPDIR':str(root),'HOME':str(root)}
  r=subprocess.run(['/bin/bash',str(SCRIPT)],input={'cancel':'NO\n','happy_lower':'install\n','happy_mixed':'InStAlL\n','blank':'\n','reinstall':'reinstall\n','yes':'yes\n'}.get(case,'INSTALL\n'),text=True,capture_output=True,env=env,timeout=10)
  trace=[json.loads(l) for l in (root/'trace').read_text().splitlines()];install=any(row[0]=='sudo' for row in trace)
  want_install=case in ['happy','happy_lower','happy_mixed'];passed=(r.returncode==0 and install) if want_install else (r.returncode!=0 and not install)
  result={'case':case,'exit':r.returncode,'sudo_mock_reached':install,'expected_failclosed_or_happy':passed,'stdout':r.stdout[-800:],'stderr':r.stderr[-300:]};results.append(result);print(json.dumps(result),flush=True)
print(json.dumps({'script_sha256':hashlib.sha256(SCRIPT.read_bytes()).hexdigest(),'required_scenarios_pass':all(r['expected_failclosed_or_happy'] for r in results),'additional_defects':[r['case'] for r in results[11:] if not r['expected_failclosed_or_happy']]}))
