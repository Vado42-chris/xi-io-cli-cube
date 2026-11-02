import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_REUSABLE_BINDINGS,
  assertReusableRuntimeDefaultsNeutral,
  qualifyReusablePayloadBindings,
} from '../native/hex/cli-source/src/sdk/reusable-payload-binding-qualification.mjs';

const ACTIVE_DEPLOYMENT_PINS = [
  "86b8df9cdf9021479e0d10e9cc914a2705ba0ce5"
];
const sourceRefs = Object.fromEntries(REQUIRED_REUSABLE_BINDINGS.map((field) => [field, `contract:${field}:current`]));

function config(tag) {
  return {
    currentUser:{user_ref:`user:${tag}`,tenant_ref:`tenant:${tag}`,host_ref:`host-${tag}`},
    product:{product_ref:`product:${tag}`},
    taskContext:{identity:{workspace_id:`workspace:${tag}`},runtime:{model_profile_ref:`model:${tag}`}},
    runtimeConfig:{hosts:[`host-${tag}`]},
    localWorkPacket:{workspace_root:`/runtime/${tag}`,allowed_scope:{paths:[`apps/${tag}`,`data/${tag}`]}},
    workerProjection:{qualified_capability_refs:[`cap:${tag}:read`],return_target_ref:`return:${tag}`},
    assignment:{permission_refs:[`permission:${tag}:local`]},
    sourceRefs,
  };
}

test('two independent configurations resolve all eight bindings without reusable literals', () => {
  const a=qualifyReusablePayloadBindings(config('alpha'));
  const b=qualifyReusablePayloadBindings(config('beta'));
  assert.equal(a.state,'QUALIFIED');
  assert.equal(b.state,'QUALIFIED');
  for(const field of REQUIRED_REUSABLE_BINDINGS){
    assert.ok(a.bindings[field]);
    assert.ok(b.bindings[field]);
    assert.notDeepEqual(a.bindings[field].value,b.bindings[field].value,field);
  }
  assert.equal(a.authority_inherited,false);
});

test('each required binding fails closed with a typed missing-binding error', () => {
  const mutations={
    product:x=>{delete x.product.product_ref;},
    tenant:x=>{delete x.currentUser.tenant_ref;},
    workspace:x=>{delete x.taskContext.identity.workspace_id;},
    host:x=>{delete x.currentUser.host_ref;},
    model:x=>{delete x.taskContext.runtime.model_profile_ref;},
    paths:x=>{x.localWorkPacket.allowed_scope.paths=[];},
    permissions:x=>{x.workerProjection.qualified_capability_refs=[];x.assignment.permission_refs=[];},
    return_target:x=>{delete x.workerProjection.return_target_ref;delete x.assignment.return_ref;},
  };
  for(const field of REQUIRED_REUSABLE_BINDINGS){
    const x=structuredClone(config('missing'));
    mutations[field](x);
    assert.throws(()=>qualifyReusablePayloadBindings(x),(e)=>e?.code===`REUSABLE_PAYLOAD_BINDING_MISSING:${field}`,field);
  }
});

test('current user and runtime host membership are mandatory', () => {
  const userMissing=config('user-missing');
  delete userMissing.currentUser.user_ref;
  assert.throws(()=>qualifyReusablePayloadBindings(userMissing),(e)=>e?.code==='CURRENT_USER_REF_MISSING');
  const hostile=config('hostile');
  hostile.runtimeConfig.hosts=['different-host'];
  assert.throws(()=>qualifyReusablePayloadBindings(hostile),(e)=>e?.code==='HOST_NOT_QUALIFIED_BY_RUNTIME_CONFIG');
});

test('reusable defaults reject binding literals and every active deployment pin', () => {
  assert.equal(assertReusableRuntimeDefaultsNeutral({appearance:'system'},{deploymentPins:ACTIVE_DEPLOYMENT_PINS}).state,'PASS');
  assert.throws(()=>assertReusableRuntimeDefaultsNeutral({workspace_id:'workspace:morning'}),(e)=>e?.code==='REUSABLE_RUNTIME_DEFAULT_LITERAL_FORBIDDEN:workspace_id');
  for (const pin of ACTIVE_DEPLOYMENT_PINS) {
    assert.throws(
      ()=>assertReusableRuntimeDefaultsNeutral({note:pin},{deploymentPins:ACTIVE_DEPLOYMENT_PINS}),
      (e)=>e?.code==='DEPLOYMENT_PIN_IN_REUSABLE_DEFAULTS',
      pin,
    );
  }
});
