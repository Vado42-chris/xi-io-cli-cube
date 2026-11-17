import {pathToFileURL} from 'node:url';
const modulePath=process.argv[2];if(!modulePath)process.exit(64);
let req='';for await(const chunk of process.stdin)req+=chunk;
try{
 const input=JSON.parse(req),mod=await import(pathToFileURL(modulePath).href);
 if(typeof mod.readReleaseDistribution!=='function')throw Error('FRAMEWORK_RELEASE_READER_EXPORT_REQUIRED');
 const out=await mod.readReleaseDistribution({product_ref:input.product_ref,consumer_ref:input.consumer_ref});
 process.stdout.write(JSON.stringify(out));
}catch(error){process.stderr.write(String(error?.message||error));process.exit(65)}
