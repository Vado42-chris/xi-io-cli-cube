import pathlib,tempfile,subprocess,os,json,shutil,hashlib
R=pathlib.Path(__file__).resolve().parent;SHA='89b9c418f6e161d9864bf891fd665b6a18f00dd2';node=shutil.which('node')
with tempfile.TemporaryDirectory(prefix='xiio-hex-delivery-') as d:
 t=pathlib.Path(d);(t/'home').mkdir();(t/'bin').mkdir();env={**os.environ,'HOME':str(t/'home'),'XIIO_CONFIG_DIR':str(t/'config'),'PATH':str(t/'bin')+':'+os.environ['PATH']}
 def install(src=R):return subprocess.run([node,str(R/'install.mjs'),'--packaged-source',str(src),'--ref',SHA,'--prefix',str(t/'prefix'),'--bin-dir',str(t/'bin')],env=env,capture_output=True,text=True,timeout=45)
 first=install();assert first.returncode==0,first.stdout+first.stderr;a=json.loads(first.stdout);g1=(t/'prefix/current').read_text();assert a['source_sha']==SHA
 (t/'config').mkdir(exist_ok=True);sentinel=t/'config/user-preserved.txt';sentinel.write_text('keep user choices\n')
 second=install();assert second.returncode==0,second.stdout+second.stderr;g2=(t/'prefix/current').read_text();assert g2!=g1;assert (t/'prefix/previous').read_text()==g1;assert sentinel.read_text()=='keep user choices\n'
 back=subprocess.run([str(t/'bin/xi-io-cli'),'rollback'],env=env,capture_output=True,text=True,timeout=30);assert back.returncode==0,back.stdout+back.stderr;assert (t/'prefix/current').read_text()==g1;assert (t/'prefix/previous').read_text()==g2
 again=subprocess.run([str(t/'bin/xi-io-cli'),'rollback'],env=env,capture_output=True,text=True,timeout=30);assert again.returncode==0;assert (t/'prefix/current').read_text()==g2
 version=subprocess.run([str(t/'bin/xi-io-cli'),'version'],env=env,capture_output=True,text=True,timeout=30);v=json.loads(version.stdout);assert version.returncode==0 and v['integrity_verified'] and v['source_sha']==SHA
 before=(t/'prefix/current').read_bytes();bad=t/'bad';shutil.copytree(R,bad);(bad/'src/sdk-provider-state.mjs').write_text('tampered\n');deny=install(bad);assert deny.returncode!=0;assert (t/'prefix/current').read_bytes()==before
 shutil.rmtree(bad);shutil.copytree(R,bad);m=json.loads((bad/'packaged-source.json').read_text());del m['files']['src/sdk-provider-state.mjs'];(bad/'packaged-source.json').write_text(json.dumps(m));deny2=install(bad);assert deny2.returncode!=0;assert (t/'prefix/current').read_bytes()==before
 print(json.dumps({'schema':'xiio.hex.offline-payload-delivery-proof/v1','state':'PASS','source_sha':SHA,'payload_files':11,'fresh_install':True,'same_sha_new_generation':True,'rollback_both_directions':True,'user_config_preserved':True,'version_integrity_readback':True,'tampered_module_refused':True,'missing_module_manifest_refused':True,'refusals_preserve_current':True,'installed_on':'DISPOSABLE_CLOUD_ONLY'},indent=2))
