"""Receive framework release/adopter authority before bundle acquisition.

This module owns no release catalogue. It accepts only the reusable framework
D2/D3 projection and passes its approved provider hosts into child_bundle.
"""
from __future__ import annotations
from pathlib import Path
import hashlib

from .child_bundle import BundleError, install_bundle, load_bundle_profile

RELEASE_SCHEMA = "xiio.framework.distributable-release-projection/v1"
ADOPTER_SCHEMA = "xiio.framework.release-adopter-lock/v1"


def _require(ok: bool, code: str) -> None:
    if not ok:
        raise BundleError(code)


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
    for key in ("release_ref", "release_generation", "approved_lock_sha256"):
        _require(release.get(key) == adopter.get(key),
                 "BUNDLE_RELEASE_ADOPTER_BINDING_MISMATCH")
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
    return install_bundle(Path(lock), approved_lock_sha256=approved, env=env,
                          allowed_hosts=allowed, fetch=fetch)
