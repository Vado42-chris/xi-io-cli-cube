import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const json=p=>JSON.parse(read(p));
test('editable native closure uses the root product build and fixed sibling resources',()=>{
 const config=json('native/hex/carrier/src-tauri/tauri.conf.json');
 assert.equal(config.build.frontendDist,'../frontend');
 assert.deepEqual(config.bundle.resources,{'../../adapter/':'adapter/','../../cli-source/':'cli-source/'});
 assert.match(read('scripts/native-package.mjs'),/join\(root,'dist'\)/);
 assert.match(read('scripts/native-package.mjs'),/pruneBytecode\(adapter\)/);
 for(const p of ['src-tauri/src/protocol.rs','src-tauri/src/transport.rs','src-tauri/src/chooser.rs','src-tauri/Cargo.lock','package-lock.json'])assert.ok(existsSync(new URL('../native/hex/carrier/'+p,import.meta.url)));
});
test('new native bindings and regressions are explicit CI denominators',()=>{
 const scripts=json('package.json').scripts,ci=read('.github/workflows/installer-contract.yml');
 for(const name of ['test:bindings','test:source-adoption','test:interaction','native:check'])assert.ok(ci.includes('npm run '+name),name);
 for(const name of ['local-journey','installer-readiness','installer-availability','native-directory'])assert.ok(scripts['test:bindings'].includes(name+'.test.mjs'));
 assert.ok(scripts['test:bindings'].includes('native/hex/adapter/local_steps/local_ai_status.test.mjs'));
 assert.ok(scripts['test:interaction'].includes('native-frame-interaction.test.mjs'));
 const protocol=read('native/hex/carrier/src-tauri/src/protocol.rs');
 for(const action of ['local_ai_status','safe_task_prepare','safe_task_apply','safe_task_inspect'])assert.ok(protocol.includes('"'+action+'"'));
 assert.match(read('native/hex/adapter/installer_adapter.py'),/local_step_actions/);
});
test('CLI payload manifest still verifies exact adopted bytes',()=>{
 const base='native/hex/cli-source/',m=json(base+'packaged-source.json');
 assert.equal(m.schema,'xiio.cli.packaged-source/v1');
 for(const [path,entry]of Object.entries(m.files)){
  const b=readFileSync(new URL('../'+base+path,import.meta.url));assert.equal(b.length,entry.size);assert.equal(createHash('sha256').update(b).digest('hex'),entry.sha256);
 }
 assert.equal(json(base+'SOURCE.json').ref,'d53a1d0219f5b1707c6c1bbedfb262082179ceab');
 assert.equal(json(base+'connection/SOURCE.json').ref,'ffbcd216d4c673de826242662271add63112c49a');
});

test('kernel closure stays byte-identical to its pinned owner manifest',()=>{
 const adoption=json('native/hex/SOURCE-ADOPTION.json');
 assert.equal(adoption.kernel.repository,'Vado42-chris/xi-io_installer');
 assert.equal(adoption.kernel.ref,'15ce1769b773b3882e3f3965945ca91a29df98ec');
 const directory=new URL('../native/hex/adapter/kernel/xiio_installer/',import.meta.url);
 assert.deepEqual(readdirSync(directory).filter(n=>n.endsWith('.py')).sort(),Object.keys(adoption.kernel.files_unchanged_sha256).sort());
 for(const [name,sha256]of Object.entries(adoption.kernel.files_unchanged_sha256)){
  assert.match(name,/^[a-z_]+\.py$/);assert.equal(createHash('sha256').update(readFileSync(new URL(name,directory))).digest('hex'),sha256);
 }
});

test('packaging provenance adds no runtime schema, registry or authority',()=>{
 const provenance=json('native/hex/SOURCE-ADOPTION.json');
 assert.equal(provenance.repository,'Vado42-chris/xi-io-cli-cube');
 assert.equal(Object.hasOwn(provenance,'schema'),false);
 assert.match(provenance.purpose,/not a runtime schema, registry, kernel identity or grant of authority/);
 assert.match(provenance.inherited_donor_portability_debt,/historical Aries\/Loki/);
 assert.match(provenance.inherited_donor_portability_debt,/requires repinning\/requalification/);
});
test('launcher-only repair consumes exact qualified PR15 without changing packaged install transport',()=>{
 const base='native/hex/cli-source/';const m=json(base+'launcher-repair.SOURCE.json');
 assert.equal(m.ref,'0f2b444abbe8f7a99c5f4520b1222c568eba6dd1');assert.equal(m.modifications,false);
 assert.equal(createHash('sha256').update(read(base+m.resource)).digest('hex'),'61fd09c0d0de09fb2b3aec4e94b34d013cd35ddc60eb44f86443a5d2b5812a4d');
 assert.equal(createHash('sha256').update(read(base+m.verification_resource.path)).digest('hex'),m.verification_resource.sha256);
 assert.match(read(base+'install.mjs'),/--packaged-source/);
 assert.doesNotMatch(read(base+m.resource),/--packaged-source/);
 const adapter=read('native/hex/adapter/installer_adapter.py');assert.match(adapter,/prepare_repair/);assert.match(adapter,/apply_repair/);assert.match(adapter,/CANONICAL_LAUNCHER_RECOVERY_REQUIRED_NO_RETRY/);
});

test('current payload provenance and bounded fresh-generation custody producer are exact',()=>{
 const base='native/hex/cli-source/',source=json(base+'SOURCE.json'),payload=json(base+'packaged-source.json');
 assert.equal(source.current_packaged_payload.repository,'Vado42-chris/xi-io-cli');
 assert.equal(source.current_packaged_payload.ref,payload.source_sha);
 assert.deepEqual(source.current_packaged_payload.files,payload.files);
 assert.equal(source.current_packaged_payload.local_payload_modifications,false);
 assert.equal(createHash('sha256').update(read(base+'src/xiio.mjs')).digest('hex'),'e3dab9c4b91891cfa243a9d72a28c15fbb63d9c6859782aec7a06473778f755b');
 assert.equal(source.offline_installer_successor.base_ref,'8dbd369c5c6b03637d0b04518400d405153e6885');
 assert.equal(source.offline_installer_successor.base_sha256,'1458258a60c0450d738161c0906b61b143b4e21fcb3e58ab22c7369a5810094a');
 assert.equal(source.offline_installer_successor.sha256,'37fc6956b59c26624e7ef4c7340012e4056b6be6219f619b5636302fd8325109');
 assert.equal(createHash('sha256').update(read(base+'install.mjs')).digest('hex'),source.offline_installer_successor.sha256);
});

test('current eleven-file payload and historical repair verifier keep separate exact custody',()=>{
 const base='native/hex/cli-source/',payload=json(base+'packaged-source.json'),repair=json(base+'launcher-repair.SOURCE.json');
 assert.equal(payload.source_sha,'923f3a656858366a45f5ec140326389920086fca');
 assert.equal(Object.keys(payload.files).length,11);assert.ok(payload.files['src/local-ops.mjs']);assert.ok(payload.files['src/sdk/local-work-packet.mjs']);
 const helper=read(base+'src/runtime-integrity.mjs').split('\n').filter(line=>!line.startsWith('import ')).join('\n').replace(/^export /gm,'').trim();
 const producer=read(base+'install.mjs');const start=producer.indexOf('\n',producer.indexOf('// BEGIN runtime-integrity standalone mirror'));
 const mirror=producer.slice(start,producer.indexOf('// END runtime-integrity standalone mirror')).trim();
 assert.equal(mirror,helper);
 assert.equal(repair.verification_resource.path,'launcher-repair.runtime-integrity.mjs');
 assert.equal(createHash('sha256').update(read(base+repair.verification_resource.path)).digest('hex'),repair.verification_resource.sha256);
 assert.notEqual(repair.verification_resource.sha256,payload.files['src/runtime-integrity.mjs'].sha256);
});
