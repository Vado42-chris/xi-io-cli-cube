#!/usr/bin/env python3
"""Independently verify custody of an installed real-Ollama proof bench.

This verifier does not invoke a model, grant authority, or repair evidence. It
runs only after the installed transaction and refuses permissive, linked,
substituted, or incomplete custody before the workflow can claim PASS.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat


GENERATION = re.compile(r"^[0-9a-f]{12}-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9_-]+$")


class CustodyError(RuntimeError):
    pass


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise CustodyError(reason)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def relative(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError as error:
        raise CustodyError("EVIDENCE_PATH_OUTSIDE_ROOT") from error


def directory(root: Path, path: Path) -> dict:
    observed = path.lstat()
    mode = stat.S_IMODE(observed.st_mode)
    require(stat.S_ISDIR(observed.st_mode) and not path.is_symlink(),
            "EVIDENCE_DIRECTORY_CUSTODY_INVALID:" + relative(root, path))
    require(observed.st_uid == os.getuid() and not (mode & 0o022),
            "EVIDENCE_DIRECTORY_PERMISSIONS_INVALID:" + relative(root, path))
    require(path.resolve() == path.absolute(),
            "EVIDENCE_DIRECTORY_SUBSTITUTED:" + relative(root, path))
    return {"path": relative(root, path), "mode": f"{mode:04o}"}


def file_bytes(root: Path, path: Path, *, exact_mode: int | None = None) -> tuple[bytes, dict]:
    observed = path.lstat()
    mode = stat.S_IMODE(observed.st_mode)
    name = relative(root, path)
    require(stat.S_ISREG(observed.st_mode) and not path.is_symlink()
            and observed.st_nlink == 1 and observed.st_uid == os.getuid(),
            "EVIDENCE_FILE_CUSTODY_INVALID:" + name)
    require(path.resolve() == path.absolute(), "EVIDENCE_FILE_SUBSTITUTED:" + name)
    require(not (mode & 0o022), "EVIDENCE_FILE_WRITABLE_BY_OTHERS:" + name)
    if exact_mode is not None:
        require(mode == exact_mode, "EVIDENCE_FILE_MODE_INVALID:" + name)
    data = path.read_bytes()
    return data, {"path": name, "mode": f"{mode:04o}", "size": len(data), "sha256": digest(data)}


def json_file(root: Path, path: Path, *, exact_mode: int | None = None) -> tuple[dict, dict]:
    data, record = file_bytes(root, path, exact_mode=exact_mode)
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, ValueError) as error:
        raise CustodyError("EVIDENCE_JSON_INVALID:" + relative(root, path)) from error
    require(isinstance(value, dict), "EVIDENCE_JSON_INVALID:" + relative(root, path))
    return value, record


def safe_payload_path(value: str) -> Path:
    path = Path(value)
    require(value and not path.is_absolute() and ".." not in path.parts,
            "EVIDENCE_PAYLOAD_PATH_INVALID")
    return path


def secure_json(path: Path, value: dict) -> None:
    encoded = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    try:
        os.write(fd, encoded)
        os.fsync(fd)
    finally:
        os.close(fd)
    reread = path.lstat()
    require(stat.S_ISREG(reread.st_mode) and reread.st_nlink == 1
            and reread.st_uid == os.getuid() and stat.S_IMODE(reread.st_mode) == 0o600
            and path.read_bytes() == encoded,
            "EVIDENCE_CUSTODY_RECEIPT_READBACK_FAILED")


def verify(root: Path) -> dict:
    root = root.absolute()
    require(root.exists() and root.resolve() == root, "EVIDENCE_ROOT_INVALID")
    directories = [directory(root, root)]
    for name in ["bin", "prefix", "prefix/versions", "state", "state/chat", "config", "project"]:
        directories.append(directory(root, root / name))

    launcher_data, launcher = file_bytes(root, root / "bin/xi-io-cli", exact_mode=0o755)
    require(bool(launcher_data) and os.access(root / "bin/xi-io-cli", os.X_OK),
            "EVIDENCE_LAUNCHER_NOT_EXECUTABLE")

    pointers: dict[str, str] = {}
    pointer_records = []
    for name in ["current", "previous"]:
        data, record = file_bytes(root, root / "prefix" / name, exact_mode=0o600)
        value = data.decode().strip()
        require(bool(GENERATION.fullmatch(value)), "EVIDENCE_POINTER_INVALID:" + name)
        pointers[name] = value
        pointer_records.append(record)
    require(pointers["current"] != pointers["previous"], "EVIDENCE_POINTERS_COLLAPSED")

    versions_root = root / "prefix/versions"
    generations = sorted(path.name for path in versions_root.iterdir())
    require(len(generations) == 2 and all(GENERATION.fullmatch(name) for name in generations),
            "EVIDENCE_GENERATION_SET_INVALID")
    require(set(pointers.values()) == set(generations), "EVIDENCE_POINTER_GENERATION_MISMATCH")

    generation_records = []
    source_sha = None
    for generation in generations:
        generation_root = versions_root / generation
        directory(root, generation_root)
        receipt, receipt_record = json_file(root, generation_root / "install-receipt.json", exact_mode=0o600)
        require(receipt.get("schema") == "xiio.cli.install-receipt/v2"
                and receipt.get("generation") == generation
                and receipt.get("repo") == "Vado42-chris/xi-io-cli"
                and receipt.get("ref") == receipt.get("source_sha")
                and re.fullmatch(r"[0-9a-f]{40}", str(receipt.get("source_sha", "")))
                and Path(str(receipt.get("prefix", ""))).absolute() == (root / "prefix").absolute()
                and isinstance(receipt.get("files"), dict) and receipt["files"],
                "EVIDENCE_INSTALL_RECEIPT_MISMATCH:" + generation)
        if source_sha is None:
            source_sha = receipt["source_sha"]
        require(receipt["source_sha"] == source_sha, "EVIDENCE_SOURCE_GENERATION_SPLIT")
        payload_records = []
        for value, expected in sorted(receipt["files"].items()):
            require(re.fullmatch(r"[0-9a-f]{64}", str(expected)), "EVIDENCE_PAYLOAD_DIGEST_INVALID")
            payload = generation_root / safe_payload_path(value)
            data, record = file_bytes(root, payload, exact_mode=0o600)
            require(digest(data) == expected, "EVIDENCE_PAYLOAD_MISMATCH:" + value)
            payload_records.append(record)
        generation_records.append({"generation": generation, "receipt": receipt_record,
                                   "payload": payload_records})

    sessions = sorted((root / "state/chat").glob("*.json"))
    require(len(sessions) == 1, "EVIDENCE_CHAT_SESSION_SET_INVALID")
    session, session_record = json_file(root, sessions[0], exact_mode=0o600)
    require(session.get("schema") == "xiio.cli.chat-session/v1"
            and session.get("workspace") == str(root / "project")
            and isinstance(session.get("messages"), list) and session["messages"],
            "EVIDENCE_CHAT_SESSION_INVALID")

    config_records = []
    for path in sorted((root / "config").rglob("*")):
        if path.is_file() or path.is_symlink():
            _, record = file_bytes(root, path)
            config_records.append(record)
    require(config_records, "EVIDENCE_CONFIG_MISSING")

    note_data, note_record = file_bytes(root, root / "project/NOTE.txt")
    require(note_data == b"status: new\n", "EVIDENCE_PROJECT_READBACK_MISMATCH")

    outcome, outcome_record = json_file(root, root / "installed-outcome.json")
    require(outcome.get("state") == "PASS"
            and outcome.get("first_generation") in generations
            and outcome.get("second_generation") in generations
            and outcome.get("first_generation") != outcome.get("second_generation")
            and outcome.get("same_source_generations") is True
            and outcome.get("canonical_cli_adoption") is False
            and outcome.get("ward_authority_granted") is False
            and outcome.get("bins_version_qualified") is False
            and outcome.get("consumed_return_qualified") is False,
            "EVIDENCE_CLAIM_CEILING_VIOLATED")

    evidence = {
        "schema": "xiio.hex.installed-ollama-evidence-custody/v1",
        "state": "INSTALLED_OLLAMA_EVIDENCE_CUSTODY_VERIFIED",
        "source_sha": source_sha,
        "pointers": pointers,
        "launcher": launcher,
        "pointer_records": pointer_records,
        "generations": generation_records,
        "chat_session": session_record,
        "config": config_records,
        "project_note": note_record,
        "outcome": outcome_record,
        "effect_authority": False,
        "ward_authority": False,
        "billing_effect_authority": False,
        "provider_effect": False,
        "aries_or_loki": False,
        "return_applied": False,
    }
    secure_json(root / "evidence-custody.json", evidence)
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.root)
    print(result["state"])


if __name__ == "__main__":
    main()
