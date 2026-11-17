import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const pkg=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
const sourceCommand=pkg.scripts?.['test:source-adoption'] ?? '';
const nativePackage=readFileSync(new URL('scripts/native-package.mjs',root),'utf8');

test('authority and installed-consumer regressions stay in the hosted denominator',()=>{
 for(const module of [
  'native.hex.adapter.test_permission_profile',
  'native.hex.adapter.test_service_profile',
  'native.hex.adapter.test_installer_service_consumer',
  'native.hex.adapter.test_installer_hotpatch_consumer',
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
