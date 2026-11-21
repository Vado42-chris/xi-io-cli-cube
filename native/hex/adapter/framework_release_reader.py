"""Bind HEX to the installed Framework release-distribution compiler.

HEX owns orchestration only. Framework owns release/adopter currentness and the
release-distribution projection. This adapter reopens the exact installed
Framework runtime export and executes it with host-owned readers.
"""
from __future__ import annotations

from pathlib import Path
import json
import os
import subprocess

if __package__:
    from .child_bundle import BundleError
else:
    from child_bundle import BundleError


def _require(ok: bool, code: str) -> None:
    if not ok:
        raise BundleError(code)


def _installed_module(path: Path) -> Path:
    path = Path(path)
    _require(path.is_absolute(), "BUNDLE_FRAMEWORK_RELEASE_MODULE_PATH_REQUIRED")
    _require(not path.is_symlink() and path.is_file(),
             "BUNDLE_FRAMEWORK_RELEASE_MODULE_UNTRUSTED")
    return path


def build_framework_release_distribution_reader(*, framework_release_distribution_module: Path, node_binary: str = "node"):
    """Invoke the installed Framework-owned composed distribution reader.

    HEX supplies only product/consumer coordinates. Framework owns all release,
    adopter and entrypoint authority readback.
    """
    module=_installed_module(framework_release_distribution_module)
    _require(isinstance(node_binary,str) and bool(node_binary.strip()),"BUNDLE_NODE_RUNTIME_UNBOUND")
    bridge=Path(__file__).with_name("framework_release_compiler_bridge.mjs")
    _require(not bridge.is_symlink() and bridge.is_file(),"BUNDLE_FRAMEWORK_RELEASE_BRIDGE_UNTRUSTED")
    def read_release_distribution(*,product_ref:str,consumer_ref:str):
        request={"product_ref":product_ref,"consumer_ref":consumer_ref}
        try:
            completed=subprocess.run([node_binary,str(bridge),str(module)],input=json.dumps(request,separators=(",",":")),text=True,capture_output=True,check=False,env={k:v for k,v in os.environ.items() if k in {"PATH","HOME","XDG_STATE_HOME"}},timeout=15)
        except (OSError,subprocess.TimeoutExpired) as exc: raise BundleError("BUNDLE_FRAMEWORK_RELEASE_READER_UNAVAILABLE") from exc
        _require(completed.returncode==0,"BUNDLE_FRAMEWORK_RELEASE_READER_REFUSED")
        try: result=json.loads(completed.stdout)
        except (TypeError,ValueError) as exc: raise BundleError("BUNDLE_FRAMEWORK_RELEASE_READER_INVALID_RESULT") from exc
        _require(isinstance(result,dict),"BUNDLE_FRAMEWORK_RELEASE_READER_INVALID_RESULT")
        return result
    return read_release_distribution
