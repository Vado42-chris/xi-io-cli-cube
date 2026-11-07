import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  compileLocalWorkPacket,
  acceptPacket,
  loadAcceptedPacket,
} from './src/sdk/local-work-packet.mjs';

function fixture(root){
  return {
    packet_id:'packet:worker-fields',
    pinned_source:'a'.repeat(40),
    workspace_root:root,
    objective:'prove accepted packet worker identity persistence',
    dependencies:[],
    allowed_scope:{paths:['.'],tools:['node']},
    acceptance_command:['node','--version'],
    expected_result:{exit_code:0},
    checkpoint_return_destination:'.xiio/returns/packet.json',
    next_step_policy:'STOP_ON_PASS',
    accepted:true,
    work_uuid:'aab28cae-92af-47eb-bdf9-4b260422acae',
    assignment_ref:'WA-AAB28CAE-351-20261018',
    attempt_ref:'attempt:one',
    source_generation:'ibal-autonomy-reconstruct@924fd66.da33d19f',
    operation_ref:'owner-event:local-nplus1-after-sandbox:20261101T1704',
    return_ref:'return:Inbox#600',
    project_id:'project:xi-io-studio',
  };
}

test('compiler preserves exact worker identity and binds it into semantic digest',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-packet-compile-'));
  try{
    const input=fixture(root);
    const packet=compileLocalWorkPacket(input);
    for(const key of ['work_uuid','assignment_ref','attempt_ref','source_generation','operation_ref','return_ref','project_id']){
      assert.equal(packet[key],input[key],key);
    }
    const changed=compileLocalWorkPacket({...input,source_generation:'generation:changed'});
    assert.notEqual(packet.semantic_digest,changed.semantic_digest);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('canonical accepted-work-packet file round-trips all worker fields',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-packet-store-'));
  try{
    const input=fixture(root);
    const accepted=acceptPacket(input,{workspaceRoot:root});
    assert.equal(accepted.state,'PASS');
    const file=path.join(root,'.xiio','accepted-work-packet.json');
    const raw=JSON.parse(fs.readFileSync(file,'utf8'));
    for(const key of ['work_uuid','assignment_ref','attempt_ref','source_generation','operation_ref','return_ref','project_id']){
      assert.equal(raw[key],input[key],key+' raw');
    }
    const loaded=loadAcceptedPacket(root);
    assert.equal(loaded.state,'PASS');
    for(const key of ['work_uuid','assignment_ref','attempt_ref','source_generation','operation_ref','return_ref','project_id']){
      assert.equal(loaded.packet[key],input[key],key+' loaded');
    }
    assert.equal(loaded.packet.semantic_digest,raw.semantic_digest);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('return_target_ref compatibility is normalized to canonical return_ref',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-packet-return-'));
  try{
    const input=fixture(root);
    delete input.return_ref;
    input.return_target_ref='return:legacy-target';
    const packet=compileLocalWorkPacket(input);
    assert.equal(packet.return_ref,'return:legacy-target');
    assert.equal(Object.hasOwn(packet,'return_target_ref'),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('legacy packet without worker identity retains legacy semantic digest',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-packet-legacy-'));
  try{
    const input=fixture(root);
    for(const key of ['work_uuid','assignment_ref','attempt_ref','source_generation','operation_ref','return_ref','project_id']) delete input[key];
    const packet=compileLocalWorkPacket(input);
    const legacyInput={
      packet_id:packet.packet_id,
      pinned_source:packet.pinned_source,
      workspace_root:packet.workspace_root,
      objective:packet.objective,
      dependencies:packet.dependencies,
      allowed_scope:packet.allowed_scope,
      acceptance_command:packet.acceptance_command,
      admitted_step:packet.admitted_step,
      expected_result:packet.expected_result,
      checkpoint_return_destination:packet.checkpoint_return_destination,
      next_step_policy:packet.next_step_policy,
    };
    const legacyDigest=crypto.createHash('sha256').update(JSON.stringify(legacyInput)).digest('hex');
    assert.equal(packet.semantic_digest,legacyDigest);
    assert.equal(packet.work_uuid,null);
    assert.equal(packet.source_generation,null);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
