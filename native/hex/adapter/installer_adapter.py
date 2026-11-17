#!/usr/bin/env python3
"""Stable loader for the accepted finite HEX installer adapter.

The accepted implementation is retained byte-for-byte in
installer_adapter_core.py. This module remains the executable and import surface
so bounded cross-cut consumers can add admission joins without forking the
installer transaction engine.
"""
from pathlib import Path

_CORE_PATH = Path(__file__).with_name("installer_adapter_core.py")
if _CORE_PATH.is_symlink() or not _CORE_PATH.is_file():
    raise RuntimeError("INSTALLER_ADAPTER_CORE_UNTRUSTED")
_ORIGINAL_NAME = __name__
globals()["__name__"] = "xiio_hex_installer_adapter_core"
exec(compile(_CORE_PATH.read_bytes(), str(_CORE_PATH), "exec"), globals(), globals())
globals()["__name__"] = _ORIGINAL_NAME
if _ORIGINAL_NAME == "__main__":
    main()
