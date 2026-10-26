# HEX DEV bootstrap candidate

This is the requested terminal bootstrap for the existing HEX UI, not a LIVE release or proof of Loki/Aries connectivity.

- Package: xi-io-hex-dev_0.1.0-dev.1_amd64.deb
- Package SHA-256: cbeb9eb8b868a7c3ef8a46e712f78e8baf2efee0ed4f8b06c8b0afdbd99dfba6
- Installed native binary SHA-256: 0390073936614bbc7871bb1532b5b596121065c5cfc1296cda353621b7484503
- Exact package commit: 5ad722a1dfed8c711ef8f50f590ba4c9ff1c6e1d

Run install-from-github.sh as the ordinary desktop user, not sudo. It downloads the pinned package over HTTPS, verifies its checksum, asks apt for the reviewed installation without automatic approval/removals/upgrades, verifies installed version/architecture/binary, then opens HEX unprivileged. A pre-existing different DEV version causes refusal, not replacement. No display means installation only; open HEX in a graphical session afterward.

## Actual evidence

Built with Ubuntu 22.04 compatibility baseline. Nine Rust tests and five source-contract checks passed. The extracted package's real native window installed CLI payload d53a1d0219f5b1707c6c1bbedfb262082179ceab in a disposable cloud rootfs; a separate installed-wrapper invocation verified integrity. Closing/reopening the native window retained the exact plan and explicit current-state readback passed. Old carrier binary remained unchanged; package file paths do not overlap the old HEX package. The GitHub-hosted package was downloaded independently and its full SHA-256 matched.

## Explicit gaps

Not a user-host package-manager acceptance test. No Loki/Aries installation, authenticated broker/ports, remote execution, BINS custody or local-Ollama formation proof is claimed. Cloud command sandbox is unavailable. First-install rollback has no previous generation. BINS/full Switchboard payloads are not qualified. Local-AI and safe-task journey examples in dev.1 are not runtime bindings; successor work is separate. Automatic package updater behavior remains unqualified due the existing Tauri bundler-type warning.

## Source provenance

- UI: xi-io-cli-cube ffc9a3b751b47e6ce72876b64eb29f0232f865b5 plus local native bindings.
- CLI payload: xi-io-cli d53a1d0219f5b1707c6c1bbedfb262082179ceab.
- Installer kernel: xi-io_installer 15ce1769b773b3882e3f3965945ca91a29df98ec.
- Connection consumer: xi-io-Switchboard ffbcd216d4c673de826242662271add63112c49a; files only, not admitted configuration/startup.
- Carrier donor: xi-io.net PR1109 at 5762432aa7aefde768dda97652c3368f27c95086 plus local integration and DEV isolation.

These source references identify donor inputs, not a claim that all local integration changes are already on their main branches. This delivery branch does not promote any product to LIVE.
