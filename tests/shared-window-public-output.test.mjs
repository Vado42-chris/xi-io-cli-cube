import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertSharedWindowPublicBytes,verifySharedWindowPublicOutput} from '../scripts/verify-shared-window-public-output.mjs';

const names=['window-frame.mjs','window-frame.css','frame-theme.css'];
async function withOutput(run){
 const root=await mkdtemp(join(tmpdir(),'shared-window-public-'));
 try{
  for(const name of names)await writeFile(join(root,name),'/* public presentation */');
  await run(root);
 }finally{await rm(root,{recursive:true,force:true});}
}

test('all ordinary generated assets and lazy chunks are checked',()=>withOutput(async root=>{
 await mkdir(join(root,'assets'));
 await writeFile(join(root,'assets','FileManager-fixture.js'),'export const title="Workspace";');
 assert.deepEqual((await verifySharedWindowPublicOutput(root)).sort(),[...names,'assets/FileManager-fixture.js'].sort());
}));
test('lazy chunk containing private snapshot refuses before public provenance',()=>withOutput(async root=>{
 await writeFile(join(root,'FileManager-fixture.js'),'const s={schema:"xiio.studio.empire-work-home.snapshot/v1"};');
 await assert.rejects(verifySharedWindowPublicOutput(root),/^Error: SHARED_WINDOW_PRIVATE_PATH_DISCLOSURE_REFUSED$/);
}));
test('private filesystem paths and common escaped forms refuse without leaking bytes',()=>{
 for(const value of ['/home/fixture/private.txt','/Users/fixture/work','/mnt/fixture/records','C:\\Users\\fixture\\private','file:///fixture/document',String.raw`\u002fhome\u002ffixture\u002fprivate`,String.raw`\/home\/fixture\/private`]){
  assert.throws(()=>assertSharedWindowPublicBytes(value),{message:'SHARED_WINDOW_PRIVATE_PATH_DISCLOSURE_REFUSED'});
 }
 assert.doesNotThrow(()=>assertSharedWindowPublicBytes('const label="Home"; const route="/api/workspaces";'));
});
test('refuses linked output and missing required files',()=>withOutput(async root=>{
 await symlink(join(root,names[0]),join(root,'extra.js'));
 await assert.rejects(verifySharedWindowPublicOutput(root),/SHARED_WINDOW_OUTPUT_LINK_REFUSED/);
 await rm(join(root,'extra.js'));
 await rm(join(root,names[1]));
 await assert.rejects(verifySharedWindowPublicOutput(root),/SHARED_WINDOW_REQUIRED_ASSET_MISSING/);
}));

// A pinned relative input reference is not its private snapshot contents.
test('custody allows only exact pinned input coordinates, not snapshot content',()=>withOutput(async root=>{
 const snapshot='src/lib/empireWorkHomeSnapshot.json';
 const pin={path:snapshot,base_git_blob:'a'.repeat(40),sha256:'b'.repeat(64)};
 const custody={files:[pin],public_source_projection:{input:snapshot,fields:['planes[].id','planes[].label','planes[].job','planes[].kind']}};
 const file=join(root,'source-custody.json');
 await writeFile(file,JSON.stringify(custody));
 assert.ok((await verifySharedWindowPublicOutput(root)).includes('source-custody.json'));
 for(const bad of [
  {...custody,notes:snapshot},
  {...custody,files:[{...pin,sha256:'bad'}]},
  {...custody,public_source_projection:{...custody.public_source_projection,fields:['physical_examples_unchanged']}},
  {...custody,embedded:{schema:'xiio.studio.empire-work-home.snapshot/v1'}},
  {...custody,notes:'/home/fixture/private'},
 ]){
  await writeFile(file,JSON.stringify(bad));
  await assert.rejects(verifySharedWindowPublicOutput(root),/SHARED_WINDOW_PRIVATE_PATH_DISCLOSURE_REFUSED/);
 }
 // A similarly named file in a lazy output directory is not provenance.
 await writeFile(file,JSON.stringify(custody));
 await mkdir(join(root,'assets'));
 await writeFile(join(root,'assets','source-custody.json'),JSON.stringify(custody));
 await assert.rejects(verifySharedWindowPublicOutput(root),/SHARED_WINDOW_PRIVATE_PATH_DISCLOSURE_REFUSED/);
}));
