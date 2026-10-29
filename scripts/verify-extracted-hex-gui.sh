#!/usr/bin/env bash
# Reuses PR23's Xvfb native-window observation, without installation or clicks.
# Run inside an isolated Xvfb/DBus session on the disposable build runner.
set -Eeuo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ -f "$root/scripts/verify-hex-capture.py" ]] || { echo HEX_CAPTURE_CHECKER_MISSING >&2; exit 69; }
[[ $# == 2 ]] || { echo 'USAGE: verify-extracted-hex-gui.sh EXTRACTED_ROOT PROOF_DIR' >&2; exit 64; }
payload=$(realpath -- "$1")
mkdir -p -- "$2"
proof=$(realpath -- "$2")
exe="$payload/usr/bin/xi-io-hex-dev"
[[ -f "$exe" && -x "$exe" && ! -L "$exe" ]] || { echo HEX_EXTRACTED_ELF_MISSING >&2; exit 65; }
[[ -n "${DISPLAY:-}" && -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]] || { echo ISOLATED_GUI_SESSION_REQUIRED >&2; exit 66; }
for tool in xdotool scrot python3; do command -v "$tool" >/dev/null || { echo "GUI_TOOL_MISSING:$tool" >&2; exit 69; }; done
profile=$(mktemp -d "$proof/profile.XXXXXXXX")
chmod 0700 "$profile"
for name in home config data state cache runtime tmp; do mkdir -m 0700 "$profile/$name"; done
printf 'isolated sentinel\n' > "$profile/home/sentinel.txt"
app_pid=''
app_identity=''
process_identity() {
  python3 -I -B - --xiio-process-identity "$1" "$$" <<'PY'
import pathlib,sys
pid,parent=sys.argv[2:4]
try:
    text=(pathlib.Path('/proc')/pid/'stat').read_text()
    fields=text[text.rfind(')')+2:].split()
    assert fields[1]==parent and fields[0] not in ('Z','X')
    print(pid+':'+fields[1]+':'+fields[19])
except (OSError,IndexError,AssertionError):
    sys.exit(1)
PY
}
same_process() {
  [[ -n "$app_pid" && -n "$app_identity" ]] || return 1
  local current
  current=$(process_identity "$app_pid") || return 1
  [[ "$current" == "$app_identity" ]]
}
cleanup() {
  if [[ -n "$app_pid" && -n "$app_identity" ]]; then
    # Signal only the matching direct-child PID + PPID + /proc start time.
    if same_process; then
      kill -TERM "$app_pid" 2>/dev/null || true
      for attempt in $(seq 1 20); do same_process || break; sleep 0.1; done
      same_process && kill -KILL "$app_pid" 2>/dev/null || true
      wait "$app_pid" 2>/dev/null || true
    fi
  fi
}
trap cleanup EXIT
fail() { printf '%s\n' "$2" >&2; tail -n 80 "$proof/window-stderr.log" >&2 || true; exit "$1"; }
env -i PATH="$PATH" LANG=C.UTF-8 HOME="$profile/home" \
  XDG_CONFIG_HOME="$profile/config" XDG_DATA_HOME="$profile/data" \
  XDG_STATE_HOME="$profile/state" XDG_CACHE_HOME="$profile/cache" \
  XDG_RUNTIME_DIR="$profile/runtime" TMPDIR="$profile/tmp" \
  DISPLAY="$DISPLAY" XAUTHORITY="${XAUTHORITY:-}" \
  DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
  GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  "$exe" > "$proof/window-stdout.log" 2> "$proof/window-stderr.log" &
app_pid=$!
app_identity=$(process_identity "$app_pid") || fail 81 HEX_EXTRACTED_PROCESS_IDENTITY_UNAVAILABLE
window=''
for attempt in $(seq 1 60); do
  same_process || fail 81 HEX_EXTRACTED_PROCESS_IDENTITY_CHANGED_OR_EXITED
  matches=$(xdotool search --onlyvisible --pid "$app_pid" --name '^XI-IO HEX$' 2>/dev/null || true)
  while IFS= read -r candidate; do
    [[ "$candidate" =~ ^[0-9]+$ ]] || continue
    [[ "$(xdotool getwindowpid "$candidate" 2>/dev/null)" == "$app_pid" ]] || continue
    [[ "$(xdotool getwindowname "$candidate" 2>/dev/null)" == 'XI-IO HEX' ]] || continue
    window="$candidate"; break
  done <<< "$matches"
  [[ -z "$window" ]] || break
  sleep 0.25
done
[[ -n "$window" ]] || fail 82 HEX_EXTRACTED_WINDOW_NOT_OBSERVED
# Bound prepaint retries: a window handle is not a rendered application.
# Keep every observation on the exact same validated child PID + window.
# Reject blank, uniform, transparent and cursor-only PNGs.
visible=''
for attempt in $(seq 1 12); do
  same_process || fail 83 HEX_EXTRACTED_PROCESS_IDENTITY_CHANGED_BEFORE_CAPTURE
  [[ "$(xdotool getwindowpid "$window")" == "$app_pid" ]] || fail 84 HEX_WINDOW_OWNER_CHANGED
  [[ "$(xdotool getwindowname "$window")" == 'XI-IO HEX' ]] || fail 84 HEX_WINDOW_TITLE_CHANGED
  if scrot -z "$proof/window.png"; then
    if python3 -I -B "$root/scripts/verify-hex-capture.py" "$proof/window.png" > "$proof/window-visual.json" 2> "$proof/window-visual.err"; then
      visible=yes
      break
    fi
  fi
  sleep 0.35
done
[[ "$visible" == yes ]] || fail 85 HEX_CAPTURE_BLANK_OR_PREPAINT
[[ "$(cat "$profile/home/sentinel.txt")" == 'isolated sentinel' ]] || fail 86 HEX_PROFILE_SENTINEL_CHANGED
same_process || fail 83 HEX_EXTRACTED_PROCESS_IDENTITY_CHANGED_AFTER_CAPTURE
python3 -I -B - "$proof" "$exe" "$app_pid" "$window" "$app_identity" <<'PY'
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1]); exe=pathlib.Path(sys.argv[2]); shot=p/'window.png'
visual=json.loads((p/'window-visual.json').read_text())
assert visual['schema']=='xiio.hex.capture-nonblank/v1'
assert visual['screenshot_sha256']==hashlib.sha256(shot.read_bytes()).hexdigest(), 'CAPTURE_CHANGED_AFTER_QUALIFICATION'
assert visual['semantic_ui_verified'] is False
r={'schema':'xiio.hex.extracted-package-gui-smoke/v1','state':'EXTRACTED_PACKAGE_GUI_SMOKE',
   'visual_quality':visual, 'visible_pixels_observed':True,
   'pid':int(sys.argv[3]),'process_identity':sys.argv[5],
   'window_id':sys.argv[4],'window_title':'XI-IO HEX',
   'native_elf_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),
   'screenshot_sha256':hashlib.sha256(shot.read_bytes()).hexdigest(),
   'isolated_profile':True,'installed_package':False,'ipc_result_verified':False,
   'provider_connected':False,'install_actions_performed':False}
(p/'run-manifest.json').write_text(json.dumps(r,indent=2)+'\n')
PY
echo EXTRACTED_PACKAGE_GUI_SMOKE_PASS_NOT_INSTALLED_OR_IPC_ACCEPTANCE
