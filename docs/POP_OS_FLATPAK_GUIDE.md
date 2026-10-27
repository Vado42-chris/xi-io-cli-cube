# Pop!_OS Flatpak Installation & Distribution Guide

Pop!_OS provides first-class support for Flatpak out of the box through Pop!_Shop and the command line. This guide documents how to install, test, and distribute XI-IO HEX (`com.xiio.hex`) on Pop!_OS from a remote repository, a local repository, a `.flatpakref` file, or a standalone `.flatpak` bundle.

---

## 1. Quick Install on Pop!_OS

### Option A: Install from Hosted Flatpak Repository (GitHub Pages or Custom Server)
Run in Pop!_OS terminal:
```bash
# Add the XI-IO repository remote (user-level, no root required)
flatpak remote-add --user --if-not-exists xi-io https://vado42-chris.github.io/xi-io-cli-cube/repo

# Install XI-IO HEX
flatpak install --user xi-io com.xiio.hex

# Run application
flatpak run com.xiio.hex
```

### Option B: One-Click Install via `.flatpakref` (Pop!_Shop)
1. Download `packaging/flatpak/com.xiio.hex.flatpakref`.
2. Double-click the file in Pop!_OS Files (or open with Pop!_Shop).
3. Pop!_Shop resolves the runtime from Flathub and installs the application.
4. Launch "XI-IO HEX" from the Pop!_OS Application Launcher / Super key.

---

## 2. Local Repository Installation (Development & Local Qualification)

If building or testing locally on a Pop!_OS machine from a git checkout:

```bash
# 1. Clone repository
git clone https://github.com/Vado42-chris/xi-io-cli-cube.git
cd xi-io-cli-cube

# 2. Build the Flatpak into a local repository
./scripts/build-flatpak.sh

# 3. Add the local repository (no GPG verification required for local development)
flatpak remote-add --user --no-gpg-verify --if-not-exists xi-io-local ./dist/flatpak/repo

# 4. Install from the local repository
flatpak install --user -y xi-io-local com.xiio.hex

# 5. Launch the application
flatpak run com.xiio.hex
```

---

## 3. Standalone Single-File Bundle (`.flatpak`) — Recommended for Releases

To distribute or sideload without hosting a remote repository:

```bash
# Generate bundle (performed automatically by ./scripts/build-flatpak.sh)
flatpak build-bundle ./dist/flatpak/repo ./dist/flatpak/com.xiio.hex.flatpak com.xiio.hex stable

# Install bundle directly on Pop!_OS
flatpak install --user ./dist/flatpak/com.xiio.hex.flatpak

# Run
flatpak run com.xiio.hex
```

---

## 4. Runtime Dependencies & Offline Availability

* **Base Runtime:** `org.gnome.Platform//50` and `org.gnome.Sdk//50`.
  * **Why GNOME 50?** Tauri v2 dynamically links against `libwebkit2gtk-4.1.so.0`, `libsoup-3.0.so.0`, `libgtk-3.so.0`, and Python 3.10+. `org.gnome.Platform` supplies all four dependencies natively inside the sandbox without bundling redundant binary shared objects.
* **Online Systems:** If the GNOME 50 runtime is not present, Flatpak prompts to automatically install it from Flathub during `flatpak install`.
* **Airgapped / Strict Offline Qualification:** For offline Pop!_OS hosts, the runtime can be pre-cached or exported as a standalone bundle:
  ```bash
  flatpak build-bundle --runtime /var/lib/flatpak/repo org.gnome.Platform-50.flatpak org.gnome.Platform 50
  flatpak install --user org.gnome.Platform-50.flatpak
  ```

---

## 5. Least-Privilege Scoped Permissions (No Broad Home Access)

Broad `--filesystem=home` is explicitly avoided. Sandboxed permissions are strictly restricted to the application's declared custody boundaries:

| Permission | Purpose |
| :--- | :--- |
| `--filesystem=xdg-data/xi-io:create` | Dedicated local product storage (`~/.local/share/xi-io/`) |
| (app-private `~/.var/app/com.xiio.hex/state`; no unsupported `xdg-state` Flatpak grant) | Pinned state and receipt storage (`~/.local/state/xi-io/`) |
| `--filesystem=xdg-config/xi-io:create` | Device identity and non-secret config (`~/.config/xi-io/`) |
| `--filesystem=xdg-cache/xi-io:create` | Temporary download cache (`~/.cache/xi-io/`) |
| `--filesystem=~/.local/bin:create` | Installation target for CLI symlink launchers |
| `--talk-name=org.freedesktop.portal.FileChooser` | Scoped, user-approved directory access via native portal |
| `--socket=fallback-x11`, `--socket=wayland` | Pop!_OS desktop window rendering (X11 & COSMIC/Wayland) |
| `--device=dri` | GPU rendering acceleration |
| `--share=network` | Transactional package acquisition from approved release hosts |
| `--share=ipc` | Multi-process lock serialization |
| `--talk-name=org.freedesktop.Notifications` | Desktop notification events |

All PR #10 descriptor-anchored protections (`_secure_ensure_state_root`) and pre-acquisition locks (`apply.lock`) operate directly within these scoped directories, preventing both external symlink escapes and overlapping install races.

---

## 6. Packaged CLI Execution Boundary & Limitations

An honest architectural appraisal of Flatpak containment vs. host CLI launchers:

1. **Inside the Flatpak Sandbox:**
   * The GUI carrier (`xi-io-hex-dev`), the Python adapter (`/usr/bin/python3`), and any bundled tools run fully isolated within sandbox boundaries.
   * Product downloads, SHA-256 verification, plan evaluation, and atomic rollbacks operate with complete cryptographic custody.
   * Environment variables are bounded and validated across the Tauri carrier boundary (`XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`).

2. **From the Host Terminal (CLI Launchers in `~/.local/bin`):**
   * The installer writes launcher scripts (such as `~/.local/bin/xi-io-cli`) that bind to a specific Node executable path and product prefix.
   * If a launcher is generated pointing to an in-sandbox Node path (e.g., `/app/bin/node`), host shells cannot invoke `/app/` paths without invoking `flatpak run --command=...`.
   * For developers and operators requiring direct host-native shell execution without container translation, the **Debian package (`.deb`) remains the qualified, authoritative delivery path**. The Flatpak package provides a hardened, sandboxed carrier for the GUI experience and local management.

---

## 7. Updating & Uninstallation

```bash
# Update
flatpak update com.xiio.hex

# Uninstall
flatpak uninstall --user com.xiio.hex
```


## Release qualification status

The historical DEV9 .deb and its ELF are not a current Flatpak carrier. A current
Flatpak build must compile the native Tauri source and embedded frontend using
`Cargo.lock` from its exact Git generation, then package the resulting binary
with `/app/share/xi-io-hex/source-provenance.json`. The actual installed GUI,
Python adapter, workspace XDG directories, restart, rollback and user-visible
readback must pass independently on disposable Linux before any release.

Flatpak's sandbox must not be used to promise a host-native `xi-io-cli` launcher.
That remains the Debian/CLI owner's delivery contract. The single-file Flatpak
bundle does not contain the GNOME 50 runtime; preprovision it for offline use.
Do not advertise the example remote or repository descriptors until its signed,
reachable provider deployment is independently verified.
