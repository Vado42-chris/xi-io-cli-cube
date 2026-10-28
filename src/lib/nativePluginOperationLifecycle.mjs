/** Latest-owner lifecycle for native HEX Plugins UI operations.
 * Refuses stale completion/denial to avoid overwriting newer observations.
 * All successful, rejected and thrown calls release the current busy state.
 * A caller may invalidate without state mutation during React unmount.
 * This manages UI sequencing only. No XI-IO identity or authority is inferred.
 */
export function createNativePluginOperationLifecycle(onBusy){
 if(typeof onBusy!=='function')throw new TypeError('BUSY_OBSERVER_REQUIRED');
 let revision=0;
 return Object.freeze({
  async run(operation){
   if(typeof operation!=='function')throw new TypeError('OPERATION_REQUIRED');
   const mine=++revision;
   const current=()=>mine===revision;
   onBusy(true);
   try{return await operation(current);}
   finally{if(current())onBusy(false);}
  },
  invalidate(){
   revision++;
  },
 });
}
