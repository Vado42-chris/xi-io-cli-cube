import json, tempfile, unittest
from pathlib import Path
from native.hex.adapter.build_server_package import build

class BuildServerPackageTests(unittest.TestCase):
 def test_explicit_package_build_has_no_effect(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);src=root/'source';src.mkdir()
   unit=src/'api.service';unit.write_text('[Service]\nExecStart=/usr/bin/true\n')
   app=src/'app.mjs';app.write_text('console.log("ok")\n')
   spec=root/'spec.json'
   spec.write_text(json.dumps({
    'package_id':'xiio-api','version':'1','channel':'fixture','source_ref':'local:receipt:1',
    'files':[
     {'source':str(unit),'destination_scope':'xdg_config','destination':'systemd/user/xiio-api.service','mode':'0644','overwrite':'backup_replace'},
     {'source':str(app),'destination_scope':'xdg_data','destination':'xiio/api/app.mjs','mode':'0600','overwrite':'backup_replace'}],
    'services':[{'service_id':'api-glass-private','unit':'xiio-api.service','probe':'http://127.0.0.1:8870/health','required':True}]
   }))
   out=root/'out'
   receipt=build(spec,out)
   self.assertEqual(receipt['state'],'PACKAGED_NOT_INSTALLED')
   self.assertEqual(receipt['effect_authority'],0)
   self.assertTrue((out/'server-package.json').is_file())
   self.assertTrue((out/'manifest.json').is_file())

 def test_duplicate_destination_refuses_and_reaps_output(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);f=root/'a';f.write_text('x');spec=root/'spec.json'
   row={'source':str(f),'destination_scope':'xdg_data','destination':'same','mode':'0600','overwrite':'backup_replace'}
   spec.write_text(json.dumps({'package_id':'x','version':'1','channel':'fixture','source_ref':'x',
    'files':[row,row],'services':[{'service_id':'api-glass-private','unit':'x.service','probe':None,'required':False}]}))
   out=root/'out'
   with self.assertRaisesRegex(ValueError,'DUPLICATE_DESTINATION'):
    build(spec,out)
   self.assertFalse(out.exists())

if __name__=='__main__':unittest.main()
