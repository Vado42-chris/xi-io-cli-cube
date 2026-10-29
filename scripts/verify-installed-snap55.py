#!/usr/bin/python3
"""Disposable CI only: read-only AT-SPI + XTEST, never DOM/IPC evaluation."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from fractions import Fraction

SOURCE = re.compile(r'[0-9a-f]{40}')
DIGEST = re.compile(r'[0-9a-f]{64}')
FIXTURE = {'questions': [{'id': 'a', 'pillar': 'autism'}, {'id': 'b', 'pillar': 'adhd'}],
           'responses': {'a': 4, 'b': 0}, 'nowMs': '1793200000000',
           'decayMode': 'legacy_efold18',
           'journal': [{'timestamp': '1793196400000', 'sensoryEntropy': 50}]}
EXPECTED = Fraction(1, 4)*Fraction(13, 21)+Fraction(65, 100)*Fraction(1, 2)+Fraction(5, 1000)

class Unverified(Exception):
    pass

def require(value, code):
    if not value:
        raise Unverified(code)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def parse_result(text, negative=False):
    # Only displayed summary labels, never guessed/fuzzy/OCR-repaired strings.
    states = set(re.findall(r'\bState:\s*([A-Z_]+)\b', text))
    values = set(re.findall(r'\bR:\s*(UNKNOWN|[0-9]+(?:\.[0-9]+)?)(?=\s|$)', text))
    known = set(re.findall(r'\bKnown:\s*(\d+/\d+)\b', text))
    require(states == {('UNKNOWN_REQUIRED_RESPONSES' if negative else 'SOURCE_BOUND_NUMERIC')}, 'DISPLAY_STATE_UNVERIFIED')
    require(known == {('1/2' if negative else '2/2')}, 'DISPLAY_COUNT_UNVERIFIED')
    require(len(values) == 1, 'DISPLAY_R_AMBIGUOUS')
    value = next(iter(values))
    if negative:
        require(value == 'UNKNOWN', 'STALE_NUMERIC_RESULT')
    else:
        require(value != 'UNKNOWN' and math.isfinite(float(value)) and abs(float(value)-float(EXPECTED)) <= 1e-14, 'INDEPENDENT_ARITHMETIC_MISMATCH')
    return {'state': next(iter(states)), 'R': None if negative else float(value), 'known': next(iter(known))}

class Native:
    def __init__(self, pid, window, elf, source, proof):
        require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'DISPOSABLE_RUNNER_REQUIRED')
        require(SOURCE.fullmatch(source) and DIGEST.fullmatch(elf), 'SOURCE_IDENTITY_REQUIRED')
        require(pid > 1 and window.isdigit(), 'PROCESS_IDENTITY_REQUIRED')
        self.pid, self.window, self.elf = pid, window, elf
        self.proof = Path(proof)
        require(self.proof.is_dir() and not any(p.is_symlink() for p in [self.proof, *self.proof.parents]), 'PROOF_DIRECTORY_INVALID')
        self.stage = "provider-initialization"
        self.results = []
        self.deadline = time.monotonic()+90
        self.start = self.identity()
        self.guard()
        try:
            import gi
            gi.require_version('Atspi', '2.0')
            from gi.repository import Atspi
            self.ax = Atspi
            Atspi.set_timeout(1000, 1000)
            Atspi.init()
        except Exception:
            raise Unverified('ACCESSIBILITY_PROVIDER_UNAVAILABLE') from None

    def identity(self):
        p = Path('/proc')/str(self.pid)
        return (p.joinpath('stat').read_text().rsplit(')', 1)[1].split()[19], str(p.joinpath('exe').resolve()))

    def command(self, args):
        left = self.deadline-time.monotonic()
        require(left > 0, 'INTERACTION_DEADLINE')
        return subprocess.run(args, check=True, capture_output=True, text=True, timeout=min(left, 3)).stdout.strip()

    def guard(self, focused=False):
        require(self.identity() == self.start and self.start[1] == '/usr/bin/xi-io-hex-dev', 'PROCESS_IDENTITY_CHANGED')
        require(sha(Path('/proc', str(self.pid), 'exe').read_bytes()) == self.elf, 'ELF_IDENTITY_CHANGED')
        require(self.command(['xdotool', 'getwindowpid', self.window]) == str(self.pid), 'WINDOW_PID_CHANGED')
        require(self.command(['xdotool', 'getwindowname', self.window]) == 'XI-IO HEX', 'WINDOW_TITLE_CHANGED')
        geometry = dict(x.split('=', 1) for x in self.command(['xdotool','getwindowgeometry','--shell',self.window]).splitlines() if '=' in x)
        self.geometry = tuple(int(geometry[k]) for k in ('X','Y','WIDTH','HEIGHT'))
        if focused:
            require(self.command(['xdotool', 'getwindowfocus']) == self.window, 'WINDOW_FOCUS_CHANGED')

    def nodes(self):
        desktop = self.ax.get_desktop(0)
        apps = [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]
        apps = [a for a in apps if a.get_process_id() == self.pid]
        require(len(apps) == 1, 'ACCESSIBILITY_APPLICATION_UNVERIFIED')
        queue = [(apps[0], 0)]
        out = []
        while queue:
            require(time.monotonic() < self.deadline, 'INTERACTION_DEADLINE')
            node, depth = queue.pop(0)
            require(len(out) < 2048 and depth < 40, 'ACCESSIBILITY_TREE_BOUNDS')
            out.append(node)
            count = node.get_child_count()
            require(0 <= count <= 512, 'ACCESSIBILITY_CHILD_BOUNDS')
            queue.extend((node.get_child_at_index(i), depth+1) for i in range(count))
        return out

    def visible(self, node):
        state = node.get_state_set()
        if not (state.contains(self.ax.StateType.VISIBLE) and state.contains(self.ax.StateType.SHOWING)):
            return False
        component = node.get_component_iface()
        if component is None:
            return False
        r = component.get_extents(self.ax.CoordType.SCREEN)
        x,y,w,h = self.geometry
        return r.width > 0 and r.height > 0 and x <= r.x and y <= r.y and r.x+r.width <= x+w and r.y+r.height <= y+h

    def find(self, name, roles):
        nodes = [n for n in self.nodes() if n.get_name() == name and n.get_role() in roles and self.visible(n)]
        require(len(nodes) == 1, 'ACCESSIBLE_CONTROL_UNVERIFIED')
        return nodes[0]

    def wait(self, fn):
        last = 'ACCESSIBILITY_UNVERIFIED'
        for _ in range(40):
            self.guard()
            try:
                return fn()
            except Unverified as e:
                last = str(e)
            require(time.monotonic() < self.deadline, 'INTERACTION_DEADLINE')
            time.sleep(.2)
        raise Unverified(last)

    def input(self, args):
        self.guard(focused=True)
        # Separate invocation, no window stack or --window: real XTEST path.
        self.command(['xdotool', *args])
        self.guard()

    def click(self, node):
        require(self.visible(node), 'CONTROL_NOT_VISIBLE')
        r = node.get_component_iface().get_extents(self.ax.CoordType.SCREEN)
        self.input(['mousemove', str(r.x+r.width//2), str(r.y+r.height//2)])
        self.input(['click', '1'])

    def text(self):
        parts = []
        for n in self.nodes():
            require(time.monotonic() < self.deadline, "INTERACTION_DEADLINE")
            if not self.visible(n):
                continue
            name = n.get_name() or ''
            require(len(name) <= 4096, 'ACCESSIBILITY_TEXT_BOUNDS')
            parts.append(name)
            iface = n.get_text_iface()
            if iface:
                count = iface.get_character_count()
                require(count <= 16384, 'ACCESSIBILITY_TEXT_BOUNDS')
                parts.append(iface.get_text(0,count))
        value = ' '.join(parts)
        require(len(value) <= 65536, 'ACCESSIBILITY_TEXT_BOUNDS')
        return value

    def capture(self, name):
        self.guard()
        path = self.proof/(name+'.png')
        self.command(['scrot','-z','-o',str(path)])
        checker = Path(__file__).with_name('verify-hex-capture.py')
        self.command(['python3','-I','-B',str(checker),str(path)])
        return sha(path.read_bytes())

    def run(self):
        self.stage = 'native-navigation'
        self.command(['xdotool','windowfocus','--sync',self.window])
        roles = [self.ax.Role.PUSH_BUTTON, self.ax.Role.PAGE_TAB]
        self.click(self.wait(lambda: self.find('Maths', roles)))
        editor = self.wait(lambda: self.find('SNAP 5.5 input JSON', [self.ax.Role.ENTRY, self.ax.Role.TEXT]))
        rows = self.results
        for negative in [False, True]:
            self.stage = "unknown-input" if negative else "numeric-input"
            fixture = json.loads(json.dumps(FIXTURE))
            if negative:
                del fixture['responses']['b']
            payload = json.dumps(fixture, separators=(',', ':'))
            self.click(editor)
            self.input(['key','--clearmodifiers','ctrl+a'])
            self.input(['type','--clearmodifiers','--delay','1',payload])
            def editor_readback():
                t = editor.get_text_iface()
                require(t and t.get_text(0,t.get_character_count()) == payload, 'EDITOR_INPUT_READBACK_MISMATCH')
                require(not re.search(r'\bState:\s*(SOURCE_BOUND_NUMERIC|UNKNOWN_REQUIRED_RESPONSES)', self.text()), 'RESULT_NOT_CLEARED')
                return True
            self.wait(editor_readback)
            # Native tab moves focus to following Calculate button and scrolls it into view.
            self.input(['key','Tab'])
            self.stage = 'unknown-calculate' if negative else 'numeric-calculate'
            self.click(self.wait(lambda: self.find('Calculate locally', roles)))
            def readback():
                return parse_result(self.text(), negative)
            try:
                result = self.wait(readback)
            except Unverified:
                # Bounded native scroll only; never use hidden result as visible proof.
                self.input(['click','--repeat','3','--delay','100','5'])
                result = self.wait(readback)
            self.stage = 'unknown-readback' if negative else 'numeric-readback'
            name = 'maths-unknown' if negative else 'maths-numeric'
            rows.append({'fixture_sha256':sha(payload.encode()), 'observed':result, 'screenshot_sha256':self.capture(name)})
            if not negative:
                # Return editor into view using native backwards tab from button.
                self.input(['key','shift+Tab'])
                editor = self.wait(lambda: self.find('SNAP 5.5 input JSON', [self.ax.Role.ENTRY,self.ax.Role.TEXT]))
        return rows

def main():
    receipt = {'schema':'xiio.hex.installed-snap55-readback/v1','status':'UNVERIFIED',
               'semantic_ui_verified':False,'work_ingestion_verified':False,'owner_ack_verified':False,
               'km1_km16_verified':False,'provider_effect':False}
    proof = None
    native = None
    try:
        require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'DISPOSABLE_RUNNER_REQUIRED')
        pid, window, elf, source, directory = sys.argv[1:]
        require(SOURCE.fullmatch(source) and DIGEST.fullmatch(elf), 'SOURCE_IDENTITY_REQUIRED')
        receipt.update(source_commit=source,native_elf_sha256=elf)
        candidate = Path(directory)
        require(candidate.is_dir() and not any(p.is_symlink() for p in [candidate, *candidate.parents]), 'PROOF_DIRECTORY_INVALID')
        proof = candidate
        native = Native(int(pid), window, elf, source, directory)
        receipt.update(source_commit=source,native_elf_sha256=elf,operation_id=f'snap55-{os.environ.get("GITHUB_RUN_ID", "unknown")}-{os.environ.get("GITHUB_RUN_ATTEMPT", "unknown")}',input_backend='XTEST',readback_backend='AT-SPI',expected_r_rational='509/1050',tolerance=1e-14)
        receipt['cases'] = native.run()
        receipt.update(status='VERIFIED',semantic_ui_verified=True)
        code = 0
    except Unverified as e:
        receipt['failure_category'] = str(e)
        code = 61
    except Exception:
        receipt['failure_category'] = 'NATIVE_INTERACTION_PROVIDER_UNVERIFIED'
        code = 62
    if native is not None:
        receipt['last_stage'] = native.stage
        receipt['cases'] = native.results
    if proof is not None:
        path = proof/'maths-interaction.json'
        with path.open('x') as f:
            json.dump(receipt,f,sort_keys=True)
        require(json.loads(path.read_text()) == receipt, 'RECEIPT_READBACK_MISMATCH')
    print('HEX_NATIVE_MATHS_'+receipt['status'])
    return code

if __name__ == '__main__':
    sys.exit(main())
