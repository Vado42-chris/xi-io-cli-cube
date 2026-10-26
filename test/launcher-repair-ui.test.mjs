import test from 'node:test';
import assert from 'node:assert/strict';
import {installerStatus,createInstallerClient} from '../src/lib/nativeInstaller.mjs';
import {installerReadiness} from '../src/lib/installerReadiness.mjs';
test('repair preparation is not installed or accepted',()=>{
 const s=installerStatus({phase:'PREPARED_REPAIR_NOT_APPLIED'});assert.equal(s.tone,'neutral');assert.match(s.message,/before approval/);
});
test('observed repair is limited to launcher, historical receipt not live success',()=>{
 const p={phase:'LAUNCHER_REPAIR_READBACK_VERIFIED'};
 assert.equal(installerStatus(p,false).tone,'neutral');
 assert.match(installerStatus(p,true).message,/Doctor and an approved local read still require acceptance/);
 assert.equal(installerStatus({...p,do_not_retry:true},true).tone,'warning');
});
test('repair does not inherit normal install connection prerequisite',()=>{
 const rows=installerReadiness(null,{kind:'launcher_repair',node:{version:'v22.23.2',path:'/existing/node'},repair_source:{ref:'exact'}});
 assert.ok(rows.some(x=>x.text.startsWith('Not required for launcher-only repair')));
 assert.ok(!rows.some(x=>x.text.includes('mandatory with CLI')));
});
test('actual finite client passes exact approved repair, refuses malformed response',async()=>{
 const request={action:'apply_repair',plan_id:'p',approval_digest:'sha',approved:true};let got;
 const result=await createInstallerClient(async(command,args)=>{got={command,args};return {ok:true,result:{phase:'LAUNCHER_REPAIR_READBACK_VERIFIED'}};})(request);
 assert.deepEqual(got,{command:'installer_request',args:{request}});assert.equal(result.phase,'LAUNCHER_REPAIR_READBACK_VERIFIED');
 await assert.rejects(createInstallerClient(async()=>({ok:false,error:'STALE'}))(request),/STALE/);
 await assert.rejects(createInstallerClient(async()=>({ok:true}))(request),/missing/);
});
