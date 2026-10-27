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
import re
import tempfile
import urllib.request
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from .discovery import xdg_roots
from .manifest import load_manifest, sha256_file, verify_payload
from .transaction import apply_install, plan_install, rollback

SCHEMA = "xiio-installer-bundle-profile-v1"
BASELINE_ROLES = frozenset(("cli", "ibal", "switchboard", "bins", "ward", "inbox"))
SAFE_ID = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MAX_LOCK_BYTES = 131072
MAX_ARTIFACT_BYTES = 256 * 1024 * 1024
DEFAULT_RELEASE_HOSTS = frozenset((
    "github.com", "raw.githubusercontent.com",
    "release-assets.githubusercontent.com", "objects.githubusercontent.com"
))


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


def _safe_url(raw: object, allowed_hosts: frozenset[str]) -> str:
    _require(isinstance(raw, str) and len(raw) <= 2048, "BUNDLE_URL_INVALID")
    try:
        u = urlsplit(raw)
    except ValueError as exc:
        raise BundleError("BUNDLE_URL_INVALID") from exc
    _require(u.scheme == "https" and u.hostname in allowed_hosts
             and u.port in (None, 443) and not u.username and not u.password
             and not u.query and not u.fragment and u.path.startswith("/")
             and "//" not in u.path and "\\" not in u.path,
             "BUNDLE_URL_NOT_APPROVED")
    return raw


class _HTTPSRedirectOnly(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_hosts: frozenset[str]):
        super().__init__()
        self.allowed_hosts = allowed_hosts

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _safe_url(newurl, self.allowed_hosts)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch_https(url: str, dest: Path, limit: int,
                 allowed_hosts: frozenset[str]) -> None:
    """HTTPS-only; no ambient auth headers, cookies, tokens or GitHub API calls."""
    opener = urllib.request.build_opener(_HTTPSRedirectOnly(allowed_hosts))
    request = urllib.request.Request(url, headers={"Accept": "application/octet-stream"})
    with opener.open(request, timeout=20) as response:
        _safe_url(response.geturl(), allowed_hosts)
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
                        allowed_hosts: frozenset[str] = DEFAULT_RELEASE_HOSTS):
    """Read a pinned projection of existing per-product manifests, not an SSOT.

    The caller must obtain its trusted lock digest from the installed release
    authority. A self-asserted fixture/QUALIFIED flag is never runtime authority.
    """
    lock = Path(lock)
    raw = _safe_existing_file(lock, MAX_LOCK_BYTES)
    try:
        profile = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise BundleError("BUNDLE_LOCK_JSON_INVALID") from exc
    _require(isinstance(profile, dict) and profile.get("schema_version") == SCHEMA,
             "BUNDLE_LOCK_SCHEMA_INVALID")
    _require(set(profile) == {"schema_version", "profile_id", "fixture", "products"},
             "BUNDLE_LOCK_FIELDS_INVALID")
    profile_id = profile["profile_id"]
    _require(isinstance(profile_id, str) and SAFE_ID.fullmatch(profile_id),
             "BUNDLE_PROFILE_ID_INVALID")
    fixture = profile["fixture"]
    _require(isinstance(fixture, bool), "BUNDLE_FIXTURE_FLAG_INVALID")
    rows = profile["products"]
    _require(isinstance(rows, list) and 0 < len(rows) <= 32,
             "BUNDLE_PRODUCT_COUNT_INVALID")
    products = {}
    destinations = set()
    for row in rows:
        _require(isinstance(row, dict) and set(row) ==
                 {"role", "product_id", "manifest", "manifest_sha256",
                  "depends_on", "payload_urls"},
                 "BUNDLE_PRODUCT_FIELDS_INVALID")
        role = row["role"]
        _require(isinstance(role, str) and SAFE_ID.fullmatch(role)
                 and role not in products, "BUNDLE_PRODUCT_ROLE_INVALID")
        product_id = row["product_id"]
        _require(isinstance(product_id, str) and 0 < len(product_id) <= 128,
                 "BUNDLE_PRODUCT_ID_INVALID")
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
        _require(manifest.product_id == product_id and manifest.fixture == fixture,
                 "BUNDLE_PRODUCT_MANIFEST_IDENTITY_MISMATCH")
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
    if not fixture:
        _require(set(products) == BASELINE_ROLES,
                 "BUNDLE_BASELINE_REQUIRED_PRODUCT_MISSING")
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

    for role in sorted(products):
        visit(role)
    return {
        "profile_id": profile_id, "fixture": fixture,
        "lock_sha256": _sha(raw), "ordered_roles": tuple(ordered),
        "products": products, "release_source_observed": True,
        "runtime_authority": False
    }


def install_bundle(lock: Path, *, approved_lock_sha256: str,
                   env: dict[str, str] | None = None,
                   allowed_hosts: frozenset[str] = DEFAULT_RELEASE_HOSTS,
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
    roots = xdg_roots(env)
    state_root = roots["xdg_state"] / "xi-io" / "installer" / "bundles" / profile["profile_id"]
    state_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    _require(not state_root.is_symlink(), "BUNDLE_STATE_ROOT_UNTRUSTED")
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

        lockfile = state_root / "apply.lock"
        with lockfile.open("a+b") as lock_fd:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for role in profile["ordered_roles"]:
                manifest = profile["products"][role][0]
                plan_install(manifest, staged[role], env)
            applied = []
            try:
                for role in profile["ordered_roles"]:
                    manifest = profile["products"][role][0]
                    receipt = state_root / (role + "-" + manifest.version.replace("/", "-")
                                            + "-" + approved_lock_sha256[:12] + ".receipt.json")
                    _require(not receipt.exists() and not receipt.is_symlink(),
                             "BUNDLE_RECEIPT_ALREADY_EXISTS")
                    apply_install(manifest, staged[role], receipt, env)
                    applied.append(receipt)
                    if fail_after_product is not None and len(applied) == fail_after_product:
                        raise BundleError("BUNDLE_TEST_INJECTED_FAILURE")
            except Exception as cause:
                failures = []
                for receipt in reversed(applied):
                    try:
                        rollback(receipt, env)
                    except Exception:
                        failures.append(receipt.name)
                if failures:
                    raise BundleError("BUNDLE_PARTIAL_ROLLBACK_UNVERIFIED_DO_NOT_RETRY") from cause
                raise BundleError("BUNDLE_APPLY_FAILED_ROLLED_BACK") from cause
            finally:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
            return {
                "schema_version": "xiio-installer-bundle-result-v1",
                "state": "INSTALLED_BYTES_VERIFIED",
                "profile_id": profile["profile_id"],
                "lock_sha256": approved_lock_sha256,
                "roles": list(profile["ordered_roles"]),
                "receipt_count": len(applied),
                "runtime_qualified": False, "authority_granted": False,
                "device_connected": False, "child_services_started": False
            }
