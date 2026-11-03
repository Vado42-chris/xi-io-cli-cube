import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('native_snap',ROOT/'scripts/verify-installed-snap55.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Readback(unittest.TestCase):
    good='State: SOURCE_BOUND_NUMERIC R: 0.4847619047619048 Known: 2/2'
    unknown='State: UNKNOWN_REQUIRED_RESPONSES R: UNKNOWN Known: 1/2'
    def test_independent_fraction(self):
        self.assertEqual(str(m.EXPECTED),'509/1050')
        self.assertEqual(m.parse_result(self.good)['known'],'2/2')
    def test_unknown(self):
        self.assertIsNone(m.parse_result(self.unknown,True)['R'])
    def test_wrong_arithmetic(self):
        for value in ['0','0.4847618','NaN','Infinity','UNKNOWN']:
            with self.subTest(value=value),self.assertRaises(m.Unverified):
                m.parse_result(self.good.replace('0.4847619047619048',value))
    def test_stale_positive_on_negative(self):
        with self.assertRaises(m.Unverified):m.parse_result(self.good,True)
    def test_mixed_and_ambiguous(self):
        for text in [self.good+' '+self.unknown,self.good+' R: 0.5',self.good+' Known: 1/2','']:
            with self.subTest(text=text),self.assertRaises(m.Unverified):m.parse_result(text)
    def test_no_oracle_text_substitution(self):
        for text in ['509/1050',self.good.replace('State:','state:'),self.good.replace('Known:','Count:')]:
            with self.assertRaises(m.Unverified):m.parse_result(text)
    def test_no_non_ci_constructor(self):
        with patch.dict(m.os.environ,{},clear=True),self.assertRaisesRegex(m.Unverified,'DISPOSABLE_RUNNER_REQUIRED'):
            m.Native(2,'3','0'*64,'0'*40,'/tmp')
    def test_input_guards_and_xtest(self):
        native=m.Native.__new__(m.Native); calls=[]
        native.guard=lambda **kw:calls.append(('guard',kw))
        native.command=lambda args:calls.append(('command',args))
        native.input(['key','Tab'])
        self.assertEqual(calls,[('guard',{'focused':True}),('command',['xdotool','key','Tab']),('guard',{})])
    def test_input_guard_failure_no_action(self):
        native=m.Native.__new__(m.Native)
        native.guard=lambda **kw:m.require(False,'WINDOW_FOCUS_CHANGED')
        native.command=lambda args:self.fail('input dispatched after guard failure')
        with self.assertRaises(m.Unverified):native.input(['key','Tab'])
    def test_bounded_tree(self):
        class Node:
            def get_process_id(self):return 5
            def get_child_count(self):return 513
        class Desktop:
            def get_child_count(self):return 1
            def get_child_at_index(self,i):return Node()
        native=m.Native.__new__(m.Native);native.pid=5;native.deadline=m.time.monotonic()+10
        native.ax=type('Ax',(),{'get_desktop':lambda _,i:Desktop()})()
        with self.assertRaisesRegex(m.Unverified,'ACCESSIBILITY_CHILD_BOUNDS'):native.nodes()
    def test_absent_application(self):
        native=m.Native.__new__(m.Native);native.pid=5
        desktop=type('Desktop',(),{'get_child_count':lambda _:0})()
        native.ax=type('Ax',(),{'get_desktop':lambda _,i:desktop})()
        with self.assertRaisesRegex(m.Unverified,'ACCESSIBILITY_APPLICATION_UNVERIFIED'):native.nodes()
    def test_absent_provider_persists_unverified_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            args=['verify','123','456','a'*64,'b'*40,directory]
            with patch.dict(m.os.environ,{'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted'}),patch.object(m.sys,'argv',args),patch.object(m,'Native',side_effect=m.Unverified('ACCESSIBILITY_PROVIDER_UNAVAILABLE')):
                self.assertEqual(m.main(),61)
            receipt=json.loads((Path(directory)/'maths-interaction.json').read_text())
            self.assertEqual(receipt['status'],'UNVERIFIED')
            self.assertEqual(receipt['source_commit'],'b'*40)
            self.assertEqual(receipt['failure_category'],'ACCESSIBILITY_PROVIDER_UNAVAILABLE')
            self.assertFalse(receipt['semantic_ui_verified'])
    def test_navigation_failures_persist_distinct_stages(self):
        roles=type('Role',(),{'PUSH_BUTTON':1,'PAGE_TAB':2,'ENTRY':3,'TEXT':4})
        maths=type('Node',(),{'get_name':lambda _:'Maths','get_role':lambda _:roles.PUSH_BUTTON})()
        for input_reached in [False,True]:
            with self.subTest(input_reached=input_reached),tempfile.TemporaryDirectory() as directory:
                native=m.Native.__new__(m.Native);native.results=[]
                native.ax=type('Ax',(),{'Role':roles})()
                native.window='456'
                native.command=lambda args:''
                native.wait=lambda fn:fn()
                native.visible=lambda node:True
                native.nodes=lambda:[maths] if input_reached else []
                clicks=[]
                native.click=lambda node:clicks.append(node)
                args=['verify','123','456','a'*64,'b'*40,directory]
                with patch.dict(m.os.environ,{'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted'}),patch.object(m.sys,'argv',args),patch.object(m,'Native',return_value=native):
                    self.assertEqual(m.main(),61)
                receipt=json.loads((Path(directory)/'maths-interaction.json').read_text())
                expected='native-navigation-input-control' if input_reached else 'native-navigation-maths-control'
                self.assertEqual(receipt['last_stage'],expected)
                self.assertEqual(receipt['failure_category'],'ACCESSIBLE_CONTROL_UNVERIFIED')
                self.assertEqual(receipt['status'],'UNVERIFIED')
                self.assertFalse(receipt['semantic_ui_verified'])
                self.assertEqual(receipt['cases'],[])
                self.assertEqual(len(clicks),int(input_reached))
    def test_control_lookup_stays_exact_unique_and_visible(self):
        def node(name='Maths',role=1,visible=True):
            return type('Node',(),{'get_name':lambda _:name,'get_role':lambda _:role,'visible':visible})()
        native=m.Native.__new__(m.Native)
        native.visible=lambda n:n.visible
        good=node()
        native.nodes=lambda:[good]
        self.assertIs(native.find('Maths',[1,2]),good)
        for candidates in [[],[good,good],[node(name='maths')],[node(role=3)],[node(visible=False)]]:
            with self.subTest(candidates=candidates):
                native.nodes=lambda:candidates
                with self.assertRaisesRegex(m.Unverified,'ACCESSIBLE_CONTROL_UNVERIFIED'):
                    native.find('Maths',[1,2])
    def test_guarded_workflow(self):
        text=(ROOT/'.github/workflows/installer-contract.yml').read_text().split('  maths-installed-window:',1)[1]
        for value in ['github-hosted','scrot -z -o','verify-installed-snap55.py','timeout --signal=KILL 110s','maths-numeric.png','maths-unknown.png','maths-interaction.json']:
            self.assertIn(value,text)
        self.assertIn("inputs.publish_candidate_artifact == true",text)
        self.assertIn('python3 -I -B tests/installed-snap55.test.py',text)
    def test_no_product_execution_shortcuts(self):
        source=(ROOT/'scripts/verify-installed-snap55.py').read_text()
        for forbidden in ['execute_script','evaluate_javascript','calculateDesktopSnap55','set_text_contents','do_action(','--window']:
            self.assertNotIn(forbidden,'\n'.join(l for l in source.splitlines() if not l.lstrip().startswith('#')))

if __name__=='__main__':unittest.main()
