import unittest,tempfile,os,json,sys
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent;sys.path[:0]=[str(HERE),str(HERE/'kernel')]
import install_preflight
class Preflight(unittest.TestCase):
 def test_bounded_nvm_metadata_no_execution_and_no_secret_read(self):
  with tempfile.TemporaryDirectory() as d:
   home=Path(d);node=home/'.nvm/versions/node/v24.9.0/bin/node';node.parent.mkdir(parents=True)
   marker=home/'EXECUTED';node.write_text('#!/bin/sh\ntouch '+str(marker)+'\n');node.chmod(0o755)
   dev=home/'.config/xi-io/device.json';dev.parent.mkdir(parents=True);dev.write_text(json.dumps({'schema':'xiio.cli.device/v1','device_id':'device:example','principal':'github:123','private_extra':'MUST_NOT_RETURN'}));dev.chmod(0o600)
   (dev.parent/'device-key.pem').write_text('DO_NOT_READ_SECRET')
   with patch.dict(os.environ,{'HOME':d},clear=True),patch('subprocess.run',side_effect=AssertionError('DISCOVERY_MUST_NOT_EXECUTE')):
    result=install_preflight.preflight()
   self.assertEqual(result['node_suggestion'],str(node));self.assertFalse(marker.exists())
   self.assertEqual(result['connection_prerequisites']['device_identity']['device_ref'],'device:example')
   self.assertFalse(result['connection_prerequisites']['service_absence_claimed'])
   self.assertNotIn('MUST_NOT_RETURN',json.dumps(result));self.assertNotIn('DO_NOT_READ_SECRET',json.dumps(result))
 def test_symlink_nvm_is_not_followed(self):
  with tempfile.TemporaryDirectory() as d:
   h=Path(d);other=h/'other';other.mkdir();(h/'.nvm').symlink_to(other)
   with patch.dict(os.environ,{'HOME':d},clear=True):r=install_preflight.preflight()
   self.assertFalse(any(x['source']=='user_nvm' for x in r['node_candidates']))
if __name__=='__main__':unittest.main()
