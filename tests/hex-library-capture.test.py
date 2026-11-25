#!/usr/bin/env python3
"""Finite content and artifact-identity controls, no native launch or effects."""
import importlib.util
import json
from pathlib import Path
import tempfile
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
