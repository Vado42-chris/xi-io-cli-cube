from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import subprocess
import tempfile
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .runtime_activation import activate_runtime_profile
from .runtime_profile import RuntimeProfile, load_runtime_profile, qualify_update_request


class ManagedUpdateError(RuntimeError):
    pass


SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA64 = re.compile(r"^[0-9a-f]{64}$")
REPO = re.compile(r"^Vado42-chris/[A-Za-z0-9_.-]{1,100}$")
MATERIALIZER = re.compile(r"^scripts/[A-Za-z0-9_.-]{1,100}\.(?:sh|py|mjs)$")
REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$")
ADMISSION_SCHEMA = "xiio-managed-update-admission-v1"
RECEIPT_SCHEMA = "xiio-managed-update-receipt-v1"


def _regular_bytes(path: Path, label: str, limit: int = 2 * 1024 * 1024) -> bytes:
    if not path.exists() or path.is_symlink() or not path.is_file():
        raise ManagedUpdateError(f"{label}_REGULAR_FILE_REQUIRED")
    data = path.read_bytes()
    if not data or len(data) > limit or b"\0" in data:
        raise ManagedUpdateError(f"{label}_SIZE_OR_BINARY_INVALID")
    return data


def _json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(_regular_bytes(path, label).decode("utf-8"))
    except ManagedUpdateError:
        raise
    except Exception as exc:
        raise ManagedUpdateError(f"{label}_JSON_INVALID") from exc
    if not isinstance(value, dict):
        raise ManagedUpdateError(f"{label}_OBJECT_REQUIRED")
    return value


def _text(value: Any, label: str, *, pattern: re.Pattern[str] = REF) -> str:
    text = str(value or "").strip()
    if not pattern.fullmatch(text):
        raise ManagedUpdateError(f"{label}_INVALID")
    return text


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parse_utc(value: Any, label: str) -> datetime:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception as exc:
        raise ManagedUpdateError(f"{label}_INVALID") from exc
    if parsed.tzinfo is None:
        raise ManagedUpdateError(f"{label}_INVALID")
    return parsed.astimezone(timezone.utc)


def _atomic_bytes(path: Path, data: bytes, mode: int = 0o600) -> None:
    if path.is_symlink():
        raise ManagedUpdateError("OUTPUT_SYMLINK_FORBIDDEN")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    os.close(fd)
    candidate = Path(tmp)
    try:
        candidate.write_bytes(data)
        os.chmod(candidate, mode)
        os.replace(candidate, path)
    finally:
        candidate.unlink(missing_ok=True)


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    _atomic_bytes(path, (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8"))


def _restore(path: Path, before: bytes | None) -> None:
    if before is None:
        path.unlink(missing_ok=True)
    else:
        _atomic_bytes(path, before)


def _run(args: list[str], *, timeout: int = 300, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(args, capture_output=True, text=True, check=False, timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ManagedUpdateError("MATERIALIZER_EXECUTION_UNAVAILABLE") from exc


def _require_ok(result: subprocess.CompletedProcess[str], code: str) -> None:
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[:2048]
        raise ManagedUpdateError(f"{code}:{detail or result.returncode}")


def _matching_dependency(target: RuntimeProfile, source: dict[str, Any]):
    repo = _text(source.get("repo"), "SOURCE_REPO", pattern=REPO)
    generation = _text(source.get("accepted_generation"), "SOURCE_GENERATION", pattern=SHA40)
    materializer = _text(source.get("materializer"), "SOURCE_MATERIALIZER", pattern=MATERIALIZER)
    rows = [
        dep for dep in target.dependencies
        if dep.owner_repo == repo
        and dep.accepted_generation == generation
        and dep.materializer == materializer
    ]
    if len(rows) != 1:
        raise ManagedUpdateError("TARGET_DEPENDENCY_SOURCE_MISMATCH")
    return rows[0]


def _validate_target(current: RuntimeProfile, target: RuntimeProfile, request: dict[str, Any], target_bytes: bytes) -> None:
    if target.profile_id != current.profile_id or target.product_id != current.product_id:
        raise ManagedUpdateError("TARGET_PROFILE_IDENTITY_MISMATCH")
    if request.get("from_generation") != current.generation:
        raise ManagedUpdateError("UPDATE_FROM_GENERATION_MISMATCH")
    if request.get("to_generation") != target.generation:
        raise ManagedUpdateError("UPDATE_TO_GENERATION_MISMATCH")
    expected = _text(request.get("payload_sha256"), "PAYLOAD_SHA256", pattern=SHA64)
    if _sha256(target_bytes) != expected:
        raise ManagedUpdateError("TARGET_PROFILE_DIGEST_MISMATCH")


def _validate_admission(request: dict[str, Any], consent: dict[str, Any], admission: dict[str, Any]) -> None:
    if admission.get("schema") != ADMISSION_SCHEMA or admission.get("state") != "ADMITTED":
        raise ManagedUpdateError("MANAGED_UPDATE_ADMISSION_REQUIRED")
    bindings = {
        "request_id": request.get("request_id"),
        "profile_id": request.get("profile_id"),
        "from_generation": request.get("from_generation"),
        "to_generation": request.get("to_generation"),
        "principal_ref": consent.get("principal_ref"),
        "machine_ref": request.get("target", {}).get("machine_ref"),
    }
    for key, expected in bindings.items():
        if not expected or admission.get(key) != expected:
            raise ManagedUpdateError(f"ADMISSION_{key.upper()}_MISMATCH")
    for key in ("work_ref", "assignment_ref", "ward_admission_ref", "switchboard_attempt_ref", "idempotency_key"):
        _text(admission.get(key), f"ADMISSION_{key.upper()}")
    if admission.get("effect") != "BOUNDED_LOCAL_PRODUCT_UPDATE":
        raise ManagedUpdateError("ADMISSION_EFFECT_MISMATCH")
    if admission.get("provider_effect") is not False:
        raise ManagedUpdateError("ADMISSION_PROVIDER_EFFECT_INVALID")
    if _parse_utc(admission.get("expires_at"), "ADMISSION_EXPIRES_AT") <= datetime.now(timezone.utc):
        raise ManagedUpdateError("MANAGED_UPDATE_ADMISSION_EXPIRED")


def _fetch_materializer(source: dict[str, Any], *, run: Callable[..., subprocess.CompletedProcess[str]]) -> tuple[Path, str]:
    repo = _text(source.get("repo"), "SOURCE_REPO", pattern=REPO)
    generation = _text(source.get("accepted_generation"), "SOURCE_GENERATION", pattern=SHA40)
    materializer = _text(source.get("materializer"), "SOURCE_MATERIALIZER", pattern=MATERIALIZER)
    expected_blob = _text(source.get("materializer_git_blob_sha1"), "MATERIALIZER_GIT_BLOB_SHA1", pattern=SHA40)
    result = run([
        "gh", "api", f"repos/{repo}/contents/{materializer}?ref={generation}"
    ], timeout=30, env=os.environ.copy())
    _require_ok(result, "MATERIALIZER_FETCH_FAILED")
    try:
        payload = json.loads(result.stdout)
    except Exception as exc:
        raise ManagedUpdateError("MATERIALIZER_RESPONSE_INVALID") from exc
    if payload.get("type") != "file" or payload.get("sha") != expected_blob or payload.get("encoding") != "base64":
        raise ManagedUpdateError("MATERIALIZER_BLOB_IDENTITY_MISMATCH")
    try:
        data = base64.b64decode("".join(str(payload.get("content") or "").split()), validate=True)
    except Exception as exc:
        raise ManagedUpdateError("MATERIALIZER_BASE64_INVALID") from exc
    fd, name = tempfile.mkstemp(prefix="xiio-materializer-", suffix=Path(materializer).suffix)
    os.close(fd)
    path = Path(name)
    path.write_bytes(data)
    os.chmod(path, 0o700)
    return path, _sha256(data)


def apply_managed_runtime_update(
    current_profile_path: Path,
    target_profile_path: Path,
    consent_receipt_path: Path,
    activation_receipt_path: Path,
    update_request_path: Path,
    admission_receipt_path: Path,
    update_receipt_path: Path,
    *,
    run: Callable[..., subprocess.CompletedProcess[str]] = _run,
    activate: Callable[..., dict[str, Any]] = activate_runtime_profile,
) -> dict[str, Any]:
    if update_receipt_path.exists():
        raise ManagedUpdateError("UPDATE_RECEIPT_ALREADY_EXISTS")
    current_bytes = _regular_bytes(current_profile_path, "CURRENT_PROFILE")
    target_bytes = _regular_bytes(target_profile_path, "TARGET_PROFILE")
    current = load_runtime_profile(current_profile_path)
    target = load_runtime_profile(target_profile_path)
    consent = _json(consent_receipt_path, "CONSENT_RECEIPT")
    request = _json(update_request_path, "UPDATE_REQUEST")
    admission = _json(admission_receipt_path, "ADMISSION_RECEIPT")
    qualification = qualify_update_request(current, consent, request)
    if qualification.get("state") != "ELIGIBLE_FOR_LOCAL_ADMISSION":
        raise ManagedUpdateError(str(qualification.get("first_red") or "UPDATE_NOT_ELIGIBLE"))
    if qualification.get("fresh_user_approval_required") is True:
        raise ManagedUpdateError("FRESH_USER_APPROVAL_REQUIRED")
    _validate_target(current, target, request, target_bytes)
    _validate_admission(request, consent, admission)

    source = request.get("source")
    if not isinstance(source, dict):
        raise ManagedUpdateError("UPDATE_SOURCE_REQUIRED")
    dependency = _matching_dependency(target, source)
    argv = source.get("argv")
    if argv != ["--ref", dependency.accepted_generation]:
        raise ManagedUpdateError("MATERIALIZER_ARGV_MISMATCH")
    target_unit = request.get("target", {}).get("unit")
    if target_unit != dependency.expected_unit:
        raise ManagedUpdateError("TARGET_UNIT_DEPENDENCY_MISMATCH")

    materializer_path, materializer_sha = _fetch_materializer(source, run=run)
    old_consent = _regular_bytes(consent_receipt_path, "CONSENT_RECEIPT")
    old_activation = activation_receipt_path.read_bytes() if activation_receipt_path.exists() else None
    old_update = update_receipt_path.read_bytes() if update_receipt_path.exists() else None
    materialized = False
    profile_swapped = False
    try:
        materialize = run(["bash", str(materializer_path), *argv], timeout=600, env=os.environ.copy())
        _require_ok(materialize, "DEPENDENCY_MATERIALIZATION_FAILED")
        materialized = True

        grants = [str(value) for value in consent.get("permissions", [])]
        activation = activate(
            target,
            grants=grants,
            update_policy=consent.get("update_policy"),
            consent_receipt_path=consent_receipt_path,
            activation_receipt_path=activation_receipt_path,
            principal_ref=str(consent.get("principal_ref") or "local-user"),
        )
        if activation.get("readback_verified") is not True:
            raise ManagedUpdateError("TARGET_ACTIVATION_READBACK_UNVERIFIED")

        _atomic_bytes(current_profile_path, target_bytes)
        profile_swapped = True
        commit = run([
            "bash", str(materializer_path), "--ref", dependency.accepted_generation, "--commit"
        ], timeout=60, env=os.environ.copy())
        _require_ok(commit, "DEPENDENCY_MATERIALIZER_COMMIT_FAILED")

        receipt = {
            "schema": RECEIPT_SCHEMA,
            "state": "APPLIED",
            "request_id": request.get("request_id"),
            "profile_id": target.profile_id,
            "from_generation": current.generation,
            "to_generation": target.generation,
            "work_ref": admission.get("work_ref"),
            "assignment_ref": admission.get("assignment_ref"),
            "ward_admission_ref": admission.get("ward_admission_ref"),
            "switchboard_attempt_ref": admission.get("switchboard_attempt_ref"),
            "idempotency_key": admission.get("idempotency_key"),
            "principal_ref": consent.get("principal_ref"),
            "machine_ref": admission.get("machine_ref"),
            "payload_sha256": _sha256(target_bytes),
            "materializer_git_blob_sha1": source.get("materializer_git_blob_sha1"),
            "materializer_sha256": materializer_sha,
            "dependency": {**asdict(dependency), "required_for_permissions": list(dependency.required_for_permissions)},
            "activation_receipt": activation,
            "rollback_checkpoint_retained": True,
            "rollback_checkpoint_state": "COMMITTED",
            "independent_readback_required": True,
            "provider_effect": False,
        }
        _atomic_json(update_receipt_path, receipt)
        if _json(update_receipt_path, "UPDATE_RECEIPT") != receipt:
            raise ManagedUpdateError("UPDATE_RECEIPT_READBACK_MISMATCH")
        return receipt
    except Exception as error:
        rollback_error = None
        if materialized:
            rollback = run(["bash", str(materializer_path), "--rollback"], timeout=600, env=os.environ.copy())
            if rollback.returncode != 0:
                rollback_error = (rollback.stderr or rollback.stdout or "rollback failed").strip()[:2048]
        if profile_swapped:
            _atomic_bytes(current_profile_path, current_bytes)
        _restore(consent_receipt_path, old_consent)
        _restore(activation_receipt_path, old_activation)
        _restore(update_receipt_path, old_update)
        if rollback_error:
            raise ManagedUpdateError(f"UPDATE_FAILED_ROLLBACK_UNKNOWN:{rollback_error}") from error
        raise
    finally:
        materializer_path.unlink(missing_ok=True)
