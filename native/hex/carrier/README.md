# HEX finite Tauri carrier — DEV candidate

Adapted from xi-io.net PR1109 commit5762432aa7aefde768dda97652c3368f27c95086.
Loads only the root Cube's compiled local frontend. No privileged remote origin,
arbitrary command API, shell/fs plugin or native-OS decoration replacement.

Use root `npm run native:stage`, `native:check`, `native:build`; see `../README.md`.
Direct resource mappings preserve sibling `../adapter/` and `../cli-source/`.
The fixed adapter is executed with `/usr/bin/python3 -I -B`; requests≤16KiB,
output≤2MiB, one serialized child. Timeout returns uncertain/do_not_retry without
killing an operation; its gate remains held until child exit. Adapter process
locking and existing journal independently protect restart/replay boundaries.

Finite IPC: inspect, prepare, readback, apply, rollback, local_ai_status,
safe_task_prepare, safe_task_apply, safe_task_inspect; existing window actions;
and native_select_directory(workspace|installation). The Prepare action accepts the user-selected absolute Node runtime path for
finite version/hash validation and approved payload execution. No general-purpose
executable, shell command text, remote URL or ports module is accepted.

DEV package/binary/resource naming isolates the app from an existing LIVE HEX.
This does not provision DEV/TEST/LIVE workspaces, authenticate a host or qualify
credentials. Backend defaults/destination approval remain explicit. Native
command tracing logs only this app's action/state/geometry, never payloads.
