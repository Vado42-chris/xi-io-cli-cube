import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {availabilityFrom, availableSelection, canPrepareComponents, canRollbackPlan} from '../src/lib/installerAvailability.mjs';
import {createInstallerClient} from '../src/lib/nativeInstaller.mjs';
const actual = {supported_components: {cli:{available:true,required:true},bins:{available:false,reason:'PACKAGED_ARTIFACT_UNQUALIFIED'},switchboard:{available:false,reason:'PACKAGED_ARTIFACT_UNQUALIFIED'}}};
test('missing backend availability fails closed; no checked payload defaults', () => {
 const a=availabilityFrom(null);assert.deepEqual(availableSelection([],a),[]);assert.equal(canPrepareComponents(['cli'],a),false);
});
test('native supported_components restricts selection to actual CLI payload', () => {
 const a=availabilityFrom(actual);assert.deepEqual(availableSelection(['cli','bins','switchboard'],a),['cli']);
 assert.equal(canPrepareComponents(['cli'],a),true);assert.equal(canPrepareComponents(['cli','bins'],a),false);
 assert.equal(a.bins.reason,'PACKAGED_ARTIFACT_UNQUALIFIED');
});
test('optional payload does not become selected merely by later availability', () => {
 const a=availabilityFrom({supported_components:{...actual.supported_components,bins:{available:true}}});
 assert.deepEqual(availableSelection(['cli'],a),['cli']);assert.deepEqual(availableSelection(['cli','bins'],a),['cli','bins']);
});
test('rollback requires actual backend qualification, not installation phase alone', () => {
 const p={phase:'INSTALLED_READBACK_VERIFIED'};assert.equal(canRollbackPlan(p,false),false);
 assert.equal(canRollbackPlan({...p,rollback_available:false},false),false);
 assert.equal(canRollbackPlan({...p,rollback_available:true},false),true);
 assert.equal(canRollbackPlan({...p,rollback_available:true},true),false);
});
test('caller preserves agreed installer_request {request}, {ok,result} ABI', async () => {
 const request={action:'inspect'};
 const client=createInstallerClient(async (command,args) => {assert.equal(command,'installer_request');assert.deepEqual(args,{request});return {ok:true,result:actual};});
 assert.deepEqual(availabilityFrom(await client(request)),availabilityFrom(actual));
});
test('accepted panel adopts availability without replacement UI', () => {
 const src=readFileSync(new URL('../src/components/NativeInstallerPanel.tsx',import.meta.url),'utf8');
 assert.ok(src.includes('useState<string[]>([])'));
 assert.ok(src.includes('canPrepareComponents(components, availability)'));
 assert.ok(src.includes("disabled={name === 'cli' || !availability[name].available}"));
 assert.ok(src.includes('canRollbackPlan(plan, unknown)'));
 assert.ok(src.includes('CLI installation alone is not a complete HEX product installation'));
});
