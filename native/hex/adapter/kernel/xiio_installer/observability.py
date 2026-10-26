from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .discovery import xdg_roots
from .redaction import redact, redact_text

SCHEMA_VERSION = "xiio-operation-event-v1"
OUTCOMES = {
    "started", "passed", "failed", "blocked", "cancelled",
    "skipped_with_reason", "timed_out", "rolled_back", "degraded", "unknown",
}
TERMINAL_OUTCOMES = OUTCOMES - {"started"}
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class ObservabilityError(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _validated_id(value: str, label: str) -> str:
    if not isinstance(value, str) or not _ID_RE.fullmatch(value):
        raise ObservabilityError(f"invalid {label}")
    return value


def new_id(prefix: str) -> str:
    _validated_id(prefix, "id prefix")
    return f"{prefix}-{uuid.uuid4().hex}"


def state_root(env: dict[str, str] | None = None) -> Path:
    return xdg_roots(env)["xdg_state"] / "xi-io" / "installer"


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _append_private(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        os.fchmod(fd, 0o600)
        view = memoryview(data)
        total = 0
        while total < len(data):
            total += os.write(fd, view[total:])
        os.fsync(fd)
    finally:
        os.close(fd)


def _read_events(path: Path) -> list[dict[str, Any]]:
    if path.is_symlink():
        raise ObservabilityError("journal symlink forbidden")
    if not path.is_file():
        raise ObservabilityError("operation journal not found")
    events: list[dict[str, Any]] = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            item = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ObservabilityError(f"malformed journal line {line_no}") from exc
        if not isinstance(item, dict):
            raise ObservabilityError(f"invalid journal event at line {line_no}")
        events.append(item)
    if not events:
        raise ObservabilityError("operation journal is empty")
    return events


def _validate_events(events: list[dict[str, Any]], operation_id: str | None = None) -> None:
    first_operation = operation_id
    first_correlation: str | None = None
    terminal_seen = False
    previous_hash: str | None = None
    for sequence, event in enumerate(events, start=1):
        if event.get("schema_version") != SCHEMA_VERSION:
            raise ObservabilityError("unsupported operation event schema")
        current_operation = event.get("operation_id")
        current_correlation = event.get("correlation_id")
        if first_operation is None:
            first_operation = current_operation
        if first_correlation is None:
            first_correlation = current_correlation
        if current_operation != first_operation or current_correlation != first_correlation:
            raise ObservabilityError("journal identity drift")
        if event.get("sequence") != sequence:
            raise ObservabilityError("journal sequence drift")
        outcome = event.get("outcome")
        if outcome not in OUTCOMES:
            raise ObservabilityError("journal outcome invalid")
        if event.get("previous_event_sha256") != previous_hash:
            raise ObservabilityError("journal hash-chain drift")
        claimed_hash = event.get("event_sha256")
        if not isinstance(claimed_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", claimed_hash):
            raise ObservabilityError("journal event hash invalid")
        hash_input = dict(event)
        hash_input.pop("event_sha256", None)
        if sha256_bytes(json_bytes(hash_input)) != claimed_hash:
            raise ObservabilityError("journal event digest mismatch")
        if terminal_seen:
            raise ObservabilityError("event present after terminal outcome")
        terminal_seen = outcome in TERMINAL_OUTCOMES
        previous_hash = claimed_hash


def _reject_internal_symlink(path: Path, label: str) -> None:
    if path.is_symlink():
        raise ObservabilityError(f"{label} symlink forbidden")
    if path.exists() and not path.is_dir():
        raise ObservabilityError(f"{label} is not a directory")


def validate_internal_root(root: Path) -> None:
    _reject_internal_symlink(root.parent, "xi-io state root")
    _reject_internal_symlink(root, "installer state root")
    _reject_internal_symlink(root / "operations", "operations journal root")
    _reject_internal_symlink(root / "diagnostics", "diagnostics root")


class OperationJournal:
    def __init__(
        self, component: str, operation: str, *, operation_id: str | None = None,
        correlation_id: str | None = None, env: dict[str, str] | None = None,
        root: Path | None = None,
    ) -> None:
        self.env = dict(os.environ if env is None else env)
        self.root = state_root(self.env) if root is None else Path(root)
        validate_internal_root(self.root)
        self.component = _validated_id(component, "component")
        self.operation = _validated_id(operation, "operation")
        self.operation_id = _validated_id(operation_id or new_id("op"), "operation id")
        self.correlation_id = _validated_id(correlation_id or new_id("corr"), "correlation id")
        self.path = self.root / "operations" / f"{self.operation_id}.jsonl"
        self.sequence = 0
        self.terminal = False
        self.previous_event_sha256: str | None = None
        if self.path.exists() or self.path.is_symlink():
            events = _read_events(self.path)
            _validate_events(events, self.operation_id)
            first = events[0]
            if first.get("correlation_id") != self.correlation_id:
                raise ObservabilityError("operation correlation collision")
            if first.get("component") != self.component or first.get("operation") != self.operation:
                raise ObservabilityError("operation identity collision")
            self.sequence = int(events[-1]["sequence"])
            self.terminal = events[-1]["outcome"] in TERMINAL_OUTCOMES
            self.previous_event_sha256 = events[-1]["event_sha256"]

    def emit(
        self, outcome: str, *, expected_action: str, observed_result: str,
        actor_kind: str = "local_process", tool: str = "xi-io-installer",
        exit_code: int | None = None, failure_category: str | None = None,
        changed_resources: list[dict[str, Any]] | None = None,
        rollback_eligible: bool | None = None, rollback_result: str | None = None,
        recommended_next_action: str | None = None, details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if outcome not in OUTCOMES:
            raise ObservabilityError("unsupported operation outcome")
        if self.terminal:
            raise ObservabilityError("operation already has terminal outcome")
        if self.sequence and outcome == "started":
            raise ObservabilityError("duplicate started event")
        if not self.sequence and outcome != "started":
            raise ObservabilityError("first event must be started")
        event = {
            "schema_version": SCHEMA_VERSION,
            "event_id": new_id("evt"),
            "operation_id": self.operation_id,
            "correlation_id": self.correlation_id,
            "sequence": self.sequence + 1,
            "component": self.component,
            "operation": self.operation,
            "outcome": outcome,
            "observed_at": _now(),
            "actor_kind": _validated_id(actor_kind, "actor kind"),
            "tool": redact_text(tool, self.env, limit=256),
            "expected_action": redact_text(expected_action, self.env),
            "observed_result": redact_text(observed_result, self.env),
            "exit_code": exit_code,
            "failure_category": redact_text(failure_category, self.env, limit=256) if failure_category else None,
            "changed_resources": redact(changed_resources or [], self.env),
            "rollback_eligible": rollback_eligible,
            "rollback_result": redact_text(rollback_result, self.env, limit=512) if rollback_result else None,
            "recommended_next_action": redact_text(recommended_next_action, self.env) if recommended_next_action else None,
            "details": redact(details or {}, self.env),
            "redaction": {"secrets": True, "known_xdg_and_home_paths": True, "max_text_chars": 2048},
            "previous_event_sha256": self.previous_event_sha256,
        }
        event["event_sha256"] = sha256_bytes(json_bytes(event))
        _append_private(self.path, json_bytes(event))
        self.sequence += 1
        self.previous_event_sha256 = event["event_sha256"]
        self.terminal = outcome in TERMINAL_OUTCOMES
        return event

    def start(self, expected_action: str, **kwargs: Any) -> dict[str, Any]:
        return self.emit("started", expected_action=expected_action, observed_result="operation started", **kwargs)

    def finish(self, outcome: str, observed_result: str, *, expected_action: str, **kwargs: Any) -> dict[str, Any]:
        if outcome == "started":
            raise ObservabilityError("finish requires terminal outcome")
        return self.emit(outcome, expected_action=expected_action, observed_result=observed_result, **kwargs)


def inspect_operation(operation_id: str, *, env: dict[str, str] | None = None, root: Path | None = None) -> dict[str, Any]:
    op_id = _validated_id(operation_id, "operation id")
    base = state_root(env) if root is None else Path(root)
    validate_internal_root(base)
    path = base / "operations" / f"{op_id}.jsonl"
    events = _read_events(path)
    _validate_events(events, op_id)
    first, last = events[0], events[-1]
    incomplete = last["outcome"] not in TERMINAL_OUTCOMES
    return {
        "schema_version": "xiio-operation-inspection-v1",
        "operation_id": op_id,
        "correlation_id": first["correlation_id"],
        "component": first["component"],
        "operation": first["operation"],
        "final_state": "unknown" if incomplete else last["outcome"],
        "incomplete": incomplete,
        "event_count": len(events),
        "journal_sha256": sha256_bytes(path.read_bytes()),
        "event_chain_valid": True,
        "started_at": first["observed_at"],
        "finished_at": None if incomplete else last["observed_at"],
        "events": events,
    }


def list_operations(*, env: dict[str, str] | None = None, root: Path | None = None) -> list[dict[str, Any]]:
    base = state_root(env) if root is None else Path(root)
    validate_internal_root(base)
    operations_dir = base / "operations"
    if not operations_dir.exists():
        return []
    if operations_dir.is_symlink() or not operations_dir.is_dir():
        raise ObservabilityError("operations journal root invalid")
    results: list[dict[str, Any]] = []
    for path in sorted(operations_dir.glob("*.jsonl")):
        try:
            if path.is_symlink():
                raise ObservabilityError("journal symlink forbidden")
            item = {k: v for k, v in inspect_operation(path.stem, env=env, root=base).items() if k != "events"}
            item["integrity"] = "valid"
            results.append(item)
        except ObservabilityError as exc:
            results.append({
                "operation_id": path.stem, "final_state": "unknown", "incomplete": True,
                "integrity": "invalid", "failure_category": redact_text(str(exc), env, limit=256),
            })
    return results
