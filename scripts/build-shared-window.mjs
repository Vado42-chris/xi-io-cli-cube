#!/usr/bin/env node
// Build the canonical Node window dependency, not another product/source fork.
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {readFile,writeFile,mkdir,rm,readdir,rename,rmdir} from 'node:fs/promises';
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {assertSharedWindowPublicBytes,assertSharedWindowPublicProvenance,verifySharedWindowPublicOutput} from './verify-shared-window-public-output.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [sourceArg,depsArg]=process.argv.slice(2);
if(!sourceArg||!depsArg) throw Error('Usage: node scripts/build-shared-window.mjs /exact/patched/node-source /isolated/pinned-build-deps');
const source=resolve(sourceArg),deps=resolve(depsArg);
// Preserve the historical 32-input manifest for independently replaying
// shipped Cube bytes. This generator builds the separate 126-input C7 candidate.
const inputs=JSON.parse(await readFile(join(root,'scripts/shared-window-inputs.c7-candidate.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(!/^[0-9a-f]{40}$/.test(inputs.base_commit)||inputs.canonical_patch_files?.length!==0)
 throw Error('A committed Node source generation is required');
const pinned=new Set();
for(const item of inputs.files){
 if(!item.path||isAbsolute(item.path)||item.path.split('/').some(part=>!part||part==='..'||part==='.')||pinned.has(item.path))
  throw Error('Invalid or duplicate Node input: '+item.path);
 const bytes=await readFile(join(source,item.path));
 const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(sha(bytes)!==item.sha256||blob!==item.base_git_blob)
  throw Error('Canonical source changed; review a new generation: '+item.path);
 pinned.add(item.path);
}
// Guard the actual bundled Node graph as well as the declared list. A checkout
// can contain a needed input that a copied manifest silently omitted.
const requirePinnedNodeModule={
 name:'xiio-pinned-node-modules',enforce:'pre',
 transform(_code,id){
  if(!isAbsolute(id))return null;
  const path=relative(source,id.split('?')[0]).split(sep).join('/');
  if(path==='..'||path.startsWith('../')||path.startsWith('node_modules/'))return null;
  if(!pinned.has(path))throw Error('Unpinned Node build input: '+path);
  return null;
 },
};
const expected=JSON.parse(await readFile(join(root,'scripts/shared-window-build-lock.json'),'utf8'));
if(sha(await readFile(join(deps,'package-lock.json')))!==expected.sha256)throw Error('Build dependency lock changed');
for(const [name,version] of Object.entries(expected.direct_versions)){
 const actual=JSON.parse(await readFile(join(deps,'node_modules',name,'package.json'),'utf8')).version;
 if(actual!==version)throw Error('Pinned build dependency mismatch: '+name);
}
const scratch=join(root,'.shared-window-build');await mkdir(scratch,{recursive:true});
const output=join(root,'src/shared');await mkdir(output,{recursive:true});
if ((await readdir(output)).length) throw Error('Candidate shared output must start empty');
const stage=join(scratch,'assets');
await rm(stage,{recursive:true,force:true});
await mkdir(stage);
try {
const entry=join(scratch,'entry.mjs');
await writeFile(entry,`export {default as NativeProductWindowShell} from ${JSON.stringify(join(source,'src/components/framework/NativeProductWindowShell.jsx'))};\nexport {useThemeMode,setThemeMode} from ${JSON.stringify(join(source,'src/lib/themeModeStore.js'))};\n`);
const aliases={'@':join(source,'src')};
for(const name of ['framer-motion','lucide-react','@radix-ui/react-context-menu','clsx','tailwind-merge'])aliases[name]=join(deps,'node_modules',name);
// Adopt Node's existing browser-only Store resolution. Do not bundle the
// native Node resolver into a browser presentation or alias a provider mock.
const browserNativeStore={
 name:'xiio-browser-native-store',enforce:'pre',
 resolveId(request,importer,options){
  if(options?.ssr||request!=='./xiioNativeDataStore.mjs'||!importer)return null;
  if(resolve(importer.split('?')[0])!==join(source,'src/api/xiioNativeDataClient.mjs'))return null;
  return join(source,'src/api/xiioNativeDataStore.browser.mjs');
 },
};
// FileManager consumes only the plane choices. Compile a positive public
// projection, not the private Studio snapshot, into the shared browser window.
const snapshotPath='src/lib/empireWorkHomeSnapshot.json';
const snapshotFile=join(source,snapshotPath);
if(!pinned.has(snapshotPath))throw Error('Unpinned Node build input: '+snapshotPath);
const snapshot=JSON.parse(await readFile(snapshotFile,'utf8'));
if(!Array.isArray(snapshot.planes)||!snapshot.planes.length||
   snapshot.planes.some(p=>!p||!['id','label','job','kind'].every(k=>typeof p[k]==='string'&&p[k].trim())))
 throw Error('PUBLIC_WINDOW_PLANE_PROJECTION_INVALID');
const publicPlanes=snapshot.planes.map(({id,label,job,kind})=>({id,label,job,kind}));
const publicSnapshot={
 name:'xiio-public-workspace-plane-projection',enforce:'pre',
 load(id){
  if(id!==snapshotFile)return null;
  return JSON.stringify({planes:publicPlanes});
 },
};
const privateLocatorValues=[
 ...Object.values(snapshot.binds??{}),
 ...(snapshot.physical_examples_unchanged??[]).map(entry=>entry.path_class),
].filter(value=>typeof value==='string'&&value.length>0);
// The portable shell calls Sonner's toast API but does not own the document
// toaster or its CSS. Remove only the pinned library's top-level stylesheet
// side effect at module load, retaining all notification exports and calls.
const sonnerEntry=join(source,'node_modules/sonner/dist/index.mjs');
const sonnerModuleSha='52ab3b764c74a6e857e0be733326316046b29797ca67d0382e669e9a42c653f3';
let sonnerStyleSuppressed=false;
const isolateNotificationStyles={
 name:'xiio-portable-window-style-isolation',enforce:'pre',
 transform(code,id){
  if(resolve(id.split('?')[0])!==sonnerEntry)return null;
  if(sonnerStyleSuppressed||sha(code)!==sonnerModuleSha)throw Error('PORTABLE_WINDOW_SONNER_MODULE_DRIFT');
  const calls=[...code.matchAll(/^__insertCSS\("[^\n]+"\);?$/gm)];
  if(calls.length!==1)throw Error('PORTABLE_WINDOW_SONNER_STYLE_BOUNDARY_DRIFT');
  sonnerStyleSuppressed=true;
  return {code:code.slice(0,calls[0].index)+code.slice(calls[0].index+calls[0][0].length),map:null};
 },
};
const privatePathPattern=/(?:\/home\/|\/Users\/|\/media\/|[A-Za-z]:\\+Users\\+|file:\/\/)/;

await build({configFile:false,root,plugins:[requirePinnedNodeModule,publicSnapshot,browserNativeStore,isolateNotificationStyles,react()],resolve:{alias:aliases},build:{
 outDir:stage,emptyOutDir:false,copyPublicDir:false,sourcemap:false,minify:true,
 lib:{entry,formats:['es'],fileName:()=> 'window-frame.mjs',cssFileName:'window-frame'},
 rolldownOptions:{output:{minify:true,comments:{legal:true,annotation:false,jsdoc:false}},external:id=>/^react(?:\/|$)/.test(id)||/^react-dom(?:\/|$)/.test(id)},
}});
if(!sonnerStyleSuppressed)throw Error('PORTABLE_WINDOW_SONNER_STYLE_BOUNDARY_NOT_REACHED');
const content=inputs.files.filter(x=>/\.(?:js|jsx|mjs|ts|tsx)$/.test(x.path)).map(x=>join(source,x.path));
content.push(join(root,'src/SharedProductHost.tsx'));
const config=join(scratch,'frame-tailwind.config.cjs');
await writeFile(config,`const load=require(${JSON.stringify(join(deps,'node_modules/jiti'))})(__filename,{interopDefault:true});\nconst canonical=load(${JSON.stringify(join(source,'tailwind.config.js'))});\nmodule.exports={...canonical,content:${JSON.stringify(content)},safelist:canonical.safelist.filter(x=>x.pattern?.source==='^shadow-(sm|md|lg|xl|2xl|none)$')};\n`);
const css=spawnSync(process.execPath,[join(deps,'node_modules/tailwindcss/lib/cli.js'),'--config',config,'--input',join(source,'src/index.css'),'--output',join(stage,'frame-theme.css'),'--minify'],{stdio:'inherit'});
if(css.status!==0)throw Error('Canonical frame CSS compilation failed');
const artifactFiles=[];
await verifySharedWindowPublicOutput(stage);
const generated=(await readdir(stage,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
for(const required of ['window-frame.mjs','window-frame.css','frame-theme.css']) if(!generated.some(e=>e.name===required))throw Error('Required shared asset was not emitted: '+required);
for(const {name:path} of generated){
 const bytes=await readFile(join(stage,path));
 const emitted=bytes.toString('utf8');
 assertSharedWindowPublicBytes(bytes);
 if(privatePathPattern.test(emitted)||privateLocatorValues.some(value=>emitted.includes(value)))
  throw Error('SHARED_WINDOW_PRIVATE_PATH_DISCLOSURE_REFUSED: '+path);
 if(path.endsWith('.css')&&/@apply\s|@tailwind\s/.test(bytes.toString()))throw Error('Uncompiled shared CSS directive');
 artifactFiles.push({path,sha256:sha(bytes),bytes:bytes.length});
}
const generatorTools={};
for(const name of ['vite','@vitejs/plugin-react']) generatorTools[name]=JSON.parse(await readFile(join(root,'node_modules',name,'package.json'),'utf8')).version;
const consumerInput={path:'src/SharedProductHost.tsx',sha256:sha(await readFile(join(root,'src/SharedProductHost.tsx')))};
const consumerInstalledLock=sha(await readFile(join(root,'node_modules/.package-lock.json')));
const consumerDeclaredLock=sha(await readFile(join(root,'package-lock.json')));
const provenance={...inputs,consumer_css_input:consumerInput,generator_tools:generatorTools,generator_source_sha256:sha(await readFile(fileURLToPath(import.meta.url))),consumer_installed_lock_sha256:consumerInstalledLock,consumer_declared_lock_sha256:consumerDeclaredLock,consumer_tool_qualification:'SHARED_WINDOW_LOCAL_BUILD_NOT_RELEASE',qualification:'PUBLIC_WINDOW_BUILD_NOT_RELEASE',public_source_projection:{input:snapshotPath,fields:['planes[].id','planes[].label','planes[].job','planes[].kind']},portable_side_effects:{notification_module_sha256:sonnerModuleSha,document_style_injection:'SUPPRESSED_AT_SOURCE_BUILD'},public_output_paths_checked:artifactFiles.map(item=>item.path),dependency_lock_sha256:expected.sha256,node_version:process.version,artifact_files:artifactFiles,react:'EXTERNAL_EXISTING_CONSUMER_RUNTIME',product_payloads_included:false,provider_calls_on_open:'NONE_IN_PRESENTATION_IMPORT_GRAPH',browser_native_controls:'DISABLED',native_runtime:'NOT_RUN'};
provenance.generation=sha(Buffer.from(JSON.stringify(provenance)));
const provenanceBytes=JSON.stringify(provenance,null,2)+'\n';
assertSharedWindowPublicProvenance(provenanceBytes);
await writeFile(join(stage,'source-custody.json'),provenanceBytes);
await rmdir(output);
await rename(stage,output);
console.log(JSON.stringify({output,generation:provenance.generation,files:artifactFiles},null,2));
} finally {
 await rm(scratch,{recursive:true,force:true});
}
