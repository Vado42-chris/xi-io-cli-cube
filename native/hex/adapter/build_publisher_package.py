#!/usr/bin/env python3
"""Read-only input / build-only adapter from Publisher's existing DEV handoff
to the EXISTING xiio-installer-product-manifest-v1. Not release admission,
installation, a new product registry, or platform qualification.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
from pathlib import Path

from native.hex.adapter.kernel.xiio_installer.manifest import load_manifest, verify_payload

SCHEMA = "xiio.shared-web-artifact-handoff/v1"
SHA40 = re.compile(r"^[0-9a-f]{40}$")
MAX_HTML_BYTES = 64 * 1024 * 1024


class PublisherPackageError(ValueError):
    pass


def require(condition: bool, error: str) -> None:
    if not condition:
        raise PublisherPackageError(error)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def trusted_file(path: Path, limit: int) -> bytes:
    require(path.is_file() and not path.is_symlink()
            and all(not p.is_symlink() for p in path.parents),
            "PUBLISHER_SOURCE_FILE_UNTRUSTED")
    stat = path.stat()
    require(stat.st_nlink == 1 and 0 < stat.st_size <= limit,
            "PUBLISHER_SOURCE_FILE_SIZE_INVALID")
    data = path.read_bytes()
    require(len(data) == stat.st_size, "PUBLISHER_SOURCE_CHANGED")
    return data


def compile_publisher_package(handoff_root: Path, destination: Path) -> dict:
    """Preserves Publisher source/digest, builds no launch/execution authority."""
    root = Path(handoff_root)
    out = Path(destination)
    require(root.is_absolute() and root.is_dir() and not root.is_symlink()
            and all(not x.is_symlink() for x in root.parents),
            "PUBLISHER_HANDOFF_ROOT_UNTRUSTED")
    require(out.is_absolute() and not out.exists() and not out.is_symlink()
            and out.parent.is_dir()
            and all(not parent.is_symlink() for parent in out.parents),
            "PUBLISHER_OUTPUT_MUST_BE_NEW")
    raw = trusted_file(root / "hosting-handoff" / "handoff.json", 128 * 1024)
    try:
        handoff = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise PublisherPackageError("PUBLISHER_HANDOFF_JSON_INVALID") from exc
    require(isinstance(handoff, dict) and handoff.get("schema") == SCHEMA,
            "PUBLISHER_HANDOFF_SCHEMA_INVALID")
    producer = handoff.get("producer")
    artifact = handoff.get("artifact")
    hosting = handoff.get("hosting")
    require(isinstance(producer, dict) and isinstance(artifact, dict)
            and isinstance(hosting, dict), "PUBLISHER_HANDOFF_FIELDS_INVALID")
    source_sha = producer.get("source_sha")
    require(isinstance(source_sha, str) and SHA40.fullmatch(source_sha),
            "PUBLISHER_SOURCE_GENERATION_INVALID")
    require(artifact.get("root_base") == "browser_evidence_root"
            and artifact.get("root") == "web"
            and artifact.get("entrypoint") == "index.html"
            and type(artifact.get("file_count")) is int
            and artifact["file_count"] == 1
            and type(artifact.get("bytes")) is int
            and hosting.get("provider_effects") == 0
            and hosting.get("live_claim") is False,
            "PUBLISHER_HANDOFF_SCOPE_UNQUALIFIED")
    html = trusted_file(root / "web" / "index.html", MAX_HTML_BYTES)
    actual_digest = digest(html)
    inventory = [{"path": "index.html", "bytes": len(html), "sha256": actual_digest}]
    inventory_digest = digest(json.dumps(inventory, separators=(",", ":"), ensure_ascii=False).encode())
    require(artifact.get("bytes") == len(html)
            and artifact.get("inventory_sha256") == inventory_digest,
            "PUBLISHER_HANDOFF_INVENTORY_MISMATCH")
    require(not (root / "web" / "index.html").is_symlink(),
            "PUBLISHER_PAYLOAD_SYMLINK_FORBIDDEN")

    # Use the existing Installer v1 manifest, never invent an installer kernel.
    manifest = {
        "schema_version": "xiio-installer-product-manifest-v1",
        "profile_id": "publisher-product",
        "product_id": "xiio-publisher",
        "display_name": "xi-io Publisher",
        "version": "source-" + source_sha[:12],
        "channel": "alpha",
        "fixture": False,
        "payload": [{
            "source": "payload/index.html",
            "sha256": actual_digest,
            "size": len(html),
            "destination_scope": "xdg_data",
            "destination": "xiio/publisher/index.html",
            "mode": "0644",
            "overwrite": "backup_replace",
        }],
    }
    # Product identity and source generation remain separate from any BINS UUID.
    # A product-only source package must not invent a user-owned resource ID.
    descriptor = {
        "schema": "xiio.hex.publisher-product-source-package/v1",
        "state": "PACKAGED_NOT_RELEASED_OR_INSTALLED",
        "publisher_source_head": source_sha,
        "publisher_handoff_sha256": digest(raw),
        "publisher_artifact_sha256": actual_digest,
        "product_id": manifest["product_id"],
        "product_manifest": "manifest.json",
        "platforms_qualified": [],
        "release_authority": False,
        "bins_resource_version_bound": False,
        "work_return_bound": False,
        "effect_authority": False,
    }

    out.mkdir(mode=0o700)
    try:
        (out / "payload").mkdir(mode=0o700)
        target = out / "payload" / "index.html"
        with target.open("xb") as stream:
            stream.write(html)
            stream.flush()
            os.fsync(stream.fileno())
        manifest_bytes = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
        (out / "manifest.json").write_bytes(manifest_bytes)
        (out / "publisher-product.json").write_text(
            json.dumps(descriptor, sort_keys=True, indent=2) + "\n")
        # Same accepted Installer validator, independently reopened output bytes.
        validated = load_manifest(out / "manifest.json")
        verified = verify_payload(validated, out)
        require(len(verified) == 1 and verified[0]["sha256"] == actual_digest,
                "PUBLISHER_PACKAGE_READBACK_INVALID")
        receipt = {
            "schema": "xiio.hex.publisher-source-package-receipt/v1",
            "state": "PACKAGED_READBACK_VERIFIED_NOT_INSTALLED",
            "publisher_source_head": source_sha,
            "publisher_artifact_sha256": actual_digest,
            "manifest_sha256": digest((out / "manifest.json").read_bytes()),
            "entries_verified": len(verified),
            "release_authority": False,
            "effect_authority": False,
        }
        (out / "BUILD-RECEIPT.json").write_text(
            json.dumps(receipt, sort_keys=True, indent=2) + "\n")
        return receipt
    except Exception:
        shutil.rmtree(out, ignore_errors=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--handoff-root", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(compile_publisher_package(
            Path(args.handoff_root), Path(args.out)), sort_keys=True))
        return 0
    except (PublisherPackageError, OSError, ValueError) as exc:
        code = str(exc)
        print(json.dumps({"state": "BLOCKED",
                          "first_red": code if re.fullmatch(r"[A-Z0-9_]+", code)
                          else "PUBLISHER_SOURCE_PACKAGE_INVALID",
                          "effect_authority": False}, sort_keys=True))
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
