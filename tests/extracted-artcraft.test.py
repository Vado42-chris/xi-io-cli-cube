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
        native.ax=type('Ax',(),{'Role':type('Role',(),{'STATUS_BAR':42})})()
        class Node:
            def __init__(self,name,visible=True,role=42):self.name,self.visible,self.role=name,visible,role
            def get_name(self):return self.name
            def get_role(self):return self.role
        native.visible=lambda n:n.visible
        for nodes in [[],[Node('HEX software marketplace')],[Node('HEX software marketplace initialized',False)],[Node('HEX software marketplace initialized',True,99)], [Node('HEX software marketplace initialized')]*2]:
            native.nodes=lambda:nodes
            with self.assertRaisesRegex(m.base.Unverified,'ARTCRAFT_INITIALIZATION_NOT_OBSERVED'):native.initialized()
        native.nodes=lambda:[Node('HEX software marketplace initialized')]
        self.assertTrue(native.initialized())
    def test_local_policy_failure_stays_typed(self):
        native=m.Software.__new__(m.Software)
        native.ax=type('Ax',(),{'Role':type('Role',(),{'STATUS_BAR':42})})()
        class Node:
            def get_name(self):return 'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_UNATTRIBUTED_COMPILE_POLICY_EVENT'
        native.nodes=lambda:[Node()]
        native.visible=lambda n:True
        with self.assertRaisesRegex(m.base.Unverified,'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_UNATTRIBUTED_COMPILE_POLICY_EVENT'):native.initialized()
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
            def capture(self,name):
                assert name == 'software-unverified'
                return 'c'*64
        with tempfile.TemporaryDirectory() as d:
            args=['probe','123','456','a'*64,'b'*40,d,'/tmp/payload/usr/bin/xi-io-hex-dev']
            with patch.dict(m.os.environ,{'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted'}),patch.object(m.sys,'argv',args),patch.object(m,'Software',return_value=Native()):
                self.assertEqual(m.main(),61)
            receipt=json.loads((Path(d)/'software-initialization.json').read_text())
            self.assertEqual(receipt['last_stage'],Native.stage);self.assertFalse(receipt['initialization_observed'])
            self.assertEqual(receipt['failure_screenshot_sha256'],'c'*64)

if __name__=='__main__':unittest.main()
