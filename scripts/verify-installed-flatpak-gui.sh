#!/usr/bin/env bash
# Actual installed Flatpak GUI + native Tauri IPC acceptance in isolated Linux.
# Kept out of YAML shell-in-shell so normal bash -n and ShellCheck can inspect it.
set -Eeuo pipefail

APP_ID='com.xiio.hex'
LOG="$(mktemp -t xiio-hex-window.XXXXXXXX.log)"
INSPECT="$(mktemp -t xiio-hex-inspect.XXXXXXXX.json)"
app_pid=''
cleanup() {
  if [[ -n "$app_pid" ]]; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  rm -f -- "$LOG" "$INSPECT"
}
trap cleanup EXIT

failed() {
  local code="$1" reason="$2"
  printf '%s\n' "$reason" >&2
  tail -n 100 "$LOG" >&2 || true
  exit "$code"
}

flatpak run --user "$APP_ID" > "$LOG" 2>&1 &
app_pid="$!"
visible=0
for attempt in $(seq 1 30); do
  if xdotool search --onlyvisible --name 'XI-IO HEX' >/dev/null 2>&1; then
    visible=1
    break
  fi
  kill -0 "$app_pid" 2>/dev/null || failed 81 'HEX_NATIVE_WINDOW_EXITED_BEFORE_VISIBLE'
  sleep 1
done
[[ "$visible" == 1 ]] || failed 82 'HEX_NATIVE_WINDOW_NOT_OBSERVED'
echo 'HEX_INSTALLED_WINDOW_VISIBLE_ON_DISPOSABLE_LINUX'

# The installed GUI calls Tauri IPC -> installed Python adapter. The lock must
# be created by that GUI, not by an independent fixture or the check itself.
ipc=0
for attempt in $(seq 1 15); do
  if flatpak run --user --command=sh "$APP_ID" -c \
    'test -f "${XDG_STATE_HOME:-$HOME/.var/app/com.xiio.hex/state}/xi-io/installer/native-adapter.lock"'; then
    ipc=1
    break
  fi
  kill -0 "$app_pid" 2>/dev/null || failed 83 'HEX_NATIVE_WINDOW_EXITED_BEFORE_IPC'
  sleep 1
done
[[ "$ipc" == 1 ]] || failed 84 'HEX_NATIVE_WINDOW_IPC_INSPECT_NOT_OBSERVED'
echo 'HEX_TAURI_IPC_AUTO_INSPECT_NATIVE_PYTHON_LOCK_OBSERVED'

# Direct inspect follows, never substitutes for, the observed GUI-native IPC.
printf '%s\n' '{"action":"inspect"}' |
  flatpak run --user --command=sh "$APP_ID" -c \
    'XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.var/app/com.xiio.hex/state}"; export XDG_STATE_HOME; exec /usr/bin/python3 -I -B /app/lib/xi-io-hex/adapter/installer_adapter.py' > "$INSPECT"
python3 -I -B - "$INSPECT" <<'PY'
import json
import sys
with open(sys.argv[1], encoding='utf-8') as handle:
    receipt = json.load(handle)
assert receipt.get('ok') is True and isinstance(receipt.get('result'), dict), \
    'NATIVE_ADAPTER_INSPECT_READBACK_INVALID'
print('NATIVE_PYTHON_ADAPTER_INSPECT_READBACK_PASS')
PY
echo 'NATIVE_GUI_IPC_AND_ADAPTER_READBACK_PASS_NOT_ARIES_LOKI'
