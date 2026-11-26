#!/usr/bin/python3
"""Hosted-only Software initialization observation using existing native guards."""
import importlib.util
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

spec = importlib.util.spec_from_file_location('hex_native', Path(__file__).with_name('verify-installed-snap55.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

INITIALIZED_NAME = 'HEX software marketplace initialized'
ARTCRAFT_TITLE = 'XI-IO Software'
ARTCRAFT_INSTALL_ACTION = 'REVIEW INSTALLATION'
RETIRED_TITLE = 'XI-IO Ecosystem Component Catalog'
UPSTREAM_TITLE = 'Craft App Suite'
OCR_MAX_BYTES = 65536
CAPTURE_MAX_BYTES = 16 * 1024 * 1024
OCR_SOURCE = '64eab6c457b2337dd690746a5fde5c222b40d5f8'
OCR_IMAGE_SOURCE = '7e803e73511fbd320f01314c141d35d2b8491dde'
OCR_LANGUAGE_SOURCE = '87416418657359cb625c412a48b6e1d6d41c29bd'
OCR_LANGUAGE_SHA256 = '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2'
OCR_LANGUAGE_BLOB = 'bbef4675053b5b468cdb477053e28b1c698ba08e'
DEV12_PACKAGE_SHA256 = '07115547bd5603882eca5f2b31593615162e6ae1e1573c8b2a8635245337c700'
DEV12_ELF_SHA256 = 'ea5059196651e3100ee0f08393de09337859d72c34fc629fd2292f45d00f4b12'
# These two complete button names were independently observed in the released
# DEV12 AX receipt. That tree had no HEADING roles; do not invent heading proof.
DEV12_CARD_NAMES = (
    'XI-IO CLI Command-line tools for local projects and installation diagnostics. A Linux component candidate exists. No installed version or current one-click download is reported here. Installed on this computer: not reported Requirements: The existing component candidate requires Python 3.10+, Bash and Node 22.13+. This computer has not been checked. A model runtime is needed only for AI features.',
    "XI-IO Code Editor A project editing workspace under development. No editor installation package is connected to this build of HEX. Installed on this computer: not reported Requirements: Package-specific requirements have not been published here. A particular developer's computer is not a requirement.",
)

def file_digest(path):
    path = Path(path)
    base.require(path.is_file() and not any(p.is_symlink() for p in [path, *path.parents]), 'ARTCRAFT_BINDING_FILE_UNAVAILABLE')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def frontend_binding(identity_path, source, elf, package, executable):
    identity_path = Path(identity_path)
    identity_sha = file_digest(identity_path)
    front = json.loads(identity_path.read_text())
    base.require(isinstance(front, dict), 'ARTCRAFT_FRONTEND_IDENTITY_INVALID')
    base.require(front.get('source_commit') == source and front.get('github_sha') == source
                 and isinstance(front.get('source_tree'), str) and base.SOURCE.fullmatch(front['source_tree']), 'ARTCRAFT_FRONTEND_SOURCE_MISMATCH')
    run, attempt = os.environ.get('GITHUB_RUN_ID', ''), os.environ.get('GITHUB_RUN_ATTEMPT', '')
    base.require(run.isdigit() and int(run) > 0 and attempt.isdigit() and int(attempt) > 0
                 and front.get('github_run_id') == run and front.get('github_run_attempt') == attempt, 'ARTCRAFT_FRONTEND_RUN_MISMATCH')
    base.require(front.get('qualification') == 'BUILT_FRONTEND_NOT_INSTALLED_ACCEPTANCE'
                 and front.get('frontend_staged_match') is True, 'ARTCRAFT_FRONTEND_STAGE_UNVERIFIED')
    base.require(front.get('pop_os_acceptance') is False and front.get('release_promotion') is False, 'ARTCRAFT_FRONTEND_SCOPE_INVALID')
    package_sha = file_digest(package)
    base.require(front.get('debian_package_sha256') == package_sha, 'ARTCRAFT_PACKAGE_DIGEST_MISMATCH')
    base.require(front.get('native_elf_sha256') == elf == file_digest(executable), 'ARTCRAFT_ELF_DIGEST_MISMATCH')
    archive_sha = file_digest(identity_path.with_name('hex-built-frontend.tgz'))
    base.require(front.get('frontend_archive_sha256') == archive_sha, 'ARTCRAFT_FRONTEND_ARCHIVE_MISMATCH')
    base.require(file_digest(identity_path) == identity_sha, 'ARTCRAFT_FRONTEND_IDENTITY_CHANGED')
    return {'frontend_identity_sha256': identity_sha, 'frontend_archive_sha256': archive_sha,
            'debian_package_sha256': package_sha, 'native_elf_sha256': elf,
            'source_tree': front['source_tree'], 'package_version': front.get('package_version'),
            'frontend_build_os': front.get('build_os'), 'package_identity_verified': True,
            'extracted_elf_identity_verified': True}

def dev12_binding(package, executable):
    package_sha, elf_sha = file_digest(package), file_digest(executable)
    base.require(package_sha == DEV12_PACKAGE_SHA256, 'RETIRED_DEV12_PACKAGE_MISMATCH')
    base.require(elf_sha == DEV12_ELF_SHA256, 'RETIRED_DEV12_ELF_MISMATCH')
    return {'debian_package_sha256': package_sha, 'native_elf_sha256': elf_sha,
            'package_identity_verified': True, 'extracted_elf_identity_verified': True}

def installed_package_binding(executable, version):
    candidate = Path(executable)
    base.require(candidate == Path('/usr/bin/xi-io-hex-dev')
                 and not any(p.is_symlink() for p in [candidate, *candidate.parents]), 'INSTALLED_EXECUTABLE_REQUIRED')
    base.require(isinstance(version, str) and bool(version), 'INSTALLED_PACKAGE_VERSION_UNBOUND')
    environment = dict(os.environ)
    for key in ('DPKG_ROOT', 'DPKG_ADMINDIR'):
        environment.pop(key, None)
    try:
        result = subprocess.run(['/usr/bin/dpkg-query', '--admindir=/var/lib/dpkg', '--show',
                                 '--showformat=${Status}\t${Package}\t${Version}\n', 'xi-io-hex-dev'],
                                capture_output=True, text=True, timeout=5, env=environment)
    except (OSError, subprocess.SubprocessError):
        raise base.Unverified('INSTALLED_PACKAGE_QUERY_UNVERIFIED') from None
    base.require(result.returncode == 0, 'INSTALLED_PACKAGE_QUERY_UNVERIFIED')
    fields = result.stdout.strip().split('\t')
    base.require(fields == ['install ok installed', 'xi-io-hex-dev', version], 'INSTALLED_PACKAGE_READBACK_MISMATCH')
    return {'installed_package': True, 'installed_package_name': fields[1],
            'installed_package_version': fields[2], 'installed_package_status': fields[0],
            'installed_package_readback_backend': 'dpkg-query'}

def node_name(node):
    name = node.get_name() or ''
    base.require(isinstance(name, str) and len(name) <= 4096, 'ACCESSIBILITY_NAME_BOUNDS')
    return ' '.join(name.split())

def rendered_text_matches(text, layout_text, retired=False):
    """Exact visible labels, with whitespace normalization only, never OCR repair."""
    labels = (ARTCRAFT_TITLE, ARTCRAFT_INSTALL_ACTION, RETIRED_TITLE, UPSTREAM_TITLE)
    matches = {}
    for mode, raw in (('primary', text), ('layout', layout_text)):
        base.require(isinstance(raw, str) and len(raw.encode('utf-8')) <= OCR_MAX_BYTES,
                     'RENDERED_OCR_TEXT_BOUNDS')
        normalized = ' '.join(raw.split())
        matches[mode] = {label: len(re.findall(r'(?<![A-Za-z0-9])' + re.escape(label) + r'(?![A-Za-z0-9])', normalized))
                        for label in labels}
    expected = (RETIRED_TITLE,) if retired else (ARTCRAFT_TITLE, ARTCRAFT_INSTALL_ACTION)
    forbidden = (ARTCRAFT_TITLE, ARTCRAFT_INSTALL_ACTION, UPSTREAM_TITLE) if retired else (RETIRED_TITLE, UPSTREAM_TITLE)
    assigned = {'primary': [RETIRED_TITLE] if retired else [ARTCRAFT_TITLE],
                'layout': [] if retired else [ARTCRAFT_INSTALL_ACTION]}
    return {'normalization': 'whitespace-only', 'expected_labels': list(expected),
            'expected_pass_labels': assigned, 'forbidden_labels': list(forbidden), 'exact_match_counts': matches,
            'expected_labels_observed_once': all(matches[mode][label] == 1 for mode in assigned for label in assigned[mode]),
            'expected_labels_unique_in_each_pass': all(matches[mode][label] <= 1 for mode in matches for label in expected),
            'forbidden_labels_absent': all(matches[mode][label] == 0 for mode in matches for label in forbidden)}

def require_rendered_text(matches, retired=False):
    base.require(matches['forbidden_labels_absent'],
                 'RETIRED_DEV12_MIXED_RENDERED_CONTENT' if retired else 'ARTCRAFT_MIXED_RENDERED_CONTENT')
    base.require(matches['expected_labels_unique_in_each_pass'],
                 'RETIRED_DEV12_RENDERED_TEXT_AMBIGUOUS' if retired else 'ARTCRAFT_RENDERED_TEXT_AMBIGUOUS')
    base.require(matches['expected_labels_observed_once'],
                 'RETIRED_DEV12_RENDERED_TITLE_NOT_OBSERVED' if retired else 'ARTCRAFT_RENDERED_CONTENT_NOT_OBSERVED')

def verify_ocr_toolchain(binding):
    """Reopen the selected executable, runtime and language bytes before use."""
    base.require(isinstance(binding, dict) and isinstance(binding.get('identity'), dict),
                 'RENDERED_OCR_BINDING_REQUIRED')
    identity = binding['identity']
    base.require(file_digest(binding['identity_path']) == binding['identity_sha256'],
                 'RENDERED_OCR_BINDING_CHANGED')
    base.require(json.loads(Path(binding['identity_path']).read_text(encoding='utf-8')) == identity,
                 'RENDERED_OCR_BINDING_CHANGED')
    entries = [(identity['executable']['path'], identity['executable']),
               (identity['language']['path'], identity['language'])]
    entries += [(row['resolved_path'], row) for row in identity['runtime_files']]
    for path, row in entries:
        candidate = Path(path)
        base.require(candidate.is_absolute() and candidate.is_file() and candidate.stat().st_size == row['bytes']
                     and file_digest(candidate) == row['sha256'], 'RENDERED_OCR_BYTES_CHANGED')
    base.require(os.access(identity['executable']['path'], os.X_OK), 'RENDERED_OCR_EXECUTOR_UNAVAILABLE')

def load_ocr_toolchain():
    """Consume this run's prepared toolchain, never the ambient system OCR."""
    path = Path(os.environ.get('HEX_OCR_BINDING', '/NONEXISTENT'))
    expected = os.environ.get('HEX_OCR_BINDING_SHA256', '')
    base.require(base.DIGEST.fullmatch(expected) and path.is_absolute()
                 and path.name == 'hex-ocr-identity.json' and path.is_file()
                 and 0 < path.stat().st_size <= 65536, 'RENDERED_OCR_BINDING_REQUIRED')
    base.require(file_digest(path) == expected, 'RENDERED_OCR_BINDING_CHANGED')
    try:
        identity = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError, UnicodeError):
        raise base.Unverified('RENDERED_OCR_BINDING_INVALID') from None
    base.require(isinstance(identity, dict) and identity.get('schema') == 'xiio.hex.ocr-toolchain/v1',
                 'RENDERED_OCR_BINDING_INVALID')
    source, run, attempt = (os.environ.get(key, '') for key in ('GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'))
    base.require(base.SOURCE.fullmatch(source) and run.isdigit() and int(run) > 0
                 and attempt.isdigit() and int(attempt) > 0
                 and identity.get('source_commit') == source
                 and identity.get('github_run_id') == run and identity.get('github_run_attempt') == attempt
                 and isinstance(identity.get('source_tree'), str) and base.SOURCE.fullmatch(identity['source_tree']),
                 'RENDERED_OCR_RUN_MISMATCH')
    base.require(identity.get('tesseract_source_commit') == OCR_SOURCE
                 and identity.get('leptonica_source_commit') == OCR_IMAGE_SOURCE
                 and identity.get('language_source_commit') == OCR_LANGUAGE_SOURCE
                 and identity.get('version_first_line') == 'tesseract 5.5.0'
                 and isinstance(identity.get('version_full'), str)
                 and 0 < len(identity['version_full'].encode()) <= 8192
                 and identity['version_full'].splitlines()[0] == 'tesseract 5.5.0'
                 and 'leptonica-1.84.1' in identity['version_full'], 'RENDERED_OCR_TOOLCHAIN_MISMATCH')
    base.require(identity.get('static_ocr_libraries') is True and identity.get('supported_input') == 'PNG'
                 and identity.get('provider_effect') is False and identity.get('pop_os_acceptance') is False,
                 'RENDERED_OCR_SCOPE_INVALID')
    root = Path(os.environ.get('RUNNER_TEMP', '/NONEXISTENT'))/'hex-ocr-qualified'
    executable, language, runtime = (identity.get(key) for key in ('executable', 'language', 'runtime_files'))
    base.require(isinstance(executable, dict) and isinstance(language, dict)
                 and isinstance(runtime, list) and 1 <= len(runtime) <= 64, 'RENDERED_OCR_FILES_INVALID')
    base.require(executable.get('path') == str(root/'bin/tesseract')
                 and executable.get('archive_path') == 'bin/tesseract'
                 and language.get('path') == str(root/'share/tessdata/eng.traineddata')
                 and language.get('archive_path') == 'share/tessdata/eng.traineddata'
                 and language.get('bytes') == 4113088 and language.get('sha256') == OCR_LANGUAGE_SHA256
                 and language.get('git_blob') == OCR_LANGUAGE_BLOB, 'RENDERED_OCR_SELECTION_MISMATCH')
    seen = set()
    for row in [executable, language, *runtime]:
        base.require(isinstance(row, dict) and type(row.get('bytes')) is int and 0 < row['bytes'] <= 128*1024*1024
                     and isinstance(row.get('sha256'), str) and base.DIGEST.fullmatch(row['sha256']),
                     'RENDERED_OCR_FILES_INVALID')
    for row in runtime:
        resolved = row.get('resolved_path')
        base.require(isinstance(resolved, str) and Path(resolved).is_absolute() and resolved not in seen
                     and row.get('archive_path') == 'runtime/'+row['sha256']+'-'+Path(resolved).name,
                     'RENDERED_OCR_FILES_INVALID')
        seen.add(resolved)
    archive = identity.get('archive')
    base.require(isinstance(archive, dict) and archive.get('file') == 'hex-ocr-toolchain.tgz'
                 and type(archive.get('bytes')) is int and 0 < archive['bytes'] <= 256*1024*1024
                 and isinstance(archive.get('sha256'), str) and base.DIGEST.fullmatch(archive['sha256']),
                 'RENDERED_OCR_ARCHIVE_UNVERIFIED')
    archived = path.with_name(archive['file'])
    base.require(archived.is_file() and archived.stat().st_size == archive['bytes']
                 and file_digest(archived) == archive['sha256'], 'RENDERED_OCR_ARCHIVE_UNVERIFIED')
    binding = {'identity_path': str(path), 'identity_sha256': expected, 'identity': identity}
    verify_ocr_toolchain(binding)
    return binding

def read_ocr(crop, timeout, page_segmentation_mode=11, toolchain=None):
    """Use only the pinned tool and language data; retain uncorrected UTF-8."""
    binding = load_ocr_toolchain() if toolchain is None else toolchain
    verify_ocr_toolchain(binding)
    identity = binding['identity']
    executable = identity['executable']['path']
    base.require(timeout > 0, 'INTERACTION_DEADLINE')
    base.require(type(page_segmentation_mode) is int and page_segmentation_mode in (11, 3), 'RENDERED_OCR_MODE_INVALID')
    environment = dict(os.environ)
    for key in ('TESSDATA_PREFIX', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT'):
        environment.pop(key, None)
    environment['OMP_THREAD_LIMIT'] = '1'
    environment['OMP_NUM_THREADS'] = '1'
    environment['LC_ALL'] = 'C'
    try:
        version = subprocess.run([executable, '--version'], capture_output=True, timeout=min(timeout, 3), env=environment)
        base.require(version.returncode == 0 and 0 < len(version.stdout) <= 4096, 'RENDERED_OCR_VERSION_UNVERIFIED')
        version_full = version.stdout.decode('utf-8')
        version_text = version_full.splitlines()[0]
        base.require(version_full == identity['version_full'] and version_text == 'tesseract 5.5.0',
                     'RENDERED_OCR_VERSION_UNVERIFIED')
        result = subprocess.run([executable, str(crop), 'stdout', '--tessdata-dir', str(Path(identity['language']['path']).parent),
                                 '-l', 'eng', '--psm', str(page_segmentation_mode)],
                                capture_output=True, timeout=min(timeout, 15), env=environment)
        base.require(result.returncode == 0, 'RENDERED_OCR_EXECUTION_UNVERIFIED')
        base.require(len(result.stdout) <= OCR_MAX_BYTES, 'RENDERED_OCR_TEXT_BOUNDS')
        raw = result.stdout
        text = raw.decode('utf-8')
    except (OSError, subprocess.SubprocessError, UnicodeError):
        raise base.Unverified('RENDERED_OCR_EXECUTION_UNVERIFIED') from None
    verify_ocr_toolchain(binding)
    return text, raw, version_text

class Software(base.Native):
    def __init__(self, pid, window, elf, source, proof, executable, installed=False):
        candidate = Path(executable)
        temp = Path(os.environ.get('RUNNER_TEMP', '/NONEXISTENT')).resolve()
        category = 'INSTALLED_EXECUTABLE_REQUIRED' if installed else 'EXTRACTED_EXECUTABLE_REQUIRED'
        base.require(candidate.is_absolute() and candidate.is_file() and
                     not any(p.is_symlink() for p in [candidate, *candidate.parents]), category)
        if installed:
            base.require(candidate == Path('/usr/bin/xi-io-hex-dev'), category)
        else:
            base.require(candidate.resolve().is_relative_to(temp) and
                         candidate.parts[-3:] == ('usr', 'bin', 'xi-io-hex-dev'), category)
        self.expected_executable = str(candidate.resolve())
        super().__init__(pid, window, elf, source, proof)
        self.ocr_toolchain = load_ocr_toolchain()

    def readiness_nodes(self, nodes):
        return [n for n in nodes if node_name(n) == INITIALIZED_NAME and n.get_role() == self.ax.Role.STATUS_BAR and self.visible(n)]

    def initialized(self, nodes=None):
        nodes = self.nodes() if nodes is None else nodes
        matches = self.readiness_nodes(nodes)
        if not matches:
            # Bounded allowlisted failure categories only, never an AX tree dump.
            for node in nodes:
                if not self.visible(node): continue
                name = node_name(node)
                if name in {'ARTCRAFT_MODULE_LOADER_UNBOUND','ARTCRAFT_GENERATED_EXPORTS_UNBOUND','ARTCRAFT_DONOR_EXPORT_UNBOUND','ARTCRAFT_DONOR_HANDLE_INVALID','ARTCRAFT_CLEANUP_UNVERIFIED','ARTCRAFT_RUNNER_START_FAILED','ARTCRAFT_LOCAL_MODULE_IMPORT_FAILED','ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED','ARTCRAFT_LOCAL_MODULE_IMPORT_FAILED_WITH_LOCAL_POLICY_EVENT','ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_LOCAL_FETCH_POLICY_EVENT','ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_UNATTRIBUTED_COMPILE_POLICY_EVENT'}:
                    raise base.Unverified(name)
        base.require(len(matches) == 1, 'ARTCRAFT_INITIALIZATION_NOT_OBSERVED')
        base.require(not any(node_name(n) in DEV12_CARD_NAMES and n.get_role() == self.ax.Role.PUSH_BUTTON
                             and self.visible(n) for n in nodes), 'ARTCRAFT_RETIRED_CONTENT_VISIBLE')
        self.initialization_control = {'name': matches[0].get_name(), 'role': 'status', 'visible': True}
        return True

    def open_software(self):
        self.stage = 'software-navigation-control'
        self.command(['xdotool', 'windowfocus', '--sync', self.window])
        roles = [self.ax.Role.PUSH_BUTTON, self.ax.Role.PAGE_TAB]
        self.click(self.wait(lambda: self.find('Software', roles)))

    def promote_attempt(self, parent, attempt, name):
        reading = self.rendered_text_readback
        files = {
            name + '.png': reading['screenshot_sha256'],
            name + '-owned-window.png': reading['crop_sha256'],
            name + '-owned-window.ocr.txt': reading['raw_text_sha256'],
            name + '-owned-window.layout.ocr.txt': reading['layout_pass']['raw_text_sha256'],
        }
        base.require(all(not (parent/file).exists() and not (parent/file).is_symlink() for file in files),
                     'ARTCRAFT_PROOF_PATH_EXISTS')
        for file, expected in files.items():
            source, target = attempt/file, parent/file
            base.require(file_digest(source) == expected, 'RENDERED_EVIDENCE_CHANGED')
            with source.open('rb') as incoming, target.open('xb') as outgoing:
                for chunk in iter(lambda: incoming.read(1024 * 1024), b''):
                    outgoing.write(chunk)
            base.require(file_digest(source) == file_digest(target) == expected, 'RENDERED_PROMOTION_MISMATCH')

    def observe_rendered(self, name, controls, retired=False):
        """Retry only prepaint or missing text, never reuse a previous frame."""
        parent = self.proof
        attempts = parent/(name + '-attempts')
        manifest = parent/(name + '-attempts.json')
        base.require(not attempts.exists() and not attempts.is_symlink()
                     and not manifest.exists() and not manifest.is_symlink(), 'ARTCRAFT_PROOF_PATH_EXISTS')
        attempts.mkdir(mode=0o700)
        rows, accepted = [], None
        retryable = {'PNG_BLANK_OR_PREPAINT', 'PNG_FLAT_FRAME_NO_UI_TEXTURE',
                     'RETIRED_DEV12_RENDERED_TITLE_NOT_OBSERVED' if retired else 'ARTCRAFT_RENDERED_CONTENT_NOT_OBSERVED'}
        last = 'RETIRED_DEV12_RENDERED_TITLE_NOT_OBSERVED' if retired else 'ARTCRAFT_RENDERED_CONTENT_NOT_OBSERVED'
        try:
            for index in range(1, 41):
                base.require(time.monotonic() < self.deadline, 'INTERACTION_DEADLINE')
                attempt = Path(tempfile.mkdtemp(prefix=f'{index:02d}-', dir=attempts))
                self.proof = attempt
                if hasattr(self, 'rendered_text_readback'):
                    del self.rendered_text_readback
                error, image, observed = None, None, None
                self.stage = 'software-retired-body-capture' if retired else 'software-initialized-capture'
                try:
                    self.guard()
                    controls()
                    geometry = tuple(self.geometry)
                    image = self.capture(name)
                    self.guard()
                    base.require(tuple(self.geometry) == geometry, 'RENDERED_WINDOW_GEOMETRY_CHANGED')
                    controls()
                    self.stage = 'software-retired-rendered-title' if retired else 'software-rendered-xiio-content'
                    self.rendered_content(name, image, geometry, retired=retired)
                    self.guard()
                    base.require(tuple(self.geometry) == geometry, 'RENDERED_WINDOW_GEOMETRY_CHANGED')
                    observed = controls()
                except subprocess.CalledProcessError as failure:
                    checker = Path(__file__).with_name('verify-hex-capture.py')
                    command = ['python3', '-I', '-B', str(checker), str(attempt/(name + '.png'))]
                    category = failure.stderr.strip() if isinstance(failure.stderr, str) else ''
                    error = base.Unverified(category) if failure.cmd == command and category in {'PNG_BLANK_OR_PREPAINT', 'PNG_FLAT_FRAME_NO_UI_TEXTURE'} else failure
                except Exception as failure:
                    error = failure
                finally:
                    self.proof = parent
                category = str(error) if isinstance(error, base.Unverified) else type(error).__name__ if error else None
                can_retry = isinstance(error, base.Unverified) and category in retryable
                record = {'schema': 'xiio.hex.rendered-artcraft-attempt/v1', 'attempt': index,
                          'outcome': 'RETRYABLE' if can_retry else 'REFUSED' if error else 'OBSERVED',
                          'failure_category': category,
                          'files': {path.name: {'bytes': path.stat().st_size, 'sha256': file_digest(path)}
                                    for path in sorted(attempt.iterdir()) if path.is_file()}}
                if hasattr(self, 'rendered_text_readback'):
                    record['rendered_text_readback'] = self.rendered_text_readback
                record_path = attempt/'attempt.json'
                with record_path.open('x') as stream:
                    json.dump(record, stream, sort_keys=True)
                rows.append({'attempt': index, 'directory': attempt.relative_to(parent).as_posix(),
                             'outcome': record['outcome'], 'failure_category': category,
                             'record_sha256': file_digest(record_path)})
                if error:
                    if not can_retry:
                        raise error
                    # A missing pixel/text result never excuses changed authority
                    # or controls before another capture is attempted.
                    self.guard()
                    controls()
                    last = category
                    base.require(time.monotonic() < self.deadline, 'INTERACTION_DEADLINE')
                    if index < 40:
                        time.sleep(.2)
                    continue
                self.promote_attempt(parent, attempt, name)
                accepted = attempt.relative_to(parent).as_posix()
                return image, observed
            raise base.Unverified(last)
        finally:
            self.proof = parent
            summary = {'schema': 'xiio.hex.rendered-artcraft-attempts/v1', 'max_attempts': 40,
                       'accepted_attempt': accepted, 'attempts': rows}
            with manifest.open('x') as stream:
                json.dump(summary, stream, sort_keys=True)
            self.rendered_attempts = {'manifest_file': manifest.name, 'manifest_sha256': file_digest(manifest),
                                     'attempts_directory': attempts.name, 'attempt_count': len(rows),
                                     'accepted_attempt': accepted}

    def rendered_content(self, name, screenshot_sha, geometry, retired=False):
        """Read only the owned window pixels from this guarded fresh capture."""
        self.guard()
        base.require(tuple(self.geometry) == geometry, 'RENDERED_WINDOW_GEOMETRY_CHANGED')
        screenshot = self.proof/(name + '.png')
        base.require(file_digest(screenshot) == screenshot_sha, 'RENDERED_SCREENSHOT_DIGEST_MISMATCH')
        base.require(24 <= screenshot.stat().st_size <= CAPTURE_MAX_BYTES, 'RENDERED_SCREENSHOT_BOUNDS')
        raw_image = screenshot.read_bytes()
        base.require(base.sha(raw_image) == screenshot_sha and len(raw_image) <= CAPTURE_MAX_BYTES,
                     'RENDERED_SCREENSHOT_DIGEST_MISMATCH')
        try:
            from PIL import Image
        except ImportError:
            raise base.Unverified('RENDERED_IMAGE_DECODER_UNAVAILABLE') from None
        try:
            with Image.open(io.BytesIO(raw_image)) as original:
                size = original.size
                base.require(original.format == 'PNG' and getattr(original, 'n_frames', 1) == 1
                             and size[0] * size[1] <= 4096 * 4096, 'RENDERED_SCREENSHOT_BOUNDS')
                original.verify()
            x, y, width, height = geometry
            base.require(all(isinstance(n, int) for n in geometry) and x >= 0 and y >= 0
                         and width >= 320 and height >= 200
                         and x + width <= size[0] and y + height <= size[1], 'RENDERED_WINDOW_CROP_OUTSIDE_CAPTURE')
            crop = self.proof/(name + '-owned-window.png')
            with Image.open(io.BytesIO(raw_image)) as original, crop.open('xb') as stream:
                original.crop((x, y, x + width, y + height)).save(stream, format='PNG')
        except (OSError, ValueError, Image.DecompressionBombError):
            raise base.Unverified('RENDERED_IMAGE_DECODE_UNVERIFIED') from None
        crop_sha = file_digest(crop)
        try:
            self.command(['python3', '-I', '-B', str(Path(__file__).with_name('verify-hex-capture.py')), str(crop)])
        except (OSError, subprocess.SubprocessError):
            raise base.Unverified('RENDERED_WINDOW_PIXELS_UNVERIFIED') from None
        ocr_options = {'toolchain': self.ocr_toolchain} if hasattr(self, 'ocr_toolchain') else {}
        text, raw, version = read_ocr(crop, self.deadline - time.monotonic(), page_segmentation_mode=11, **ocr_options)
        text_path = self.proof/(name + '-owned-window.ocr.txt')
        with text_path.open('xb') as stream:
            stream.write(raw)
        text_sha = base.sha(raw)
        self.guard()
        base.require(tuple(self.geometry) == geometry, 'RENDERED_WINDOW_GEOMETRY_CHANGED')
        base.require(file_digest(screenshot) == screenshot_sha and file_digest(crop) == crop_sha,
                     'RENDERED_EVIDENCE_CHANGED')
        layout_text, layout_raw, layout_version = read_ocr(crop, self.deadline - time.monotonic(), page_segmentation_mode=3, **ocr_options)
        base.require(layout_version == version, 'RENDERED_OCR_EXECUTOR_CHANGED')
        layout_path = self.proof/(name + '-owned-window.layout.ocr.txt')
        with layout_path.open('xb') as stream:
            stream.write(layout_raw)
        layout_sha = base.sha(layout_raw)
        self.rendered_text_readback = {
            'schema': 'xiio.hex.rendered-artcraft-text/v2', 'content_verified': False,
            'observation_mode': 'retired-dev12' if retired else 'candidate',
            'backend': 'tesseract', 'backend_version': version, 'language': 'eng', 'page_segmentation_mode': 11,
            'screenshot_file': screenshot.name, 'screenshot_sha256': screenshot_sha,
            'screenshot_dimensions': list(size), 'owned_window_geometry': list(geometry),
            'crop_file': crop.name, 'crop_sha256': crop_sha, 'crop_rectangle': [x, y, width, height],
            'image_transform': 'owned-window-crop-only',
            'raw_text_file': text_path.name, 'raw_text_sha256': text_sha, 'raw_text_bytes': len(raw), 'raw_text': text,
            'layout_pass': {'backend': 'tesseract', 'backend_version': layout_version, 'language': 'eng',
                            'page_segmentation_mode': 3, 'crop_sha256': crop_sha,
                            'raw_text_file': layout_path.name, 'raw_text_sha256': layout_sha,
                            'raw_text_bytes': len(layout_raw), 'raw_text': layout_text},
            **rendered_text_matches(text, layout_text, retired=retired),
        }
        if hasattr(self, 'ocr_toolchain'):
            self.rendered_text_readback['ocr_toolchain'] = {
                'identity_file': Path(self.ocr_toolchain['identity_path']).name,
                'identity_sha256': self.ocr_toolchain['identity_sha256'],
                'identity': self.ocr_toolchain['identity'],
            }
        self.guard()
        base.require(tuple(self.geometry) == geometry, 'RENDERED_WINDOW_GEOMETRY_CHANGED')
        base.require(file_digest(screenshot) == screenshot_sha and file_digest(crop) == crop_sha
                     and file_digest(text_path) == text_sha and file_digest(layout_path) == layout_sha,
                     'RENDERED_EVIDENCE_CHANGED')
        require_rendered_text(self.rendered_text_readback, retired=retired)
        self.rendered_text_readback['content_verified'] = True

    def run(self):
        self.open_software()
        self.stage = 'software-generated-module-initialization'
        self.wait(self.initialized)
        image, _ = self.observe_rendered('software-initialized', self.initialized)
        return image

    def retired_controls(self):
        nodes = self.nodes()
        controls = []
        for name in DEV12_CARD_NAMES:
            matches = [n for n in nodes if node_name(n) == name and n.get_role() == self.ax.Role.PUSH_BUTTON and self.visible(n)]
            base.require(len(matches) == 1, 'RETIRED_DEV12_REFERENCE_CARDS_NOT_OBSERVED')
            controls.append({'name': matches[0].get_name(), 'role': 'button', 'visible': True})
        # Any visible readiness status, including duplicates, defeats this RED.
        # The SAME readiness method must then refuse the observed old body.
        base.require(not self.readiness_nodes(nodes), 'RETIRED_DEV12_READINESS_PRESENT')
        try:
            self.initialized(nodes)
        except base.Unverified as error:
            if str(error) != 'ARTCRAFT_INITIALIZATION_NOT_OBSERVED':
                raise
        else:
            raise base.Unverified('RETIRED_DEV12_UNEXPECTEDLY_INITIALIZED')
        return controls

    def run_retired(self):
        self.open_software()
        self.stage = 'software-retired-reference-readback'
        self.wait(self.retired_controls)
        return self.observe_rendered('software-retired-dev12', self.retired_controls, retired=True)

def main():
    args = sys.argv[1:]
    retired = args[:1] == ['--retired-dev12']
    installed = args[:1] == ['--installed']
    if retired or installed: args = args[1:]
    receipt = {'schema':'xiio.hex.extracted-artcraft-initialization/v1','status':'UNVERIFIED',
               'initialization_observed':False,'xiio_catalog_rendered':False,'domain_action_verified':False,'installer_action_verified':False,
               'installed_package':False,'aries_install':False,'provider_effect':False,
               'pop_os_acceptance':False,'release_promotion':False,
               'physical_target':'GITHUB_HOSTED_XVFB_INSTALLED_PACKAGE' if installed else 'GITHUB_HOSTED_XVFB_EXTRACTED_PACKAGE',
               'observation_mode':'retired-dev12' if retired else 'installed-candidate' if installed else 'candidate'}
    if retired:
        receipt.update(red_established=False, release_tag='xiio-hex-local-d160521c-dev12',
                       released_source_commit='d160521cffd3ff7e627155050faeecc693ac76bc',
                       compiled_source_commit='cd7716a1c40ca6b6fb7393fcedb8ae50f5a5a2b6',
                       expected_debian_package_sha256=DEV12_PACKAGE_SHA256,
                       expected_native_elf_sha256=DEV12_ELF_SHA256)
    native = None
    proof = None
    try:
        base.require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'DISPOSABLE_RUNNER_REQUIRED')
        if retired:
            base.require(len(args) == 6, 'USAGE_RETIRED_PID_WINDOW_SOURCE_PROOF_EXECUTABLE_PACKAGE')
            pid, window, source, directory, executable, package = args
            elf = DEV12_ELF_SHA256
        else:
            base.require(len(args) == 8, 'USAGE_PID_WINDOW_ELF_SOURCE_PROOF_EXECUTABLE_PACKAGE_FRONTEND')
            pid, window, elf, source, directory, executable, package, frontend = args
        base.require(base.SOURCE.fullmatch(source) and base.DIGEST.fullmatch(elf), 'SOURCE_IDENTITY_REQUIRED')
        candidate = Path(directory)
        base.require(candidate.is_absolute() and candidate.is_dir() and not any(p.is_symlink() for p in [candidate,*candidate.parents]), 'PROOF_DIRECTORY_INVALID')
        proof = candidate
        base.require(os.environ.get('GITHUB_SHA') == source, 'CANDIDATE_VERIFIER_SOURCE_MISMATCH')
        base.require(pid.isdigit() and int(pid) > 1 and window.isdigit(), 'PROCESS_IDENTITY_REQUIRED')
        receipt.update(input_backend='XTEST',readback_backend='AT-SPI',pid=int(pid),window_id=window,
                       github_run_id=os.environ.get('GITHUB_RUN_ID'),github_run_attempt=os.environ.get('GITHUB_RUN_ATTEMPT'))
        execution_os = {}
        for line in Path('/etc/os-release').read_text().splitlines():
            if '=' in line:
                key, value = line.split('=', 1)
                if key in ('ID','VERSION_ID','PRETTY_NAME'):execution_os[key] = value.strip('"')
        receipt['executor_os'] = execution_os
        if retired:
            receipt.update(candidate_verifier_source=source, **dev12_binding(package, executable))
        else:
            receipt.update(source_commit=source, **frontend_binding(frontend, source, elf, package, executable))
            if installed:
                receipt.update(installed_package_binding(executable, receipt.get('package_version')))
        native = Software(int(pid),window,elf,source,directory,executable,installed=installed)
        if retired:
            image, controls = native.run_retired()
            receipt.update(status='RETIRED_DEV12_REFUSED',red_established=True,
                           retired_reference_cards_observed=True,observed_retired_controls=controls,
                           retired_title_rendered=True,
                           artcraft_readiness_refusal='ARTCRAFT_INITIALIZATION_NOT_OBSERVED',
                           screenshot_sha256=image)
        else:
            receipt['screenshot_sha256'] = native.run()
            receipt.update(status='INITIALIZED',initialization_observed=True,xiio_catalog_rendered=True,
                           observed_initialization_control=native.initialization_control)
        code = 0
    except base.Unverified as error:
        receipt['failure_category'] = str(error)
        code = 61
    except Exception:
        receipt['failure_category'] = 'NATIVE_INITIALIZATION_PROVIDER_UNVERIFIED'
        code = 62
    if native is not None:
        receipt['last_stage'] = native.stage
        if hasattr(native, 'rendered_text_readback'):
            receipt['rendered_text_readback'] = native.rendered_text_readback
        if hasattr(native, 'rendered_attempts'):
            receipt['rendered_attempts'] = native.rendered_attempts
        if code != 0:
            try:
                name = 'software-retired-dev12-unverified' if retired else 'software-unverified'
                base.require(proof is not None and not (proof/(name+'.png')).exists()
                             and not (proof/(name+'.png')).is_symlink(), 'ARTCRAFT_PROOF_PATH_EXISTS')
                receipt['failure_screenshot_sha256'] = native.capture(name)
            except Exception: receipt['failure_capture_verified'] = False
    if proof is not None:
        path = proof/('hex-dev12-ui-red.json' if retired else 'software-initialization.json')
        with path.open('x') as handle: json.dump(receipt,handle,sort_keys=True)
        base.require(json.loads(path.read_text()) == receipt, 'RECEIPT_READBACK_MISMATCH')
    print('HEX_ARTCRAFT_'+receipt['status'])
    return code

if __name__ == '__main__': sys.exit(main())
