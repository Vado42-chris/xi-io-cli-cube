from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from .observability import (
    ObservabilityError,
    inspect_operation,
    json_bytes,
    sha256_bytes,
    state_root,
    validate_internal_root,
)
from .redaction import redact

BUNDLE_SCHEMA_VERSION = "xiio-diagnostic-bundle-v1"


def _write_private_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb", closefd=True) as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def _reject_symlink_ancestry(path: Path) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise ObservabilityError("diagnostic bundle path symlink forbidden")
        parent = current.parent
        if parent == current:
            break
        current = parent


def evidence_status(*, env: dict[str, str] | None = None, root: Path | None = None) -> dict[str, Any]:
    base = state_root(env) if root is None else Path(root)
    validate_internal_root(base)

    def stats(directory: Path) -> tuple[int, int]:
        if not directory.exists():
            return 0, 0
        count = size = 0
        for path in directory.rglob("*"):
            if path.is_symlink():
                raise ObservabilityError("evidence symlink forbidden")
            if path.is_file():
                count += 1
                size += path.stat().st_size
        return count, size

    journal_files, journal_bytes = stats(base / "operations")
    diagnostic_files, diagnostic_bytes = stats(base / "diagnostics")
    total_bytes = journal_bytes + diagnostic_bytes
    warning_operation_count = 2000
    warning_total_bytes = 100 * 1024 * 1024
    return {
        "schema_version": "xiio-installer-evidence-status-v1",
        "operation_journal_files": journal_files,
        "operation_journal_bytes": journal_bytes,
        "diagnostic_files": diagnostic_files,
        "diagnostic_bytes": diagnostic_bytes,
        "total_bytes": total_bytes,
        "retention": {
            "automatic_deletion": False,
            "warning_operation_count": warning_operation_count,
            "warning_total_bytes": warning_total_bytes,
            "warning": journal_files > warning_operation_count or total_bytes > warning_total_bytes,
            "cleanup_authority": "NONE",
        },
    }


def diagnostic_bundle(
    operation_id: str, *, output_dir: Path | None = None,
    external_output_approved: bool = False,
    env: dict[str, str] | None = None, root: Path | None = None,
) -> dict[str, Any]:
    base = state_root(env) if root is None else Path(root)
    validate_internal_root(base)
    inspection = inspect_operation(operation_id, env=env, root=base)
    redacted_events = redact(inspection["events"], env)
    timeline = b"".join(json_bytes(event) for event in redacted_events)
    manifest = {
        "schema_version": BUNDLE_SCHEMA_VERSION,
        "operation_id": inspection["operation_id"],
        "correlation_id": inspection["correlation_id"],
        "component": inspection["component"],
        "operation": inspection["operation"],
        "component_version": inspection["events"][0].get("details", {}).get("kernel_version"),
        "final_state": inspection["final_state"],
        "incomplete": inspection["incomplete"],
        "event_count": inspection["event_count"],
        "event_chain_valid": inspection["event_chain_valid"],
        "started_at": inspection["started_at"],
        "finished_at": inspection["finished_at"],
        "source_journal_sha256": inspection["journal_sha256"],
        "timeline_sha256": sha256_bytes(timeline),
        "contents": ["manifest.json", "timeline.jsonl"],
        "redaction": {
            "secrets": True,
            "known_xdg_and_home_paths": True,
            "raw_environment_included": False,
            "prompt_or_conversation_bodies_included": False,
            "unrelated_files_included": False,
        },
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    if output_dir is None:
        destination = base / "diagnostics" / inspection["operation_id"]
    else:
        if not external_output_approved:
            raise ObservabilityError("external diagnostic bundle output requires explicit approval")
        destination = Path(output_dir)
        _reject_symlink_ancestry(destination)

    if destination.is_symlink():
        raise ObservabilityError("diagnostic bundle destination symlink forbidden")
    if destination.exists():
        if not destination.is_dir():
            raise ObservabilityError("diagnostic bundle destination is not a directory")
        manifest_path = destination / "manifest.json"
        timeline_path = destination / "timeline.jsonl"
        if manifest_path.is_symlink() or timeline_path.is_symlink():
            raise ObservabilityError("diagnostic bundle content symlink forbidden")
        if manifest_path.is_file() and timeline_path.is_file() and manifest_path.read_bytes() == manifest_bytes and timeline_path.read_bytes() == timeline:
            return {**manifest, "bundle_path": str(destination), "idempotent": True}
        raise ObservabilityError("diagnostic bundle destination already exists with different content")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = Path(tempfile.mkdtemp(prefix=f".{destination.name}.", dir=destination.parent))
    try:
        os.chmod(tmp, 0o700)
        _write_private_atomic(tmp / "manifest.json", manifest_bytes)
        _write_private_atomic(tmp / "timeline.jsonl", timeline)
        os.replace(tmp, destination)
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)
    return {**manifest, "bundle_path": str(destination), "idempotent": False}
