#!/usr/bin/env bash
# Synthetic harness checks only. No GUI, package installation or provider calls.
set -Eeuo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/payload/usr/bin"
cat > "$work/payload/usr/bin/xi-io-hex-dev" <<'SH'
#!/bin/sh
exec /bin/sleep 60
SH
cat > "$work/bin/xdotool" <<'SH'
#!/bin/sh
case "$1" in
search) printf '%s\n' "$4" > "$MOCK_ROOT/app.pid"; [ "$MOCK_CASE" = no_window ] && exit 1; printf '1234\n';;
getwindowpid) [ "$MOCK_CASE" = wrong_pid ] && { printf '999999\n'; exit 0; }; cat "$MOCK_ROOT/app.pid";;
getwindowname) printf 'XI-IO HEX\n';;
*) exit 1;;
esac
SH
cat > "$work/bin/scrot" <<'SH'
#!/bin/sh
[ "$MOCK_CASE" = missing_capture ] && exit 0
python3 - "$2" <<'PY'
import base64,pathlib,sys
pathlib.Path(sys.argv[1]).write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='))
PY
SH
cat > "$work/bin/sleep" <<'SH'
#!/bin/sh
exec /bin/sleep 0.01
SH
cat > "$work/bin/python3" <<'SH'
#!/bin/sh
if [ "${4:-}" = --xiio-process-identity ] && [ "$MOCK_CASE" = identity_changed ]; then
  cat > "$MOCK_ROOT/identity-code.py"
  if [ -f "$MOCK_ROOT/identity-count" ]; then
    printf 'CHANGED_PROCESS_IDENTITY\n'
    exit 0
  fi
  printf '%s\n' "$5" > "$MOCK_ROOT/identity-child.pid"
  printf 'first\n' > "$MOCK_ROOT/identity-count"
  exec /usr/bin/python3 "$@" < "$MOCK_ROOT/identity-code.py"
fi
exec /usr/bin/python3 "$@"
SH
chmod 0755 "$work/bin/"* "$work/payload/usr/bin/xi-io-hex-dev"
for case in ok no_window missing_capture wrong_pid identity_changed early_exit; do
  if [ "$case" = early_exit ]; then printf '#!/bin/sh\nexit 0\n' > "$work/payload/usr/bin/xi-io-hex-dev"; fi
  mkdir "$work/$case"
  set +e
  env PATH="$work/bin:/usr/bin:/bin" MOCK_ROOT="$work" MOCK_CASE="$case" DISPLAY=:99 DBUS_SESSION_BUS_ADDRESS=unix:path=/fake \
    bash "$root/scripts/verify-extracted-hex-gui.sh" "$work/payload" "$work/$case" > "$work/$case/test.log" 2>&1
  status=$?
  set -e
  if [ "$case" = ok ]; then
    [ "$status" = 0 ] || { cat "$work/$case/test.log"; exit 1; }
    test -s "$work/$case/run-manifest.json"
  else
    [ "$status" != 0 ]
    test ! -e "$work/$case/run-manifest.json"
  fi
  if [ "$case" = identity_changed ]; then
    # Simulated changed identity MUST prevent cleanup from signaling this PID.
    fixture_pid=$(cat "$work/identity-child.pid")
    kill -0 "$fixture_pid"
    kill -TERM "$fixture_pid"
  elif [ -f "$work/app.pid" ]; then ! kill -0 "$(cat "$work/app.pid")" 2>/dev/null; fi
  printf 'GUI_HARNESS_%s_PASS_EXIT_%s\n' "$case" "$status"
done
echo GUI_HARNESS_6_OF_6_PASS_SYNTHETIC_ONLY
