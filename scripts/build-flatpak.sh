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
for tool in cargo rustc sha256sum git file python3; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "FLATPAK_BUILD_BLOCKED: fresh native source build requires $tool" >&2
        exit 69
    fi
done
if ! command -v convert >/dev/null 2>&1; then
    echo "FLATPAK_BUILD_BLOCKED: ImageMagick convert required for bounded icon export" >&2
    exit 69
fi
ICON_STAGE="$PACKAGING_DIR/.xiio-hex-icon-512.png"
FRESH_CARRIER="$PACKAGING_DIR/.xiio-hex-fresh-carrier"
PROVENANCE="$PACKAGING_DIR/.xiio-hex-source-provenance.json"
for scratch in "$ICON_STAGE" "$FRESH_CARRIER" "$PROVENANCE"; do
    if [ -e "$scratch" ] || [ -L "$scratch" ]; then
        echo "FLATPAK_BUILD_BLOCKED: transient staging path already exists" >&2
        exit 73
    fi
done
trap 'rm -f -- "$ICON_STAGE" "$FRESH_CARRIER" "$PROVENANCE"' EXIT
convert "$PACKAGING_DIR/com.xiio.hex.png" -resize 512x512 -background none -gravity center -extent 512x512 "$ICON_STAGE"
if [ ! -s "$ICON_STAGE" ]; then
    echo "FLATPAK_BUILD_BLOCKED: rescaled icon missing or empty" >&2
    exit 74
fi

echo "=== [1/4] Building root frontend distribution ==="
cd "$ROOT_DIR"
npm run build

echo "=== [2/4] Compiling exact native carrier from checked-out source ==="
cd "$ROOT_DIR"
SOURCE_SHA="$(git rev-parse --verify HEAD)"
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "FLATPAK_BUILD_BLOCKED: expected exact Git source commit" >&2
    exit 75
fi
# The Tauri compile embeds the freshly built frontend and resources. Never
# use tracked historical DEV9 binary, extracted .deb, or a previous target dir.
npm run native:stage
CARGO_TARGET_DIR="$BUILD_DIR/fresh-cargo"
if [ -e "$CARGO_TARGET_DIR" ] || [ -L "$CARGO_TARGET_DIR" ]; then
    echo "FLATPAK_BUILD_BLOCKED: existing native target build could be stale" >&2
    exit 75
fi
export CARGO_TARGET_DIR
cargo build --locked --release --manifest-path "$ROOT_DIR/native/hex/carrier/src-tauri/Cargo.toml" --bin xi-io-hex-dev
BUILT_ELF="$CARGO_TARGET_DIR/release/xi-io-hex-dev"
if [ ! -s "$BUILT_ELF" ] || [ -L "$BUILT_ELF" ]; then
    echo "FLATPAK_BUILD_BLOCKED: freshly compiled ELF missing" >&2
    exit 76
fi
file "$BUILT_ELF" | grep -Fq 'ELF 64-bit' || {
    echo "FLATPAK_BUILD_BLOCKED: output is not 64-bit ELF" >&2
    exit 76
}
cp -- "$BUILT_ELF" "$FRESH_CARRIER"
chmod 0755 "$FRESH_CARRIER"
BUILT_SHA="$(sha256sum "$FRESH_CARRIER" | cut -d' ' -f1)"
FRONTEND_SHA="$(find "$ROOT_DIR/native/hex/carrier/frontend" -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)"
CARGO_LOCK_SHA="$(sha256sum "$ROOT_DIR/native/hex/carrier/src-tauri/Cargo.lock" | cut -d' ' -f1)"
SOURCE_SHA="$SOURCE_SHA" BUILT_SHA="$BUILT_SHA" FRONTEND_SHA="$FRONTEND_SHA" CARGO_LOCK_SHA="$CARGO_LOCK_SHA" python3 -I -B -c 'import json,os,sys; json.dump({"schema":"xiio.flatpak.native-source-provenance/v1","source_commit":os.environ["SOURCE_SHA"],"native_elf_sha256":os.environ["BUILT_SHA"],"frontend_tree_sha256":os.environ["FRONTEND_SHA"],"cargo_lock_sha256":os.environ["CARGO_LOCK_SHA"],"historical_dev9_elf_used":False},sys.stdout,sort_keys=True);print()' > "$PROVENANCE"
echo "FRESH_CARRIER_BUILT_FROM_SOURCE_SHA=$SOURCE_SHA"
echo "FRESH_CARRIER_SHA256=$BUILT_SHA"
echo "FRESH_FRONTEND_TREE_SHA256=$FRONTEND_SHA"
echo "CARGO_LOCK_SHA256=$CARGO_LOCK_SHA"

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
