from __future__ import annotations

import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any


def _version(path: str | None) -> str | None:
    if not path:
        return None
    try:
        p = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=2, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    lines = (p.stdout or p.stderr or "").strip().splitlines()
    return lines[0][:160] if lines else "detected"


def platform_family(system: str) -> str:
    value = system.strip().lower()
    if value == "linux":
        return "linux"
    if value == "windows":
        return "windows"
    if value in {"darwin", "macos", "mac os", "mac os x"}:
        return "macos"
    return "unknown"


def xdg_roots(env: dict[str, str] | None = None) -> dict[str, Path]:
    """Return the existing Linux/XDG transaction roots without changing 001A semantics."""
    e = os.environ if env is None else env
    home = Path(e.get("HOME", str(Path.home()))).expanduser()
    return {
        "xdg_config": Path(e.get("XDG_CONFIG_HOME", str(home / ".config"))).expanduser(),
        "xdg_data": Path(e.get("XDG_DATA_HOME", str(home / ".local/share"))).expanduser(),
        "xdg_state": Path(e.get("XDG_STATE_HOME", str(home / ".local/state"))).expanduser(),
        "xdg_cache": Path(e.get("XDG_CACHE_HOME", str(home / ".cache"))).expanduser(),
    }


def _root_record(path: str | Path | None, source: str) -> dict[str, Any]:
    if path is None or str(path).strip() == "":
        return {
            "path": None,
            "source": source,
            "state": "unknown",
            "observation_only": True,
        }
    return {
        "path": str(Path(path).expanduser()),
        "source": source,
        "state": "observed",
        "observation_only": True,
    }


def observe_semantic_roots(
    env: dict[str, str] | None = None,
    *,
    system: str | None = None,
) -> dict[str, Any]:
    """Observe user-scoped semantic roots without granting install authority.

    This is a product-local reference implementation, not a frozen framework schema.
    Linux preserves the existing XDG mapping. Windows reports only environment-backed
    paths and leaves missing values unknown rather than guessing. macOS is recognized
    but intentionally unimplemented/unqualified in this slice.
    """
    e = dict(os.environ if env is None else env)
    observed_system = system or platform.system() or "Unknown"
    family = platform_family(observed_system)

    if family == "linux":
        roots = xdg_roots(e)
        temp_source = next((name for name in ("TMPDIR", "TEMP", "TMP") if e.get(name)), "posix_default")
        temp_path = e.get("TMPDIR") or e.get("TEMP") or e.get("TMP") or "/tmp"
        semantic = {
            "config": _root_record(roots["xdg_config"], "XDG_CONFIG_HOME" if e.get("XDG_CONFIG_HOME") else "xdg_default"),
            "data": _root_record(roots["xdg_data"], "XDG_DATA_HOME" if e.get("XDG_DATA_HOME") else "xdg_default"),
            "state": _root_record(roots["xdg_state"], "XDG_STATE_HOME" if e.get("XDG_STATE_HOME") else "xdg_default"),
            "cache": _root_record(roots["xdg_cache"], "XDG_CACHE_HOME" if e.get("XDG_CACHE_HOME") else "xdg_default"),
            "temp": _root_record(temp_path, temp_source),
        }
        adapter_state = "implemented_reference"
    elif family == "windows":
        temp_source = next((name for name in ("TEMP", "TMP") if e.get(name)), "TEMP|TMP")
        semantic = {
            "config": _root_record(e.get("APPDATA"), "APPDATA"),
            "data": _root_record(e.get("LOCALAPPDATA"), "LOCALAPPDATA"),
            "state": _root_record(e.get("LOCALAPPDATA"), "LOCALAPPDATA"),
            "cache": _root_record(e.get("LOCALAPPDATA"), "LOCALAPPDATA"),
            "temp": _root_record(e.get("TEMP") or e.get("TMP"), temp_source),
        }
        adapter_state = "preview_unqualified"
    else:
        semantic = {
            name: _root_record(None, "not_implemented")
            for name in ("config", "data", "state", "cache", "temp")
        }
        adapter_state = "not_implemented" if family == "macos" else "unsupported_unknown"

    unknowns = [name for name, record in semantic.items() if record["state"] == "unknown"]
    return {
        "family": family,
        "system": observed_system,
        "adapter_state": adapter_state,
        "roots": semantic,
        "unknowns": unknowns,
        "stable_identity_claimed": False,
    }


_ROLE_NAMES = ("git", "node", "python", "zed", "ollama", "ssh", "shell", "package")


def _role_candidates(family: str) -> dict[str, tuple[str, ...]]:
    if family == "windows":
        return {
            "git": ("git.exe", "git"),
            "node": ("node.exe", "node"),
            "python": ("py.exe", "python.exe", "python", "python3"),
            "zed": ("zed.exe", "zed"),
            "ollama": ("ollama.exe", "ollama"),
            "ssh": ("ssh.exe", "ssh"),
            "shell": ("pwsh.exe", "powershell.exe", "cmd.exe"),
            "package": ("winget.exe", "winget"),
        }
    if family == "linux":
        return {
            "git": ("git",),
            "node": ("node",),
            "python": ("python3", "python"),
            "zed": ("zed",),
            "ollama": ("ollama",),
            "ssh": ("ssh",),
            "shell": ("bash", "sh"),
            "package": ("dpkg-deb",),
        }
    return {role: () for role in _ROLE_NAMES}


def discover_executable_roles(
    env: dict[str, str] | None = None,
    *,
    family: str,
) -> dict[str, Any]:
    """Observe executable presence by PATH without launching newly discovered tools."""
    e = os.environ if env is None else env
    candidates_by_role = _role_candidates(family)
    implemented = family in {"linux", "windows"}
    result: dict[str, Any] = {}
    for role, candidates in candidates_by_role.items():
        selected: dict[str, Any] | None = None
        for candidate in candidates:
            path = shutil.which(candidate, path=e.get("PATH"))
            if path:
                selected = {
                    "candidate": candidate,
                    "path": path,
                }
                break
        if not implemented:
            state = "not_implemented"
        else:
            state = "observed" if selected is not None else "unavailable"
        result[role] = {
            "candidates": list(candidates),
            "selected": selected,
            "state": state,
            "qualification_claimed": False,
        }
    return result


def discover_host(env: dict[str, str] | None = None) -> dict[str, Any]:
    e = os.environ if env is None else env
    system = platform.system() or "Unknown"
    root_observation = observe_semantic_roots(dict(e), system=system)
    family = root_observation["family"]

    # Preserve accepted Linux/XDG compatibility fields only on Linux. Do not project
    # Linux-specific compatibility command names onto Windows/macOS/unknown hosts.
    xdg = xdg_roots(dict(e)) if family == "linux" else None
    legacy_commands: dict[str, Any] | None = None
    if family == "linux":
        legacy_commands = {}
        for name in ("git", "node", "python3", "zed", "ollama", "dpkg-deb"):
            path = shutil.which(name, path=e.get("PATH"))
            legacy_commands[name] = {"path": path, "version": _version(path)}

    return {
        "schema_version": "xiio-installer-host-observation-v2",
        "host": platform.node() or "local-host",
        "os": system,
        "architecture": platform.machine(),
        "platform": {
            "family": family,
            "adapter_state": root_observation["adapter_state"],
            "stable_identity_claimed": False,
            "host_name_is_observation": True,
        },
        "semantic_roots": root_observation["roots"],
        "root_unknowns": root_observation["unknowns"],
        "xdg": {key: str(path) for key, path in xdg.items()} if xdg is not None else None,
        "commands": legacy_commands,
        "executable_roles": discover_executable_roles(e, family=family),
        "mutation_authority": "NONE",
    }
