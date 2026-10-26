#!/usr/bin/env node
// Native Switchboard host consumer, no GitHub comment execution path.
// The host must supply a previously admitted Ward-backed ports module.
import { pathToFileURL } from 'node:url';
import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Host aliases survive as legacy references; the CLI issues a per-install RFC-4122
// device UUID. This is syntax only: authenticated broker session, current
// WorkerTarget, Ward admission and claim/readback still bind actual authority.
const REF = /^device:(?:loki|aries|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const MAX_MS = 60000;
export function validateNativeConfig(env) {
  const deviceRef=env.XIIO_DEVICE_REF;
  const baseUrl=env.XIIO_DEVICE_BROKER_URL;
  const modulePath=env.XIIO_DEVICE_PORTS_MODULE;
  if (!REF.test(deviceRef || '')) throw Error('NATIVE_DEVICE_REF_UNBOUND');
  if (typeof baseUrl!=='string' || !/^https:\/\/[^\s/?#]+(?:\/[^?#]*)?$/.test(baseUrl)) throw Error('NATIVE_BROKER_HTTPS_REQUIRED');
  if (typeof modulePath!=='string' || !modulePath.startsWith('/')) throw Error('NATIVE_WARD_PORTS_MODULE_UNBOUND');
  const interval=Number(env.XIIO_DEVICE_POLL_MS || '30000');
  if (!Number.isSafeInteger(interval)||interval<5000||interval>MAX_MS) throw Error('NATIVE_POLL_INTERVAL_INVALID');
  return Object.freeze({deviceRef,baseUrl,modulePath,interval});
}
export async function loadNativePorts(modulePath) {
  const absolute=resolve(modulePath);
  const path=await realpath(absolute);
  if(path!==absolute) throw Error('NATIVE_PORTS_SYMLINK_REFUSED');
  const info=await stat(path);
  if(!info.isFile()||(info.mode&0o022)) throw Error('NATIVE_PORTS_FILE_UNTRUSTED');
  const portsModule=await import(pathToFileURL(path).href);
  if(typeof portsModule.createDevicePorts!=='function') throw Error('NATIVE_PORTS_FACTORY_MISSING');
  if(typeof portsModule.createDeviceHeaders!=='function') throw Error('NATIVE_AUTH_HEADERS_UNBOUND');
  const ports=await portsModule.createDevicePorts();
  for(const name of ['observeTime','observeTarget','authorize','claim','readClaim','resolveExecutor','readResult','recordAttempt','readAttemptReceipt']) {
    if(typeof ports?.[name]!=='function') throw Error('NATIVE_PORT_MISSING_'+name);
  }
  return {ports,headers:portsModule.createDeviceHeaders};
}
export async function runNativeOnce({env=process.env,loadPorts=loadNativePorts,transportFactory,pull}={}) {
  const config=validateNativeConfig(env);
  const loaded=await loadPorts(config.modulePath);
  if(typeof loaded.headers!=='function') throw Error('NATIVE_AUTH_HEADERS_UNBOUND');
  if(!transportFactory) ({createDeviceBrokerTransport:transportFactory}=await import("../lib/device-broker.mjs"));
  if(!pull) ({pullDeviceExecuteOnce:pull}=await import("../lib/device-execute-pull-worker.mjs"));
  // Verify credential provider exists before constructing transport.
  const firstHeaders=await loaded.headers();
  if(!firstHeaders || typeof firstHeaders!=='object' || Array.isArray(firstHeaders)) throw Error('NATIVE_AUTH_HEADERS_INVALID');
  const auth=firstHeaders.authorization || firstHeaders.Authorization || firstHeaders['cf-access-jwt-assertion'];
  if(typeof auth!=='string' || !auth.trim()) throw Error('NATIVE_AUTH_CREDENTIAL_UNBOUND');
  const transport=transportFactory({baseUrl:config.baseUrl,headers:loaded.headers});
  const result=await pull({deviceRef:config.deviceRef,transport,devicePorts:loaded.ports});
  if(!result || typeof result.state!=='string') throw Error('NATIVE_RESULT_INVALID');
  return {config,result};
}
async function main(){
  const once=process.argv.slice(2);
  if(once.length>1||(once.length===1&&once[0]!=='--once')) throw Error('NATIVE_ARGUMENT_INVALID');
  const config=validateNativeConfig(process.env);
  do {
    const {result}=await runNativeOnce();
    process.stdout.write(JSON.stringify({deviceRef:config.deviceRef,state:result.state,firstRed:result.firstRed||null,jobRef:result.jobRef||null,brokerReturned:result.brokerReturned===true,returnCertified:false})+'\n');
    if(result.state==='BLOCKED'||result.state==='RESULT_UNRETURNED'||result.state==='WAIT_TRANSPORT')process.exitCode=3;
    if(once.length)break;
    await new Promise(resolve=>setTimeout(resolve,config.interval));
  }while(true);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{process.stderr.write(JSON.stringify({state:'BLOCKED',firstRed:/^[A-Z0-9_]{5,90}$/.test(e.message)?e.message:'NATIVE_CONSUMER_FAILED'})+'\n');process.exitCode=3;});
