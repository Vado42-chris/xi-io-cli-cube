#!/usr/bin/env python3
"""Verify a six-owner XI-IO core release on the EXISTING public Cube Releases.

This is an owner-side RELEASE QUALIFIER only. It does not publish, download
private repositories, install software, grant identity, or change a host.
The distributed HEX installer remains the sole product installation owner.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "native/hex/adapter/kernel"))
sys.path.insert(0, str(ROOT / "native/hex/adapter"))
import child_bundle  # noqa: E402  Reuse the current HEX six-product kernel.

REPO = "Vado42-chris/xi-io-cli-cube"
ROLES = ("bins", "cli", "ibal", "inbox", "switchboard", "ward")
RELEASE_ASSET_PREFIX = "https://github.com/" + REPO + "/releases/download/"
API_PREFIX = "https://api.github.com/repos/" + REPO + "/releases/tags/"
TAG = re.compile(r"^xiio-core-six-[a-z0-9][a-z0-9._-]{3,80}$")
ASSET = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$")
META_ASSETS = frozenset(("PROVENANCE.json", "SHA256SUMS"))
DEFAULT_LOCK = ROOT / "native/hex/adapter/core-release.lock.json"


class Refused(RuntimeError):
    pass


def require(value, code):
    if not value:
        raise Refused(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_tag(value):
    require(isinstance(value, str) and TAG.fullmatch(value) is not None,
            "PUBLIC_CORE_RELEASE_TAG_INVALID")
    return value


def payload_asset(url, tag):
    # The existing downloader follows a GitHub Release redirect. Never accept
    # private-repo URLs, a mutable branch URL, a query or a credential.
    require(isinstance(url, str) and url.startswith(RELEASE_ASSET_PREFIX + tag + "/"),
            "CORE_PAYLOAD_NOT_IN_PUBLIC_CUBE_RELEASE")
    parsed = urlsplit(url)
    require(parsed.scheme == "https" and parsed.netloc == "github.com" and
            not parsed.username and not parsed.password and not parsed.query and
            not parsed.fragment, "CORE_PAYLOAD_URL_UNSAFE")
    basename = url[len(RELEASE_ASSET_PREFIX + tag + "/"):]
    require(ASSET.fullmatch(basename) and basename not in (".", "..") and
            not basename.startswith(".") and "%" not in basename and
            " " not in basename,
            "CORE_PAYLOAD_ASSET_NAME_UNSAFE")
    return basename


def qualify_local(lock, tag):
    safe_tag(tag)
    require(lock.is_file() and not lock.is_symlink(),
            "CORE_RELEASE_LOCK_UNPUBLISHED")
    require(lock.name == "core-release.lock.json",
            "CORE_RELEASE_LOCK_NAME_INVALID")
    try:
        bundle = child_bundle.load_bundle_profile(lock)
        original = json.loads(lock.read_bytes())
    except (ValueError, UnicodeError, OSError, child_bundle.BundleError):
        raise Refused("CORE_RELEASE_LOCK_INVALID") from None
    require(bundle["fixture"] is False, "CORE_FIXTURE_NOT_DISTRIBUTABLE")
    require(tuple(sorted(bundle["products"])) == ROLES,
            "CORE_SIX_OWNER_ROLES_NOT_QUALIFIED")

    expected = {}
    def add(name, digest, length):
        require(ASSET.fullmatch(name) and name not in (".", "..") and
                not name.startswith("."), "CORE_ASSET_NAME_INVALID")
        existing = expected.get(name)
        require(existing is None or existing == (digest, length),
                "CORE_ASSET_NAME_COLLISION")
        expected[name] = (digest, length)

    raw_lock = lock.read_bytes()
    add(lock.name, sha(raw_lock), len(raw_lock))
    for row in original["products"]:
        role = row["role"]
        manifest_name = row["manifest"]
        require(manifest_name == role + ".json",
                "CORE_MANIFEST_PUBLIC_ASSET_NAME_INVALID")
        path = lock.parent / manifest_name
        require(path.is_file() and not path.is_symlink(),
                "CORE_MANIFEST_FILE_MISSING")
        raw_manifest = path.read_bytes()
        add(manifest_name, sha(raw_manifest), len(raw_manifest))
        manifest = bundle["products"][role][0]
        require(manifest.channel in ("alpha", "beta", "rc", "stable") and
                not manifest.fixture, "CORE_PRODUCT_FIXTURE_NOT_DISTRIBUTABLE")
        for entry in manifest.entries:
            url = row["payload_urls"][entry.source]
            filename = payload_asset(url, tag)
            require(filename not in META_ASSETS and
                    filename != "core-release.lock.json" and
                    filename not in (r + ".json" for r in ROLES),
                    "CORE_PAYLOAD_ASSET_COLLIDES_WITH_METADATA")
            add(filename, entry.sha256, entry.size)

    return {"schema": "xiio.cube.public-core-release-qualification/v1",
            "state": "LOCAL_LOCK_AND_OWNER_MANIFESTS_VALID",
            "release_tag": tag, "role_count": len(ROLES),
            "roles": list(ROLES),
            "expected_assets": expected,
            "lock_sha256": sha(raw_lock),
            "github_runtime_dependency": False,
            "first_run_credentials_required": False,
            "owner_distribution_approval": "NOT_VERIFIED",
            "native_install_readback": "NOT_VERIFIED"}


def _fetch_public(url, limit=131072):
    require(url.startswith("https://api.github.com/"),
            "UNEXPECTED_PUBLIC_API_ORIGIN")
    try:
        req = Request(url, headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "xiio-hex-core-distribution-audit/1"})
        with urlopen(req, timeout=15) as response:
            require(response.status == 200, "PUBLIC_CUBE_RELEASE_HTTP_FAILURE")
            data = response.read(limit + 1)
        require(0 < len(data) <= limit, "PUBLIC_CUBE_RELEASE_RESPONSE_SIZE_INVALID")
        value = json.loads(data)
        require(isinstance(value, dict), "PUBLIC_CUBE_RELEASE_JSON_INVALID")
        return value
    except HTTPError as e:
        if e.code == 404:
            raise Refused("PUBLIC_CORE_RELEASE_NOT_PUBLISHED") from None
        raise Refused("PUBLIC_CUBE_RELEASE_HTTP_FAILURE") from None
    except (OSError, URLError, ValueError):
        raise Refused("PUBLIC_CUBE_RELEASE_UNAVAILABLE") from None


def published_metadata(qualified, release, *, verify_bytes=False):
    tag = qualified["release_tag"]
    require(isinstance(release, dict) and release.get("tag_name") == tag and
            release.get("draft") is False and release.get("published_at"),
            "PUBLIC_CORE_RELEASE_NOT_PUBLISHED")
    assets = release.get("assets")
    require(isinstance(assets, list) and len(assets) <= 256,
            "PUBLIC_CORE_RELEASE_ASSET_LIST_INVALID")
    by_name = {}
    for row in assets:
        require(isinstance(row, dict), "PUBLIC_CORE_RELEASE_ASSET_INVALID")
        name = row.get("name")
        require(isinstance(name, str) and ASSET.fullmatch(name),
                "PUBLIC_CORE_RELEASE_ASSET_INVALID")
        require(name not in by_name, "PUBLIC_CORE_RELEASE_DUPLICATE_ASSET")
        by_name[name] = row
    expected = qualified["expected_assets"]
    require(set(expected).issubset(set(by_name)), "PUBLIC_CORE_RELEASE_ASSETS_MISSING")
    require(set(by_name) == set(expected) | META_ASSETS,
            "PUBLIC_CORE_RELEASE_UNREVIEWED_EXTRA_OR_MISSING_METADATA_ASSETS")
    # An owner-only approval and SHA256SUMS/provenance review are external
    # publication gates, not assertions this validator may invent.
    for name in META_ASSETS:
        meta = by_name[name]
        require(type(meta.get("size")) is int and 0 < meta["size"] <= 131072 and
                meta.get("browser_download_url") == RELEASE_ASSET_PREFIX + tag + "/" + name and
                meta.get("state") == "uploaded",
                "PUBLIC_CORE_RELEASE_METADATA_ASSET_INVALID")
    for name, (digest, size) in expected.items():
        row = by_name[name]
        url = RELEASE_ASSET_PREFIX + tag + "/" + name
        require(row.get("browser_download_url") == url and
                type(row.get("size")) is int and row["size"] == size and
                row.get("state") == "uploaded" and
                row.get("content_type") != "text/html",
                "PUBLIC_CORE_RELEASE_ASSET_METADATA_MISMATCH")
    if not verify_bytes:
        return {**{k: v for k, v in qualified.items() if k != "expected_assets"},
                "state": "PUBLIC_RELEASE_METADATA_ONLY",
                "verified_assets": 0,
                "expected_asset_count": len(expected),
                "native_install_readback": "NOT_VERIFIED"}
    # Use the EXISTING child_bundle download guard, which allows only approved
    # GitHub release redirect hosts. Do not add any auth headers or new CDN.
    verified = []
    with TemporaryDirectory(prefix="xiio-core-release-qualification-") as temp:
        for index, (name, (expected_sha, expected_size)) in enumerate(sorted(expected.items())):
            dest = Path(temp) / ("asset-" + str(index))
            try:
                child_bundle._fetch_https(
                    RELEASE_ASSET_PREFIX + tag + "/" + name,
                    dest, expected_size, child_bundle.DEFAULT_RELEASE_HOSTS)
            except (ValueError, OSError, child_bundle.BundleError):
                raise Refused("PUBLIC_CORE_RELEASE_BYTE_READBACK_FAILED") from None
            require(dest.stat().st_size == expected_size and
                    child_bundle.sha256_file(dest) == expected_sha,
                    "PUBLIC_CORE_RELEASE_BYTES_MISMATCH")
            verified.append(name)
    return {**{k: v for k, v in qualified.items() if k != "expected_assets"},
            "state": "PUBLIC_RELEASE_BYTES_VERIFIED",
            "verified_assets": len(verified),
            "expected_asset_count": len(expected),
            "role_count": 6,
            "owner_distribution_approval": "SEPARATELY_REQUIRED",
            "native_install_readback": "NOT_VERIFIED"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--published", action="store_true",
                        help="Read PUBLIC Cube GitHub release metadata without authentication")
    parser.add_argument("--verify-bytes", action="store_true",
                        help="Fetch ALL public release assets and reopen exact bytes")
    args = parser.parse_args()
    try:
        require(not args.verify_bytes or args.published,
                "PUBLISHED_RELEASE_REQUIRED_FOR_BYTE_READBACK")
        local = qualify_local(args.lock, args.tag)
        if args.published:
            local = published_metadata(local,
                     _fetch_public(API_PREFIX + args.tag),
                     verify_bytes=args.verify_bytes)
        result = {k: v for k, v in local.items() if k != "expected_assets"}
        result["expected_asset_count"] = len(local["expected_assets"]) if "expected_assets" in local else result["expected_asset_count"]
        print(json.dumps(result, sort_keys=True))
        return 0
    except Refused as e:
        print(json.dumps({
            "schema": "xiio.cube.public-core-release-qualification/v1",
            "state": "BLOCKED", "first_red": str(e),
            "publication_performed": False, "runtime_unchanged": True}), file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
