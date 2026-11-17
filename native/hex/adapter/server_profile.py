"""Stable HEX server-package surface with product/API declaration binding.

The accepted server transaction engine remains byte-for-byte in
server_profile_core.py. Production server packages add one consumer join around
that engine: the package's declaration is compiled by the installed Framework
runtime before review, then reopened from an Installer dependency-binding
receipt after install and service readback. Fixture packages retain the exact
accepted core behavior.
"""
from pathlib import Path

_CORE_PATH = Path(__file__).with_name("server_profile_core.py")
if _CORE_PATH.is_symlink() or not _CORE_PATH.is_file():
    raise RuntimeError("SERVER_PROFILE_CORE_UNTRUSTED")
exec(compile(_CORE_PATH.read_bytes(), str(_CORE_PATH), "exec"), globals(), globals())

import contextvars
import re
from contextlib import contextmanager

from xiio_installer.dependency_binding import (
    compile_dependency_binding_receipt,
    DependencyBindingError,
)
from xiio_installer.dependency_receipt_verification import (
    verify_dependency_binding_receipt,
    DependencyReceiptVerificationError,
)

_CORE_LOAD_SERVER_PACKAGE = load_server_package
_CORE_PREPARE_LOADED_SERVER_PACKAGE = _prepare_loaded_server_package
_CORE_APPLY_SERVER_PACKAGE = apply_server_package
_CORE_ROLLBACK_SERVER_PACKAGE = rollback_server_package

PRODUCT_API_BINDING_SCHEMA = "xiio.hex.server-product-api-binding/v1"
PRODUCT_API_TOMBSTONE_SCHEMA = "xiio.hex.server-product-api-binding-tombstone/v1"
PRODUCT_API_HISTORY_SCHEMA = "xiio.hex.server-product-api-binding-history/v1"
PRODUCT_API_EXPORT = "product_api_declaration"
DECLARATION_SCHEMA = "xiio.product-api-declaration/v1"
CURRENTNESS_SCHEMA = "xiio.product-api-declaration-currentness/v1"
REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$")
OWNER_REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
GENERATION = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
DECLARATION_GENERATION = re.compile(r"^sha256:[0-9a-f]{64}$")
_PRODUCT_API_CONTEXT = contextvars.ContextVar("xiio_hex_product_api_context", default=None)
_PRODUCT_API_PLAN_FIELDS = {"product_api_binding", "service_advertisement_eligible"}


def _required_text(value, code, pattern=REF):
    text = str(value or "")
    if not pattern.fullmatch(text):
        raise ValueError(code)
    return text


def _framework_export(value):
    if not isinstance(value, dict):
        raise ValueError("SERVER_FRAMEWORK_PRODUCT_API_EXPORT_REQUIRED")
    required = {
        "schema", "state", "dependency_id", "owner_repo", "accepted_generation",
        "product_api_declaration_module", "product_api_declaration_module_sha256",
        "product_api_declaration_module_mode", "binding_receipt_path",
        "custody_verified", "effect_authority", "provider_effect",
    }
    if set(value) != required:
        raise ValueError("SERVER_FRAMEWORK_PRODUCT_API_EXPORT_INVALID")
    if (value.get("schema") != "xiio.hex.framework-product-api-export/v1"
            or value.get("state") != "VERIFIED"
            or value.get("dependency_id") != "framework-runtime"
            or value.get("owner_repo") != "Vado42-chris/xi-io.net"
            or value.get("custody_verified") is not True
            or value.get("effect_authority") is not False
            or value.get("provider_effect") is not False):
        raise ValueError("SERVER_FRAMEWORK_PRODUCT_API_EXPORT_INVALID")
    _required_text(value.get("accepted_generation"),
                   "SERVER_FRAMEWORK_GENERATION_INVALID", GENERATION)
    module = Path(str(value.get("product_api_declaration_module") or ""))
    receipt = Path(str(value.get("binding_receipt_path") or ""))
    if not module.is_absolute() or not receipt.is_absolute():
        raise ValueError("SERVER_FRAMEWORK_PRODUCT_API_EXPORT_PATH_INVALID")
    _required_text(value.get("product_api_declaration_module_sha256"),
                   "SERVER_FRAMEWORK_PRODUCT_API_EXPORT_SHA256_INVALID",
                   re.compile(r"^[0-9a-f]{64}$"))
    if value.get("product_api_declaration_module_mode") != "0644":
        raise ValueError("SERVER_FRAMEWORK_PRODUCT_API_EXPORT_MODE_INVALID")
    return dict(value)


@contextmanager
def bind_product_api_context(reader, framework_export):
    if not callable(getattr(reader, "compile_declaration", None)) or not callable(
            getattr(reader, "reopen_verified_declaration", None)):
        raise ValueError("SERVER_FRAMEWORK_PRODUCT_API_READER_INVALID")
    context = {"reader": reader, "framework_export": _framework_export(framework_export)}
    token = _PRODUCT_API_CONTEXT.set(context)
    try:
        yield
    finally:
        _PRODUCT_API_CONTEXT.reset(token)


def _product_api_metadata(manifest):
    raw = manifest.raw
    metadata = raw.get("product_api_binding")
    required = {
        "schema", "declaration_ref", "declaration_generation", "product_ref",
        "api_ref", "runtime_ref", "dependency_id", "owner_repo",
        "accepted_generation", "export_name",
    }
    if not isinstance(metadata, dict) or set(metadata) != required:
        raise ValueError("SERVER_PRODUCT_API_BINDING_METADATA_REQUIRED")
    if metadata.get("schema") != PRODUCT_API_BINDING_SCHEMA:
        raise ValueError("SERVER_PRODUCT_API_BINDING_SCHEMA_INVALID")
    for field in ["declaration_ref", "product_ref", "api_ref", "runtime_ref", "dependency_id"]:
        _required_text(metadata.get(field), "SERVER_PRODUCT_API_" + field.upper() + "_INVALID")
    _required_text(metadata.get("owner_repo"),
                   "SERVER_PRODUCT_API_OWNER_REPO_INVALID", OWNER_REPO)
    _required_text(metadata.get("accepted_generation"),
                   "SERVER_PRODUCT_API_ACCEPTED_GENERATION_INVALID", GENERATION)
    _required_text(metadata.get("declaration_generation"),
                   "SERVER_PRODUCT_API_DECLARATION_GENERATION_INVALID",
                   DECLARATION_GENERATION)
    if metadata.get("export_name") != PRODUCT_API_EXPORT:
        raise ValueError("SERVER_PRODUCT_API_EXPORT_NAME_INVALID")
    if (raw.get("dependency_id") != metadata["dependency_id"]
            or raw.get("owner_repo") != metadata["owner_repo"]
            or raw.get("accepted_generation") != metadata["accepted_generation"]):
        raise ValueError("SERVER_PRODUCT_API_MANIFEST_IDENTITY_MISMATCH")
    exports = raw.get("runtime_exports")
    spec = exports.get(PRODUCT_API_EXPORT) if isinstance(exports, dict) else None
    if not isinstance(spec, dict):
        raise ValueError("SERVER_PRODUCT_API_RUNTIME_EXPORT_REQUIRED")
    scope = str(spec.get("destination_scope") or "")
    destination = str(spec.get("destination") or "")
    matches = [entry for entry in manifest.entries
               if entry.destination_scope == scope and entry.destination == destination]
    if len(matches) != 1:
        raise ValueError("SERVER_PRODUCT_API_RUNTIME_EXPORT_NOT_IN_PAYLOAD")
    return dict(metadata), matches[0]


def _validated_compiled_declaration(compiled, metadata):
    if not isinstance(compiled, dict):
        raise ValueError("SERVER_PRODUCT_API_DECLARATION_INVALID")
    expected = {
        "schema": DECLARATION_SCHEMA,
        "state": "DECLARED",
        "declaration_ref": metadata["declaration_ref"],
        "declaration_generation": metadata["declaration_generation"],
        "product_ref": metadata["product_ref"],
        "api_ref": metadata["api_ref"],
        "runtime_ref": metadata["runtime_ref"],
        "effect_authority": False,
        "provider_effect": False,
        "billing_effect_authority": False,
    }
    for field, value in expected.items():
        if compiled.get(field) != value:
            raise ValueError("SERVER_PRODUCT_API_DECLARATION_IDENTITY_MISMATCH:" + field)
    if not isinstance(compiled.get("operations"), list) or not compiled["operations"]:
        raise ValueError("SERVER_PRODUCT_API_DECLARATION_OPERATIONS_REQUIRED")
    return compiled


def _source_product_api_binding(pkg, context):
    if context is None:
        raise ValueError("SERVER_PRODUCT_API_FRAMEWORK_CONTEXT_REQUIRED")
    metadata, entry = _product_api_metadata(pkg["manifest"])
    source = pkg["root"] / entry.source
    try:
        declaration = json.loads(_read(source))
    except (ValueError, UnicodeError) as exc:
        raise ValueError("SERVER_PRODUCT_API_DECLARATION_JSON_INVALID") from exc
    if not isinstance(declaration, dict):
        raise ValueError("SERVER_PRODUCT_API_DECLARATION_JSON_INVALID")
    compiled = _validated_compiled_declaration(
        context["reader"].compile_declaration(declaration), metadata)
    framework = context["framework_export"]
    return {
        "schema": PRODUCT_API_BINDING_SCHEMA,
        "state": "SOURCE_DECLARATION_VERIFIED",
        "declaration": compiled,
        "declaration_ref": metadata["declaration_ref"],
        "declaration_generation": metadata["declaration_generation"],
        "product_ref": metadata["product_ref"],
        "api_ref": metadata["api_ref"],
        "runtime_ref": metadata["runtime_ref"],
        "dependency_id": metadata["dependency_id"],
        "owner_repo": metadata["owner_repo"],
        "accepted_generation": metadata["accepted_generation"],
        "export_name": PRODUCT_API_EXPORT,
        "source_export_sha256": entry.sha256,
        "framework_dependency_id": framework["dependency_id"],
        "framework_owner_repo": framework["owner_repo"],
        "framework_accepted_generation": framework["accepted_generation"],
        "framework_module_sha256": framework["product_api_declaration_module_sha256"],
        "binding_receipt_path": None,
        "currentness_ref": None,
        "installed_export_sha256": None,
        "source_custody_verified": True,
        "custody_verified": False,
        "admission_eligible": False,
        "service_advertisement_eligible": False,
        "effect_authority": False,
        "provider_effect": False,
        "billing_effect_authority": False,
        "hard": [
            "PRODUCT_API_DECLARATION!=ACCESS_GRANT",
            "PRODUCT_API_DECLARATION!=ENTITLEMENT",
            "PRODUCT_API_DECLARATION!=BILLING_ADMISSION",
            "PRODUCT_API_DECLARATION!=EFFECT_AUTHORITY",
            "SERVICE_HEALTH!=API_DECLARATION_CURRENTNESS",
            "SOURCE_DECLARATION!=INSTALLED_DECLARATION_READBACK",
        ],
    }


def _core_plan(reviewed_plan):
    if not isinstance(reviewed_plan, dict):
        raise ValueError("SERVER_PACKAGE_PLAN_SCHEMA_INVALID")
    return {key: value for key, value in reviewed_plan.items()
            if key not in _PRODUCT_API_PLAN_FIELDS}


def _binding_receipt_path(install_receipt_path):
    path = Path(install_receipt_path)
    if not path.is_absolute():
        raise ValueError("SERVER_PRODUCT_API_BINDING_RECEIPT_PATH_INVALID")
    return path.with_name(path.name + ".product-api-binding.json")


def _write_private_json(path, value, *, replace=False):
    path = Path(path)
    if not path.is_absolute() or path.is_symlink():
        raise ValueError("SERVER_PRODUCT_API_EVIDENCE_PATH_INVALID")
    if not replace and path.exists():
        raise ValueError("SERVER_PRODUCT_API_EVIDENCE_PATH_OCCUPIED")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix="." + path.name + ".", suffix=".tmp",
                                    dir=path.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        tmp.write_text(json.dumps(value, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        os.chmod(tmp, 0o600)
        if replace:
            os.replace(tmp, path)
        else:
            try:
                os.link(tmp, path, follow_symlinks=False)
            except FileExistsError as exc:
                raise ValueError("SERVER_PRODUCT_API_EVIDENCE_PATH_OCCUPIED") from exc
            tmp.unlink()
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if tmp.exists():
            tmp.unlink()
    st = os.lstat(path)
    if (not path.is_file() or path.is_symlink() or st.st_uid != os.getuid()
            or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) != 0o600):
        raise ValueError("SERVER_PRODUCT_API_EVIDENCE_CUSTODY_INVALID")
    try:
        reopened = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise ValueError("SERVER_PRODUCT_API_EVIDENCE_READBACK_INVALID") from exc
    if reopened != value:
        raise ValueError("SERVER_PRODUCT_API_EVIDENCE_READBACK_MISMATCH")
    return reopened


def _persist_dependency_binding(pkg, home, core_plan, install_receipt_path, binding_path):
    install_receipt = _bound_installer_receipt(core_plan, install_receipt_path)
    try:
        receipt = compile_dependency_binding_receipt(
            pkg["manifest"], install_receipt, _roots(home),
            binding_receipt_path=binding_path,
        )
    except (DependencyBindingError, OSError, ValueError) as exc:
        raise ValueError("SERVER_PRODUCT_API_BINDING_COMPILE_FAILED") from exc
    _write_private_json(binding_path, receipt)
    metadata = core_plan.get("product_api_binding")
    try:
        return verify_dependency_binding_receipt(
            binding_path,
            expected_dependency_id=metadata["dependency_id"],
            expected_owner_repo=metadata["owner_repo"],
            expected_generation=metadata["accepted_generation"],
        )
    except (DependencyReceiptVerificationError, OSError, ValueError) as exc:
        raise ValueError("SERVER_PRODUCT_API_BINDING_READBACK_FAILED") from exc


def _reopen_installed_binding(context, source_binding, binding_path):
    reopened = context["reader"].reopen_verified_declaration(
        binding_receipt_path=binding_path,
        expected_dependency_id=source_binding["dependency_id"],
        expected_owner_repo=source_binding["owner_repo"],
        expected_generation=source_binding["accepted_generation"],
        expected_declaration_ref=source_binding["declaration_ref"],
        expected_product_ref=source_binding["product_ref"],
        expected_api_ref=source_binding["api_ref"],
    )
    if not isinstance(reopened, dict) or set(reopened) != {"declaration", "currentness"}:
        raise ValueError("SERVER_PRODUCT_API_INSTALLED_READBACK_INVALID")
    declaration = reopened["declaration"]
    currentness = reopened["currentness"]
    if declaration != source_binding["declaration"]:
        raise ValueError("SERVER_PRODUCT_API_INSTALLED_DECLARATION_MISMATCH")
    if not isinstance(currentness, dict):
        raise ValueError("SERVER_PRODUCT_API_CURRENTNESS_INVALID")
    expected = {
        "schema": CURRENTNESS_SCHEMA,
        "state": "CURRENT",
        "current": True,
        "declaration_ref": source_binding["declaration_ref"],
        "declaration_generation": source_binding["declaration_generation"],
        "product_ref": source_binding["product_ref"],
        "api_ref": source_binding["api_ref"],
        "dependency_id": source_binding["dependency_id"],
        "owner_repo": source_binding["owner_repo"],
        "accepted_generation": source_binding["accepted_generation"],
        "export_name": PRODUCT_API_EXPORT,
        "verification_scope": "VERIFIED_DEPENDENCY_EXPORT_READBACK",
        "custody_verified": True,
        "admission_eligible": True,
        "provider_authenticated": False,
        "effect_authority": False,
        "provider_effect": False,
    }
    for field, value in expected.items():
        if currentness.get(field) != value:
            raise ValueError("SERVER_PRODUCT_API_CURRENTNESS_MISMATCH:" + field)
    if Path(str(currentness.get("binding_receipt_path") or "")).resolve() != binding_path.resolve():
        raise ValueError("SERVER_PRODUCT_API_CURRENTNESS_RECEIPT_MISMATCH")
    export_sha = _required_text(
        currentness.get("export_sha256"),
        "SERVER_PRODUCT_API_CURRENTNESS_EXPORT_SHA256_INVALID",
        re.compile(r"^[0-9a-f]{64}$"),
    )
    return {
        **source_binding,
        "state": "INSTALLED_DECLARATION_READBACK_VERIFIED",
        "binding_receipt_path": str(binding_path.resolve()),
        "currentness_ref": _required_text(
            currentness.get("currentness_ref"),
            "SERVER_PRODUCT_API_CURRENTNESS_REF_INVALID"),
        "installed_export_sha256": export_sha,
        "source_custody_verified": True,
        "custody_verified": True,
        "admission_eligible": True,
        "service_advertisement_eligible": True,
    }


def _invalidate_binding(binding_path, source_binding):
    path = Path(binding_path)
    if not path.exists():
        return {
            "schema": PRODUCT_API_TOMBSTONE_SCHEMA,
            "state": "NOT_CREATED",
            "binding_receipt_path": str(path),
            "service_advertisement_eligible": False,
            "effect_authority": False,
            "provider_effect": False,
        }
    if path.is_symlink() or not path.is_file():
        raise ValueError("SERVER_PRODUCT_API_BINDING_INVALIDATION_CUSTODY_INVALID")
    raw = path.read_bytes()
    try:
        original = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise ValueError("SERVER_PRODUCT_API_BINDING_INVALIDATION_SOURCE_INVALID") from exc
    history_path = path.with_name(path.name + ".history.json")
    history = {
        "schema": PRODUCT_API_HISTORY_SCHEMA,
        "state": "HISTORICAL_BOUND_RECEIPT_RETAINED",
        "binding_receipt_path": str(path.resolve()),
        "original_receipt_sha256": hashlib.sha256(raw).hexdigest(),
        "original_receipt": original,
        "effect_authority": False,
        "provider_effect": False,
    }
    _write_private_json(history_path, history)
    tombstone = {
        "schema": PRODUCT_API_TOMBSTONE_SCHEMA,
        "state": "ROLLED_BACK_READBACK_VERIFIED",
        "binding_receipt_path": str(path.resolve()),
        "history_path": str(history_path.resolve()),
        "original_receipt_sha256": history["original_receipt_sha256"],
        "declaration_ref": source_binding["declaration_ref"],
        "declaration_generation": source_binding["declaration_generation"],
        "product_ref": source_binding["product_ref"],
        "api_ref": source_binding["api_ref"],
        "runtime_ref": source_binding["runtime_ref"],
        "service_advertisement_eligible": False,
        "effect_authority": False,
        "provider_effect": False,
    }
    _write_private_json(path, tombstone, replace=True)
    try:
        verify_dependency_binding_receipt(
            path,
            expected_dependency_id=source_binding["dependency_id"],
            expected_owner_repo=source_binding["owner_repo"],
            expected_generation=source_binding["accepted_generation"],
        )
    except (DependencyReceiptVerificationError, OSError, ValueError):
        return tombstone
    raise ValueError("SERVER_PRODUCT_API_BINDING_STILL_VERIFIES_AFTER_ROLLBACK")


def prepare_server_package(package_root, home, permissions):
    pkg = _CORE_LOAD_SERVER_PACKAGE(package_root)
    core_plan = _CORE_PREPARE_LOADED_SERVER_PACKAGE(pkg, home, permissions)
    if pkg["manifest"].fixture:
        return core_plan
    context = _PRODUCT_API_CONTEXT.get()
    binding = _source_product_api_binding(pkg, context)
    return {
        **core_plan,
        "product_api_binding": binding,
        "service_advertisement_eligible": False,
    }


def apply_server_package(package_root, home, permissions, reviewed_plan, receipt_path, approved):
    pkg = _CORE_LOAD_SERVER_PACKAGE(package_root)
    if pkg["manifest"].fixture:
        return _CORE_APPLY_SERVER_PACKAGE(
            package_root, home, permissions, reviewed_plan, receipt_path, approved)
    context = _PRODUCT_API_CONTEXT.get()
    live = prepare_server_package(package_root, home, permissions)
    if live != reviewed_plan:
        raise ValueError("SERVER_PACKAGE_PLAN_CHANGED_SINCE_REVIEW")
    core_review = _core_plan(reviewed_plan)
    binding_path = _binding_receipt_path(receipt_path)
    applied = False
    try:
        effect = _CORE_APPLY_SERVER_PACKAGE(
            package_root, home, permissions, core_review, receipt_path, approved)
        applied = True
        _persist_dependency_binding(pkg, home, reviewed_plan, receipt_path, binding_path)
        installed_binding = _reopen_installed_binding(
            context, reviewed_plan["product_api_binding"], binding_path)
        return {
            **effect,
            "product_api_binding": installed_binding,
            "service_advertisement_eligible": True,
        }
    except Exception as exc:
        if not applied:
            raise
        try:
            _CORE_ROLLBACK_SERVER_PACKAGE(
                home, permissions, core_review, receipt_path, True)
            _invalidate_binding(binding_path, reviewed_plan["product_api_binding"])
        except Exception as rollback_error:
            raise ValueError(
                "SERVER_PRODUCT_API_BINDING_FAILED_ROLLBACK_UNCERTAIN") from rollback_error
        raise ValueError("SERVER_PRODUCT_API_BINDING_FAILED_ROLLED_BACK") from exc


def rollback_server_package(home, permissions, reviewed_plan, receipt_path, approved):
    if "product_api_binding" not in reviewed_plan:
        return _CORE_ROLLBACK_SERVER_PACKAGE(
            home, permissions, reviewed_plan, receipt_path, approved)
    core_review = _core_plan(reviewed_plan)
    result = _CORE_ROLLBACK_SERVER_PACKAGE(
        home, permissions, core_review, receipt_path, approved)
    binding_path = _binding_receipt_path(receipt_path)
    try:
        tombstone = _invalidate_binding(
            binding_path, reviewed_plan["product_api_binding"])
    except Exception as exc:
        raise ValueError(
            "SERVER_PRODUCT_API_BINDING_ROLLBACK_EVIDENCE_UNCERTAIN") from exc
    return {
        **result,
        "product_api_binding": tombstone,
        "service_advertisement_eligible": False,
    }
