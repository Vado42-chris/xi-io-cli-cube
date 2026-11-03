#!/usr/bin/env node
import assert from 'node:assert/strict';
import {compileLocalWorkPacket,compileAuthoritativeWorkPacket} from './src/sdk/local-work-packet.mjs';

const local=compileLocalWorkPacket({
 packet_id:'packet:fixture:1',
 pinned_source:'a'.repeat(40),
 workspace_root:process.cwd(),
 objective:'prove canonical packet identity',
 dependencies:[],
 allowed_scope:{paths:['src/example.mjs'],tools:['read']},
 acceptance_command:['node','--version'],
 expected_result:{exit_code:0},
 checkpoint_return_destination:'.xiio/returns/fixture.json',
 next_step_policy:'STOP_ON_PASS',
 accepted:true,
});
const identity={
 work_uuid:'work:fixture:1',project_id:'project:fixture:1',
 assignment_ref:'WA:fixture:1',attempt_ref:'ATTEMPT:fixture:1',
 source_generation:'generation:fixture:1',operation_ref:'operation:fixture:1',
 claim_ref:'claim:fixture:1',claim_generation:'claim-generation:fixture:1',
 authority_ref:'ward:decision:fixture:1',punch_card_digest:'sha256:'+'b'.repeat(64),
 return_ref:'return:fixture:1',return_target_ref:'return:fixture:1'
};
const out=compileAuthoritativeWorkPacket({localPacket:local,identity});
assert.equal(out.work_uuid,identity.work_uuid);
assert.equal(out.packet_id,local.packet_id);
assert.notEqual(out.work_uuid,out.packet_id);
assert.equal(out.semantic_digest,local.semantic_digest);
assert.equal(out.local_packet_semantic_digest,local.semantic_digest);
assert.equal(out.effect_authority,false);
assert.equal(Object.isFrozen(out),true);
for(const field of ['work_uuid','assignment_ref','attempt_ref','source_generation','operation_ref','claim_ref','claim_generation','authority_ref','punch_card_digest']){
 const bad={...identity}; delete bad[field];
 assert.throws(()=>compileAuthoritativeWorkPacket({localPacket:local,identity:bad}),new RegExp(field.toUpperCase()));
}
assert.throws(()=>compileAuthoritativeWorkPacket({localPacket:local,identity:{...identity,return_target_ref:'return:other'}}),/RETURN_TARGET_MISMATCH/);
assert.throws(()=>compileAuthoritativeWorkPacket({localPacket:local,identity:{...identity,work_uuid:local.packet_id}}),/WORK_UUID_PACKET_ID_COLLISION/);
assert.equal(local.work_uuid,undefined);
assert.equal(local.effect_authority,false);
console.log(JSON.stringify({schema:'xiio.cli.authoritative-work-packet-check/v1',state:'PASS',identity_fields:9,hostiles:11,effects:0}));
