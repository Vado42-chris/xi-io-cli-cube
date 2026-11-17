"""Execute the installed Framework-owned product API declaration contract.

HEX supplies only source declaration bytes or exact dependency-binding
coordinates. Framework remains the declaration compiler and currentness owner.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

from .child_bundle import BundleError

SHA256 = re.compile(r"^[0-9a-f]{64}$")


def _require(ok: bool, code: str) -> None:
    if not ok:
        raise BundleError(code)


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


class FrameworkProductApiReader:
    def __init__(self, module: Path, expected_sha256: str, node_binary: str = "node"):
        self.module = Path(module)
        self.expected_sha256 = str(expected_sha256 or "")
        self.node_binary = str(node_binary or "")
        _require(self.module.is_absolute(), "BUNDLE_FRAMEWORK_PRODUCT_API_MODULE_PATH_REQUIRED")
        _require(bool(SHA256.fullmatch(self.expected_sha256)),
                 "BUNDLE_FRAMEWORK_PRODUCT_API_MODULE_SHA256_REQUIRED")
        _require(bool(self.node_binary.strip()), "BUNDLE_NODE_RUNTIME_UNBOUND")
        self.bridge = Path(__file__).with_name("framework_product_api_bridge.mjs")
        _require(not self.bridge.is_symlink() and self.bridge.is_file(),
                 "BUNDLE_FRAMEWORK_PRODUCT_API_BRIDGE_UNTRUSTED")
        self._verify_module()

    def _verify_module(self) -> None:
        try:
            st = os.lstat(self.module)
        except OSError as exc:
            raise BundleError("BUNDLE_FRAMEWORK_PRODUCT_API_MODULE_UNTRUSTED") from exc
        _require(self.module.is_file() and not self.module.is_symlink() and st.st_nlink == 1,
                 "BUNDLE_FRAMEWORK_PRODUCT_API_MODULE_UNTRUSTED")
        _require(_digest(self.module) == self.expected_sha256,
                 "BUNDLE_FRAMEWORK_PRODUCT_API_MODULE_CHANGED")

    def _invoke(self, payload: dict) -> dict:
        self._verify_module()
        try:
            completed = subprocess.run(
                [self.node_binary, str(self.bridge), str(self.module)],
                input=json.dumps(payload, separators=(",", ":")),
                text=True,
                capture_output=True,
                check=False,
                env={key: value for key, value in os.environ.items()
                     if key in {"PATH", "HOME", "XDG_STATE_HOME", "XDG_DATA_HOME"}},
                timeout=15,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise BundleError("BUNDLE_FRAMEWORK_PRODUCT_API_READER_UNAVAILABLE") from exc
        _require(completed.returncode == 0,
                 "BUNDLE_FRAMEWORK_PRODUCT_API_READER_REFUSED")
        try:
            result = json.loads(completed.stdout)
        except (TypeError, ValueError) as exc:
            raise BundleError("BUNDLE_FRAMEWORK_PRODUCT_API_READER_INVALID_RESULT") from exc
        _require(isinstance(result, dict),
                 "BUNDLE_FRAMEWORK_PRODUCT_API_READER_INVALID_RESULT")
        return result

    def compile_declaration(self, declaration: dict) -> dict:
        _require(isinstance(declaration, dict),
                 "BUNDLE_PRODUCT_API_DECLARATION_OBJECT_REQUIRED")
        return self._invoke({"action": "compile", "declaration": declaration})

    def reopen_verified_declaration(
        self,
        *,
        binding_receipt_path: Path,
        expected_dependency_id: str,
        expected_owner_repo: str,
        expected_generation: str,
        expected_declaration_ref: str,
        expected_product_ref: str,
        expected_api_ref: str,
    ) -> dict:
        return self._invoke({
            "action": "reopen",
            "binding_receipt_path": str(Path(binding_receipt_path)),
            "expected_dependency_id": expected_dependency_id,
            "expected_owner_repo": expected_owner_repo,
            "expected_generation": expected_generation,
            "expected_declaration_ref": expected_declaration_ref,
            "expected_product_ref": expected_product_ref,
            "expected_api_ref": expected_api_ref,
        })


def build_framework_product_api_reader(
    *,
    framework_product_api_module: Path,
    expected_module_sha256: str,
    node_binary: str = "node",
) -> FrameworkProductApiReader:
    return FrameworkProductApiReader(
        framework_product_api_module,
        expected_module_sha256,
        node_binary,
    )
