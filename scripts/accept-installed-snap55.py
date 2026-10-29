#!/usr/bin/python3
"""Fail-closed installed HEX Maths GUI acceptance, no SDK calculator or private data.

Uses the actual WebKit GTK accessibility tree to interact with the installed app.
The synthetic fixture and its independent rational expected value are embedded.
Neither an SDK result nor a generated DOM result can satisfy this gate.
"""
import argparse
from fractions import Fraction
import hashlib
import json
import math
import os
import pathlib
import re
import subprocess
import sys
import time

SOURCE_SCHEMA = 'xiio.hex.installed-snap55-acceptance/v1'
UI_DEADLINE_SECONDS = 22
AT_SPI_MAX_NODES = 3500
AT_SPI_MAX_DEPTH = 32
AT_SPI_TEXT_LIMIT = 8192


def fixed_input(a, b):
    return json.dumps({
        'questions': [{'id': 'a', 'pillar': 'autism'}, {'id': 'b', 'pillar': 'adhd'}],
        'responses': {'a': a, 'b': b},
        'nowMs': '1793200000000', 'decayMode': 'legacy_efold18',
        'journal': [{'timestamp': '1793196400000', 'sensoryEntropy': 50}],
    }, separators=(',', ':'))


def independent_expected(a, b):
    # Independent rational arithmetic. The journal's one observation has
    # entropy 50%, so its temporal weight normalizes to 1/2 regardless of e-fold.
    baseline = Fraction(13 * a + 8 * b, 4 * (13 + 8))
    return float(Fraction(1, 4) * baseline + Fraction(65, 100) * Fraction(1, 2)
                 + Fraction(1, 10) * Fraction(5, 100))


class GateFailure(Exception):
    pass


def fail(code):
    raise GateFailure(code)


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def require_isolated_network(proc=pathlib.Path('/proc')):
    # The native process, AT-SPI and Xvfb must run in a fresh network namespace
    # without an external interface. Signed-out home alone is not offline proof.
    try:
        own = os.readlink(proc / 'self' / 'ns' / 'net')
        host = os.readlink(proc / '1' / 'ns' / 'net')
    except OSError:
        fail('OFFLINE_NAMESPACE_UNVERIFIED')
    if own == host:
        fail('OFFLINE_NAMESPACE_MISSING')
    return own


def validate_hex_sha(value, label):
    if re.fullmatch(r'[0-9a-f]{40}', value) is None:
        fail(label)
    return value


def validate_hash_file(path, actual, label):
    try:
        first = pathlib.Path(path).read_text(encoding='ascii').splitlines()[0].split()[0]
    except (OSError, UnicodeError, IndexError):
        fail(label)
    if re.fullmatch(r'[a-f0-9]{64}', first) is None or first != actual:
        fail(label)


def traverse(root):
    """Bounded traversal of *live* accessibility objects; never synthesize DOM."""
    pending = [(root, 0)]
    seen = set()
    while pending and len(seen) < AT_SPI_MAX_NODES:
        node, depth = pending.pop(0)
        if node is None:
            continue
        key = (getattr(node, '_acc_path', None), id(node))
        if key in seen:
            continue
        seen.add(key)
        yield node
        if depth >= AT_SPI_MAX_DEPTH:
            continue
        try:
            count = min(node.childCount, 300)
            children = [node.getChildAtIndex(i) for i in range(count)]
            pending.extend((child, depth + 1) for child in children if child is not None)
        except (LookupError, AttributeError, RuntimeError, TypeError):
            continue


def role(node):
    try:
        return str(node.getRoleName()).lower()
    except (AttributeError, RuntimeError):
        return ''


def label(node):
    try:
        return str(node.name or '')[:512]
    except (AttributeError, RuntimeError):
        return ''


def text_of(node):
    try:
        t = node.queryText()
        return str(t.getText(0, min(t.characterCount, AT_SPI_TEXT_LIMIT)))
    except (AttributeError, RuntimeError, NotImplementedError, TypeError, LookupError):
        return ''


def unique(nodes, predicate, missing_code, ambiguous_code):
    found = [n for n in nodes if predicate(n)]
    if not found:
        fail(missing_code)
    if len(found) != 1:
        fail(ambiguous_code)
    return found[0]


def status_text(panel):
    nodes = list(traverse(panel))
    statuses = [node for node in nodes if 'status' in role(node)]
    if not statuses:
        return None
    if len(statuses) != 1:
        fail('MATHS_STATUS_AMBIGUOUS')
    fragments = []
    for node in traverse(statuses[0]):
        a, b = text_of(node), label(node)
        if a:
            fragments.append(a)
        elif b:
            fragments.append(b)
    return ' '.join(fragments).strip()


def observed_number(visible_text):
    if not visible_text:
        fail('MATHS_RESULT_MISSING')
    if re.search(r'\bState\s*:\s*SOURCE_BOUND_NUMERIC\b', visible_text) is None:
        fail('MATHS_STATE_UNEXPECTED')
    candidates = re.findall(r'\bR\s*:\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\b', visible_text)
    if len(set(candidates)) != 1:
        fail('MATHS_RESULT_MISSING_OR_AMBIGUOUS')
    try:
        answer = float(candidates[0])
    except ValueError:
        fail('MATHS_RESULT_NOT_NUMERIC')
    if not math.isfinite(answer):
        fail('MATHS_RESULT_NOT_FINITE')
    return answer


def assert_result(observed, expected):
    if not math.isclose(observed, expected, abs_tol=1e-12, rel_tol=0):
        fail('MATHS_WRONG_ANSWER')


def invoke_xdotool(*args):
    try:
        out = subprocess.run(['xdotool', *args], check=True, capture_output=True,
                             timeout=4, text=True)
        return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        fail('MATHS_X11_INPUT_FAILED')


def click_control(node, code):
    try:
        action = node.queryAction()
        actions = [(i, action.getName(i).lower()) for i in range(action.nActions)]
        click = next((i for i, name in actions if name in ('click', 'press', 'activate')), None)
        if click is None or not action.doAction(click):
            fail(code)
    except (AttributeError, RuntimeError, NotImplementedError, LookupError):
        fail(code)


def set_editor(editor, source, window):
    try:
        if not editor.queryComponent().grabFocus():
            fail('MATHS_EDITOR_NOT_FOCUSABLE')
    except (AttributeError, RuntimeError, NotImplementedError):
        fail('MATHS_EDITOR_NOT_FOCUSABLE')
    invoke_xdotool('windowactivate', '--sync', str(window))
    if invoke_xdotool('getactivewindow') != str(window):
        fail('MATHS_WINDOW_FOCUS_CHANGED')
    invoke_xdotool('key', '--clearmodifiers', 'ctrl+a')
    # Real X11 keyboard events; AT-SPI EditText may claim success without React
    # input events. Never use a DOM setter or calculator to spoof interaction.
    try:
        subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '1', '--', source],
                       check=True, timeout=9, capture_output=True)
    except (OSError, subprocess.SubprocessError):
        fail('MATHS_EDITOR_TYPE_FAILED')


def wait_until(condition, deadline, failure):
    while time.monotonic() < deadline:
        try:
            value = condition()
        except (AttributeError, LookupError, RuntimeError, TypeError):
            value = None
        if value:
            return value
        time.sleep(0.2)
    fail(failure)


def installed_interaction(window_id, cases):
    try:
        import pyatspi  # Ubuntu python3-pyatspi; only inside installed GUI runner.
        desktop = pyatspi.Registry.getDesktop(0)
    except (ImportError, AttributeError, RuntimeError):
        fail('ATSPI_UNAVAILABLE')
    deadline = time.monotonic() + UI_DEADLINE_SECONDS
    windows = list(traverse(desktop))
    app_window = unique(windows, lambda n: label(n) == 'XI-IO HEX',
                        'HEX_ACCESSIBLE_WINDOW_MISSING', 'HEX_ACCESSIBLE_WINDOW_AMBIGUOUS')
    maths_tab = wait_until(lambda: next((n for n in traverse(app_window)
                        if 'button' in role(n) and label(n) == 'Maths'), None),
                        deadline, 'MATHS_TAB_MISSING')
    click_control(maths_tab, 'MATHS_TAB_NOT_CLICKABLE')
    panel = wait_until(lambda: next((n for n in traverse(app_window)
                        if label(n) == 'Offline SNAP 5.5 maths workbench'), None),
                        deadline, 'MATHS_PANEL_MISSING')
    editor = unique(list(traverse(panel)), lambda n: label(n) == 'SNAP 5.5 input JSON',
                    'MATHS_EDITOR_MISSING', 'MATHS_EDITOR_AMBIGUOUS')
    calculate = unique(list(traverse(panel)), lambda n: 'button' in role(n)
                       and label(n) == 'Calculate locally',
                       'MATHS_CALCULATE_MISSING', 'MATHS_CALCULATE_AMBIGUOUS')
    if status_text(panel) is not None:
        fail('MATHS_RESULT_PREPOPULATED')
    for item in cases:
        fixture = json.dumps(item['input'], separators=(',', ':'))
        expected = item['expected_result']
        set_editor(editor, fixture, window_id)
        wait_until(lambda: text_of(editor) == fixture, deadline, 'MATHS_EDITOR_READBACK_MISMATCH')
        if status_text(panel) is not None:
            fail('MATHS_STALE_RESULT_AFTER_EDIT')
        click_control(calculate, 'MATHS_CALCULATE_NOT_CLICKABLE')
        visible = wait_until(lambda: status_text(panel), deadline, 'MATHS_RESULT_MISSING')
        observed = observed_number(visible)
        item['observed_displayed_result'] = observed
        item['displayed_state'] = 'SOURCE_BOUND_NUMERIC'
        item['readback_source'] = 'INSTALLED_GUI_AT_SPI'
        assert_result(observed, expected)
    if cases[0]['observed_displayed_result'] == cases[1]['observed_displayed_result']:
        fail('MATHS_STALE_RESULT_UNCHANGED')
    return cases


def main(argv=None, interact=installed_interaction):
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('source', 'package', 'package_sha_file', 'executable', 'elf_sha_file',
                'visual', 'receipt', 'window'):
        parser.add_argument('--' + key.replace('_', '-'), required=True)
    args = parser.parse_args(argv)
    receipt = pathlib.Path(args.receipt)
    result = {'schema': SOURCE_SCHEMA, 'state': 'FAILED', 'native_interaction_verified': False,
              'signed_out': True, 'offline': True, 'private_data_used': False,
              'provider_effect': False, 'ward_grant': False, 'source_commit': args.source,
              'network_namespace_verified': False,
              'package_sha256': None, 'installed_executable_sha256': None,
              'visual_receipt_sha256': None, 'cases': [
                  {'input': json.loads(fixed_input(a, b)),
                   'input_sha256': hashlib.sha256(fixed_input(a, b).encode()).hexdigest(),
                   'expected_result': independent_expected(a, b),
                   'observed_displayed_result': None, 'displayed_state': None,
                   'readback_source': 'UNOBSERVED'} for a, b in ((4, 0), (0, 4))
              ], 'failure': None}
    try:
        validate_hex_sha(args.source, 'SOURCE_COMMIT_INVALID')
        require_isolated_network()
        result['network_namespace_verified'] = True
        result['package_sha256'] = sha256(args.package)
        result['installed_executable_sha256'] = sha256(args.executable)
        validate_hash_file(args.package_sha_file, result['package_sha256'], 'PACKAGE_HASH_MISMATCH')
        validate_hash_file(args.elf_sha_file, result['installed_executable_sha256'], 'INSTALLED_ELF_HASH_MISMATCH')
        visual = json.loads(pathlib.Path(args.visual).read_text())
        if visual.get('schema') != 'xiio.hex.capture-nonblank/v1' or \
           visual.get('semantic_ui_verified') is not False or \
           not re.fullmatch('[0-9a-f]{64}', visual.get('screenshot_sha256', '')):
            fail('VISUAL_RECEIPT_INVALID')
        result['visual_receipt_sha256'] = sha256(args.visual)
        if not str(args.window).isdigit() or int(args.window) < 1:
            fail('WINDOW_ID_INVALID')
        result['cases'] = interact(int(args.window), result['cases'])
        if len(result['cases']) != 2:
            fail('MATHS_CASE_COUNT_INVALID')
        result['state'] = 'PASSED'
        result['native_interaction_verified'] = True
    except (GateFailure, OSError, ValueError, json.JSONDecodeError) as exc:
        result['failure'] = str(exc) if isinstance(exc, GateFailure) else 'ACCEPTANCE_INPUT_INVALID'
    finally:
        receipt.write_text(json.dumps(result, sort_keys=True, indent=2) + '\n')
    print(json.dumps({'schema': SOURCE_SCHEMA, 'state': result['state'],
                      'failure': result['failure'], 'native_interaction_verified': result['native_interaction_verified']}))
    return 0 if result['native_interaction_verified'] else 88


if __name__ == '__main__':
    sys.exit(main())
