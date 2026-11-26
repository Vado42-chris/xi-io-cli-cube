import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
import time
import shutil
from unittest.mock import Mock, patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('software',ROOT/'scripts/verify-extracted-artcraft.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ENV={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','GITHUB_SHA':'b'*40,
     'GITHUB_RUN_ID':'1','GITHUB_RUN_ATTEMPT':'1'}

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
    def test_installed_mode_refuses_an_extracted_executable(self):
        with tempfile.TemporaryDirectory() as d:
            executable=Path(d)/'payload/usr/bin/xi-io-hex-dev'
            executable.parent.mkdir(parents=True);executable.write_text('unit fixture')
            with patch.dict(m.os.environ,{'RUNNER_TEMP':d}),self.assertRaisesRegex(m.base.Unverified,'^INSTALLED_EXECUTABLE_REQUIRED$'):
                m.Software(2,'3','a'*64,'b'*40,d,str(executable),installed=True)
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
            args=['probe','123','456','a'*64,'b'*40,d,'/tmp/payload/usr/bin/xi-io-hex-dev','/tmp/candidate.deb','/tmp/frontend.json']
            with patch.dict(m.os.environ,ENV),patch.object(m.sys,'argv',args),patch.object(m,'frontend_binding',return_value={}),patch.object(m,'Software',side_effect=m.base.Unverified('EXTRACTED_EXECUTABLE_REQUIRED')):
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
            args=['probe','123','456','a'*64,'b'*40,d,'/tmp/payload/usr/bin/xi-io-hex-dev','/tmp/candidate.deb','/tmp/frontend.json']
            with patch.dict(m.os.environ,ENV),patch.object(m.sys,'argv',args),patch.object(m,'frontend_binding',return_value={}),patch.object(m,'Software',return_value=Native()):
                self.assertEqual(m.main(),61)
            receipt=json.loads((Path(d)/'software-initialization.json').read_text())
            self.assertEqual(receipt['last_stage'],Native.stage);self.assertFalse(receipt['initialization_observed'])
            self.assertEqual(receipt['failure_screenshot_sha256'],'c'*64)

class FrontendBinding(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.package=self.root/'candidate.deb';self.package.write_bytes(b'package identity unit fixture')
        self.executable=self.root/'payload/usr/bin/xi-io-hex-dev';self.executable.parent.mkdir(parents=True)
        self.executable.write_bytes(b'executable identity unit fixture')
        self.archive=self.root/'hex-built-frontend.tgz';self.archive.write_bytes(b'frontend archive identity unit fixture')
        self.identity=self.root/'hex-native-frontend-identity.json'
        self.front={'source_commit':'b'*40,'github_sha':'b'*40,'source_tree':'d'*40,
                    'github_run_id':'1','github_run_attempt':'1',
                    'qualification':'BUILT_FRONTEND_NOT_INSTALLED_ACCEPTANCE','frontend_staged_match':True,
                    'pop_os_acceptance':False,'release_promotion':False,
                    'debian_package_sha256':m.file_digest(self.package),'native_elf_sha256':m.file_digest(self.executable),
                    'frontend_archive_sha256':m.file_digest(self.archive),'package_version':'unit-fixture'}
        self.save()
    def save(self):self.identity.write_text(json.dumps(self.front))
    def read(self):
        with patch.dict(m.os.environ,ENV):
            return m.frontend_binding(self.identity,'b'*40,self.front['native_elf_sha256'],self.package,self.executable)
    def test_exact_file_identity_join(self):
        receipt=self.read()
        self.assertEqual(receipt['frontend_identity_sha256'],m.file_digest(self.identity))
        self.assertEqual(receipt['debian_package_sha256'],m.file_digest(self.package))
        self.assertTrue(receipt['extracted_elf_identity_verified'])
    def test_package_elf_and_archive_mismatch_refuse(self):
        for file,code in [(self.package,'ARTCRAFT_PACKAGE_DIGEST_MISMATCH'),(self.executable,'ARTCRAFT_ELF_DIGEST_MISMATCH'),(self.archive,'ARTCRAFT_FRONTEND_ARCHIVE_MISMATCH')]:
            with self.subTest(file=file.name):
                original=file.read_bytes();file.write_bytes(b'changed fixture')
                with self.assertRaisesRegex(m.base.Unverified,'^'+code+'$'):self.read()
                file.write_bytes(original)
    def test_source_run_stage_and_scope_mismatch_refuse(self):
        for key,value in [('source_commit','e'*40),('github_sha','e'*40),('github_run_id','2'),('github_run_attempt','2'),('frontend_staged_match',False),('pop_os_acceptance',True),('release_promotion',True)]:
            with self.subTest(key=key):
                old=self.front[key];self.front[key]=value;self.save()
                with self.assertRaises(m.base.Unverified):self.read()
                self.front[key]=old;self.save()
    def test_identity_symlink_refuses(self):
        alias=self.root/'linked.json';alias.symlink_to(self.identity)
        with self.assertRaisesRegex(m.base.Unverified,'ARTCRAFT_BINDING_FILE_UNAVAILABLE'):
            m.frontend_binding(alias,'b'*40,self.front['native_elf_sha256'],self.package,self.executable)
    def test_missing_run_context_cannot_match_missing_receipt_fields(self):
        self.front.pop('github_run_id');self.front.pop('github_run_attempt');self.save()
        with patch.dict(m.os.environ,{},clear=True),self.assertRaisesRegex(m.base.Unverified,'^ARTCRAFT_FRONTEND_RUN_MISMATCH$'):
            m.frontend_binding(self.identity,'b'*40,self.front['native_elf_sha256'],self.package,self.executable)
    def test_unrelated_package_cannot_be_released_dev12(self):
        with self.assertRaisesRegex(m.base.Unverified,'^RETIRED_DEV12_PACKAGE_MISMATCH$'):
            m.dev12_binding(self.package,self.executable)

class InstalledPackage(unittest.TestCase):
    version='0.1.0-dev.13'
    executable='/usr/bin/xi-io-hex-dev'
    def query(self,output,code=0):
        return m.subprocess.CompletedProcess([],code,output,'')
    def test_exact_installed_status_name_and_version(self):
        with patch.object(m.subprocess,'run',return_value=self.query('install ok installed\txi-io-hex-dev\t'+self.version+'\n')) as query:
            receipt=m.installed_package_binding(self.executable,self.version)
        self.assertTrue(receipt['installed_package'])
        self.assertEqual(receipt['installed_package_version'],self.version)
        self.assertEqual(query.call_args.args[0][0],'/usr/bin/dpkg-query')
        self.assertIn('--admindir=/var/lib/dpkg',query.call_args.args[0])
    def test_wrong_state_package_version_or_multiple_rows_refuse(self):
        for row in ['deinstall ok config-files\txi-io-hex-dev\t'+self.version,
                    'install ok unpacked\txi-io-hex-dev\t'+self.version,
                    'install ok installed\tforeign-package\t'+self.version,
                    'install ok installed\txi-io-hex-dev\t0.1.0-dev.12',
                    ('install ok installed\txi-io-hex-dev\t'+self.version+'\n')*2]:
            with self.subTest(row=row),patch.object(m.subprocess,'run',return_value=self.query(row)),self.assertRaisesRegex(m.base.Unverified,'^INSTALLED_PACKAGE_READBACK_MISMATCH$'):
                m.installed_package_binding(self.executable,self.version)
    def test_query_failure_and_timeout_refuse(self):
        with patch.object(m.subprocess,'run',return_value=self.query('',1)),self.assertRaisesRegex(m.base.Unverified,'^INSTALLED_PACKAGE_QUERY_UNVERIFIED$'):
            m.installed_package_binding(self.executable,self.version)
        with patch.object(m.subprocess,'run',side_effect=m.subprocess.TimeoutExpired('dpkg-query',5)),self.assertRaisesRegex(m.base.Unverified,'^INSTALLED_PACKAGE_QUERY_UNVERIFIED$'):
            m.installed_package_binding(self.executable,self.version)
    def test_unbound_version_or_wrong_path_refuse_before_query(self):
        for executable,version,code in [('/tmp/usr/bin/xi-io-hex-dev',self.version,'INSTALLED_EXECUTABLE_REQUIRED'),(self.executable,None,'INSTALLED_PACKAGE_VERSION_UNBOUND')]:
            with self.subTest(code=code),patch.object(m.subprocess,'run') as query,self.assertRaisesRegex(m.base.Unverified,'^'+code+'$'):
                m.installed_package_binding(executable,version)
            query.assert_not_called()
    def test_failed_installed_readback_does_not_set_installed_flag(self):
        with tempfile.TemporaryDirectory() as d:
            args=['probe','--installed','123','456','a'*64,'b'*40,d,self.executable,'/tmp/candidate.deb','/tmp/frontend.json']
            with patch.dict(m.os.environ,ENV),patch.object(m.sys,'argv',args),patch.object(m,'frontend_binding',return_value={'package_version':self.version}),patch.object(m,'installed_package_binding',side_effect=m.base.Unverified('INSTALLED_PACKAGE_READBACK_MISMATCH')),patch.object(m,'Software') as native:
                self.assertEqual(m.main(),61)
            native.assert_not_called()
            receipt=json.loads((Path(d)/'software-initialization.json').read_text())
            self.assertFalse(receipt['installed_package']);self.assertFalse(receipt['initialization_observed'])
    def test_installed_binding_does_not_qualify_failed_initialization(self):
        class Native:
            stage='software-generated-module-initialization'
            def run(self):raise m.base.Unverified('ARTCRAFT_INITIALIZATION_NOT_OBSERVED')
            def capture(self,name):return 'c'*64
        with tempfile.TemporaryDirectory() as d:
            args=['probe','--installed','123','456','a'*64,'b'*40,d,self.executable,'/tmp/candidate.deb','/tmp/frontend.json']
            with patch.dict(m.os.environ,ENV),patch.object(m.sys,'argv',args),patch.object(m,'frontend_binding',return_value={'package_version':self.version}),patch.object(m,'installed_package_binding',return_value={'installed_package':True}),patch.object(m,'Software',return_value=Native()):
                self.assertEqual(m.main(),61)
            receipt=json.loads((Path(d)/'software-initialization.json').read_text())
            self.assertTrue(receipt['installed_package']);self.assertFalse(receipt['initialization_observed'])
            self.assertFalse(receipt['domain_action_verified']);self.assertFalse(receipt['pop_os_acceptance'])

class AxNode:
    def __init__(self,name,role=17,visible=True):self.name,self.role,self.visible=name,role,visible
    def get_name(self):return self.name
    def get_role(self):return self.role

class RetiredBody(unittest.TestCase):
    def native(self,nodes):
        native=m.Software.__new__(m.Software)
        native.ax=type('Ax',(),{'Role':type('Role',(),{'PUSH_BUTTON':17,'STATUS_BAR':42})})()
        native.nodes=lambda:nodes;native.visible=lambda n:n.visible
        return native
    def cards(self):return [AxNode(name) for name in m.DEV12_CARD_NAMES]
    def test_actual_reference_button_names_need_no_heading(self):
        native=self.native(self.cards())
        self.assertEqual([c['name'] for c in native.retired_controls()],list(m.DEV12_CARD_NAMES))
        with self.assertRaisesRegex(m.base.Unverified,'^ARTCRAFT_INITIALIZATION_NOT_OBSERVED$'):native.initialized()
    def test_missing_hidden_wrong_role_duplicate_or_changed_card_refuses(self):
        for index in range(2):
            for change in ('missing','hidden','role','duplicate','name'):
                with self.subTest(index=index,change=change):
                    nodes=self.cards()
                    if change=='missing':nodes.pop(index)
                    elif change=='hidden':nodes[index].visible=False
                    elif change=='role':nodes[index].role=42
                    elif change=='duplicate':nodes.append(nodes[index])
                    else:nodes[index].name+=' changed'
                    with self.assertRaisesRegex(m.base.Unverified,'^RETIRED_DEV12_REFERENCE_CARDS_NOT_OBSERVED$'):
                        self.native(nodes).retired_controls()
    def test_any_visible_ready_status_defeats_red(self):
        for count in (1,2):
            with self.subTest(count=count):
                native=self.native(self.cards()+[AxNode(m.INITIALIZED_NAME,42) for _ in range(count)])
                with self.assertRaisesRegex(m.base.Unverified,'^RETIRED_DEV12_READINESS_PRESENT$'):native.retired_controls()
    def test_initialized_status_with_any_visible_retired_card_refuses(self):
        for card in self.cards():
            with self.subTest(card=card.name):
                native=self.native([AxNode(m.INITIALIZED_NAME,42),card])
                with self.assertRaisesRegex(m.base.Unverified,'^ARTCRAFT_RETIRED_CONTENT_VISIBLE$'):native.initialized()
    def test_policy_failure_is_not_retired_body_red(self):
        code='ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_UNATTRIBUTED_COMPILE_POLICY_EVENT'
        native=self.native(self.cards()+[AxNode(code,42)])
        with self.assertRaisesRegex(m.base.Unverified,'^'+code+'$'):native.retired_controls()
    def test_accessibility_failure_is_not_retired_body_red(self):
        native=self.native(self.cards())
        def unavailable():raise m.base.Unverified('ACCESSIBILITY_APPLICATION_UNVERIFIED')
        native.nodes=unavailable
        with self.assertRaisesRegex(m.base.Unverified,'^ACCESSIBILITY_APPLICATION_UNVERIFIED$'):native.retired_controls()
    def test_capture_failure_cannot_write_red_true(self):
        class Native:
            stage='software-retired-body-capture'
            def run_retired(self):raise m.base.Unverified('PNG_BLANK_OR_PREPAINT')
            def capture(self,name):raise m.base.Unverified('PNG_BLANK_OR_PREPAINT')
        with tempfile.TemporaryDirectory() as directory:
            args=['probe','--retired-dev12','123','456','b'*40,directory,'/tmp/payload/usr/bin/xi-io-hex-dev','/tmp/dev12.deb']
            with patch.dict(m.os.environ,ENV),patch.object(m.sys,'argv',args),patch.object(m,'dev12_binding',return_value={}),patch.object(m,'Software',return_value=Native()):
                self.assertEqual(m.main(),61)
            receipt=json.loads((Path(directory)/'hex-dev12-ui-red.json').read_text())
            self.assertFalse(receipt['red_established']);self.assertFalse(receipt['initialization_observed'])
            self.assertFalse(receipt['domain_action_verified']);self.assertFalse(receipt['failure_capture_verified'])
            self.assertEqual(receipt['failure_category'],'PNG_BLANK_OR_PREPAINT')

class RenderedText(unittest.TestCase):
    positive = 'XI-IO Software\nXI-IO CLI\nREVIEW INSTALLATION'
    retired = 'XI-IO Ecosystem Component Catalog\nXI-IO CLI\nXI-IO Code Editor'
    def check(self,text,retired=False,layout=None):
        result=m.rendered_text_matches(text,text if layout is None else layout,retired=retired)
        m.require_rendered_text(result,retired=retired)
        return result
    def test_current_canvas_requires_both_actual_labels(self):
        result=self.check('XI-IO\nSoftware',layout='REVIEW\nINSTALLATION')
        self.assertEqual(result['expected_labels'],['XI-IO Software','REVIEW INSTALLATION'])
        for text in ['', '   \n', 'XI-IO Software', 'REVIEW INSTALLATION']:
            with self.subTest(text=text),self.assertRaisesRegex(m.base.Unverified,'^ARTCRAFT_RENDERED_CONTENT_NOT_OBSERVED$'):
                self.check(text)
    def test_current_canvas_refuses_retired_or_upstream_mixture(self):
        for title in (m.RETIRED_TITLE,m.UPSTREAM_TITLE):
            for mode in ('primary','layout'):
                with self.subTest(title=title,mode=mode),self.assertRaisesRegex(m.base.Unverified,'^ARTCRAFT_MIXED_RENDERED_CONTENT$'):
                    self.check(self.positive+('\n'+title if mode=='primary' else ''),layout=self.positive+('\n'+title if mode=='layout' else ''))
    def test_no_fuzzy_brand_or_action_repairs(self):
        for text in ['XI-1O Software REVIEW INSTALLATION','xi-io software REVIEW INSTALLATION','XI-IO Software REVIEW INSTALLAT1ON','XI-IO Softwares REVIEW INSTALLATION','XI-IO Software Review installation','XI-IO Software Installation review available']:
            with self.subTest(text=text),self.assertRaises(m.base.Unverified):self.check(text)
    def test_dev12_requires_its_actual_title_without_current_or_upstream_content(self):
        result=self.check(self.retired,retired=True)
        self.assertEqual(result['expected_labels'],[m.RETIRED_TITLE])
        for text in ['', 'XI-IO CLI XI-IO Code Editor']:
            with self.subTest(text=text),self.assertRaisesRegex(m.base.Unverified,'^RETIRED_DEV12_RENDERED_TITLE_NOT_OBSERVED$'):
                self.check(text,retired=True)
        for forbidden in (m.ARTCRAFT_TITLE,m.ARTCRAFT_INSTALL_ACTION,m.UPSTREAM_TITLE):
            for mode in ('primary','layout'):
                with self.subTest(forbidden=forbidden,mode=mode),self.assertRaisesRegex(m.base.Unverified,'^RETIRED_DEV12_MIXED_RENDERED_CONTENT$'):
                    self.check(self.retired+('\n'+forbidden if mode=='primary' else ''),retired=True,layout=self.retired+('\n'+forbidden if mode=='layout' else ''))
    def test_duplicate_expected_text_in_either_pass_is_ambiguous(self):
        for retired in (False,True):
            good=self.retired if retired else self.positive
            code='RETIRED_DEV12_RENDERED_TEXT_AMBIGUOUS' if retired else 'ARTCRAFT_RENDERED_TEXT_AMBIGUOUS'
            for mode in ('primary','layout'):
                with self.subTest(retired=retired,mode=mode),self.assertRaisesRegex(m.base.Unverified,'^'+code+'$'):
                    self.check(good+('\n'+good if mode=='primary' else ''),retired=retired,layout=good+('\n'+good if mode=='layout' else ''))
    def test_labels_must_be_read_by_their_assigned_pass(self):
        with self.assertRaisesRegex(m.base.Unverified,'^ARTCRAFT_RENDERED_CONTENT_NOT_OBSERVED$'):
            self.check('REVIEW INSTALLATION',layout='XI-IO Software')
        with self.assertRaisesRegex(m.base.Unverified,'^RETIRED_DEV12_RENDERED_TITLE_NOT_OBSERVED$'):
            self.check('Setup',retired=True,layout=self.retired)
    def test_ocr_text_has_a_byte_budget(self):
        with self.assertRaisesRegex(m.base.Unverified,'^RENDERED_OCR_TEXT_BOUNDS$'):
            self.check('\u00e9'*(m.OCR_MAX_BYTES//2+1))

class OcrExecutor(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);tool=self.root/'hex-ocr-qualified'
        self.binary=tool/'bin/tesseract';self.binary.parent.mkdir(parents=True)
        self.binary.write_bytes(b'inert executor fixture');self.binary.chmod(0o755)
        self.language=tool/'share/tessdata/eng.traineddata';self.language.parent.mkdir(parents=True)
        self.language.write_bytes(b'X'*4113088)
        self.runtime=self.root/'libfixture.so';self.runtime.write_bytes(b'inert runtime fixture')
        self.archive=self.root/'hex-ocr-toolchain.tgz';self.archive.write_bytes(b'inert archive fixture')
        self.path=self.root/'hex-ocr-identity.json'
        def record(path,archive_path):
            return {'path':str(path),'bytes':path.stat().st_size,'sha256':m.file_digest(path),'archive_path':archive_path}
        language=record(self.language,'share/tessdata/eng.traineddata');language['git_blob']=m.OCR_LANGUAGE_BLOB
        runtime=record(self.runtime,'runtime/'+m.file_digest(self.runtime)+'-'+self.runtime.name)
        runtime['resolved_path']=runtime.pop('path')
        self.version='tesseract 5.5.0\n leptonica-1.84.1\n'
        self.identity={'schema':'xiio.hex.ocr-toolchain/v1','source_commit':'a'*40,'source_tree':'b'*40,
            'github_run_id':'17','github_run_attempt':'1','tesseract_source_commit':m.OCR_SOURCE,
            'leptonica_source_commit':m.OCR_IMAGE_SOURCE,'language_source_commit':m.OCR_LANGUAGE_SOURCE,
            'version_first_line':'tesseract 5.5.0','version_full':self.version,
            'executable':record(self.binary,'bin/tesseract'),'language':language,'runtime_files':[runtime],
            'archive':{'file':self.archive.name,'bytes':self.archive.stat().st_size,'sha256':m.file_digest(self.archive)},
            'static_ocr_libraries':True,'supported_input':'PNG','provider_effect':False,'pop_os_acceptance':False}
        # Inert tool bytes test binding/refusals. They never execute or qualify a native run.
        self.addCleanup(patch.stopall)
        patch.object(m,'OCR_LANGUAGE_SHA256',language['sha256']).start()
        self.env=patch.dict(m.os.environ,{'RUNNER_TEMP':str(self.root),'GITHUB_SHA':'a'*40,
            'GITHUB_RUN_ID':'17','GITHUB_RUN_ATTEMPT':'1','HEX_OCR_BINDING':str(self.path)}).start()
        self.write_identity()
    def write_identity(self):
        self.path.write_text(json.dumps(self.identity,sort_keys=True))
        m.os.environ['HEX_OCR_BINDING_SHA256']=m.file_digest(self.path)
    def completed(self,stdout,code=0):return m.subprocess.CompletedProcess([],code,stdout,b'')
    def test_fixed_executor_preserves_raw_output_and_records_version(self):
        raw=b'XI-IO Software\nREVIEW INSTALLATION\n\x0c'
        with patch.dict(m.os.environ,{'TESSDATA_PREFIX':'/wrong','LD_PRELOAD':'/wrong','LD_LIBRARY_PATH':'/wrong'}),patch.object(m.subprocess,'run',side_effect=[self.completed(self.version.encode()),self.completed(raw)]) as run:
            text,observed,version=m.read_ocr(Path('/tmp/owned-window.png'),20)
        self.assertEqual((text,observed,version),(raw.decode(),raw,'tesseract 5.5.0'))
        self.assertEqual(run.call_args.args[0],[str(self.binary),'/tmp/owned-window.png','stdout','--tessdata-dir',str(self.language.parent),'-l','eng','--psm','11'])
        self.assertTrue(all(key not in run.call_args.kwargs['env'] for key in ('TESSDATA_PREFIX','LD_PRELOAD','LD_LIBRARY_PATH')))
    def test_missing_or_failed_ocr_executor_is_not_content_evidence(self):
        self.binary.unlink()
        with patch.object(m.subprocess,'run') as run,self.assertRaises((m.base.Unverified,OSError)):
            m.read_ocr(Path('/tmp/owned-window.png'),20)
        run.assert_not_called()
        self.binary.write_bytes(b'inert executor fixture');self.binary.chmod(0o755)
        for result in [self.completed(b'',1),self.completed(b'\xff'),self.completed(b'x'*(m.OCR_MAX_BYTES+1)),m.subprocess.TimeoutExpired('tesseract',15)]:
            with self.subTest(result=type(result).__name__),patch.object(m.subprocess,'run',side_effect=[self.completed(self.version.encode()),result]),self.assertRaises(m.base.Unverified):
                m.read_ocr(Path('/tmp/owned-window.png'),20)
    def test_unbound_manifest_does_not_fall_back_to_system_ocr(self):
        with patch.dict(m.os.environ,{'HEX_OCR_BINDING_SHA256':''}),patch.object(m.subprocess,'run') as run,self.assertRaisesRegex(m.base.Unverified,'^RENDERED_OCR_BINDING_REQUIRED$'):
            m.read_ocr(Path('/tmp/owned-window.png'),20)
        run.assert_not_called()
    def test_old_executor_version_is_refused_before_image_read(self):
        with patch.object(m.subprocess,'run',return_value=self.completed(b'tesseract 4.1.1\n')) as run,self.assertRaisesRegex(m.base.Unverified,'^RENDERED_OCR_VERSION_UNVERIFIED$'):
            m.read_ocr(Path('/tmp/owned-window.png'),20)
        self.assertEqual(run.call_count,1)
    def test_changed_binary_or_runtime_is_refused_before_execution(self):
        binding=m.load_ocr_toolchain()
        for path in (self.binary,self.runtime):
            original=path.read_bytes();path.write_bytes(original+b'changed')
            with self.subTest(path=path.name),patch.object(m.subprocess,'run') as run,self.assertRaisesRegex(m.base.Unverified,'^RENDERED_OCR_BYTES_CHANGED$'):
                m.read_ocr(Path('/tmp/owned-window.png'),20,toolchain=binding)
            run.assert_not_called();path.write_bytes(original)
    def test_language_change_during_read_cannot_qualify_output(self):
        def image_read(*args,**kwargs):
            self.language.write_bytes(b'Y'*4113088)
            return self.completed(b'XI-IO Software\nREVIEW INSTALLATION\n')
        calls=0
        def dispatch(*args,**kwargs):
            nonlocal calls
            calls+=1
            return self.completed(self.version.encode()) if calls==1 else image_read()
        with patch.object(m.subprocess,'run',side_effect=dispatch),self.assertRaisesRegex(m.base.Unverified,'^RENDERED_OCR_BYTES_CHANGED$'):
            m.read_ocr(Path('/tmp/owned-window.png'),20)
    def test_foreign_run_and_language_selection_refuse(self):
        original=json.loads(json.dumps(self.identity))
        for key,value,category in [('github_run_id','18','RENDERED_OCR_RUN_MISMATCH'),('tesseract_source_commit','f'*40,'RENDERED_OCR_TOOLCHAIN_MISMATCH')]:
            self.identity={**original,key:value};self.write_identity()
            with self.subTest(key=key),self.assertRaisesRegex(m.base.Unverified,'^'+category+'$'):
                m.load_ocr_toolchain()
        self.identity=json.loads(json.dumps(original));self.identity['language']['sha256']='f'*64;self.write_identity()
        with self.assertRaisesRegex(m.base.Unverified,'^RENDERED_OCR_SELECTION_MISMATCH$'):
            m.load_ocr_toolchain()
    def test_manifest_or_archive_mutation_refuses(self):
        binding=m.load_ocr_toolchain();self.path.write_text(self.path.read_text()+' ')
        with self.assertRaisesRegex(m.base.Unverified,'^RENDERED_OCR_BINDING_CHANGED$'):
            m.verify_ocr_toolchain(binding)
        self.write_identity();self.archive.write_bytes(b'changed archive')
        with self.assertRaisesRegex(m.base.Unverified,'^RENDERED_OCR_ARCHIVE_UNVERIFIED$'):
            m.load_ocr_toolchain()

class RenderedCapture(unittest.TestCase):
    def setUp(self):
        from PIL import Image
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.native=m.Software.__new__(m.Software)
        self.native.proof=self.root;self.native.geometry=(40,30,400,300)
        self.native.deadline=time.monotonic()+30
        self.native.guard=lambda:None
        self.native.command=lambda args:''
        self.image=Image.new('RGB',(640,480),(20,30,40))
        self.path=self.root/'fixture.png';self.image.save(self.path)
        self.digest=m.file_digest(self.path)
    def observe(self,raw=b'XI-IO Software\nREVIEW INSTALLATION\n',retired=False):
        with patch.object(m,'read_ocr',return_value=(raw.decode(),raw,'tesseract fixture')):
            self.native.rendered_content('fixture',self.digest,self.native.geometry,retired=retired)
    def test_exact_crop_and_uncorrected_text_bind_to_the_whole_capture(self):
        from PIL import Image
        self.observe()
        receipt=self.native.rendered_text_readback
        self.assertTrue(receipt['content_verified'])
        self.assertEqual(receipt['screenshot_sha256'],self.digest)
        self.assertEqual(receipt['owned_window_geometry'],[40,30,400,300])
        self.assertEqual(receipt['crop_rectangle'],[40,30,400,300])
        self.assertEqual(receipt['crop_sha256'],m.file_digest(self.root/receipt['crop_file']))
        self.assertEqual(receipt['raw_text_sha256'],m.file_digest(self.root/receipt['raw_text_file']))
        self.assertEqual(receipt['raw_text_bytes'],len(receipt['raw_text'].encode()))
        layout=receipt['layout_pass']
        self.assertEqual(layout['page_segmentation_mode'],3)
        self.assertEqual(layout['crop_sha256'],receipt['crop_sha256'])
        self.assertEqual(layout['raw_text_sha256'],m.file_digest(self.root/layout['raw_text_file']))
        self.assertEqual(layout['raw_text_bytes'],len(layout['raw_text'].encode()))
        with Image.open(self.root/receipt['crop_file']) as crop:
            self.assertEqual(crop.tobytes(),self.image.crop((40,30,440,330)).tobytes())
    def test_screenshot_identity_and_window_geometry_cannot_drift(self):
        with patch.object(m,'read_ocr') as ocr,self.assertRaisesRegex(m.base.Unverified,'^RENDERED_SCREENSHOT_DIGEST_MISMATCH$'):
            self.native.rendered_content('fixture','f'*64,self.native.geometry)
        ocr.assert_not_called()
        with patch.object(m,'read_ocr') as ocr,self.assertRaisesRegex(m.base.Unverified,'^RENDERED_WINDOW_GEOMETRY_CHANGED$'):
            self.native.rendered_content('fixture',self.digest,(41,30,400,300))
        ocr.assert_not_called()
    def test_crop_must_stay_inside_the_captured_display(self):
        self.native.geometry=(400,30,400,300)
        with patch.object(m,'read_ocr') as ocr,self.assertRaisesRegex(m.base.Unverified,'^RENDERED_WINDOW_CROP_OUTSIDE_CAPTURE$'):
            self.native.rendered_content('fixture',self.digest,self.native.geometry)
        ocr.assert_not_called()
    def test_blank_owned_window_is_refused_before_ocr(self):
        def blank(args):raise m.subprocess.CalledProcessError(1,args)
        self.native.command=blank
        with patch.object(m,'read_ocr') as ocr,self.assertRaisesRegex(m.base.Unverified,'^RENDERED_WINDOW_PIXELS_UNVERIFIED$'):
            self.native.rendered_content('fixture',self.digest,self.native.geometry)
        ocr.assert_not_called()
    def test_missing_text_retains_raw_diagnostics_without_qualification(self):
        with self.assertRaisesRegex(m.base.Unverified,'^ARTCRAFT_RENDERED_CONTENT_NOT_OBSERVED$'):
            self.observe(raw=b'XI-IO Software\n')
        receipt=self.native.rendered_text_readback
        self.assertFalse(receipt['content_verified'])
        self.assertEqual(receipt['raw_text'],'XI-IO Software\n')
        self.assertEqual(receipt['exact_match_counts']['layout']['REVIEW INSTALLATION'],0)
    def test_post_ocr_window_change_cannot_qualify_prior_pixels(self):
        count=0
        def guard():
            nonlocal count
            count+=1
            if count==3:self.native.geometry=(41,30,400,300)
        self.native.guard=guard
        with self.assertRaisesRegex(m.base.Unverified,'^RENDERED_WINDOW_GEOMETRY_CHANGED$'):self.observe()
        self.assertFalse(self.native.rendered_text_readback['content_verified'])
    def test_crop_mutation_between_passes_prevents_the_layout_read(self):
        def primary(crop,timeout,page_segmentation_mode):
            self.assertEqual(page_segmentation_mode,11)
            crop.write_bytes(b'changed after primary OCR')
            return 'XI-IO Software',b'XI-IO Software','tesseract fixture'
        with patch.object(m,'read_ocr',side_effect=primary) as ocr,self.assertRaisesRegex(m.base.Unverified,'^RENDERED_EVIDENCE_CHANGED$'):
            self.native.rendered_content('fixture',self.digest,self.native.geometry)
        self.assertEqual(ocr.call_count,1)
    def test_complementary_ocr_is_from_one_crop_and_keeps_exact_labels(self):
        # Preserve e54fef61's complementary-pass regression under the explicit
        # v2 pass assignments and separately retained raw-text identities.
        outputs=[('XI-IO Software',b'XI-IO Software','tesseract fixture'),('REVIEW INSTALLATION',b'REVIEW INSTALLATION','tesseract fixture')]
        with patch.object(m,'read_ocr',side_effect=outputs) as ocr:
            self.native.rendered_content('fixture',self.digest,self.native.geometry)
        self.assertEqual(ocr.call_count,2)
        self.assertEqual(ocr.call_args_list[0].args[0],ocr.call_args_list[1].args[0])
        self.assertEqual([call.kwargs['page_segmentation_mode'] for call in ocr.call_args_list],[11,3])
        self.assertTrue(self.native.rendered_text_readback['content_verified'])
        reading=self.native.rendered_text_readback
        self.assertEqual([reading['raw_text'].encode(),reading['layout_pass']['raw_text'].encode()],
                         [b'XI-IO Software',b'REVIEW INSTALLATION'])
        self.assertEqual(reading['exact_match_counts']['layout']['REVIEW INSTALLATION'],1)
    def test_ocr_and_title_failures_keep_retired_red_false(self):
        for category in ('RENDERED_OCR_EXECUTOR_UNAVAILABLE','RENDERED_WINDOW_PIXELS_UNVERIFIED','RETIRED_DEV12_RENDERED_TITLE_NOT_OBSERVED','RETIRED_DEV12_MIXED_RENDERED_CONTENT'):
            class Native:
                stage='software-retired-rendered-title'
                def run_retired(self):raise m.base.Unverified(category)
                def capture(self,name):return 'c'*64
            with self.subTest(category=category),tempfile.TemporaryDirectory() as directory:
                args=['probe','--retired-dev12','123','456','b'*40,directory,'/tmp/payload/usr/bin/xi-io-hex-dev','/tmp/dev12.deb']
                with patch.dict(m.os.environ,ENV),patch.object(m.sys,'argv',args),patch.object(m,'dev12_binding',return_value={}),patch.object(m,'Software',return_value=Native()):
                    self.assertEqual(m.main(),61)
                receipt=json.loads((Path(directory)/'hex-dev12-ui-red.json').read_text())
                self.assertFalse(receipt['red_established']);self.assertFalse(receipt['initialization_observed'])
                self.assertFalse(receipt['xiio_catalog_rendered']);self.assertFalse(receipt['domain_action_verified'])
                self.assertEqual(receipt['failure_category'],category)

class PaintedCapture(unittest.TestCase):
    def setUp(self):
        from PIL import Image
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.flat=self.root/'flat-fixture.png'
        self.painted=self.root/'painted-fixture.png'
        Image.new('RGB',(640,480),'white').save(self.flat)
        image=Image.new('RGB',(640,480))
        image.putdata([(x%256,y%256,(x+y)%256) for y in range(480) for x in range(640)])
        image.save(self.painted)
    def native(self,pictures):
        native=m.Software.__new__(m.Software)
        native.proof=self.root;native.geometry=(0,0,640,480)
        native.deadline=time.monotonic()+90
        native.guard=Mock();native.open_software=Mock()
        native.initialized=Mock(return_value=True)
        native.retired_controls=Mock(return_value=[{'fixture':'retired controls'}])
        native.rendered_content=Mock()
        native.promote_attempt=Mock()
        native.capture_count=0
        def command(args):
            if args[0]=='scrot':
                source=pictures[min(native.capture_count,len(pictures)-1)]
                native.capture_count+=1
                shutil.copyfile(source,args[-1]);return ''
            return m.subprocess.run(args,check=True,capture_output=True,text=True,timeout=5).stdout.strip()
        native.command=command
        return native
    def test_rejected_pixels_are_recaptured_after_fresh_controls_then_paint(self):
        for retired in (False,True):
            with self.subTest(retired=retired):
                native=self.native([self.flat,self.painted])
                with patch.object(m.base.time,'sleep'):
                    result=native.run_retired() if retired else native.run()
                digest=result[0] if retired else result
                self.assertEqual(digest,m.file_digest(self.painted))
                self.assertEqual(native.capture_count,2)
                check=native.retired_controls if retired else native.initialized
                self.assertGreaterEqual(check.call_count,5)
                native.rendered_content.assert_called_once()
                self.assertEqual(native.rendered_content.call_args.args[1:],(digest,(0,0,640,480)))
    def test_persistent_prepaint_remains_unverified_and_never_establishes_red(self):
        native=self.native([self.flat])
        args=['probe','--retired-dev12','123','456','b'*40,str(self.root),'/tmp/payload/usr/bin/xi-io-hex-dev','/tmp/dev12.deb']
        with patch.dict(m.os.environ,ENV),patch.object(m.sys,'argv',args),patch.object(m,'dev12_binding',return_value={}),patch.object(m,'Software',return_value=native),patch.object(m.base.time,'sleep'):
            self.assertEqual(m.main(),61)
        receipt=json.loads((self.root/'hex-dev12-ui-red.json').read_text())
        self.assertFalse(receipt['red_established']);self.assertFalse(receipt['initialization_observed'])
        self.assertEqual(receipt['failure_category'],'PNG_BLANK_OR_PREPAINT')
        self.assertEqual(native.capture_count,41)  # forty bounded attempts plus failure evidence
        native.rendered_content.assert_not_called()
    def test_changed_readiness_prevents_a_later_capture_from_qualifying(self):
        for retired in (False,True):
            with self.subTest(retired=retired):
                native=self.native([self.flat,self.painted])
                category='RETIRED_DEV12_READINESS_PRESENT' if retired else 'ARTCRAFT_INITIALIZATION_NOT_OBSERVED'
                def ready():
                    if native.capture_count:raise m.base.Unverified(category)
                    return True
                if retired:native.retired_controls=Mock(side_effect=ready)
                else:native.initialized=Mock(side_effect=ready)
                with patch.object(m.base.time,'sleep'),self.assertRaisesRegex(m.base.Unverified,'^'+category+'$'):
                    native.run_retired() if retired else native.run()
                self.assertEqual(native.capture_count,1)
                native.rendered_content.assert_not_called()
    def test_changed_process_identity_refuses_after_the_rejected_frame(self):
        native=self.native([self.flat,self.painted])
        def guard():
            if native.capture_count:raise m.base.Unverified('PROCESS_IDENTITY_CHANGED')
        native.guard=Mock(side_effect=guard)
        with patch.object(m.base.time,'sleep'),self.assertRaisesRegex(m.base.Unverified,'^PROCESS_IDENTITY_CHANGED$'):
            native.run_retired()
        self.assertEqual(native.capture_count,1)
        native.rendered_content.assert_not_called()
    def test_geometry_is_fresh_for_the_successful_capture(self):
        native=self.native([self.flat,self.painted])
        def guard():
            native.geometry=(5,6,600,450) if native.capture_count else (0,0,640,480)
        native.guard=Mock(side_effect=guard)
        with patch.object(m.base.time,'sleep'):native.run_retired()
        self.assertEqual(native.capture_count,2)
        self.assertEqual(native.rendered_content.call_args.args[2],(5,6,600,450))

class SameFrameAttempts(unittest.TestCase):
    setUp=PaintedCapture.setUp
    native=PaintedCapture.native
    def real_reader(self):
        native=self.native([self.painted])
        native.rendered_content=lambda *args,**kwargs:m.Software.rendered_content(native,*args,**kwargs)
        native.promote_attempt=lambda *args:m.Software.promote_attempt(native,*args)
        return native
    def ocr(self,text):
        raw=text.encode()
        return text,raw,'tesseract fixture'
    def test_only_missing_title_retries_with_a_fresh_frame(self):
        # e54fef61's fresh-retired-frame regression also verifies canonical
        # promotion and immutable failed-attempt custody in v2.
        native=self.real_reader()
        def ocr(crop,timeout,page_segmentation_mode):
            self.assertEqual(crop.parent,native.proof)
            return self.ocr('Setup Local Installation' if native.capture_count==1 else m.RETIRED_TITLE)
        with patch.object(m,'read_ocr',side_effect=ocr),patch.object(m.base.time,'sleep'):
            native.run_retired()
        self.assertEqual(native.capture_count,2)
        manifest=json.loads((self.root/native.rendered_attempts['manifest_file']).read_text())
        self.assertEqual([row['outcome'] for row in manifest['attempts']],['RETRYABLE','OBSERVED'])
        first,second=[self.root/row['directory'] for row in manifest['attempts']]
        self.assertNotEqual(first,second)
        self.assertEqual((first/'software-retired-dev12-owned-window.ocr.txt').read_text(),'Setup Local Installation')
        self.assertEqual((second/'software-retired-dev12-owned-window.ocr.txt').read_text(),m.RETIRED_TITLE)
        self.assertEqual(manifest['accepted_attempt'],second.relative_to(self.root).as_posix())
        for name in ['software-retired-dev12.png','software-retired-dev12-owned-window.png','software-retired-dev12-owned-window.ocr.txt','software-retired-dev12-owned-window.layout.ocr.txt']:
            self.assertEqual((self.root/name).read_bytes(),(second/name).read_bytes())
    def test_secondary_pass_cannot_hide_mixed_or_duplicate_pixels(self):
        # Preserve e54fef61's mixed/duplicate secondary-pass cases, with a
        # distinct terminal duplicate category rather than a retryable absence.
        for extra,code in [(m.UPSTREAM_TITLE,'ARTCRAFT_MIXED_RENDERED_CONTENT'),(m.ARTCRAFT_INSTALL_ACTION+' '+m.ARTCRAFT_INSTALL_ACTION,'ARTCRAFT_RENDERED_TEXT_AMBIGUOUS')]:
            with self.subTest(code=code),tempfile.TemporaryDirectory() as directory:
                native=self.real_reader();native.proof=Path(directory)
                def ocr(crop,timeout,page_segmentation_mode):
                    return self.ocr(m.ARTCRAFT_TITLE if page_segmentation_mode==11 else m.ARTCRAFT_INSTALL_ACTION+' '+extra)
                with patch.object(m,'read_ocr',side_effect=ocr),patch.object(m.base.time,'sleep'),self.assertRaisesRegex(m.base.Unverified,'^'+code+'$'):
                    native.run()
                self.assertEqual(native.capture_count,1)
                manifest=json.loads((native.proof/native.rendered_attempts['manifest_file']).read_text())
                self.assertIsNone(manifest['accepted_attempt'])
                self.assertEqual(manifest['attempts'][0]['outcome'],'REFUSED')
    def test_mixed_title_is_terminal(self):
        # Preserve e54fef61's retired-loop terminal check; a duplicate retired
        # title is also terminal, never treated as a missing title to retry.
        for duplicate,code in [(False,'RETIRED_DEV12_MIXED_RENDERED_CONTENT'),(True,'RETIRED_DEV12_RENDERED_TEXT_AMBIGUOUS')]:
            with self.subTest(code=code),tempfile.TemporaryDirectory() as directory:
                native=self.real_reader();native.proof=Path(directory)
                def ocr(crop,timeout,page_segmentation_mode):
                    text=m.RETIRED_TITLE
                    if duplicate and page_segmentation_mode==11:text+=' '+m.RETIRED_TITLE
                    if not duplicate and page_segmentation_mode==3:text+=' '+m.ARTCRAFT_TITLE
                    return self.ocr(text)
                with patch.object(m,'read_ocr',side_effect=ocr),patch.object(m.base.time,'sleep'),self.assertRaisesRegex(m.base.Unverified,'^'+code+'$'):
                    native.run_retired()
                self.assertEqual(native.capture_count,1)
                manifest=json.loads((native.proof/native.rendered_attempts['manifest_file']).read_text())
                self.assertIsNone(manifest['accepted_attempt'])
                self.assertEqual(manifest['attempts'][0]['outcome'],'REFUSED')
                self.assertFalse((native.proof/'software-retired-dev12.png').exists())
    def test_existing_final_evidence_is_never_overwritten(self):
        native=self.real_reader()
        original=self.root/'software-retired-dev12.png';original.write_bytes(b'foreign proof')
        with patch.object(m,'read_ocr',return_value=self.ocr(m.RETIRED_TITLE)),patch.object(m.base.time,'sleep'),self.assertRaisesRegex(m.base.Unverified,'^ARTCRAFT_PROOF_PATH_EXISTS$'):
            native.run_retired()
        self.assertEqual(original.read_bytes(),b'foreign proof')
        self.assertFalse((self.root/'software-retired-dev12-owned-window.png').exists())
        manifest=json.loads((self.root/native.rendered_attempts['manifest_file']).read_text())
        self.assertIsNone(manifest['accepted_attempt'])
    def test_persistent_missing_text_exhausts_only_forty_distinct_attempts(self):
        native=self.real_reader()
        # Pixels are already covered by the actual checker tests above. This
        # fixture isolates the bounded semantic retry and retained file custody.
        def command(args):
            if args[0]=='scrot':
                native.capture_count+=1
                shutil.copyfile(self.painted,args[-1])
            return ''
        native.command=command
        with patch.object(m,'read_ocr',return_value=self.ocr('Setup Local Installation')),patch.object(m.base.time,'sleep'),self.assertRaisesRegex(m.base.Unverified,'^RETIRED_DEV12_RENDERED_TITLE_NOT_OBSERVED$'):
            native.run_retired()
        self.assertEqual(native.capture_count,40)
        manifest=json.loads((self.root/native.rendered_attempts['manifest_file']).read_text())
        self.assertEqual(len(manifest['attempts']),40)
        self.assertEqual(len({row['directory'] for row in manifest['attempts']}),40)
        self.assertIsNone(manifest['accepted_attempt'])
        self.assertFalse((self.root/'software-retired-dev12.png').exists())
        self.assertFalse(native.rendered_text_readback['content_verified'])

if __name__=='__main__':unittest.main()
