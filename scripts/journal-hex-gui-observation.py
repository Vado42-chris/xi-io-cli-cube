#!/usr/bin/python3
"""CI observation adapter for the existing installer journal; no Work delivery."""
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'native/hex/adapter/kernel'))
from xiio_installer.observability import OperationJournal, inspect_operation

EXPECTED = 'Observe isolated extracted HEX pixels without installing or connecting'
CATEGORIES = {
    81: 'PROCESS_IDENTITY_UNAVAILABLE_OR_EXITED',
    82: 'WINDOW_OBSERVATION_DEADLINE_OR_ABSENT',
    83: 'PROCESS_IDENTITY_CHANGED',
    84: 'WINDOW_IDENTITY_CHANGED',
    85: 'CAPTURE_BLANK_OR_PREPAINT',
    86: 'ISOLATED_PROFILE_SENTINEL_CHANGED',
}

def checked_inspection(value, operation_id, correlation_id, details, events, outcome):
    """Accept only the exact journal readback, not a matching outcome label."""
    keys = {'schema_version', 'operation_id', 'correlation_id', 'component', 'operation',
            'final_state', 'incomplete', 'event_count', 'journal_sha256', 'event_chain_valid',
            'started_at', 'finished_at', 'events'}
    if type(value) is not dict or set(value) != keys:
        raise ValueError('READBACK_FIELDS_MISMATCH')
    fixed = {'schema_version': 'xiio-operation-inspection-v1', 'operation_id': operation_id,
             'correlation_id': correlation_id, 'component': 'hex-gui-qualification',
             'operation': 'observe-pixels', 'final_state': outcome}
    if any(value[k] != expected for k, expected in fixed.items()):
        raise ValueError('READBACK_IDENTITY_MISMATCH')
    if value['incomplete'] is not False or value['event_chain_valid'] is not True:
        raise ValueError('READBACK_VERIFICATION_MISSING')
    if type(value['event_count']) is not int or value['event_count'] != 2:
        raise ValueError('READBACK_EVENT_COUNT_MISMATCH')
    if not isinstance(value['journal_sha256'], str) or not re.fullmatch('[0-9a-f]{64}', value['journal_sha256']):
        raise ValueError('READBACK_DIGEST_INVALID')
    if type(value['events']) is not list or len(value['events']) != 2:
        raise ValueError('READBACK_EVENTS_MISSING')
    # Exact comparison includes exit/category, source/mode/run details, booleans,
    # sequence, both event identities/hashes, and every fixed bounded text field.
    # No unknown inspector keys or strings may enter the artifact projection.
    encode = lambda x: json.dumps(x, sort_keys=True, separators=(',', ':'))
    if encode(value['events']) != encode(events):
        raise ValueError('READBACK_EVENT_BINDING_MISMATCH')
    for event in value['events']:
        if encode(event['details']) != encode(details):
            raise ValueError('READBACK_DETAILS_MISMATCH')
        if event['operation_id'] != operation_id or event['correlation_id'] != correlation_id:
            raise ValueError('READBACK_EVENT_IDENTITY_MISMATCH')
    if value['started_at'] != events[0]['observed_at'] or value['finished_at'] != events[1]['observed_at']:
        raise ValueError('READBACK_TIMELINE_MISMATCH')
    return value

def observe(proof, source, mode, run_attempt, run, *, journal_factory=OperationJournal,
            inspector=inspect_operation):
    if not re.fullmatch('[0-9a-f]{40}', source):
        raise ValueError('SOURCE_COMMIT_REQUIRED')
    if mode not in ('original', 'webkit-default'):
        raise ValueError('RENDER_MODE_REQUIRED')
    if not re.fullmatch('[0-9]{1,20}-[0-9]{1,6}', run_attempt):
        raise ValueError('PROVIDER_RUN_ATTEMPT_REQUIRED')
    proof = pathlib.Path(proof)
    # Only explicit caller-selected proof directory; never follow a redirected
    # projection target or ancestor. The CLI does not discover a user state root.
    if any(p.is_symlink() for p in (proof, *proof.parents)):
        raise ValueError('PROOF_DIRECTORY_INVALID')
    state = proof / 'operation-state'
    operation_id = f'hex-gui-{run_attempt}-{mode}'
    # Replay does not launch a second observation or append after a terminal.
    # A started-only prior journal remains unknown; no implicit retry.
    details = {'source_commit': source, 'render_mode': mode, 'provider_run_attempt': run_attempt,
               'work_ingestion_verified': False, 'owner_ack_verified': False,
               'semantic_ui_verified': False, 'installed_package': False}
    journal = None
    logging_error = None
    try:
        journal = journal_factory('hex-gui-qualification', 'observe-pixels',
            operation_id=operation_id, correlation_id=f'gh-{run_attempt}', root=state)
        if journal.sequence:
            print('HEX_OBSERVATION_ALREADY_RECORDED_INSPECT_DO_NOT_RETRY', file=sys.stderr)
            return 72, None
        started = journal.start(EXPECTED, actor_kind='ci_runner', tool='hex-gui-smoke', details=details)
    except Exception:
        logging_error = 'HEX_OPERATION_LOGGING_UNAVAILABLE'
    uncertain = False
    try:
        status = run()
        if type(status) is not int or not 0 <= status <= 255:
            raise ValueError('INVALID_OBSERVATION_EXIT')
    except Exception:
        status = 70
        uncertain = True
        print('HEX_OBSERVATION_OUTCOME_UNCERTAIN', file=sys.stderr)
    try:
        if logging_error:
            raise RuntimeError('journal unavailable')
        category = 'OBSERVATION_OUTCOME_UNCERTAIN' if uncertain else None if status == 0 else CATEGORIES.get(status, 'OBSERVATION_FAILED')
        terminal = journal.finish('unknown' if uncertain else 'passed' if status == 0 else 'failed',
            'Pixel smoke passed; semantic acceptance not established' if status == 0
            else 'Pixel smoke failed; qualification remains incomplete',
            expected_action=EXPECTED, actor_kind='ci_runner', tool='hex-gui-smoke',
            exit_code=status, failure_category=category, details=details,
            recommended_next_action='Review bounded proof and return to existing owner; no native Work ACK observed')
    except Exception:
        # Never append a speculative second terminal after a partial write.
        print('HEX_OPERATION_LOGGING_UNAVAILABLE', file=sys.stderr)
        return status if status else 70, None
    try:
        inspection = inspector(operation_id, root=state)
        expected = 'unknown' if uncertain else 'passed' if status == 0 else 'failed'
        inspection = checked_inspection(inspection, operation_id, f'gh-{run_attempt}',
                                        details, [started, terminal], expected)
    except Exception:
        print('HEX_OPERATION_READBACK_UNVERIFIED', file=sys.stderr)
        return status if status else 71, None
    # Existing inspection schema only. No raw process output or local paths.
    try:
        output = proof / 'operation-inspection.json'
        # Exclusive fixed filename; never clobber another receipt/projection.
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as handle:
            handle.write(json.dumps(inspection, sort_keys=True)+'\n')
            handle.flush()
            os.fsync(handle.fileno())
        if json.loads(output.read_text()) != inspection:
            raise ValueError('PROJECTION_READBACK_MISMATCH')
    except Exception:
        print('HEX_OPERATION_READBACK_UNVERIFIED', file=sys.stderr)
        return status if status else 71, None
    return status, inspection

if __name__ == '__main__':
    try:
        payload, proof, mode, source, run_attempt = sys.argv[1:]
        script = ROOT / 'scripts/verify-extracted-hex-gui.sh'
        code, _ = observe(proof, source, mode, run_attempt,
            lambda: subprocess.run(['bash', str(script), payload, proof, mode], check=False).returncode)
    except Exception:
        print('HEX_OPERATION_INPUT_OR_LOGGING_UNAVAILABLE', file=sys.stderr)
        code = 70
    sys.exit(code)
