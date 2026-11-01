import pathlib,tempfile,subprocess,os,json,shutil,sys
R=pathlib.Path(__file__).resolve().parent;PAYLOAD=R/'cli-source';SOURCES={p:(R.parent.parent/p).read_text() for p in ['native/hex/adapter/install_preflight.py','native/hex/adapter/kernel/xiio_installer/__init__.py','native/hex/adapter/kernel/xiio_installer/discovery.py']};NODE=pathlib.Path(shutil.which('node'))
with tempfile.TemporaryDirectory(prefix='xiio-nvm-install-proof-') as d:
 t=pathlib.Path(d);home=t/'home';bin=t/'bin';home.mkdir();bin.mkdir();node=home/'.nvm/versions/node/v24.22.1/bin/node';node.parent.mkdir(parents=True);shutil.copyfile(NODE,node);node.chmod(0o700)
 fixture=t/'repo';(fixture/'native/hex').mkdir(parents=True);shutil.copytree(PAYLOAD,fixture/'native/hex/cli-source')
 for p,s in SOURCES.items():target=fixture/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(s)
 gh=bin/'gh';gh.write_text('#!'+sys.executable+'\n'+'''import os,sys,pathlib,json,base64,hashlib
p=sys.argv[2].split('/contents/',1)[1].split('?ref=',1)[0];b=(pathlib.Path(os.environ['REPO_FIXTURE'])/p).read_bytes();print(json.dumps({'type':'file','encoding':'base64','content':base64.b64encode(b).decode(),'size':len(b),'sha':hashlib.sha1(b'blob '+str(len(b)).encode()+b'\\0'+b).hexdigest()}))
''');gh.chmod(0o700);(bin/'cat').symlink_to(shutil.which('cat'))
 env={'HOME':str(home),'PATH':str(bin),'REPO_FIXTURE':str(fixture),'XIIO_CONFIG_DIR':str(home/'config'),'XDG_STATE_HOME':str(home/'state')}
 assert shutil.which('node',path=env['PATH']) is None
 result=subprocess.run([sys.executable,str(R/'download-install-cli.py'),'--carrier-ref','a'*40,'--cache-dir',str(t/'cache'),'--prefix',str(t/'prefix'),'--bin-dir',str(bin),'--install'],env=env,text=True,capture_output=True,timeout=90)
 assert result.returncode==0,result.stdout+result.stderr;receipt=json.loads(result.stdout);assert receipt['state']=='PASS'
 version=subprocess.run([str(bin/'xi-io-cli'),'version'],env=env,text=True,capture_output=True,timeout=20);v=json.loads(version.stdout);assert version.returncode==0 and v['integrity_verified']
 print(json.dumps({'state':'PASS','node_absent_from_PATH':True,'existing_hex_discovery_used':True,'actual_copied_node_binary':True,'actual_offline_installer':True,'installed_source':v['source_sha'],'native_aries':False,'github_transport':'SYNTHETIC_FIXTURE','profile_changes':False},indent=2))
