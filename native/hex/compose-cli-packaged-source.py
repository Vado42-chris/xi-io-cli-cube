#!/usr/bin/env python3
"""Compose HEX cli-source packaged payload from an exact CLI tip. No new installer."""
from __future__ import annotations
import ast, hashlib, json, pathlib, re, shutil, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
DEST = HERE / "cli-source"
FILES = [
    "src/xiio.mjs",
    "src/file-edit-cas.mjs",
    "src/local-ops.mjs",
    "src/sdk-provider-state.mjs",
    "src/sdk/audhd-command.mjs",
    "src/sdk/tool-verb-fidelity.mjs",
    "src/sdk/local-work-packet.mjs",
    "src/sdk/qualified-command-executor.mjs",
    "src/sdk/local-worker-host.mjs",
    "src/runtime-integrity.mjs",
    "config/service-catalog.json",
    "scripts/service-inventory.mjs",
    "scripts/reconcile-service-inventory.mjs",
    "config/batches/starter-regression-20261031.json",
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: compose-cli-packaged-source.py /path/to/xi-io-cli-worktree", file=sys.stderr)
        return 2
    src = pathlib.Path(sys.argv[1]).resolve()
    sha = subprocess.check_output(["git", "-C", str(src), "rev-parse", "HEAD"], text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise SystemExit("SOURCE_SHA_INVALID")
    dirty = subprocess.check_output(["git", "-C", str(src), "status", "--porcelain"], text=True)
    # Allow only untracked .xiio / unrelated docs noise? Prefer clean for compose.
    material = [line for line in dirty.splitlines() if line and not line.endswith(" .xiio/") and "/.xiio/" not in line]
    # Still compose if only ignored noise; refuse tracked modifications.
    tracked_dirty = [line for line in dirty.splitlines() if line and not line.startswith("??")]
    if tracked_dirty:
        raise SystemExit("CLI_WORKTREE_DIRTY:" + ";".join(tracked_dirty[:5]))

    # The admitted CLI install.mjs declares its own exact package closure.
    # Historical sources without that capability retain the 14-file profile.
    files = FILES
    canonical_installer = None
    installer_path = src / "install.mjs"
    if installer_path.is_file():
        if installer_path.is_symlink():
            raise SystemExit("CLI_CANONICAL_INSTALLER_UNTRUSTED")
        installer_data = installer_path.read_bytes()
        try:
            tracked_installer = subprocess.check_output(
                ["git", "-C", str(src), "show", f"{sha}:install.mjs"],
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            raise SystemExit("CLI_INSTALLER_NOT_IN_SOURCE_GENERATION")
        if installer_data != tracked_installer:
            raise SystemExit("CLI_INSTALLER_SOURCE_GENERATION_MISMATCH")
        if b"--packaged-source" in installer_data:
            matched = re.search(
                r"const PAYLOAD_FILES=Object\.freeze\((\[[^;]+?\])\);",
                installer_data.decode("utf-8"),
            )
            if not matched:
                raise SystemExit("CLI_CANONICAL_PAYLOAD_DECLARATION_MISSING")
            try:
                declared = ast.literal_eval(matched.group(1))
            except (ValueError, SyntaxError):
                raise SystemExit("CLI_CANONICAL_PAYLOAD_DECLARATION_INVALID")
            if (not isinstance(declared, list) or not declared
                    or len(declared) != len(set(declared))
                    or any(not isinstance(rel, str)
                           or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", rel)
                           or ".." in pathlib.PurePosixPath(rel).parts
                           for rel in declared)):
                raise SystemExit("CLI_CANONICAL_PAYLOAD_DECLARATION_INVALID")
            files = declared
            canonical_installer = installer_data

    # Validate the complete exact-generation closure before changing any receiver bytes.
    files_meta = {}
    payload = {}
    for rel in files:
        path = src / rel
        if not path.is_file() or path.is_symlink():
            raise SystemExit("MISSING_PAYLOAD_FILE:" + rel)
        data = path.read_bytes()
        try:
            tracked = subprocess.check_output(
                ["git", "-C", str(src), "show", f"{sha}:{rel}"], stderr=subprocess.DEVNULL
            )
        except subprocess.CalledProcessError:
            raise SystemExit("PAYLOAD_NOT_IN_SOURCE_GENERATION:" + rel)
        if tracked != data:
            raise SystemExit("PAYLOAD_SOURCE_GENERATION_MISMATCH:" + rel)
        files_meta[rel] = {"sha256": digest(data), "size": len(data)}
        payload[rel] = data

    # Preserve HEX --packaged-source transport adaptation; only refresh PAYLOAD_FILES.
    install_path = DEST / "install.mjs"
    if not install_path.is_file():
        raise SystemExit("HEX_INSTALL_ADAPTATION_MISSING")
    install_text = install_path.read_text()
    if "--packaged-source" not in install_text:
        raise SystemExit("HEX_PACKAGED_SOURCE_SEAM_MISSING")
    files_literal = "[" + ",".join("'" + f + "'" for f in files) + "]"
    install_text, n = re.subn(
        r"const PAYLOAD_FILES=Object\.freeze\(\[[^\]]+\]\);",
        f"const PAYLOAD_FILES=Object.freeze({files_literal});",
        install_text,
        count=1,
    )
    if n != 1:
        raise SystemExit("HEX_INSTALL_PAYLOAD_REWRITE_FAILED")
    installer = canonical_installer if canonical_installer is not None else install_text.encode("utf-8")
    manifest = {
        "schema": "xiio.cli.packaged-source/v1",
        "source_sha": sha,
        "files": files_meta,
        "composed_by": "native/hex/compose-cli-packaged-source.py",
        "hard": ["COMPOSED != INSTALLED", "SOURCE_TIP != PRODUCTION_ACTIVATION"],
    }
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()

    # Keep the provenance projection joined to the generated packaged
    # manifest. This updates candidate metadata only, never activation.
    source_meta_path = DEST / "SOURCE.json"
    if not source_meta_path.is_file():
        raise SystemExit("HEX_SOURCE_PROVENANCE_MISSING")
    source_meta = json.loads(source_meta_path.read_text())
    source_meta["current_packaged_payload"] = {
        "repository": "Vado42-chris/xi-io-cli",
        "ref": sha,
        "manifest": "packaged-source.json",
        "files": files_meta,
        "local_payload_modifications": False,
    }
    source_meta["ref_role"] = (
        "Historical initial adoption base; current packaged payload authority "
        "is current_packaged_payload and packaged-source.json."
    )
    # install.mjs PAYLOAD_FILES rewrite above changes bytes; keep successor
    # hash joined to the composed candidate (still never activates).
    successor = source_meta.get("offline_installer_successor")
    if isinstance(successor, dict):
        successor["sha256"] = digest(installer)
        source_meta["offline_installer_successor"] = successor
    source_meta_bytes = (json.dumps(source_meta, indent=2) + "\n").encode("utf-8")

    # Rewrite download-install-cli.py pins to this composed tip (candidate only).
    dl = HERE / "download-install-cli.py"
    text = dl.read_text()
    for pattern, replacement in (
        (r'^SOURCE_SHA="[0-9a-f]{40}"$', f'SOURCE_SHA="{sha}"'),
        (r'^INSTALLER_SHA="[0-9a-f]{64}"$', f'INSTALLER_SHA="{digest(installer)}"'),
        (r'^MANIFEST_SHA="[0-9a-f]{64}"$', f'MANIFEST_SHA="{digest(manifest_bytes)}"'),
        (r"^FILES=\[[^\]]+\]$", f"FILES={json.dumps(files)}"),
    ):
        text, count = re.subn(pattern, replacement, text, flags=re.MULTILINE)
        if count != 1:
            raise SystemExit("HEX_DOWNLOAD_PIN_REWRITE_FAILED")

    receipt = {
        "schema": "xiio.hex.composed-packaged-source/v1",
        "state": "COMPOSED_NOT_ACTIVATED",
        "source_sha": sha,
        "manifest_sha256": digest(manifest_bytes),
        "installer_sha256": digest(installer),
        "payload_files": len(files),
        "destination": str(DEST),
        "production_baseline_sha": "89b9c418f6e161d9864bf891fd665b6a18f00dd2",
        "hard": ["COMPOSED != INSTALLED", "CANDIDATE != PRODUCTION"],
    }
    out = HERE / "COMPOSED-packaged-source.receipt.json"

    # Inspect obsolete previous manifest entries before mutating receiver bytes.
    prior = json.loads((DEST / "packaged-source.json").read_text())
    prior_files = prior.get("files")
    if not isinstance(prior_files, dict):
        raise SystemExit("HEX_PREVIOUS_MANIFEST_INVALID")
    obsolete = []
    for rel in prior_files:
        if rel not in files:
            if (not isinstance(rel, str)
                    or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", rel)
                    or ".." in pathlib.PurePosixPath(rel).parts):
                raise SystemExit("HEX_PREVIOUS_PAYLOAD_PATH_INVALID")
            old_path = DEST / rel
            if old_path.is_symlink() or (old_path.exists() and not old_path.is_file()):
                raise SystemExit("HEX_STALE_PAYLOAD_UNTRUSTED:" + rel)
            obsolete.append(old_path)

    # Only publish the candidate after source custody and all pin rewrites pass.
    # This is validation-before-write, not a crash-atomic multi-file transaction.
    for old_path in obsolete:
        old_path.unlink(missing_ok=True)
    for rel, data in payload.items():
        dest = DEST / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    install_path.write_bytes(installer)
    (DEST / "packaged-source.json").write_bytes(manifest_bytes)
    source_meta_path.write_bytes(source_meta_bytes)
    dl.write_text(text)
    out.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
