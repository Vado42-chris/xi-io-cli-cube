#!/usr/bin/env python3
"""Capture and independently reopen the exact local Ollama model identity."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import urllib.request


DIGEST = re.compile(r"^[0-9a-f]{64}$")


class ModelIdentityError(RuntimeError):
    pass


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise ModelIdentityError(reason)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch_tags(endpoint: str) -> dict:
    request = urllib.request.Request(endpoint.rstrip("/") + "/api/tags",
                                     headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        require(response.status == 200, "OLLAMA_TAGS_HTTP_FAILED")
        data = response.read(2_000_001)
    require(len(data) <= 2_000_000, "OLLAMA_TAGS_RESPONSE_TOO_LARGE")
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, ValueError) as error:
        raise ModelIdentityError("OLLAMA_TAGS_JSON_INVALID") from error
    require(isinstance(value, dict), "OLLAMA_TAGS_JSON_INVALID")
    return value


def observe(model: str, tags: dict) -> dict:
    rows = tags.get("models")
    require(isinstance(rows, list), "OLLAMA_MODEL_LIST_INVALID")
    matches = [row for row in rows if isinstance(row, dict)
               and (row.get("name") == model or row.get("model") == model)]
    require(len(matches) == 1, "OLLAMA_MODEL_IDENTITY_AMBIGUOUS")
    row = matches[0]
    digest = row.get("digest")
    size = row.get("size")
    details = row.get("details")
    require(isinstance(digest, str) and DIGEST.fullmatch(digest),
            "OLLAMA_MODEL_DIGEST_INVALID")
    require(type(size) is int and size > 0, "OLLAMA_MODEL_SIZE_INVALID")
    require(isinstance(details, dict), "OLLAMA_MODEL_DETAILS_INVALID")
    selected_details = {}
    for key in ["format", "family", "parameter_size", "quantization_level"]:
        value = details.get(key)
        require(isinstance(value, str) and value, "OLLAMA_MODEL_DETAILS_INVALID")
        selected_details[key] = value
    return {
        "model": model,
        "digest": digest,
        "size": size,
        "details": selected_details,
    }


def secure_write(path: Path, value: dict) -> bytes:
    encoded = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
    finally:
        os.close(fd)
    observed = path.lstat()
    require(stat.S_ISREG(observed.st_mode) and observed.st_nlink == 1
            and observed.st_uid == os.getuid() and stat.S_IMODE(observed.st_mode) == 0o600
            and path.read_bytes() == encoded,
            "OLLAMA_MODEL_IDENTITY_WRITE_READBACK_FAILED")
    return encoded


def secure_read(path: Path) -> tuple[dict, bytes]:
    observed = path.lstat()
    require(stat.S_ISREG(observed.st_mode) and not path.is_symlink()
            and observed.st_nlink == 1 and observed.st_uid == os.getuid()
            and stat.S_IMODE(observed.st_mode) == 0o600
            and path.resolve() == path.absolute(),
            "OLLAMA_MODEL_IDENTITY_CUSTODY_INVALID")
    data = path.read_bytes()
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, ValueError) as error:
        raise ModelIdentityError("OLLAMA_MODEL_IDENTITY_JSON_INVALID") from error
    require(isinstance(value, dict), "OLLAMA_MODEL_IDENTITY_JSON_INVALID")
    return value, data


def capture(model: str, endpoint: str, output: Path, *, fetch=fetch_tags) -> dict:
    identity = observe(model, fetch(endpoint))
    record = {
        "schema": "xiio.hex.ollama-model-identity/v1",
        "state": "OLLAMA_MODEL_IDENTITY_CAPTURED",
        **identity,
        "endpoint": endpoint.rstrip("/"),
        "provider": "ollama-local",
        "effect_authority": False,
        "billing_effect_authority": False,
        "provider_effect": False,
    }
    secure_write(output.absolute(), record)
    return record


def reopen(model: str, endpoint: str, record_path: Path, output: Path, *, fetch=fetch_tags) -> dict:
    baseline, baseline_bytes = secure_read(record_path.absolute())
    require(baseline.get("schema") == "xiio.hex.ollama-model-identity/v1"
            and baseline.get("state") == "OLLAMA_MODEL_IDENTITY_CAPTURED"
            and baseline.get("model") == model
            and baseline.get("endpoint") == endpoint.rstrip("/")
            and baseline.get("effect_authority") is False
            and baseline.get("billing_effect_authority") is False
            and baseline.get("provider_effect") is False,
            "OLLAMA_MODEL_IDENTITY_BASELINE_INVALID")
    current = observe(model, fetch(endpoint))
    require(all(baseline.get(key) == current.get(key)
                for key in ["model", "digest", "size", "details"]),
            "OLLAMA_MODEL_IDENTITY_CHANGED")
    result = {
        "schema": "xiio.hex.ollama-model-identity-readback/v1",
        "state": "OLLAMA_MODEL_IDENTITY_REOPEN_VERIFIED",
        **current,
        "endpoint": endpoint.rstrip("/"),
        "baseline_sha256": sha256(baseline_bytes),
        "effect_authority": False,
        "billing_effect_authority": False,
        "provider_effect": False,
    }
    secure_write(output.absolute(), result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["capture", "reopen"])
    parser.add_argument("--model", required=True)
    parser.add_argument("--endpoint", default="http://127.0.0.1:11434")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--record", type=Path)
    args = parser.parse_args()
    if args.action == "capture":
        result = capture(args.model, args.endpoint, args.output)
    else:
        require(args.record is not None, "OLLAMA_MODEL_IDENTITY_RECORD_REQUIRED")
        result = reopen(args.model, args.endpoint, args.record, args.output)
    print(result["state"] + ":" + result["digest"])


if __name__ == "__main__":
    main()
