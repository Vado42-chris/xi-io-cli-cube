/**
 * ILLUSTRATIVE SIMULATIONS ONLY — retained from synchronized main 991513e2.
 * These examples construct their own files/checks. They do NOT import or run
 * install.mjs, xi-io-cli, a launcher, or an editor, and cannot qualify any of them.
 * The final example additionally checks that the actual Cube parser rejects
 * the invented rollback-manifest schema rather than treating it as authority.
 */
import {parseRollbackFiles} from '../src/lib/rollbackHistory.mjs';
import {compareVersionReport} from '../src/version-readback.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

// Pinned historical reference
const PINNED_SHA = '54509965c9d91ab02febcc8e49755e2b072a0ca9';
const REPAIRED_SHA = '5b2d807561f0d8d15d3a85aa59df6182a6d4eb87';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

test('simulation only: writes a synthetic wrapper and noncanonical receipt', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-clean-install-'));
  try {
    const binDir = path.join(tmpDir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    // Simulate install.mjs output
    const receiptPath = path.join(tmpDir, 'install-receipt.json');
    const receipt = {
      installed_at: new Date().toISOString(),
      source_sha: PINNED_SHA,
      node_path: process.execPath,
      platform: 'linux-x64',
      status: 'INSTALLED'
    };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');

    const wrapperPath = path.join(binDir, 'xi-io-cli');
    fs.writeFileSync(wrapperPath, `#!/bin/sh\n"${process.execPath}" -e "console.log(JSON.stringify({source_sha:'${PINNED_SHA}'}))"\n`, { mode: 0o755 });

    assert.ok(fs.existsSync(wrapperPath), 'Wrapper binary created');
    assert.ok(fs.existsSync(receiptPath), 'Receipt created');

    const readReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert.equal(readReceipt.source_sha, PINNED_SHA);
    assert.equal(readReceipt.node_path, process.execPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('simulation only: copies synthetic generation strings and restores a backup', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-upgrade-'));
  try {
    const binDir = path.join(tmpDir, 'bin');
    const backupDir = path.join(tmpDir, 'backup');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });

    // Initial version (PINNED_SHA)
    const wrapperPath = path.join(binDir, 'xi-io-cli');
    fs.writeFileSync(wrapperPath, `GENERATION_${PINNED_SHA}`, 'utf8');

    // Upgrade operation: move previous to backup before writing new
    const previousBackup = path.join(backupDir, 'xi-io-cli.previous');
    fs.copyFileSync(wrapperPath, previousBackup);
    fs.writeFileSync(wrapperPath, `GENERATION_${REPAIRED_SHA}`, 'utf8');

    assert.equal(fs.readFileSync(wrapperPath, 'utf8'), `GENERATION_${REPAIRED_SHA}`);
    assert.equal(fs.readFileSync(previousBackup, 'utf8'), `GENERATION_${PINNED_SHA}`);

    // Illustrative copy-back, not an atomic installer rollback
    const currentTemp = path.join(backupDir, 'xi-io-cli.next');
    fs.copyFileSync(wrapperPath, currentTemp);
    fs.copyFileSync(previousBackup, wrapperPath);

    assert.equal(fs.readFileSync(wrapperPath, 'utf8'), `GENERATION_${PINNED_SHA}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('simulation only: local digest guard preserves fixture bytes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-failed-install-'));
  try {
    const binDir = path.join(tmpDir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    const wrapperPath = path.join(binDir, 'xi-io-cli');
    fs.writeFileSync(wrapperPath, `STABLE_VERSION_${PINNED_SHA}`, 'utf8');

    // Attempted install fails due to corrupt digest
    const attemptDownload = () => {
      const corruptSha = '0000000000000000000000000000000000000000';
      if (corruptSha !== PINNED_SHA) {
        throw new Error('CORRUPT_DOWNLOAD_DIGEST_MISMATCH');
      }
      fs.writeFileSync(wrapperPath, 'CORRUPTED', 'utf8');
    };

    assert.throws(() => attemptDownload(), /CORRUPT_DOWNLOAD_DIGEST_MISMATCH/);

    // Existing binary remains intact
    assert.equal(fs.readFileSync(wrapperPath, 'utf8'), `STABLE_VERSION_${PINNED_SHA}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('filesystem example only: reads and writes a path containing spaces (no shell execution)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio space dir test-'));
  try {
    const projectDir = path.join(tmpDir, 'my target workspace');
    fs.mkdirSync(projectDir, { recursive: true });

    const targetFile = path.join(projectDir, 'sample file.txt');
    fs.writeFileSync(targetFile, 'initial content\n', 'utf8');

    assert.ok(fs.existsSync(targetFile));
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'initial content\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('simulation only: example prerequisite formatter emits messages', () => {
  const checkPrerequisites = (env) => {
    const errors = [];
    if (!env.nodeVersion || parseInt(env.nodeVersion.split('.')[0], 10) < 22) {
      errors.push('PREREQUISITE_FAILED: Node.js 22 or newer required');
    }
    if (!env.hasGhAuth) {
      errors.push('PREREQUISITE_FAILED: GitHub CLI authentication required (gh auth login)');
    }
    if (env.platform === 'linux' && !env.hasBubblewrap) {
      errors.push('PREREQUISITE_NOTICE: bubblewrap recommended for containerized commands (sudo apt install bubblewrap)');
    }
    return errors;
  };

  const failingEnv = { nodeVersion: '18.19.0', hasGhAuth: false, platform: 'linux', hasBubblewrap: false };
  const errors = checkPrerequisites(failingEnv);

  assert.equal(errors.length, 3);
  assert.ok(errors[0].includes('Node.js 22'));
  assert.ok(errors[1].includes('gh auth login'));
  assert.ok(errors[2].includes('bubblewrap'));
});

test('filesystem example only: write/read preserves content (no editor launch)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-first-launch-'));
  try {
    const projectDir = path.join(tmpDir, 'project-workspace');
    fs.mkdirSync(projectDir, { recursive: true });

    const sampleFile = path.join(projectDir, 'app.ts');
    const initialContent = 'export function hello() { return "world"; }\n';
    fs.writeFileSync(sampleFile, initialContent, 'utf8');

    // 1. Initial read
    const v0Digest = sha256(fs.readFileSync(sampleFile, 'utf8'));

    // 2. Propose edit
    const proposedContent = 'export function hello() { return "XI-IO"; }\n';

    // 3. Re-verify pre-commit (no intervening writes)
    const preCommitDigest = sha256(fs.readFileSync(sampleFile, 'utf8'));
    assert.equal(preCommitDigest, v0Digest, 'Pre-commit digest matches proposal base');

    // 4. Save
    fs.writeFileSync(sampleFile, proposedContent, 'utf8');
    const v1Digest = sha256(fs.readFileSync(sampleFile, 'utf8'));
    assert.notEqual(v1Digest, v0Digest);

    // 5. Reopen
    const reopenedContent = fs.readFileSync(sampleFile, 'utf8');
    assert.equal(reopenedContent, proposedContent);
    assert.equal(sha256(reopenedContent), v1Digest);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('simulation only: digest mismatch sets a local variable to 3 (no CLI execution)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-cas-refusal-'));
  try {
    const projectDir = path.join(tmpDir, 'project-workspace');
    fs.mkdirSync(projectDir, { recursive: true });

    const targetFile = path.join(projectDir, 'main.ts');
    fs.writeFileSync(targetFile, 'line 1\nline 2\nline 3\n', 'utf8');

    // Step A: Agent reads V0
    const v0Digest = sha256(fs.readFileSync(targetFile, 'utf8'));

    // Step B: Agent proposes diff against line 3
    const proposedDiff = 'line 1\nline 2\nline 3 (modified)\n';

    // Step C: Intervening external writer modifies unrelated bytes (e.g. line 1) before user approval
    fs.writeFileSync(targetFile, 'line 1 (edited by other process)\nline 2\nline 3\n', 'utf8');

    // Step D: Pre-commit re-verification checks if on-disk hash still matches V0
    const currentOnDiskDigest = sha256(fs.readFileSync(targetFile, 'utf8'));
    const isConflict = currentOnDiskDigest !== v0Digest;

    assert.ok(isConflict, 'Intervening write detected');

    // CLI refuses write closed rather than guessing a merge (simulated exit code 3)
    let exitCode = 0;
    if (isConflict) {
      exitCode = 3; // CLI REFUSED_STALE_FILE error code
    }

    assert.equal(exitCode, 3, 'CLI exits with code 3 on intervening write');

    // Crucial invariant: disk content is NOT overwritten with proposedDiff
    const diskAfterRefusal = fs.readFileSync(targetFile, 'utf8');
    assert.ok(diskAfterRefusal.includes('edited by other process'), 'Other writer bytes preserved intact');
    assert.ok(!diskAfterRefusal.includes('(modified)'), 'Proposal not applied');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('simulation fixture: invented rollback manifest is not accepted as a CLI receipt', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-rollback-meta-'));
  try {
    const metaFilePath = path.join(tmpDir, 'rollback.json');

    // Case 1: When meta-file is absent
    assert.equal(fs.existsSync(metaFilePath), false, 'File initially absent');

    // Case 2: Test-created invented manifest; not emitted by the inspected CLI
    const sampleManifest = {
      schema: 'xiio.cli.rollback-manifest/v1',
      current_generation: 2,
      rollback_target_generation: 1,
      generations: [
        {
          generation: 2,
          installed_at: '2026-10-25T16:05:00.000Z',
          source_sha: PINNED_SHA,
          binary_sha256: '8f3b219e487920dcbc396d3fbe25638c4daecff8d49a71a067a9082ef7b92419',
          status: 'QUALIFIED_ACTIVE'
        },
        {
          generation: 1,
          installed_at: '2026-10-24T18:30:12.000Z',
          source_sha: REPAIRED_SHA,
          binary_sha256: '4c9d7821fe62180491be7c91350a41f8021c172d1a3e351890abce102984510e',
          status: 'QUALIFIED_ROLLBACK_TARGET'
        }
      ]
    };
    fs.writeFileSync(metaFilePath, JSON.stringify(sampleManifest, null, 2), 'utf8');

    assert.ok(fs.existsSync(metaFilePath), 'Rollback meta-file present');
    const readManifest = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));

    const rejected=parseRollbackFiles([{name:'install-receipt.json',text:JSON.stringify(readManifest)}]);
    assert.equal(rejected.records.length,0);
    assert.equal(rejected.installedBinaryVerified,false);
    assert.match(rejected.first_red,/UNSUPPORTED_SCHEMA/);
    assert.equal(readManifest.generations.length, 2);
    assert.equal(readManifest.current_generation, 2);
    assert.equal(readManifest.rollback_target_generation, 1);

    // Verify binary hash and source SHA extraction
    const gen2 = readManifest.generations.find((g) => g.generation === 2);
    const gen1 = readManifest.generations.find((g) => g.generation === 1);

    assert.equal(gen2.source_sha, PINNED_SHA);
    assert.equal(gen2.binary_sha256, '8f3b219e487920dcbc396d3fbe25638c4daecff8d49a71a067a9082ef7b92419');
    assert.equal(gen1.source_sha, REPAIRED_SHA);
    assert.equal(gen1.binary_sha256, '4c9d7821fe62180491be7c91350a41f8021c172d1a3e351890abce102984510e');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('source assertion: pinned Node installer path is present and npm-link workflow absent', () => {
  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

  // Verify that unpinned npm link workflow is absent
  assert.equal(
    appSrc.includes('npm run build && npm link'),
    false,
    'Defective unpinned npm link workflow must not be advertised'
  );

  // Verify that the pinned install.mjs invocation with candidate SHA is present in the source flow
  assert.ok(
    appSrc.includes('node install.mjs --ref ${RELEASE.sha}'),
    'Source compilation flow must invoke pinned install.mjs with candidate SHA'
  );
});

test('simulation only: synthetic Map ledger does not inherit results between commit keys', () => {
  const BINS_HISTORICAL_COMMIT = '7ea3976f';
  const BINS_NEWER_COMMIT = '9a8b7c6d';

  // Evidence custody ledger
  const testLedger = new Map();
  testLedger.set(BINS_HISTORICAL_COMMIT, {
    status: 'PASSED',
    gate: 5,
    scope: 'PR #110 CAS collision refusal',
    verified_at: '2026-10-24T12:00:00.000Z'
  });

  // Querying earlier commit returns recorded evidence
  assert.ok(testLedger.has(BINS_HISTORICAL_COMMIT));
  assert.equal(testLedger.get(BINS_HISTORICAL_COMMIT).status, 'PASSED');

  // Critical invariant: Newer commit has ZERO carried-forward results without independent physical qualification
  const getResultsForCommit = (commit) => {
    // Must never fallback or inherit from earlier commits
    return testLedger.get(commit) || { status: 'PENDING_PHYSICAL_QUALIFICATION', gate: 5 };
  };

  const newerResult = getResultsForCommit(BINS_NEWER_COMMIT);
  assert.equal(newerResult.status, 'PENDING_PHYSICAL_QUALIFICATION');
  assert.notEqual(newerResult.status, 'PASSED');
});



test('P1 source diagnostics: reported terminal failure warns, absent version fields do not diagnose a bad wrapper', () => {
  const obj={schema:'xiio.cli.version/v1',product:'xi-io: CLI',source_sha:PINNED_SHA,
    running_file_sha256:'a'.repeat(64),receipt_file_sha256:'a'.repeat(64)};
  const reported=compareVersionReport(JSON.stringify(obj),PINNED_SHA);
  assert.equal(reported.status,'valid');assert.equal(reported.p1Notice,undefined);
  assert.match(reported.details,/NOT_REPORTED/);
  const nullPath=compareVersionReport(JSON.stringify({...obj,node_path:null,wrapper_type:null}),PINNED_SHA);
  assert.equal(nullPath.status,'valid');assert.equal(nullPath.p1Notice,undefined);
  const missing=compareVersionReport('bash: xi-io-cli: command not found',PINNED_SHA);
  assert.equal(missing.status,'invalid');assert.equal(missing.p1Notice?.type,'violation');
  const wrapper=compareVersionReport('#!/bin/sh\nexec node "$app" "$@"',PINNED_SHA);
  assert.equal(wrapper.status,'invalid');assert.equal(wrapper.p1Notice?.type,'warning');
  const absolute=compareVersionReport('#!/bin/sh\nexec "/home/user/node22/bin/node" "$app"',PINNED_SHA);
  assert.equal(absolute.status,'invalid');assert.equal(absolute.p1Notice,undefined);
  const app=fs.readFileSync(path.join(process.cwd(),'src/App.tsx'),'utf8');
  assert.match(app,/readbackResult\.p1Notice/);
  assert.match(app,/setReadbackResult\(compareVersionReport\(text, RELEASE.sha\)\)/);
  assert.doesNotMatch(app,/MATCH VERIFIED: Installed binary|REPAIRED CANDIDATE DETECTED/);
});
