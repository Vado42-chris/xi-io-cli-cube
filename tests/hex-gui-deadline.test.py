#!/usr/bin/env python3
"""Short, disposable deadline cases; production 60s GUI timeout unchanged."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


class Deadlines(unittest.TestCase):
    def run_case(self, case, rewrite, max_seconds):
        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory)
            (dest / 'scripts').mkdir()
            (dest / 'tests').mkdir()
            source = (ROOT / 'scripts/verify-extracted-hex-gui.sh').read_text()
            for old, new in rewrite:
                self.assertEqual(source.count(old), 1)
                source = source.replace(old, new)
            (dest / 'scripts/verify-extracted-hex-gui.sh').write_text(source)
            shutil.copyfile(ROOT / 'scripts/verify-hex-capture.py',
                            dest / 'scripts/verify-hex-capture.py')
            shutil.copyfile(ROOT / 'tests/extracted-hex-gui-harness.sh',
                            dest / 'tests/extracted-hex-gui-harness.sh')
            start = time.monotonic()
            result = subprocess.run(
                ['bash', str(dest / 'tests/extracted-hex-gui-harness.sh')],
                env={**os.environ, 'GUI_HARNESS_CASES': case},
                capture_output=True, text=True, timeout=max_seconds)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertLess(time.monotonic() - start, max_seconds)
            return result.stdout

    def test_discovery_hang_does_not_run_without_a_deadline(self):
        result = self.run_case(
            'discovery_hang',
            [('deadline=$((SECONDS + 60))', 'deadline=$((SECONDS + 2))')],
            9)
        self.assertIn('GUI_HARNESS_discovery_hang_PASS_EXIT_82', result)

    def test_capture_hang_does_not_leave_a_false_manifest(self):
        result = self.run_case(
            'capture_hang',
            [('for attempt in $(seq 1 12); do', 'for attempt in $(seq 1 1); do')],
            9)
        self.assertIn('GUI_HARNESS_capture_hang_PASS_EXIT_85', result)


if __name__ == '__main__':
    unittest.main()
