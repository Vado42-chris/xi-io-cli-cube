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
 assert.equal(adoption.kernel.ref,'8e1bb08b58824898cdcaf022fd1ea0df11452268');
 assert.equal(adoption.kernel.acceptance_state,'ACCEPTED_MAIN');
 assert.equal(adoption.kernel.owner_pr,39);
 assert.deepEqual(adoption.kernel.accepted_generation_history.map(x=>x.owner_pr),[18,21,30,31,32,34,35,36,37,38,39]);
 assert.equal(adoption.kernel.accepted_generation_history.at(-1).merge_ref,adoption.kernel.ref);
 assert.equal(adoption.kernel.accepted_generation_history.at(-1).status,'CURRENT_ACCEPTED_MAIN');
 assert.match(adoption.kernel.currentness_rule,/cannot downgrade currentness/);
 assert.match(adoption.kernel.acceptance_note,/verifier-compatible compiled dependency-binding receipts/);
 const directory=new URL('../native/hex/adapter/kernel/xiio_installer/',import.meta.url);
 const ownerBlobs=adoption.kernel.files_unchanged_git_blob;
 assert.ok(ownerBlobs && typeof ownerBlobs==='object' && !Array.isArray(ownerBlobs));
 assert.deepEqual(readdirSync(directory).filter(n=>n.endsWith('.py')).sort(),Object.keys(ownerBlobs).sort());
 for(const [name,blobSha]of Object.entries(ownerBlobs)){
  assert.match(name,/^[a-z_]+\\.py$/);
  assert.match(blobSha,/^[0-9a-f]{40}$/);
  const bytes=readFileSync(new URL(name,directory));
  const gitBlob=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\\0')).update(bytes).digest('hex');
  assert.equal(gitBlob,blobSha);

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
test('HEX preserves recursive Cube and shared Sphere graph boundaries',()=>{
 const a=json('native/hex/SOURCE-ADOPTION.json').architecture_boundaries;
 assert.equal(a.relationship_graph.framework_candidate_ref,'Vado42-chris/xi-io.net#1481');
 for(const hard of ['CUBE_GRAPH!=DIRECTORY_TREE','SPHERE_RELATIONSHIP_MANY_TO_MANY','NODE_MATERIALIZES_INTERACTION_NOT_USER_IDENTITY'])assert.ok(a.hard.includes(hard));
 for(const hard of ['CUBE_DOES_NOT_OWN_SPHERE','NESTED_CUBE_MAY_BIND_SAME_SPHERE_AS_ANCESTOR','ONE_SPHERE_MAY_BIND_MANY_CUBES','NODE_IDENTITY!=INSTALL_PATH'])assert.ok(a.relationship_graph.hard.includes(hard));
 assert.match(a.relationship_graph.model,/Cube hierarchy is recursive/);
 assert.match(a.relationship_graph.model,/independent many-to-many graph edges/);
 assert.match(a.relationship_graph.model,/authorized Cube\/Sphere interaction on a qualified runtime/);
});

test('HEX preserves Black Box, Sphere connection and Glass Box seam custody',()=>{
 const a=json('native/hex/SOURCE-ADOPTION.json').architecture_boundaries;
 const seam=a.cube_sphere_seam;
 assert.equal(seam.black_box_custody,'CUBE');
 assert.equal(seam.sphere_connection_custody,'SPHERE_VIA_BINS');
 assert.equal(seam.glass_box_custody,'NODE_SEAM_PROJECTION');
 assert.equal(seam.global_admin,'SHARED_SERVICE_PROJECTED_TO_APPLICABLE_NODES');
 for(const hard of ['BLACK_BOX!=CUSTOMER_SECRET_STORE','BLACK_BOX!=LIVE_WORKER_ASSIGNMENT','SPHERE_CONNECTION!=CUBE_DEFAULT','GLASS_BOX!=SECOND_TRUTH_STORE','CONNECTED_PROVIDER!=AUTHORIZED_EFFECT','ADMIN_WIDGET!=COPIED_ADMIN_DATABASE'])assert.ok(seam.hard.includes(hard));
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
 assert.equal(payload.source_sha,'f2626cae872f191e980ecdfb681485f2d9e67198');
 assert.deepEqual(source.current_packaged_payload.files,payload.files);
 // Candidate package joins six-file legacy SHAs into runtime-integrity — flag must stay true.
 assert.equal(source.current_packaged_payload.local_payload_modifications,true);
 assert.equal(createHash('sha256').update(read(base+'src/xiio.mjs')).digest('hex'),payload.files['src/xiio.mjs'].sha256);
 assert.equal(createHash('sha256').update(read(base+'install.mjs')).digest('hex'),source.offline_installer_successor.sha256);
});

test('current fourteen-file candidate payload and historical repair verifier keep separate exact custody',()=>{
 const base='native/hex/cli-source/',payload=json(base+'packaged-source.json'),repair=json(base+'launcher-repair.SOURCE.json');
 const composed=json('native/hex/COMPOSED-packaged-source.receipt.json');
 assert.equal(payload.source_sha,'f2626cae872f191e980ecdfb681485f2d9e67198');
 assert.equal(composed.production_baseline_sha,'89b9c418f6e161d9864bf891fd665b6a18f00dd2');
 assert.equal(Object.keys(payload.files).length,14);assert.ok(payload.files['src/local-ops.mjs']);assert.ok(payload.files['src/sdk/local-work-packet.mjs']);
 assert.ok(payload.files['src/sdk/local-worker-host.mjs']);assert.ok(payload.files['config/batches/starter-regression-20261031.json']);
 const helper=read(base+'src/runtime-integrity.mjs').split('\n').filter(line=>!line.startsWith('import ')).join('\n').replace(/^export /gm,'').trim();
 const producer=read(base+'install.mjs');const start=producer.indexOf('\n',producer.indexOf('// BEGIN runtime-integrity standalone mirror'));
 const mirror=producer.slice(start,producer.indexOf('// END runtime-integrity standalone mirror')).trim();
 assert.equal(mirror,helper);
 assert.equal(repair.verification_resource.path,'launcher-repair.runtime-integrity.mjs');
 assert.equal(createHash('sha256').update(read(base+repair.verification_resource.path)).digest('hex'),repair.verification_resource.sha256);
 assert.notEqual(repair.verification_resource.sha256,payload.files['src/runtime-integrity.mjs'].sha256);
});

test('native Cube and Sphere semantics stay separate from deployable payload packaging',()=>{
 const adoption=json('native/hex/SOURCE-ADOPTION.json');
 const boundary=adoption.architecture_boundaries;
 assert.ok(boundary);
 assert.equal(boundary.cube_native_model.acceptance,'NATIVE_MATHEMATICAL_ACCEPTANCE_UNVERIFIED');
 assert.equal(boundary.sphere_native_model.acceptance,'NATIVE_MATHEMATICAL_ACCEPTANCE_UNVERIFIED');
 assert.deepEqual(boundary.cube_native_model.authority_refs,[
  'Vado42-chris/xi-io.net#151','Vado42-chris/xi-io.net#1281']);
 assert.match(boundary.payload_delivery.meaning,/packaging is separate from Cube\/Sphere mathematical serialization/);
 assert.ok(boundary.payload_delivery.supported_adapter_families.includes('flatpak'));
 assert.ok(boundary.payload_delivery.supported_adapter_families.includes('oci'));
 assert.ok(boundary.payload_delivery.supported_adapter_families.includes('qcow2'));
 assert.equal(boundary.node_runtime.acceptance,'REAL_NODE_READBACK_REQUIRED');
 assert.ok(boundary.hard.includes('CUBE_NATIVE_FORMAT!=PAYLOAD_PACKAGE'));
 assert.ok(boundary.hard.includes('SPHERE_DATA!=PAYLOAD_FILES'));
 assert.ok(boundary.hard.includes('PAYLOAD_INSTALLED!=NODE_QUALIFIED'));
 assert.ok(boundary.hard.includes('HOST_PROFILE!=PRODUCT_CUBE'));
});

test('recursive Cubes share governed Sphere relationships and only runtime interactions create Nodes',()=>{
 const adoption=json('native/hex/SOURCE-ADOPTION.json');
 const boundary=adoption.architecture_boundaries;
 assert.equal(boundary.cube_native_model.recursive_composition.acceptance,'RECURSIVE_CUBE_GRAPH_CONTRACT');
 assert.match(boundary.cube_native_model.recursive_composition.rule,/child Cubes recursively/);
 assert.equal(boundary.sphere_native_model.cross_cube_scope.acceptance,'CROSS_CUBE_SPHERE_GRAPH_CONTRACT');
 assert.match(boundary.sphere_native_model.cross_cube_scope.rule,/may relate to many top-level and nested Cubes/);
 assert.match(boundary.sphere_native_model.cross_cube_scope.custody,/BINS owns resource identity/);
 assert.equal(boundary.node_runtime.interaction_seam.acceptance,'INTERACTION_NODE_RUNTIME_REQUIRED');
 assert.match(boundary.node_runtime.interaction_seam.rule,/installed\/running and interacts with an authorized Sphere/);
 assert.ok(boundary.node_runtime.interaction_seam.requirements.includes('Ward-authorized effects'));
 assert.ok(boundary.node_runtime.interaction_seam.requirements.some(x=>x.startsWith('BINS-backed user resource custody')));
 assert.ok(boundary.hard.includes('CUBE_CHILD!=NEW_USER_SPHERE'));
 assert.ok(boundary.hard.includes('ONE_SPHERE_MAY_RELATE_TO_MANY_CUBES'));
 assert.ok(boundary.hard.includes('DIRECTORY_EDGE!=RUNNING_NODE'));
 assert.ok(boundary.hard.includes('BINS_CUSTODY!=SPHERE_RELATIONSHIP'));
});

test('Cube Black Box and Sphere connection state meet only through governed Glass Box projections',()=>{
 const b=json('native/hex/SOURCE-ADOPTION.json').architecture_boundaries;
 assert.equal(b.cube_native_model.black_box.acceptance,'CUBE_BLACK_BOX_CAPABILITY_PACKAGE');
 assert.match(b.cube_native_model.black_box.rule,/scripts, skills, regression and acceptance tests/);
 assert.match(b.cube_native_model.black_box.rule,/never customer credentials or implicit effect authority/);
 assert.equal(b.sphere_native_model.customer_connections.acceptance,'SPHERE_CUSTOMER_CONNECTION_GRAPH');
 assert.match(b.sphere_native_model.customer_connections.rule,/billing\/provisioning relationship and BINS resource references/);
 assert.equal(b.relationship_graph.glass_box.hard.includes('CAPABILITY_VISIBLE!=PROVIDER_CONNECTED'),true);
 assert.equal(b.relationship_graph.glass_box.hard.includes('PROVIDER_CONNECTED!=EFFECT_AUTHORIZED'),true);
 assert.equal(b.relationship_graph.global_admin_projection.acceptance,'GLOBAL_ADMIN_WIDGET_CONSUMPTION_REQUIRED');
 assert.match(b.relationship_graph.global_admin_projection.rule,/projected as reusable widgets\/surfaces into every applicable product Cube/);
 assert.ok(b.relationship_graph.global_admin_projection.requirements.includes('billing consent and spending limits precede paid effects'));
 assert.ok(b.hard.includes('BLACK_BOX_CAPABILITY!=SPHERE_SECRET'));
 assert.ok(b.hard.includes('AGENT_ASSIGNMENT_REF!=ACTIVE_WORKER_AUTHORITY'));
 assert.ok(b.hard.includes('GLOBAL_ADMIN_WIDGET!=PRODUCT_FORK'));
 assert.ok(b.hard.includes('CONNECTED_ACCOUNT!=EFFECT_AUTHORITY'));
 assert.match(b.cube_native_model.black_box.rule,/stable agent\/role assignment references/);
});
