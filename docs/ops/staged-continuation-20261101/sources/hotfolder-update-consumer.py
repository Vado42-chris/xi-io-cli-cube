#!/usr/bin/env python3
"""HEX hotfolder consumer for staged CLI packaged-source updates.

Verifies exact payload before staging; preserves settings + last-known-good;
switches only at a safe checkpoint; never rolls custody data back with code.
Missing prior adapter → this seam implements consume/stage/verify only.
Activation remains user-authorized via existing install.mjs / adapter apply.
"""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, shutil, sys, tempfile, time

SCHEMA = "xiio.hex.hotfolder-update/v1"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def refuse(code: str, **extra):
    print(json.dumps({"schema": SCHEMA, "state": "REFUSED", "reason": code, **extra}, indent=2))
    return 2


def verify_packaged(root: pathlib.Path, expect_source_sha: str | None = None):
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError("HOTFOLDER_ROOT_UNSAFE")
    manifest_path = root / "packaged-source.json"
    installer = root / "install.mjs"
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise RuntimeError("MANIFEST_MISSING")
    if not installer.is_file() or installer.is_symlink():
        raise RuntimeError("INSTALLER_MISSING")
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get("schema") != "xiio.cli.packaged-source/v1":
        raise RuntimeError("MANIFEST_SCHEMA_INVALID")
    source_sha = manifest.get("source_sha")
    if not isinstance(source_sha, str) or not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise RuntimeError("SOURCE_SHA_INVALID")
    if expect_source_sha and source_sha != expect_source_sha:
        raise RuntimeError("SOURCE_SHA_MISMATCH")
    files = manifest.get("files") or {}
    if not isinstance(files, dict) or not files:
        raise RuntimeError("MANIFEST_FILES_EMPTY")
    for rel, meta in files.items():
        path = root / rel
        if path.is_symlink() or not path.is_file():
            raise RuntimeError("PAYLOAD_FILE_MISSING:" + rel)
        data = path.read_bytes()
        if len(data) != meta.get("size") or digest(data) != meta.get("sha256"):
            raise RuntimeError("PAYLOAD_HASH_MISMATCH:" + rel)
    return {
        "source_sha": source_sha,
        "manifest_sha256": digest(manifest_bytes),
        "installer_sha256": digest(installer.read_bytes()),
        "payload_files": len(files),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hotfolder", required=True, help="Incoming drop directory containing packaged-source tree or .partial")
    ap.add_argument("--stage-dir", required=True, help="Verified stage directory (not live prefix)")
    ap.add_argument("--lkg-pointer", required=True, help="File recording last-known-good stage path + hashes")
    ap.add_argument("--expect-source-sha")
    ap.add_argument("--consume", action="store_true")
    a = ap.parse_args()

    hot = pathlib.Path(a.hotfolder)
    stage = pathlib.Path(a.stage_dir)
    lkg = pathlib.Path(a.lkg_pointer)

    if not hot.exists():
        return refuse("HOTFOLDER_ABSENT", path=str(hot))

    # Incomplete / tampered markers
    if (hot / ".partial").exists() or (hot / "INCOMPLETE").exists():
        return refuse("INCOMPLETE_PAYLOAD", path=str(hot))

    try:
        verified = verify_packaged(hot, a.expect_source_sha)
    except Exception as error:
        return refuse("VERIFY_FAILED", detail=str(error)[:500])

    if not a.consume:
        print(json.dumps({"schema": SCHEMA, "state": "VERIFIED_NOT_STAGED", **verified, "hotfolder": str(hot)}, indent=2))
        return 0

    # Preserve LKG pointer before switching stage
    previous = None
    if lkg.exists() and lkg.is_file() and not lkg.is_symlink():
        try:
            previous = json.loads(lkg.read_text())
        except Exception:
            previous = {"state": "LKG_UNREADABLE_PRESERVE"}

    stage.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix=".hotfolder-stage-", dir=str(stage.parent)))
    try:
        shutil.copytree(hot, tmp / "tree", symlinks=False, dirs_exist_ok=False)
        recheck = verify_packaged(tmp / "tree", verified["source_sha"])
        if recheck != verified:
            raise RuntimeError("STAGE_RECHECK_MISMATCH")
        if stage.exists():
            # Keep prior stage as sibling LKG copy; do not delete custody.
            backup = stage.parent / (stage.name + ".lkg-" + time.strftime("%Y%m%dT%H%M%SZ"))
            if stage.is_dir():
                stage.rename(backup)
            else:
                raise RuntimeError("STAGE_PATH_NOT_DIRECTORY")
        (tmp / "tree").rename(stage)
    except Exception as error:
        shutil.rmtree(tmp, ignore_errors=True)
        return refuse("STAGE_FAILED", detail=str(error)[:500], previous_lkg=previous)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    pointer = {
        "schema": "xiio.hex.lkg-pointer/v1",
        "state": "STAGED_NOT_ACTIVATED",
        "stage_dir": str(stage),
        "verified": verified,
        "previous": previous,
        "settings_preserved": True,
        "custody_not_rolled_with_code": True,
        "activation": "USER_EXISTING_UPDATE_AUTHORIZATION",
        "written_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "hard": ["STAGED != ACTIVATED", "LKG_PRESERVED", "CUSTODY != EXECUTABLE_ROLLBACK"],
    }
    lkg.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp_lkg = lkg.with_suffix(lkg.suffix + ".tmp")
    tmp_lkg.write_text(json.dumps(pointer, indent=2) + "\n")
    os.replace(tmp_lkg, lkg)
    print(json.dumps({"schema": SCHEMA, "state": "STAGED_NOT_ACTIVATED", **verified, "stage_dir": str(stage), "lkg_pointer": str(lkg)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
