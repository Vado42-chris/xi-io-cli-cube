// Fixed HEX disposable proof; reuses the installed CLI CAS guard. No shell or AI.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const BEFORE=Buffer.from('HEX disposable local file proof\n');
const AFTER=Buffer.from('HEX disposable local file proof\nCAS readback verified\n');
function safe(p){if(!path.isAbsolute(p)||path.resolve(p)!==p)throw Error('UNSAFE_PATH');for(let q=p;;q=path.dirname(q)){if(fs.lstatSync(q).isSymbolicLink())throw Error('SYMLINK_PATH_REFUSED');if(q===path.dirname(q))break;}}
export async function runSafeTask({workspace,directory,workspace_dev,workspace_ino,cas_module,cas_sha256}){
 safe(workspace);safe(cas_module);
 const w=fs.lstatSync(workspace);
 if(!w.isDirectory()||w.dev!==workspace_dev||w.ino!==workspace_ino)throw Error('WORKSPACE_CHANGED');
 if(path.dirname(directory)!==workspace||!/^\.xiio-proof-[0-9a-f]{32}$/.test(path.basename(directory)))throw Error('PROOF_DIRECTORY_INVALID');
 if(sha(fs.readFileSync(cas_module))!==cas_sha256)throw Error('CAS_SOURCE_CHANGED');
 const recheckWorkspace=()=>{safe(workspace);const current=fs.lstatSync(workspace);if(!current.isDirectory()||current.dev!==w.dev||current.ino!==w.ino)throw Error('WORKSPACE_CHANGED');};
 const {commitWorkspaceEditCAS}=await import(pathToFileURL(cas_module).href);
 recheckWorkspace();
 fs.mkdirSync(directory,{mode:0o700}); // Never reuse a preexisting directory.
 const dirIdentity=fs.lstatSync(directory);const file=path.join(directory,'proof.txt');
 fs.writeFileSync(file,BEFORE,{flag:'wx',mode:0o600});
 const created=fs.readFileSync(file);if(!created.equals(BEFORE))throw Error('CREATE_READBACK_MISMATCH');
 recheckWorkspace();safe(directory);
 const currentDir=fs.lstatSync(directory);if(currentDir.dev!==dirIdentity.dev||currentDir.ino!==dirIdentity.ino)throw Error('PROOF_DIRECTORY_CHANGED');
 const receipt=commitWorkspaceEditCAS({file,expectedBytes:BEFORE,nextBytes:AFTER,expectedSha256:sha(BEFORE)});
 const afterIdentity=fs.lstatSync(file);const actual=fs.readFileSync(file);
 if(!actual.equals(AFTER)||!receipt.readback_matches)throw Error('CAS_READBACK_MISMATCH');
 let staleRefused=false;
 try{commitWorkspaceEditCAS({file,expectedBytes:BEFORE,nextBytes:BEFORE,expectedSha256:sha(BEFORE)});}catch(e){if(e.message==='FILE_CHANGED_SINCE_APPROVAL')staleRefused=true;else throw e;}
 if(!staleRefused)throw Error('STALE_EDIT_NOT_REFUSED');
 safe(workspace);safe(directory);safe(file);
 const now=fs.lstatSync(file),d=fs.lstatSync(directory),parent=fs.lstatSync(workspace);
 if(parent.dev!==w.dev||parent.ino!==w.ino||d.dev!==dirIdentity.dev||d.ino!==dirIdentity.ino||now.dev!==afterIdentity.dev||now.ino!==afterIdentity.ino||now.nlink!==1||!now.isFile()||!fs.readFileSync(file).equals(AFTER)||fs.readdirSync(directory).join()!=='proof.txt')throw Error('CLEANUP_IDENTITY_OR_DIGEST_CHANGED_LEAVE_FIXTURE');
 fs.unlinkSync(file);fs.rmdirSync(directory);
 if(fs.existsSync(directory))throw Error('CLEANUP_READBACK_FAILED');
 return {state:'LOCAL_DISPOSABLE_PROOF_VERIFIED',concurrency_scope:'SAME_HOST_COOPERATIVE_ONLY',created_readback_sha256:sha(created),cas:receipt,stale_edit_refused:true,cleanup_verified:true,fixture:directory,commands_executed:false,remote_execution_qualified:false,bins_version_qualified:false,ward_authority_granted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==2)throw Error('ARGUMENTS_NOT_SUPPORTED');
 let raw='';for await(const part of process.stdin){raw+=part;if(raw.length>16384)throw Error('REQUEST_TOO_LARGE');}
 try{process.stdout.write(JSON.stringify(await runSafeTask(JSON.parse(raw)))+'\n');}catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=3;}
}
