from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from .discovery import xdg_roots

_ABSOLUTE_POSIX_PATH_RE = re.compile(r"(?<![:/A-Za-z0-9_$.-])/(?:[^\s,;\]\[(){}\"']+)")
_WINDOWS_PATH_RE = re.compile(r"(?i)(?<![A-Za-z0-9_$.-])(?:[A-Z]:\\|\\\\)[^\s,;\]\[(){}\"']+")
_SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s,;]+"),
    re.compile(r"(?i)((?:password|passwd|token|secret|api[_-]?key|access[_-]?key)\s*[:=]\s*)[^\s,;]+"),
    re.compile(r"\b(?:sk-(?:proj-)?|gh[pousr]_|github_pat_|xox[baprs]-)[A-Za-z0-9_\-]{8,}\b"),
    re.compile(r"\bAKIA[A-Z0-9]{12,}\b"),
)


def _known_path_replacements(env: dict[str, str] | None = None) -> list[tuple[str, str]]:
    e = dict(os.environ if env is None else env)
    roots = xdg_roots(e)
    values: list[tuple[str, str]] = []
    home = e.get("HOME")
    if home:
        values.append((str(Path(home).expanduser()), "$HOME"))
    for key, path in roots.items():
        values.append((str(path), f"${key.upper()}"))
    unique = {source: replacement for source, replacement in values if source and source != "/"}
    return sorted(unique.items(), key=lambda item: len(item[0]), reverse=True)


def redact_text(value: str, env: dict[str, str] | None = None, limit: int = 2048) -> str:
    text = value
    for source, replacement in _known_path_replacements(env):
        text = text.replace(source, replacement)
    for pattern in _SECRET_PATTERNS:
        if pattern.groups:
            text = pattern.sub(lambda m: f"{m.group(1)}[REDACTED]", text)
        else:
            text = pattern.sub("[REDACTED]", text)
    text = _ABSOLUTE_POSIX_PATH_RE.sub("[LOCAL_PATH]", text)
    text = _WINDOWS_PATH_RE.sub("[LOCAL_PATH]", text)
    if len(text) > limit:
        text = text[:limit] + "...[TRUNCATED]"
    return text


def redact(value: Any, env: dict[str, str] | None = None) -> Any:
    if isinstance(value, str):
        return redact_text(value, env)
    if isinstance(value, (list, tuple)):
        return [redact(item, env) for item in value]
    if isinstance(value, dict):
        return {str(key): redact(item, env) for key, item in value.items()}
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return redact_text(str(value), env)
