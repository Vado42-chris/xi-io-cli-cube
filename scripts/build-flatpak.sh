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

echo "=== [2/4] Ensuring native carrier binary is staged ==="
if [ ! -f "$PACKAGING_DIR/xi-io-hex-dev" ]; then
    if [ -f "$ROOT_DIR/deliveries/hex-dev/0.1.0-dev.9/xi-io-hex-dev_0.1.0-dev.9_amd64.deb" ]; then
        echo "Staging qualified native xi-io-hex-dev binary from debian delivery..."
        TMP_EXTRACT=$(mktemp -d)
        dpkg-deb -x "$ROOT_DIR/deliveries/hex-dev/0.1.0-dev.9/xi-io-hex-dev_0.1.0-dev.9_amd64.deb" "$TMP_EXTRACT"
        cp "$TMP_EXTRACT/usr/bin/xi-io-hex-dev" "$PACKAGING_DIR/xi-io-hex-dev"
        rm -rf "$TMP_EXTRACT"
    elif [ -f "$ROOT_DIR/native/hex/carrier/src-tauri/target/release/xi-io-hex-dev" ]; then
        cp "$ROOT_DIR/native/hex/carrier/src-tauri/target/release/xi-io-hex-dev" "$PACKAGING_DIR/xi-io-hex-dev"
    else
        echo "Error: Native carrier binary xi-io-hex-dev not found." >&2
        exit 1
    fi
fi
chmod +x "$PACKAGING_DIR/xi-io-hex-dev"

echo "=== [3/4] Verifying Flatpak prerequisites ==="
if ! command -v flatpak-builder >/dev/null 2>&1; then
    echo "Notice: 'flatpak-builder' not found in current environment."
    echo "To build Flatpak on Pop!_OS, install prerequisites with:"
    echo "    sudo apt update && sudo apt install -y flatpak flatpak-builder"
    echo "    flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo"
    echo "    flatpak install --user -y flathub org.gnome.Platform//46 org.gnome.Sdk//46"
    exit 0
fi

echo "=== [4/5] Building Flatpak package into OSTree repository ==="
mkdir -p "$BUILD_DIR" "$REPO_DIR" "$(dirname "$BUNDLE_OUT")"

cd "$PACKAGING_DIR"
flatpak-builder \
    --force-clean \
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
