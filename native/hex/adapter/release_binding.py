"""Receive framework release/adopter authority before bundle acquisition.

This module owns no release catalogue. It accepts only the reusable framework
D2/D3 projection and passes its approved provider hosts into child_bundle.
"""
from __future__ import annotations
from pathlib import Path
import hashlib
import fcntl
import json
import os
import stat
import tempfile

from .child_bundle import BundleError, install_bundle, load_bundle_profile, _secure_ensure_state_root
from .framework_release_reader import build_framework_release_distribution_reader
from .framework_release_export import resolve_framework_release_distribution_module

RELEASE_SCHEMA = "xiio.framework.distributable-release-projection/v1"
ADOPTER_SCHEMA = "xiio.framework.release-adopter-lock/v1"


def _require(ok: bool, code: str) -> None:
    if not ok:
        raise BundleError(code)


def _required_text(value, code: str) -> str:
    _require(isinstance(value, str) and bool(value.strip()), code)
    return value.strip()


def install_from_release_binding(lock: Path, *, release: dict, adopter: dict,
                                 expected_product_ref: str,
                                 env: dict[str, str] | None = None,
                                 fetch=None):
    _require(isinstance(release, dict) and release.get("schema") == RELEASE_SCHEMA,
             "BUNDLE_RELEASE_PROJECTION_REQUIRED")
    _require(release.get("lifecycle") == "DISTRIBUTABLE"
             and release.get("effect_authority") is False,
             "BUNDLE_RELEASE_NOT_DISTRIBUTABLE")
    _require(isinstance(adopter, dict) and adopter.get("schema") == ADOPTER_SCHEMA
             and adopter.get("state") == "ADOPTED_CURRENT"
             and adopter.get("effect_authority") is False,
             "BUNDLE_ADOPTER_LOCK_CURRENT_REQUIRED")
    _require(release.get("product_ref") == expected_product_ref
             and adopter.get("product_ref") == expected_product_ref,
             "BUNDLE_RELEASE_PRODUCT_MISMATCH")
    for key in ("release_ref", "release_generation", "approved_lock_sha256", "entrypoint_qualification_ref"):
        _require(release.get(key) == adopter.get(key),
                 "BUNDLE_RELEASE_ADOPTER_BINDING_MISMATCH")
    entrypoint_qualification_ref = _required_text(
        release.get("entrypoint_qualification_ref"),
        "BUNDLE_ENTRYPOINT_QUALIFICATION_REF_REQUIRED",
    )
    raw = Path(lock).read_bytes()
    observed = hashlib.sha256(raw).hexdigest()
    approved = release.get("approved_lock_sha256")
    _require(isinstance(approved, str) and observed == approved,
             "BUNDLE_RELEASE_LOCK_DIGEST_MISMATCH")
    release_hosts = release.get("provider_hosts")
    adopter_hosts = adopter.get("provider_hosts")
    _require(isinstance(release_hosts, (list, tuple)) and release_hosts
             and list(release_hosts) == list(adopter_hosts or []),
             "BUNDLE_RELEASE_HOST_BINDING_MISMATCH")
    allowed = frozenset(release_hosts)
    # Profile parsing is read-only and precedes acquisition. Exact selected
    # product must be present in the pinned product lock.
    profile = load_bundle_profile(Path(lock), allowed_hosts=allowed)
    product_ids = {manifest.product_id for manifest, _urls, _deps in profile["products"].values()}
    _require(expected_product_ref in product_ids, "BUNDLE_RELEASE_PRODUCT_NOT_IN_LOCK")
    return _install_bound_release(lock, binding={
        "product_ref": expected_product_ref,
        "consumer_ref": _required_text(adopter.get("consumer_ref"), "BUNDLE_RELEASE_CONSUMER_REF_REQUIRED"),
        "release_ref": release.get("release_ref"),
        "release_generation": release.get("release_generation"),
        "approved_lock_sha256": approved,
        "entrypoint_qualification_ref": entrypoint_qualification_ref,
        "provider_hosts": list(release_hosts),
    }, env=env, fetch=fetch)


def _persist_release_receipt(state_fd: int, state_root: Path, name: str, receipt: dict) -> str:
    encoded=(json.dumps(receipt,indent=2,sort_keys=True)+"\n").encode()
    lock_name="."+name+".lock"
    try:
        lock_raw=os.open(lock_name,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=state_fd)
    except OSError as exc:
        raise BundleError("BUNDLE_RELEASE_INSTALL_RECEIPT_LOCK_UNTRUSTED") from exc
    try:
        lock_stat=os.fstat(lock_raw)
        _require(stat.S_ISREG(lock_stat.st_mode)
                 and (lock_stat.st_mode & 0o777)==0o600
                 and lock_stat.st_nlink==1,
                 "BUNDLE_RELEASE_INSTALL_RECEIPT_LOCK_UNTRUSTED")
    except Exception:
        os.close(lock_raw)
        raise
    with os.fdopen(lock_raw,"a+b",closefd=True) as receipt_lock:
        fcntl.flock(receipt_lock.fileno(),fcntl.LOCK_EX)
        try:
            try:
                fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=state_fd)
            except FileNotFoundError:
                fd=None
            except OSError as exc:
                raise BundleError("BUNDLE_RELEASE_INSTALL_RECEIPT_UNTRUSTED") from exc
            if fd is not None:
                try:
                    st=os.fstat(fd)
                    _require(stat.S_ISREG(st.st_mode) and (st.st_mode & 0o777)==0o600,
                             "BUNDLE_RELEASE_INSTALL_RECEIPT_UNTRUSTED")
                    existing=json.loads(os.read(fd,131072).decode())
                except (OSError,ValueError,UnicodeError) as exc:
                    raise BundleError("BUNDLE_RELEASE_INSTALL_RECEIPT_UNTRUSTED") from exc
                finally:
                    os.close(fd)
                _require(existing==receipt,"BUNDLE_RELEASE_INSTALL_RECEIPT_CONFLICT")
                return str(state_root/name)
            tmp="."+name+"."+hashlib.sha256(encoded).hexdigest()[:16]+".tmp"
            try:
                fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=state_fd)
                try:
                    os.write(fd,encoded);os.fsync(fd)
                finally:
                    os.close(fd)
                os.replace(tmp,name,src_dir_fd=state_fd,dst_dir_fd=state_fd)
            except OSError as exc:
                try: os.unlink(tmp,dir_fd=state_fd)
                except OSError: pass
                raise BundleError("BUNDLE_RELEASE_INSTALL_RECEIPT_WRITE_FAILED") from exc
            fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=state_fd)
            try:
                st=os.fstat(fd);reread=json.loads(os.read(fd,131072).decode())
                _require(stat.S_ISREG(st.st_mode) and (st.st_mode & 0o777)==0o600 and reread==receipt,
                         "BUNDLE_RELEASE_INSTALL_RECEIPT_READBACK_MISMATCH")
            finally:
                os.close(fd)
            return str(state_root/name)
        finally:
            fcntl.flock(receipt_lock.fileno(),fcntl.LOCK_UN)


def _install_bound_release(lock: Path, *, binding: dict, env=None, fetch=None):
    product_ref=binding["product_ref"];consumer_ref=binding["consumer_ref"]
    approved=binding["approved_lock_sha256"];allowed=frozenset(binding["provider_hosts"])
    roots_env=env or os.environ
    state_root=Path(roots_env.get("XDG_STATE_HOME") or (Path.home()/".local/state"))/"xi-io"/"installer"/"release-distributions"
    state_fd=_secure_ensure_state_root(state_root)
    try:
        st_desc=os.fstat(state_fd);st_path=state_root.stat()
        _require(st_desc.st_ino==st_path.st_ino and st_desc.st_dev==st_path.st_dev
                 and (st_desc.st_mode & 0o777)==0o700,
                 "BUNDLE_RELEASE_STATE_ROOT_UNTRUSTED")
        installed=install_bundle(Path(lock),approved_lock_sha256=approved,env=env,allowed_hosts=allowed,fetch=fetch)
        receipt={"schema":"xiio.installer.release-distribution-install-receipt/v1","product_ref":product_ref,"consumer_ref":consumer_ref,
            "release_ref":binding.get("release_ref"),"release_generation":binding.get("release_generation"),
            "entrypoint_qualification_ref":binding.get("entrypoint_qualification_ref"),"approved_lock_sha256":approved,"bundle_profile_id":installed.get("profile_id"),"bundle_state":installed.get("state"),
            "installed_role_count":len(installed.get("roles") or []),"readback_verified":installed.get("state")=="INSTALLED_BYTES_VERIFIED","effect_authority":False}
        name=hashlib.sha256((product_ref+"|"+consumer_ref+"|"+str(binding.get("release_generation"))).encode()).hexdigest()+".json"
        receipt_path=_persist_release_receipt(state_fd,state_root,name,receipt)
        return {**installed,"release_distribution_receipt":receipt_path}
    finally:
        os.close(state_fd)


DISTRIBUTION_SCHEMA = "xiio.release-distribution-lock/v1"


def install_from_distribution_reader(lock: Path, *, product_ref: str, consumer_ref: str,
                                     read_release_distribution,
                                     env: dict[str, str] | None = None, fetch=None):
    """Consume the framework #315 D2/D3 output through a host-owned current reader."""
    _require(isinstance(product_ref, str) and bool(product_ref),
             "BUNDLE_RELEASE_PRODUCT_REF_REQUIRED")
    _require(isinstance(consumer_ref, str) and bool(consumer_ref),
             "BUNDLE_RELEASE_CONSUMER_REF_REQUIRED")
    _require(callable(read_release_distribution),
             "BUNDLE_RELEASE_DISTRIBUTION_READER_UNBOUND")
    binding = read_release_distribution(product_ref=product_ref, consumer_ref=consumer_ref)
    _require(isinstance(binding, dict) and binding.get("schema") == DISTRIBUTION_SCHEMA,
             "BUNDLE_RELEASE_DISTRIBUTION_INVALID")
    _require(binding.get("product_ref") == product_ref,
             "BUNDLE_RELEASE_PRODUCT_MISMATCH")
    _require(binding.get("consumer_ref") == consumer_ref,
             "BUNDLE_RELEASE_CONSUMER_MISMATCH")
    _require(binding.get("lifecycle") == "DISTRIBUTABLE"
             and binding.get("adopter_current") is True
             and binding.get("effect_authority") is False
             and binding.get("installed") is False,
             "BUNDLE_RELEASE_DISTRIBUTION_NOT_CURRENT")
    approved = binding.get("approved_lock_sha256")
    _require(isinstance(approved, str) and len(approved) == 64
             and all(c in "0123456789abcdef" for c in approved),
             "BUNDLE_RELEASE_LOCK_DIGEST_INVALID")
    observed = hashlib.sha256(Path(lock).read_bytes()).hexdigest()
    _require(observed == approved, "BUNDLE_RELEASE_LOCK_DIGEST_MISMATCH")
    hosts = binding.get("provider_hosts")
    _require(isinstance(hosts, (list, tuple)) and bool(hosts),
             "BUNDLE_RELEASE_HOST_BINDING_MISMATCH")
    allowed = frozenset(hosts)
    profile = load_bundle_profile(Path(lock), allowed_hosts=allowed)
    product_ids = {manifest.product_id for manifest, _urls, _deps in profile["products"].values()}
    _require(product_ref in product_ids, "BUNDLE_RELEASE_PRODUCT_NOT_IN_LOCK")
    _required_text(binding.get("entrypoint_qualification_ref"), "BUNDLE_ENTRYPOINT_QUALIFICATION_REF_REQUIRED")
    return _install_bound_release(Path(lock),binding=binding,env=env,fetch=fetch)


def install_from_installed_framework_release(lock: Path, *, product_ref: str,
                                             consumer_ref: str,
                                             framework_binding_receipt: Path,
                                             expected_framework_generation: str,
                                             env: dict[str, str] | None = None,
                                             fetch=None, node_binary: str = "node"):
    """Resolve verified installed Framework custody, then invoke its release compiler."""
    export = resolve_framework_release_distribution_module(
        framework_binding_receipt,
        expected_framework_generation=expected_framework_generation,
    )
    reader = build_framework_release_distribution_reader(
        framework_release_distribution_module=Path(export["release_distribution_module"]),
        node_binary=node_binary,
    )
    return install_from_distribution_reader(
        lock, product_ref=product_ref, consumer_ref=consumer_ref,
        read_release_distribution=reader, env=env, fetch=fetch,
    )
