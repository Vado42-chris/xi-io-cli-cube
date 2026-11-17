"""Resolve the installed Framework release-distribution module from verified Installer custody.

This is a consumer boundary only. It does not read release/adopter/qualification truth
and cannot grant install or effect authority.
"""
from __future__ import annotations
import json
import os
from pathlib import Path

from .kernel.xiio_installer.dependency_receipt_verification import (
    verify_dependency_binding_receipt,
    DependencyReceiptVerificationError,
)

FRAMEWORK_DEPENDENCY_ID = "framework-runtime"
FRAMEWORK_OWNER_REPO = "Vado42-chris/xi-io.net"
RELEASE_EXPORT = "release_distribution_module"


class FrameworkReleaseExportError(RuntimeError):
    pass


def _required(value, code: str) -> str:
    out = str(value or "").strip()
    if not out:
        raise FrameworkReleaseExportError(code)
    return out


def resolve_framework_release_distribution_module(
    binding_receipt_path: Path,
    *,
    expected_framework_generation: str,
) -> dict:
    generation = _required(expected_framework_generation, "FRAMEWORK_GENERATION_REQUIRED")
    try:
        verified = verify_dependency_binding_receipt(
            Path(binding_receipt_path),
            expected_dependency_id=FRAMEWORK_DEPENDENCY_ID,
            expected_owner_repo=FRAMEWORK_OWNER_REPO,
            expected_generation=generation,
        )
    except (DependencyReceiptVerificationError, OSError, ValueError) as exc:
        raise FrameworkReleaseExportError("FRAMEWORK_RUNTIME_BINDING_UNVERIFIED") from exc

    fields = verified.get("fields")
    if not isinstance(fields, dict):
        raise FrameworkReleaseExportError("FRAMEWORK_RUNTIME_EXPORTS_INVALID")
    module = fields.get(RELEASE_EXPORT)
    if not isinstance(module, str) or not module:
        raise FrameworkReleaseExportError("FRAMEWORK_RELEASE_DISTRIBUTION_EXPORT_MISSING")

    path = Path(module)
    if not path.is_absolute():
        raise FrameworkReleaseExportError("FRAMEWORK_RELEASE_DISTRIBUTION_EXPORT_INVALID")
    try:
        st = os.lstat(path)
    except OSError as exc:
        raise FrameworkReleaseExportError("FRAMEWORK_RELEASE_DISTRIBUTION_EXPORT_UNREADABLE") from exc
    if not path.is_file() or path.is_symlink():
        raise FrameworkReleaseExportError("FRAMEWORK_RELEASE_DISTRIBUTION_EXPORT_CUSTODY_INVALID")

    return {
        "schema": "xiio.hex.framework-release-export/v1",
        "state": "VERIFIED",
        "dependency_id": FRAMEWORK_DEPENDENCY_ID,
        "owner_repo": FRAMEWORK_OWNER_REPO,
        "accepted_generation": generation,
        "release_distribution_module": str(path.resolve()),
        "binding_receipt_path": verified["binding_receipt_path"],
        "custody_verified": True,
        "effect_authority": False,
        "provider_effect": False,
    }
