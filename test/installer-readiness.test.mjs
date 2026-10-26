import test from 'node:test';
import assert from 'node:assert/strict';
import {installerReadiness, reviewedRuntimeReady} from '../src/lib/installerReadiness.mjs';
const plan = {node:{version:'v22.13.0',path:'/node',sha256:'digest'},connection:{required:true,source:{ref:'abc123'},manifest_sha256:'digest',payload_files:6},preflight:{system_metadata:{os:'Linux',architecture:'x86_64'},existing_cli:{state:'RECEIPT_METADATA_OBSERVED',generation:'prior',prefix:'/install'},connection_prerequisites:{required_bindings:[{name:'XIIO_DEVICE_PORTS_MODULE',state:'NOT_OBSERVED_IN_INSTALLER_PROCESS'}]}}};
test('reviewed runtime and mandatory connection payload are both required',()=>{
 assert.equal(reviewedRuntimeReady(plan),true);
 for (const p of [null,{}, {...plan,node:{...plan.node,version:'v22.12.0'}},{...plan,node:{...plan.node,sha256:''}},{...plan,connection:null},{...plan,connection:{...plan.connection,required:false}}]) assert.equal(reviewedRuntimeReady(p),false);
});
test('visible observations distinguish receipt, local runtime, payload and unverified connection',()=>{
 const rows=installerReadiness(null,plan);
 assert.ok(rows.some(r=>r.text.includes('receipt only')));
 assert.ok(rows.some(r=>r.text.includes('6 files included')));
 assert.ok(rows.some(r=>r.text.includes('production implementations')));
 assert.ok(rows.some(r=>r.label==='XIIO_DEVICE_PORTS_MODULE' && r.text.includes('not ruled out')));
 assert.ok(rows.some(r=>r.text.includes('No service absence')));
});
test('scan alone cannot enable Apply and missing observations are not readiness',()=>{
 const rows=installerReadiness({connection_payload:{available:true},node_candidates:[{path:'/node'}]},null);
 assert.ok(rows.some(r=>r.text.includes('mandatory with CLI')));
 assert.ok(rows.some(r=>r.text.includes('prepare to verify')));
 assert.equal(reviewedRuntimeReady({phase:'PREPARED_NOT_INSTALLED'}),false);
});
