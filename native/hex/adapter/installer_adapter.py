#!/usr/bin/env python3
"""Stable finite HEX installer adapter with Framework product/API consumption.

The accepted implementation is retained byte-for-byte in
installer_adapter_core.py. This surface only binds server-package requests to an
installed, Installer-verified Framework product API module before delegating to
the accepted transaction engine.
"""
from pathlib import Path

_CORE_PATH = Path(__file__).with_name("installer_adapter_core.py")
if _CORE_PATH.is_symlink() or not _CORE_PATH.is_file():
    raise RuntimeError("INSTALLER_ADAPTER_CORE_UNTRUSTED")
_ORIGINAL_NAME = __name__
globals()["__name__"] = "xiio_hex_installer_adapter_core"
exec(compile(_CORE_PATH.read_bytes(), str(_CORE_PATH), "exec"), globals(), globals())
globals()["__name__"] = _ORIGINAL_NAME

import re

import framework_product_api_reader
import framework_release_export
from child_bundle import BundleError

_CORE_HANDLE = handle
_FRAMEWORK_SERVER_ACTIONS = {
    "server_prepare", "server_apply", "hotpatch_prepare", "hotpatch_apply",
}
_FRAMEWORK_REQUEST_FIELDS = {"framework_binding_receipt", "framework_generation"}
_ACCEPTED_GENERATION = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")


def _framework_product_api_context(req):
    receipt = req.get("framework_binding_receipt")
    generation = req.get("framework_generation")
    if receipt is None and generation is None:
        return None
    demand(isinstance(receipt, str) and isinstance(generation, str),
           "FRAMEWORK_PRODUCT_API_BINDING_FIELDS_INCOMPLETE")
    demand(bool(_ACCEPTED_GENERATION.fullmatch(generation)),
           "FRAMEWORK_PRODUCT_API_GENERATION_INVALID")
    receipt_path = safe_path(Path(receipt))
    try:
        export = framework_release_export.resolve_framework_product_api_declaration_module(
            receipt_path,
            expected_framework_generation=generation,
        )
        reader = framework_product_api_reader.build_framework_product_api_reader(
            framework_product_api_module=Path(export["product_api_declaration_module"]),
            expected_module_sha256=export["product_api_declaration_module_sha256"],
        )
    except (framework_release_export.FrameworkReleaseExportError,
            BundleError, OSError, ValueError) as exc:
        raise Refused("FRAMEWORK_PRODUCT_API_BINDING_UNVERIFIED") from exc
    return server_profile.bind_product_api_context(reader, export)


def handle(req):
    if not isinstance(req, dict) or req.get("action") not in _FRAMEWORK_SERVER_ACTIONS:
        return _CORE_HANDLE(req)
    context = _framework_product_api_context(req)
    stripped = {key: value for key, value in req.items()
                if key not in _FRAMEWORK_REQUEST_FIELDS}
    if context is None:
        # Fixture packages retain the accepted core behavior. Production
        # packages fail closed inside server_profile before mutation.
        return _CORE_HANDLE(stripped)
    with context:
        return _CORE_HANDLE(stripped)


if _ORIGINAL_NAME == "__main__":
    main()
