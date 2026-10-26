from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_SCOPES = {"xdg_config", "xdg_data", "xdg_state", "xdg_cache"}
ALLOWED_CHANNELS = {"stable", "rc", "beta", "alpha", "fixture"}

class ManifestError(ValueError):
    pass

@dataclass(frozen=True)
class PayloadEntry:
    source: str
    sha256: str
    size: int
    destination_scope: str
    destination: str
    mode: int = 0o644
    overwrite: str = "backup_replace"

@dataclass(frozen=True)
class ProductManifest:
    schema_version: str
    profile_id: str
    product_id: str
    display_name: str
    version: str
    channel: str
    fixture: bool
    entries: tuple[PayloadEntry, ...]
    raw: dict[str, Any]


def _safe_relpath(value: str, field: str) -> str:
    if not value or "\x00" in value:
        raise ManifestError(f"{field}: empty or NUL path")
    p = PurePosixPath(value)
    if p.is_absolute() or ".." in p.parts:
        raise ManifestError(f"{field}: must be a safe relative path")
    normalized = str(p)
    if normalized in {".", ""}:
        raise ManifestError(f"{field}: must name a file")
    return normalized


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest(path: Path) -> ProductManifest:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema_version") != "xiio-installer-product-manifest-v1":
        raise ManifestError("unsupported schema_version")
    required = ["profile_id", "product_id", "display_name", "version", "channel", "payload"]
    for key in required:
        if key not in raw:
            raise ManifestError(f"missing required field: {key}")
    channel = str(raw["channel"])
    if channel not in ALLOWED_CHANNELS:
        raise ManifestError(f"unsupported channel: {channel}")
    fixture = bool(raw.get("fixture", False))
    if fixture and channel != "fixture":
        raise ManifestError("fixture manifests must use fixture channel")
    if not fixture and channel == "fixture":
        raise ManifestError("fixture channel requires fixture=true")

    entries: list[PayloadEntry] = []
    seen_destinations: set[tuple[str, str]] = set()
    for index, item in enumerate(raw["payload"]):
        if not isinstance(item, dict):
            raise ManifestError(f"payload[{index}] must be an object")
        source = _safe_relpath(str(item.get("source", "")), f"payload[{index}].source")
        destination = _safe_relpath(str(item.get("destination", "")), f"payload[{index}].destination")
        scope = str(item.get("destination_scope", ""))
        if scope not in ALLOWED_SCOPES:
            raise ManifestError(f"payload[{index}].destination_scope invalid: {scope}")
        digest = str(item.get("sha256", ""))
        if not SHA256_RE.fullmatch(digest):
            raise ManifestError(f"payload[{index}].sha256 must be lowercase SHA-256")
        size = item.get("size")
        if not isinstance(size, int) or size < 0:
            raise ManifestError(f"payload[{index}].size must be a nonnegative integer")
        mode_raw = item.get("mode", "0644")
        if isinstance(mode_raw, int):
            mode = mode_raw
        elif isinstance(mode_raw, str) and re.fullmatch(r"0?[0-7]{3,4}", mode_raw):
            mode = int(mode_raw, 8)
        else:
            raise ManifestError(f"payload[{index}].mode invalid")
        if mode < 0 or mode > 0o777:
            raise ManifestError(f"payload[{index}].mode must be within 0000-0777")
        overwrite = str(item.get("overwrite", "backup_replace"))
        if overwrite not in {"fail", "backup_replace", "same_hash_ok"}:
            raise ManifestError(f"payload[{index}].overwrite invalid")
        key = (scope, destination)
        if key in seen_destinations:
            raise ManifestError(f"duplicate destination: {scope}:{destination}")
        seen_destinations.add(key)
        entries.append(PayloadEntry(source, digest, size, scope, destination, mode, overwrite))

    if not entries:
        raise ManifestError("payload must contain at least one file")
    return ProductManifest(
        schema_version=raw["schema_version"],
        profile_id=str(raw["profile_id"]),
        product_id=str(raw["product_id"]),
        display_name=str(raw["display_name"]),
        version=str(raw["version"]),
        channel=channel,
        fixture=fixture,
        entries=tuple(entries),
        raw=raw,
    )


def verify_payload(manifest: ProductManifest, payload_root: Path) -> list[dict[str, Any]]:
    root = payload_root.resolve()
    results: list[dict[str, Any]] = []
    for entry in manifest.entries:
        source = (root / entry.source)
        try:
            resolved = source.resolve(strict=True)
        except FileNotFoundError as exc:
            raise ManifestError(f"payload source missing: {entry.source}") from exc
        if root != resolved and root not in resolved.parents:
            raise ManifestError(f"payload source escapes root: {entry.source}")
        if source.is_symlink():
            raise ManifestError(f"payload source symlink forbidden: {entry.source}")
        if not resolved.is_file():
            raise ManifestError(f"payload source is not a file: {entry.source}")
        size = resolved.stat().st_size
        if size != entry.size:
            raise ManifestError(f"payload size mismatch: {entry.source}")
        digest = sha256_file(resolved)
        if digest != entry.sha256:
            raise ManifestError(f"payload digest mismatch: {entry.source}")
        results.append({"source": entry.source, "sha256": digest, "size": size})
    return results
