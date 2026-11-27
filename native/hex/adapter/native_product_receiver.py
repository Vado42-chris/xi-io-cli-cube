"""Native HEX consumer for one Framework-authorized product release.

This module creates no release catalogue, product roster, entitlement, billing,
Ward or service authority. It derives the product identity from a sealed
product-profile lock, obtains release/adopter currentness only through the
installed Framework export, and delegates effects to the existing child-bundle
Installer transaction.
"""
from __future__ import annotations

import os
import hashlib
import json
import re
import stat
from pathlib import Path

import framework_release_export
import framework_release_reader
import release_binding
from child_bundle import BundleError, MAX_LOCK_BYTES, SCHEMA, SAFE_ID, load_bundle_profile

REVIEW_SCHEMA = "xiio.hex.native-product-release-review/v1"
CONSUMER_REF = "consumer:hex-native-product-receiver"
DISTRIBUTION_SCHEMA = "xiio.release-distribution-lock/v1"
GENERATION = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class ProductReceiverError(BundleError):
    """Typed refusal without paths, credentials or provider response bodies."""


def _require(ok: bool, code: str) -> None:
    if not ok:
        raise ProductReceiverError(code)


def _canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def _safe_file(raw: object, code: str, limit: int = MAX_LOCK_BYTES) -> tuple[Path, bytes]:
    _require(isinstance(raw, str) and raw.startswith("/") and "\x00" not in raw, code)
    path = Path(raw)
    _require(".." not in path.parts and "." not in path.parts, code)
    try:
        st = path.lstat()
    except OSError as exc:
        raise ProductReceiverError(code) from exc
    _require(stat.S_ISREG(st.st_mode) and not path.is_symlink() and st.st_nlink == 1
             and 0 < st.st_size <= limit, code)
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise ProductReceiverError(code) from exc
    _require(len(data) == st.st_size, code)
    return path, data


def _declared_root_product(release_lock: object) -> tuple[Path, str]:
    lock, raw = _safe_file(release_lock, "PRODUCT_RELEASE_LOCK_UNTRUSTED")
    try:
        value = json.loads(raw)
    except (TypeError, ValueError, UnicodeError) as exc:
        raise ProductReceiverError("PRODUCT_RELEASE_LOCK_INVALID") from exc
    expected = {"schema_version", "profile_id", "fixture", "products",
                "profile_mode", "product_root_role"}
    _require(isinstance(value, dict) and set(value) == expected
             and value.get("schema_version") == SCHEMA
             and value.get("profile_mode") == "product",
             "PRODUCT_PROFILE_REQUIRED")
    root = value.get("product_root_role")
    _require(isinstance(root, str) and SAFE_ID.fullmatch(root),
             "PRODUCT_ROOT_ROLE_INVALID")
    rows = value.get("products")
    _require(isinstance(rows, list) and 0 < len(rows) <= 32,
             "PRODUCT_PROFILE_ROWS_INVALID")
    matches = [row for row in rows if isinstance(row, dict) and row.get("role") == root]
    _require(len(matches) == 1, "PRODUCT_ROOT_ROLE_AMBIGUOUS")
    product_ref = matches[0].get("product_id")
    _require(isinstance(product_ref, str) and 0 < len(product_ref) <= 128,
             "PRODUCT_REF_INVALID")
    return lock, product_ref


def _node_identity(node: object) -> dict:
    _require(isinstance(node, dict) and set(node) == {"path", "sha256", "version"},
             "PRODUCT_NODE_IDENTITY_REQUIRED")
    _require(isinstance(node["path"], str) and node["path"].startswith("/")
             and isinstance(node["version"], str) and bool(node["version"])
             and isinstance(node["sha256"], str) and SHA256.fullmatch(node["sha256"]),
             "PRODUCT_NODE_IDENTITY_INVALID")
    return dict(node)


def _current_binding(lock: Path, product_ref: str, *, framework_binding_receipt: object,
                     framework_generation: object, node: dict) -> tuple[dict, dict]:
    _require(isinstance(framework_generation, str)
             and GENERATION.fullmatch(framework_generation),
             "FRAMEWORK_RELEASE_GENERATION_INVALID")
    receipt, _ = _safe_file(
        framework_binding_receipt,
        "FRAMEWORK_RELEASE_BINDING_RECEIPT_UNTRUSTED",
        2 * 1024 * 1024,
    )
    try:
        export = framework_release_export.resolve_framework_release_distribution_module(
            receipt,
            expected_framework_generation=framework_generation,
        )
        reader = framework_release_reader.build_framework_release_distribution_reader(
            framework_release_distribution_module=Path(
                export["release_distribution_module"]
            ),
            node_binary=node["path"],
        )
        binding = reader(product_ref=product_ref, consumer_ref=CONSUMER_REF)
    except (framework_release_export.FrameworkReleaseExportError,
            BundleError, OSError, KeyError, TypeError, ValueError) as exc:
        raise ProductReceiverError("FRAMEWORK_RELEASE_BINDING_UNVERIFIED") from exc

    _require(isinstance(binding, dict)
             and binding.get("schema") == DISTRIBUTION_SCHEMA,
             "PRODUCT_RELEASE_DISTRIBUTION_INVALID")
    _require(binding.get("product_ref") == product_ref
             and binding.get("consumer_ref") == CONSUMER_REF,
             "PRODUCT_RELEASE_IDENTITY_MISMATCH")
    _require(binding.get("lifecycle") == "DISTRIBUTABLE"
             and binding.get("adopter_current") is True
             and binding.get("effect_authority") is False
             and binding.get("installed") is False,
             "PRODUCT_RELEASE_NOT_CURRENT")
    approved = binding.get("approved_lock_sha256")
    _require(isinstance(approved, str) and SHA256.fullmatch(approved),
             "PRODUCT_RELEASE_LOCK_DIGEST_INVALID")
    _require(hashlib.sha256(lock.read_bytes()).hexdigest() == approved,
             "PRODUCT_RELEASE_LOCK_DIGEST_MISMATCH")
    hosts = binding.get("provider_hosts")
    _require(isinstance(hosts, list) and bool(hosts)
             and all(isinstance(host, str) and bool(host) for host in hosts)
             and len(hosts) == len(set(hosts)),
             "PRODUCT_RELEASE_PROVIDER_BINDING_INVALID")
    _require(isinstance(binding.get("release_ref"), str)
             and bool(binding["release_ref"])
             and isinstance(binding.get("release_generation"), str)
             and bool(binding["release_generation"])
             and isinstance(binding.get("entrypoint_qualification_ref"), str)
             and bool(binding["entrypoint_qualification_ref"]),
             "PRODUCT_RELEASE_CURRENTNESS_INCOMPLETE")
    try:
        profile = load_bundle_profile(lock, allowed_hosts=frozenset(hosts))
    except (BundleError, OSError, TypeError, ValueError) as exc:
        raise ProductReceiverError("PRODUCT_PROFILE_UNVERIFIED") from exc
    _require(profile.get("profile_mode") == "product",
             "PRODUCT_PROFILE_REQUIRED")
    root = profile.get("product_root_role")
    _require(root in profile.get("products", {}),
             "PRODUCT_ROOT_ROLE_UNVERIFIED")
    root_manifest = profile["products"][root][0]
    _require(root_manifest.product_id == product_ref,
             "PRODUCT_ROOT_IDENTITY_MISMATCH")
    _require(profile["release_generations"].get(root) == binding["release_generation"],
             "PRODUCT_ROOT_GENERATION_MISMATCH")
    return binding, profile


def installed_framework_hint(state_home: Path) -> dict:
    """Resolve one installed host from the Installer's existing child receipts."""
    bundles = state_home / "xi-io" / "installer" / "bundles"
    if not bundles.is_dir() or bundles.resolve() != bundles:
        return {}
    candidates = []
    for receipt in bundles.glob("*/*.binding.json"):
        if receipt.resolve() != receipt:
            continue
        try:
            _, raw = _safe_file(str(receipt), "PRODUCT_HOST_RECEIPT_INVALID")
            binding = json.loads(raw)
            if (not isinstance(binding, dict) or binding.get("dependency_id") != framework_release_export.FRAMEWORK_DEPENDENCY_ID
                    or binding.get("owner_repo") != framework_release_export.FRAMEWORK_OWNER_REPO):
                continue
            release = receipt.with_name(receipt.name.removesuffix(".binding.json") + ".release.json")
            if binding.get("release_receipt_path") != str(release):
                continue
            _, raw = _safe_file(str(release), "PRODUCT_HOST_RELEASE_INVALID")
            installed = json.loads(raw)
            generation = installed.get("release_generation")
            if (installed.get("schema") != "xiio.installer.child-generation-receipt/v1"
                    or installed.get("product_ref") != binding.get("product_id")
                    or installed.get("bundle_state") != "INSTALLED_BYTES_VERIFIED"
                    or installed.get("readback_verified") is not True
                    or not isinstance(generation, str) or not GENERATION.fullmatch(generation)):
                continue
            framework_release_export.resolve_framework_release_distribution_module(
                receipt, expected_framework_generation=generation)
            candidates.append({"framework_binding_receipt": str(receipt), "framework_generation": generation})
        except (OSError, ValueError, TypeError, AttributeError, BundleError, framework_release_export.FrameworkReleaseExportError):
            continue
    return candidates[0] if len(candidates) == 1 else {}


def _offline_payload_reader(lock: Path, profile: dict):
    media = lock.parent / "payloads"
    if not media.exists() and not media.is_symlink():
        return None
    _require(media.is_dir() and media.resolve() == media, "PRODUCT_MEDIA_DIRECTORY_INVALID")
    entries = {}
    for manifest, urls, _deps in profile["products"].values():
        for entry in manifest.entries:
            pair = (entry.sha256, entry.size)
            _require(entries.setdefault(urls[entry.source], pair) == pair, "PRODUCT_MEDIA_URL_AMBIGUOUS")

    def copy_payload(url: str, destination: Path, size: int) -> None:
        sha, expected_size = entries[url]
        _require(type(size) is int and size > 0 and size == expected_size
                 and SHA256.fullmatch(sha), "PRODUCT_MEDIA_ENTRY_INVALID")
        directory = os.open(media, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            with os.fdopen(os.open(sha, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory), "rb") as src:
                info = os.fstat(src.fileno())
                _require(stat.S_ISREG(info.st_mode) and info.st_size == size, "PRODUCT_MEDIA_FILE_INVALID")
                created = False
                try:
                    digest = hashlib.sha256()
                    with destination.open("xb") as out:
                        created = True
                        remaining = size
                        while remaining:
                            chunk = src.read(min(remaining, 1024 * 1024))
                            _require(bool(chunk), "PRODUCT_MEDIA_FILE_TRUNCATED")
                            out.write(chunk)
                            digest.update(chunk)
                            remaining -= len(chunk)
                        _require(not src.read(1), "PRODUCT_MEDIA_FILE_CHANGED")
                        _require(digest.hexdigest() == sha, "PRODUCT_MEDIA_DIGEST_MISMATCH")
                except BaseException:
                    if created:
                        destination.unlink(missing_ok=True)
                    raise
        finally:
            os.close(directory)

    return copy_payload


def inspect_product_release(*, release_lock: object, framework_binding_receipt: object,
                            framework_generation: object, node: object) -> dict:
    lock, product_ref = _declared_root_product(release_lock)
    node_identity = _node_identity(node)
    binding, profile = _current_binding(
        lock,
        product_ref,
        framework_binding_receipt=framework_binding_receipt,
        framework_generation=framework_generation,
        node=node_identity,
    )
    rows = []
    for role in profile["ordered_roles"]:
        manifest, _urls, dependencies = profile["products"][role]
        rows.append({
            "role": role,
            "product_ref": manifest.product_id,
            "display_name": manifest.display_name,
            "version": manifest.version,
            "channel": manifest.channel,
            "depends_on": list(dependencies),
        })
    root_manifest = profile["products"][profile["product_root_role"]][0]
    review = {
        "schema": REVIEW_SCHEMA,
        "phase": "PRODUCT_REVIEW_REQUIRED",
        "state": "PRODUCT_REVIEW_REQUIRED",
        "profile_id": profile["profile_id"],
        "profile_mode": "product",
        "product_root_role": profile["product_root_role"],
        "product_ref": product_ref,
        "display_name": root_manifest.display_name,
        "version": root_manifest.version,
        "channel": root_manifest.channel,
        "consumer_ref": CONSUMER_REF,
        "release_ref": binding["release_ref"],
        "provider_hosts": binding["provider_hosts"],
        "release_generation": binding["release_generation"],
        "framework_generation": framework_generation,
        "approved_lock_sha256": binding["approved_lock_sha256"],
        "distribution_sha256": hashlib.sha256(_canonical(binding)).hexdigest(),
        "entrypoint_qualification_ref": binding["entrypoint_qualification_ref"],
        "ordered_roles": list(profile["ordered_roles"]),
        "products": rows,
        "node": node_identity,
        "installed_bytes_verified": False,
        "runtime_generation_verified": False,
        "services_started": False,
        "product_api_admitted": False,
        "entitlement_admitted": False,
        "billing_admitted": False,
        "ward_effect_authorized": False,
        "effect_authority": False,
        "provider_effect": False,
        "return_applied": False,
        "do_not_retry": False,
    }
    review["review_digest"] = hashlib.sha256(_canonical(review)).hexdigest()
    return review


def apply_product_release(*, release_lock: object, framework_binding_receipt: object,
                          framework_generation: object, node: object,
                          review_digest: object, approved: object) -> dict:
    _require(approved is True, "PRODUCT_EXACT_APPROVAL_REQUIRED")
    _require(isinstance(review_digest, str) and SHA256.fullmatch(review_digest),
             "PRODUCT_REVIEW_DIGEST_INVALID")
    review = inspect_product_release(
        release_lock=release_lock,
        framework_binding_receipt=framework_binding_receipt,
        framework_generation=framework_generation,
        node=node,
    )
    _require(review["review_digest"] == review_digest,
             "PRODUCT_RELEASE_CHANGED_SINCE_REVIEW")
    try:
        install_options = {}
        lock = Path(release_lock)
        if (lock.parent / "payloads").exists() or (lock.parent / "payloads").is_symlink():
            profile = load_bundle_profile(lock, allowed_hosts=frozenset(review["provider_hosts"]))
            install_options["fetch"] = _offline_payload_reader(lock, profile)
        installed = release_binding.install_from_installed_framework_release(
            Path(release_lock),
            product_ref=review["product_ref"],
            consumer_ref=CONSUMER_REF,
            framework_binding_receipt=Path(framework_binding_receipt),
            expected_framework_generation=framework_generation,
            node_binary=review["node"]["path"],
            expected_distribution_sha256=review["distribution_sha256"],
            **install_options,
        )
    except (BundleError, OSError, TypeError, ValueError) as exc:
        raise ProductReceiverError(
            "PRODUCT_INSTALL_OUTCOME_UNVERIFIED_CHECK_SAVED_STATE_DO_NOT_RETRY"
        ) from exc
    _require(isinstance(installed, dict)
             and installed.get("state") == "INSTALLED_BYTES_VERIFIED"
             and installed.get("profile_id") == review["profile_id"]
             and installed.get("lock_sha256") == review["approved_lock_sha256"],
             "PRODUCT_INSTALL_READBACK_MISMATCH")
    return {
        **review,
        "phase": "PRODUCT_BYTES_INSTALLED_READBACK_VERIFIED",
        "state": "PRODUCT_BYTES_INSTALLED_READBACK_VERIFIED",
        "installed_bytes_verified": True,
        "installation": installed,
        "runtime_generation_verified": False,
        "services_started": False,
        "product_api_admitted": False,
        "entitlement_admitted": False,
        "billing_admitted": False,
        "ward_effect_authorized": False,
        "effect_authority": False,
        "provider_effect": False,
        "return_applied": False,
        "do_not_retry": False,
    }
