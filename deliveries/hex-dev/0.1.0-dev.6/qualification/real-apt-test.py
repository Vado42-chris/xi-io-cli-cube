import os, pathlib, shutil, subprocess, json
r=pathlib.Path('/apt-guard-test');r.mkdir(exist_ok=True)
for p in ['cache/archives/partial','lists/partial','log']:(r/p).mkdir(parents=True,exist_ok=True)
(r/'approved-version').write_text('')
shutil.copy('/guard-source/apt-guard.py',r/'apt-guard.py');(r/'apt-guard.py').chmod(0o755)
# Fixture diagnostics show action rows only, never APT configuration.
s=(r/'apt-guard.py').read_text();s=s.replace('n=check(sys.stdin.buffer.read(2*1024*1024+1),old,digest_file)', 'raw=sys.stdin.buffer.read(2*1024*1024+1); print(repr(raw.split(b\"\\n\\n\",1)[-1]),file=sys.stderr); n=check(raw,old,digest_file)');(r/'apt-guard.py').write_text(s)
status=''
for name,version in [('python3','3.10.6-1'),('bash','5.1-1'),('libwebkit2gtk-4.1-0','2.50.0-1'),('libgtk-3-0','3.24.0-1')]:
 status+=f'Package: {name}\nStatus: install ok installed\nPriority: optional\nArchitecture: amd64\nVersion: {version}\nDescription: isolated apt fixture only\n\n'
(r/'status').write_text(status)
(r/'fake-dpkg').write_text('''#!/usr/bin/python3
import sys,os
if any(x in sys.argv for x in ['--unpack','--configure','--remove','--purge','--triggers-only']):
 open('/apt-guard-test/dpkg-effect-attempt','a').write(repr(sys.argv)+'\\n')
 sys.exit(99)
os.execv('/usr/bin/dpkg',['dpkg']+sys.argv[1:])
''');(r/'fake-dpkg').chmod(0o755)
hook=str(r/'apt-guard.py')
# Fixture user namespace maps only root; this option is NOT in the shipped bootstrap.
args=['apt-get','-o','APT::Sandbox::User=root','-o','Dir::State::status='+str(r/'status'),'-o','Dir::Cache='+str(r/'cache'),'-o','Dir::State::lists='+str(r/'lists'),'-o','Dir::Log='+str(r/'log'),'-o','Dir::Bin::dpkg='+str(r/'fake-dpkg'),'-o','DPkg::Pre-Install-Pkgs::='+hook,'-o','DPkg::Tools::Options::'+hook+'::Version=3','-o','DPkg::Tools::Options::'+hook+'::InfoFD=0','-o','DPkg::Lock::Timeout=0','-o','DPkg::ConfigurePending=false','--no-remove','--assume-yes','install','/tmp/hex-dev6.deb']
def run(name,extra=[]):
 marker=r/'dpkg-effect-attempt';marker.unlink(missing_ok=True)
 q=subprocess.run(args+extra,capture_output=True,text=True,timeout=30)
 (r/(name+'.log')).write_text(q.stdout+'\n'+q.stderr)
 return q,marker.exists()
q,effect=run('positive');print(q.stdout,q.stderr);assert 'XIIO_ACTUAL_APT_ACTIONS_VERIFIED' in q.stderr and effect,(q.returncode,effect)
(r/'approved-version').write_text('0.1.0-dev.4')
q,effect=run('changed-version');assert 'PACKAGE_STATE_CHANGED_SINCE_APPROVAL' in q.stderr and not effect,(q.stdout,q.stderr,effect)
(r/'approved-version').write_text('')
p=r/'other/DEBIAN';p.mkdir(parents=True,exist_ok=True);(p/'control').write_text('Package: xiio-unrelated-fixture\nVersion: 1\nArchitecture: amd64\nMaintainer: Fixture <fixture@example.invalid>\nDescription: harmless transaction fixture\n')
subprocess.run(['dpkg-deb','--build',str(r/'other'),str(r/'other.deb')],check=True,capture_output=True)
q,effect=run('unrelated-package',[str(r/'other.deb')]);assert 'UNAPPROVED_PACKAGE_ACTION' in q.stderr and not effect,(q.stdout,q.stderr,effect)
print('REAL_APT_HOOK: 3/3 PASS. Positive reached intentionally non-writing dpkg sentinel; negative cases aborted before it. No installed files changed.')
