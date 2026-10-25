#!/usr/bin/env node
// Build the canonical Node window dependency, not another product/source fork.
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {readFile,writeFile,mkdir,rm,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [sourceArg,depsArg]=process.argv.slice(2);
if(!sourceArg||!depsArg) throw Error('Usage: node scripts/build-shared-window.mjs /exact/patched/node-source /isolated/pinned-build-deps');
const source=resolve(sourceArg),deps=resolve(depsArg);
const inputs=JSON.parse(await readFile(join(root,'scripts/shared-window-inputs.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const item of inputs.files){
 const bytes=await readFile(join(source,item.path));
 if(sha(bytes)!==item.sha256)throw Error('Canonical source changed; review a new generation: '+item.path);
}
const expected=JSON.parse(await readFile(join(root,'scripts/shared-window-build-lock.json'),'utf8'));
if(sha(await readFile(join(deps,'package-lock.json')))!==expected.sha256)throw Error('Build dependency lock changed');
for(const [name,version] of Object.entries(expected.direct_versions)){
 const actual=JSON.parse(await readFile(join(deps,'node_modules',name,'package.json'),'utf8')).version;
 if(actual!==version)throw Error('Pinned build dependency mismatch: '+name);
}
const scratch=join(root,'.shared-window-build');await mkdir(scratch,{recursive:true});
const output=join(root,'src/shared');await mkdir(output,{recursive:true});
const entry=join(scratch,'entry.mjs');
await writeFile(entry,`export {default as NativeProductWindowShell} from ${JSON.stringify(join(source,'src/components/framework/NativeProductWindowShell.jsx'))};\nexport {useThemeMode,setThemeMode} from ${JSON.stringify(join(source,'src/lib/themeModeStore.js'))};\n`);
const aliases={'@':join(source,'src')};
for(const name of ['framer-motion','lucide-react','@radix-ui/react-context-menu','clsx','tailwind-merge'])aliases[name]=join(deps,'node_modules',name);
await build({configFile:false,root,plugins:[react()],resolve:{alias:aliases},build:{
 outDir:output,emptyOutDir:false,copyPublicDir:false,sourcemap:false,minify:true,
 lib:{entry,formats:['es'],fileName:()=> 'window-frame.mjs',cssFileName:'window-frame'},
 rollupOptions:{external:id=>/^react(?:\/|$)/.test(id)||/^react-dom(?:\/|$)/.test(id)},
}});
const content=inputs.files.filter(x=>/\.(?:js|jsx|mjs|ts|tsx)$/.test(x.path)).map(x=>join(source,x.path));
content.push(join(root,'src/SharedProductHost.tsx'));
const config=join(scratch,'frame-tailwind.config.cjs');
await writeFile(config,`const load=require(${JSON.stringify(join(deps,'node_modules/jiti'))})(__filename,{interopDefault:true});\nconst canonical=load(${JSON.stringify(join(source,'tailwind.config.js'))});\nmodule.exports={...canonical,content:${JSON.stringify(content)},safelist:canonical.safelist.filter(x=>x.pattern?.source==='^shadow-(sm|md|lg|xl|2xl|none)$')};\n`);
const css=spawnSync(process.execPath,[join(deps,'node_modules/tailwindcss/lib/cli.js'),'--config',config,'--input',join(source,'src/index.css'),'--output',join(output,'frame-theme.css'),'--minify'],{stdio:'inherit'});
if(css.status!==0)throw Error('Canonical frame CSS compilation failed');
const artifactFiles=[];
for(const path of ['window-frame.mjs','window-frame.css','frame-theme.css']){
 const bytes=await readFile(join(output,path));
 if(path.endsWith('.css')&&/@apply\s|@tailwind\s/.test(bytes.toString()))throw Error('Uncompiled shared CSS directive');
 artifactFiles.push({path,sha256:sha(bytes),bytes:bytes.length});
}
const generatorTools={};
for(const name of ['vite','@vitejs/plugin-react']) generatorTools[name]=JSON.parse(await readFile(join(root,'node_modules',name,'package.json'),'utf8')).version;
const consumerInput={path:'src/SharedProductHost.tsx',sha256:sha(await readFile(join(root,'src/SharedProductHost.tsx')))};
const consumerInstalledLock=sha(await readFile(join(root,'node_modules/.package-lock.json')));
const provenance={...inputs,consumer_css_input:consumerInput,generator_tools:generatorTools,generator_source_sha256:sha(await readFile(fileURLToPath(import.meta.url))),consumer_installed_lock_sha256:consumerInstalledLock,consumer_tool_qualification:'EXISTING_INSTALLED_CACHE_NOT_UPSTREAM_LOCKED_RELEASE',qualification:'DERIVED_LOCAL_UNPUBLISHED_NODE_PATCH_NOT_MAIN_BASELINE',dependency_lock_sha256:expected.sha256,node_version:process.version,artifact_files:artifactFiles,react:'EXTERNAL_EXISTING_CONSUMER_RUNTIME',product_payloads_included:false,provider_calls_on_open:'NONE_IN_PRESENTATION_IMPORT_GRAPH',browser_native_controls:'DISABLED',native_runtime:'NOT_RUN'};
await writeFile(join(output,'source-custody.json'),JSON.stringify(provenance,null,2)+'\n');
await rm(scratch,{recursive:true,force:true});
console.log(JSON.stringify({output,files:artifactFiles},null,2));
