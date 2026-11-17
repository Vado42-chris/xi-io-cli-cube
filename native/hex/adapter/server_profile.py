"""Compatibility loader for the accepted HEX server-package implementation.

The accepted implementation is retained byte-for-byte in server_profile_core.py.
This module remains the stable import surface so bounded cross-cut consumers can
wrap it without editing or forking the transaction engine.
"""
from pathlib import Path

_CORE_PATH = Path(__file__).with_name("server_profile_core.py")
if _CORE_PATH.is_symlink() or not _CORE_PATH.is_file():
    raise RuntimeError("SERVER_PROFILE_CORE_UNTRUSTED")
exec(compile(_CORE_PATH.read_bytes(), str(_CORE_PATH), "exec"), globals(), globals())
