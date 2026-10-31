#!/usr/bin/env node
/* xi-io-cli Version 1 installer: one path for Linux, macOS and Windows.
 *
 *   gh release download <tag> -R Vado42-chris/xi-io-cli -p install.mjs
 *   node install.mjs --ref <tag>
 *
 * Needs Node 22+ and a signed-in GitHub CLI (`gh auth login`); the repo is private.
 * The ref is resolved to one exact commit and every file is fetched at that commit.
 * Each install is a new generation under <prefix>/versions/. Older generations are
 * never deleted. <prefix>/current and <prefix>/previous are plain text pointers,
 * so `xi-io-cli rollback` swaps them on every operating system.
 * An existing `xi-io-cli` launcher this installer did not write is left alone. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
// BEGIN runtime-integrity standalone mirror (byte-parity tested; keeps the installer one file)
// Same-host installation guards. Neither identity admission nor a remote lease.

const PAYLOAD_FILES=Object.freeze(['src/xiio.mjs','src/file-edit-cas.mjs','src/local-ops.mjs','src/sdk-provider-state.mjs','src/sdk/audhd-command.mjs','src/sdk/tool-verb-fidelity.mjs','src/sdk/local-work-packet.mjs','src/runtime-integrity.mjs','config/service-catalog.json','scripts/service-inventory.mjs','scripts/reconcile-service-inventory.mjs']);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Preserve selected runtime lookup, home and explicit transport/auth configuration;
// never inherit interpreter preloads, dynamic loader hooks or Git config injection.
function controlledChildEnv(source=process.env,extra={}){
  const allowed=new Set(['PATH','PATHEXT','HOME','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','LANG','LC_ALL','TERM','USER','LOGNAME','GH_TOKEN','GITHUB_TOKEN','GH_HOST','GH_CONFIG_DIR','SSH_AUTH_SOCK','XDG_RUNTIME_DIR','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME','DBUS_SESSION_BUS_ADDRESS','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS','XIIO_CONFIG_DIR','XIIO_SERVICE_CATALOG','XIIO_SANDBOX','XIIO_TEST_PLATFORM']);
  return Object.fromEntries(Object.entries({...source,...extra}).filter(([key,value])=>allowed.has(key.toUpperCase())&&typeof value==='string'));
}
function firstLauncher(name,env=process.env,cwd=process.cwd()){
  if(typeof env.PATH!=='string')return null;
  const extensions=process.platform==='win32'?String(env.PATHEXT||'.COM;.EXE;.BAT;.CMD').split(';').filter(x=>/^\.(COM|EXE|BAT|CMD)$/i.test(x)):[''];
  for(const dir of String(env.PATH||'').split(path.delimiter))for(const ext of extensions){
    const candidate=path.resolve(cwd,dir.replace(/^"|"$/g,''),name+ext.toLowerCase());
    try{if(!fs.statSync(candidate).isFile())continue;fs.accessSync(candidate,process.platform==='win32'?fs.constants.F_OK:fs.constants.X_OK);return fs.realpathSync(candidate);}catch{}
  }
  return null;
}
// The original two-file installer (Git blob 3c9c52335e1b88d104b04823c298e1bf6d0ed1c6)
// produced suffixless names. Only these recovered exact releases are supported;
// this is not permission to accept arbitrary old receipts or missing helpers.
const SUPPORTED_LEGACY_RELEASES=Object.freeze({
  '385c85d53f99ac2f9e6c4fecb6d3c76ee772590d':Object.freeze({
    'src/xiio.mjs':'e8ba5b3c6fe6446076da8c7671de7719edc06a854e797ba8d4740f291f75259f',
    'config/service-catalog.json':'8f9c4c8efb77c36242a81fdcf8c821e05a2ce253d320c34ce27f4b67b2a19a88'
  }),
  '16d0fb4101d0674f8bd57858ac04d7fabf02aed2':Object.freeze({
    'src/xiio.mjs':'23b55b2524302f8d46958889b4735e37f2b04ec4b994b546c7eb38a87ba6e53b',
    'config/service-catalog.json':'8f9c4c8efb77c36242a81fdcf8c821e05a2ce253d320c34ce27f4b67b2a19a88'
  })
});
const legacyGenerationName=value=>typeof value==='string'&&/^[0-9a-f]{12}-\d{8}T\d{6}Z$/.test(value);
const generationName=value=>typeof value==='string'&&(
  /^[0-9a-f]{12}-\d{8}T\d{6}Z-[A-Za-z0-9_-]+$/.test(value)||
  legacyGenerationName(value)&&Object.keys(SUPPORTED_LEGACY_RELEASES).some(sha=>value.startsWith(sha.slice(0,12)+'-'))
);
function regular(file){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('INSTALL_FILE_CUSTODY_INVALID');return st;}
function verifyGeneration(prefix,generation){
  if(!generationName(generation))throw Error('GENERATION_NAME_INVALID');
  const versions=path.join(prefix,'versions'),root=path.join(versions,generation);
  for(const directory of [versions,root]){const st=fs.lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink())throw Error('GENERATION_DIRECTORY_INVALID');}
  regular(path.join(root,'install-receipt.json'));
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'install-receipt.json'),'utf8'));
  if(receipt.schema!=='xiio.cli.install-receipt/v2'||receipt.generation!==generation||path.resolve(receipt.prefix||'')!==path.resolve(prefix)||!(/^[0-9a-f]{40}$/).test(receipt.source_sha)||!generation.startsWith(receipt.source_sha.slice(0,12)+'-'))throw Error('GENERATION_RECEIPT_INVALID');
  if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(String(receipt.node||''))||Number(process.versions.node.split('.')[0])<22||Number(receipt.node.split('.')[0])<22||receipt.platform!==process.platform)throw Error('GENERATION_RUNTIME_INCOMPATIBLE');
  const listed=Object.keys(receipt.files||{});
  if(legacyGenerationName(generation)){
    const expected=SUPPORTED_LEGACY_RELEASES[receipt.source_sha];
    if(!expected||receipt.repo!=='Vado42-chris/xi-io-cli'||receipt.ref!==receipt.source_sha)throw Error('LEGACY_RELEASE_UNSUPPORTED');
    if(listed.length!==Object.keys(expected).length||listed.some(file=>!Object.hasOwn(expected,file)||receipt.files[file]!==expected[file]))throw Error('LEGACY_RELEASE_PAYLOAD_MISMATCH');
  }else{
    const required=PAYLOAD_FILES.filter(file=>!['src/runtime-integrity.mjs','src/local-ops.mjs','src/sdk-provider-state.mjs','src/sdk/audhd-command.mjs','src/sdk/tool-verb-fidelity.mjs','src/sdk/local-work-packet.mjs'].includes(file));
    if(required.some(file=>!listed.includes(file))||listed.some(file=>!PAYLOAD_FILES.includes(file)))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './runtime-integrity.mjs'")&&!listed.includes('src/runtime-integrity.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './local-ops.mjs'")&&!listed.includes('src/local-ops.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './sdk-provider-state.mjs'")&&!listed.includes('src/sdk-provider-state.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './sdk/audhd-command.mjs'")&&!listed.includes('src/sdk/audhd-command.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './sdk/tool-verb-fidelity.mjs'")&&!listed.includes('src/sdk/tool-verb-fidelity.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    if(fs.readFileSync(path.join(root,'src/xiio.mjs'),'utf8').includes("from './sdk/local-work-packet.mjs'")&&!listed.includes('src/sdk/local-work-packet.mjs'))throw Error('GENERATION_RECEIPT_FILE_MISSING');
  }
  for(const relative of listed){
    const file=path.join(root,...relative.split('/'));
    if(!/^[0-9a-f]{64}$/.test(receipt.files?.[relative]||''))throw Error('GENERATION_RECEIPT_FILE_MISSING');
    regular(file);
    if(!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep))throw Error('GENERATION_FILE_OUTSIDE_ROOT');
    if(digest(fs.readFileSync(file))!==receipt.files[relative])throw Error('GENERATION_DIGEST_MISMATCH');
  }
  return receipt;
}
function readGenerationPointer(prefix,name){
  if(!['current','previous'].includes(name))throw Error('POINTER_NAME_INVALID');
  const file=path.join(prefix,name);
  try{regular(file);const value=fs.readFileSync(file,'utf8').trim();if(!generationName(value))throw Error('GENERATION_NAME_INVALID');return value;}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
const journalPath=prefix=>path.join(prefix,'.pointer-transaction.json');
const lockPath=prefix=>path.join(prefix,'.pointer-transaction.lock');
const pointerTransactionPending=prefix=>fs.existsSync(journalPath(prefix))||fs.existsSync(lockPath(prefix))||fs.existsSync(path.join(prefix,'.pointer-recovery.lock'));
function atomicPointer(prefix,name,value){
  if(value!==null&&!generationName(value))throw Error('GENERATION_NAME_INVALID');
  const file=path.join(prefix,name);if(value===null){fs.rmSync(file,{force:true});return;}
  const temp=file+'.tmp-'+process.pid+'-'+crypto.randomBytes(6).toString('hex');
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,value+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}
}
function pair(prefix){return{current:readGenerationPointer(prefix,'current'),previous:readGenerationPointer(prefix,'previous')};}
function verifyPair(prefix,value){for(const name of ['current','previous'])if(value[name]!==null)verifyGeneration(prefix,value[name]);}
function writePair(prefix,value){atomicPointer(prefix,'previous',value.previous);atomicPointer(prefix,'current',value.current);if(JSON.stringify(pair(prefix))!==JSON.stringify(value))throw Error('POINTER_READBACK_MISMATCH');}
function commitGenerationPointers(prefix,next,expected){
  const lock=lockPath(prefix),journal=journalPath(prefix);let fd=null;
  if(pointerTransactionPending(prefix))throw Error('POINTER_TRANSACTION_PENDING');
  try{
    try{fd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('POINTER_TRANSACTION_PENDING');throw error;}
    fs.writeFileSync(fd,JSON.stringify({host:os.hostname(),pid:process.pid}));fs.fsyncSync(fd);
    if(fs.existsSync(journal)||fs.existsSync(path.join(prefix,'.pointer-recovery.lock')))throw Error('POINTER_RECOVERY_REQUIRED');
    const before=pair(prefix);
    if(JSON.stringify(before)!==JSON.stringify(expected))throw Error('POINTER_CHANGED_SINCE_APPROVAL');
    verifyPair(prefix,next);
    const jf=fs.openSync(journal,'wx',0o600);
    try{fs.writeFileSync(jf,JSON.stringify({schema:'xiio.cli.pointer-transaction/v1',before,after:next}));fs.fsyncSync(jf);}finally{fs.closeSync(jf);}
    try{writePair(prefix,next);fs.unlinkSync(journal);}catch(error){
      try{writePair(prefix,before);fs.unlinkSync(journal);}catch{throw Error('POINTER_RECOVERY_REQUIRED');}
      throw error;
    }
    return {state:'POINTERS_COMMITTED',readback:pair(prefix)};
  }finally{if(fd!==null){fs.closeSync(fd);if(!fs.existsSync(journal))fs.rmSync(lock,{force:true});}}
}
// Explicit recovery only. A live or foreign owner is never evicted. The journal
// makes an interrupted two-file update visible; it is not an atomic filesystem pair.
function recoverGenerationPointers(prefix){
  const recovery=path.join(prefix,'.pointer-recovery.lock');let fd=null;
  try{
    try{fd=fs.openSync(recovery,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('POINTER_RECOVERY_LOCK_HELD_MANUAL_REVIEW_REQUIRED');throw error;}
    fs.writeFileSync(fd,JSON.stringify({host:os.hostname(),pid:process.pid}));fs.fsyncSync(fd);
    const lock=lockPath(prefix),journal=journalPath(prefix);
    regular(lock);const owner=JSON.parse(fs.readFileSync(lock,'utf8'));
    if(owner.host!==os.hostname()||!Number.isSafeInteger(owner.pid)||owner.pid<1)throw Error('POINTER_RECOVERY_OWNER_UNVERIFIED');
    try{process.kill(owner.pid,0);throw Error('POINTER_TRANSACTION_OWNER_ACTIVE');}catch(error){if(error.code!=='ESRCH')throw error;}
    if(!fs.existsSync(journal)){
      // No journal means no pointer mutation began, or a verified commit already
      // finished. Validate the complete current pair before clearing its dead lock.
      const observed=pair(prefix);verifyPair(prefix,observed);fs.unlinkSync(lock);
      return{state:'RECOVERED',readback:observed,reason:'DEAD_OWNER_COMPLETE_PAIR_VERIFIED'};
    }
    regular(journal);const entry=JSON.parse(fs.readFileSync(journal,'utf8'));
    if(entry.schema!=='xiio.cli.pointer-transaction/v1'||!entry.before||!Object.hasOwn(entry.before,'current')||!Object.hasOwn(entry.before,'previous'))throw Error('POINTER_RECOVERY_JOURNAL_INVALID');
    const before={current:entry.before.current,previous:entry.before.previous};verifyPair(prefix,before);writePair(prefix,before);
    fs.unlinkSync(journal);fs.unlinkSync(lock);return{state:'RECOVERED',readback:pair(prefix)};
  }finally{if(fd!==null){fs.closeSync(fd);fs.rmSync(recovery,{force:true});}}
}
// END runtime-integrity standalone mirror

const FILES = PAYLOAD_FILES;
const win = process.platform === 'win32';
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const REPO = arg('--repo', process.env.XIIO_CLI_REPO || 'Vado42-chris/xi-io-cli');
const REF = arg('--ref', process.env.XIIO_CLI_REF || null);
const base = win ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')) : path.join(os.homedir(), '.local', 'share');
const PREFIX = path.resolve(arg('--prefix', process.env.XIIO_CLI_V1_PREFIX || path.join(base, 'xi-io', 'cli-v1')));
const BIN_DIR = path.resolve(arg('--bin-dir', process.env.XIIO_CLI_BIN_DIR || (win ? path.join(base, 'xi-io', 'bin') : path.join(os.homedir(), '.local', 'bin'))));
const GH = process.env.XIIO_GH || 'gh';
// Local review candidate: transport only; generation/launcher/pointers stay owned below.
const PACKAGED_ROOT = arg('--packaged-source', null);
let packaged = null, packagedBytes = null;
if(PACKAGED_ROOT){
  const root=fs.realpathSync(PACKAGED_ROOT);
  if(root!==path.resolve(PACKAGED_ROOT))throw Error('PACKAGED_ROOT_SYMLINK');
  regular(path.join(root,'packaged-source.json'));
  packaged=JSON.parse(fs.readFileSync(path.join(root,'packaged-source.json'),'utf8'));
  if(packaged.schema!=='xiio.cli.packaged-source/v1'||packaged.source_sha!==REF||!Object.keys(packaged.files||{}).every(f=>FILES.includes(f))||Object.keys(packaged.files||{}).length!==FILES.length)throw Error('PACKAGED_MANIFEST_INVALID');
  packagedBytes={};
  for(const f of FILES){
    const file=path.join(root,f);regular(file);
    if(fs.realpathSync(file)!==file)throw Error('PACKAGED_PATH_SYMLINK');
    const bytes=fs.readFileSync(file), expected=packaged.files[f];
    if(bytes.length!==expected.size||digest(bytes)!==expected.sha256)throw Error('PACKAGED_PAYLOAD_CHANGED');
    packagedBytes[f]=bytes;
  }
}

const VALIDATED_NODE_BINARY = fs.realpathSync(process.execPath);
const ADOPT_EXISTING_LAUNCHER = process.argv.includes('--adopt-existing-launcher');
const EXPECTED_LAUNCHER_SHA = arg('--expect-launcher-sha256', null);


function fail(red, extra = {}) { console.log(JSON.stringify({ schema: 'xiio.cli.install/v1', state: 'FAIL', first_red: red, ...extra }, null, 2)); process.exit(2); }
function gh(args) {
  const r = spawnSync(GH, args, { maxBuffer: 64 * 1024 * 1024, timeout: 120000, env: controlledChildEnv() });
  if (r.error) fail('GH_NOT_RUNNABLE', { detail: r.error.message, fix: 'Install the GitHub CLI and run: gh auth login' });
  if (r.status !== 0) fail('GH_REQUEST_FAILED', { args: args.slice(0, 2), stderr: String(r.stderr).trim().slice(0, 300) });
  return r.stdout;
}
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) fail('NODE_TOO_OLD', { node: process.versions.node, need: '22 or newer' });
if (!REF) fail('REF_REQUIRED', { fix: 'node install.mjs --ref <release tag or commit>' });

// Read existing history BEFORE acquisition, staging, or launcher effects. A
// receipt is checked against its supported payload contract, never upgraded by
// rewriting it. Unknown/changed history requires review, not a partial install.
let preflightPair;
try {
  if(pointerTransactionPending(PREFIX))throw Error('POINTER_RECOVERY_REQUIRED');
  preflightPair=pair(PREFIX);
  verifyPair(PREFIX,preflightPair);
} catch (error) {
  fail('EXISTING_GENERATION_PREFLIGHT_FAILED',{cause:String(error?.message||error),modified:false});
}

// 1. Resolve the ref to one exact commit.
const sha = packaged ? packaged.source_sha : String(gh(['api', `repos/${REPO}/commits/${encodeURIComponent(REF)}`, '--jq', '.sha'])).trim();
if (!/^[0-9a-f]{40}$/.test(sha)) fail('REF_NOT_RESOLVED', { ref: REF, got: sha.slice(0, 80) });

// 2. Stage a new generation; never touch an existing one.
const versions = path.join(PREFIX, 'versions');
fs.mkdirSync(versions, { recursive: true });
// Atomic unique generation allocation: repeated attempts at the SAME exact
// SHA in the same second must never collide or overwrite prior source bytes.
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + 'Z';
const dir = fs.mkdtempSync(path.join(versions, sha.slice(0, 12) + '-' + stamp + '-'));
const generation = path.basename(dir);
const hashes = {};
// Only newly created files in this fresh generation acquire these permissions.
// An ambient group-writable umask must not make the installed catalog fail the
// existing Ward/Switchboard custody check. Never chmod a historical generation.
function writeNewGenerationFile(filename, bytes) {
  const fd = fs.openSync(filename, 'wx', 0o600);
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}
for (const f of FILES) {
  const bytes = packagedBytes ? packagedBytes[f] : gh(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${REPO}/contents/${f}?ref=${sha}`]);
  if (!bytes.length) fail('FETCH_EMPTY', { file: f });
  const out = path.join(dir, ...f.split('/'));
  fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
  writeNewGenerationFile(out, bytes);
  hashes[f] = sha256(bytes);
}
writeNewGenerationFile(path.join(dir, 'install-receipt.json'), JSON.stringify({
  schema: 'xiio.cli.install-receipt/v2', installed_at: new Date().toISOString(), repo: REPO, ref: REF, source_sha: sha,
  generation, prefix: PREFIX, platform: process.platform, node: process.versions.node, files: hashes, models_installed: 0,
}, null, 2) + '\n');

// 3. Verify the staged generation before it becomes current. The smoke test
//    uses a throwaway config dir so it cannot change the person's settings.
const entry = path.join(dir, 'src', 'xiio.mjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-install-check-'));
const env = controlledChildEnv(process.env,{XIIO_CONFIG_DIR:scratch});
const check = spawnSync(process.execPath, ['--check', entry], { encoding: 'utf8', env });
if (check.status !== 0) fail('CLI_SYNTAX_FAILED', { generation, stderr: check.stderr.slice(0, 300) });
for (const file of FILES.filter(f => f.startsWith('scripts/') && f.endsWith('.mjs'))) {
  const syntax=spawnSync(process.execPath,['--check',path.join(dir,...file.split('/'))],
    {encoding:'utf8',timeout:30000,env});
  if (syntax.status!==0) fail('CLI_COMPANION_SYNTAX_FAILED',{file,generation,stderr:String(syntax.stderr||'').slice(0,300)});
}
const v = spawnSync(process.execPath, [entry, 'version', '--staged'], { encoding: 'utf8', env, cwd: dir, timeout: 30000 });
let ver; try { ver = JSON.parse(v.stdout); } catch { fail('CLI_VERSION_FAILED', { generation, stderr: String(v.stderr).slice(0, 300) }); }
if (v.status !== 0 || !ver.integrity_verified || !['STAGED','PASS'].includes(ver.state) || ver.source_sha !== sha || ver.running_file_sha256 !== hashes['src/xiio.mjs']) fail('INSTALLED_GENERATION_MISMATCH', { expected: sha, reported: ver.source_sha, file_sha256: ver.running_file_sha256 });
const menu = spawnSync(process.execPath, [entry, dir], { input: '/exit\n', encoding: 'utf8', env, cwd: dir, timeout: 30000 });
if (menu.status !== 0) fail('CLI_INTERACTIVE_EXIT_FAILED', { generation, stdout: String(menu.stdout).slice(-300) });
fs.rmSync(scratch, { recursive: true, force: true });

// Recheck the approved existing history after staging and before launcher work.
try {
  if(pointerTransactionPending(PREFIX))throw Error('POINTER_RECOVERY_REQUIRED');
  if(JSON.stringify(pair(PREFIX))!==JSON.stringify(preflightPair))throw Error('POINTER_CHANGED_SINCE_PREFLIGHT');
  verifyPair(PREFIX,preflightPair);
} catch (error) {
  fail('EXISTING_GENERATION_CHANGED',{cause:String(error?.message||error),generation_staged:generation});
}

// 4. Launcher: written once, recognized byte for byte afterwards.
fs.mkdirSync(BIN_DIR, { recursive: true });
const launcherPath = path.join(BIN_DIR, win ? 'xi-io-cli.cmd' : 'xi-io-cli');
const shq = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
const launcher = win
  ? `@echo off\r\nrem xi-io-cli launcher written by install.mjs; the generation is chosen by current\r\nsetlocal\r\nset /p XIIO_GEN=<"${PREFIX}\\current"\r\n"${VALIDATED_NODE_BINARY}" "${PREFIX}\\versions\\%XIIO_GEN%\\src\\xiio.mjs" %*\r\n`
  : `#!/bin/sh\n# xi-io-cli launcher written by install.mjs; the generation is chosen by current\nP=${shq(PREFIX)}\nexec ${shq(VALIDATED_NODE_BINARY)} "$P/versions/$(cat "$P/current")/src/xiio.mjs" "$@"\n`;
// An explicitly approved migration may adopt a different launcher only when
// its COMPLETE bytes are pinned by the operator. No silent overwrite or
// symlink traversal. The old bytes stay available for manual rollback.
let launcherStat=null, existing=null;
try {
  launcherStat=fs.lstatSync(launcherPath);
  if (!launcherStat.isFile() || launcherStat.isSymbolicLink()) fail('LAUNCHER_NOT_REGULAR_FILE', {path:launcherPath});
  existing=fs.readFileSync(launcherPath);
} catch (e) {
  if (e?.code !== 'ENOENT') { if (e?.message?.includes('LAUNCHER_NOT_REGULAR_FILE')) throw e; fail('LAUNCHER_READ_FAILED', {path:launcherPath}); }
}
const launcherBytes=Buffer.from(launcher,'utf8');
const migrating=existing!==null && !existing.equals(launcherBytes);
let backupPath=null;
if (migrating) {
  if (!ADOPT_EXISTING_LAUNCHER) {
    fail('LAUNCHER_OWNERSHIP_CONFLICT', {path:launcherPath,generation_staged:generation,
      existing_sha256:sha256(existing),
      fix:'Explicitly authorize launcher adoption with --adopt-existing-launcher --expect-launcher-sha256 <sha256> once the old launcher has been reviewed.',
      note:'This installer never silently replaces a preexisting launcher.'});
  }
  if (win) fail('LAUNCHER_ADOPTION_WINDOWS_NOT_QUALIFIED');
  if (!/^[a-f0-9]{64}$/.test(String(EXPECTED_LAUNCHER_SHA||'')) || sha256(existing)!==EXPECTED_LAUNCHER_SHA) {
    fail('LAUNCHER_ADOPTION_SHA256_MISMATCH', {path:launcherPath,observed_sha256:sha256(existing)});
  }
  if (existing.length>8192 || (typeof process.getuid==='function' && launcherStat.uid!==process.getuid())
      || (launcherStat.mode & 0o022)!==0) fail('LAUNCHER_ADOPTION_UNTRUSTED_FILE', {path:launcherPath});
  const parent=fs.lstatSync(BIN_DIR);
  if (!parent.isDirectory() || parent.isSymbolicLink()
      || (typeof process.getuid==='function' && parent.uid!==process.getuid())
      || (parent.mode & 0o002)!==0) fail('LAUNCHER_ADOPTION_UNTRUSTED_DIRECTORY', {path:BIN_DIR});
  backupPath=launcherPath+'.pre-v1-'+EXPECTED_LAUNCHER_SHA.slice(0,12);
  if (fs.existsSync(backupPath)) {
    const back=fs.lstatSync(backupPath);
    if (!back.isFile() || back.isSymbolicLink() || !fs.readFileSync(backupPath).equals(existing))
      fail('LAUNCHER_BACKUP_CONFLICT', {path:backupPath});
  } else {
    const fd=fs.openSync(backupPath,'wx',0o600);
    try { fs.writeFileSync(fd,existing); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (!fs.readFileSync(backupPath).equals(existing)) fail('LAUNCHER_BACKUP_READBACK_FAILED',{path:backupPath});
  }
}

// Commit the verified source generation and atomically replace the launcher.
// If a late write fails, restore both generation pointers and the old launcher.
const read = n => readGenerationPointer(PREFIX,n);
if(pointerTransactionPending(PREFIX))fail('POINTER_RECOVERY_REQUIRED',{fix:'Run the installed CLI rollback --recover before retrying installation.'});
const before=preflightPair.current,oldPrevious=preflightPair.previous;
let swapped=false,created=false;
try {
  // Prepare the launcher first; only then publish the verified generation pair.
  if (migrating) {
    // Re-check immediately before the rename; a concurrent hand edit blocks.
    const latest=fs.lstatSync(launcherPath);
    if (!latest.isFile()||latest.isSymbolicLink()||!fs.readFileSync(launcherPath).equals(existing))
      throw Error('LAUNCHER_CONCURRENT_CHANGE');
    const temporary=launcherPath+'.next-'+process.pid;
    fs.writeFileSync(temporary,launcherBytes,{mode:0o755,flag:'wx'});
    try {
      if (!fs.readFileSync(temporary).equals(launcherBytes)) throw Error('NEW_LAUNCHER_READBACK_MISMATCH');
      fs.renameSync(temporary,launcherPath);swapped=true;
    } finally {try{fs.rmSync(temporary,{force:true});}catch{}}
  } else if (existing===null) {
    fs.writeFileSync(launcherPath,launcherBytes,{mode:0o755,flag:'wx'});created=true;
  }
  commitGenerationPointers(PREFIX,{current:generation,previous:before},{current:before,previous:oldPrevious});
  if (!fs.readFileSync(launcherPath).equals(launcherBytes) || read('current')!==generation)
    throw Error('LAUNCHER_OR_POINTER_READBACK_MISMATCH');
} catch (e) {
  let rollbackOk=true;
  try {
    if (swapped) {
      const temp=launcherPath+'.restore-'+process.pid;
      fs.writeFileSync(temp,existing,{mode:0o700,flag:'wx'});fs.renameSync(temp,launcherPath);
    } else if (created) fs.rmSync(launcherPath,{force:true});
    if(!pointerTransactionPending(PREFIX)&&read('current')===generation)
      commitGenerationPointers(PREFIX,{current:before,previous:oldPrevious},{current:generation,previous:before});
    if(pointerTransactionPending(PREFIX))rollbackOk=false;
  } catch {rollbackOk=false;}
  fail('CLI_INSTALL_COMMIT_FAILED',{cause:String(e?.message||e).slice(0,100),rollback_state:rollbackOk?'RESTORED':'NEEDS_MANUAL_RECOVERY',legacy_backup:backupPath});
}
const resolvedLauncher=firstLauncher('xi-io-cli');
const onPath=!win&&resolvedLauncher!==null&&resolvedLauncher===fs.realpathSync(launcherPath)&&sha256(fs.readFileSync(resolvedLauncher))===sha256(launcherBytes);
const pathState=win?'WINDOWS_INVOCATION_UNQUALIFIED':onPath?'PASS':resolvedLauncher?'PATH_SHADOWED':'NEEDS_PATH';
console.log(JSON.stringify({
  schema: 'xiio.cli.install/v1', state: 'PASS', source_sha: sha, ref: REF, generation, previous: before, prefix: PREFIX,
  launcher: launcherPath, adopted_existing_launcher:migrating, preserved_launcher_backup:backupPath, path_state:pathState,resolved_launcher:resolvedLauncher,invocation_verified:onPath,launcher_sha256:sha256(launcherBytes),
  add_to_path: onPath ? null : (win ? `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';${BIN_DIR}', 'User')"  (then open a new terminal)` : `export PATH="${BIN_DIR}:$PATH"`),
  next: ['xi-io-cli version', 'xi-io-cli', 'xi-io-cli rollback'],
}, null, 2));


