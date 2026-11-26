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
# Extend the recovered renderer with the finite XI-IO presentation profile.
profile_patch="$(dirname -- "$patch")/xiio-catalog.patch"
frozen_profile_blob=66802a0ec5e11602f034f558a447eb718ec49f3a
test "$(git hash-object "$profile_patch")" = "$frozen_profile_blob"
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/main.rs)" = 8cbe0b57ffcf87e2007df5463a63fa14ecd4ff30
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/web.rs)" = 2a0f457c07423a678a9affb895aa05ce96b3b41d
test ! -e "$donor/apps/artcraft-launcher-web/src/xiio.rs"
test "$(git -C "$donor" hash-object crates/ui-egui/src/app.rs)" = 5c57ef9b0a0d6d8f470a9b0f60c3ad1f87c43c7b
test ! -e "$donor/crates/ui-egui/src/hosted_catalog.rs"
test "$(git -C "$donor" hash-object crates/ui-egui/src/lib.rs)" = eb2705950ae261e65f5016d00d6d6ea8474b58d3
test "$(git -C "$donor" hash-object crates/ui-egui/src/theme.rs)" = c373b3ad66108dfd5f92f5e3bbe631e3faaea04f
test "$(git -C "$donor" hash-object crates/ui-egui/src/views.rs)" = ef6bf13ddbee4e71983e688a7b5071cea8fdad96
git -C "$donor" apply --check "$profile_patch"
git -C "$donor" apply "$profile_patch"
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/main.rs)" = 50a7b9db7fcf5eb83fdcdbb8d5ba7483bfc858c1
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/web.rs)" = b0621c7939cf97a373d57bb8abc01105748ab537
test "$(git -C "$donor" hash-object apps/artcraft-launcher-web/src/xiio.rs)" = 4d3f76188d4dd6c708af18c26129ad11a80e4611
test "$(git -C "$donor" hash-object crates/ui-egui/src/app.rs)" = d2c4025dcfc2d77a8f4821c9e4ac92980525a21a
test "$(git -C "$donor" hash-object crates/ui-egui/src/hosted_catalog.rs)" = 8130643bb3362f1e3cdd8785c7f900589170f176
test "$(git -C "$donor" hash-object crates/ui-egui/src/lib.rs)" = 4ea6b9b27201a592f0b7f88c94b1eb53e8fadad0
test "$(git -C "$donor" hash-object crates/ui-egui/src/theme.rs)" = 2306d9883799eb5873c24baf3524147e47477273
test "$(git -C "$donor" hash-object crates/ui-egui/src/views.rs)" = c331f0c58ab6038cbfde5ef98f86636407413210
cd "$donor"
cargo test --locked -p artcraft-launcher-ui-egui --lib
cargo check --locked --target wasm32-unknown-unknown -p artcraft-launcher-web
cargo check --locked --target wasm32-unknown-unknown -p artcraft-launcher-web --features hosted-canvas
cargo clippy --locked --target wasm32-unknown-unknown -p artcraft-launcher-web --features hosted-canvas -- -D warnings
cargo build --locked --target wasm32-unknown-unknown --profile wasm-release -p artcraft-launcher-web --features hosted-canvas
test "$(wasm-bindgen --version)" = 'wasm-bindgen 0.2.129'
wasm-bindgen --target web --out-dir "$out" --out-name launcher target/wasm32-unknown-unknown/wasm-release/artcraft-launcher-web.wasm
test -s "$out/launcher.js"
test -s "$out/launcher_bg.wasm"
git diff --exit-code -- Cargo.lock
# Retain the pinned donor and font notices beside generated runtime bytes.
for notice in LICENSE-APACHE LICENSE-MIT NOTICE ATTRIBUTION.md; do
  cp -- "$donor/$notice" "$out/$notice"
done
for notice in OFL-Inter.txt OFL-Archivo.txt OFL-GeistMono.txt; do
  cp -- "$donor/assets/fonts/$notice" "$out/$notice"
done
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
