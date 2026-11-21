import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panel = readFileSync(new URL('../src/components/NativeInstallerPanel.tsx',import.meta.url),'utf8');
const adapter = readFileSync(new URL('../native/hex/adapter/installer_adapter.py',import.meta.url),'utf8');
const receiver = readFileSync(new URL('../native/hex/adapter/native_product_receiver.py',import.meta.url),'utf8');

test('native product inspect consumes exactly the existing finite adapter action and owner fields', () => {
  assert.match(panel, /action:'product_inspect', \.\.\.productInputs/);
  for (const field of ['release_lock','framework_binding_receipt','framework_generation','node']) {
    assert.ok(panel.includes(field + ':'),field);
    assert.ok(adapter.includes('"' + field + '"'),field);
  }
  assert.match(adapter,/native_product_receiver\.inspect_product_release/);
});

test('native product apply remains a separately approved exact review-digest operation', () => {
  assert.match(panel,/review_digest: productReview\.review_digest, approved:true/);
  assert.match(panel,/productApproved/);
  assert.match(panel,/action:'product_apply'/);
  assert.match(receiver,/PRODUCT_RELEASE_CHANGED_SINCE_REVIEW/);
  assert.match(receiver,/PRODUCT_EXACT_APPROVAL_REQUIRED/);
});

test('native UI refuses ambiguous product effect retry while preserving suite UI', () => {
  assert.match(panel,/setProductUnknown\(true\)/);
  assert.match(panel,/Product installation outcome uncertain\. Do not retry/);
  assert.match(panel,/productUnknown \|\| !productApproved/);
  assert.match(panel,/action: 'prepare'/);
  assert.match(panel,/action: 'rollback'/);
});

test('product-only review represents actual selected source identity, not a fixed product roster', () => {
  for (const field of ['display_name','product_ref','release_ref','release_generation','products']) {
    assert.ok(panel.includes('productReview.' + field),field);
  }
  assert.match(panel,/PRODUCT_REVIEW_REQUIRED/);
  assert.match(panel,/PRODUCT_BYTES_INSTALLED_READBACK_VERIFIED/);
  assert.doesNotMatch(panel,/productReview\.product_ref\s*===\s*['"]/);
});
