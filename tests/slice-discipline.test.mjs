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

test('authority and installed-consumer regressions stay in the hosted denominator',()=>{
 for(const module of [
  'native.hex.adapter.test_permission_profile',
  'native.hex.adapter.test_service_profile',
  'native.hex.adapter.test_installer_service_consumer',
  'native.hex.adapter.test_installer_hotpatch_consumer',
  'native.hex.adapter.test_framework_product_api_reader',
  'native.hex.adapter.test_server_product_api_binding',
  'native.hex.adapter.test_installer_product_api_consumer',
 ]) assert.ok(sourceCommand.includes(module),`UNEXECUTED_CONSUMER_REGRESSION:${module}`);
});

test('slice-discipline guard executes in the same denominator',()=>{
 assert.ok(sourceCommand.includes('tests/slice-discipline.test.mjs'),'SLICE_DISCIPLINE_NOT_EXECUTED');
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
