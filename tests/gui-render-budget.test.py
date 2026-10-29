#!/usr/bin/env python3
"""Run the existing complete shell harness with a fake clock; no GUI/actions."""
import os,pathlib,shutil,subprocess,tempfile,unittest,json,time,signal
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get('XIIO_GUI_SOURCE',ROOT/'scripts/verify-extracted-hex-gui.sh'))
def bounded_fixture(command,*,env,text,capture_output,timeout):
 # A failed baseline must not leave the disposable sleep/checker descendants.
 process=subprocess.Popen(command,env=env,text=text,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 try:
  stdout,stderr=process.communicate(timeout=timeout)
  return subprocess.CompletedProcess(command,process.returncode,stdout,stderr)
 except subprocess.TimeoutExpired:
  os.killpg(process.pid,signal.SIGKILL);process.communicate();raise

class Budget(unittest.TestCase):
 def run_case(self,case,paint_at=40000,expire=False):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);shutil.copytree(ROOT/'scripts',root/'scripts');(root/'tests').mkdir()
   source=SOURCE.read_text()
   # Only clock reads are substituted in the actual source under test.
   source=source.replace('SECONDS','$(($(cat "$MOCK_ROOT/clock") / 1000))')
   (root/'scripts/verify-extracted-hex-gui.sh').write_text(source)
   harness=(ROOT/'tests/extracted-hex-gui-harness.sh').read_text()
   harness=harness.replace('  mkdir "$work/$case"','  printf 0 > "$work/clock"\n  mkdir "$work/$case"')
   harness=harness.replace('exec /bin/sleep 0.01', '''"$MOCK_PYTHON_BIN" - "$MOCK_ROOT/clock" "$1" <<'CLOCK'
import pathlib,sys
p=pathlib.Path(sys.argv[1]);p.write_text(str(int(p.read_text())+int(float(sys.argv[2])*1000)))
CLOCK''')
   harness=harness.replace('import sys\npath,case,count=', 'import sys,os\npath,case,count=')
   harness=harness.replace("if case=='malformed':", '''clock=Path(os.environ['MOCK_ROOT'])/'clock'
with (clock.parent/'capture-times').open('a') as stream:stream.write(clock.read_text()+'\\n')
if os.environ.get('FAKE_EXPIRE')=='yes':clock.write_text('61000')
if case=='malformed':''')
   harness=harness.replace("(case=='delayed_paint' and count<3)","(case=='delayed_paint' and int(clock.read_text())<int(os.environ['FAKE_PAINT_AT']))")
   harness=harness.replace('[ "$(cat "$work/capture-count-$case")" -eq 3 ]', '[ "$(cat "$work/capture-count-$case")" -le 12 ]')
   harness=harness.replace('echo "GUI_HARNESS_${passed}_CASES_PASS_SYNTHETIC_ONLY"', 'echo "GUI_FAKE_CAPTURE_TIMES=$(tr \'\\n\' , < "$work/capture-times")"\necho "GUI_HARNESS_${passed}_CASES_PASS_SYNTHETIC_ONLY"')
   (root/'tests/extracted-hex-gui-harness.sh').write_text(harness)
   result=bounded_fixture(['bash',str(root/'tests/extracted-hex-gui-harness.sh')],env={**os.environ,'GUI_HARNESS_CASES':case,'FAKE_PAINT_AT':str(paint_at),'FAKE_EXPIRE':'yes' if expire else 'no'},text=True,capture_output=True,timeout=12)
   print(json.dumps({'case':case,'paint_at_ms':paint_at,'expire':expire,'exit':result.returncode,'output':result.stdout+result.stderr}))
   self.assertEqual(result.returncode,0,result.stdout+result.stderr)
   times=[int(x) for x in result.stdout.split('GUI_FAKE_CAPTURE_TIMES=')[1].splitlines()[0].split(',') if x]
   self.assertLessEqual(len(times),12);self.assertTrue(all(t<60000 for t in times));return times
 def test_real_hung_decoder_is_clamped_to_short_remaining_budget(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);shutil.copytree(ROOT/'scripts',root/'scripts');(root/'tests').mkdir()
   shutil.copyfile(ROOT/'tests/extracted-hex-gui-harness.sh',root/'tests/extracted-hex-gui-harness.sh')
   source=SOURCE.read_text();self.assertEqual(source.count('deadline=$((SECONDS + 60))'),1)
   (root/'scripts/verify-extracted-hex-gui.sh').write_text(source.replace('deadline=$((SECONDS + 60))','deadline=$((SECONDS + 2))'))
   (root/'scripts/verify-hex-capture.py').write_text('import time; time.sleep(60)\n')
   start=time.monotonic()
   result=bounded_fixture(['bash',str(root/'tests/extracted-hex-gui-harness.sh')],env={**os.environ,'GUI_HARNESS_CASES':'decoder_hang'},text=True,capture_output=True,timeout=8)
   elapsed=time.monotonic()-start;self.assertEqual(result.returncode,0,result.stdout+result.stderr);self.assertLess(elapsed,6)
   print(json.dumps({'real_decoder_hang_elapsed_s':elapsed,'output':result.stdout}))
 def test_paint_at_40_seconds(self):self.assertGreaterEqual(self.run_case('delayed_paint',40000)[-1],40000)
 def test_paint_at_55_seconds(self):self.assertGreaterEqual(self.run_case('delayed_paint',55000)[-1],55000)
 def test_always_black_uses_budget_but_stops_at_twelve(self):
  times=self.run_case('black');self.assertEqual(len(times),12);self.assertGreaterEqual(times[-1],54000)
 def test_expiry_during_capture_cannot_publish_success(self):self.assertEqual(len(self.run_case('budget_expired',expire=True)),1)
if __name__=='__main__':unittest.main()
