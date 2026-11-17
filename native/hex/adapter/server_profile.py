"""Stable HEX server-package import surface.

The product/API binding layer is preserved in server_profile_binding.py and the
accepted transaction engine remains in server_profile_core.py. This loader
supplies only standard-library dependencies required by the binding layer and
refuses incomplete layer custody before execution.
"""
from pathlib import Path
import stat
import tempfile

_BINDING_PATH = Path(__file__).with_name("server_profile_binding.py")
if _BINDING_PATH.is_symlink() or not _BINDING_PATH.is_file():
    raise RuntimeError("SERVER_PROFILE_BINDING_UNTRUSTED")
_BINDING_SOURCE = _BINDING_PATH.read_text(encoding="utf-8")
_REQUIRED_BINDING_MARKERS = (
    "server_profile_core.py",
    "SOURCE_DECLARATION_VERIFIED",
    "INSTALLED_DECLARATION_READBACK_VERIFIED",
    "service_advertisement_eligible",
    "compile_dependency_binding_receipt",
    "verify_dependency_binding_receipt",
)
if any(marker not in _BINDING_SOURCE for marker in _REQUIRED_BINDING_MARKERS):
    raise RuntimeError("SERVER_PROFILE_BINDING_CONTRACT_INCOMPLETE")
exec(compile(_BINDING_PATH.read_bytes(), str(_BINDING_PATH), "exec"), globals(), globals())
