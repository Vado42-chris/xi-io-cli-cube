import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

from native.hex.adapter.child_bundle import BundleError
from native.hex.adapter.framework_product_api_reader import build_framework_product_api_reader
from native.hex.adapter.framework_release_export import (
    FrameworkReleaseExportError,
    resolve_framework_product_api_declaration_module,
)

MODULE = r"""
import fs from 'node:fs';
export function compileProductApiDeclaration(input){
 if(input?.schema!=='xiio.product-api-declaration/v1')throw Error('API_DECLARATION_REQUIRED');
 return Object.freeze({...input,state:'DECLARED',effect_authority:false,provider_effect:false,billing_effect_authority:false});
}
export function reopenVerifiedProductApiDeclaration(input){
 const receipt=JSON.parse(fs.readFileSync(input.binding_receipt_path,'utf8'));
 if(receipt.dependency_id!==input.expected_dependency_id||receipt.owner_repo!==input.expected_owner_repo||receipt.accepted_generation!==input.expected_generation)throw Error('PRODUCT_API_DECLARATION_BINDING_IDENTITY_MISMATCH');
 const declaration=compileProductApiDeclaration(JSON.parse(fs.readFileSync(receipt.fields.product_api_declaration,'utf8')));
 if(declaration.declaration_ref!==input.expected_declaration_ref||declaration.product_ref!==input.expected_product_ref||declaration.api_ref!==input.expected_api_ref)throw Error('PRODUCT_API_DECLARATION_IDENTITY_MISMATCH');
 return {declaration,currentness:{schema:'xiio.product-api-declaration-currentness/v1',state:'CURRENT',current:true,currentness_ref:'current:'+declaration.declaration_generation,declaration_ref:declaration.declaration_ref,declaration_generation:declaration.declaration_generation,product_ref:declaration.product_ref,api_ref:declaration.api_ref,binding_receipt_path:input.binding_receipt_path,dependency_id:receipt.dependency_id,owner_repo:receipt.owner_repo,accepted_generation:receipt.accepted_generation,export_name:'product_api_declaration',export_sha256:receipt.runtime_exports.product_api_declaration.sha256,verification_scope:'VERIFIED_DEPENDENCY_EXPORT_READBACK',custody_verified:true,admission_eligible:true,provider_authenticated:false,effect_authority:false,provider_effect:false}};
}
"""

DECLARATION = {
    "schema": "xiio.product-api-declaration/v1",
    "declaration_ref": "declaration:fixture",
    "declaration_generation": "sha256:" + "d" * 64,
    "product_ref": "product:fixture",
    "api_ref": "api:fixture",
    "openapi_ref": "openapi:fixture",
    "runtime_ref": "runtime:fixture",
    "operations": [{
        "capability_ref": "capability:health",
        "operation_ref": "operation:read",
        "billing_mode": "FREE",
        "eligible_roles": ["user"],
        "meter_unit_type": None,
    }],
}


class FrameworkProductApiReaderTests(unittest.TestCase):
    def fixture(self):
        td = tempfile.TemporaryDirectory()
        root = Path(td.name)
        module = root / "compile-product-api-declaration.mjs"
        module.write_text(MODULE)
        module.chmod(0o644)
        generation = "a" * 40
        receipt = root / "framework-runtime.binding.json"
        metadata = {
            "sha256": hashlib.sha256(module.read_bytes()).hexdigest(),
            "mode": "0644",
        }
        value = {
            "schema": "xiio.installer-dependency-binding-receipt/v1",
            "state": "BOUND",
            "dependency_id": "framework-runtime",
            "owner_repo": "Vado42-chris/xi-io.net",
            "accepted_generation": generation,
            "binding_receipt_path": str(receipt.resolve()),
            "runtime_exports": {"product_api_declaration_module": metadata},
            "fields": {"product_api_declaration_module": str(module.resolve())},
            "provider_effect": False,
            "effect_authority": False,
        }
        receipt.write_text(json.dumps(value))
        receipt.chmod(0o600)
        return td, root, receipt, module, generation, value

    def product_binding(self, root):
        declaration = root / "product-api.json"
        declaration.write_text(json.dumps(DECLARATION))
        declaration.chmod(0o644)
        receipt = root / "product.binding.json"
        export = {
            "sha256": hashlib.sha256(declaration.read_bytes()).hexdigest(),
            "mode": "0644",
        }
        value = {
            "schema": "xiio.installer-dependency-binding-receipt/v1",
            "state": "BOUND",
            "dependency_id": "fixture-runtime",
            "owner_repo": "Vado42-chris/fixture-runtime",
            "accepted_generation": "b" * 40,
            "binding_receipt_path": str(receipt.resolve()),
            "runtime_exports": {"product_api_declaration": export},
            "fields": {"product_api_declaration": str(declaration.resolve())},
            "provider_effect": False,
            "effect_authority": False,
        }
        receipt.write_text(json.dumps(value))
        receipt.chmod(0o600)
        return receipt

    def test_resolves_compiles_and_reopens_installed_framework_contract(self):
        td, root, receipt, module, generation, _ = self.fixture()
        self.addCleanup(td.cleanup)
        export = resolve_framework_product_api_declaration_module(
            receipt, expected_framework_generation=generation)
        self.assertEqual(export["product_api_declaration_module"], str(module.resolve()))
        self.assertTrue(export["custody_verified"])
        reader = build_framework_product_api_reader(
            framework_product_api_module=Path(export["product_api_declaration_module"]),
            expected_module_sha256=export["product_api_declaration_module_sha256"],
        )
        compiled = reader.compile_declaration(DECLARATION)
        self.assertEqual(compiled["declaration_generation"], DECLARATION["declaration_generation"])
        product_receipt = self.product_binding(root)
        reopened = reader.reopen_verified_declaration(
            binding_receipt_path=product_receipt,
            expected_dependency_id="fixture-runtime",
            expected_owner_repo="Vado42-chris/fixture-runtime",
            expected_generation="b" * 40,
            expected_declaration_ref="declaration:fixture",
            expected_product_ref="product:fixture",
            expected_api_ref="api:fixture",
        )
        self.assertTrue(reopened["currentness"]["custody_verified"])
        self.assertTrue(reopened["currentness"]["admission_eligible"])
        self.assertFalse(reopened["currentness"]["effect_authority"])

    def test_module_bytes_are_rechecked_before_every_framework_call(self):
        td, _, receipt, module, generation, _ = self.fixture()
        self.addCleanup(td.cleanup)
        export = resolve_framework_product_api_declaration_module(
            receipt, expected_framework_generation=generation)
        reader = build_framework_product_api_reader(
            framework_product_api_module=module,
            expected_module_sha256=export["product_api_declaration_module_sha256"],
        )
        module.write_text("export const substituted=true;\n")
        with self.assertRaisesRegex(BundleError, "MODULE_CHANGED"):
            reader.compile_declaration(DECLARATION)

    def test_missing_export_and_legacy_module_fail_closed(self):
        td, _, receipt, _, generation, value = self.fixture()
        self.addCleanup(td.cleanup)
        value["runtime_exports"] = {"other": next(iter(value["runtime_exports"].values()))}
        value["fields"] = {"other": next(iter(value["fields"].values()))}
        receipt.write_text(json.dumps(value))
        receipt.chmod(0o600)
        with self.assertRaisesRegex(FrameworkReleaseExportError, "PRODUCT_API_EXPORT_MISSING"):
            resolve_framework_product_api_declaration_module(
                receipt, expected_framework_generation=generation)

        with tempfile.TemporaryDirectory() as td2:
            module = Path(td2) / "legacy.mjs"
            module.write_text("export const legacy=true;\n")
            reader = build_framework_product_api_reader(
                framework_product_api_module=module.resolve(),
                expected_module_sha256=hashlib.sha256(module.read_bytes()).hexdigest(),
            )
            with self.assertRaisesRegex(BundleError, "READER_REFUSED"):
                reader.compile_declaration(DECLARATION)


if __name__ == "__main__":
    unittest.main()
