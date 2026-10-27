import importlib.util,unittest
from pathlib import Path
p=Path(__file__).with_name('apt-guard.py');sp=importlib.util.spec_from_file_location('g',p);g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g)
class Guard(unittest.TestCase):
 def raw(self,line):return ('VERSION 3\nAPT::X=yes\n\n'+line+'\n').encode()
 def valid(self,line,old='0.1.0-dev.4',digest=None):return g.check(self.raw(line),old,digest or (lambda p:g.SHA))
 def test_upgrade(self):self.assertEqual(self.valid('xi-io-hex-dev 0.1.0-dev.4 amd64 none < 0.1.0-dev.7 amd64 none /tmp/hex.deb'),1)
 def test_configure(self):self.assertEqual(self.valid('xi-io-hex-dev 0.1.0-dev.4 amd64 none < 0.1.0-dev.7 amd64 none **CONFIGURE**'),1)
 def test_new(self):self.assertEqual(self.valid('xi-io-hex-dev - - none < 0.1.0-dev.7 amd64 none /tmp/hex.deb',old=''),1)
 def test_other_install(self):
  with self.assertRaisesRegex(ValueError,'UNAPPROVED'):self.valid('other - - none < 0.1.0-dev.7 amd64 none /tmp/a.deb')
 def test_other_configure(self):
  with self.assertRaisesRegex(ValueError,'UNAPPROVED'):self.valid('other 1 amd64 none = 1 amd64 none **CONFIGURE**')
 def test_remove(self):
  with self.assertRaises(ValueError):self.valid('xi-io-hex-dev 0.1.0-dev.4 amd64 none > - - none **REMOVE**')
 def test_state_drift(self):
  with self.assertRaisesRegex(ValueError,'STATE_CHANGED'):self.valid('xi-io-hex-dev 0.1.0-dev.5 amd64 none < 0.1.0-dev.7 amd64 none /tmp/a.deb')
 def test_digest(self):
  with self.assertRaisesRegex(ValueError,'BYTES_CHANGED'):self.valid('xi-io-hex-dev 0.1.0-dev.4 amd64 none < 0.1.0-dev.7 amd64 none /tmp/a.deb',digest=lambda p:'bad')
 def test_protocol(self):
  with self.assertRaises(ValueError):g.check(b'VERSION 2\n\na\n','',lambda p:g.SHA)
 def test_empty(self):
  with self.assertRaises(ValueError):g.check(b'VERSION 3\n\n','',lambda p:g.SHA)
 def test_arch(self):
  with self.assertRaises(ValueError):self.valid('xi-io-hex-dev 0.1.0-dev.4 amd64 none < 0.1.0-dev.7 arm64 none /tmp/a.deb')
 def test_oversize(self):
  with self.assertRaises(ValueError):g.check(b'X'*(2*1024*1024+1),'',lambda p:g.SHA)
if __name__=='__main__':unittest.main()
