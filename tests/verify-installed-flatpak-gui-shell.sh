#!/usr/bin/env bash
# Synthetic executable replay of the GUI smoke harness itself; not a real
# Flatpak acceptance. The actual installed window/IPC test is a separate job.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/verify-installed-flatpak-gui.sh"
bash -n "$SCRIPT"
work="$(mktemp -d -t xiio-flatpak-harness.XXXXXXXX)"
trap 'rm -rf -- "$work"' EXIT

cat > "$work/flatpak" <<'SH'
#!/bin/sh
if [ "$1" != "run" ]; then exit 7; fi
case " $* " in
  *" --command=sh "*)
    case " $* " in
      *"installer_adapter.py"*)
        if [ "$MOCK_VARIANT" = "bad_inspect" ]; then
          printf '%s\n' '{"ok":false}'
        else
          printf '%s\n' '{"ok":true,"result":{"state":"PASS"}}'
        fi
        exit 0 ;;
      *"native-adapter.lock"*)
        [ "$MOCK_VARIANT" != "no_ipc" ] ;;
      *) exit 9 ;;
    esac ;;
  *) exec /bin/sleep 15 ;;
esac
SH
cat > "$work/xdotool" <<'SH'
#!/bin/sh
[ "$MOCK_VARIANT" != "no_window" ]
SH
cat > "$work/sleep" <<'SH'
#!/bin/sh
exit 0
SH
chmod 0755 "$work/flatpak" "$work/xdotool" "$work/sleep"
for variant in ok no_window no_ipc bad_inspect; do
  output="$work/$variant.out"
  set +e
  env PATH="$work:/usr/bin:/bin" MOCK_VARIANT="$variant" bash "$SCRIPT" > "$output" 2>&1
  status=$?
  set -e
  case "$variant" in
    ok)
      [ "$status" = 0 ]
      grep -q 'HEX_INSTALLED_WINDOW_VISIBLE_ON_DISPOSABLE_LINUX' "$output"
      grep -q 'HEX_TAURI_IPC_AUTO_INSPECT_NATIVE_PYTHON_LOCK_OBSERVED' "$output"
      grep -q 'NATIVE_GUI_IPC_AND_ADAPTER_READBACK_PASS_NOT_ARIES_LOKI' "$output"
      ;;
    no_window)
      [ "$status" = 82 ]
      ! grep -q 'NATIVE_GUI_IPC_AND_ADAPTER_READBACK_PASS' "$output" ;;
    no_ipc)
      [ "$status" = 84 ]
      ! grep -q 'NATIVE_GUI_IPC_AND_ADAPTER_READBACK_PASS' "$output" ;;
    bad_inspect)
      [ "$status" != 0 ]
      ! grep -q 'NATIVE_GUI_IPC_AND_ADAPTER_READBACK_PASS' "$output" ;;
  esac
done
echo 'FLATPAK_ACCEPTANCE_HARNESS_4_OF_4_SIMULATED_REPLAYS_PASS'
