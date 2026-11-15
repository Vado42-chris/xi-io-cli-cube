import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptProductSession,readProductSession} from '../src/lib/productSession.mjs';

const base=()=>({
  schema:'xiio.product-session-readback/v1',state:'AUTHENTICATED',
  authenticated:true,ward_authorized:true,capability_current:true,
  principal_ref:'principal:fixture',workspace_ref:'workspace:fixture',
  session_ref:'session:fixture',grant_ref:'grant:fixture',product_id:'hex',
  artifact_sha256:'a'.repeat(64),capabilities:['product:read'],
  verified_at_ms:Date.now(),expires_at_ms:Date.now()+60000
});
test('verified server-returned identity and capability tuple is retained',()=>{
  const value=acceptProductSession(base());
  assert.equal(value.product_id,'hex');
  assert.deepEqual(value.capabilities,['product:read']);
  assert.ok(Object.isFrozen(value));
});
for (const [label,change] of [
  ['missing product session',v=>{v.state='UNVERIFIED'}],
  ['Cloudflare-only access',v=>{v.ward_authorized=false}],
  ['stale grant',v=>{v.capability_current=false}],
  ['wrong product',v=>{v.product_id='inbox'}],
  ['no principal',v=>{v.principal_ref=''}],
  ['missing capability',v=>{v.capabilities=[]}],
  ['old session observation',v=>{v.verified_at_ms=Date.now()-60000}],
  ['expired session',v=>{v.expires_at_ms=Date.now()-1}],
  ['wrong artifact',v=>{v.artifact_sha256='b'.repeat(64)}],
]) test('refuse '+label,()=>{
  const value=base();change(value);
  assert.throws(()=>acceptProductSession(value,{productId:'hex',artifactSha256:'a'.repeat(64)}),/XIIO_PRODUCT_SESSION_/);
});
test('cannot obtain authority from unbound receiver',async()=>{
  await assert.rejects(readProductSession(),/RECEIVER_UNBOUND/);
});
test('rejects cross-origin session endpoint without fetching',async()=>{
  let calls=0;
  const prior=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'https://tenant.example.test/',origin:'https://tenant.example.test'}});
  try {
    await assert.rejects(readProductSession({endpoint:'https://other.example.test/session',fetcher:async()=>{calls++}}),/ENDPOINT_UNTRUSTED/);
    assert.equal(calls,0);
  } finally { if(prior)Object.defineProperty(globalThis,'location',prior);else delete globalThis.location; }
});
