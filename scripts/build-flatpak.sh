#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGING_DIR="$ROOT_DIR/packaging/flatpak"
BUILD_DIR="$ROOT_DIR/build/flatpak-build"
REPO_DIR="$ROOT_DIR/dist/flatpak/repo"
BUNDLE_OUT="$ROOT_DIR/dist/flatpak/com.xiio.hex.flatpak"

# This is a source-stage packaging operation, never an installer.
# Bind the ELF to a verified release-specific digest from an independently
# accepted artifact manifest. Do not pin a Git commit SHA as an ELF digest.
EXPECTED_ELF_SHA256="${XIIO_EXPECTED_FLATPAK_ELF_SHA256:-}"
if [[ ! "$EXPECTED_ELF_SHA256" =~ ^[a-f0-9]{64}$ ]]; then
    echo "FLATPAK_ACCEPTED_ELF_DIGEST_REQUIRED: set XIIO_EXPECTED_FLATPAK_ELF_SHA256 from the accepted release manifest." >&2
    exit 2
fi
for tool in npm flatpak-builder flatpak sha256sum; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "FLATPAK_BUILD_TOOL_MISSING:$tool" >&2
        exit 127
    fi
done

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

echo "=== [3/5] Verifying exact staged ELF bytes ==="
printf '%s  %s\\n' "$EXPECTED_ELF_SHA256" "$PACKAGING_DIR/xi-io-hex-dev" | sha256sum --check --status || {
    echo "FLATPAK_STAGED_ELF_DIGEST_MISMATCH" >&2
    exit 1
}
test ! -L "$PACKAGING_DIR/xi-io-hex-dev" || { echo "FLATPAK_STAGED_ELF_SYMLINK_REFUSED" >&2; exit 1; }
test -f "$PACKAGING_DIR/xi-io-hex-dev" || { echo "FLATPAK_STAGED_ELF_NOT_REGULAR" >&2; exit 1; }

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
