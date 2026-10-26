import pathlib,subprocess,hashlib
r=pathlib.Path('/apt-configure-fixture/false');hook=str(r/'apt-guard.py');(r/'approved-version').write_text('0.1.0-dev.6')
files={str(f):hashlib.sha256(f.read_bytes()).hexdigest() for f in (r/'usr').rglob('*') if f.is_file()}
a=['apt-get','-o','APT::Sandbox::User=root','-o','Dir::State::status='+str(r/'var/lib/dpkg/status'),'-o','Dir::Cache='+str(r/'cache'),'-o','Dir::State::lists='+str(r/'lists'),'-o','Dir::Log='+str(r/'log'),'-o','DPkg::Options::=--root='+str(r),'-o','DPkg::Pre-Install-Pkgs::='+hook,'-o','DPkg::Tools::Options::'+hook+'::Version=3','-o','DPkg::Tools::Options::'+hook+'::InfoFD=0','-o','DPkg::ConfigurePending=true','-o','DPkg::Lock::Timeout=0','--no-remove','--assume-yes','install','/tmp/hex-dev6.deb']
p=subprocess.run(a,text=True,capture_output=True,timeout=30);print(p.stdout,p.stderr);q=subprocess.run(['dpkg-query','--admindir='+str(r/'var/lib/dpkg'),'-W','-f=${Version} ${Status}','xi-io-hex-dev'],text=True,capture_output=True);print('STATUS:',q.stdout)
assert p.returncode==0 and q.stdout=='0.1.0-dev.6 install ok installed';assert 'Unpacking' not in p.stdout
assert all(hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()==h for f,h in files.items())
print('FINISH_UNPACKED_PASS: configured existing package; no unpack/reinstall; installed payload hashes unchanged',len(files))
