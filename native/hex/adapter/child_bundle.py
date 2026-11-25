"""Verified child-product acquisition and composition for the EXISTING XI-IO installer.

The existing xiio_installer.manifest and xiio_installer.transaction modules own
individual product installation, receipts and rollback. This adapter only joins
qualified, immutable child artifacts before those kernel operations are allowed.
No new service, identity, entitlement, package manager, scheduler or credential store.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import platform
import re
import stat
import tempfile
import urllib.request
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from xiio_installer.discovery import xdg_roots
from xiio_installer.dependency_binding import compile_dependency_binding_receipt, _dep, DependencyBindingError
from xiio_installer.manifest import load_manifest, sha256_file, verify_payload
from xiio_installer.transaction import (TransactionError, apply_install, plan_install,
    qualify_precommand_install_plans, qualify_precommand_manifests, rollback)

SCHEMA = "xiio-installer-bundle-profile-v1"
SAFE_ID = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MAX_LOCK_BYTES = 131072
MAX_ARTIFACT_BYTES = 256 * 1024 * 1024
# The installer has no built-in release provider. The trusted release
# catalogue/adapter must supply its exact HTTPS provider hosts explicitly.
# A GitHub source checkout, a fixture flag, or a customer-supplied lock is not
# an authorization to download arbitrary provider artifacts.
HOST_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def _bound_release_hosts(allowed_hosts: frozenset[str] | None) -> frozenset[str]:
    _require(isinstance(allowed_hosts, frozenset) and bool(allowed_hosts),
             "BUNDLE_RELEASE_PROVIDER_UNBOUND")
    for host in allowed_hosts:
        _require(isinstance(host, str) and len(host) <= 253 and "." in host
                 and host == host.lower()
                 and all(HOST_LABEL.fullmatch(label) for label in host.split("."))
                 and not host.split(".")[-1].isdigit()
                 and not host.endswith((".local", ".localhost")),
                 "BUNDLE_RELEASE_PROVIDER_HOST_INVALID")
    return allowed_hosts


class BundleError(ValueError):
    """Typed refusal. Never includes credentials, user paths or response content."""


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise BundleError(reason)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_rel(value: object, reason: str) -> str:
    _require(isinstance(value, str) and 0 < len(value) < 256
             and "\x00" not in value and "\\" not in value, reason)
    path = PurePosixPath(value)
    _require(not path.is_absolute() and ".." not in path.parts
             and str(path) not in ("", ".") and str(path) == value, reason)
    return value


def _safe_existing_file(path: Path, limit: int) -> bytes:
    _require(not path.is_symlink() and path.is_file(), "BUNDLE_SOURCE_FILE_UNTRUSTED")
    size = path.stat().st_size
    _require(0 < size <= limit, "BUNDLE_SOURCE_SIZE_INVALID")
    data = path.read_bytes()
    _require(len(data) == size, "BUNDLE_SOURCE_CHANGED")
    return data


def _validate_url_spelling(raw: object) -> None:
    # Reject raw bytes that URL parsers/transports discard or reinterpret.
    # Do not normalize the publisher's approved URL into a different request.
    _require(isinstance(raw, str) and len(raw) <= 2048
             and not any(ord(char) <= 32 or ord(char) == 127 or char.isspace()
                         for char in raw), "BUNDLE_URL_INVALID")


def _safe_url(raw: object, allowed_hosts: frozenset[str], *,
              redirect: bool = False) -> str:
    _validate_url_spelling(raw)
    try:
        u = urlsplit(raw)
        port = u.port  # urllib validates the port lazily; keep its errors typed.
    except ValueError as exc:
        raise BundleError("BUNDLE_URL_INVALID") from exc
    _require(u.scheme == "https" and u.hostname in allowed_hosts
             and port in (None, 443) and not u.username and not u.password
             and not u.fragment and (not u.query or redirect)
             and u.path.startswith("/")
             and "//" not in u.path and "\\" not in u.path,
             "BUNDLE_URL_NOT_APPROVED")
    return raw


class _HTTPSRedirectOnly(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_hosts: frozenset[str]):
        super().__init__()
        self.allowed_hosts = allowed_hosts

    def http_error_302(self, req, fp, code, msg, headers):
        # urllib parses and quotes Location before redirect_request. Inspect
        # the selected raw header first so that it cannot erase controls.
        for name in ("location", "uri"):
            if name in headers:
                _validate_url_spelling(headers[name])
                break
        return super().http_error_302(req, fp, code, msg, headers)

    http_error_301 = http_error_303 = http_error_307 = http_error_308 = http_error_302

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _safe_url(newurl, self.allowed_hosts, redirect=True)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch_https(url: str, dest: Path, limit: int,
                 allowed_hosts: frozenset[str]) -> None:
    """HTTPS-only; no ambient auth headers, cookies, tokens or GitHub API calls."""
    opener = urllib.request.build_opener(_HTTPSRedirectOnly(allowed_hosts))
    request = urllib.request.Request(url, headers={"Accept": "application/octet-stream"})
    with opener.open(request, timeout=20) as response:
        _safe_url(response.geturl(), allowed_hosts, redirect=True)
        _require(getattr(response, "status", 200) == 200, "BUNDLE_DOWNLOAD_HTTP_FAILED")
        declared = response.headers.get("Content-Length")
        if declared is not None:
            _require(declared.isdigit() and int(declared) <= limit,
                     "BUNDLE_DOWNLOAD_DECLARED_SIZE_INVALID")
        count = 0
        with dest.open("xb") as out:
            while True:
                chunk = response.read(min(1024 * 1024, limit + 1 - count))
                if not chunk:
                    break
                count += len(chunk)
                _require(count <= limit, "BUNDLE_DOWNLOAD_TOO_LARGE")
                out.write(chunk)
            out.flush()
            os.fsync(out.fileno())


def load_bundle_profile(lock: Path, *,
                        allowed_hosts: frozenset[str] | None = None):
    """Read a pinned projection of existing per-product manifests, not an SSOT.

    The caller must obtain its trusted lock digest AND approved release hosts
    from its current installed release authority. Neither the lock nor the
    provider hostname itself establishes release, Work or effect authority.
    """
    allowed_hosts = _bound_release_hosts(allowed_hosts)
    lock = Path(lock)
    raw = _safe_existing_file(lock, MAX_LOCK_BYTES)
    try:
        profile = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise BundleError("BUNDLE_LOCK_JSON_INVALID") from exc
    _require(isinstance(profile, dict) and profile.get("schema_version") == SCHEMA,
             "BUNDLE_LOCK_SCHEMA_INVALID")
    base_fields = {"schema_version", "profile_id", "fixture", "products"}
    profile_mode = profile.get("profile_mode", "suite")
    _require(profile_mode in ("suite", "product"), "BUNDLE_PROFILE_MODE_INVALID")
    if profile_mode == "suite":
        _require(set(profile) == base_fields, "BUNDLE_LOCK_FIELDS_INVALID")
        product_root_role = None
    else:
        _require(set(profile) == base_fields | {"profile_mode", "product_root_role"},
                 "BUNDLE_LOCK_FIELDS_INVALID")
        product_root_role = profile.get("product_root_role")
        _require(isinstance(product_root_role, str) and SAFE_ID.fullmatch(product_root_role),
                 "BUNDLE_PRODUCT_ROOT_INVALID")
    profile_id = profile["profile_id"]
    _require(isinstance(profile_id, str) and SAFE_ID.fullmatch(profile_id),
             "BUNDLE_PROFILE_ID_INVALID")
    fixture = profile["fixture"]
    _require(isinstance(fixture, bool), "BUNDLE_FIXTURE_FLAG_INVALID")
    rows = profile["products"]
    _require(isinstance(rows, list) and 0 < len(rows) <= 32,
             "BUNDLE_PRODUCT_COUNT_INVALID")
    products = {}
    # Product-mode descriptors are exact, separately checked lock children.
    # Strict Installer manifests never carry runtime_exports or release authority.
    product_descriptors = {}
    release_generations = {}
    product_ids = set()
    destinations = set()
    for row in rows:
        row_fields = {"role", "product_id", "manifest", "manifest_sha256",
                      "depends_on", "payload_urls"}
        _require(isinstance(row, dict), "BUNDLE_PRODUCT_FIELDS_INVALID")
        if profile_mode == "product":
            # A dependency descriptor is a different coordinate from the
            # product manifest, never an inferred field in manifest.raw.
            extra = set(row) - row_fields
            _require(row_fields <= set(row) and extra in ({"release_generation"},
                               {"release_generation", "descriptor_ref", "descriptor_sha256"}),
                     "BUNDLE_PRODUCT_FIELDS_INVALID")
        else:
            _require(set(row) == row_fields, "BUNDLE_PRODUCT_FIELDS_INVALID")
        role = row["role"]
        _require(isinstance(role, str) and SAFE_ID.fullmatch(role)
                 and role not in products, "BUNDLE_PRODUCT_ROLE_INVALID")
        product_id = row["product_id"]
        _require(isinstance(product_id, str) and 0 < len(product_id) <= 128,
                 "BUNDLE_PRODUCT_ID_INVALID")
        # Role aliases cannot cause the same registered product to be selected
        # and installed as two independently receipted bundle children.
        _require(product_id not in product_ids, "BUNDLE_DUPLICATE_PRODUCT_ID")
        product_ids.add(product_id)
        manifest_path = _safe_rel(row["manifest"], "BUNDLE_MANIFEST_PATH_INVALID")
        claimed_sha = row["manifest_sha256"]
        _require(isinstance(claimed_sha, str) and SHA256.fullmatch(claimed_sha),
                 "BUNDLE_MANIFEST_DIGEST_INVALID")
        file = lock.parent / manifest_path
        _require(file.resolve().is_relative_to(lock.parent.resolve())
                 and not file.is_symlink(), "BUNDLE_MANIFEST_PATH_ESCAPES_LOCK")
        manifest_bytes = _safe_existing_file(file, MAX_LOCK_BYTES)
        _require(_sha(manifest_bytes) == claimed_sha,
                 "BUNDLE_MANIFEST_DIGEST_MISMATCH")
        manifest = load_manifest(file)
        _require(isinstance(manifest.version, str) and
                 re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.+_-]{0,95}", manifest.version),
                 "BUNDLE_PRODUCT_VERSION_INVALID")
        _require(manifest.product_id == product_id and manifest.fixture == fixture,
                 "BUNDLE_PRODUCT_MANIFEST_IDENTITY_MISMATCH")
        if profile_mode == "product":
            # Product mode refuses the historical manifest.raw shortcut even
            # if a permissive old parser accepts the extra keys.
            _require(not any(key in manifest.raw for key in
                             ("accepted_generation", "runtime_exports",
                              "dependency_id", "owner_repo")),
                     "BUNDLE_PRODUCT_MANIFEST_METADATA_MISPLACED")
            generation = row.get("release_generation")
            _require(isinstance(generation, str) and
                     re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", generation),
                     "BUNDLE_RELEASE_GENERATION_UNBOUND")
            release_generations[role] = generation
            if "descriptor_ref" in row:
                descriptor_ref = _safe_rel(row["descriptor_ref"],
                                           "BUNDLE_DESCRIPTOR_PATH_INVALID")
                descriptor_digest = row["descriptor_sha256"]
                _require(isinstance(descriptor_digest, str) and
                         SHA256.fullmatch(descriptor_digest),
                         "BUNDLE_DESCRIPTOR_DIGEST_INVALID")
                descriptor_path = lock.parent / descriptor_ref
                _require(descriptor_path.resolve().is_relative_to(lock.parent.resolve())
                         and not descriptor_path.is_symlink(),
                         "BUNDLE_DESCRIPTOR_PATH_UNTRUSTED")
                descriptor_bytes = _safe_existing_file(descriptor_path, MAX_LOCK_BYTES)
                _require(_sha(descriptor_bytes) == descriptor_digest,
                         "BUNDLE_DESCRIPTOR_DIGEST_MISMATCH")
                try:
                    descriptor = json.loads(descriptor_bytes)
                except (ValueError, UnicodeError) as exc:
                    raise BundleError("BUNDLE_DESCRIPTOR_JSON_INVALID") from exc
                _require(isinstance(descriptor, dict),
                         "BUNDLE_DESCRIPTOR_SCHEMA_INVALID")
                try:
                    dependency_id, owner_repo, accepted, exports = _dep(manifest, descriptor)
                except DependencyBindingError as exc:
                    raise BundleError("BUNDLE_DESCRIPTOR_CONTRACT_INVALID") from exc
                _require(accepted == generation,
                         "BUNDLE_DESCRIPTOR_RELEASE_GENERATION_MISMATCH")
                product_descriptors[role] = {
                    "ref": descriptor_ref,
                    "sha256": descriptor_digest,
                    "data": descriptor,
                    "dependency_id": dependency_id,
                    "owner_repo": owner_repo,
                    "generation": accepted,
                    "export_count": len(exports),
                }
            else:
                # Every transitive runtime child must have a descriptor; a
                # selected root without runtime exports needs none.
                _require(role == product_root_role,
                         "BUNDLE_RUNTIME_DEPENDENCY_DESCRIPTOR_REQUIRED")
        deps = row["depends_on"]
        _require(isinstance(deps, list) and len(deps) <= 32
                 and len(set(map(str, deps))) == len(deps)
                 and all(isinstance(x, str) and SAFE_ID.fullmatch(x) for x in deps),
                 "BUNDLE_DEPENDENCIES_INVALID")
        urls = row["payload_urls"]
        _require(isinstance(urls, dict) and
                 set(urls) == {entry.source for entry in manifest.entries},
                 "BUNDLE_PAYLOAD_COVERAGE_INVALID")
        for entry in manifest.entries:
            _safe_url(urls[entry.source], allowed_hosts)
            _require(entry.size <= MAX_ARTIFACT_BYTES,
                     "BUNDLE_ARTIFACT_SIZE_LIMIT")
            # Reuse only the safe non-destructive XDG transaction mode for this
            # first release; backup/replace upgrades remain a separate approval.
            _require(entry.overwrite in ("fail", "same_hash_ok"),
                     "BUNDLE_REPLACEMENT_NOT_ADMITTED")
            key = (entry.destination_scope, entry.destination)
            _require(key not in destinations, "BUNDLE_DESTINATION_COLLISION")
            destinations.add(key)
        products[role] = (manifest, dict(urls), tuple(deps))
    # Suite membership comes from the verified product lock and registered
    # product relationships, never from this installer's donor product list.
    if profile_mode == "product":
        _require(product_root_role in products, "BUNDLE_PRODUCT_ROOT_NOT_IN_PROFILE")
    ordered = []
    temporary = set()
    permanent = set()

    def visit(role: str):
        _require(role in products, "BUNDLE_DEPENDENCY_NOT_IN_PROFILE")
        _require(role not in temporary, "BUNDLE_DEPENDENCY_CYCLE")
        if role in permanent:
            return
        temporary.add(role)
        for dependency in products[role][2]:
            visit(dependency)
        temporary.remove(role)
        permanent.add(role)
        ordered.append(role)

    if profile_mode == "suite":
        for role in sorted(products):
            visit(role)
    else:
        visit(product_root_role)
        _require(permanent == set(products),
                 "BUNDLE_PRODUCT_PROFILE_NOT_EXACT_DEPENDENCY_CLOSURE")
    return {
        "profile_id": profile_id, "fixture": fixture,
        "profile_mode": profile_mode, "product_root_role": product_root_role,
        "lock_sha256": _sha(raw), "ordered_roles": tuple(ordered),
        "products": products,
        "product_descriptors": product_descriptors,
        "release_generations": release_generations,
        "release_source_observed": True,
        "runtime_authority": False
    }


def _secure_ensure_state_root(state_root: Path) -> int:
    """Traverse and create state_root stepwise using race-resistant O_NOFOLLOW / dir_fd.

    Refuses immediately if any existing ancestor or target component is a symlink or non-directory.
    Creates missing directories stepwise with mode 0o700, pinning each with O_NOFOLLOW.
    Returns the open directory file descriptor pinned to the verified state_root.
    """
    _require(isinstance(state_root, Path), "BUNDLE_STATE_ROOT_UNTRUSTED")
    _require(state_root.is_absolute(), "BUNDLE_STATE_ROOT_UNTRUSTED")
    parts = state_root.parts
    _require(len(parts) > 1 and parts[0] == "/", "BUNDLE_STATE_ROOT_UNTRUSTED")

    open_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC
    nofollow_flags = open_flags | os.O_NOFOLLOW

    try:
        current_fd = os.open("/", open_flags)
    except OSError as exc:
        raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc

    try:
        for part in parts[1:]:
            _require(bool(part) and part not in (".", "..") and "\x00" not in part and "/" not in part,
                     "BUNDLE_STATE_ROOT_UNTRUSTED")
            try:
                st = os.lstat(part, dir_fd=current_fd)
            except FileNotFoundError:
                try:
                    os.mkdir(part, mode=0o700, dir_fd=current_fd)
                except OSError as exc:
                    raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc
                try:
                    st = os.lstat(part, dir_fd=current_fd)
                except OSError as exc:
                    raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc
            except OSError as exc:
                raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc

            if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
                raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED")

            try:
                next_fd = os.open(part, nofollow_flags, dir_fd=current_fd)
            except OSError as exc:
                raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc

            fst = os.fstat(next_fd)
            if stat.S_ISLNK(fst.st_mode) or not stat.S_ISDIR(fst.st_mode):
                os.close(next_fd)
                raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED")

            os.close(current_fd)
            current_fd = next_fd
    except Exception:
        if current_fd >= 0:
            try:
                os.close(current_fd)
            except OSError:
                pass
        raise

    return current_fd




def _atomic_private_json(path: Path, value: dict) -> bool:
    _require(not path.is_symlink(), "BUNDLE_RELEASE_RECEIPT_SYMLINK_FORBIDDEN")
    if path.exists():
        try:
            existing=json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, UnicodeError) as exc:
            raise BundleError("BUNDLE_DERIVED_RECEIPT_CONFLICT") from exc
        _require(existing==value and (path.stat().st_mode & 0o777)==0o600,
                 "BUNDLE_DERIVED_RECEIPT_CONFLICT")
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="."+path.name+".", suffix=".tmp", dir=path.parent)
    os.close(fd); p=Path(tmp)
    try:
        p.write_text(json.dumps(value, indent=2, sort_keys=True)+"\n", encoding="utf-8")
        os.chmod(p, 0o600); os.replace(p, path)
    finally:
        if p.exists(): p.unlink()
    return True

def _release_distribution_receipt(manifest, transaction_receipt: Path, output: Path, *,
                                  release_generation: str | None = None) -> tuple[dict, bool] | None:
    # The current product lock supplies the generation. The original
    # manifest.raw lookup survives only for historical suite compatibility.
    generation = (release_generation if release_generation is not None
                  else str(manifest.raw.get("accepted_generation") or "").strip())
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", generation):
        return None
    tx=json.loads(transaction_receipt.read_text(encoding="utf-8"))
    _require(tx.get("schema_version")=="xiio-installer-receipt-v1"
             and tx.get("product_id")==manifest.product_id
             and len(tx.get("entries") or [])==len(manifest.entries),
             "BUNDLE_RELEASE_TRANSACTION_RECEIPT_INVALID")
    value={"schema":"xiio.installer.child-generation-receipt/v1",
           "product_ref":manifest.product_id,"release_generation":generation,
           "bundle_state":"INSTALLED_BYTES_VERIFIED","readback_verified":True,
           "transaction_receipt":transaction_receipt.name,
           "effect_authority":False,"provider_effect":False}
    created=_atomic_private_json(output,value)
    reread=json.loads(output.read_text(encoding="utf-8"))
    _require(reread==value and (output.stat().st_mode & 0o777)==0o600,
             "BUNDLE_RELEASE_RECEIPT_READBACK_FAILED")
    return value,created


def install_bundle(lock: Path, *, approved_lock_sha256: str,
                   env: dict[str, str] | None = None,
                   application_root: Path | None = None,
                   allowed_hosts: frozenset[str] | None = None,
                   fetch=None, fail_after_product: int | None = None):
    """Acquire all children, verify all bytes, then apply existing transactions.

    Effects are explicitly approved by the caller's exact bundled profile SHA.
    This is installation/custody only, not proof of runnable or connected apps.
    """
    _require(isinstance(approved_lock_sha256, str) and
             SHA256.fullmatch(approved_lock_sha256), "BUNDLE_APPROVAL_INVALID")
    profile = load_bundle_profile(lock, allowed_hosts=allowed_hosts)
    _require(profile["lock_sha256"] == approved_lock_sha256,
             "BUNDLE_APPROVAL_DIGEST_MISMATCH")
    application_roles = tuple(
        role for role in profile["ordered_roles"]
        if any(entry.destination_scope == "application"
               for entry in profile["products"][role][0].entries)
    )
    if application_roles:
        _require(isinstance(application_root, Path),
                 "BUNDLE_APPLICATION_ROOT_REQUIRED")
        _require(application_root.is_absolute()
                 and application_root.is_dir()
                 and not application_root.is_symlink(),
                 "BUNDLE_APPLICATION_ROOT_INVALID")
        application_root = application_root.resolve(strict=True)
    else:
        _require(application_root is None,
                 "BUNDLE_APPLICATION_ROOT_NOT_APPLICABLE")
    roots = xdg_roots(env)
    if application_root is not None:
        roots["application"] = application_root
    state_root = roots["xdg_state"] / "xi-io" / "installer" / "bundles" / profile["profile_id"]
    observed_machine = {
        "os": platform.system(), "architecture": platform.machine(), "family": "linux"
    }
    receipts = {}
    for role in profile["ordered_roles"]:
        manifest = profile["products"][role][0]
        receipts[role] = state_root / (role + "-" + manifest.version.replace("/", "-")
                                       + "-" + approved_lock_sha256[:12] + ".receipt.json")
    # Preserve existing trusted-state-root refusal before probing. No state
    # directories or payload are created during this read-only custody check.
    for component in (state_root, *state_root.parents):
        if component.is_symlink() or (component.exists() and not component.is_dir()):
            raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED")
    # Verify destination filesystems BEFORE staging/download/installation.
    # Only disposable probe files may be written and they must be cleaned.
    try:
        filesystem = qualify_precommand_manifests(
            [(profile["products"][role][0], receipts[role])
             for role in profile["ordered_roles"]],
            roots, machine_profile=observed_machine,
            additional_targets={state_root: {0o600}},
        )
    except TransactionError as exc:
        raise BundleError("BUNDLE_FILESYSTEM_UNQUALIFIED") from exc
    except OSError as exc:
        raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc

    state_fd = _secure_ensure_state_root(state_root)
    lock_fd = None
    try:
        # Cross-process lock acquired via descriptor anchor BEFORE any artifact acquisition
        try:
            lock_raw = os.open(
                "apply.lock",
                os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC,
                0o600,
                dir_fd=state_fd
            )
        except OSError as exc:
            raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc

        lock_fd = open(lock_raw, "a+b", closefd=True)
        try:
            fcntl.flock(lock_fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, OSError) as exc:
            raise BundleError("BUNDLE_INSTALLATION_IN_PROGRESS") from exc

        # Verify descriptor anchor matches state_root path under lock
        st_desc = os.fstat(state_fd)
        st_path = state_root.stat()
        _require(st_desc.st_ino == st_path.st_ino and st_desc.st_dev == st_path.st_dev,
                 "BUNDLE_STATE_ROOT_UNTRUSTED")

        fetcher = fetch or (lambda url, path, size: _fetch_https(url, path, size, allowed_hosts))
        _require(callable(fetcher), "BUNDLE_FETCH_UNAVAILABLE")

        with tempfile.TemporaryDirectory(prefix="xiio-stage-", dir=state_root) as tmp:
            staged = {}
            # Do not install a single product until EVERY product payload is pinned.
            for role in profile["ordered_roles"]:
                manifest, urls, _deps = profile["products"][role]
                root = Path(tmp) / role
                root.mkdir(mode=0o700)
                for entry in manifest.entries:
                    output = root / entry.source
                    output.parent.mkdir(parents=True, exist_ok=True)
                    fetcher(urls[entry.source], output, entry.size)
                    _require(not output.is_symlink() and output.is_file(),
                             "BUNDLE_DOWNLOADED_FILE_UNTRUSTED")
                    _require(output.stat().st_size == entry.size,
                             "BUNDLE_DOWNLOADED_SIZE_MISMATCH")
                    _require(sha256_file(output) == entry.sha256,
                             "BUNDLE_DOWNLOADED_DIGEST_MISMATCH")
                verify_payload(manifest, root)
                staged[role] = root
            _require(load_bundle_profile(lock, allowed_hosts=allowed_hosts)["lock_sha256"]
                     == approved_lock_sha256, "BUNDLE_LOCK_CHANGED_AFTER_ACQUISITION")

            plans = []
            for role in profile["ordered_roles"]:
                manifest = profile["products"][role][0]
                role_application_root = (
                    application_root
                    if any(entry.destination_scope == "application"
                           for entry in manifest.entries)
                    else None
                )
                plan = (
                    plan_install(manifest, staged[role], env, role_application_root)
                    if role_application_root is not None
                    else plan_install(manifest, staged[role], env)
                )
                plans.append((plan, roots, receipts[role]))
            # A new destination/profile after download cannot bypass the
            # Installer's current pre-command qualification.
            try:
                qualify_precommand_install_plans(
                    plans, machine_profile=observed_machine,
                    additional_targets={state_root: {0o600}},
                )
            except (TransactionError, OSError) as exc:
                raise BundleError("BUNDLE_FILESYSTEM_CHANGED_BEFORE_APPLY") from exc
            applied = []
            derived_receipts = []
            release_receipts = {}
            dependency_binding_receipts = {}
            try:
                for role in profile["ordered_roles"]:
                    manifest = profile["products"][role][0]
                    receipt = receipts[role]
                    _require(not receipt.exists() and not receipt.is_symlink(),
                             "BUNDLE_RECEIPT_ALREADY_EXISTS")
                    role_application_root = (
                        application_root
                        if any(entry.destination_scope == "application"
                               for entry in manifest.entries)
                        else None
                    )
                    if role_application_root is not None:
                        apply_install(manifest, staged[role], receipt, env,
                                      role_application_root)
                    else:
                        apply_install(manifest, staged[role], receipt, env)
                    applied.append(receipt)
                    release_path=state_root/(role+"-"+manifest.version.replace("/","-")+"-"+approved_lock_sha256[:12]+".release.json")
                    release_result=_release_distribution_receipt(
                        manifest,receipt,release_path,
                        release_generation=profile["release_generations"].get(role))
                    release_value=None
                    if release_result is not None:
                        release_value,release_created=release_result
                        if release_created:
                            derived_receipts.append(release_path)
                        release_receipts[role]={"path":str(release_path),"receipt":release_value}
                    descriptor_info = profile["product_descriptors"].get(role)
                    # Old suite fixtures retain their legacy behavior. In
                    # product mode ONLY the separately pinned descriptor can
                    # authorize a binding projection.
                    if descriptor_info is not None or (
                        profile["profile_mode"] == "suite" and
                        manifest.raw.get("runtime_exports")
                    ):
                        tx=json.loads(receipt.read_text(encoding="utf-8"))
                        binding_path=state_root/(role+"-"+manifest.version.replace("/","-")+"-"+approved_lock_sha256[:12]+".binding.json")
                        binding=compile_dependency_binding_receipt(
                            manifest,tx,env,
                            release_path if release_value is not None else None,
                            binding_receipt_path=binding_path,
                            descriptor=descriptor_info["data"] if descriptor_info is not None else None)
                        binding_created=_atomic_private_json(binding_path,binding)
                        if binding_created:
                            derived_receipts.append(binding_path)
                        dependency_binding_receipts[role]={"path":str(binding_path),"receipt":binding}
                    # Reopen the exact installed bytes after any dependency-binding
                    # consumer has verified its exported files. This preserves the
                    # existing drift/rollback classification while still proving the
                    # final installed product bytes and modes independently.
                    plan = next(item[0] for item in plans
                                if item[2] == receipt)
                    for item in plan:
                        root = roots.get(item.destination_scope)
                        _require(root is not None,
                                 "BUNDLE_READBACK_SCOPE_UNBOUND")
                        destination = root / item.destination
                        _require(not destination.is_symlink()
                                 and destination.is_file()
                                 and sha256_file(destination) == item.expected_sha256
                                 and stat.S_IMODE(destination.stat().st_mode)
                                     == item.expected_mode,
                                 "BUNDLE_INSTALLED_READBACK_MISMATCH")
                    if fail_after_product is not None and len(applied) == fail_after_product:
                        raise BundleError("BUNDLE_TEST_INJECTED_FAILURE")
            except Exception as cause:
                failures = []
                for derived in reversed(derived_receipts):
                    try:
                        derived.unlink(missing_ok=True)
                    except Exception:
                        failures.append(derived.name)
                for receipt in reversed(applied):
                    try:
                        receipt_doc = json.loads(
                            receipt.read_text(encoding="utf-8")
                        )
                        needs_application_root = any(
                            isinstance(item, dict)
                            and item.get("destination_scope") == "application"
                            for item in receipt_doc.get("entries", [])
                        )
                        if needs_application_root:
                            _require(application_root is not None,
                                     "BUNDLE_APPLICATION_ROOT_REQUIRED")
                            rollback(receipt, env, application_root)
                        else:
                            rollback(receipt, env)
                    except Exception:
                        failures.append(receipt.name)
                if failures:
                    raise BundleError("BUNDLE_PARTIAL_ROLLBACK_UNVERIFIED_DO_NOT_RETRY") from cause
                raise BundleError("BUNDLE_APPLY_FAILED_ROLLED_BACK") from cause

            return {
                "schema_version": "xiio-installer-bundle-result-v1",
                "state": "INSTALLED_BYTES_VERIFIED",
                "profile_id": profile["profile_id"],
                "lock_sha256": approved_lock_sha256,
                "roles": list(profile["ordered_roles"]),
                "receipt_count": len(applied),
                "release_distribution_receipts": release_receipts,
                "dependency_binding_receipts": dependency_binding_receipts,
                "filesystem_precommand_state": filesystem["state"],
                "application_root_bound": application_root is not None,
                "application_roles": list(application_roles),
                "runtime_qualified": False, "authority_granted": False,
                "device_connected": False, "child_services_started": False
            }
    finally:
        if lock_fd is not None:
            try:
                fcntl.flock(lock_fd.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
            try:
                lock_fd.close()
            except OSError:
                pass
        try:
            os.close(state_fd)
        except OSError:
            pass
