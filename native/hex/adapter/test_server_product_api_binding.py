import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ADAPTER = Path(__file__).resolve().parent
sys.path.insert(0, str(ADAPTER / "kernel"))
sys.path.insert(0, str(ADAPTER))

import permission_profile
import server_profile
from xiio_installer.dependency_receipt_verification import (
    verify_dependency_binding_receipt,
    DependencyReceiptVerificationError,
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


class FakeFrameworkProductApiReader:
    def __init__(self, *, substitute_on_reopen=False):
        self.substitute_on_reopen = substitute_on_reopen
        self.compile_calls = 0
        self.reopen_calls = 0

    def compile_declaration(self, declaration):
        self.compile_calls += 1
        return {
            **declaration,
            "state": "DECLARED",
            "effect_authority": False,
            "provider_effect": False,
            "billing_effect_authority": False,
        }

    def reopen_verified_declaration(self, **request):
        self.reopen_calls += 1
        receipt_path = Path(request["binding_receipt_path"])
        receipt = json.loads(receipt_path.read_text())
        declaration_path = Path(receipt["fields"]["product_api_declaration"])
        declaration = self.compile_declaration(json.loads(declaration_path.read_text()))
        if self.substitute_on_reopen:
            declaration = {**declaration, "product_ref": "product:substituted"}
        export = receipt["runtime_exports"]["product_api_declaration"]
        return {
            "declaration": declaration,
            "currentness": {
                "schema": "xiio.product-api-declaration-currentness/v1",
                "state": "CURRENT",
                "current": True,
                "currentness_ref": "current:" + declaration["declaration_generation"],
                "declaration_ref": declaration["declaration_ref"],
                "declaration_generation": declaration["declaration_generation"],
                "product_ref": declaration["product_ref"],
                "api_ref": declaration["api_ref"],
                "binding_receipt_path": str(receipt_path.resolve()),
                "dependency_id": receipt["dependency_id"],
                "owner_repo": receipt["owner_repo"],
                "accepted_generation": receipt["accepted_generation"],
                "export_name": "product_api_declaration",
                "export_sha256": export["sha256"],
                "verification_scope": "VERIFIED_DEPENDENCY_EXPORT_READBACK",
                "custody_verified": True,
                "admission_eligible": True,
                "provider_authenticated": False,
                "effect_authority": False,
                "provider_effect": False,
            },
        }


class ServerProductApiBindingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "package"
        self.root.mkdir()
        self.home = Path(self.tmp.name) / "home"
        self.home.mkdir(mode=0o700)
        self.receipts = self.home / "receipts"
        self.receipts.mkdir(mode=0o700)
        self.unit = b"[Unit]\nDescription=XIIO bound test\n[Service]\nExecStart=/usr/bin/true\n"
        self.config = b'{"ok":true}\n'
        self.declaration = {
            "schema": "xiio.product-api-declaration/v1",
            "declaration_ref": "declaration:fixture-server",
            "declaration_generation": "sha256:" + "d" * 64,
            "product_ref": "product:fixture-server",
            "api_ref": "api:fixture-server",
            "openapi_ref": "openapi:fixture-server",
            "runtime_ref": "runtime:fixture-server",
            "operations": [{
                "capability_ref": "capability:health",
                "operation_ref": "operation:read",
                "billing_mode": "FREE",
                "eligible_roles": ["user"],
                "meter_unit_type": None,
            }],
        }
        declaration_bytes = (json.dumps(self.declaration, sort_keys=True) + "\n").encode()
        (self.root / "unit.service").write_bytes(self.unit)
        (self.root / "config.json").write_bytes(self.config)
        (self.root / "product-api.json").write_bytes(declaration_bytes)
        manifest = {
            "schema_version": "xiio-installer-product-manifest-v1",
            "profile_id": "bound-server",
            "product_id": "xiio-bound-server",
            "display_name": "XIIO bound server",
            "version": "1",
            "channel": "stable",
            "fixture": False,
            "dependency_id": "fixture-server-runtime",
            "owner_repo": "Vado42-chris/fixture-server",
            "accepted_generation": "b" * 40,
            "runtime_exports": {
                "product_api_declaration": {
                    "destination_scope": "xdg_data",
                    "destination": "xiio/fixture/product-api.json",
                },
            },
            "product_api_binding": {
                "schema": server_profile.PRODUCT_API_BINDING_SCHEMA,
                "declaration_ref": self.declaration["declaration_ref"],
                "declaration_generation": self.declaration["declaration_generation"],
                "product_ref": self.declaration["product_ref"],
                "api_ref": self.declaration["api_ref"],
                "runtime_ref": self.declaration["runtime_ref"],
                "dependency_id": "fixture-server-runtime",
                "owner_repo": "Vado42-chris/fixture-server",
                "accepted_generation": "b" * 40,
                "export_name": "product_api_declaration",
            },
            "payload": [
                {
                    "source": "unit.service",
                    "sha256": digest(self.unit),
                    "size": len(self.unit),
                    "destination_scope": "xdg_config",
                    "destination": "systemd/user/xiio-bound.service",
                    "mode": "0644",
                    "overwrite": "backup_replace",
                },
                {
                    "source": "config.json",
                    "sha256": digest(self.config),
                    "size": len(self.config),
                    "destination_scope": "xdg_data",
                    "destination": "xiio/fixture/config.json",
                    "mode": "0600",
                    "overwrite": "backup_replace",
                },
                {
                    "source": "product-api.json",
                    "sha256": digest(declaration_bytes),
                    "size": len(declaration_bytes),
                    "destination_scope": "xdg_data",
                    "destination": "xiio/fixture/product-api.json",
                    "mode": "0644",
                    "overwrite": "backup_replace",
                },
            ],
        }
        (self.root / "manifest.json").write_text(json.dumps(manifest))
        package = {
            "schema": server_profile.SCHEMA,
            "package_id": "bound-server",
            "version": "1",
            "channel": "stable",
            "source_ref": "fixture-server:" + "b" * 40,
            "payload_manifest": "manifest.json",
            "services": [{
                "service_id": "api-glass-private",
                "unit": "xiio-bound.service",
                "probe": "http://127.0.0.1:8870/health",
                "required": True,
            }],
        }
        (self.root / "server-package.json").write_text(json.dumps(package))
        self.permissions = permission_profile.compile_profile({
            "profile_id": "managed",
            "capabilities": [
                "install_files", "configure_services", "start_services", "stop_services",
            ],
            "service_scopes": ["api-glass-private"],
            "update_policy": "review_each",
            "central_updates": False,
            "remote_access": False,
            "revoked": False,
        })
        self.framework_export = {
            "schema": "xiio.hex.framework-product-api-export/v1",
            "state": "VERIFIED",
            "dependency_id": "framework-runtime",
            "owner_repo": "Vado42-chris/xi-io.net",
            "accepted_generation": "a" * 40,
            "product_api_declaration_module": str((self.home / "framework.mjs").resolve()),
            "product_api_declaration_module_sha256": "c" * 64,
            "product_api_declaration_module_mode": "0644",
            "binding_receipt_path": str((self.home / "framework.binding.json").resolve()),
            "custody_verified": True,
            "effect_authority": False,
            "provider_effect": False,
        }
        self.active = False
        self.events = []

    def systemctl(self, args):
        if args[:3] == ["systemctl", "--user", "show"]:
            state = "active" if self.active else "inactive"
            return SimpleNamespace(
                returncode=0,
                stdout="LoadState=loaded\nActiveState=" + state + "\nSubState=" +
                       ("running" if self.active else "dead") + "\n",
                stderr="",
            )
        if args[:3] == ["systemctl", "--user", "start"]:
            self.events.append("start")
            self.active = True
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        if args[:3] == ["systemctl", "--user", "stop"]:
            self.events.append("stop")
            self.active = False
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        if args == ["systemctl", "--user", "daemon-reload"]:
            self.events.append("daemon-reload")
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="unexpected")

    def context(self, reader):
        return server_profile.bind_product_api_context(reader, self.framework_export)

    def test_nonfixture_prepare_refuses_without_installed_framework_context(self):
        with self.assertRaisesRegex(ValueError, "FRAMEWORK_CONTEXT_REQUIRED"):
            server_profile.prepare_server_package(self.root, self.home, self.permissions)
        self.assertFalse((self.home / ".config/systemd/user/xiio-bound.service").exists())

    def test_install_binds_service_readback_to_exact_framework_declaration(self):
        reader = FakeFrameworkProductApiReader()
        receipt = self.receipts / "install.json"
        with self.context(reader), \
             patch.object(server_profile.service_profile, "_run", side_effect=self.systemctl), \
             patch.object(server_profile, "_probe", return_value={"state": "PASS", "status": 200}):
            plan = server_profile.prepare_server_package(self.root, self.home, self.permissions)
            self.assertEqual(plan["product_api_binding"]["state"],
                             "SOURCE_DECLARATION_VERIFIED")
            self.assertFalse(plan["service_advertisement_eligible"])
            effect = server_profile.apply_server_package(
                self.root, self.home, self.permissions, plan, receipt, True)
        self.assertTrue(effect["service_advertisement_eligible"])
        binding = effect["product_api_binding"]
        self.assertEqual(binding["state"], "INSTALLED_DECLARATION_READBACK_VERIFIED")
        self.assertEqual(binding["declaration_generation"],
                         self.declaration["declaration_generation"])
        self.assertTrue(binding["custody_verified"])
        self.assertTrue(binding["admission_eligible"])
        self.assertFalse(binding["effect_authority"])
        binding_path = Path(binding["binding_receipt_path"])
        self.assertEqual(os.stat(binding_path).st_mode & 0o777, 0o600)
        verified = verify_dependency_binding_receipt(
            binding_path,
            expected_dependency_id="fixture-server-runtime",
            expected_owner_repo="Vado42-chris/fixture-server",
            expected_generation="b" * 40,
        )
        self.assertTrue(verified["custody_verified"])
        self.assertTrue(self.active)
        self.assertGreaterEqual(reader.compile_calls, 3)
        self.assertEqual(reader.reopen_calls, 1)

        with patch.object(server_profile.service_profile, "_run", side_effect=self.systemctl):
            rolled = server_profile.rollback_server_package(
                self.home, self.permissions, plan, receipt, True)
        self.assertFalse(rolled["service_advertisement_eligible"])
        self.assertEqual(rolled["product_api_binding"]["state"],
                         "ROLLED_BACK_READBACK_VERIFIED")
        with self.assertRaises(DependencyReceiptVerificationError):
            verify_dependency_binding_receipt(
                binding_path,
                expected_dependency_id="fixture-server-runtime",
                expected_owner_repo="Vado42-chris/fixture-server",
                expected_generation="b" * 40,
            )
        self.assertFalse(self.active)
        self.assertFalse((self.home / ".local/share/xiio/fixture/product-api.json").exists())

    def test_substituted_installed_declaration_rolls_back_before_success(self):
        reader = FakeFrameworkProductApiReader(substitute_on_reopen=True)
        receipt = self.receipts / "substitution.json"
        with self.context(reader), \
             patch.object(server_profile.service_profile, "_run", side_effect=self.systemctl), \
             patch.object(server_profile, "_probe", return_value={"state": "PASS", "status": 200}):
            plan = server_profile.prepare_server_package(self.root, self.home, self.permissions)
            with self.assertRaisesRegex(ValueError, "BINDING_FAILED_ROLLED_BACK"):
                server_profile.apply_server_package(
                    self.root, self.home, self.permissions, plan, receipt, True)
        self.assertFalse(self.active)
        self.assertFalse((self.home / ".config/systemd/user/xiio-bound.service").exists())
        binding_path = Path(str(receipt) + ".product-api-binding.json")
        self.assertEqual(json.loads(binding_path.read_text())["schema"],
                         server_profile.PRODUCT_API_TOMBSTONE_SCHEMA)


if __name__ == "__main__":
    unittest.main()
