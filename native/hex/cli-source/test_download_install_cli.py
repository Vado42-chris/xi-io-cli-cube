import pathlib,tempfile,subprocess,os,json,shutil
R=pathlib.Path(__file__).resolve().parent;SHA='a'*40
with tempfile.TemporaryDirectory(prefix='xiio-download-proof-') as d:
 t=pathlib.Path(d);(t/'bin').mkdir();(t/'home').mkdir();gh=t/'bin/gh';gh.write_text('''#!/usr/bin/env python3
import os,sys,pathlib,json,base64,hashlib
x=sys.argv[2];name=x.split('/contents/native/hex/cli-source/',1)[1].split('?ref=',1)[0];p=pathlib.Path(os.environ['PAYLOAD_FIXTURE'])/name;b=p.read_bytes();print(json.dumps({'type':'file','encoding':'base64','content':base64.b64encode(b).decode(),'size':len(b),'sha':hashlib.sha1(b'blob '+str(len(b)).encode()+b'\\0'+b).hexdigest()}))
''');gh.chmod(0o700)
 env={**os.environ,'HOME':str(t/'home'),'PATH':str(t/'bin')+':'+os.environ['PATH'],'PAYLOAD_FIXTURE':str(R),'XIIO_CONFIG_DIR':str(t/'config')}
 cmd=['python3',str(R.parent/'download-install-cli.py'),'--carrier-ref',SHA,'--cache-dir',str(t/'cache'),'--prefix',str(t/'prefix'),'--bin-dir',str(t/'bin')]
 one=subprocess.run(cmd+['--install'],env=env,text=True,capture_output=True,timeout=90);assert one.returncode==0,one.stdout+one.stderr;assert json.loads(one.stdout)['state']=='PASS'
 before=(t/'prefix/current').read_bytes();cached=t/'cache'/SHA/'src/sdk-provider-state.mjs';cached.write_text('tampered');bad=subprocess.run(cmd+['--install'],env=env,text=True,capture_output=True,timeout=10);assert bad.returncode==2;assert 'PAYLOAD_HASH_MISMATCH' in bad.stderr;assert (t/'prefix/current').read_bytes()==before
 print(json.dumps({'state':'PASS','transport':'SYNTHETIC_GITHUB_API_FIXTURE','actual_offline_installer':True,'verified_download_install':True,'cached_tamper_refused':True,'current_preserved':True,'production_github_auth':'NOT_TESTED'},indent=2))
