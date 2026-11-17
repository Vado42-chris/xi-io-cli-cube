import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const pkg=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
const sourceCommand=pkg.scripts?.['test:source-adoption'] ?? '';
const nativePackage=readFileSync(new URL('scripts/native-package.mjs',root),'utf8');
const installerAdapter=readFileSync(new URL('native/hex/adapter/installer_adapter.py',root),'utf8');
const serverProfile=readFileSync(new URL('native/hex/adapter/server_profile.py',root),'utf8');
const protocol=readFileSync(new URL('native/hex/carrier/src-tauri/src/protocol.rs',root),'utf8');
const installerWorkflow=readFileSync(new URL('.github/workflows/installer-contract.yml',root),'utf8');
const installerCurrentness=readFileSync(new URL('native/hex/adapter/kernel/test_installer_34_currentness.py',root),'utf8');
const frameworkFixture=JSON.parse(readFileSync(new URL('native/hex/fixtures/framework-runtime-cfe2776/SOURCE.json',root),'utf8'));

test('authority and installed-consumer regressions stay in the hosted denominator',()=>{
 for(const module of [
  'native.hex.adapter.test_permission_profile',
  'native.hex.adapter.test_service_profile',
  'native.hex.adapter.test_installer_service_consumer',
  'native.hex.adapter.test_installer_hotpatch_consumer',
  'native.hex.adapter.test_framework_product_api_reader',
  'native.hex.adapter.test_framework_physical_chain_fixture',
  'native.hex.adapter.test_server_product_api_binding',
  'native.hex.adapter.test_installer_product_api_consumer',
 ]) assert.ok(sourceCommand.includes(module),`UNEXECUTED_CONSUMER_REGRESSION:${module}`);
});

test('slice-discipline guard executes in the same denominator',()=>{
 assert.ok(sourceCommand.includes('tests/slice-discipline.test.mjs'),'SLICE_DISCIPLINE_NOT_EXECUTED');
});

test('accepted Installer currentness controls stay executable under unittest',()=>{
 assert.ok(installerWorkflow.includes('native.hex.adapter.kernel.test_installer_34_currentness'),
  'INSTALLER_CURRENTNESS_NOT_IN_HOSTED_DENOMINATOR');
 assert.match(installerCurrentness,/class AcceptedInstallerCurrentnessTests\(unittest\.TestCase\):/,
  'INSTALLER_CURRENTNESS_TESTCASE_MISSING');
 for(const token of [
  'test_latest_installer_custody_and_currentness_are_pinned()',
  'test_runtime_binding_consumes_persisted_verifier_and_activation_requires_component_generation()',
  'test_predecessor_pin_is_not_current',
  'test_changed_embedded_bytes_refuse',
 ]) assert.ok(installerCurrentness.includes(token),`INSTALLER_CURRENTNESS_CONTROL_MISSING:${token}`);
 assert.match(installerCurrentness,/if __name__==["']__main__["']:\s*\n\s*unittest\.main\(\)/,
  'INSTALLER_CURRENTNESS_DIRECT_ENTRY_MISSING');
});

test('temporary repair workflows cannot remain in the product tree',()=>{
 const workflows=readdirSync(new URL('.github/workflows/',root));
 const temporary=workflows.filter(name=>/(temporary|repair|export)/i.test(name));
 assert.deepEqual(temporary,[],`TEMPORARY_WORKFLOW_LEFT_BEHIND:${temporary.join(',')}`);
});

test('native package qualification isolates adapter test module state',()=>{
 assert.match(nativePackage,/function testAdapterInIsolation\(\)/,'ISOLATED_ADAPTER_DENOMINATOR_MISSING');
 assert.match(nativePackage,/for\(const name of tests\)/,'ADAPTER_TEST_FILES_NOT_EXECUTED_SEPARATELY');
 assert.doesNotMatch(nativePackage,/'test_\*\.py'/,'SHARED_DISCOVERY_INTERPRETER_REINTRODUCED');
});

test('isolated adapter tests receive the explicit embedded Installer kernel root',()=>{
 assert.match(nativePackage,/join\(adapter,'kernel'\)/,'EMBEDDED_KERNEL_ROOT_NOT_BOUND');
 assert.match(nativePackage,/PYTHONPATH:pythonPath/,'ISOLATED_KERNEL_BOOTSTRAP_NOT_APPLIED');
});

test('accepted transaction engines remain explicit immutable cores',()=>{
 assert.match(installerAdapter,/installer_adapter_core\.py/,'INSTALLER_CORE_NOT_PRESERVED');
 assert.match(serverProfile,/server_profile_core\.py/,'SERVER_CORE_NOT_PRESERVED');
 for(const path of [
  'native/hex/adapter/installer_adapter_core.py',
  'native/hex/adapter/server_profile_core.py',
 ]) assert.ok(readFileSync(new URL(path,root)).length>10000,`ACCEPTED_CORE_MISSING:${path}`);
});

test('installed services cannot advertise without Framework declaration readback',()=>{
 for(const token of [
  'framework_binding_receipt','framework_generation',
  'resolve_framework_product_api_declaration_module',
  'bind_product_api_context',
 ]) assert.ok(installerAdapter.includes(token),`INSTALLER_PRODUCT_API_JOIN_MISSING:${token}`);
 for(const token of [
  'SOURCE_DECLARATION_VERIFIED','INSTALLED_DECLARATION_READBACK_VERIFIED',
  'service_advertisement_eligible','compile_dependency_binding_receipt',
  'verify_dependency_binding_receipt',
 ]) assert.ok(serverProfile.includes(token),`SERVER_PRODUCT_API_JOIN_MISSING:${token}`);
});

test('native protocol carries exact service action and paired Framework custody coordinates',()=>{
 for(const token of ['service_action','framework_binding_receipt','framework_generation']){
  assert.ok(protocol.includes(token),`NATIVE_PROTOCOL_JOIN_MISSING:${token}`);
 }
 assert.match(protocol,/framework_binding\(framework_binding_receipt,framework_generation\)/,
  'FRAMEWORK_COORDINATES_NOT_PAIRED');
});

test('physical Framework consumer chain stays executable without private sibling checkout',()=>{
 assert.match(installerWorkflow,/^  framework-release-physical-chain:/m,
  'FRAMEWORK_PHYSICAL_CHAIN_JOB_MISSING');
 assert.doesNotMatch(installerWorkflow,/repository:\s*Vado42-chris\/xi-io\.net/,
  'PRIVATE_SIBLING_CHECKOUT_REINTRODUCED');
 for(const token of [
  'native/hex/fixtures/framework-runtime-cfe2776',
  'bind_dependency_manifest',
  'verify_dependency_binding_receipt',
  'resolve_framework_release_distribution_module',
  'FRAMEWORK_PHYSICAL_RELEASE_READER_PASS',
  'framework-physical-chain-${{ github.sha }}',
 ]) assert.ok(installerWorkflow.includes(token),`FRAMEWORK_PHYSICAL_JOIN_MISSING:${token}`);
 assert.equal(frameworkFixture.schema,'xiio.hex.framework-runtime-source-adoption/v1');
 assert.equal(frameworkFixture.state,'ACCEPTED_OWNER_BYTES_PACKAGED_FOR_PHYSICAL_CONSUMER_TEST');
 assert.equal(frameworkFixture.owner_repository,'Vado42-chris/xi-io.net');
 assert.equal(frameworkFixture.owner_ref,'cfe2776b08e1768882f95884fd52576e48f0550c');
 assert.equal(frameworkFixture.classification,'TEST_DISTRIBUTION_FIXTURE_NOT_RUNTIME_AUTHORITY');
 assert.equal(frameworkFixture.effect_authority,false);
 assert.equal(frameworkFixture.provider_effect,false);
 assert.equal(frameworkFixture.billing_effect_authority,false);
});
