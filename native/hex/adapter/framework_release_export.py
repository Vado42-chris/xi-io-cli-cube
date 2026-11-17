"""Resolve installed Framework runtime exports from verified Installer custody.

This is a consumer boundary only. It does not read product, release, entitlement,
billing or effect authority. Framework owns those contracts and Installer owns
the binding receipt and installed-byte readback.
"""
from __future__ import annotations
import os
from pathlib import Path

try:
    from .kernel.xiio_installer.dependency_receipt_verification import (
        verify_dependency_binding_receipt,
        DependencyReceiptVerificationError,
    )
except ImportError:
    from xiio_installer.dependency_receipt_verification import (
        verify_dependency_binding_receipt,
        DependencyReceiptVerificationError,
    )

FRAMEWORK_DEPENDENCY_ID = "framework-runtime"
FRAMEWORK_OWNER_REPO = "Vado42-chris/xi-io.net"
RELEASE_EXPORT = "release_distribution_module"
PRODUCT_API_EXPORT = "product_api_declaration_module"


class FrameworkReleaseExportError(RuntimeError):
    pass


def _required(value, code: str) -> str:
    out = str(value or "").strip()
    if not out:
        raise FrameworkReleaseExportError(code)
    return out


def _resolve_framework_runtime_export(
    binding_receipt_path: Path,
    *,
    expected_framework_generation: str,
    export_name: str,
    missing_code: str,
    schema: str,
    result_field: str,
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
    exports = verified.get("runtime_exports")
    if not isinstance(fields, dict) or not isinstance(exports, dict):
        raise FrameworkReleaseExportError("FRAMEWORK_RUNTIME_EXPORTS_INVALID")
    module = fields.get(export_name)
    metadata = exports.get(export_name)
    if not isinstance(module, str) or not module or not isinstance(metadata, dict):
        raise FrameworkReleaseExportError(missing_code)

    path = Path(module)
    if not path.is_absolute():
        raise FrameworkReleaseExportError("FRAMEWORK_RUNTIME_EXPORT_INVALID")
    try:
        st = os.lstat(path)
    except OSError as exc:
        raise FrameworkReleaseExportError("FRAMEWORK_RUNTIME_EXPORT_UNREADABLE") from exc
    if not path.is_file() or path.is_symlink() or st.st_nlink != 1:
        raise FrameworkReleaseExportError("FRAMEWORK_RUNTIME_EXPORT_CUSTODY_INVALID")
    sha256 = _required(metadata.get("sha256"), "FRAMEWORK_RUNTIME_EXPORT_SHA256_REQUIRED")
    mode = _required(metadata.get("mode"), "FRAMEWORK_RUNTIME_EXPORT_MODE_REQUIRED")

    return {
        "schema": schema,
        "state": "VERIFIED",
        "dependency_id": FRAMEWORK_DEPENDENCY_ID,
        "owner_repo": FRAMEWORK_OWNER_REPO,
        "accepted_generation": generation,
        result_field: str(path.resolve()),
        result_field + "_sha256": sha256,
        result_field + "_mode": mode,
        "binding_receipt_path": verified["binding_receipt_path"],
        "custody_verified": True,
        "effect_authority": False,
        "provider_effect": False,
    }


def resolve_framework_release_distribution_module(
    binding_receipt_path: Path,
    *,
    expected_framework_generation: str,
) -> dict:
    return _resolve_framework_runtime_export(
        binding_receipt_path,
        expected_framework_generation=expected_framework_generation,
        export_name=RELEASE_EXPORT,
        missing_code="FRAMEWORK_RELEASE_DISTRIBUTION_EXPORT_MISSING",
        schema="xiio.hex.framework-release-export/v1",
        result_field="release_distribution_module",
    )


def resolve_framework_product_api_declaration_module(
    binding_receipt_path: Path,
    *,
    expected_framework_generation: str,
) -> dict:
    return _resolve_framework_runtime_export(
        binding_receipt_path,
        expected_framework_generation=expected_framework_generation,
        export_name=PRODUCT_API_EXPORT,
        missing_code="FRAMEWORK_PRODUCT_API_EXPORT_MISSING",
        schema="xiio.hex.framework-product-api-export/v1",
        result_field="product_api_declaration_module",
    )
