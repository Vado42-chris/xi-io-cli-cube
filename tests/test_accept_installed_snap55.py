"""Pure hostile unit tests; these do not qualify an installed desktop window."""
from importlib.machinery import SourceFileLoader
import hashlib
import json
import pathlib
import tempfile
import unittest

GATE = SourceFileLoader('hex_maths_accept', str(pathlib.Path(__file__).parents[1]
    / 'scripts' / 'accept-installed-snap55.py')).load_module()


class FakeText:
    def __init__(self, value):
        self.value = value
        self.characterCount = len(value)
    def getText(self, first, last):
        return self.value[first:last]


class FakeNode:
    def __init__(self, role, name='', value='', children=()):
        self.role = role
        self.name = name
        self.value = value
        self.children = list(children)
        self.childCount = len(self.children)
    def getChildAtIndex(self, i):
        return self.children[i]
    def getRoleName(self):
        return self.role
    def queryText(self):
        if not self.value:
            raise NotImplementedError()
        return FakeText(self.value)


class GateTests(unittest.TestCase):
    def test_known_answer_is_independent_rational(self):
        self.assertAlmostEqual(GATE.independent_expected(4, 0), 0.48476190476190476, 14)
        self.assertAlmostEqual(GATE.independent_expected(0, 4), 0.4252380952380952, 14)
        self.assertNotEqual(GATE.independent_expected(4, 0), GATE.independent_expected(0, 4))

    def test_fixture_is_fixed_and_non_sensitive(self):
        example = json.loads(GATE.fixed_input(4, 0))
        self.assertEqual(example['nowMs'], '1793200000000')
        self.assertEqual(example['responses'], {'a': 4, 'b': 0})
        self.assertNotIn('token', GATE.fixed_input(4, 0).lower())

    def test_installed_result_must_come_from_status_tree(self):
        panel = FakeNode('section', 'Offline SNAP 5.5 maths workbench', children=[
            FakeNode('status bar', children=[FakeNode('text', value='State: SOURCE_BOUND_NUMERIC R: 0.48476190476190476')])
        ])
        self.assertAlmostEqual(GATE.observed_number(GATE.status_text(panel)),
                               GATE.independent_expected(4, 0))

    def test_missing_status_is_not_a_result(self):
        self.assertIsNone(GATE.status_text(FakeNode('section', children=[FakeNode('label', value='R: 0.48')])))
        with self.assertRaisesRegex(GATE.GateFailure, 'MATHS_RESULT_MISSING'):
            GATE.observed_number(None)

    def test_stale_state_fails(self):
        with self.assertRaisesRegex(GATE.GateFailure, 'MATHS_STATE_UNEXPECTED'):
            GATE.observed_number('State: UNKNOWN_REQUIRED_RESPONSES R: 0.48476190476190476')

    def test_wrong_answer_fails(self):
        with self.assertRaisesRegex(GATE.GateFailure, 'MATHS_WRONG_ANSWER'):
            GATE.assert_result(0.999, GATE.independent_expected(4, 0))

    def test_unknown_and_nan_answers_fail(self):
        for value in ['State: SOURCE_BOUND_NUMERIC R: UNKNOWN',
                      'State: SOURCE_BOUND_NUMERIC R: NaN',
                      'State: SOURCE_BOUND_NUMERIC R: Infinity']:
            with self.subTest(value=value), self.assertRaises(GATE.GateFailure):
                GATE.observed_number(value)

    def test_duplicate_different_results_fail(self):
        with self.assertRaisesRegex(GATE.GateFailure, 'MATHS_RESULT_MISSING_OR_AMBIGUOUS'):
            GATE.observed_number('State: SOURCE_BOUND_NUMERIC R: 0.42 R: 0.99')

    def test_identical_duplicate_accessibility_text_is_not_forged_additional_number(self):
        text = 'State: SOURCE_BOUND_NUMERIC R: 0.42 State: SOURCE_BOUND_NUMERIC R: 0.42'
        self.assertAlmostEqual(GATE.observed_number(text), 0.42)

    def test_ambiguous_controls_fail(self):
        with self.assertRaisesRegex(GATE.GateFailure, 'MATHS_EDITOR_AMBIGUOUS'):
            GATE.unique([FakeNode('entry', 'SNAP 5.5 input JSON')]*2,
                        lambda n: n.name == 'SNAP 5.5 input JSON',
                        'MATHS_EDITOR_MISSING', 'MATHS_EDITOR_AMBIGUOUS')

    def test_source_sha_must_be_exact(self):
        for value in ('', 'a'*39, 'z'*40, 'a'*41):
            with self.subTest(value=value), self.assertRaises(GATE.GateFailure):
                GATE.validate_hex_sha(value, 'SOURCE_COMMIT_INVALID')

    def test_hash_binding_refuses_mismatched_package(self):
        with tempfile.TemporaryDirectory() as d:
            f = pathlib.Path(d) / 'hashes'
            f.write_text('0'*64 + '  example.deb\n')
            with self.assertRaisesRegex(GATE.GateFailure, 'PACKAGE_HASH_MISMATCH'):
                GATE.validate_hash_file(f, hashlib.sha256(b'real package').hexdigest(),
                                        'PACKAGE_HASH_MISMATCH')

    def test_failure_receipt_never_goes_green_when_visual_is_missing(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            package = root / 'pkg.deb'; package.write_bytes(b'example package')
            exe = root / 'elf'; exe.write_bytes(b'example elf')
            psha = root / 'pkg.sha256'; psha.write_text(GATE.sha256(package) + ' pkg.deb\n')
            esha = root / 'elf.sha256'; esha.write_text(GATE.sha256(exe) + ' elf\n')
            visual = root / 'missing.json'; receipt = root / 'receipt.json'
            code = GATE.main([
                '--source', 'a'*40, '--package', str(package), '--package-sha-file', str(psha),
                '--executable', str(exe), '--elf-sha-file', str(esha),
                '--visual', str(visual), '--receipt', str(receipt), '--window', '123'],
                interact=lambda _: self.fail('the live GUI cannot be called without valid proof'))
            self.assertEqual(code, 88)
            data = json.loads(receipt.read_text())
            self.assertEqual(data['state'], 'FAILED')
            self.assertFalse(data['native_interaction_verified'])
            self.assertEqual(data['failure'], 'ACCEPTANCE_INPUT_INVALID')


if __name__ == '__main__':
    unittest.main()
