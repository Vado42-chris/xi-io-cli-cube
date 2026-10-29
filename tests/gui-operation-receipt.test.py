import importlib.util
import json
import pathlib
import tempfile
import unittest
import contextlib
import io
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('receipt', ROOT/'scripts/journal-hex-gui-observation.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ReceiptTests(unittest.TestCase):
    def test_nonzero_status_and_sanitized_failure_are_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            code, r = m.observe(d, 'a'*40, 'original', '123-1', lambda:85)
            self.assertEqual(code,85)
            self.assertEqual(r['schema_version'],'xiio-operation-inspection-v1')
            self.assertEqual(r['final_state'],'failed')
            self.assertEqual(r['event_count'],2)
            self.assertTrue(r['event_chain_valid'])
            self.assertEqual(r['events'][-1]['failure_category'],'CAPTURE_BLANK_OR_PREPAINT')
            self.assertNotIn(d,json.dumps(r))
            self.assertFalse(r['events'][-1]['details']['work_ingestion_verified'])
            self.assertFalse(r['events'][-1]['details']['owner_ack_verified'])
            self.assertEqual(json.loads((pathlib.Path(d)/'operation-inspection.json').read_text()),r)

    def test_pass_does_not_become_semantic_or_installed_acceptance(self):
        with tempfile.TemporaryDirectory() as d:
            code,r=m.observe(d,'b'*40,'webkit-default','123-1',lambda:0)
            self.assertEqual(code,0)
            self.assertEqual(r['final_state'],'passed')
            self.assertFalse(r['events'][-1]['details']['semantic_ui_verified'])
            self.assertFalse(r['events'][-1]['details']['installed_package'])

    def test_interruption_keeps_unknown_without_exception_text(self):
        with tempfile.TemporaryDirectory() as d:
            def interrupted(): raise RuntimeError('DO_NOT_PUBLISH_RAW_PROCESS_MESSAGE')
            errors=io.StringIO()
            with contextlib.redirect_stderr(errors):
                code,_=m.observe(d,'c'*40,'original','123-1',interrupted)
            self.assertEqual(code,70)
            self.assertNotIn('DO_NOT_PUBLISH',errors.getvalue())
            r=m.inspect_operation('hex-gui-123-1-original',root=pathlib.Path(d)/'operation-state')
            self.assertEqual(r['final_state'],'unknown')
            self.assertNotIn('DO_NOT_PUBLISH',json.dumps(r))

    def test_replay_never_invokes_second_observation(self):
        with tempfile.TemporaryDirectory() as d:
            m.observe(d,'d'*40,'original','123-1',lambda:85)
            code,_=m.observe(d,'d'*40,'original','123-1',lambda:self.fail('second observation'))
            self.assertEqual(code,72)

    def test_disk_write_failure_preserves_render_failure_and_blocks_paint_pass(self):
        for render_status in (85,0):
            with tempfile.TemporaryDirectory() as d:
                errors=io.StringIO()
                with patch('xiio_installer.observability._append_private',side_effect=OSError('PRIVATE_DISK_TEXT')), contextlib.redirect_stderr(errors):
                    code,r=m.observe(d,'a'*40,'original','123-1',lambda:render_status)
                self.assertEqual(code,render_status or 70)
                self.assertIsNone(r)
                self.assertEqual(errors.getvalue(),'HEX_OPERATION_LOGGING_UNAVAILABLE\n')

    def test_readback_failure_preserves_render_failure_and_blocks_paint_pass(self):
        for render_status in (85,0):
            with tempfile.TemporaryDirectory() as d:
                def unreadable(*args,**kwargs): raise OSError('PRIVATE_READBACK_TEXT')
                errors=io.StringIO()
                with contextlib.redirect_stderr(errors):
                    code,r=m.observe(d,'a'*40,'original','123-1',lambda:render_status,inspector=unreadable)
                self.assertEqual(code,render_status or 71)
                self.assertIsNone(r)
                self.assertEqual(errors.getvalue(),'HEX_OPERATION_READBACK_UNVERIFIED\n')

    def test_terminal_write_failure_does_not_append_second_terminal(self):
        with tempfile.TemporaryDirectory() as d:
            original=m.OperationJournal.finish
            def fail_terminal(*args,**kwargs): raise OSError('PRIVATE_TERMINAL_TEXT')
            errors=io.StringIO()
            with patch.object(m.OperationJournal,'finish',side_effect=fail_terminal), contextlib.redirect_stderr(errors):
                code,r=m.observe(d,'a'*40,'original','123-1',lambda:85)
            self.assertEqual(code,85)
            self.assertIsNone(r)
            saved=m.inspect_operation('hex-gui-123-1-original',root=pathlib.Path(d)/'operation-state')
            self.assertEqual(saved['final_state'],'unknown')
            self.assertEqual(saved['event_count'],1)
            self.assertEqual(errors.getvalue(),'HEX_OPERATION_LOGGING_UNAVAILABLE\n')

    def test_misassociated_or_extra_readback_is_never_projected(self):
        def field(name,value): return lambda r:r.__setitem__(name,value)
        def detail(name,value): return lambda r:r['events'][1]['details'].__setitem__(name,value)
        cases = {
            'schema':field('schema_version','OTHER_PRIVATE_SCHEMA'),
            'operation':field('operation_id','other-operation'),
            'correlation':field('correlation_id','other-correlation'),
            'component':field('component','other-component'),
            'kind':field('operation','other-kind'),
            'source':detail('source_commit','b'*40),
            'mode':detail('render_mode','webkit-default'),
            'run':detail('provider_run_attempt','999-2'),
            'event_operation':lambda r:r['events'][0].__setitem__('operation_id','foreign'),
            'event_correlation':lambda r:r['events'][1].__setitem__('correlation_id','foreign'),
            'exit':lambda r:r['events'][1].__setitem__('exit_code',99),
            'category':lambda r:r['events'][1].__setitem__('failure_category','PRIVATE_UNKNOWN_TEXT'),
            'chain_truthy':field('event_chain_valid',1),
            'incomplete_falsy':field('incomplete',0),
            'count':field('event_count',3),
            'missing_event':lambda r:r['events'].pop(),
            'unknown_top_field':field('PRIVATE_UNKNOWN_KEY','PRIVATE_UNKNOWN_TEXT'),
            'unknown_event_field':lambda r:r['events'][1].__setitem__('raw_stderr','PRIVATE_UNKNOWN_TEXT'),
            'unknown_detail_field':detail('raw_stderr','PRIVATE_UNKNOWN_TEXT'),
        }
        for name,mutate in cases.items():
            for render_status in (85,0):
                with self.subTest(case=name,status=render_status), tempfile.TemporaryDirectory() as d:
                    def wrong_receipt(*args,**kwargs):
                        r=m.inspect_operation(*args,**kwargs)
                        mutate(r)
                        return r
                    errors=io.StringIO()
                    with contextlib.redirect_stderr(errors):
                        code,r=m.observe(d,'a'*40,'original','123-1',lambda:render_status,inspector=wrong_receipt)
                    self.assertEqual(code,render_status or 71)
                    self.assertIsNone(r)
                    self.assertEqual(errors.getvalue(),'HEX_OPERATION_READBACK_UNVERIFIED\n')
                    self.assertFalse((pathlib.Path(d)/'operation-inspection.json').exists())

    def test_projection_disk_failure_does_not_claim_capture(self):
        for render_status in (85,0):
            with tempfile.TemporaryDirectory() as d:
                real_open=m.os.open
                def failed_projection(path,*args,**kwargs):
                    if str(path).endswith('operation-inspection.json'):
                        raise OSError('PRIVATE_PROJECTION_ERROR')
                    return real_open(path,*args,**kwargs)
                errors=io.StringIO()
                with patch.object(m.os,'open',side_effect=failed_projection), contextlib.redirect_stderr(errors):
                    code,r=m.observe(d,'a'*40,'original','123-1',lambda:render_status)
                self.assertEqual(code,render_status or 71)
                self.assertIsNone(r)
                self.assertEqual(errors.getvalue(),'HEX_OPERATION_READBACK_UNVERIFIED\n')

if __name__=='__main__': unittest.main()
