import importlib.util
import json
import os
import subprocess
import shlex
import sys
import time
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('diag', pathlib.Path(__file__).resolve().parents[1] / 'scripts/diagnose-hex-window.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

class Diagnostic(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.proc = self.root / 'proc'
        self.node(100, 50, '123', 'hex', '101 102 103 104')
        self.node(101, 100, '124', 'WebKitWebProcess')
        self.node(102, 100, '125', 'WebKitNetworkProcess')
        self.node(103, 99, '126', 'WebKitWebProcess')
        self.node(104, 100, '127', 'WebKitWebProcess', state='Z')
        self.log = self.root / 'stderr'
        self.log.write_text('secret password raw stderr\nHEX_NATIVE_WINDOW ' + json.dumps({'action':'close','stage':'dispatch','command_result':'accepted','secret':'NEVER_EMIT'})+'\n')
        self.owner = '100'; self.mapped = '42'; self.x = 0
    def node(self, pid, parent, start, kind, children='', state='S'):
        path = self.proc / str(pid)
        (path / 'task' / str(pid)).mkdir(parents=True)
        (path / 'stat').write_text(f'{pid} (test) ' + ' '.join([state,str(parent)]+['0']*17+[start]))
        (path / 'exe').symlink_to('/fixed/' + kind)
        (path / 'task' / str(pid) / 'children').write_text(children)
    def run_query(self, *args):
        return {'getwindowpid':self.owner, 'getwindowname':'XI-IO HEX', 'search':self.mapped,
                'getwindowgeometry':f'X={self.x}\nY=0\nWIDTH=800\nHEIGHT=600\n', 'getdisplaygeometry':'1600 1000'}[args[0]]
    def snap(self, window='42'):
        return d.snapshot(self.proc,100,'100:50:123',window,self.log,self.run_query)
    def test_mapped(self):
        r=self.snap(); self.assertEqual(r['classification'],'SELECTED_WINDOW_MAPPED_ONSCREEN')
        self.assertFalse(r['renderer_load_verified'])
    def test_unmapped(self):
        self.mapped=''; self.assertEqual(self.snap()['classification'],'SELECTED_WINDOW_UNMAPPED')
    def test_offscreen(self):
        self.x=-900; self.assertEqual(self.snap()['classification'],'SELECTED_WINDOW_OFFSCREEN')
    def test_partial_on_screen(self):
        self.x=-799; self.assertTrue(self.snap()['geometry']['intersects_display'])
    def test_owner_changed(self):
        self.owner='200'; self.assertEqual(self.snap(),{'classification':'WINDOW_IDENTITY_CHANGED'})
    def test_start_changed(self):
        p=self.proc/'100/stat';p.write_text(p.read_text().replace('123','999'))
        self.assertEqual(self.snap(),{'classification':'PROCESS_IDENTITY_CHANGED'})
    def test_known_children_only(self):
        r=self.snap()['webkit']; self.assertEqual(r['live_descendant_counts'],{'WebKitWebProcess':1,'WebKitNetworkProcess':1,'WebKitGPUProcess':0})
        self.assertFalse(r['absence_proves_never_loaded'])
    def test_event_sanitized(self):
        r=self.snap(); raw=json.dumps(r)
        self.assertNotIn('secret',raw); self.assertNotIn('NEVER_EMIT',raw)
        self.assertEqual(r['window_commands']['known_command_event_counts'],{'close/dispatch/accepted':1})
    def test_unknown_event(self):
        self.log.write_text('HEX_NATIVE_WINDOW {"action":"secret","stage":"dispatch","command_result":"accepted"}\n')
        self.assertEqual(self.snap()['window_commands']['known_command_event_counts'],{})
    def test_no_selected_window(self):
        self.assertEqual(self.snap('')['classification'],'NO_SELECTED_WINDOW')
    def test_invalid_geometry(self):
        with self.assertRaises((KeyError,ValueError)): d.geometry('X=secret','1600 1000')
    def test_hung_query_is_bounded_and_sanitized(self):
        tool=self.root/'xdotool'
        tool.write_text('#!/bin/sh\necho SECRET >&2\nexec /bin/sleep 10\n')
        tool.chmod(0o755)
        pid=os.getpid(); expected=d.identity(pathlib.Path('/proc'),pid)
        started=time.monotonic()
        p=subprocess.run([sys.executable,'-I','-B',str(pathlib.Path(d.__file__)),str(pid),expected,'42',str(self.log)],
                         env={**os.environ,'PATH':str(self.root)},capture_output=True,text=True,timeout=2)
        self.assertLess(time.monotonic()-started,2)
        self.assertEqual(json.loads(p.stdout)['classification'],'DIAGNOSTIC_UNAVAILABLE')
        self.assertEqual(p.stderr,''); self.assertNotIn('SECRET',p.stdout)
    def test_actual_fail_hook_preserves_exit_and_exposes_only_sanitized_json(self):
        root=pathlib.Path(d.__file__).resolve().parents[1]
        source=(root/'scripts/verify-extracted-hex-gui.sh').read_text()
        hook=source[source.index('fail() {'):source.index('\nenv -i PATH=')]
        (self.root/'window-stderr.log').write_text(self.log.read_text())
        pid=os.getpid(); expected=d.identity(pathlib.Path('/proc'),pid)
        assignments={'root':str(root),'proof':str(self.root),'app_pid':str(pid),'app_identity':expected,'window':''}
        code='set -Eeuo pipefail\n'+'\n'.join(k+'='+shlex.quote(v) for k,v in assignments.items())+'\n'+hook+'\nfail 85 HEX_CAPTURE_BLANK_OR_PREPAINT\n'
        p=subprocess.run(['bash','-c',code],capture_output=True,text=True,timeout=7)
        self.assertEqual(p.returncode,85)
        self.assertIn('HEX_CAPTURE_BLANK_OR_PREPAINT',p.stderr)
        line=next(x for x in p.stderr.splitlines() if x.startswith('HEX_GUI_DIAGNOSTIC '))
        result=json.loads(line.removeprefix('HEX_GUI_DIAGNOSTIC '))
        self.assertEqual(result['classification'],'NO_SELECTED_WINDOW')
        self.assertEqual(result['window_commands']['known_command_event_counts'],{'close/dispatch/accepted':1})
        self.assertEqual(json.loads((self.root/'window-diagnostic.json').read_text()),result)
        self.assertNotIn('NEVER_EMIT',p.stderr);self.assertNotIn('password',p.stderr)
        self.assertEqual(p.stdout,'')
    def test_empty_children_not_never_loaded(self):
        (self.proc/'100/task/100/children').write_text('')
        r=self.snap()['webkit'];self.assertEqual(sum(r['live_descendant_counts'].values()),0)
        self.assertFalse(r['absence_proves_never_loaded'])

if __name__ == '__main__': unittest.main()
