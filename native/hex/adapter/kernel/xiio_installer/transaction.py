from __future__ import annotations

import json
import os
import re
import shutil
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from .discovery import xdg_roots
from .manifest import ProductManifest, SHA256_RE, sha256_file, verify_payload


class TransactionError(RuntimeError):
    pass


@dataclass(frozen=True)
class PlanItem:
    source: str
    destination_scope: str
    destination: str
    action: str
    expected_sha256: str
    existing_sha256: str | None
    expected_mode: int
    existing_mode: int | None
    overwrite: str


def _dest_path(scope: str, rel: str, roots: dict[str, Path]) -> Path:
    if scope not in roots:
        raise TransactionError(f"unknown destination scope: {scope}")
    root = roots[scope].resolve()
    candidate = root / rel
    parent = candidate.parent.resolve(strict=False)
    if root != parent and root not in parent.parents:
        raise TransactionError(f"destination escapes scope: {scope}:{rel}")
    return candidate


def _backup_path(backup_root: Path, backup: str) -> Path:
    if not re.fullmatch(r"\d{4}\.bak", backup):
        raise TransactionError(f"invalid rollback backup reference: {backup}")
    candidate = backup_root / backup
    if candidate.is_symlink():
        raise TransactionError(f"rollback backup symlink forbidden: {backup}")
    return candidate


def _missing_parent_dirs(parent: Path, stop: Path) -> list[str]:
    root = stop.resolve()
    current = parent
    missing: list[str] = []
    while current != root and root in current.resolve(strict=False).parents:
        if not current.exists():
            missing.append(current.relative_to(root).as_posix())
        current = current.parent
    return missing


def _created_dir_path(scope: str, rel: str, roots: dict[str, Path]) -> Path:
    p = PurePosixPath(rel)
    if p.is_absolute() or not p.parts or ".." in p.parts:
        raise TransactionError(f"invalid created-directory custody path: {scope}:{rel}")
    root = roots[scope].resolve()
    candidate = root / str(p)
    resolved = candidate.resolve(strict=False)
    if root != resolved and root not in resolved.parents:
        raise TransactionError(f"created-directory custody escapes scope: {scope}:{rel}")
    return candidate


def _cleanup_created_dirs(scope: str, created_dirs: list[str], roots: dict[str, Path]) -> None:
    for rel in sorted(created_dirs, key=lambda value: len(PurePosixPath(value).parts), reverse=True):
        path = _created_dir_path(scope, rel, roots)
        try:
            path.rmdir()
        except OSError:
            continue


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def plan_install(manifest: ProductManifest, payload_root: Path, env: dict[str, str] | None = None) -> list[PlanItem]:
    verify_payload(manifest, payload_root)
    roots = xdg_roots(env)
    plan: list[PlanItem] = []
    for entry in manifest.entries:
        dest = _dest_path(entry.destination_scope, entry.destination, roots)
        if dest.is_symlink():
            raise TransactionError(f"destination symlink forbidden: {entry.destination_scope}:{entry.destination}")
        if dest.exists() and not dest.is_file():
            raise TransactionError(f"destination is not a regular file: {entry.destination_scope}:{entry.destination}")
        existing = sha256_file(dest) if dest.is_file() else None
        existing_mode = _mode(dest) if dest.is_file() else None
        exact_state = existing == entry.sha256 and existing_mode == entry.mode
        if exact_state:
            action = "noop_same_hash"
        elif dest.exists():
            if entry.overwrite == "fail" or entry.overwrite == "same_hash_ok":
                raise TransactionError(f"destination exists with different content or mode: {entry.destination_scope}:{entry.destination}")
            action = "backup_replace"
        else:
            action = "create"
        plan.append(
            PlanItem(
                entry.source,
                entry.destination_scope,
                entry.destination,
                action,
                entry.sha256,
                existing,
                entry.mode,
                existing_mode,
                entry.overwrite,
            )
        )
    return plan


def apply_install(
    manifest: ProductManifest,
    payload_root: Path,
    receipt_path: Path,
    env: dict[str, str] | None = None,
    inject_failure_after: int | None = None,
) -> dict[str, Any]:
    plan = plan_install(manifest, payload_root, env)
    roots = xdg_roots(env)
    if receipt_path.is_symlink():
        raise TransactionError("receipt path symlink forbidden")
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    backup_root = receipt_path.parent / (receipt_path.stem + ".rollback")
    if backup_root.is_symlink():
        raise TransactionError("rollback custody path symlink forbidden")
    if receipt_path.exists():
        raise TransactionError("receipt path already exists")
    if backup_root.exists() and not backup_root.is_dir():
        raise TransactionError("rollback custody path is not a directory")
    if backup_root.exists() and any(backup_root.iterdir()):
        raise TransactionError("rollback custody path is not empty")
    backup_root.mkdir(parents=True, exist_ok=True)
    completed: list[dict[str, Any]] = []
    receipt_tmp: Path | None = None
    try:
        for index, item in enumerate(plan):
            if item.action == "noop_same_hash":
                completed.append(
                    {
                        **item.__dict__,
                        "backup": None,
                        "installed_sha256": item.expected_sha256,
                        "installed_mode": item.expected_mode,
                        "created_dirs": [],
                        "write_committed": False,
                    }
                )
                continue
            src = payload_root.resolve() / item.source
            dest = _dest_path(item.destination_scope, item.destination, roots)
            created_dirs = _missing_parent_dirs(dest.parent, roots[item.destination_scope])
            current: dict[str, Any] = {
                **item.__dict__,
                "backup": None,
                "installed_sha256": None,
                "installed_mode": None,
                "created_dirs": created_dirs,
                "write_committed": False,
            }
            completed.append(current)
            dest.parent.mkdir(parents=True, exist_ok=True)
            if item.action == "backup_replace":
                backup_rel = f"{index:04d}.bak"
                current["backup"] = backup_rel
                backup = backup_root / backup_rel
                shutil.copy2(dest, backup)
                if backup.is_symlink() or not backup.is_file():
                    raise TransactionError(f"backup custody invalid: {item.destination_scope}:{item.destination}")
                if item.existing_sha256 is None or sha256_file(backup) != item.existing_sha256:
                    raise TransactionError(f"backup custody digest mismatch: {item.destination_scope}:{item.destination}")
                if item.existing_mode is None or _mode(backup) != item.existing_mode:
                    raise TransactionError(f"backup custody mode mismatch: {item.destination_scope}:{item.destination}")
            fd, tmp_name = tempfile.mkstemp(prefix=".xiio-install-", dir=dest.parent)
            os.close(fd)
            tmp = Path(tmp_name)
            try:
                shutil.copyfile(src, tmp)
                os.chmod(tmp, item.expected_mode)
                os.replace(tmp, dest)
                current["write_committed"] = True
            finally:
                if tmp.exists():
                    tmp.unlink()
            installed = sha256_file(dest)
            installed_mode = _mode(dest)
            current["installed_sha256"] = installed
            current["installed_mode"] = installed_mode
            if installed != item.expected_sha256:
                raise TransactionError(f"post-write digest mismatch: {item.destination_scope}:{item.destination}")
            if installed_mode != item.expected_mode:
                raise TransactionError(f"post-write mode mismatch: {item.destination_scope}:{item.destination}")
            if inject_failure_after is not None and len(completed) >= inject_failure_after:
                raise TransactionError("injected failure")

        receipt = {
            "schema_version": "xiio-installer-receipt-v1",
            "product_id": manifest.product_id,
            "profile_id": manifest.profile_id,
            "version": manifest.version,
            "channel": manifest.channel,
            "fixture": manifest.fixture,
            "entries": completed,
            "absolute_paths_redacted": True,
        }
        fd, tmp_name = tempfile.mkstemp(prefix=f".{receipt_path.name}.", suffix=".tmp", dir=receipt_path.parent)
        os.close(fd)
        receipt_tmp = Path(tmp_name)
        receipt_tmp.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(receipt_tmp, receipt_path)
        receipt_tmp = None
        if not any(backup_root.iterdir()):
            backup_root.rmdir()
        return receipt
    except Exception:
        try:
            _rollback_completed(completed, backup_root, roots, strict_drift=False, preflight=False)
        except Exception as rollback_exc:
            raise TransactionError(f"install failed and automatic rollback also failed: {rollback_exc}") from rollback_exc
        finally:
            if receipt_tmp is not None and receipt_tmp.exists():
                receipt_tmp.unlink()
            if receipt_path.exists():
                receipt_path.unlink()
        if backup_root.exists():
            shutil.rmtree(backup_root)
        raise


def _validate_created_dirs(item: dict[str, Any], roots: dict[str, Path]) -> list[str]:
    scope = item["destination_scope"]
    created_dirs = item.get("created_dirs")
    if not isinstance(created_dirs, list) or not all(isinstance(value, str) for value in created_dirs):
        raise TransactionError(f"rollback created-directory custody invalid: {scope}:{item['destination']}")
    for rel in created_dirs:
        _created_dir_path(scope, rel, roots)
    return created_dirs


def _preflight_rollback(entries: list[dict[str, Any]], backup_root: Path, roots: dict[str, Path], strict_drift: bool) -> None:
    seen_destinations: set[tuple[str, str]] = set()
    for item in entries:
        scope = item.get("destination_scope")
        destination = item.get("destination")
        if not isinstance(scope, str) or not isinstance(destination, str):
            raise TransactionError("rollback receipt contains invalid destination identity")
        key = (scope, destination)
        if key in seen_destinations:
            raise TransactionError(f"duplicate rollback destination: {scope}:{destination}")
        seen_destinations.add(key)
        dest = _dest_path(scope, destination, roots)
        action = item.get("action")
        if action == "noop_same_hash":
            continue
        if action not in {"create", "backup_replace"}:
            raise TransactionError(f"rollback receipt contains unsupported action: {action}")
        if item.get("write_committed") is not True:
            raise TransactionError(f"rollback receipt contains uncommitted mutation: {scope}:{destination}")
        _validate_created_dirs(item, roots)
        installed_sha = item.get("installed_sha256")
        installed_mode = item.get("installed_mode")
        if strict_drift:
            if not isinstance(installed_sha, str) or not SHA256_RE.fullmatch(installed_sha):
                raise TransactionError(f"rollback receipt missing installed digest: {scope}:{destination}")
            if not isinstance(installed_mode, int) or installed_mode < 0 or installed_mode > 0o777:
                raise TransactionError(f"rollback receipt missing installed mode: {scope}:{destination}")
            if dest.is_symlink() or not dest.is_file() or sha256_file(dest) != installed_sha or _mode(dest) != installed_mode:
                raise TransactionError(f"rollback refused due to drift: {scope}:{destination}")
        backup_ref = item.get("backup")
        if action == "backup_replace":
            if not isinstance(backup_ref, str):
                raise TransactionError(f"rollback backup reference missing: {scope}:{destination}")
            backup = _backup_path(backup_root, backup_ref)
            existing_sha = item.get("existing_sha256")
            existing_mode = item.get("existing_mode")
            if not isinstance(existing_sha, str) or not SHA256_RE.fullmatch(existing_sha):
                raise TransactionError(f"rollback original digest missing: {scope}:{destination}")
            if not isinstance(existing_mode, int) or existing_mode < 0 or existing_mode > 0o777:
                raise TransactionError(f"rollback original mode missing: {scope}:{destination}")
            if not backup.is_file() or sha256_file(backup) != existing_sha or _mode(backup) != existing_mode:
                raise TransactionError(f"rollback backup custody mismatch: {scope}:{destination}")
        elif backup_ref is not None:
            raise TransactionError(f"unexpected rollback backup for create action: {scope}:{destination}")


def _rollback_completed(
    entries: list[dict[str, Any]],
    backup_root: Path,
    roots: dict[str, Path],
    strict_drift: bool,
    preflight: bool = True,
) -> None:
    if preflight:
        _preflight_rollback(entries, backup_root, roots, strict_drift)
    for item in reversed(entries):
        if item["action"] == "noop_same_hash":
            continue
        scope = item["destination_scope"]
        dest = _dest_path(scope, item["destination"], roots)
        created_dirs = item.get("created_dirs") if isinstance(item.get("created_dirs"), list) else []
        if item.get("write_committed") is True:
            backup_ref = item.get("backup")
            if backup_ref:
                backup = _backup_path(backup_root, backup_ref)
                fd, tmp_name = tempfile.mkstemp(prefix=".xiio-rollback-", dir=dest.parent)
                os.close(fd)
                tmp = Path(tmp_name)
                try:
                    shutil.copy2(backup, tmp)
                    os.replace(tmp, dest)
                finally:
                    if tmp.exists():
                        tmp.unlink()
            elif dest.exists():
                dest.unlink()
        _cleanup_created_dirs(scope, created_dirs, roots)


def _verify_rolled_back(entries: list[dict[str, Any]], roots: dict[str, Path]) -> None:
    for item in entries:
        action = item.get("action")
        if action == "noop_same_hash":
            continue
        scope = item["destination_scope"]
        destination = item["destination"]
        dest = _dest_path(scope, destination, roots)
        if action == "create":
            if dest.exists() or dest.is_symlink():
                raise TransactionError(f"rollback verification failed; created file remains: {scope}:{destination}")
            continue
        existing_sha = item.get("existing_sha256")
        existing_mode = item.get("existing_mode")
        if (
            not dest.is_file()
            or dest.is_symlink()
            or not isinstance(existing_sha, str)
            or sha256_file(dest) != existing_sha
            or not isinstance(existing_mode, int)
            or _mode(dest) != existing_mode
        ):
            raise TransactionError(f"rollback verification failed: {scope}:{destination}")


def rollback(receipt_path: Path, env: dict[str, str] | None = None) -> None:
    if receipt_path.is_symlink():
        raise TransactionError("receipt path symlink forbidden")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("schema_version") != "xiio-installer-receipt-v1":
        raise TransactionError("unsupported receipt schema")
    entries = receipt.get("entries")
    if not isinstance(entries, list):
        raise TransactionError("rollback receipt entries invalid")
    roots = xdg_roots(env)
    backup_root = receipt_path.parent / (receipt_path.stem + ".rollback")
    if backup_root.is_symlink():
        raise TransactionError("rollback custody path symlink forbidden")
    if backup_root.exists() and not backup_root.is_dir():
        raise TransactionError("rollback custody path is not a directory")
    _rollback_completed(entries, backup_root, roots, strict_drift=True)
    _verify_rolled_back(entries, roots)
