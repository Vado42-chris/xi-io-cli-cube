#!/usr/bin/env python3
"""Observe the existing installed HEX Library on an isolated Ubuntu CI runner.

The finite PID/window/AT-SPI observer follows scripts/verify-installed-snap55.py
from Cube #27 b3e9b12d. The positive run performs no clicks. The exact DEV12
negative control may open its Software view, with no product effects. The unchanged
verify-hex-capture.py remains the pixel-quality checker. Neither observation is
Pop!_OS acceptance, native Maths acceptance, or a release authorization.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time


class Unverified(RuntimeError):
    pass


def require(value, code):
    if not value:
        raise Unverified(code)


def sha_file(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


EXPECTED_CONTROLS = (
    ('Back to Library', 'button'),
    ('Your XI-IO library.', 'heading'),
    ('Explore XI-IO CLI', 'button'),
)

RETIRED_CONTROLS = (
    ('XI-IO Ecosystem Component Catalog', 'heading'),
)
RETIRED_CARD_NAMES = ('XI-IO CLI', 'XI-IO Code Editor')
DEV12_PACKAGE_SHA256 = '07115547bd5603882eca5f2b31593615162e6ae1e1573c8b2a8635245337c700'
DEV12_ELF_SHA256 = 'ea5059196651e3100ee0f08393de09337859d72c34fc629fd2292f45d00f4b12'
DEV12_RELEASE_SOURCE = 'd160521cffd3ff7e627155050faeecc693ac76bc'
DEV12_COMPILED_SOURCE = 'cd7716a1c40ca6b6fb7393fcedb8ae50f5a5a2b6'
MAX_CONTROL_TEXT = 4096
MAX_DIAGNOSTIC_ROWS = 128
MAX_DIAGNOSTIC_TEXT = 512


def read_heading_text(node):
    """Read only an actual heading's bounded AT-SPI Text interface."""
    try:
        text = node.get_text_iface()
        if text is None:
            return None
        count = text.get_character_count()
        require(type(count) is int and 0 <= count <= MAX_CONTROL_TEXT,
                'ACCESSIBILITY_HEADING_TEXT_BOUNDS')
        value = text.get_text(0, count)
        require(isinstance(value, str) and len(value) <= MAX_CONTROL_TEXT,
                'ACCESSIBILITY_HEADING_TEXT_BOUNDS')
        return value
    except Unverified:
        raise
    except Exception:
        raise Unverified('ACCESSIBILITY_HEADING_TEXT_UNAVAILABLE') from None


def webkit_heading_metadata(node):
    # WebKitGTK 2.50.4 omitted Footer in the ordinal table it sends over D-Bus,
    # so its Heading can decode as DOCUMENT_FRAME in AT-SPI 2.44. Do not alias
    # that enum. WebKit's own same-node attributes expose the computed role,
    # native heading tag and heading level independently of that ordinal.
    try:
        attrs = node.get_attributes()
    except Exception:
        raise Unverified('ACCESSIBILITY_HEADING_METADATA_UNAVAILABLE') from None
    if not isinstance(attrs, dict) or attrs.get('toolkit') != 'WebKitGTK' or attrs.get('computed-role') != 'heading':
        return None
    level = attrs.get('level')
    if level not in ('1', '2', '3', '4', '5', '6') or attrs.get('tag') != 'h' + level:
        return None
    return {'heading_role_source': 'WEBKITGTK_COMPUTED_HEADING',
            'heading_raw_role': 'document-frame', 'heading_level': int(level)}


def control_text(row):
    # WebKit headings can expose visible text without an accessible name.
    # Buttons still use their semantic name; no descendant-text search occurs.
    text = row.get('text') if row['role'] == 'heading' else None
    value = text if isinstance(text, str) and text.strip() else row['name']
    return ' '.join(value.split())


def control_matches(row, name, role, reference_card=False):
    if row['role'] != role:
        return False
    label = control_text(row)
    if reference_card:
        return label.startswith(name + ' ') and 'Installed on this computer: not reported' in label
    return label == name


def expected_control_check(rows, complete, name, role, reference_card=False):
    matches = [row for row in (rows or []) if control_matches(row, name, role, reference_card)]
    visible = sum(row['visible'] is True for row in matches)
    hidden = len(matches) - visible
    role_exposed = any(row['role'] == role for row in (rows or []))
    return {'expected_name': name, 'role': role, 'reference_card': reference_card,
            'visible_exact_matches': visible, 'hidden_exact_matches': hidden,
            'visible_role_count': sum(row['role'] == role and row['visible'] is True for row in (rows or [])),
            'status': ('MATCHED' if visible == 1 else 'DUPLICATE' if visible > 1
                       else 'NOT_VISIBLE' if hidden
                       else 'EXPECTED_ROLE_NOT_EXPOSED' if complete and not role_exposed
                       else 'EXPECTED_CONTROL_NOT_OBSERVED')}


def content_diagnostics(native, retired=False):
    """Keep bounded observations, without turning absent AX data into bad UI."""
    rows = native.last_rows if native is not None else None
    complete = native.last_rows_complete if native is not None else False
    expected = [(name, role, False) for name, role in (RETIRED_CONTROLS if retired else EXPECTED_CONTROLS)]
    if retired:
        expected += [(name, 'button', True) for name in RETIRED_CARD_NAMES]
    checks = [expected_control_check(rows, complete, name, role, card) for name, role, card in expected]
    retained = []
    for row in (rows or [])[:MAX_DIAGNOSTIC_ROWS]:
        item = dict(row)
        for field in ('name', 'text'):
            if isinstance(item.get(field), str) and len(item[field]) > MAX_DIAGNOSTIC_TEXT:
                item[field] = item[field][:MAX_DIAGNOSTIC_TEXT]
                item[field + '_truncated'] = True
        retained.append(item)
    return {'accessibility_state': ('NOT_OBSERVED' if rows is None else 'COMPLETE' if complete else 'PARTIAL'),
            'ui_correctness': 'UNVERIFIED',
            'observed_control_count': len(rows or []), 'last_observed_rows': retained,
            # Raw role inventory is diagnostic only. It never supplies a missing selector.
            'raw_role_counts': dict(sorted(getattr(native, 'last_raw_role_counts', {}).items())),
            'rows_truncated': len(rows or []) > MAX_DIAGNOSTIC_ROWS,
            'expected_control_checks': checks,
            'missing_controls': [check for check in checks if check['status'] != 'MATCHED'],
            'last_observation_failure': native.last_observation_failure if native is not None else None}


def select_content_controls(rows):
    """Only exact, uniquely visible content controls satisfy readiness."""
    selected = []
    for name, role in EXPECTED_CONTROLS:
        matches = [row for row in rows if control_matches(row, name, role) and row['visible'] is True]
        require(len(matches) == 1, 'HEX_LIBRARY_CONTENT_NOT_OBSERVED')
        selected.append(matches[0])
    require(not any(row['visible'] is True and control_matches(row, name, role)
                    for row in rows for name, role in RETIRED_CONTROLS),
            'HEX_RETIRED_CATALOG_EXPOSED')
    return selected


def select_retired_controls(rows):
    selected = []
    for name, role in RETIRED_CONTROLS:
        matches = [row for row in rows if control_matches(row, name, role) and row['visible'] is True]
        require(len(matches) == 1, 'RETIRED_CATALOG_NOT_OBSERVED')
        selected.append(matches[0])
    # DEV12 uses named spans inside button cards, not headings. Require the
    # actual two card controls and their explicit reference-only state text.
    for name in RETIRED_CARD_NAMES:
        matches = [row for row in rows if control_matches(row, name, 'button', True) and row['visible'] is True]
        require(len(matches) == 1, 'RETIRED_CATALOG_NOT_OBSERVED')
        selected.append(matches[0])
    # Failure on the SAME current Library selector, after positive observation
    # of old content, is required. An infrastructure failure is never this RED.
    try:
        select_content_controls(rows)
    except Unverified as error:
        require(str(error) != 'HEX_RETIRED_CATALOG_EXPOSED',
                'RETIRED_CATALOG_UNEXPECTEDLY_QUALIFIED')
        require(str(error) == 'HEX_LIBRARY_CONTENT_NOT_OBSERVED', 'RETIREMENT_REFUSAL_UNEXPECTED')
    else:
        raise Unverified('RETIRED_CATALOG_UNEXPECTEDLY_QUALIFIED')
    return selected


def read_frontend_identity(path, source, elf):
    path = Path(path)
    receipt = json.loads(path.read_text())
    require(receipt.get('source_commit') == source, 'FRONTEND_SOURCE_MISMATCH')
    require(receipt.get('native_elf_sha256') == elf, 'FRONTEND_ELF_MISMATCH')
    require(receipt.get('frontend_staged_match') is True, 'FRONTEND_STAGE_UNVERIFIED')
    require(receipt.get('qualification') == 'BUILT_FRONTEND_NOT_INSTALLED_ACCEPTANCE', 'FRONTEND_SCOPE_INVALID')
    archive = path.parent / 'hex-built-frontend.tgz'
    require(sha_file(archive) == receipt.get('frontend_archive_sha256'), 'FRONTEND_ARCHIVE_CHANGED')
    files = receipt.get('frontend_files')
    require(isinstance(files, dict) and 'index.html' in files and len(files) > 1, 'FRONTEND_FILES_MISSING')
    dist = path.parent / 'dist'
    actual = {}
    for item in sorted(dist.rglob('*')):
        require(not item.is_symlink(), 'FRONTEND_SYMLINK_REFUSED')
        if item.is_file():
            actual[str(item.relative_to(dist))] = {'bytes': item.stat().st_size, 'sha256': sha_file(item)}
    require(actual == files, 'FRONTEND_BYTES_CHANGED')
    return receipt


class Native:
    def __init__(self, pid, window, elf, expected_executable='/usr/bin/xi-io-hex-dev'):
        self.pid, self.window, self.elf = pid, window, elf
        self.expected_executable = str(Path(expected_executable).resolve())
        self.deadline = time.monotonic() + 60
        self.last_rows = None
        self.last_rows_complete = False
        self.last_observation_failure = None
        self.identity = self.process_identity()
        self.guard()
        try:
            import gi
            gi.require_version('Atspi', '2.0')
            from gi.repository import Atspi
            self.ax = Atspi
            Atspi.set_timeout(500, 500)
            Atspi.init()
        except Exception:
            raise Unverified('ACCESSIBILITY_PROVIDER_UNAVAILABLE') from None

    def process_identity(self):
        process = Path('/proc') / str(self.pid)
        return (process.joinpath('stat').read_text().rsplit(')', 1)[1].split()[19], str(process.joinpath('exe').resolve()))

    def command(self, args):
        left = self.deadline - time.monotonic()
        require(left > 0, 'HEX_LIBRARY_OBSERVATION_DEADLINE')
        return subprocess.run(args, check=True, capture_output=True, text=True, timeout=min(left, 3)).stdout.strip()

    def guard(self):
        require(self.process_identity() == self.identity and self.identity[1] == self.expected_executable, 'PROCESS_IDENTITY_CHANGED')
        require(sha_file(Path('/proc', str(self.pid), 'exe')) == self.elf, 'ELF_IDENTITY_CHANGED')
        require(self.command(['xdotool', 'getwindowpid', self.window]) == str(self.pid), 'WINDOW_PID_CHANGED')
        require(self.command(['xdotool', 'getwindowname', self.window]) == 'XI-IO HEX', 'WINDOW_TITLE_CHANGED')
        values = dict(line.split('=', 1) for line in self.command(['xdotool', 'getwindowgeometry', '--shell', self.window]).splitlines() if '=' in line)
        self.geometry = tuple(int(values[key]) for key in ('X', 'Y', 'WIDTH', 'HEIGHT'))

    def visible(self, node):
        state = node.get_state_set()
        if not (state.contains(self.ax.StateType.VISIBLE) and state.contains(self.ax.StateType.SHOWING)):
            return False
        component = node.get_component_iface()
        if component is None:
            return False
        bounds = component.get_extents(self.ax.CoordType.SCREEN)
        x, y, width, height = self.geometry
        return bounds.width > 0 and bounds.height > 0 and x <= bounds.x and y <= bounds.y and bounds.x + bounds.width <= x + width and bounds.y + bounds.height <= y + height

    def rows(self, *, scope_name=None):
        self.last_rows = None
        self.last_rows_complete = False
        self.last_raw_role_counts = {}
        desktop = self.ax.get_desktop(0)
        applications = [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]
        applications = [app for app in applications if app.get_process_id() == self.pid]
        require(len(applications) == 1, 'ACCESSIBILITY_APPLICATION_UNVERIFIED')
        queue = [(applications[0], 0, scope_name is None)]
        scopes = 0
        rows, visited = [], 0
        self.last_rows = rows
        roles = {self.ax.Role.PUSH_BUTTON: 'button', self.ax.Role.HEADING: 'heading'}
        while queue:
            require(time.monotonic() < self.deadline, 'HEX_LIBRARY_OBSERVATION_DEADLINE')
            node, depth, in_scope = queue.pop(0)
            if scope_name is not None and node.get_name() == scope_name:
                scopes += 1
                in_scope = True
            visited += 1
            require(visited <= 2048 and depth < 40, 'ACCESSIBILITY_TREE_BOUNDS')
            raw_role = node.get_role()
            # Track only enum labels, not arbitrary user content; the tree walk bounds
            # the denominator and the map does not change role interpretation.
            role_nick = getattr(raw_role, 'value_nick', None) or 'unknown'
            raw_counts = self.last_raw_role_counts
            raw_counts[role_nick] = raw_counts.get(role_nick, 0) + 1
            role = roles.get(raw_role)
            heading_metadata = None
            if in_scope and raw_role == self.ax.Role.DOCUMENT_FRAME:
                heading_metadata = webkit_heading_metadata(node)
                if heading_metadata is not None:
                    role = 'heading'
            if in_scope and role:
                name = node.get_name() or ''
                require(len(name) <= MAX_CONTROL_TEXT, 'ACCESSIBILITY_NAME_BOUNDS')
                visible = self.visible(node)
                row = {'name': name, 'role': role, 'visible': visible}
                rows.append(row)
                if role == 'heading':
                    try:
                        row['text'] = read_heading_text(node)
                        if heading_metadata is not None:
                            row.update(heading_metadata)
                            if visible:
                                require(isinstance(row['text'], str) and row['text'].strip(),
                                        'ACCESSIBILITY_HEADING_TEXT_UNAVAILABLE')
                    except Unverified as error:
                        row['text_error'] = str(error)
                        raise
                if visible:
                    bounds = node.get_component_iface().get_extents(self.ax.CoordType.SCREEN)
                    row['bounds'] = [bounds.x, bounds.y, bounds.width, bounds.height]
            count = node.get_child_count()
            require(0 <= count <= 512, 'ACCESSIBILITY_CHILD_BOUNDS')
            queue.extend((node.get_child_at_index(i), depth + 1, in_scope) for i in range(count))
        if scope_name is not None:
            require(scopes == 1, 'ACCESSIBILITY_REGION_NOT_UNIQUELY_OBSERVED')
        self.last_rows_complete = True
        return rows

    def content(self):
        return select_content_controls(self.rows())

    def capture(self, directory, filename):
        picture = directory / filename
        self.command(['scrot', '-z', '-o', str(picture)])
        checker = Path(__file__).with_name('verify-hex-capture.py')
        visual = json.loads(self.command(['/usr/bin/python3', '-I', '-B', str(checker), str(picture)]))
        self.guard()
        require(visual['screenshot_sha256'] == sha_file(picture), 'CAPTURE_CHANGED_AFTER_QUALIFICATION')
        return visual

    def observe(self, directory):
        last = 'HEX_LIBRARY_CONTENT_NOT_OBSERVED'
        for _ in range(120):
            self.guard()
            try:
                controls = self.content()
                # Capture only after exact visible Library controls are read.
                # -o is essential: retries must replace the prepaint image.
                visual = self.capture(directory, 'hex-library-rendered.png')
                return controls, visual
            except Unverified as error:
                last = str(error)
            except subprocess.CalledProcessError:
                last = 'HEX_LIBRARY_PIXELS_NOT_QUALIFIED'
            self.last_observation_failure = last
            require(time.monotonic() < self.deadline, 'HEX_LIBRARY_OBSERVATION_DEADLINE')
            time.sleep(.25)
        raise Unverified(last)

    def observe_retired(self, directory):
        clicked = False
        last = 'RETIRED_CATALOG_NOT_OBSERVED'
        for _ in range(120):
            self.guard()
            try:
                rows = self.rows()
                try:
                    controls = select_retired_controls(rows)
                except Unverified as error:
                    if str(error) != 'RETIRED_CATALOG_NOT_OBSERVED':
                        raise
                    if not clicked:
                        software = [row for row in rows if ' '.join(row['name'].split()) == 'Software' and row['role'] == 'button' and row['visible'] is True]
                        require(len(software) == 1, 'RETIRED_SOFTWARE_CONTROL_NOT_OBSERVED')
                        x, y, width, height = software[0]['bounds']
                        self.command(['xdotool', 'windowfocus', '--sync', self.window])
                        self.guard()
                        require(self.command(['xdotool', 'getwindowfocus']) == self.window, 'WINDOW_FOCUS_CHANGED')
                        self.command(['xdotool', 'mousemove', str(x + width // 2), str(y + height // 2)])
                        self.command(['xdotool', 'click', '1'])
                        clicked = True
                    raise
                visual = self.capture(directory, 'hex-dev12-retired-catalog.png')
                return controls, visual, clicked
            except Unverified as error:
                last = str(error)
            except subprocess.CalledProcessError:
                last = 'RETIRED_CATALOG_PIXELS_OR_NAVIGATION_UNQUALIFIED'
            self.last_observation_failure = last
            require(time.monotonic() < self.deadline, 'HEX_LIBRARY_OBSERVATION_DEADLINE')
            time.sleep(.25)
        raise Unverified(last)


def verify_retired_package(package, executable, proof):
    package, executable, proof = Path(package), Path(executable), Path(proof)
    require(package.is_file() and not package.is_symlink(), 'RETIRED_PACKAGE_UNAVAILABLE')
    require(sha_file(package) == DEV12_PACKAGE_SHA256, 'RETIRED_PACKAGE_DIGEST_MISMATCH')
    expected = proof / 'payload/usr/bin/xi-io-hex-dev'
    require(executable == expected and executable.is_file(), 'RETIRED_EXECUTABLE_PATH_MISMATCH')
    require(not any(p.is_symlink() for p in [executable, *executable.parents]), 'RETIRED_EXECUTABLE_SYMLINK_REFUSED')
    require(sha_file(executable) == DEV12_ELF_SHA256, 'RETIRED_ELF_DIGEST_MISMATCH')


def retired_main(args):
    require(len(args) == 5, 'USAGE_RETIRED_PID_WINDOW_PROOF_PACKAGE_EXECUTABLE')
    pid, window, directory, package, executable = args
    require(pid.isdigit() and int(pid) > 1 and window.isdigit(), 'PROCESS_IDENTITY_REQUIRED')
    proof = Path(directory)
    require(proof.is_absolute() and proof.is_dir() and not any(p.is_symlink() for p in [proof, *proof.parents]), 'PROOF_DIRECTORY_INVALID')
    receipt = {'state': 'RELEASED_RETIRED_UI_RED_UNVERIFIED', 'red_established': False,
               'release_tag': 'xiio-hex-local-d160521c-dev12',
               'released_source_commit': DEV12_RELEASE_SOURCE,
               'compiled_source_commit': DEV12_COMPILED_SOURCE,
               'candidate_verifier_source': os.environ.get('GITHUB_SHA'),
               'expected_debian_package_sha256': DEV12_PACKAGE_SHA256,
               'expected_native_elf_sha256': DEV12_ELF_SHA256,
               'pid': int(pid), 'window_id': window,
               'physical_target': 'GITHUB_HOSTED_UBUNTU_22_04_XVFB_EXTRACTED_PACKAGE',
               'package_installed': False, 'pop_os_acceptance': False,
               'product_install_actions_performed': False, 'release_promotion': False}
    native = None
    try:
        verify_retired_package(package, executable, proof)
        receipt.update(package_identity_verified=True, extracted_elf_identity_verified=True,
                       debian_package_sha256=sha_file(package), native_elf_sha256=sha_file(executable))
        native = Native(int(pid), window, DEV12_ELF_SHA256, expected_executable=executable)
        controls, visual, navigated = native.observe_retired(proof)
        # Do not convert process launch, missing content or failed rendering into
        # RED. The retired UI AND refusal AND nonblank pixels are all required.
        receipt.update(state='RELEASED_RETIRED_UI_RED_ESTABLISHED', red_established=True,
                       current_library_selector_refusal='HEX_LIBRARY_CONTENT_NOT_OBSERVED',
                       retired_catalog_observed=True, observed_retired_controls=controls,
                       software_navigation_performed=navigated, capture=visual,
                       screenshot_sha256=visual['screenshot_sha256'])
    except Exception as error:
        receipt['execution_failure'] = str(error) if isinstance(error, Unverified) else type(error).__name__
        receipt['content_diagnostics'] = content_diagnostics(native, retired=True)
        (proof / 'hex-dev12-ui-red.json').write_text(json.dumps(receipt, indent=2) + '\n')
        raise
    (proof / 'hex-dev12-ui-red.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('RELEASED_DEV12_RETIRED_CATALOG_OBSERVED_AND_LIBRARY_SELECTOR_REFUSED')


def main():
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'DISPOSABLE_RUNNER_REQUIRED')
    if sys.argv[1:2] == ['--retired-dev12']:
        return retired_main(sys.argv[2:])
    require(len(sys.argv) == 7, 'USAGE_PID_WINDOW_ELF_SOURCE_PROOF_FRONTEND_IDENTITY')
    pid, window, elf, source, directory, frontend_path = sys.argv[1:]
    require(pid.isdigit() and int(pid) > 1 and window.isdigit(), 'PROCESS_IDENTITY_REQUIRED')
    require(re.fullmatch(r'[a-f0-9]{40}', source) and re.fullmatch(r'[a-f0-9]{64}', elf), 'SOURCE_IDENTITY_REQUIRED')
    proof = Path(directory)
    require(proof.is_dir() and not any(p.is_symlink() for p in [proof, *proof.parents]), 'PROOF_DIRECTORY_INVALID')
    receipt = {'state': 'NATIVE_LIBRARY_RENDER_UNVERIFIED', 'source_commit': source,
               'native_elf_sha256': elf, 'pid': int(pid), 'window_id': window,
               'physical_target': 'GITHUB_HOSTED_UBUNTU_22_04_XVFB',
               'pop_os_acceptance': False, 'product_install_actions_performed': False,
               'native_maths_click_readback': False, 'release_promotion': False}
    native = None
    try:
        frontend = read_frontend_identity(frontend_path, source, elf)
        receipt['frontend_archive_sha256'] = frontend['frontend_archive_sha256']
        receipt['frontend_identity_sha256'] = sha_file(frontend_path)
        receipt['debian_package_sha256'] = frontend['debian_package_sha256']
        native = Native(int(pid), window, elf)
        controls, visual = native.observe(proof)
        receipt.update(state='NATIVE_LIBRARY_RENDER_OBSERVED', observed_content_controls=controls,
                       capture=visual, screenshot_sha256=visual['screenshot_sha256'])
    except Exception as error:
        receipt['first_red'] = str(error) if isinstance(error, Unverified) else type(error).__name__
        receipt['content_diagnostics'] = content_diagnostics(native)
        (proof / 'hex-library-render.json').write_text(json.dumps(receipt, indent=2) + '\n')
        raise
    (proof / 'hex-library-render.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('NATIVE_LIBRARY_RENDER_OBSERVED_NOT_POP_OS_OR_PRODUCT_ACCEPTANCE')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Unverified) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
