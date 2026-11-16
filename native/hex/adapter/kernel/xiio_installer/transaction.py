from __future__ import annotations

import json
import os
import platform
import re
import shutil
import stat
import subprocess
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



def _probe_filesystem(parent: Path, modes: set[int]) -> None:
    """Apply-only, non-secret probe; not a claim of crash/power-loss durability."""
    with tempfile.TemporaryDirectory(prefix=".xiio-fs-probe-", dir=parent) as name:
        probe = Path(name)
        if _mode(probe) != 0o700 or probe.stat().st_uid != os.getuid():
            raise TransactionError("filesystem preflight: private directory mode/owner unsupported")
        first, second = probe / "first", probe / "second"
        fd = os.open(first, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(b"xiio-filesystem-probe\n")
            stream.flush()
            os.fsync(stream.fileno())
        if _mode(first) != 0o600:
            raise TransactionError("filesystem preflight: private file mode unsupported")
        for mode in sorted(modes | {0o600}):
            os.chmod(first, mode)
            if _mode(first) != mode:
                raise TransactionError(f"filesystem preflight: required file mode {mode:04o} unsupported")
        os.chmod(first, 0o600)
        # An NTFS/FUSE/noexec mount can report 0755 but still refuse exec.
        # Probe the real destination filesystem before copying any payload bytes.
        if any(mode & 0o111 for mode in modes):
            executable = probe / "execute"
            fd = os.open(executable, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o700)
            with os.fdopen(fd, "wb") as stream:
                stream.write(b"#!/bin/sh\nexit 0\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(executable, 0o700)
            if _mode(executable) != 0o700:
                raise TransactionError("filesystem preflight: executable mode unsupported")
            try:
                result = subprocess.run(
                    [str(executable)], capture_output=True, timeout=3, check=False,
                )
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise TransactionError("filesystem preflight: direct executable launch unsupported") from exc
            if result.returncode != 0:
                raise TransactionError("filesystem preflight: direct executable launch failed")
        # Exercise replacement as well as creation, with only disposable probe bytes.
        second.write_bytes(b"replace-me")
        os.replace(first, second)
        if first.exists() or _mode(second) != 0o600 or second.read_bytes() != b"xiio-filesystem-probe\n":
            raise TransactionError("filesystem preflight: rename/readback failed")


def _preflight_explicit_targets(targets: dict[Path, set[int]]) -> None:
    """The existing destination-local, disposable mode/exec/rename probe.

    One implementation is used both before command dispatch and inside the
    installer transaction; probing is an observation, never effect authority.
    """
    created: list[Path] = []
    try:
        for parent, modes in targets.items():
            missing = []
            current = parent
            while not current.exists():
                if current.is_symlink():
                    raise TransactionError("filesystem preflight: dangling directory symlink")
                missing.append(current)
                current = current.parent
            if not current.is_dir():
                raise TransactionError("filesystem preflight: parent is not a directory")
            for directory in reversed(missing):
                directory.mkdir(mode=0o700)
                created.append(directory)
            _probe_filesystem(parent, modes)
    finally:
        # rmdir cannot delete an unexpected file written by another process.
        # A cleanup failure is surfaced, never silently reported as clean.
        for directory in reversed(created):
            directory.rmdir()


def qualify_precommand_targets(
    targets: dict[Path, set[int]],
    *,
    machine_profile: dict[str, str] | None,
) -> dict[str, Any]:
    """Refuse unsupported filesystems before invoking an external installer.

    A local observed machine profile is sufficient, account login is not
    required. The caller must bind every destination it will write, including
    executable launchers, receipts and backup areas. No command is generated.
    """
    if not isinstance(machine_profile, dict) or (
        machine_profile.get("os") != platform.system()
        or machine_profile.get("architecture") != platform.machine()
        or machine_profile.get("family") != "linux"
    ):
        raise TransactionError("filesystem preflight: current machine profile required")
    if not isinstance(targets, dict) or not targets:
        raise TransactionError("filesystem preflight: explicit targets required")
    qualified: dict[Path, set[int]] = {}
    for location, modes in targets.items():
        if not isinstance(location, Path) or not location.is_absolute():
            raise TransactionError("filesystem preflight: absolute target required")
        if location == Path("/") or any(p.is_symlink() for p in (location, *location.parents)):
            raise TransactionError("filesystem preflight: untrusted target directory")
        if not isinstance(modes, set) or not modes or any(
            not isinstance(mode, int) or isinstance(mode, bool) or not 0 < mode <= 0o777
            for mode in modes
        ):
            raise TransactionError("filesystem preflight: required modes unknown")
        qualified[location] = set(modes)
    _preflight_explicit_targets(qualified)
    return {
        "schema": "xiio.installer.precommand-filesystem-qualification/v1",
        "state": "QUALIFIED_FOR_BOUNDED_LOCAL_APPLY",
        "machine_family": "linux",
        "checked_target_count": len(qualified),
        "required_modes": sorted({mode for modes in qualified.values() for mode in modes}),
        "command_generated": False,
        "account_login_required": False,
        "effect_authority": False,
    }


def qualify_precommand_manifests(
    manifests: list[tuple[ProductManifest, Path]],
    roots: dict[str, Path],
    *,
    machine_profile: dict[str, str] | None,
    additional_targets: dict[Path, set[int]] | None = None,
) -> dict[str, Any]:
    """Prequalify *every* destination before even downloading child payloads.

    Reads only manifest identities/modes from the already verified lock. The
    caller rechecks payload and exact transaction plan after staging.
    """
    if not isinstance(manifests, list) or not manifests:
        raise TransactionError("filesystem preflight: bounded manifests required")
    targets: dict[Path, set[int]] = {}
    for manifest, receipt in manifests:
        if not isinstance(receipt, Path) or not receipt.is_absolute() or not hasattr(manifest, "entries"):
            raise TransactionError("filesystem preflight: manifest or receipt target unknown")
        backup = receipt.parent / (receipt.stem + ".rollback")
        targets.setdefault(receipt.parent, set()).add(0o600)
        targets.setdefault(backup, set()).add(0o600)
        for entry in manifest.entries:
            parent = _dest_path(entry.destination_scope, entry.destination, roots).parent
            targets.setdefault(parent, set()).add(entry.mode)
    if additional_targets is not None:
        if not isinstance(additional_targets, dict):
            raise TransactionError("filesystem preflight: additional targets invalid")
        for location, modes in additional_targets.items():
            if not isinstance(modes, set):
                raise TransactionError("filesystem preflight: additional modes invalid")
            targets.setdefault(location, set()).update(modes)
    return qualify_precommand_targets(targets, machine_profile=machine_profile)


def qualify_precommand_install_plans(
    plans: list[tuple[list[PlanItem], dict[str, Path], Path]],
    *,
    machine_profile: dict[str, str] | None,
    additional_targets: dict[Path, set[int]] | None = None,
) -> dict[str, Any]:
    """Qualify all installer and external-launcher destinations before any apply.

    Bundles must call once for all children before applying the first child.
    Every parent must come from a validated Installer plan or explicit approved
    launcher destination, never inferred from the current working directory.
    """
    if not isinstance(plans, list) or not plans:
        raise TransactionError("filesystem preflight: install plans required")
    targets: dict[Path, set[int]] = {}
    for plan, roots, receipt in plans:
        if not isinstance(plan, list) or not isinstance(roots, dict) or not isinstance(receipt, Path):
            raise TransactionError("filesystem preflight: install plan invalid")
        if not receipt.is_absolute():
            raise TransactionError("filesystem preflight: receipt target unbound")
        backup = receipt.parent / (receipt.stem + ".rollback")
        targets.setdefault(receipt.parent, set()).add(0o600)
        targets.setdefault(backup, set()).add(0o600)
        for item in plan:
            if not isinstance(item, PlanItem):
                raise TransactionError("filesystem preflight: unknown install plan item")
            # Even an unchanged executable can be on NTFS/noexec: do not
            # certify a pre-command bundle that skips its target filesystem.
            if item.action != "noop_same_hash" or item.expected_mode & 0o111:
                parent = _dest_path(item.destination_scope, item.destination, roots).parent
                targets.setdefault(parent, set()).add(item.expected_mode)
            if item.action == "backup_replace" and item.existing_mode is not None:
                targets[backup].add(item.existing_mode)
    if additional_targets is not None:
        if not isinstance(additional_targets, dict):
            raise TransactionError("filesystem preflight: additional targets invalid")
        for location, modes in additional_targets.items():
            if not isinstance(modes, set):
                raise TransactionError("filesystem preflight: additional modes invalid")
            targets.setdefault(location, set()).update(modes)
    return qualify_precommand_targets(targets, machine_profile=machine_profile)


def _preflight_filesystems(plan: list[PlanItem], roots: dict[str, Path], receipt_parent: Path, backup_root: Path) -> None:
    """Qualify actual target parents before payload or backup contents are written.

    Missing directories are temporary preparation, tracked and removed on both
    success and failure. Existing directories are never chmodded. Probes are
    placed in the explicit destination/receipt locations, not a different /tmp
    filesystem or a nearest ancestor outside the chosen scope.
    """
    targets: dict[Path, set[int]] = {receipt_parent: {0o600}, backup_root: {0o600}}
    for item in plan:
        # An existing byte-identical executable may still sit on NTFS/noexec.
        # No-op installation does not imply that the installed binary can run.
        if item.action != "noop_same_hash" or item.expected_mode & 0o111:
            parent = _dest_path(item.destination_scope, item.destination, roots).parent
            targets.setdefault(parent, set()).add(item.expected_mode)
        if item.action == "backup_replace" and item.existing_mode is not None:
            targets[backup_root].add(item.existing_mode)
    _preflight_explicit_targets(targets)


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
    backup_root = receipt_path.parent / (receipt_path.stem + ".rollback")
    if backup_root.is_symlink():
        raise TransactionError("rollback custody path symlink forbidden")
    if receipt_path.exists():
        raise TransactionError("receipt path already exists")
    if backup_root.exists() and not backup_root.is_dir():
        raise TransactionError("rollback custody path is not a directory")
    if backup_root.exists() and any(backup_root.iterdir()):
        raise TransactionError("rollback custody path is not empty")
    if backup_root.exists() and (_mode(backup_root) != 0o700 or backup_root.stat().st_uid != os.getuid()):
        raise TransactionError("rollback custody requires private owner-only directory")
    _preflight_filesystems(plan, roots, receipt_path.parent, backup_root)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    backup_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if _mode(backup_root) != 0o700 or backup_root.stat().st_uid != os.getuid():
        raise TransactionError("rollback custody requires private owner-only directory")
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
