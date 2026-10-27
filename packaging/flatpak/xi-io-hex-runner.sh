#!/bin/sh
set -eu

# Ensure user directories inside flatpak sandbox exist
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"

mkdir -p "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"

APP_DIR="/app/lib/xi-io-hex"

# The native Tauri carrier binary is mandatory.
# Never substitute a browser, Vite server, Node fallback, or static preview.
if [ -x "/app/bin/xi-io-hex-dev" ]; then
    exec /app/bin/xi-io-hex-dev "$@"
elif [ -x "/app/bin/xi-io-hex-carrier" ]; then
    exec /app/bin/xi-io-hex-carrier "$@"
fi

echo "Error: Native XI-IO HEX carrier executable missing at /app/bin/xi-io-hex-dev. Refusing fallback." >&2
exit 1
