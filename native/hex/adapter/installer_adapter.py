#!/usr/bin/env python3
"""Stable finite HEX installer adapter with Framework product/API consumption.

The accepted implementation is retained byte-for-byte in
installer_adapter_core.py. This surface binds server-package requests to the
installed Framework product/API module and product-release requests to the
installed Framework release reader before delegating effects to accepted
transaction owners.
"""
from pathlib import Path

_CORE_PATH = Path(__file__).with_name("installer_adapter_core.py")
if _CORE_PATH.is_symlink() or not _CORE_PATH.is_file():
    raise RuntimeError("INSTALLER_ADAPTER_CORE_UNTRUSTED")
_CORE_SOURCE = _CORE_PATH.read_text(encoding="utf-8")
_REQUIRED_ACCEPTED_CORE_MARKERS = (
    "local_step_actions", "prepare_repair", "apply_repair",
    "CANONICAL_LAUNCHER_RECOVERY_REQUIRED_NO_RETRY",
)
if any(marker not in _CORE_SOURCE for marker in _REQUIRED_ACCEPTED_CORE_MARKERS):
    raise RuntimeError("INSTALLER_ADAPTER_CORE_CONTRACT_INCOMPLETE")
_ORIGINAL_NAME = __name__
globals()["__name__"] = "xiio_hex_installer_adapter_core"
exec(compile(_CORE_PATH.read_bytes(), str(_CORE_PATH), "exec"), globals(), globals())
globals()["__name__"] = _ORIGINAL_NAME

import re

import framework_product_api_reader
import framework_release_export
import framework_release_reader
import native_product_receiver
from child_bundle import BundleError

_CORE_HANDLE = handle
_CORE_HANDLE_REPAIR = handle_repair
_FRAMEWORK_SERVER_ACTIONS = {
    "server_prepare", "server_apply", "hotpatch_prepare", "hotpatch_apply",
}
_FRAMEWORK_RELEASE_DISCOVERY_ACTION = "release_discover"
_FRAMEWORK_REQUEST_FIELDS = {"framework_binding_receipt", "framework_generation"}
_PRODUCT_ACTION_FIELDS = {
    "product_inspect": {
        "action", "release_lock", "framework_binding_receipt",
        "framework_generation", "node",
    },
    "product_apply": {
        "action", "release_lock", "framework_binding_receipt",
        "framework_generation", "node", "review_digest", "approved",
    },
}
_ACCEPTED_GENERATION = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


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


def _handle_product_request(req):
    action = req.get("action")
    demand(action in _PRODUCT_ACTION_FIELDS
           and set(req) == _PRODUCT_ACTION_FIELDS[action],
           "PRODUCT_RECEIVER_FIELDS_INVALID")
    generation = req.get("framework_generation")
    demand(isinstance(generation, str)
           and bool(_ACCEPTED_GENERATION.fullmatch(generation)),
           "FRAMEWORK_RELEASE_GENERATION_INVALID")
    for field in ("release_lock", "framework_binding_receipt", "node"):
        demand(isinstance(req.get(field), str), "PRODUCT_RECEIVER_PATH_REQUIRED")
        safe_path(Path(req[field]))
    if action == "product_apply":
        demand(req.get("approved") is True,
               "PRODUCT_EXACT_APPROVAL_REQUIRED")
        review_digest = req.get("review_digest")
        demand(isinstance(review_digest, str)
               and bool(_SHA256.fullmatch(review_digest)),
               "PRODUCT_REVIEW_DIGEST_INVALID")
    observed_node = node_identity(req["node"])
    common = {
        "release_lock": req["release_lock"],
        "framework_binding_receipt": req["framework_binding_receipt"],
        "framework_generation": generation,
        "node": observed_node,
    }
    if action == "product_inspect":
        return native_product_receiver.inspect_product_release(**common)
    return native_product_receiver.apply_product_release(
        **common,
        review_digest=review_digest,
        approved=True,
    )


def handle_repair(req, base, p):
    """Audit the preserved repair ordering before delegating to its exact core."""
    qualification = _CORE_SOURCE.index('qualification = qualify_precommand_targets(')
    verify = _CORE_SOURCE.index('verify_node(p)', qualification)
    journal = _CORE_SOURCE.index(
        "journal.start('Repair only exact reviewed existing CLI launcher'", verify)
    effect = _CORE_SOURCE.index('str(SOURCE/REPAIR_INSTALLER)', journal)
    demand(qualification < verify < journal < effect,
           "INSTALLER_ADAPTER_CORE_REPAIR_ORDER_INVALID")
    demand("p['launcher_before']['mode']" in _CORE_SOURCE,
           "INSTALLER_ADAPTER_CORE_REPAIR_MODE_GUARD_MISSING")
    demand("Path(p['backup']).parent" in _CORE_SOURCE,
           "INSTALLER_ADAPTER_CORE_REPAIR_BACKUP_GUARD_MISSING")
    demand("account_login_required" in _CORE_SOURCE,
           "INSTALLER_ADAPTER_CORE_REPAIR_ACCOUNT_GUARD_MISSING")
    return _CORE_HANDLE_REPAIR(req, base, p)


def _framework_release_distribution(req):
    demand(isinstance(req, dict), "FRAMEWORK_RELEASE_DISCOVERY_REQUEST_INVALID")
    demand(set(req) == {
        "action", "product_ref", "consumer_ref",
        "framework_binding_receipt", "framework_generation",
    }, "FRAMEWORK_RELEASE_DISCOVERY_FIELDS_INVALID")
    product_ref = req.get("product_ref")
    consumer_ref = req.get("consumer_ref")
    receipt = req.get("framework_binding_receipt")
    generation = req.get("framework_generation")
    demand(isinstance(product_ref, str) and bool(product_ref.strip()),
           "FRAMEWORK_RELEASE_PRODUCT_REF_REQUIRED")
    demand(isinstance(consumer_ref, str) and bool(consumer_ref.strip()),
           "FRAMEWORK_RELEASE_CONSUMER_REF_REQUIRED")
    demand(isinstance(receipt, str) and isinstance(generation, str),
           "FRAMEWORK_RELEASE_BINDING_FIELDS_INCOMPLETE")
    demand(bool(_ACCEPTED_GENERATION.fullmatch(generation)),
           "FRAMEWORK_RELEASE_GENERATION_INVALID")
    try:
        export = framework_release_export.resolve_framework_release_distribution_module(
            safe_path(Path(receipt)),
            expected_framework_generation=generation,
        )
        reader = framework_release_reader.build_framework_release_distribution_reader(
            framework_release_distribution_module=Path(export["release_distribution_module"]),
        )
        lock = reader(product_ref=product_ref.strip(), consumer_ref=consumer_ref.strip())
    except (framework_release_export.FrameworkReleaseExportError,
            BundleError, OSError, ValueError) as exc:
        raise Refused("FRAMEWORK_RELEASE_DISTRIBUTION_UNVERIFIED") from exc
    demand(isinstance(lock, dict)
           and lock.get("schema") == "xiio.release-distribution-lock/v1",
           "FRAMEWORK_RELEASE_DISTRIBUTION_INVALID")
    demand(lock.get("product_ref") == product_ref.strip()
           and lock.get("consumer_ref") == consumer_ref.strip(),
           "FRAMEWORK_RELEASE_DISTRIBUTION_COORDINATE_MISMATCH")
    demand(lock.get("lifecycle") == "DISTRIBUTABLE"
           and lock.get("adopter_current") is True
           and lock.get("effect_authority") is False
           and lock.get("installed") is False,
           "FRAMEWORK_RELEASE_DISTRIBUTION_NOT_CURRENT")
    return {
        "schema": "xiio.hex.release-discovery/v1",
        "state": "QUALIFIED",
        "product_ref": product_ref.strip(),
        "consumer_ref": consumer_ref.strip(),
        "framework_generation": generation,
        "distribution": lock,
        "effect_authority": False,
        "provider_effect": False,
    }


def handle(req):
    if req == {"action": "inspect"}:
        result = _CORE_HANDLE(req)
        result["product_host"] = native_product_receiver.installed_framework_hint(
            Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state"))
        return result
    if isinstance(req, dict) and req.get("action") == _FRAMEWORK_RELEASE_DISCOVERY_ACTION:
        return _framework_release_distribution(req)
    if isinstance(req, dict) and req.get("action") in _PRODUCT_ACTION_FIELDS:
        return _handle_product_request(req)
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
