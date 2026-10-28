#!/usr/bin/env python3
"""Inspect real .deb bytes BEFORE public Actions artifact upload or release.

This gate is intentionally fail-closed. Testing a private-owner payload is not
approval to distribute it. The existing native HEX installer remains unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile

SCHEMA = "xiio.hex.runtime-publication-preflight/v1"
ROOT = "usr/lib/XI-IO HEX DEV/"
CLI = ROOT + "cli-source/"
ADAPTER = ROOT + "adapter/"
SOURCE_OWNER = "Vado42-chris/xi-io-cli"
DEFAULT_APPROVAL = (Path(__file__).resolve().parents[1] /
                    "native/hex/adapter/public-runtime-distribution.approval.json")
HEX_SHA = re.compile(r"^[0-9a-f]{64}$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
SAFE_FILE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,239}$")
REVIEW = re.compile(
    r"^https://github[.]com/Vado42-chris/xi-io-cli/(?:issues|pull)/[1-9][0-9]*$")
MAX_PAYLOAD = 128 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
MAX_FILES = 10000


class Refused(RuntimeError):
    pass


def need(condition, code):
    if not condition:
        raise Refused(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def normalize_path(name):
    if name.startswith("./"):
        name = name[2:]
    target = PurePosixPath(name)
    need(bool(name) and not target.is_absolute() and ".." not in target.parts
         and "\\" not in name and str(target) == name,
         "DEBIAN_ARCHIVE_PATH_UNTRUSTED")
    return name


def test_or_document(path):
    rel = path[len(ADAPTER):]
    parts = PurePosixPath(rel).parts
    name = parts[-1].lower() if parts else ""
    return (
        name.startswith("test_") or
        name.endswith((".test.mjs", ".spec.mjs", ".pyc", ".pyo", ".map")) or
        name.startswith("readme") or
        any(x.lower() in ("test", "tests", "__pycache__", "fixture", "fixtures",
                          "docs", "documentation") for x in parts)
    )


def scan_tar(raw):
    """Examine the installed package filesystem archive, not a source-tree list."""
    need(0 < len(raw) <= MAX_PAYLOAD, "DEBIAN_PAYLOAD_SIZE_UNTRUSTED")
    seen = set()
    cli_files = {}
    adapter_files = set()
    dev_files = []
    unsafe = []
    count = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:*") as tar:
            for member in tar:
                path = normalize_path(member.name)
                count += 1
                need(count <= MAX_FILES, "DEBIAN_FILE_COUNT_EXCESSIVE")
                need(path not in seen, "DEBIAN_DUPLICATE_ARCHIVE_PATH")
                seen.add(path)
                if member.isdir():
                    continue
                if not member.isfile():
                    if path.startswith((CLI, ADAPTER)):
                        unsafe.append(path)
                    continue
                need(0 <= member.size <= MAX_FILE, "DEBIAN_FILE_SIZE_EXCESSIVE")
                if not path.startswith((CLI, ADAPTER)):
                    continue
                handle = tar.extractfile(member)
                need(handle is not None, "DEBIAN_ARCHIVE_MEMBER_UNREADABLE")
                data = handle.read(MAX_FILE + 1)
                need(len(data) == member.size, "DEBIAN_ARCHIVE_MEMBER_TRUNCATED")
                if path.startswith(ADAPTER):
                    adapter_files.add(path)
                    if test_or_document(path):
                        dev_files.append(path)
                else:
                    rel = path[len(CLI):]
                    need(SAFE_FILE.fullmatch(rel) is not None and not rel.startswith("."),
                         "PRIVATE_CLI_FILE_PATH_INVALID")
                    cli_files[rel] = {"sha256": sha(data), "size": len(data)}
    except (tarfile.TarError, OSError, EOFError):
        raise Refused("DEBIAN_ARCHIVE_UNREADABLE") from None
    need(adapter_files and cli_files, "DEBIAN_REQUIRED_RUNTIME_MISSING")
    return {"cli_files": cli_files, "adapter_count": len(adapter_files),
            "development_files": sorted(dev_files), "unsafe_files": sorted(unsafe),
            "total_entries": count}


def load_approval(path):
    need(path.is_file() and not path.is_symlink() and
         0 < path.stat().st_size <= 131072, "PRIVATE_RUNTIME_APPROVAL_ABSENT")
    try:
        approval = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError):
        raise Refused("PRIVATE_RUNTIME_APPROVAL_INVALID") from None
    need(isinstance(approval, dict) and set(approval) == {
        "schema", "scope", "owner_repository", "source_commit",
        "review_commit", "owner_review_url", "approval_state", "files"
    }, "PRIVATE_RUNTIME_APPROVAL_INVALID")
    need(approval["schema"] == "xiio.hex.public-runtime-owner-approval/v1"
         and approval["scope"] == "CUBE_DEV10_PUBLIC_RUNTIME_ONLY"
         and approval["owner_repository"] == SOURCE_OWNER
         and approval["approval_state"] == "APPROVED_FOR_PUBLIC_RUNTIME_DISTRIBUTION"
         and isinstance(approval["source_commit"], str)
         and SHA40.fullmatch(approval["source_commit"])
         and isinstance(approval["review_commit"], str)
         and SHA40.fullmatch(approval["review_commit"])
         and isinstance(approval["owner_review_url"], str)
         and REVIEW.fullmatch(approval["owner_review_url"])
         and isinstance(approval["files"], dict) and approval["files"],
         "PRIVATE_RUNTIME_APPROVAL_UNVERIFIED")
    return approval


def qualify(scan, approval_path=DEFAULT_APPROVAL):
    need(not scan["unsafe_files"], "DEBIAN_PRIVATE_RUNTIME_LINK_OR_TYPE_REFUSED")
    need(not scan["development_files"], "DEBIAN_DEVELOPMENT_FILES_PRESENT")
    approval = load_approval(approval_path)
    expected = approval["files"]
    need(set(expected) == set(scan["cli_files"]), "PRIVATE_RUNTIME_FILESET_UNAPPROVED")
    for name, observed in scan["cli_files"].items():
        entry = expected[name]
        need(isinstance(entry, dict) and set(entry) == {"sha256", "size"}
             and isinstance(entry["sha256"], str) and HEX_SHA.fullmatch(entry["sha256"])
             and type(entry["size"]) is int and entry["size"] > 0
             and entry == observed, "PRIVATE_RUNTIME_BYTES_UNAPPROVED")
    # The review record is a distribution gate requiring separate real owner
    # approval. A self-authored JSON manifest does not grant distribution rights.
    return {
        "schema": SCHEMA, "state": "RUNTIME_CONTENT_REVIEW_GATE_PASSED",
        "cli_file_count": len(scan["cli_files"]),
        "adapter_file_count": scan["adapter_count"],
        "source_commit": approval["source_commit"],
        "review_commit": approval["review_commit"],
        "owner_review_url": approval["owner_review_url"],
        "private_owner_approval_independently_confirmed": False,
        "six_product_release_lock_verified": False,
        "physical_install_verified": False,
        "publication_performed": False
    }


def check_deb(path, approval_path=DEFAULT_APPROVAL):
    need(path.is_file() and not path.is_symlink()
         and 0 < path.stat().st_size <= MAX_PAYLOAD,
         "DEBIAN_PACKAGE_UNTRUSTED")
    try:
        result = subprocess.run(["dpkg-deb", "--fsys-tarfile", str(path)],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=35, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Refused("DEBIAN_READER_UNAVAILABLE") from None
    need(result.returncode == 0 and 0 < len(result.stdout) <= MAX_PAYLOAD,
         "DEBIAN_ARCHIVE_UNREADABLE")
    scan = scan_tar(result.stdout)
    return qualify(scan, approval_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--deb", required=True, type=Path)
    ap.add_argument("--approval", type=Path, default=DEFAULT_APPROVAL)
    args = ap.parse_args()
    try:
        print(json.dumps(check_deb(args.deb, args.approval), sort_keys=True))
        return 0
    except Refused as e:
        print(json.dumps({"schema": SCHEMA, "state": "BLOCKED",
                          "first_red": str(e),
                          "public_candidate_upload_allowed": False,
                          "release_publication_allowed": False,
                          "installed_hosts_untouched": True}, sort_keys=True),
              file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
