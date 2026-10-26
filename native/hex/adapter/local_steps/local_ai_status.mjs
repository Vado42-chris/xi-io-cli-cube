// Derived from pinned CLI d53a1d0219f5b1707c6c1bbedfb262082179ceab
// src/xiio.mjs modelsCommand. Hardened finite read-only projection for HEX Step4.
// No install, start, generation, model download or credential access.
import {pathToFileURL} from 'node:url';
export async function observeLocalModels({fetchImpl=fetch}={}) {
  try {
    const response=await fetchImpl('http://127.0.0.1:11434/api/tags',{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),
    });
    if(!response.ok)throw Error('LOCAL_MODEL_HTTP_'+response.status);
    const reader=response.body?.getReader();
    if(!reader)throw Error('LOCAL_MODEL_RESPONSE_EMPTY');
    let size=0;const chunks=[];
    try {for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)throw Error('LOCAL_MODEL_RESPONSE_TOO_LARGE');chunks.push(part.value);}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!Array.isArray(body.models)||body.models.length>1000)throw Error('LOCAL_MODEL_RESPONSE_INVALID');
    const models=body.models.filter(m=>m&&typeof(m.name||m.model)==='string').map(m=>({name:(m.name||m.model).slice(0,256),size:Number.isSafeInteger(m.size)&&m.size>=0?m.size:null}));
    return {schema:'xiio.hex.local-model-observation/v1',state:models.length?'MODELS_OBSERVED':'NO_MODELS',models,observed_at:new Date().toISOString(),runtime_identity_verified:false,inference_tested:false,model_loaded:false,mutations:0};
  } catch(error) {
    return {schema:'xiio.hex.local-model-observation/v1',state:'UNAVAILABLE',models:[],reason:String(error.message).slice(0,200),observed_at:new Date().toISOString(),runtime_identity_verified:false,inference_tested:false,model_loaded:false,mutations:0};
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==2)throw Error('ARGUMENTS_NOT_SUPPORTED');
 process.stdout.write(JSON.stringify(await observeLocalModels())+'\n');
}
