#!/usr/bin/python3
"""Drive the installed HEX window on a disposable, offline-product CI bench."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit


def read(path):
    return json.loads(path.read_bytes())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def prepare_framework(repo, work):
    """Only bootstrap the installed Framework test host, before starting HEX."""
    adapter = repo / "native/hex/adapter"
    sys.path[:0] = [str(adapter), str(adapter / "kernel")]
    from child_bundle import install_bundle
    framework = repo / "native/hex/fixtures/framework-runtime-cfe2776"
    manifest = framework / "framework-runtime.manifest.json"
    shutil.copyfile(manifest, work / manifest.name)
    product = read(manifest)
    urls = {r["source"]: "https://fixture.invalid/" + r["source"] for r in product["payload"]}
    row = dict(role="framework", product_id=product["product_id"], manifest=manifest.name,
               manifest_sha256=digest(manifest.read_bytes()), depends_on=[], payload_urls=urls)
    lock = work / "bootstrap.json"
    lock.write_text(json.dumps(dict(schema_version="xiio-installer-bundle-profile-v1",
                                   profile_id="bench-host", fixture=False, products=[row])))

    def fixture_fetch(url, destination, size):
        data = (framework / urlsplit(url).path.lstrip("/")).read_bytes()
        require(len(data) == size, "Framework fixture size mismatch")
        destination.write_bytes(data)

    install_bundle(lock, approved_lock_sha256=digest(lock.read_bytes()), env=os.environ.copy(),
                   allowed_hosts=frozenset({"fixture.invalid"}), fetch=fixture_fetch)
    return framework


def sample_products(work):
    from test_bundle import BundleFixture
    folders = []
    for role in ("sample-editor", "sample-service"):
        folder = work / role
        f = BundleFixture(folder).child(role, bytes_=os.urandom(48))
        lock, _ = f.product_lock(product_root_role=role)
        profile = read(lock)
        profile["profile_id"] = role
        lock.write_text(json.dumps(profile))
        (folder / "payloads").mkdir()
        for data in f.payloads.values():
            (folder / "payloads" / digest(data)).write_bytes(data)
        folders.append(folder)
    return folders


def prepare_admission(folder, framework, node):
    lock = folder / "bundle.lock.json"
    profile = read(lock)
    row, = [r for r in profile["products"] if r["role"] == profile["product_root_role"]]
    source = read(folder / row["manifest"])
    require(source["product_id"] == row["product_id"], "Root product identity mismatch")
    hosts = sorted({urlsplit(url).hostname for r in profile["products"] for url in r["payload_urls"].values()})
    # Synthetic custody decisions exist only in this process's empty XDG test host.
    script = """
import {persistAcceptedRelease,persistCurrentAdopter,persistEntrypointQualification} from './release-authoritative-readback.mjs';
const [p,g,s,h]=process.argv.slice(1); const ref='fixture:'+p;
persistAcceptedRelease({schema:'xiio.framework.distributable-release-projection/v1',lifecycle:'DISTRIBUTABLE',product_ref:p,release_generation:g,release_ref:ref,approved_lock_sha256:s,manifest_refs:['fixture:manifest'],artifact_refs:['fixture:media'],qualification_ref:'fixture:gui',provider_hosts:JSON.parse(h)});
persistCurrentAdopter({schema:'xiio.framework.release-adopter-lock/v1',state:'ADOPTED_CURRENT',consumer_ref:'consumer:hex-native-product-receiver',product_ref:p,release_ref:ref,release_generation:g,approved_lock_sha256:s,currentness_ref:'fixture:gui'});
persistEntrypointQualification({schema:'xiio.framework.entrypoint-qualification/v1',state:'QUALIFIED',artifact_generation:g,qualification_digest:'fixture:gui',effect_authority:false},{product_ref:p});
"""
    subprocess.run([str(node), "--input-type=module", "-e", script, row["product_id"],
                    row["release_generation"], digest(lock.read_bytes()), json.dumps(hosts)],
                   cwd=framework / "scripts/lib", check=True)
    return profile, row, source


def value_before_effect(folder, profile):
    rows = []
    for role in profile["products"]:
        data = (folder / role["manifest"]).read_bytes()
        require(digest(data) == role["manifest_sha256"], "Manifest pin changed")
        for entry in json.loads(data)["payload"]:
            key = {"xdg_data": "XDG_DATA_HOME", "xdg_config": "XDG_CONFIG_HOME"}[entry["destination_scope"]]
            relative = Path(entry["destination"])
            require(not relative.is_absolute() and ".." not in relative.parts, "Unsafe test destination")
            path = Path(os.environ[key]) / relative
            expected = (folder / "payloads" / entry["sha256"]).read_bytes()
            require(len(expected) == entry["size"] and digest(expected) == entry["sha256"], "Bad media")
            require(not path.exists(), "Destination existed before consent")
            rows.append((path, expected, int(entry["mode"], 8)))
    return rows


def readback(profile, root, lock_sha, rows):
    state = Path(os.environ["XDG_STATE_HOME"]) / "xi-io/installer"
    observations = []
    for path, expected, mode in rows:
        st = path.lstat()
        require(stat.S_ISREG(st.st_mode) and stat.S_IMODE(st.st_mode) == mode
                and path.read_bytes() == expected and path.resolve() == path, "Installed file mismatch")
        observations.append(digest(expected))
    receipt_root = state / "bundles" / profile["profile_id"]
    transactions = [read(p) for p in receipt_root.glob("*.receipt.json")]
    require({t["product_id"] for t in transactions} == {r["product_id"] for r in profile["products"]}
            and all(t["schema_version"] == "xiio-installer-receipt-v1" for t in transactions),
            "Installer receipt set mismatch")
    distribution = [read(p) for p in (state / "release-distributions").glob("*.json")]
    matching = [r for r in distribution if r["product_ref"] == root["product_id"]]
    require(len(matching) == 1 and matching[0]["release_generation"] == root["release_generation"]
            and matching[0]["approved_lock_sha256"] == lock_sha and matching[0]["readback_verified"] is True
            and matching[0]["effect_authority"] is False, "Release receipt mismatch")
    return {"product_id": root["product_id"], "release_generation": root["release_generation"],
            "lock_sha256": lock_sha, "payload_sha256": observations, "transaction_count": len(transactions)}


def search_windows(pid, title=None):
    # xdotool joins selectors with OR unless --all is explicit.
    command = ["xdotool", "search", "--all", "--onlyvisible", "--pid", str(pid)]
    if title is not None:
        command.extend(["--name", "^" + re.escape(title) + "$"])
    found = subprocess.run(command, text=True, capture_output=True, timeout=3)
    require(found.returncode in (0, 1), "X window query failed")
    return [w for w in found.stdout.splitlines() if w.isdecimal()]


def window_metadata(window):
    def query(*command):
        result = subprocess.run(command, text=True, capture_output=True, timeout=3)
        return result.stdout.strip() if result.returncode == 0 else ""

    relation = query("xprop", "-id", window, "WM_TRANSIENT_FOR")
    parent_match = re.search(r"window id # (0x[0-9a-f]+)", relation, re.I)
    parent = str(int(parent_match[1], 16)) if parent_match else None
    return (query("xdotool", "getwindowpid", window), query("xdotool", "getwindowname", window)[:128], parent)


def window_id(pid, title, timeout=12, *, transient_for=None):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        exact = []
        for xid in search_windows(pid, title):
            owner, name, parent = window_metadata(xid)
            if (owner == str(pid) and name == title and
                    (transient_for is None or (xid != transient_for and parent == transient_for))):
                exact.append(xid)
        if len(exact) == 1:
            return exact[0]
        time.sleep(.12)
    seen = [(w, window_metadata(w)) for w in search_windows(pid)[:8]]
    raise RuntimeError(f"Visible native window {title!r} with parent {transient_for!r} unavailable. HEX windows {seen!r}")


INSTALL_REGION = "Product-only release installation"
INSTALL_HEADING = "Install a downloaded product"


def install_heading_check(capture, rows, complete):
    check = capture.expected_control_check(rows, complete, INSTALL_HEADING, "heading")
    if rows is None or not complete:
        return {**check, "status": "OBSERVER_UNAVAILABLE"}
    return check


def inspect_install_heading(repo, ui, unverified):
    spec = importlib.util.spec_from_file_location("hex_library", repo / "scripts/verify-installed-hex-library.py")
    capture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(capture)
    from gi.repository import GLib
    observer = capture.Native(ui.pid, ui.window, ui.elf)

    def read():
        ui.guard()
        try:
            rows = observer.rows(scope_name=INSTALL_REGION)
        except (capture.Unverified, GLib.Error) as error:
            # The existing ui.wait deadline also bounds stale AT-SPI tree reads.
            raise unverified(f"INSTALL_HEADING_OBSERVER_UNAVAILABLE: {error}") from error
        check = install_heading_check(capture, rows, observer.last_rows_complete)
        if check["status"] != "MATCHED":
            raise unverified(f"INSTALL_HEADING_{check['status']} (visible headings {check['visible_role_count']})")
        return {"name": INSTALL_HEADING, "region": INSTALL_REGION, "status": check["status"],
                "visible_exact_matches": check["visible_exact_matches"]}

    return ui.wait(read)


def choose_folder(ui, folder, unverified):
    button = ui.wait(lambda: ui.find("Choose product folder", [ui.ax.Role.PUSH_BUTTON]))
    ui.click(button)
    dialog = window_id(ui.pid, "Choose downloaded product folder", transient_for=ui.window)
    ui.command(["xdotool", "windowfocus", "--sync", dialog])

    title = "Choose downloaded product folder"
    roles = ui.ax.Role
    geometry = dict(item.split("=", 1) for item in
                    ui.command(["xdotool", "getwindowgeometry", "--shell", dialog]).splitlines()
                    if "=" in item)
    x, y, width, height = (int(geometry[k]) for k in ("X", "Y", "WIDTH", "HEIGHT"))

    def guard_dialog():
        require(ui.command(["xdotool", "getwindowfocus"]) == dialog, "Chooser lost focus")
        identity = window_metadata(dialog)
        require(identity == (str(ui.pid), title, ui.window), f"Chooser identity changed: {identity!r}")

    def chooser_nodes():
        roots = [n for n in ui.nodes() if n.get_name() == title
                 and n.get_role() in (roles.DIALOG, roles.FILE_CHOOSER, roles.FRAME)]
        if len(roots) != 1:
            return []
        queue, found = [roots[0]], []
        while queue:
            current = queue.pop()
            require(len(found) < 2048, "Chooser accessibility tree exceeded bounds")
            found.append(current)
            queue.extend(current.get_child_at_index(i) for i in range(current.get_child_count()))
        return found

    def point(node):
        state = node.get_state_set()
        if not state.contains(ui.ax.StateType.SHOWING):
            return None
        component = node.get_component_iface()
        if not component:
            return None
        rect = component.get_extents(ui.ax.CoordType.SCREEN)
        px, py = rect.x + rect.width // 2, rect.y + rect.height // 2
        if rect.width > 0 and rect.height > 0 and x <= px < x+width and y <= py < y+height:
            return px, py
        return None

    def click_named(name, accepted_roles):
        end = time.monotonic() + 7
        seen = []
        while time.monotonic() < end:
            guard_dialog()
            nodes = chooser_nodes()
            candidates = []
            for n in nodes:
                if n.get_name() != name or n.get_role() not in accepted_roles:
                    continue
                position = point(n)
                if position and n.get_state_set().contains(ui.ax.StateType.SENSITIVE):
                    candidates.append(position)
            # A GTK list row/cell and its text can share an accessible name.
            # Click the unique point when both interfaces describe the same cell.
            if len(set(candidates)) == 1:
                px, py = candidates[0]
                ui.command(["xdotool", "mousemove", "--sync", str(px), str(py)])
                guard_dialog()
                ui.command(["xdotool", "click", "1"])
                return
            seen = [(n.get_role_name(), n.get_name()[:80]) for n in nodes
                    if n.get_name() and point(n)][:45]
            time.sleep(.12)
        raise RuntimeError(f"Chooser control {name!r} was not uniquely selectable. Visible controls {seen!r}")

    # The downloaded directories are direct children of the new disposable HOME.
    # Single-click the file list row, then click GTK's explicit response button.
    click_named(folder.name, (roles.TABLE_CELL, roles.LIST_ITEM, roles.TREE_ITEM,
                              roles.LABEL, roles.ICON))
    click_named("Select folder", (roles.PUSH_BUTTON,))
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if not search_windows(ui.pid, title):
            break
        time.sleep(.1)
    else:
        seen = [(w, window_metadata(w)) for w in search_windows(ui.pid)[:8]]
        raise RuntimeError(f"Folder chooser remained visible after accept. HEX windows {seen!r}")
    ui.command(["xdotool", "windowfocus", "--sync", ui.window])
    def selected_path_visible():
        if str(folder) in ui.text():
            return True
        raise unverified("Selected folder was not displayed by HEX")
    ui.wait(selected_path_visible)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--proof", type=Path, required=True)
    parser.add_argument("--media", type=Path, nargs="+")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted",
            "Disposable GitHub Ubuntu runner required")
    spec = importlib.util.spec_from_file_location("hosted_hex", repo / "scripts/verify-extracted-artcraft.py")
    hosted = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hosted)
    proof = args.proof.resolve()
    identity = repo / "hex-native-frontend-identity.json"
    executable = Path("/usr/bin/xi-io-hex-dev")
    source_sha = subprocess.check_output(["git","rev-parse","HEAD"], cwd=repo, text=True).strip()
    elf = digest(executable.read_bytes())
    package_binding = hosted.frontend_binding(identity, source_sha, elf, args.package.resolve(), executable)
    hosted.installed_package_binding(executable, package_binding["package_version"])
    exercise_installed_window(repo, hosted, source_sha, executable, elf, package_binding, proof, args.media)


def exercise_installed_window(repo, hosted, source_sha, executable, elf, package_binding, proof, media):
    node = Path(shutil.which("node")).resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="hex-window-", dir=os.environ["RUNNER_TEMP"]) as tmp:
        work = Path(tmp)
        for name, subdir in [("HOME","home"), ("XDG_DATA_HOME","data"), ("XDG_STATE_HOME","state"),
                             ("XDG_CONFIG_HOME","config"), ("XDG_CACHE_HOME","cache")]:
            value = work / subdir
            value.mkdir(mode=0o700)
            os.environ[name] = str(value)
        # Exercise built-in runtime discovery with the exact setup-node binary.
        version = subprocess.check_output([str(node), "--version"], text=True).strip()
        nvm_bin = Path(os.environ["HOME"]) / ".nvm/versions/node" / version / "bin"
        nvm_bin.mkdir(parents=True)
        shutil.copy2(node, nvm_bin / "node")
        framework = prepare_framework(repo, work)
        folders = [f.resolve(strict=True) for f in media] if media else sample_products(work)
        require(len(folders) >= 2 and len(set(folders)) == len(folders), "Two different product folders required")
        # Native GTK opens at HOME. Materialize the downloaded folders there
        # using ordinary, visible names so selection uses the real file list.
        downloads = []
        for index, original in enumerate(folders, 1):
            download = Path(os.environ["HOME"]) / f"HEX download {index:02d}"
            shutil.copytree(original, download)
            for member in original.rglob("*"):
                require(not member.is_symlink(), "Symlink in qualification media")
                if member.is_file():
                    require((download / member.relative_to(original)).read_bytes() == member.read_bytes(),
                            "Downloaded copy differs from supplied media")
            downloads.append(download)
        prepared = [(f, *prepare_admission(f, framework, node)) for f in downloads]
        require(len({r["product_id"] for _, _, r, _ in prepared}) == len(folders), "Duplicate selected product")
        sentinel = work / "private-sphere"
        sentinel.write_bytes(os.urandom(32))
        sentinel_before = sentinel.read_bytes()
        with subprocess.Popen([str(executable)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as app:
            try:
                # WebKit discards accessible objects between the busy and reviewed views.
                # Restart tree traversal only for that transient, keeping the original window and ELF.
                from gi.repository import GLib
                class Window(hosted.base.Native):
                    def nodes(self):
                        for attempt in range(6):
                            try:
                                return super().nodes()
                            except GLib.Error as exc:
                                if attempt == 5 or "application no longer exists" not in str(exc).lower():
                                    raise
                                self.guard()
                                time.sleep(.12)
                ui = Window(app.pid, window_id(app.pid, "XI-IO HEX"), elf, source_sha, work)
                ui.deadline = time.monotonic() + 120
                ui.command(["xdotool","windowfocus","--sync",ui.window])
                ui.click(ui.wait(lambda: ui.find("Install", [ui.ax.Role.PUSH_BUTTON,ui.ax.Role.PAGE_TAB])))
                heading = inspect_install_heading(repo, ui, hosted.base.Unverified)
                observations = []
                for folder, profile, root, product in prepared:
                    rows = value_before_effect(folder, profile)
                    choose_folder(ui, folder, hosted.base.Unverified)
                    inspect = ui.wait(lambda: ui.find("Inspect exact product release", [ui.ax.Role.PUSH_BUTTON]))
                    require(inspect.get_state_set().contains(ui.ax.StateType.ENABLED), "Inspect disabled after folder selection")
                    ui.click(inspect)
                    label = "Approve this exact reviewed product and dependency closure."
                    approval = ui.wait(lambda: ui.find(label, [ui.ax.Role.CHECK_BOX]))
                    require(product["display_name"] in ui.text(), "Reviewed product name mismatch")
                    require(not approval.get_state_set().contains(ui.ax.StateType.CHECKED), "Consent inherited")
                    install = ui.wait(lambda: ui.find("Install reviewed product", [ui.ax.Role.PUSH_BUTTON]))
                    require(not install.get_state_set().contains(ui.ax.StateType.ENABLED), "Install enabled before consent")
                    require(all(not path.exists() for path, _data, _mode in rows), "Payload created before consent")
                    ui.click(approval)
                    ui.click(ui.wait(lambda: ui.find("Install reviewed product", [ui.ax.Role.PUSH_BUTTON])))
                    def observed():
                        ui.guard()
                        hosted.base.require("Installed files independently verified" in ui.text(), "Install readback absent")
                        return True
                    ui.wait(observed)
                    observations.append(readback(profile, root, digest((folder / "bundle.lock.json").read_bytes()), rows))
                require(sentinel.read_bytes() == sentinel_before, "Unrelated private bytes changed")
                ui.guard()
                proof.write_text(json.dumps({"schema":"xiio.hex.installed-window-product-selection-test/v1",
                    "source":source_sha, "package_sha256":package_binding["debian_package_sha256"],
                    "installed_elf_sha256":elf, "install_heading":heading, "same_window":True, "fresh_consent_each":True,
                    "synthetic_framework_release_admission":True, "products":observations,
                    "production_release_approved":False,"account_provisioned":False}, indent=2)+"\n")
            except Exception:
                if app.poll() is None and "ui" in locals():
                    try:
                        summary = [(n.get_role_name(), n.get_name()[:140]) for n in ui.nodes()
                                   if n.get_role() in (ui.ax.Role.ALERT, ui.ax.Role.STATUS_BAR, ui.ax.Role.CHECK_BOX,
                                                       ui.ax.Role.PUSH_BUTTON) and n.get_name()]
                        print("Installed window controls:", summary[:50], flush=True)
                        text = ui.text()
                        errors = sorted(set(re.findall(r"\b[A-Z][A-Z_]{4,}\b", text)))
                        print("Visible status codes:", errors[:15], flush=True)
                    except Exception as exc:
                        print("Accessibility snapshot unavailable", type(exc).__name__, flush=True)
                raise
            finally:
                app.terminate()
                try:
                    app.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    app.kill()
                    app.wait()


if __name__ == "__main__":
    main()
