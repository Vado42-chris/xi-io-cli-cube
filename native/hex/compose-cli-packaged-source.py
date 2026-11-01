#!/usr/bin/env python3
"""Compose HEX cli-source packaged payload from an exact CLI tip. No new installer."""
from __future__ import annotations
import hashlib, json, pathlib, re, shutil, subprocess, sys

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

    files_meta = {}
    for rel in FILES:
        path = src / rel
        if not path.is_file() or path.is_symlink():
            raise SystemExit("MISSING_PAYLOAD_FILE:" + rel)
        data = path.read_bytes()
        files_meta[rel] = {"sha256": digest(data), "size": len(data)}
        dest = DEST / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

    # Preserve HEX --packaged-source transport adaptation; only refresh PAYLOAD_FILES.
    install_path = DEST / "install.mjs"
    if not install_path.is_file():
        raise SystemExit("HEX_INSTALL_ADAPTATION_MISSING")
    install_text = install_path.read_text()
    if "--packaged-source" not in install_text:
        raise SystemExit("HEX_PACKAGED_SOURCE_SEAM_MISSING")
    files_literal = "[" + ",".join("'" + f + "'" for f in FILES) + "]"
    install_text, n = re.subn(
        r"const PAYLOAD_FILES=Object\.freeze\(\[[^\]]+\]\);",
        f"const PAYLOAD_FILES=Object.freeze({files_literal});",
        install_text,
        count=1,
    )
    if n != 1:
        raise SystemExit("HEX_INSTALL_PAYLOAD_REWRITE_FAILED")
    install_path.write_text(install_text)
    installer = install_path.read_bytes()
    manifest = {
        "schema": "xiio.cli.packaged-source/v1",
        "source_sha": sha,
        "files": files_meta,
        "composed_by": "native/hex/compose-cli-packaged-source.py",
        "hard": ["COMPOSED != INSTALLED", "SOURCE_TIP != PRODUCTION_ACTIVATION"],
    }
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
    (DEST / "packaged-source.json").write_bytes(manifest_bytes)

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
    source_meta_path.write_text(json.dumps(source_meta, indent=2) + "\n")

    # Rewrite download-install-cli.py pins to this composed tip (candidate only).
    dl = HERE / "download-install-cli.py"
    text = dl.read_text()
    text = re.sub(r'SOURCE_SHA="[0-9a-f]{40}"', f'SOURCE_SHA="{sha}"', text, count=1)
    text = re.sub(r'INSTALLER_SHA="[0-9a-f]{64}"', f'INSTALLER_SHA="{digest(installer)}"', text, count=1)
    text = re.sub(r'MANIFEST_SHA="[0-9a-f]{64}"', f'MANIFEST_SHA="{digest(manifest_bytes)}"', text, count=1)
    files_literal = json.dumps(FILES)
    text = re.sub(r"FILES=\[[^\]]+\]", f"FILES={files_literal}", text, count=1)
    dl.write_text(text)

    receipt = {
        "schema": "xiio.hex.composed-packaged-source/v1",
        "state": "COMPOSED_NOT_ACTIVATED",
        "source_sha": sha,
        "manifest_sha256": digest(manifest_bytes),
        "installer_sha256": digest(installer),
        "payload_files": len(FILES),
        "destination": str(DEST),
        "production_baseline_sha": "89b9c418f6e161d9864bf891fd665b6a18f00dd2",
        "hard": ["COMPOSED != INSTALLED", "CANDIDATE != PRODUCTION"],
    }
    out = HERE / "COMPOSED-packaged-source.receipt.json"
    out.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
