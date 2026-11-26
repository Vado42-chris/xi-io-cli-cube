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

    def test_library_cannot_pass_with_a_visible_retired_heading(self):
        rows = self.rows()
        retired = {'name': '', 'text': 'XI-IO Ecosystem Component Catalog',
                   'role': 'heading', 'visible': True}
        with self.assertRaisesRegex(CAPTURE.Unverified, '^HEX_RETIRED_CATALOG_EXPOSED$'):
            CAPTURE.select_content_controls(rows + [retired])
        retired['visible'] = False
        self.assertEqual(CAPTURE.select_content_controls(rows + [retired]), rows)

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


class NativeHeadingCompatibility(unittest.TestCase):
    class Role:
        def __init__(self, name):
            self.value_nick = name

    def setUp(self):
        self.roles = SimpleNamespace(**{
            name: self.Role(name.lower().replace('_', '-'))
            for name in ('PUSH_BUTTON', 'HEADING', 'DOCUMENT_FRAME', 'STATIC', 'APPLICATION')
        })

    def ax_node(self, role, name, text=None, attrs=None, visible=True, children=()):
        bounds = SimpleNamespace(x=1, y=2, width=10, height=20)
        text_iface = (None if text is None else
                      SimpleNamespace(get_character_count=lambda: len(text),
                                      get_text=lambda start, end: text[start:end]))
        return SimpleNamespace(
            get_role=lambda: role, get_name=lambda: name,
            get_attributes=lambda: attrs or {}, get_text_iface=lambda: text_iface,
            get_child_count=lambda: len(children), get_child_at_index=children.__getitem__,
            get_process_id=lambda: 50, visible=visible,
            get_component_iface=lambda: SimpleNamespace(get_extents=lambda _: bounds),
        )

    def walk(self, children):
        roles = self.roles
        app = self.ax_node(roles.APPLICATION, '', children=children)
        native = CAPTURE.Native.__new__(CAPTURE.Native)
        native.pid = 50
        native.deadline = CAPTURE.time.monotonic() + 10
        native.visible = lambda node: node.visible
        native.last_observation_failure = None
        native.ax = SimpleNamespace(
            get_desktop=lambda _: self.ax_node(roles.APPLICATION, '', children=[app]), Role=roles,
            CoordType=SimpleNamespace(SCREEN=0))
        return native.rows()

    def heading(self, name, attrs=None, role=None, visible=True):
        return self.ax_node(role or self.roles.DOCUMENT_FRAME, '', text=name, attrs=attrs,
                            visible=visible)

    @staticmethod
    def attributes(level):
        return {'toolkit': 'WebKitGTK', 'computed-role': 'heading', 'tag': 'h'+level, 'level': level}

    def test_both_exact_package_selectors_read_same_node_webkit_heading_metadata(self):
        for retired, rows, selector, level in (
            (False, Content().rows(), CAPTURE.select_content_controls, '1'),
            (True, RetiredContent().rows(), CAPTURE.select_retired_controls, '2'),
        ):
            with self.subTest(retired=retired):
                heading, = (row['name'] for row in rows if row['role'] == 'heading')
                buttons = [self.ax_node(self.roles.PUSH_BUTTON, row['name']) for row in rows
                           if row['role'] == 'button']
                # Candidate's rendered heading contains a DOM line break.
                heading_text = heading if retired else 'Your XI-IO\nlibrary.'
                # The same numeric-role node must also provide exact accessible Text.
                picked = selector(self.walk(buttons + [self.heading(heading_text, self.attributes(level))]))
                adapted, = (row for row in picked if row['role'] == 'heading')
                self.assertEqual(adapted['heading_role_source'], 'WEBKITGTK_COMPUTED_HEADING')
                self.assertEqual(adapted['heading_raw_role'], 'document-frame')
                self.assertEqual(adapted['heading_level'], int(level))
                self.assertEqual(CAPTURE.control_text(adapted), heading)
                # Standard provider-correct HEADING still uses the original semantic path.
                direct = selector(self.walk(buttons + [self.heading(heading_text, role=self.roles.HEADING)]))
                direct_heading, = (row for row in direct if row['role'] == 'heading')
                self.assertNotIn('heading_role_source', direct_heading)

    def test_incomplete_contradictory_or_non_heading_provider_metadata_never_qualifies(self):
        good = self.attributes('1')
        variants = [
            ('frame without metadata', {}, self.roles.DOCUMENT_FRAME, True, 'Your XI-IO library.'),
            ('non-head computed role', dict(good, **{'computed-role': 'document'}), self.roles.DOCUMENT_FRAME, True, 'Your XI-IO library.'),
            ('no computed role', {k: v for k,v in good.items() if k != 'computed-role'}, self.roles.DOCUMENT_FRAME, True, 'Your XI-IO library.'),
            ('no tag', {k: v for k,v in good.items() if k != 'tag'}, self.roles.DOCUMENT_FRAME, True, 'Your XI-IO library.'),
            ('no level', {k: v for k,v in good.items() if k != 'level'}, self.roles.DOCUMENT_FRAME, True, 'Your XI-IO library.'),
            ('wrong level', dict(good, level='2'), self.roles.DOCUMENT_FRAME, True, 'Your XI-IO library.'),
            ('wrong toolkit', dict(good, toolkit='other'), self.roles.DOCUMENT_FRAME, True, 'Your XI-IO library.'),
            ('static role with same metadata', good, self.roles.STATIC, True, 'Your XI-IO library.'),
            ('hidden heading', good, self.roles.DOCUMENT_FRAME, False, 'Your XI-IO library.'),
            ('wrong text', good, self.roles.DOCUMENT_FRAME, True, 'A different heading'),
        ]
        buttons = [self.ax_node(self.roles.PUSH_BUTTON, row['name']) for row in Content().rows()
                   if row['role'] == 'button']
        for label, attrs, role, visible, text in variants:
            with self.subTest(label=label):
                with self.assertRaisesRegex(CAPTURE.Unverified, '^HEX_LIBRARY_CONTENT_NOT_OBSERVED$'):
                    CAPTURE.select_content_controls(self.walk(buttons + [self.heading(text, attrs, role, visible)]))

    def test_named_document_frame_without_same_node_text_does_not_qualify(self):
        node = self.ax_node(self.roles.DOCUMENT_FRAME, 'Your XI-IO library.',
                            attrs=self.attributes('1'))
        with self.assertRaisesRegex(CAPTURE.Unverified, '^ACCESSIBILITY_HEADING_TEXT_UNAVAILABLE$'):
            self.walk([node])

    def test_opposite_visible_heading_stays_an_explicit_refusal(self):
        for retired, rows, selector, failure in (
            (False, Content().rows(), CAPTURE.select_content_controls, 'HEX_RETIRED_CATALOG_EXPOSED'),
            (True, RetiredContent().rows() + Content().rows(), CAPTURE.select_retired_controls,
             'RETIRED_CATALOG_UNEXPECTEDLY_QUALIFIED'),
        ):
            with self.subTest(retired=retired):
                buttons = [self.ax_node(self.roles.PUSH_BUTTON, row['name']) for row in rows
                           if row['role'] == 'button']
                headings = [self.heading(name, self.attributes(level)) for name,level in
                            (('Your XI-IO library.', '1'), ('XI-IO Ecosystem Component Catalog', '2'))]
                with self.assertRaisesRegex(CAPTURE.Unverified, '^' + failure + '$'):
                    selector(self.walk(buttons + headings))


class Diagnostics(unittest.TestCase):
    def native(self, rows, complete=True):
        return SimpleNamespace(last_rows=rows, last_rows_complete=complete,
                               last_observation_failure='HEX_LIBRARY_CONTENT_NOT_OBSERVED')

    def test_live_collector_retains_raw_roles_without_granting_selector_credit(self):
        class Role:
            def __init__(self, name):
                self.value_nick = name

        button, heading, application, text = map(Role, ('push-button', 'heading', 'application', 'static'))
        def ax_node(role, name, children=()):
            bounds = SimpleNamespace(x=1, y=2, width=10, height=20)
            return SimpleNamespace(
                get_role=lambda: role, get_name=lambda: name,
                get_child_count=lambda: len(children), get_child_at_index=children.__getitem__,
                get_process_id=lambda: 50,
                get_component_iface=lambda: SimpleNamespace(get_extents=lambda _: bounds),
            )

        for retired, rows, select, failure in (
            (False, Content().rows(), CAPTURE.select_content_controls, 'HEX_LIBRARY_CONTENT_NOT_OBSERVED'),
            (True, RetiredContent().rows(), CAPTURE.select_retired_controls, 'RETIRED_CATALOG_NOT_OBSERVED'),
        ):
            with self.subTest(retired=retired):
                # Simulate the actual walking boundary, not invented qualifying headings.
                # A static text node bearing the exact heading label must not qualify.
                app = ax_node(application, '', [
                    ax_node(text if row['role'] == 'heading' else button, row['name'])
                    for row in rows
                ])
                native = CAPTURE.Native.__new__(CAPTURE.Native)
                native.pid = 50
                native.deadline = CAPTURE.time.monotonic() + 10
                native.visible = lambda _: True
                native.last_observation_failure = failure
                native.ax = SimpleNamespace(
                    get_desktop=lambda _: ax_node(application, '', [app]),
                    Role=SimpleNamespace(PUSH_BUTTON=button, HEADING=heading, DOCUMENT_FRAME=Role('document-frame')),
                    CoordType=SimpleNamespace(SCREEN=0))
                observed = native.rows()
                with self.assertRaisesRegex(CAPTURE.Unverified, '^' + failure + '$'):
                    select(observed)
                diagnostic = CAPTURE.content_diagnostics(native, retired=retired)
                self.assertEqual(diagnostic['ui_correctness'], 'UNVERIFIED')
                self.assertEqual(diagnostic['raw_role_counts'],
                                 {'application': 1, 'push-button': len(rows) - 1, 'static': 1})
                missing, = diagnostic['missing_controls']
                self.assertEqual(missing['status'], 'EXPECTED_ROLE_NOT_EXPOSED')

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
