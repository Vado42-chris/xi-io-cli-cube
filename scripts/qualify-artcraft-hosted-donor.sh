#!/usr/bin/env bash
# Existing HEX workflow helper candidate. Does not install or launch an app.
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
test "${RUNNER_ENVIRONMENT:-}" = github-hosted
donor=${1:?pinned donor checkout required}
patch=${2:?reviewed lifecycle patch required}
out=${3:?fresh runner output directory required}
test "$(realpath -m -- "$out")" = "$(realpath -- "${RUNNER_TEMP:?runner temp required}")/hex-artcraft-hosted-donor"
test "$(git hash-object "$patch")" = 0e09a389078baa8ddf9750313727c1eaa5300b5b
test "$(git -C "$donor" rev-parse HEAD)" = ec205366ebe42635e155b9ab246f036052fef406
test -z "$(git -C "$donor" status --porcelain)"
test ! -e "$out" # Never overwrite local or other-writer staged assets.
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/web.rs)" = 34c93f996d2e0e281f38b6b2b34409e19888a11e
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/main.rs)" = 76aa23e8742de9ef38cd396ac7f2de4497b30d19
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/Cargo.toml)" = 76a7b9cb739a5a40c5c437d78bc73a70e68e8b7d
git -C "$donor" apply --check "$patch"
git -C "$donor" apply "$patch"
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/web.rs)" = 2a0f457c07423a678a9affb895aa05ce96b3b41d
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/main.rs)" = 8cbe0b57ffcf87e2007df5463a63fa14ecd4ff30
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/Cargo.toml)" = 6aa439780b2c560680b425b5f14618fbd67ef195
cd "$donor"
cargo check --locked --target wasm32-unknown-unknown -p artcraft-launcher-web
cargo check --locked --target wasm32-unknown-unknown -p artcraft-launcher-web --features hosted-canvas
cargo clippy --locked --target wasm32-unknown-unknown -p artcraft-launcher-web --features hosted-canvas -- -D warnings
cargo build --locked --target wasm32-unknown-unknown --profile wasm-release -p artcraft-launcher-web --features hosted-canvas
test "$(wasm-bindgen --version)" = 'wasm-bindgen 0.2.129'
wasm-bindgen --target web --out-dir "$out" --out-name launcher target/wasm32-unknown-unknown/wasm-release/artcraft-launcher-web.wasm
test -s "$out/launcher.js"
test -s "$out/launcher_bg.wasm"
git diff --exit-code -- Cargo.lock
# Generated export presence is not renderer initialization or native acceptance.
node --input-type=module - "$out/launcher.js" <<'JS'
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const module = await import(pathToFileURL(process.argv[2]).href);
assert.equal(typeof module.default, 'function');
assert.equal(typeof module.mount_launcher, 'function');
assert.equal(typeof module.LauncherHandle, 'function');
assert.equal(typeof module.LauncherHandle.prototype.destroy, 'function');
assert.equal(typeof module.LauncherHandle.prototype.free, 'function');
console.log('GENERATED_EXPORTS_PRESENT_NOT_RENDERER_PROOF');
JS
