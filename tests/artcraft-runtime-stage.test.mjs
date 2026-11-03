import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stageArtcraftRuntime} from '../scripts/stage-artcraft-runtime.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'artcraft-stage-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'generated');mkdirSync(source);return{source,target:join(root,'runtime')};}
test('stages actual generated runtime bytes and nested JS while excluding declarations',t=>{const f=fixture(t);writeFileSync(join(f.source,'launcher.js'),'export const generated=true;');writeFileSync(join(f.source,'launcher_bg.wasm'),Buffer.from([0,97,115,109,1,0,0,0]));writeFileSync(join(f.source,'launcher.d.ts'),'types');mkdirSync(join(f.source,'snippets'));writeFileSync(join(f.source,'snippets','helper.js'),'export {};');const paths=stageArtcraftRuntime(f.source,f.target);assert.deepEqual(paths.sort(),['launcher.js','launcher_bg.wasm','snippets/helper.js']);for(const path of paths)assert.deepEqual(readFileSync(join(f.target,path)),readFileSync(join(f.source,path)));assert.equal(existsSync(join(f.target,'launcher.d.ts')),false);});
test('refuses missing generated runtime before creating destination',t=>{const f=fixture(t);writeFileSync(join(f.source,'launcher.js'),'incomplete');assert.throws(()=>stageArtcraftRuntime(f.source,f.target),/ASSET_MISSING/);assert.equal(existsSync(f.target),false);});
test('never merges into or overwrites existing staged assets',t=>{const f=fixture(t);mkdirSync(f.target);writeFileSync(join(f.target,'owner'),'preserve');assert.throws(()=>stageArtcraftRuntime(f.source,f.target),/ALREADY_EXISTS/);assert.equal(readFileSync(join(f.target,'owner'),'utf8'),'preserve');});
test('refuses symlinked generated assets before copy',t=>{const f=fixture(t);symlinkSync('/not-read',join(f.source,'launcher.js'));assert.throws(()=>stageArtcraftRuntime(f.source,f.target),/SYMLINK_REFUSED/);assert.equal(existsSync(f.target),false);});

test('refuses a symlinked destination parent without writing outside staging',t=>{const f=fixture(t);const alias=f.target+'-alias';symlinkSync(f.source,alias);assert.throws(()=>stageArtcraftRuntime(f.source,join(alias,'escape')),/SYMLINK_REFUSED/);assert.equal(existsSync(join(f.source,'escape')),false);});
