#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {compileLocalWorkPacket,missingPacketFields} from './src/sdk/local-work-packet.mjs';

function fixture(overrides={}){
  const root=path.join(os.tmpdir(),'xiio-work-packet-fixture');
  return {
    packet_id:'packet:1',
    work_ref:'work:1',
    pinned_source:'a'.repeat(40),
    workspace_root:root,
    objective:'prove exact Work binding',
    dependencies:[],
    allowed_scope:{paths:['.'],tools:['node']},
    acceptance_command:['node','--version'],
    expected_result:{state:'PASS'},
    checkpoint_return_destination:'.xiio/returns/packet-1.json',
    next_step_policy:'STOP_ON_PASS',
    accepted:true,
    ...overrides,
  };
}

test('accepted local packet requires canonical Work ref distinct from packet id',()=>{
  const packet=compileLocalWorkPacket(fixture());
  assert.equal(packet.packet_id,'packet:1');
  assert.equal(packet.work_ref,'work:1');
  assert.notEqual(packet.packet_id,packet.work_ref);
  assert.equal(packet.semantic_digest.length,64);
});

test('missing Work ref is a packet schema failure',()=>{
  const input=fixture(); delete input.work_ref;
  assert.ok(missingPacketFields(input).includes('work_ref'));
  assert.throws(()=>compileLocalWorkPacket(input),/LOCAL_WORK_PACKET_FIELDS_MISSING:work_ref/);
});

test('Work ref participates in semantic identity',()=>{
  const a=compileLocalWorkPacket(fixture({work_ref:'work:1'}));
  const b=compileLocalWorkPacket(fixture({work_ref:'work:2'}));
  assert.notEqual(a.semantic_digest,b.semantic_digest);
});
