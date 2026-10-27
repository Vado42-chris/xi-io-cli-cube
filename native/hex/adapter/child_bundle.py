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
import stat
import tempfile
import urllib.request
from contextlib import contextmanager
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from xiio_installer.discovery import xdg_roots
from xiio_installer.manifest import load_manifest, sha256_file, verify_payload
from xiio_installer.transaction import apply_install, plan_install, rollback

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


def _safe_url(raw: object, allowed_hosts: frozenset[str], *,
              redirect: bool = False) -> str:
    _require(isinstance(raw, str) and len(raw) <= 2048, "BUNDLE_URL_INVALID")
    try:
        u = urlsplit(raw)
    except ValueError as exc:
        raise BundleError("BUNDLE_URL_INVALID") from exc
    _require(u.scheme == "https" and u.hostname in allowed_hosts
             and u.port in (None, 443) and not u.username and not u.password
             and not u.fragment and (not u.query or
                 (redirect and u.hostname in (
                     "release-assets.githubusercontent.com",
                     "objects.githubusercontent.com"
                 ))) and u.path.startswith("/")
             and "//" not in u.path and "\\" not in u.path,
             "BUNDLE_URL_NOT_APPROVED")
    return raw


class _HTTPSRedirectOnly(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_hosts: frozenset[str]):
        super().__init__()
        self.allowed_hosts = allowed_hosts

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
        _require(isinstance(manifest.version, str) and
                 re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.+_-]{0,95}", manifest.version),
                 "BUNDLE_PRODUCT_VERSION_INVALID")
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


def _secure_ensure_state_root(state_root: Path, *, retain_fd: bool = False):
    """Traverse and create state_root stepwise using race-resistant O_NOFOLLOW / dir_fd.

    Refuses immediately if any existing ancestor or target component is a symlink or non-directory.
    Creates missing directories stepwise with mode 0o700, pinning each with O_NOFOLLOW.
    """
    _require(isinstance(state_root, Path), "BUNDLE_STATE_ROOT_UNTRUSTED")
    _require(state_root.is_absolute(), "BUNDLE_STATE_ROOT_UNTRUSTED")
    parts = state_root.parts
    _require(len(parts) > 1 and parts[0] == "/", "BUNDLE_STATE_ROOT_UNTRUSTED")

    open_flags = getattr(os, "O_PATH", os.O_RDONLY) | os.O_DIRECTORY | os.O_CLOEXEC
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
    else:
        if retain_fd:
            return current_fd
        os.close(current_fd)

    return state_root

def _secure_observe_state_root(state_root: Path, *, retain_fd: bool = False,
                               require_existing: bool = False):
    """Observe current path under no-follow dirfds; never create it."""
    _require(isinstance(state_root, Path) and state_root.is_absolute(),
             "BUNDLE_STATE_ROOT_UNTRUSTED")
    flags = (getattr(os, "O_PATH", os.O_RDONLY) | os.O_DIRECTORY
             | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0))
    try:
        fd = os.open("/", flags)
    except OSError as exc:
        raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc
    try:
        for part in state_root.parts[1:]:
            _require(part not in ("", ".", "..", "/") and "\x00" not in part,
                     "BUNDLE_STATE_ROOT_UNTRUSTED")
            try:
                child = os.open(part, flags, dir_fd=fd)
            except FileNotFoundError as exc:
                if require_existing:
                    raise BundleError("BUNDLE_STATE_ROOT_CHANGED") from exc
                return state_root
            except OSError as exc:
                raise BundleError("BUNDLE_STATE_ROOT_UNTRUSTED") from exc
            try:
                fresh = os.fstat(child)
                source = os.stat(part, dir_fd=fd, follow_symlinks=False)
                _require(stat.S_ISDIR(fresh.st_mode)
                         and (fresh.st_dev, fresh.st_ino)
                         == (source.st_dev, source.st_ino),
                         "BUNDLE_STATE_ROOT_UNTRUSTED")
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        if retain_fd:
            answer = fd
            fd = -1
            return answer
        return state_root
    finally:
        if fd >= 0:
            os.close(fd)


def _assert_state_root_current(state_root: Path, root_fd: int) -> None:
    """Reopen original XDG path and compare its exact device/inode."""
    try:
        observed_fd = _secure_observe_state_root(
            state_root, retain_fd=True, require_existing=True)
    except (OSError, BundleError) as exc:
        raise BundleError("BUNDLE_STATE_ROOT_CHANGED") from exc
    try:
        wanted = os.fstat(root_fd)
        observed = os.fstat(observed_fd)
        _require(stat.S_ISDIR(wanted.st_mode)
                 and (wanted.st_dev, wanted.st_ino)
                 == (observed.st_dev, observed.st_ino),
                 "BUNDLE_STATE_ROOT_CHANGED")
    finally:
        os.close(observed_fd)

MAX_RECEIPT_BYTES = 2 * 1024 * 1024


def _bundle_receipt_path(state_root: Path, role: str, manifest: ProductManifest,
                         lock_sha256: str) -> Path:
    return state_root / (role + "-" + manifest.version.replace("/", "-")
                         + "-" + lock_sha256[:12] + ".receipt.json")


def _destination_path(entry, roots: dict[str, Path]) -> Path:
    root = roots[entry.destination_scope].resolve()
    candidate = root / entry.destination
    parent = candidate.parent.resolve(strict=False)
    _require(parent == root or root in parent.parents,
             "BUNDLE_DESTINATION_ESCAPES_SCOPE")
    return candidate


def _receipt_and_bytes_match(receipt: Path, manifest: ProductManifest,
                             roots: dict[str, Path]) -> None:
    raw = _safe_existing_file(receipt, MAX_RECEIPT_BYTES)
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise BundleError("BUNDLE_RECEIPT_JSON_INVALID") from exc
    _require(isinstance(data, dict)
             and data.get("schema_version") == "xiio-installer-receipt-v1"
             and data.get("product_id") == manifest.product_id
             and data.get("profile_id") == manifest.profile_id
             and data.get("version") == manifest.version
             and data.get("channel") == manifest.channel
             and data.get("fixture") == manifest.fixture,
             "BUNDLE_RECEIPT_IDENTITY_MISMATCH")
    rows = data.get("entries")
    _require(isinstance(rows, list) and len(rows) == len(manifest.entries),
             "BUNDLE_RECEIPT_DENOMINATOR_MISMATCH")
    keyed = {}
    for row in rows:
        _require(isinstance(row, dict), "BUNDLE_RECEIPT_ENTRY_INVALID")
        key = (row.get("source"), row.get("destination_scope"), row.get("destination"))
        _require(key not in keyed, "BUNDLE_RECEIPT_ENTRY_DUPLICATE")
        keyed[key] = row
    for entry in manifest.entries:
        key = (entry.source, entry.destination_scope, entry.destination)
        row = keyed.get(key)
        _require(row is not None
                 and row.get("expected_sha256") == entry.sha256
                 and row.get("installed_sha256") == entry.sha256
                 and row.get("expected_mode") == entry.mode
                 and row.get("installed_mode") == entry.mode,
                 "BUNDLE_RECEIPT_ENTRY_MISMATCH")
        dest = _destination_path(entry, roots)
        _require(not dest.is_symlink() and dest.is_file(),
                 "BUNDLE_INSTALLED_FILE_MISSING_OR_UNTRUSTED")
        _require(sha256_file(dest) == entry.sha256
                 and stat.S_IMODE(dest.stat().st_mode) == entry.mode,
                 "BUNDLE_INSTALLED_BYTES_DRIFT")


def _archive_rolled_back_receipt(state_root: Path, receipt: Path,
                                 root_fd: int) -> str:
    """Preserve exact rollback receipts under pinned directory custody."""
    _require(receipt.parent == state_root
             and not receipt.is_symlink() and receipt.is_file(),
             "BUNDLE_ROLLBACK_RECEIPT_UNTRUSTED")
    source_bytes = _safe_existing_file(receipt, MAX_RECEIPT_BYTES)
    try:
        os.mkdir("rolled-back", mode=0o700, dir_fd=root_fd)
    except FileExistsError:
        pass
    try:
        archive_fd = os.open("rolled-back",
                             os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
                             | getattr(os, "O_CLOEXEC", 0), dir_fd=root_fd)
    except OSError as exc:
        raise BundleError("BUNDLE_ROLLBACK_ARCHIVE_PATH_UNTRUSTED") from exc
    try:
        st = os.fstat(archive_fd)
        _require(stat.S_ISDIR(st.st_mode) and st.st_uid == os.getuid()
                 and not st.st_mode & 0o022,
                 "BUNDLE_ROLLBACK_ARCHIVE_PATH_UNTRUSTED")
        for attempt in range(1, 65):
            name = f"{receipt.stem}.rollback-{attempt:02d}.json"
            try:
                os.link(receipt.name, name, src_dir_fd=root_fd,
                        dst_dir_fd=archive_fd, follow_symlinks=False)
            except FileExistsError:
                continue
            except OSError as exc:
                raise BundleError("BUNDLE_ROLLBACK_ARCHIVE_FAILED") from exc
            target = state_root / "rolled-back" / name
            _require(not target.is_symlink()
                     and _safe_existing_file(target, MAX_RECEIPT_BYTES)
                     == source_bytes,
                     "BUNDLE_ROLLBACK_ARCHIVE_READBACK_FAILED")
            os.unlink(receipt.name, dir_fd=root_fd)
            _require(not receipt.exists() and not receipt.is_symlink(),
                     "BUNDLE_ROLLBACK_ACTIVE_RECEIPT_RETIRE_FAILED")
            os.fsync(archive_fd)
            return name
        raise BundleError("BUNDLE_ROLLBACK_ARCHIVE_EXHAUSTED")
    finally:
        os.close(archive_fd)

class _BundleApplyCustody:
    __slots__ = ("profile_id", "lock_sha256", "state_root", "fd",
                 "root_fd", "anchored_root")

    def __init__(self, profile_id, lock_sha256, state_root, fd, root_fd):
        self.profile_id = profile_id
        self.lock_sha256 = lock_sha256
        self.state_root = state_root
        self.fd = fd
        self.root_fd = root_fd
        self.anchored_root = Path("/proc/self/fd") / str(root_fd)


class _BundleInspectionCustody:
    __slots__ = ("profile_id", "lock_sha256", "state_root", "fd",
                 "root_fd", "anchored_root")

    def __init__(self, profile_id, lock_sha256, state_root, fd, root_fd):
        self.profile_id = profile_id
        self.lock_sha256 = lock_sha256
        self.state_root = state_root
        self.fd = fd
        self.root_fd = root_fd
        self.anchored_root = Path("/proc/self/fd") / str(root_fd)


def _bundle_state_root(profile, env: dict[str, str] | None, *, create: bool):
    roots = xdg_roots(env)
    state_root = roots["xdg_state"] / "xi-io" / "installer" / "bundles" / profile["profile_id"]
    if create:
        _secure_ensure_state_root(state_root)
    else:
        _secure_observe_state_root(state_root)
    return roots, state_root


def _open_bundle_lock(root_fd: int, *, shared: bool) -> int:
    """Open and lock a regular file relative to the pinned state directory."""
    try:
        fd = os.open("apply.lock",
                     os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW
                     | getattr(os, "O_CLOEXEC", 0),
                     0o600, dir_fd=root_fd)
    except OSError as exc:
        raise BundleError("BUNDLE_APPLY_LOCK_SYMLINK_FORBIDDEN") from exc
    try:
        st = os.fstat(fd)
        _require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1
                 and st.st_uid == os.getuid() and not st.st_mode & 0o022,
                 "BUNDLE_APPLY_LOCK_INVALID")
        try:
            fcntl.flock(fd, (fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
                        | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise BundleError("BUNDLE_APPLY_IN_PROGRESS"
                              if shared else "BUNDLE_APPLY_ALREADY_IN_PROGRESS") from exc
        return fd
    except BaseException:
        os.close(fd)
        raise


def _open_bundle_apply_lock(root_fd: int) -> int:
    return _open_bundle_lock(root_fd, shared=False)

def _custody_identity_matches(custody, profile, state_root: Path) -> bool:
    if (custody.profile_id != profile["profile_id"]
            or custody.lock_sha256 != profile["lock_sha256"]
            or custody.state_root != state_root
            or not isinstance(custody.fd, int) or custody.fd < 0
            or not isinstance(custody.root_fd, int) or custody.root_fd < 0
            or custody.anchored_root != Path("/proc/self/fd") / str(custody.root_fd)):
        return False
    try:
        _assert_state_root_current(state_root, custody.root_fd)
        locked = os.fstat(custody.fd)
        observed = os.stat("apply.lock", dir_fd=custody.root_fd,
                           follow_symlinks=False)
        return (stat.S_ISREG(locked.st_mode)
                and (locked.st_dev, locked.st_ino)
                == (observed.st_dev, observed.st_ino))
    except (OSError, BundleError):
        return False

def _apply_custody_matches(custody, profile, state_root: Path) -> bool:
    return isinstance(custody, _BundleApplyCustody) and _custody_identity_matches(
        custody, profile, state_root
    )


def _inspection_custody_matches(custody, profile, state_root: Path) -> bool:
    return isinstance(custody, (_BundleApplyCustody, _BundleInspectionCustody)) and _custody_identity_matches(
        custody, profile, state_root
    )


@contextmanager
def bundle_apply_custody(lock: Path, *, approved_lock_sha256: str,
                         env: dict[str, str] | None = None,
                         allowed_hosts: frozenset[str] = DEFAULT_RELEASE_HOSTS):
    """Exclusive OS lock acquired before retry classification or download."""
    _require(isinstance(approved_lock_sha256, str)
             and SHA256.fullmatch(approved_lock_sha256), "BUNDLE_APPROVAL_INVALID")
    profile = load_bundle_profile(lock, allowed_hosts=allowed_hosts)
    _require(profile["lock_sha256"] == approved_lock_sha256,
             "BUNDLE_APPROVAL_DIGEST_MISMATCH")
    _roots, state_root = _bundle_state_root(profile, env, create=True)
    _require(Path("/proc/self/fd").is_dir(), "BUNDLE_SECURE_DIRFD_UNAVAILABLE")
    root_fd = _secure_ensure_state_root(state_root, retain_fd=True)
    try:
        _assert_state_root_current(state_root, root_fd)
        fd = _open_bundle_apply_lock(root_fd)
        try:
            yield _BundleApplyCustody(
                profile["profile_id"], approved_lock_sha256,
                state_root, fd, root_fd)
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
    finally:
        os.close(root_fd)


def _open_bundle_inspection_lock(root_fd: int) -> int:
    return _open_bundle_lock(root_fd, shared=True)

@contextmanager
def bundle_inspection_custody(lock: Path, *, approved_lock_sha256: str,
                              env: dict[str, str] | None = None,
                              allowed_hosts: frozenset[str] = DEFAULT_RELEASE_HOSTS):
    """Shared snapshot custody over exact pinned state and receipts."""
    _require(isinstance(approved_lock_sha256, str)
             and SHA256.fullmatch(approved_lock_sha256), "BUNDLE_APPROVAL_INVALID")
    profile = load_bundle_profile(lock, allowed_hosts=allowed_hosts)
    _require(profile["lock_sha256"] == approved_lock_sha256,
             "BUNDLE_APPROVAL_DIGEST_MISMATCH")
    _roots, state_root = _bundle_state_root(profile, env, create=True)
    _require(Path("/proc/self/fd").is_dir(), "BUNDLE_SECURE_DIRFD_UNAVAILABLE")
    root_fd = _secure_ensure_state_root(state_root, retain_fd=True)
    try:
        _assert_state_root_current(state_root, root_fd)
        fd = _open_bundle_inspection_lock(root_fd)
        try:
            yield _BundleInspectionCustody(
                profile["profile_id"], approved_lock_sha256,
                state_root, fd, root_fd)
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
    finally:
        os.close(root_fd)


def inspect_bundle_install(lock: Path, *, approved_lock_sha256: str,
                           env: dict[str, str] | None = None,
                           allowed_hosts: frozenset[str] = DEFAULT_RELEASE_HOSTS,
                           custody=None):
    """Reconcile exact receipts and destination bytes under stable custody."""
    _require(isinstance(approved_lock_sha256, str)
             and SHA256.fullmatch(approved_lock_sha256), "BUNDLE_APPROVAL_INVALID")
    profile = load_bundle_profile(lock, allowed_hosts=allowed_hosts)
    _require(profile["lock_sha256"] == approved_lock_sha256,
             "BUNDLE_APPROVAL_DIGEST_MISMATCH")
    if custody is None:
        try:
            with bundle_inspection_custody(
                lock,
                approved_lock_sha256=approved_lock_sha256,
                env=env,
                allowed_hosts=allowed_hosts,
            ) as observed:
                return inspect_bundle_install(
                    lock,
                    approved_lock_sha256=approved_lock_sha256,
                    env=env,
                    allowed_hosts=allowed_hosts,
                    custody=observed,
                )
        except BundleError as exc:
            if str(exc) == "BUNDLE_APPLY_IN_PROGRESS":
                return {
                    "schema_version": "xiio-installer-bundle-inspection-v1",
                    "state": "APPLY_IN_PROGRESS",
                    "profile_id": profile["profile_id"],
                    "lock_sha256": approved_lock_sha256,
                    "roles": {},
                    "receipt_count": 0,
                    "first_red": "BUNDLE_APPLY_IN_PROGRESS",
                    "effects_authorized": False,
                    "runtime_qualified": False,
                    "device_connected": False,
                }
            raise
    roots, original_state_root = _bundle_state_root(profile, env, create=False)
    _require(_inspection_custody_matches(custody, profile, original_state_root),
             "BUNDLE_INSPECTION_CUSTODY_INVALID")
    state_root = custody.anchored_root
    role_states = {}
    receipt_count = 0
    try:
        for role in profile["ordered_roles"]:
            manifest = profile["products"][role][0]
            receipt = _bundle_receipt_path(state_root, role, manifest, approved_lock_sha256)
            if receipt.is_symlink():
                raise BundleError("BUNDLE_RECEIPT_SYMLINK_FORBIDDEN")
            if receipt.exists():
                _receipt_and_bytes_match(receipt, manifest, roots)
                role_states[role] = "INSTALLED_RECEIPT_VERIFIED"
                receipt_count += 1
                continue
            # A destination without its transaction receipt is precisely the
            # crash seam this readback exists to preserve. Matching bytes are
            # still uncertain because their original creation custody is gone.
            present = False
            for entry in manifest.entries:
                dest = _destination_path(entry, roots)
                if dest.is_symlink() or dest.exists():
                    present = True
                    break
            role_states[role] = "UNRECEIPTED_DESTINATION_PRESENT" if present else "ABSENT"
        states = set(role_states.values())
        if states == {"ABSENT"}:
            state = "NOT_INSTALLED"
            first_red = None
        elif states == {"INSTALLED_RECEIPT_VERIFIED"}:
            state = "INSTALLED_BYTES_VERIFIED"
            first_red = None
        else:
            state = "OUTCOME_UNCERTAIN"
            first_red = "BUNDLE_MIXED_OR_UNRECEIPTED_STATE"
        _assert_state_root_current(original_state_root, custody.root_fd)
    except (BundleError, OSError, ValueError, TypeError, KeyError) as exc:
        state = "OUTCOME_UNCERTAIN"
        first_red = str(exc)[:256] or "BUNDLE_READBACK_FAILED"
    return {
        "schema_version": "xiio-installer-bundle-inspection-v1",
        "state": state,
        "profile_id": profile["profile_id"],
        "lock_sha256": approved_lock_sha256,
        "roles": role_states,
        "receipt_count": receipt_count,
        "first_red": first_red,
        "effects_authorized": False,
        "runtime_qualified": False,
        "device_connected": False,
    }


def install_bundle(lock: Path, *, approved_lock_sha256: str,
                   env: dict[str, str] | None = None,
                   allowed_hosts: frozenset[str] = DEFAULT_RELEASE_HOSTS,
                   fetch=None, fail_after_product: int | None = None,
                   custody=None):
    """Acquire all children, verify all bytes, then apply existing transactions.

    Effects are explicitly approved by the caller's exact bundled profile SHA.
    This is installation/custody only, not proof of runnable or connected apps.
    """
    _require(isinstance(approved_lock_sha256, str) and
             SHA256.fullmatch(approved_lock_sha256), "BUNDLE_APPROVAL_INVALID")
    profile = load_bundle_profile(lock, allowed_hosts=allowed_hosts)
    _require(profile["lock_sha256"] == approved_lock_sha256,
             "BUNDLE_APPROVAL_DIGEST_MISMATCH")
    if custody is None:
        with bundle_apply_custody(
            lock,
            approved_lock_sha256=approved_lock_sha256,
            env=env,
            allowed_hosts=allowed_hosts,
        ) as owned:
            return install_bundle(
                lock,
                approved_lock_sha256=approved_lock_sha256,
                env=env,
                allowed_hosts=allowed_hosts,
                fetch=fetch,
                fail_after_product=fail_after_product,
                custody=owned,
            )
    roots, original_state_root = _bundle_state_root(profile, env, create=False)
    _require(_apply_custody_matches(custody, profile, original_state_root),
             "BUNDLE_APPLY_CUSTODY_INVALID")
    state_root = custody.anchored_root
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
        _assert_state_root_current(original_state_root, custody.root_fd)

        for role in profile["ordered_roles"]:
            manifest = profile["products"][role][0]
            plan_install(manifest, staged[role], env)
        applied = []
        try:
            for role in profile["ordered_roles"]:
                _assert_state_root_current(original_state_root, custody.root_fd)
                manifest = profile["products"][role][0]
                receipt = _bundle_receipt_path(state_root, role, manifest, approved_lock_sha256)
                _require(not receipt.exists() and not receipt.is_symlink(),
                         "BUNDLE_RECEIPT_ALREADY_EXISTS")
                apply_install(manifest, staged[role], receipt, env)
                applied.append(receipt)
                if fail_after_product is not None and len(applied) == fail_after_product:
                    raise BundleError("BUNDLE_TEST_INJECTED_FAILURE")
            _assert_state_root_current(original_state_root, custody.root_fd)
        except Exception as cause:
            failures = []
            archived = []
            for receipt in reversed(applied):
                try:
                    rollback(receipt, env)
                    archived.append(_archive_rolled_back_receipt(
                        state_root, receipt, custody.root_fd))
                except Exception:
                    failures.append(receipt.name)
            if failures:
                raise BundleError("BUNDLE_PARTIAL_ROLLBACK_UNVERIFIED_DO_NOT_RETRY") from cause
            # Active receipt names are now free only after the kernel proved
            # rollback and the exact receipt bytes were durably archived.
            _require(len(archived) == len(applied),
                     "BUNDLE_ROLLBACK_ARCHIVE_INCOMPLETE")
            raise BundleError("BUNDLE_APPLY_FAILED_ROLLED_BACK") from cause
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
