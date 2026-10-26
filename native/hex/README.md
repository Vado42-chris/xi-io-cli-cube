# HEX native source integration (DEV candidate)

This directory makes the already assembled native closure editable in the CLI Cube
repository. The product UI remains the repository's existing `src/` tree; there
is no second UI, kernel, registry, transaction ledger or deployment service.

`SOURCE-ADOPTION.json` is ordinary packaging provenance owned by
`Vado42-chris/xi-io-cli-cube`, following the existing SOURCE/source-custody style.
It is not a new runtime schema, registry, kernel identity or authority contract.

Ownership is unchanged:
- Cube owns the product UI and finite native composition.
- `carrier/` adapts the shared xi-io.net PR1109 Tauri window carrier.
- `adapter/kernel/xiio_installer/` is an unchanged, pinned installer-kernel closure,
  not a fork to author here. Upstream owns its manifest/transaction/journal logic.
- `cli-source/` holds the pinned CLI source and exact payload manifest. Its
  `install.mjs` has the recorded offline transport adaptation; CLI owns generations,
  launcher, pointer and rollback. `cli-source/connection/` is the pinned existing
  Switchboard native consumer. It does not create credentials or Ward authority.
- `adapter/local_steps/` provides the bounded local verification helper. Local
  filesystem readback and historical receipts do not prove remote connectivity.

## Build from this editable checkout

Qualified cloud baseline: Linux x86_64, Ubuntu22, Python3.10, Node24.22.1,
Rust1.99.1, GTK3.24 and WebKitGTK4.1. Node22.13+ is the installer's declared
selection floor, not a claim that every Node22 host has been qualified.
Native development dependencies: build-essential, pkg-config, libwebkit2gtk-4.1-dev,
libgtk-3-dev, libssl-dev, librsvg2-dev, patchelf and Python3.

```
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix native/hex/carrier --ignore-scripts --no-audit --no-fund
npm test
npm run test:bindings
npm run test:source-adoption
npm run test:contract
npm run lint
npm run build
npm run test:interaction
npm run native:check
npm run native:build
```

`native:stage` copies root `dist/` into the carrier's ignored generated frontend;
`native:check` stages it and runs real adapter fixtures, source boundaries and
locked Rust tests. `native:build` rebuilds the same root UI, performs those checks
and invokes the existing Tauri Debian bundler. It never installs the result.
Cargo/npm lockfiles are committed; binaries, node_modules, generated frontend,
Python bytecode and build targets are not. Offline builds require those locked
dependencies already cached. `CARGO_NET_OFFLINE=true` can enforce Cargo offline
resolution. The workflow runs source/native checks but does not publish or promote.

## Truth and release boundaries

The dev.4 cloud physical controls test exercised max-state drag/restore, resize,
minimize/dock restore and close. The original maximized drag suppression is removed
in the existing frame; its exact local patch is recorded in root
`src/shared/source-custody.json`. Numeric onboarding steps are navigation, not
successful checks. See `source-custody-erratum.json` for the preserved metadata correction.

That does not establish owner acceptance on Aries, runtime provisioning when Node
is absent, a production broker/ports binding, Ward admission, remote operations,
Ollama availability, command-sandbox support or Windows/macOS parity. Do not call
source adoption, successful CI or a new .deb a connected installation.

The published dev.4 bytes remain immutable. Rebuilding this editable integration
may produce different bytes because toolchain/build-path metadata can differ;
any successor delivery needs a distinct version, hash receipt and native QA.
Legacy source ZIPs at the repository root/public are not this integration's build
inputs and must not be treated as evidence of the current native closure.

## Inherited portability debt

The exact pinned CLI/connection donor includes historical Aries/Loki profile and
help strings, a Loki inventory heading, and device aliases (UUIDs are also
accepted). This integration does not use those strings as portable install
defaults, targets or authority. They are not new hardcoded host bindings. Cleanup
must occur with the donor owner, followed by an explicit repin and qualification;
do not silently edit those bytes and invalidate existing custody. No claim is
made that the entire donor source contains zero host literals.
