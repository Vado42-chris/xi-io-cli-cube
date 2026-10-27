import pathlib,shutil,subprocess
base=pathlib.Path('/apt-configure-fixture');base.mkdir(exist_ok=True)
status=''
for name,version in [('python3','3.10.6-1'),('bash','5.1-1'),('libwebkit2gtk-4.1-0','2.50.0-1'),('libgtk-3-0','3.24.0-1')]:
 status+=f'Package: {name}\nStatus: install ok installed\nPriority: optional\nArchitecture: amd64\nVersion: {version}\nDescription: disposable fixture\n\n'
for mode in ['false','true']:
 root=base/mode;root.mkdir(exist_ok=True);(root/'var/lib/dpkg').mkdir(parents=True,exist_ok=True);(root/'var/lib/dpkg/status').write_text(status)
 for d in ['cache/archives/partial','lists/partial','log']:(root/d).mkdir(parents=True,exist_ok=True)
 (root/'approved-version').write_text('');shutil.copy('/guard-source/apt-guard.py',root/'apt-guard.py');(root/'apt-guard.py').chmod(0o755);hook=str(root/'apt-guard.py')
 args=['apt-get','-o','APT::Sandbox::User=root','-o','Dir::State::status='+str(root/'var/lib/dpkg/status'),'-o','Dir::Cache='+str(root/'cache'),'-o','Dir::State::lists='+str(root/'lists'),'-o','Dir::Log='+str(root/'log'),'-o','DPkg::Options::=--root='+str(root),'-o','DPkg::Pre-Install-Pkgs::='+hook,'-o','DPkg::Tools::Options::'+hook+'::Version=3','-o','DPkg::Tools::Options::'+hook+'::InfoFD=0','-o','DPkg::Lock::Timeout=0','-o','DPkg::ConfigurePending='+mode,'--no-remove','--assume-yes','install','/tmp/hex-dev6.deb']
 r=subprocess.run(args,text=True,capture_output=True,timeout=60);q=subprocess.run(['dpkg-query','--admindir='+str(root/'var/lib/dpkg'),'-W','-f=${Version} ${Status}','xi-io-hex-dev'],text=True,capture_output=True)
 (base/(mode+'.log')).write_text(r.stdout+'\n'+r.stderr+'\nSTATUS:'+q.stdout)
 print(mode,'exit',r.returncode,'status',q.stdout,flush=True)
 print(r.stderr[-1200:],flush=True)
 if mode=='false':assert 'unpacked' in q.stdout,(r.stdout,r.stderr,q.stdout)
 else:assert r.returncode==0 and 'install ok installed' in q.stdout,(r.stdout,r.stderr,q.stdout)
print('REAL_DPKG: reproduced false-status bug and verified configured successor in disposable roots.')
