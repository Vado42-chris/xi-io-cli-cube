#!/usr/bin/env python3
"""Finite content and artifact-identity controls, no native launch or effects."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('hex_library_capture', ROOT / 'scripts/verify-installed-hex-library.py')
CAPTURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAPTURE)


class Content(unittest.TestCase):
    def rows(self):
        return [{'name': name, 'role': role, 'visible': True} for name, role in CAPTURE.EXPECTED_CONTROLS]

    def test_exact_visible_library_controls(self):
        self.assertEqual(CAPTURE.select_content_controls(self.rows()), self.rows())

    def test_heading_line_break_is_only_whitespace_normalized(self):
        rows = self.rows()
        rows[1]['name'] = 'Your XI-IO\nlibrary.'
        self.assertEqual(len(CAPTURE.select_content_controls(rows)), 3)

    def test_window_title_does_not_prove_content(self):
        with self.assertRaises(CAPTURE.Unverified):
            CAPTURE.select_content_controls([{'name': 'XI-IO HEX', 'role': 'heading', 'visible': True}])

    def test_each_missing_hidden_or_wrong_role_control_refuses(self):
        for index in range(3):
            for change in ('missing', 'hidden', 'role'):
                with self.subTest(index=index, change=change):
                    rows = self.rows()
                    if change == 'missing': rows.pop(index)
                    elif change == 'hidden': rows[index]['visible'] = False
                    else: rows[index]['role'] = 'text'
                    with self.assertRaises(CAPTURE.Unverified):
                        CAPTURE.select_content_controls(rows)

    def test_duplicate_matching_control_refuses(self):
        with self.assertRaises(CAPTURE.Unverified):
            CAPTURE.select_content_controls(self.rows() + [self.rows()[0]])

    def test_deprecated_catalog_is_not_library(self):
        rows = self.rows()
        rows[1]['name'] = 'XI-IO Ecosystem Component Catalog'
        with self.assertRaises(CAPTURE.Unverified):
            CAPTURE.select_content_controls(rows)

    def test_empty_heading_name_uses_bounded_text_interface(self):
        calls = []
        value = 'Your XI-IO\nlibrary.'
        class Heading:
            def get_text_iface(self): return self
            def get_character_count(self): return len(value)
            def get_text(self, start, end):
                calls.append((start, end))
                return value[start:end]
        rows = self.rows()
        rows[1].update(name='', text=CAPTURE.read_heading_text(Heading()))
        self.assertEqual(CAPTURE.select_content_controls(rows), rows)
        self.assertEqual(calls, [(0, len(value))])
        self.assertEqual(rows[1]['name'], '')
        self.assertEqual(rows[1]['text'], value)

    def test_wrong_or_hidden_heading_text_cannot_qualify(self):
        for change in ({'text':'XI-IO Ecosystem Component Catalog'},
                       {'name':'', 'text':'Your XI-IO library.', 'visible':False}):
            with self.subTest(change=change):
                rows = self.rows()
                rows[1].update(change)
                with self.assertRaisesRegex(CAPTURE.Unverified, '^HEX_LIBRARY_CONTENT_NOT_OBSERVED$'):
                    CAPTURE.select_content_controls(rows)

    def test_button_text_cannot_replace_its_semantic_name(self):
        rows = self.rows()
        rows[0].update(name='', text='Back to Library')
        with self.assertRaisesRegex(CAPTURE.Unverified, '^HEX_LIBRARY_CONTENT_NOT_OBSERVED$'):
            CAPTURE.select_content_controls(rows)

    def test_heading_text_unavailable_or_over_budget_refuses(self):
        class TooLarge:
            def get_text_iface(self): return self
            def get_character_count(self): return CAPTURE.MAX_CONTROL_TEXT + 1
            def get_text(self, start, end): raise AssertionError('must refuse before reading')
        with self.assertRaisesRegex(CAPTURE.Unverified, '^ACCESSIBILITY_HEADING_TEXT_BOUNDS$'):
            CAPTURE.read_heading_text(TooLarge())
        class Unavailable:
            def get_text_iface(self): raise RuntimeError('provider unavailable')
        with self.assertRaisesRegex(CAPTURE.Unverified, '^ACCESSIBILITY_HEADING_TEXT_UNAVAILABLE$'):
            CAPTURE.read_heading_text(Unavailable())
        self.assertIsNone(CAPTURE.read_heading_text(SimpleNamespace(get_text_iface=lambda: None)))


class RetiredContent(unittest.TestCase):
    def rows(self):
        return ([{'name': name, 'role': role, 'visible': True} for name, role in CAPTURE.RETIRED_CONTROLS]
                + [{'name': name + ' Reference fixture. Installed on this computer: not reported Requirements: fixture',
                    'role': 'button', 'visible': True} for name in CAPTURE.RETIRED_CARD_NAMES])

    def test_visible_retired_catalog_and_current_selector_refusal(self):
        rows = self.rows()
        self.assertEqual(CAPTURE.select_retired_controls(rows), rows)
        with self.assertRaisesRegex(CAPTURE.Unverified, '^HEX_LIBRARY_CONTENT_NOT_OBSERVED$'):
            CAPTURE.select_content_controls(rows)

    def test_retired_heading_text_preserves_same_exact_negative_control(self):
        rows = self.rows()
        rows[0].update(name='', text='XI-IO Ecosystem Component Catalog')
        self.assertEqual(CAPTURE.select_retired_controls(rows), rows)
        rows[0]['text'] = 'Your XI-IO library.'
        with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_CATALOG_NOT_OBSERVED$'):
            CAPTURE.select_retired_controls(rows)
        rows[0].update(text='XI-IO Ecosystem Component Catalog', visible=False)
        with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_CATALOG_NOT_OBSERVED$'):
            CAPTURE.select_retired_controls(rows)

    def test_window_title_or_absent_rows_cannot_establish_red(self):
        for rows in ([], [{'name': 'XI-IO HEX', 'role': 'heading', 'visible': True}]):
            with self.subTest(rows=rows):
                with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_CATALOG_NOT_OBSERVED$'):
                    CAPTURE.select_retired_controls(rows)

    def test_each_missing_hidden_or_wrong_role_retired_control_refuses(self):
        for index in range(3):
            for change in ('missing', 'hidden', 'role'):
                with self.subTest(index=index, change=change):
                    rows = self.rows()
                    if change == 'missing': rows.pop(index)
                    elif change == 'hidden': rows[index]['visible'] = False
                    else: rows[index]['role'] = 'text'
                    with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_CATALOG_NOT_OBSERVED$'):
                        CAPTURE.select_retired_controls(rows)

    def test_duplicate_retired_catalog_control_refuses(self):
        with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_CATALOG_NOT_OBSERVED$'):
            CAPTURE.select_retired_controls(self.rows() + [self.rows()[0]])

    def test_product_name_without_reference_state_does_not_establish_red(self):
        rows = self.rows()
        rows[1]['name'] = 'XI-IO CLI Open installed product'
        with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_CATALOG_NOT_OBSERVED$'):
            CAPTURE.select_retired_controls(rows)

    def test_current_library_controls_cannot_pass_negative_mode(self):
        current = [{'name': name, 'role': role, 'visible': True} for name, role in CAPTURE.EXPECTED_CONTROLS]
        with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_CATALOG_UNEXPECTEDLY_QUALIFIED$'):
            CAPTURE.select_retired_controls(self.rows() + current)

    def test_missing_or_unrelated_package_cannot_establish_red(self):
        with tempfile.TemporaryDirectory() as directory:
            proof = Path(directory)
            package = proof / 'unrelated.deb'
            executable = proof / 'payload/usr/bin/xi-io-hex-dev'
            with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_PACKAGE_UNAVAILABLE$'):
                CAPTURE.verify_retired_package(package, executable, proof)
            package.write_bytes(b'unit fixture, not released DEV12')
            with self.assertRaisesRegex(CAPTURE.Unverified, '^RETIRED_PACKAGE_DIGEST_MISMATCH$'):
                CAPTURE.verify_retired_package(package, executable, proof)


class Diagnostics(unittest.TestCase):
    def native(self, rows, complete=True):
        return SimpleNamespace(last_rows=rows, last_rows_complete=complete,
                               last_observation_failure='HEX_LIBRARY_CONTENT_NOT_OBSERVED')

    def test_unavailable_partial_and_observed_mismatch_are_distinct(self):
        missing = CAPTURE.content_diagnostics(None)
        self.assertEqual(missing['accessibility_state'], 'NOT_OBSERVED')
        self.assertEqual(missing['last_observed_rows'], [])
        rows = [{'role':'heading', 'name':'', 'text':'A different heading', 'visible':True}]
        partial = CAPTURE.content_diagnostics(self.native(rows, complete=False))
        observed = CAPTURE.content_diagnostics(self.native(rows))
        self.assertEqual(partial['accessibility_state'], 'PARTIAL')
        self.assertEqual(observed['accessibility_state'], 'COMPLETE')
        self.assertEqual(observed['last_observed_rows'], rows)
        heading = next(item for item in observed['missing_controls'] if item['role'] == 'heading')
        self.assertEqual(heading['visible_role_count'], 1)
        self.assertEqual(heading['visible_exact_matches'], 0)
        self.assertTrue(all(value['ui_correctness'] == 'UNVERIFIED' for value in (missing, partial, observed)))

    def test_hidden_match_and_bounded_diagnostics(self):
        rows = [{'role':'heading', 'name':'', 'text':'Your XI-IO library.', 'visible':False}]
        result = CAPTURE.content_diagnostics(self.native(rows))
        heading = next(item for item in result['missing_controls'] if item['role'] == 'heading')
        self.assertEqual(heading['status'], 'NOT_VISIBLE')
        self.assertEqual(heading['hidden_exact_matches'], 1)
        rows = [{'role':'heading', 'name':'n' * 700, 'text':'t' * 700, 'visible':True}
                for _ in range(CAPTURE.MAX_DIAGNOSTIC_ROWS + 1)]
        result = CAPTURE.content_diagnostics(self.native(rows))
        self.assertTrue(result['rows_truncated'])
        self.assertEqual(result['observed_control_count'], len(rows))
        self.assertEqual(len(result['last_observed_rows']), CAPTURE.MAX_DIAGNOSTIC_ROWS)
        for row in result['last_observed_rows']:
            self.assertEqual(len(row['name']), CAPTURE.MAX_DIAGNOSTIC_TEXT)
            self.assertEqual(len(row['text']), CAPTURE.MAX_DIAGNOSTIC_TEXT)
            self.assertTrue(row['name_truncated'] and row['text_truncated'])


class FrontendIdentity(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.dist = self.root / 'dist'
        (self.dist / 'assets').mkdir(parents=True)
        (self.dist / 'index.html').write_text('<script src="assets/app.js"></script>')
        (self.dist / 'assets/app.js').write_text('/* exact built fixture bytes */')
        self.archive = self.root / 'hex-built-frontend.tgz'
        self.archive.write_bytes(b'opaque archive identity fixture')
        self.path = self.root / 'hex-native-frontend-identity.json'
        self.receipt = {
            'source_commit': 'a' * 40, 'native_elf_sha256': 'b' * 64,
            'frontend_staged_match': True,
            'qualification': 'BUILT_FRONTEND_NOT_INSTALLED_ACCEPTANCE',
            'frontend_archive_sha256': CAPTURE.sha_file(self.archive),
            'frontend_files': {str(p.relative_to(self.dist)): {'bytes': p.stat().st_size, 'sha256': CAPTURE.sha_file(p)} for p in sorted(self.dist.rglob('*')) if p.is_file()},
        }
        self.save()

    def save(self):
        self.path.write_text(json.dumps(self.receipt))

    def read(self):
        return CAPTURE.read_frontend_identity(self.path, 'a' * 40, 'b' * 64)

    def test_exact_frontend_and_archive_reopen(self):
        self.assertEqual(self.read(), self.receipt)

    def test_source_elf_stage_or_scope_mismatch_refuses(self):
        for key, value in [('source_commit', 'c' * 40), ('native_elf_sha256', 'd' * 64), ('frontend_staged_match', False), ('qualification', 'INSTALLED_ACCEPTANCE')]:
            with self.subTest(key=key):
                original = self.receipt[key]
                self.receipt[key] = value
                self.save()
                with self.assertRaises(CAPTURE.Unverified): self.read()
                self.receipt[key] = original
                self.save()

    def test_changed_archive_refuses(self):
        self.archive.write_bytes(b'other archive bytes')
        with self.assertRaisesRegex(CAPTURE.Unverified, 'FRONTEND_ARCHIVE_CHANGED'): self.read()

    def test_changed_asset_refuses(self):
        (self.dist / 'assets/app.js').write_text('/* different built frontend */')
        with self.assertRaisesRegex(CAPTURE.Unverified, 'FRONTEND_BYTES_CHANGED'): self.read()

    def test_additional_or_missing_asset_refuses(self):
        extra = self.dist / 'assets/other.js'
        extra.write_text('/* unrelated */')
        with self.assertRaisesRegex(CAPTURE.Unverified, 'FRONTEND_BYTES_CHANGED'): self.read()
        extra.unlink()
        (self.dist / 'assets/app.js').unlink()
        with self.assertRaisesRegex(CAPTURE.Unverified, 'FRONTEND_BYTES_CHANGED'): self.read()

    def test_symlink_asset_refuses(self):
        (self.dist / 'assets/linked.js').symlink_to(self.dist / 'assets/app.js')
        with self.assertRaisesRegex(CAPTURE.Unverified, 'FRONTEND_SYMLINK_REFUSED'): self.read()

    def test_empty_frontend_denominator_refuses(self):
        self.receipt['frontend_files'] = {}
        self.save()
        with self.assertRaisesRegex(CAPTURE.Unverified, 'FRONTEND_FILES_MISSING'): self.read()


if __name__ == '__main__':
    unittest.main()
