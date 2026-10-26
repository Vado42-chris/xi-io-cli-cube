import test from 'node:test';
import assert from 'node:assert/strict';
import {observeLocalModels} from './local_ai_status.mjs';
test('fixed local readonly endpoint, no redirect, models are not inference proof',async()=>{
 const r=await observeLocalModels({fetchImpl:async(url,opts)=>{
  assert.equal(url,'http://127.0.0.1:11434/api/tags');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  return new Response(JSON.stringify({models:[{name:'existing-model',size:123}]}));
 }});
 assert.equal(r.state,'MODELS_OBSERVED');assert.equal(r.inference_tested,false);assert.equal(r.mutations,0);
});
test('empty installed set differs from unavailable and malformed',async()=>{
 assert.equal((await observeLocalModels({fetchImpl:async()=>new Response('{"models":[]}')})).state,'NO_MODELS');
 assert.equal((await observeLocalModels({fetchImpl:async()=>{throw Error('offline')}})).state,'UNAVAILABLE');
 assert.equal((await observeLocalModels({fetchImpl:async()=>new Response('{}')})).state,'UNAVAILABLE');
});
test('oversized response fails closed',async()=>{
 const r=await observeLocalModels({fetchImpl:async()=>new Response('x'.repeat(1048577))});
 assert.equal(r.state,'UNAVAILABLE');assert.equal(r.reason,'LOCAL_MODEL_RESPONSE_TOO_LARGE');
});
