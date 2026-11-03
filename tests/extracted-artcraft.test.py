import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('software',ROOT/'scripts/verify-extracted-artcraft.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Proof(unittest.TestCase):
    def test_outside_hosted_runner_refuses(self):
        with patch.dict(m.os.environ,{},clear=True):self.assertEqual(m.main(),61)
    def test_installed_default_unchanged(self):
        self.assertEqual(m.base.Native.expected_executable,'/usr/bin/xi-io-hex-dev')
    def test_arbitrary_executable_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'wrong';p.write_text('no')
            with patch.dict(m.os.environ,{'RUNNER_TEMP':d}),self.assertRaisesRegex(m.base.Unverified,'EXTRACTED_EXECUTABLE_REQUIRED'):
                m.Software(2,'3','a'*64,'b'*40,d,str(p))
    def test_initialization_requires_unique_visible_exact_label(self):
        native=m.Software.__new__(m.Software)
        class Node:
            def __init__(self,name,visible=True):self.name,self.visible=name,visible
            def get_name(self):return self.name
        native.visible=lambda n:n.visible
        for nodes in [[],[Node('HEX software marketplace')],[Node('HEX software marketplace initialized',False)], [Node('HEX software marketplace initialized')]*2]:
            native.nodes=lambda:nodes
            with self.assertRaisesRegex(m.base.Unverified,'ARTCRAFT_INITIALIZATION_NOT_OBSERVED'):native.initialized()
        native.nodes=lambda:[Node('HEX software marketplace initialized')]
        self.assertTrue(native.initialized())
    def test_failure_receipt_does_not_upgrade_initialization(self):
        with tempfile.TemporaryDirectory() as d:
            args=['probe','123','456','a'*64,'b'*40,d,'/tmp/payload/usr/bin/xi-io-hex-dev']
            with patch.dict(m.os.environ,{'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted'}),patch.object(m.sys,'argv',args),patch.object(m,'Software',side_effect=m.base.Unverified('EXTRACTED_EXECUTABLE_REQUIRED')):
                self.assertEqual(m.main(),61)
            receipt=json.loads((Path(d)/'software-initialization.json').read_text())
            self.assertFalse(receipt['initialization_observed']);self.assertFalse(receipt['installer_action_verified'])
            self.assertEqual(receipt['failure_category'],'EXTRACTED_EXECUTABLE_REQUIRED')
    def test_readback_failure_preserves_exact_stage(self):
        class Native:
            stage='software-generated-module-initialization'
            def run(self):raise m.base.Unverified('ARTCRAFT_INITIALIZATION_NOT_OBSERVED')
        with tempfile.TemporaryDirectory() as d:
            args=['probe','123','456','a'*64,'b'*40,d,'/tmp/payload/usr/bin/xi-io-hex-dev']
            with patch.dict(m.os.environ,{'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted'}),patch.object(m.sys,'argv',args),patch.object(m,'Software',return_value=Native()):
                self.assertEqual(m.main(),61)
            receipt=json.loads((Path(d)/'software-initialization.json').read_text())
            self.assertEqual(receipt['last_stage'],Native.stage);self.assertFalse(receipt['initialization_observed'])

if __name__=='__main__':unittest.main()
