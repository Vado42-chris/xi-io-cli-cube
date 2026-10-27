#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGING_DIR="$ROOT_DIR/packaging/flatpak"
BUILD_DIR="$ROOT_DIR/build/flatpak-build"
REPO_DIR="$ROOT_DIR/dist/flatpak/repo"
BUNDLE_OUT="$ROOT_DIR/dist/flatpak/com.xiio.hex.flatpak"

# This must run BEFORE the frontend build or any staging effect. Missing
# packaging capability is a typed failure, not a successful release.
if ! command -v flatpak-builder >/dev/null 2>&1 || ! command -v flatpak >/dev/null 2>&1; then
    echo "FLATPAK_BUILD_BLOCKED: flatpak-builder and flatpak CLI required; no release artifact created" >&2
    exit 69
fi

# The canonical logo remains untouched. Export a disposable sized derivative
# for Flatpak's strict 512x512 app-icon slot, then restore a clean workspace.
if ! command -v convert >/dev/null 2>&1; then
    echo "FLATPAK_BUILD_BLOCKED: ImageMagick convert required for bounded icon export" >&2
    exit 69
fi
ICON_STAGE="$PACKAGING_DIR/.xiio-hex-icon-512.png"
if [ -e "$ICON_STAGE" ] || [ -L "$ICON_STAGE" ]; then
    echo "FLATPAK_BUILD_BLOCKED: transient icon staging path already exists" >&2
    exit 73
fi
trap 'rm -f -- "$ICON_STAGE"' EXIT
convert "$PACKAGING_DIR/com.xiio.hex.png" -resize 512x512 -background none -gravity center -extent 512x512 "$ICON_STAGE"
if [ ! -s "$ICON_STAGE" ]; then
    echo "FLATPAK_BUILD_BLOCKED: rescaled icon missing or empty" >&2
    exit 74
fi

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
# Host prerequisites were checked before any staging or frontend work.

echo "=== [4/5] Building Flatpak package into OSTree repository ==="
mkdir -p "$BUILD_DIR" "$REPO_DIR" "$(dirname "$BUNDLE_OUT")"

cd "$PACKAGING_DIR"
flatpak-builder \
    --default-branch=stable \
    --force-clean \
    --repo="$REPO_DIR" \
    --state-dir="$BUILD_DIR/.flatpak-builder" \
    "$BUILD_DIR/app" \
    com.xiio.hex.json

echo "=== [5/5] Creating standalone single-file bundle ==="
flatpak build-bundle "$REPO_DIR" "$BUNDLE_OUT" com.xiio.hex stable
if [ ! -s "$BUNDLE_OUT" ]; then
    echo "FLATPAK_BUILD_BLOCKED: bundle output missing or empty" >&2
    exit 70
fi

echo "=== Flatpak Build Complete ==="
echo "OSTree Repository: $REPO_DIR"
echo "Standalone Bundle: $BUNDLE_OUT"
echo ""
echo "To install on Pop!_OS:"
echo "    flatpak install --user $BUNDLE_OUT"
