#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGING_DIR="$ROOT_DIR/packaging/flatpak"
BUILD_DIR="$ROOT_DIR/build/flatpak-build"
REPO_DIR="$ROOT_DIR/dist/flatpak/repo"
BUNDLE_OUT="$ROOT_DIR/dist/flatpak/com.xiio.hex.flatpak"

echo "=== [1/4] Building root frontend distribution ==="
cd "$ROOT_DIR"
npm run build

echo "=== [2/5] Verifying fresh native carrier build binary ==="
CARRIER_RELEASE_BIN="$ROOT_DIR/native/hex/carrier/src-tauri/target/release/xi-io-hex-dev"
if [ ! -f "$CARRIER_RELEASE_BIN" ]; then
    echo "Error: Fresh native carrier binary not found at $CARRIER_RELEASE_BIN." >&2
    echo "The native carrier must be built from the current source revision in CI." >&2
    echo "DEV9 in deliveries/ is historical evidence and cannot substitute for the current build." >&2
    exit 1
fi
cp "$CARRIER_RELEASE_BIN" "$PACKAGING_DIR/xi-io-hex-dev"
chmod 755 "$PACKAGING_DIR/xi-io-hex-dev"

echo "=== [3/5] Verifying Flatpak prerequisites ==="
if ! command -v flatpak-builder >/dev/null 2>&1; then
    echo "Error: 'flatpak-builder' not found in current environment." >&2
    echo "To build Flatpak on Pop!_OS, install prerequisites with:" >&2
    echo "    sudo apt update && sudo apt install -y flatpak flatpak-builder" >&2
    echo "    flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo" >&2
    echo "    flatpak install --user -y flathub org.gnome.Platform//46 org.gnome.Sdk//46" >&2
    exit 1
fi

echo "=== [4/5] Building Flatpak package into OSTree repository ==="
mkdir -p "$BUILD_DIR" "$REPO_DIR" "$(dirname "$BUNDLE_OUT")"

cd "$PACKAGING_DIR"
flatpak-builder \
    --force-clean \
    --default-branch=stable \
    --repo="$REPO_DIR" \
    --state-dir="$BUILD_DIR/.flatpak-builder" \
    "$BUILD_DIR/app" \
    com.xiio.hex.json

echo "=== [5/5] Creating standalone single-file bundle ==="
flatpak build-bundle "$REPO_DIR" "$BUNDLE_OUT" com.xiio.hex stable

echo "=== Flatpak Build Complete ==="
echo "OSTree Repository: $REPO_DIR"
echo "Standalone Bundle: $BUNDLE_OUT"
echo ""
echo "To install on Pop!_OS:"
echo "    flatpak install --user $BUNDLE_OUT"
