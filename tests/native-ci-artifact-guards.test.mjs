import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const native=read('.github/workflows/native-hex-plugin-candidate.yml');
const maths=read('.github/workflows/installer-contract.yml');
const extract=read('scripts/verify-extracted-hex-gui.sh');
const guard=read('scripts/verify-public-hex-runtime-deb.py');
function step(content,name){
 const token='      - name: '+name;
 const at=content.indexOf(token);
 assert.ok(at>=0,'MISSING_CI_STEP:'+name);
 const end=content.indexOf('\n      - name:',at+token.length);
 return content.slice(at,end<0?content.length:end);
}
const selected='"'+'$'+'{debs[0]}"';
const proofPaths=[
 'hex-gui-proof/original/window.png',
 'hex-gui-proof/original/window-visual.json',
 'hex-gui-proof/original/window-diagnostic.json',
 'hex-gui-proof/original/operation-inspection.json',
 'hex-gui-proof/webkit-default/window.png',
 'hex-gui-proof/webkit-default/window-visual.json',
 'hex-gui-proof/webkit-default/window-diagnostic.json',
 'hex-gui-proof/webkit-default/operation-inspection.json',
 'hex-gui-proof/mode-results.json',
 'hex-gui-proof/source-commit.txt',
];
function assertBoundedNativeProof(content){
 const proof=step(content,'Preserve bounded native GUI observations without candidate binary');
 assert.match(proof,/if: always\(\)/);
 assert.match(proof,/uses: actions\/upload-artifact@v4/);
 const block=proof.match(/\n          path: \|\n((?:            [^\n]+\n)+)/);
 assert.ok(block,'PROOF_EXPLICIT_PATH_LIST_REQUIRED');
 assert.deepEqual(block[1].trim().split('\n').map(x=>x.trim()),proofPaths);
 assert.equal((proof.match(/\n          path:/g)||[]).length,1);
 assert.doesNotMatch(proof,/include-hidden-files:\s*true/);
}

test('automatic native proof upload contains only exact isolated pixel and sanitized evidence paths',()=>{
 assertBoundedNativeProof(native);
 // Reject broad globs, raw logs, profile data, source/runtime and binary payloads.
 for(const unsafe of ['hex-gui-proof/**','hex-gui-proof/*.json',
   'hex-gui-proof/window-stderr.log','hex-gui-proof/profile.secret/home',
   'native/hex/carrier/src-tauri/target/release/bundle/deb/*.deb',
   'native/hex/cli-source/','hex-bundle-inspect.json']){
   const mutation=native.replace('            hex-gui-proof/original/window.png\n',
     '            hex-gui-proof/original/window.png\n            '+unsafe+'\n');
   assert.throws(()=>assertBoundedNativeProof(mutation),undefined,unsafe);
 }
 assert.ok(native.includes('printf \'%s\\n\' "${GITHUB_SHA}" > hex-gui-proof/source-commit.txt'));
});

test('native package review receives selected filename, not literal bash syntax',()=>{
 const line=native.split('\n').find(x=>x.includes('python3 -B - ')&&x.includes("<<'PY'"));
 assert.equal(line?.trim(),'python3 -B - '+selected+" <<'PY'");
 const shell=spawnSync('bash',['-c','debs=("/tmp/example one.deb"); printf "%s" '+selected],
   {encoding:'utf8',timeout:2000});
 assert.equal(shell.status,0,shell.stderr);
 assert.equal(shell.stdout,'/tmp/example one.deb');
});
test('both binary uploads require explicit owner dispatch and reviewed package',()=>{
 const a=step(native,'Upload candidate package (not installed on Aries)');
 const b=step(maths,'Upload exact owner-approved maths candidate only on explicit manual dispatch');
 for(const upload of [a,b]){
   assert.match(upload,/github.event_name == 'workflow_dispatch'/);
   assert.match(upload,/inputs.publish_candidate_artifact == true/);
   assert.match(upload,/github.actor == 'Vado42-chris'/);
   assert.match(upload,/distribution_review.outcome == 'success'/);
   assert.doesNotMatch(upload,/if: always\(\)/);
   assert.match(upload,/bundle\/deb\/\*\.deb/);
 }
 const proof=step(maths,'Preserve bounded maths/source observations without candidate binary');
 assert.match(proof,/if: always\(\)/);
 assert.doesNotMatch(proof,/bundle\/deb\/\*\.deb/);
});
test('both output paths use the same fail-closed private runtime review',()=>{
 assert.match(native,/python3 -B scripts\/verify-public-hex-runtime-deb\.py --deb/);
 assert.ok(maths.includes('python3 -B scripts/verify-public-hex-runtime-deb.py --deb '+selected));
 assert.match(guard,/DEBIAN_DEVELOPMENT_FILES_PRESENT/);
 assert.match(guard,/PRIVATE_RUNTIME_APPROVAL_ABSENT/);
 assert.match(guard,/private_owner_approval_independently_confirmed/);
});
test('extracted and installed GUI refuse blank screenshot false-success',()=>{
 assert.match(extract,/HEX_CAPTURE_BLANK_OR_PREPAINT/);
 assert.match(extract,/verify-hex-capture\.py/);
 assert.match(extract,/deadline=\$\(\(SECONDS \+ 60\)\)/);
 assert.match(extract,/capture_command 3 scrot/);
 assert.match(extract,/capture_command 3 python3 -I -B/);
 assert.match(extract,/timeout --signal=KILL/);
 assert.match(extract,/local budget=\$1 remaining=\$\(\(deadline - SECONDS\)\)/);
 assert.match(extract,/slots=\$\(\(12 - attempt\)\)/);
 assert.match(extract,/HEX_GUI_OBSERVATION_DEADLINE/);
 assert.match(maths,/HEX_INSTALLED_WINDOW_BLANK_OR_PREPAINT/);
 assert.match(maths,/capture_command 3 scrot/);
 assert.match(maths,/capture_command 3 python3 -I -B/);
 assert.match(maths,/slots=\$\(\(12 - attempt\)\)/);
 assert.match(maths,/timeout --signal=KILL/);
 assert.match(maths,/verify-hex-capture\.py/);
 assert.match(maths,/maths-installed-window-visual\.json/);
 assert.ok(native.includes('python3-pil')&&maths.includes('python3-pil'));
});

test('one exact ELF is compared without silent either-mode acceptance',()=>{
 const observe=step(native,'Observe extracted package native window in isolated Xvfb');
 assert.equal((observe.match(/xvfb-run -a/g)||[]).length,2);
 assert.match(observe,/hex-gui-proof\/original" original/);
 assert.match(observe,/hex-gui-proof\/webkit-default" webkit-default/);
 assert.equal((observe.match(/\" = "\$elf_sha"/g)||[]).length,2);
 assert.match(observe,/test "\$default_status" -eq 0/);
 assert.doesNotMatch(observe,/original_status.*\|\|.*default_status/);
 assert.match(observe,/"qualification_environment": "webkit-default"/);
 assert.match(extract,/case "\$render_mode" in/);
 assert.match(extract,/HEX_RENDER_MODE_UNSUPPORTED/);
 assert.match(extract,/GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 "\$\{webkit_environment\[@\]\}"/);
});
test('unknown rendering mode is rejected before accessing a payload or profile',()=>{
 const result=spawnSync('bash',[new URL('../scripts/verify-extracted-hex-gui.sh',import.meta.url).pathname,
   '/nonexistent-payload','/nonexistent-proof','unreviewed-mode'],{encoding:'utf8',timeout:2000});
 assert.equal(result.status,64);assert.match(result.stderr,/HEX_RENDER_MODE_UNSUPPORTED/);
});

test('actual comparison shell preserves both outcomes and refuses changed ELF/default failure',()=>{
 const observe=step(native,'Observe extracted package native window in isolated Xvfb');
 const section=observe.slice(observe.indexOf('          elf_sha=')).split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 for(const [original,normal,mutate,expected] of [[85,0,false,0],[0,85,false,1],[0,0,true,1]]){
  const dir=mkdtempSync(join(tmpdir(),'hex-mode-test-'));
  try {
   mkdirSync(join(dir,'bin'));mkdirSync(join(dir,'payload/usr/bin'),{recursive:true});mkdirSync(join(dir,'hex-gui-proof'));
   writeFileSync(join(dir,'payload/usr/bin/xi-io-hex-dev'),'SYNTHETIC_ELF_SENTINEL');
   writeFileSync(join(dir,'bin/xvfb-run'),`#!/bin/bash
mode=\"\${@: -3:1}\"
printf '%s\\n' \"$mode\" >> \"$MODE_CALLS\"
if [[ \"$MUTATE_ELF\" == yes && \"$mode\" == original ]]; then printf changed >> \"$PAYLOAD_FILE\"; fi
if [[ \"$mode\" == original ]]; then exit \"$ORIGINAL_STATUS\"; else exit \"$DEFAULT_STATUS\"; fi
`,{mode:0o755});
   const result=spawnSync('bash',['-euo','pipefail','-c','payload="$PWD/payload"\n'+section],
    {cwd:dir,encoding:'utf8',timeout:5000,env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH,
      GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',ORIGINAL_STATUS:String(original),DEFAULT_STATUS:String(normal),
      MUTATE_ELF:mutate?'yes':'no',PAYLOAD_FILE:join(dir,'payload/usr/bin/xi-io-hex-dev'),MODE_CALLS:join(dir,'calls')}});
   assert.equal(result.status,expected,result.stdout+result.stderr);
   if(mutate){assert.equal(existsSync(join(dir,'hex-gui-proof/mode-results.json')),false);assert.equal(readFileSync(join(dir,'calls'),'utf8'),'original\n');}
   else {
    const receipt=JSON.parse(readFileSync(join(dir,'hex-gui-proof/mode-results.json'),'utf8'));
    assert.deepEqual(receipt.mode_exit_codes,{original,'webkit-default':normal});
    assert.equal(receipt.qualification_environment,'webkit-default');assert.equal(receipt.qualification_passed,normal===0);
    assert.equal(receipt.original_environment_qualified,original===0);
    assert.equal(receipt.semantic_ui_verified,false);assert.equal(receipt.installed_package,false);
   }
  } finally {rmSync(dir,{recursive:true,force:true});}
 }
});

test('both retry paths explicitly replace the exact PNG reopened by the checker',()=>{
 assert.match(extract,/capture_command 3 scrot -z -o "\$proof\/window\.png"/);
 assert.match(maths,/capture_command 3 scrot -z -o "\$MATHS_WINDOW_WORK\/installed-window\.png"/);
});

 test('hyphenated Python qualification suites execute directly rather than empty discovery',()=>{
 for(const file of ['hex-capture.test.py','hex-gui-deadline.test.py','gui-render-budget.test.py']) {
  assert.ok(native.includes('/usr/bin/python3 -I -B tests/'+file+' -v'));
  assert.ok(!native.includes('unittest discover -s tests -p '+file));
 }
 });
