import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePluginOperationLifecycle} from '../src/lib/nativePluginOperationLifecycle.mjs';

const deferred=()=>{
 let resolve,reject;
 const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
 return {promise,resolve,reject};
};

test('successful Plugins operation releases busy state',async()=>{
 const busy=[],lifecycle=createNativePluginOperationLifecycle(x=>busy.push(x));
 let currentAtRead=false;
 const result=await lifecycle.run(isCurrent=>{currentAtRead=isCurrent();return 'READY';});
 assert.equal(result,'READY');
 assert.equal(currentAtRead,true);
 assert.deepEqual(busy,[true,false]);
});
test('rejected promise releases busy state',async()=>{
 const busy=[],lifecycle=createNativePluginOperationLifecycle(x=>busy.push(x));
 await assert.rejects(lifecycle.run(async()=>{throw Error('REJECTED');}),/REJECTED/);
 assert.deepEqual(busy,[true,false]);
});
test('synchronous thrown exception releases busy state',async()=>{
 const busy=[],lifecycle=createNativePluginOperationLifecycle(x=>busy.push(x));
 await assert.rejects(lifecycle.run(()=>{throw Error('EXCEPTION');}),/EXCEPTION/);
 assert.deepEqual(busy,[true,false]);
});
test('explicit cancellation releases busy and invalidates the pending result',async()=>{
 const busy=[],lifecycle=createNativePluginOperationLifecycle(x=>busy.push(x));
 const gate=deferred();let live;
 const task=lifecycle.run(async current=>{live=current;return gate.promise;});
 assert.equal(live(),true);
 lifecycle.cancel();
 assert.equal(live(),false);
 gate.resolve('STALE');
 assert.equal(await task,'STALE');
 assert.deepEqual(busy,[true,false]);
});
test('stale first completion never clears a newer operation busy state',async()=>{
 const busy=[],lifecycle=createNativePluginOperationLifecycle(x=>busy.push(x));
 const first=deferred(),second=deferred();
 let firstCurrent,secondCurrent;
 const earlier=lifecycle.run(async valid=>{firstCurrent=valid;return first.promise;});
 const later=lifecycle.run(async valid=>{secondCurrent=valid;return second.promise;});
 assert.equal(firstCurrent(),false);
 assert.equal(secondCurrent(),true);
 first.resolve('OLD');
 assert.equal(await earlier,'OLD');
 assert.deepEqual(busy,[true,true]);
 second.resolve('NEW');
 assert.equal(await later,'NEW');
 assert.deepEqual(busy,[true,true,false]);
});
test('stale rejection never clears newer operation busy state',async()=>{
 const busy=[],lifecycle=createNativePluginOperationLifecycle(x=>busy.push(x));
 const first=deferred(),second=deferred();
 const earlier=lifecycle.run(()=>first.promise);
 const later=lifecycle.run(()=>second.promise);
 first.reject(Error('OLD_FAIL'));
 await assert.rejects(earlier,/OLD_FAIL/);
 assert.deepEqual(busy,[true,true]);
 second.resolve('NEW');
 await later;
 assert.deepEqual(busy,[true,true,false]);
});
test('unmount invalidates operation without invoking React state setter',async()=>{
 const busy=[],lifecycle=createNativePluginOperationLifecycle(x=>busy.push(x));
 const gate=deferred();let current;
 const task=lifecycle.run(async checker=>{current=checker;return gate.promise;});
 lifecycle.cancel({unmounted:true});
 assert.equal(current(),false);
 gate.resolve('AFTER_UNMOUNT');
 await task;
 assert.deepEqual(busy,[true]);
});
test('wrong usage is rejected without false busy-state operations',async()=>{
 const busy=[],lifecycle=createNativePluginOperationLifecycle(x=>busy.push(x));
 await assert.rejects(lifecycle.run(null),/OPERATION_REQUIRED/);
 assert.deepEqual(busy,[]);
 assert.throws(()=>createNativePluginOperationLifecycle(null),/BUSY_OBSERVER_REQUIRED/);
});
