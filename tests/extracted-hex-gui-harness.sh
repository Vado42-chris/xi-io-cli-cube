#!/usr/bin/env bash
# Synthetic-only GUI acceptance harness; no installed user machine or provider call.
set -Eeuo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/payload/usr/bin"
real_python=$(command -v python3)
"$real_python" -c 'from PIL import Image' || { echo GUI_PILLOW_DECODER_MISSING >&2; exit 78; }

cat > "$work/payload/usr/bin/xi-io-hex-dev" <<'SH'
#!/bin/sh
exec /bin/sleep 60
SH
cat > "$work/bin/xdotool" <<'SH'
#!/bin/sh
case "$1" in
search)
  [ "$MOCK_CASE" != discovery_hang ] || exec /bin/sleep 60
  printf '%s\n' "$4" > "$MOCK_ROOT/app.pid"
  [ "$MOCK_CASE" = no_window ] && exit 1
  printf '1234\n';;
getwindowpid)
  [ "$MOCK_CASE" != wrong_pid ] || { printf '999999\n'; exit 0; }
  cat "$MOCK_ROOT/app.pid";;
getwindowname) printf 'XI-IO HEX\n';;
*) exit 1;;
esac
SH
cat > "$work/bin/scrot" <<'SH'
#!/bin/sh
[ "$MOCK_CASE" != missing_capture ] || exit 0
if [ "$MOCK_CASE" = capture_hang ]; then
  printf '%s\n' "$$" > "$MOCK_ROOT/capture-child.pid"
  exec /bin/sleep 60
fi
count_file="$MOCK_ROOT/capture-count-$MOCK_CASE"
count=0
[ ! -f "$count_file" ] || count=$(cat "$count_file")
count=$((count + 1))
printf '%s' "$count" > "$count_file"
"$MOCK_PYTHON_BIN" - "$2" "$MOCK_CASE" "$count" <<'PY'
from PIL import Image, ImageDraw
from pathlib import Path
import sys
path,case,count=Path(sys.argv[1]),sys.argv[2],int(sys.argv[3])
if case=='malformed':
    path.write_bytes(b'not PNG')
    sys.exit(0)
if case=='transparent':
    picture=Image.new('RGBA',(800,600),(255,0,0,0))
    ImageDraw.Draw(picture).rectangle((50,50,700,500),fill=(0,255,0,0))
else:
    picture=Image.new('RGB',(800,600),'white' if case=='white' else 'black')
    if case=='cursor':
        ImageDraw.Draw(picture).rectangle((20,20,30,40),fill='white')
    elif case not in ('black','white') and not (case=='delayed_paint' and count<3):
        ImageDraw.Draw(picture).rectangle((100,100,700,500),fill='white')
picture.save(path)
PY
SH
cat > "$work/bin/sleep" <<'SH'
#!/bin/sh
exec /bin/sleep 0.01
SH
cat > "$work/bin/python3" <<'SH'
#!/bin/sh
if [ "$4" = '--xiio-process-identity' ] && [ "$MOCK_CASE" = identity_changed ]; then
  cat > "$MOCK_ROOT/identity-code.py"
  if [ -f "$MOCK_ROOT/identity-count" ]; then
    printf 'CHANGED_PROCESS_IDENTITY\n'
    exit 0
  fi
  printf '%s\n' "$5" > "$MOCK_ROOT/identity-child.pid"
  printf 'first\n' > "$MOCK_ROOT/identity-count"
  exec "$MOCK_PYTHON_BIN" "$@" < "$MOCK_ROOT/identity-code.py"
fi
exec "$MOCK_PYTHON_BIN" "$@"
SH
chmod 0755 "$work/bin/"* "$work/payload/usr/bin/xi-io-hex-dev"

cases=${GUI_HARNESS_CASES:-"ok delayed_paint black white cursor transparent malformed no_window missing_capture wrong_pid identity_changed early_exit"}
passed=0
for case in $cases; do
  if [ "$case" = early_exit ]; then printf '#!/bin/sh\nexit 0\n' > "$work/payload/usr/bin/xi-io-hex-dev"; fi
  mkdir "$work/$case"
  set +e
  env PATH="$work/bin:/usr/bin:/bin" MOCK_ROOT="$work" MOCK_CASE="$case" MOCK_PYTHON_BIN="$real_python" DISPLAY=:99 DBUS_SESSION_BUS_ADDRESS=unix:path=/fake \
    bash "$root/scripts/verify-extracted-hex-gui.sh" "$work/payload" "$work/$case" > "$work/$case/test.log" 2>&1
  status=$?
  set -e
  if [[ "$case" == ok || "$case" == delayed_paint ]]; then
    [ "$status" -eq 0 ] || { cat "$work/$case/test.log"; exit 1; }
    test -s "$work/$case/run-manifest.json"
    "$real_python" - "$work/$case/run-manifest.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
assert r['visible_pixels_observed'] is True
assert r['visual_quality']['semantic_ui_verified'] is False
assert r['visual_quality']['selected_window_pixels_verified'] is False
PY
  else
    [ "$status" -ne 0 ] || { echo "GUI_FALSE_SUCCESS:$case"; exit 1; }
    test ! -e "$work/$case/run-manifest.json"
  fi
  if [ "$case" = delayed_paint ]; then
    [ "$(cat "$work/capture-count-$case")" -eq 3 ]
  fi
  if [[ "$case" == black || "$case" == white || "$case" == cursor || "$case" == transparent || "$case" == malformed ]]; then
    [ "$(cat "$work/capture-count-$case")" -eq 12 ]
  fi
  if [ "$case" = identity_changed ]; then
    fixture_pid=$(cat "$work/identity-child.pid")
    kill -0 "$fixture_pid"
    kill -TERM "$fixture_pid"
  elif [ -f "$work/app.pid" ]; then
    ! kill -0 "$(cat "$work/app.pid")" 2>/dev/null
  fi
  passed=$((passed+1))
  printf 'GUI_HARNESS_%s_PASS_EXIT_%s\n' "$case" "$status"
done
echo "GUI_HARNESS_${passed}_CASES_PASS_SYNTHETIC_ONLY"
