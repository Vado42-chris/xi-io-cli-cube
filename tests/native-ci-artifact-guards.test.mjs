import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

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
 assert.match(maths,/verify-hex-capture\.py/);
 assert.match(maths,/maths-installed-window-visual\.json/);
 assert.ok(native.includes('python3-pil')&&maths.includes('python3-pil'));
});
