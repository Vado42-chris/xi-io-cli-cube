#!/usr/bin/python3
"""Read-only failure snapshot. No raw application text or process arguments emitted."""
import collections
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import tempfile

KINDS = ('WebKitWebProcess', 'WebKitNetworkProcess', 'WebKitGPUProcess')
ACTIONS = ('state', 'drag', 'minimize', 'maximize', 'close', 'resize')
STAGES = ('before', 'after_dispatch', 'dispatch')
RESULTS = ('not_attempted', 'accepted', 'failed')


def stat(proc, pid):
    with (proc / str(pid) / 'stat').open() as f:
        raw = f.read(4096)
    fields = raw[raw.rfind(')') + 2:].split()
    return fields[0], int(fields[1]), fields[19]


def identity(proc, pid):
    state, parent, start = stat(proc, pid)
    if state in ('Z', 'X'):
        raise ValueError('not live')
    return f'{pid}:{parent}:{start}'


def children(proc, pid):
    counts = dict.fromkeys(KINDS, 0)
    queue = [pid]
    seen = set()
    while queue and len(seen) < 128:
        parent = queue.pop(0)
        if parent in seen:
            continue
        seen.add(parent)
        try:
            with (proc / str(parent) / 'task' / str(parent) / 'children').open() as f:
                ids = f.read(4096).split()
            for value in ids[:128]:
                child = int(value)
                state, ppid, start = stat(proc, child)
                if ppid != parent or state in ('Z', 'X'):
                    continue
                kind = pathlib.Path(os.readlink(proc / str(child) / 'exe')).name
                if stat(proc, child) != (state, ppid, start):
                    continue
                if kind in counts:
                    counts[kind] += 1
                if len(queue) < 128:
                    queue.append(child)
        except (OSError, ValueError, IndexError):
            continue
    return {'live_descendant_counts': counts, 'scan_limit': 128,
            'scan_truncated': bool(queue), 'absence_proves_never_loaded': False}


def events(path):
    counts = collections.Counter()
    # Bounded tail only; unrelated lines, unknown values and fields are discarded.
    with path.open('rb') as f:
        size = f.seek(0, 2)
        f.seek(max(0, size - 65536))
        lines = f.read(65536).splitlines()
    if size > 65536:
        lines = lines[1:]
    for line in lines:
        if not line.startswith(b'HEX_NATIVE_WINDOW ') or len(line) > 4096:
            continue
        try:
            item = json.loads(line[18:])
            key = (item.get('action'), item.get('stage'), item.get('command_result'))
            if key[0] in ACTIONS and key[1] in STAGES and key[2] in RESULTS:
                counts['/'.join(key)] += 1
        except (ValueError, AttributeError, TypeError):
            pass
    return {'known_command_event_counts': dict(counts), 'tail_bytes_limit': 65536,
            'renderer_load_events_available': False}


def geometry(text, display):
    fields = dict(re.findall(r'^(X|Y|WIDTH|HEIGHT)=(-?\d{1,9})$', text, re.M))
    x, y, w, h = (int(fields[k]) for k in ('X', 'Y', 'WIDTH', 'HEIGHT'))
    sw, sh = map(int, display.split())
    if w <= 0 or h <= 0 or sw <= 0 or sh <= 0:
        raise ValueError('invalid geometry')
    return {'x': x, 'y': y, 'width': w, 'height': h,
            'display_width': sw, 'display_height': sh,
            'intersects_display': x < sw and y < sh and x + w > 0 and y + h > 0}


def snapshot(proc, pid, expected, window, log, run):
    if identity(proc, pid) != expected:
        return {'classification': 'PROCESS_IDENTITY_CHANGED'}
    result = {'classification': 'NO_SELECTED_WINDOW', 'renderer_load_verified': False}
    if window.isdigit():
        if run('getwindowpid', window).strip() != str(pid) or run('getwindowname', window).strip() != 'XI-IO HEX':
            return {'classification': 'WINDOW_IDENTITY_CHANGED'}
        mapped = window in run('search', '--onlyvisible', '--pid', str(pid), '--name', '^XI-IO HEX$').split()
        shape = geometry(run('getwindowgeometry', '--shell', window), run('getdisplaygeometry'))
        result.update(mapped=mapped, geometry=shape, classification=(
            'SELECTED_WINDOW_UNMAPPED' if not mapped else
            'SELECTED_WINDOW_OFFSCREEN' if not shape['intersects_display'] else
            'SELECTED_WINDOW_MAPPED_ONSCREEN'))
        if run('getwindowpid', window).strip() != str(pid):
            return {'classification': 'WINDOW_IDENTITY_CHANGED'}
    result['webkit'] = children(proc, pid)
    result['window_commands'] = events(log)
    if identity(proc, pid) != expected:
        return {'classification': 'PROCESS_IDENTITY_CHANGED'}
    return result


def main():
    deadline = time.monotonic() + 4
    def run(*args):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        # Fixed xdotool queries only. Do not emit its errors or raw output.
        with tempfile.TemporaryFile() as out:
            p = subprocess.run(['xdotool', *args], stdout=out, stderr=subprocess.DEVNULL,
                               timeout=min(0.5, remaining), check=False)
            if p.returncode not in (0, 1):
                raise ValueError('query failed')
            out.seek(0)
            data = out.read(4097)
            if len(data) > 4096:
                raise ValueError('oversized query')
            return data.decode('ascii')
    try:
        result = snapshot(pathlib.Path('/proc'), int(sys.argv[1]), sys.argv[2],
                          sys.argv[3], pathlib.Path(sys.argv[4]), run)
    except (OSError, ValueError, IndexError, KeyError, TimeoutError, subprocess.TimeoutExpired):
        result = {'classification': 'DIAGNOSTIC_UNAVAILABLE'}
    print(json.dumps({'schema': 'xiio.hex.window-diagnostic/v1', 'semantic_ui_verified': False,
                      'observation_only': True, **result}, sort_keys=True))


if __name__ == '__main__':
    main()
