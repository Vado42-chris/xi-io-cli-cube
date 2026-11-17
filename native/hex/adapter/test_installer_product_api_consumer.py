import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from native.hex.adapter import installer_adapter


class Context:
    def __init__(self):
        self.entered = False
        self.exited = False

    def __enter__(self):
        self.entered = True
        return self

    def __exit__(self, *_):
        self.exited = True


class InstalledProductApiConsumerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.receipt = Path(self.tmp.name) / "framework.binding.json"
        self.receipt.write_text("{}")
        self.generation = "a" * 40
        self.export = {
            "schema": "xiio.hex.framework-product-api-export/v1",
            "state": "VERIFIED",
            "dependency_id": "framework-runtime",
            "owner_repo": "Vado42-chris/xi-io.net",
            "accepted_generation": self.generation,
            "product_api_declaration_module": str(
                (Path(self.tmp.name) / "compile-product-api-declaration.mjs").resolve()),
            "product_api_declaration_module_sha256": "b" * 64,
            "product_api_declaration_module_mode": "0644",
            "binding_receipt_path": str(self.receipt.resolve()),
            "custody_verified": True,
            "effect_authority": False,
            "provider_effect": False,
        }

    def request(self):
        return {
            "action": "server_prepare",
            "plan_id": "c" * 32,
            "package_root": str((Path(self.tmp.name) / "package").resolve()),
            "framework_binding_receipt": str(self.receipt.resolve()),
            "framework_generation": self.generation,
        }

    def test_server_request_consumes_verified_framework_export_then_strips_transport_fields(self):
        context = Context()
        core_result = {"state": "SOURCE_DECLARATION_VERIFIED"}
        with patch.object(installer_adapter.framework_release_export,
                          "resolve_framework_product_api_declaration_module",
                          return_value=self.export) as resolve, \
             patch.object(installer_adapter.framework_product_api_reader,
                          "build_framework_product_api_reader",
                          return_value=object()) as build, \
             patch.object(installer_adapter.server_profile,
                          "bind_product_api_context",
                          return_value=context) as bind, \
             patch.object(installer_adapter, "_CORE_HANDLE",
                          return_value=core_result) as core:
            result = installer_adapter.handle(self.request())
        self.assertEqual(result, core_result)
        resolve.assert_called_once_with(
            self.receipt.resolve(),
            expected_framework_generation=self.generation,
        )
        build.assert_called_once_with(
            framework_product_api_module=Path(
                self.export["product_api_declaration_module"]),
            expected_module_sha256="b" * 64,
        )
        bind.assert_called_once()
        delegated = core.call_args.args[0]
        self.assertNotIn("framework_binding_receipt", delegated)
        self.assertNotIn("framework_generation", delegated)
        self.assertEqual(delegated["action"], "server_prepare")
        self.assertTrue(context.entered)
        self.assertTrue(context.exited)

    def test_incomplete_or_invalid_framework_coordinates_refuse_before_core(self):
        request = self.request()
        request.pop("framework_generation")
        with patch.object(installer_adapter, "_CORE_HANDLE") as core:
            with self.assertRaisesRegex(
                    installer_adapter.Refused,
                    "FRAMEWORK_PRODUCT_API_BINDING_FIELDS_INCOMPLETE"):
                installer_adapter.handle(request)
            core.assert_not_called()

        request = self.request()
        request["framework_generation"] = "not-a-generation"
        with patch.object(installer_adapter, "_CORE_HANDLE") as core:
            with self.assertRaisesRegex(
                    installer_adapter.Refused,
                    "FRAMEWORK_PRODUCT_API_GENERATION_INVALID"):
                installer_adapter.handle(request)
            core.assert_not_called()

    def test_fixture_compatibility_does_not_manufacture_framework_context(self):
        request = self.request()
        request.pop("framework_binding_receipt")
        request.pop("framework_generation")
        with patch.object(installer_adapter, "_CORE_HANDLE",
                          return_value={"fixture": True}) as core, \
             patch.object(installer_adapter.framework_release_export,
                          "resolve_framework_product_api_declaration_module") as resolve:
            result = installer_adapter.handle(request)
        self.assertEqual(result, {"fixture": True})
        core.assert_called_once_with(request)
        resolve.assert_not_called()


if __name__ == "__main__":
    unittest.main()
