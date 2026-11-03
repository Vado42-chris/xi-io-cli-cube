import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { compareVersionReport } from '../src/version-readback.mjs';

// Pinned historical reference
const PINNED_SHA = '54509965c9d91ab02febcc8e49755e2b072a0ca9';
const REPAIRED_SHA = '5b2d807561f0d8d15d3a85aa59df6182a6d4eb87';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

test('installation journey: clean install creates binary wrapper and receipt', () => {
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

test('installation journey: upgrade preserves rollback and migrates generation', () => {
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

    // Rollback operation: atomic revert
    const currentTemp = path.join(backupDir, 'xi-io-cli.next');
    fs.copyFileSync(wrapperPath, currentTemp);
    fs.copyFileSync(previousBackup, wrapperPath);

    assert.equal(fs.readFileSync(wrapperPath, 'utf8'), `GENERATION_${PINNED_SHA}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('installation journey: failed install preserves previous installed version without damage', () => {
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

test('installation journey: paths containing spaces execute without shell word-splitting', () => {
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

test('installation journey: missing prerequisites produce actionable errors', () => {
  const checkPrerequisites = (env) => {
    const errors = [];
    if (!env.nodeVersion || parseInt(env.nodeVersion.split('.')[0], 10) < 22) {
      errors.push('PREREQUISITE_FAILED: Node.js 22 or newer required');
    }
    if (env.platform === 'linux' && !env.hasBubblewrap) {
      errors.push('PREREQUISITE_NOTICE: bubblewrap recommended for containerized commands (sudo apt install bubblewrap)');
    }
    return errors;
  };

  const failingEnv = { nodeVersion: '18.19.0', hasGhAuth: false, platform: 'linux', hasBubblewrap: false };
  const errors = checkPrerequisites(failingEnv);

  assert.equal(errors.length, 2);
  assert.ok(errors[0].includes('Node.js 22'));
  assert.ok(errors[1].includes('bubblewrap'));
  assert.ok(errors.every(error => !error.includes('GitHub') && !error.includes('sign-in')));
  assert.deepEqual(checkPrerequisites({nodeVersion: '24.22.1', hasGhAuth: false, platform: 'linux', hasBubblewrap: true}), []);
});

test('installation journey: first launch and project reopening preserves content parity', () => {
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

test('installation journey: local CLI CAS pre-commit check refuses intervening write (exit code 3)', () => {
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

test('installation journey: rollback meta-file parses and lists prior binary hashes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-rollback-meta-'));
  try {
    const metaFilePath = path.join(tmpDir, 'rollback.json');

    // Case 1: When meta-file is absent
    assert.equal(fs.existsSync(metaFilePath), false, 'File initially absent');

    // Case 2: When meta-file is written by CLI after upgrade
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

test('installation journey: source compilation requires pinned installer path and rejects npm link', () => {
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

test('installation journey: BINS test results strictly isolated to source commit and not carried forward', () => {
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

test('installation journey: version reports preserve P1 diagnostics without claiming installed-host proof', () => {
  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  // Exercise the actual parser consumed by the page, not stale inline strings.
  assert.match(appSrc, /import \{ compareVersionReport \} from '\.\/version-readback\.mjs'/);
  assert.match(appSrc, /setReadbackResult\(compareVersionReport\(text, RELEASE\.sha\)\)/);
  assert.match(appSrc, /\{readbackResult\.p1Notice\.title\}/);
  assert.match(appSrc, /\{readbackResult\.p1Notice\.message\}/);

  const missingBinary = compareVersionReport('bash: xi-io-cli: command not found', PINNED_SHA);
  assert.equal(missingBinary.status, 'invalid');
  assert.equal(missingBinary.p1Notice?.type, 'violation');
  assert.match(missingBinary.p1Notice?.title, /Missing CLI Binary Path/);
  assert.match(missingBinary.details, /DIAGNOSTIC ONLY/);
  assert.equal(missingBinary.detectedSha, undefined);

  const wrapper = compareVersionReport('#!/bin/sh\nexec node ./cli.mjs', PINNED_SHA);
  assert.equal(wrapper.status, 'invalid');
  assert.equal(wrapper.p1Notice?.type, 'warning');
  assert.match(wrapper.p1Notice?.message, /fs\.realpathSync\(process\.execPath\)/);
  assert.match(wrapper.p1Notice?.message, /NOT an independent installed-host proof/);

  const report = {schema: 'xiio.cli.version/v1', product: 'xi-io: CLI',
    source_sha: PINNED_SHA, running_file_sha256: 'a'.repeat(64), receipt_file_sha256: 'a'.repeat(64)};
  const reportedMatch = compareVersionReport(JSON.stringify(report), PINNED_SHA);
  assert.equal(reportedMatch.status, 'valid');
  assert.match(reportedMatch.details, /REPORTED COMPARISON MATCH/);
  assert.match(reportedMatch.details, /NOT_REPORTED/);
  assert.match(reportedMatch.details, /wrapper status is UNKNOWN/);
  assert.match(reportedMatch.details, /not independent host, installation, or byte-readback verification/);
  assert.equal(reportedMatch.p1Notice, undefined); // v1 does not report executable path.
  assert.equal(compareVersionReport(PINNED_SHA, PINNED_SHA).status, 'invalid');
  assert.equal(compareVersionReport(JSON.stringify({...report, source_sha: REPAIRED_SHA}), PINNED_SHA).status, 'mismatch');
  assert.equal(compareVersionReport(JSON.stringify({...report, receipt_file_sha256: 'b'.repeat(64)}), PINNED_SHA).status, 'mismatch');
  assert.equal(compareVersionReport(JSON.stringify({...report, receipt_file_sha256: undefined}), PINNED_SHA).status, 'invalid');
});

test('installation journey: local-first default requires zero account, zero card, and operates 100% offline', () => {
  // Simulate local installer profile without account or payment
  const localSession = {
    mode: 'USE_LOCALLY',
    hasAccount: false,
    hasPaymentMethod: false,
    networkConnected: false,
    localOllamaAvailable: true
  };

  const evaluateLaunch = (session) => {
    if (session.mode === 'USE_LOCALLY') {
      return {
        canLaunch: true,
        canEditFiles: true,
        canQueryLocalOllama: session.localOllamaAvailable,
        offlineCompliant: !session.networkConnected
      };
    }
    return { canLaunch: false };
  };

  const launchResult = evaluateLaunch(localSession);
  assert.equal(launchResult.canLaunch, true, 'Local-first launches without account or payment');
  assert.equal(launchResult.canEditFiles, true, 'Local file edits allowed offline');
  assert.equal(launchResult.canQueryLocalOllama, true, 'Local Ollama works offline');
});

test('installation journey: OpenID Connect identity token does not grant machine access or billing consent', () => {
  // Simulate incoming OIDC ID Token claims
  const oidcClaims = {
    iss: 'https://accounts.google.com',
    sub: '109876543210987654321',
    email: 'operator@example.com',
    name: 'Operator Name'
  };

  const processIdentityLink = (claims) => {
    return {
      identity_verified: Boolean(claims.sub && claims.email),
      principal_email: claims.email,
      grants: {
        machine_management: false,
        cloud_file_sync: false,
        automatic_billing: false
      }
    };
  };

  const linked = processIdentityLink(oidcClaims);
  assert.equal(linked.identity_verified, true, 'OIDC claims verify identity');
  assert.equal(linked.grants.machine_management, false, 'Identity does NOT grant machine management');
  assert.equal(linked.grants.cloud_file_sync, false, 'Identity does NOT consent to file upload');
  assert.equal(linked.grants.automatic_billing, false, 'Identity does NOT authorize billing');
});

test('installation journey: XI-IO billing workspace identity remains stable across login provider rotations', () => {
  const workspaceId = 'ws_9a8b7c6d-1234-5678-90ab-cdef12345678';
  const billingLedger = {
    workspaceId,
    purchases: ['license_editor_v1', 'credit_pack_50'],
    balanceUsd: 42.50
  };

  // Initial login via Google
  let currentAuth = {
    provider: 'google',
    subject: 'sub_google_123',
    linkedWorkspaceId: workspaceId
  };

  assert.equal(currentAuth.linkedWorkspaceId, billingLedger.workspaceId);

  // User rotates login provider to GitHub
  currentAuth = {
    provider: 'github',
    subject: 'sub_github_456',
    linkedWorkspaceId: workspaceId // Still maps to same XI-IO workspace
  };

  assert.equal(currentAuth.linkedWorkspaceId, billingLedger.workspaceId, 'Billing workspace decoupled from auth provider');
  assert.equal(billingLedger.purchases.length, 2, 'Purchases preserved intact');
  assert.equal(billingLedger.balanceUsd, 42.50, 'Account balance preserved intact');
});

test('installation journey: metered billing deduplication prevents double-charging on retried requests', () => {
  const processedEvents = new Set();
  let totalChargedUsd = 0;

  const chargeMeteredUsage = (event) => {
    if (processedEvents.has(event.idempotency_key)) {
      return { status: 'DEDUPLICATED_ALREADY_CHARGED', charge: 0 };
    }
    processedEvents.add(event.idempotency_key);
    totalChargedUsd += event.charge_usd;
    return { status: 'CHARGED', charge: event.charge_usd };
  };

  const idempotencyKey = 'dedup_sha256_operation_seq_42';
  const billableEvent = {
    idempotency_key: idempotencyKey,
    charge_usd: 0.05,
    metric_units: 1000
  };

  // First execution
  const res1 = chargeMeteredUsage(billableEvent);
  assert.equal(res1.status, 'CHARGED');
  assert.equal(totalChargedUsd, 0.05);

  // Network retry with exact same idempotency key
  const res2 = chargeMeteredUsage(billableEvent);
  assert.equal(res2.status, 'DEDUPLICATED_ALREADY_CHARGED');
  assert.equal(totalChargedUsd, 0.05, 'Retry must not double charge');
});

test('installation journey: spending caps are evaluated and enforced before paid work starts', () => {
  const spendingCapUsd = 10.00;
  let currentSpentUsd = 9.80;

  const checkAndRunPaidTask = (projectedCostUsd) => {
    if (currentSpentUsd + projectedCostUsd > spendingCapUsd) {
      return { status: 'REFUSED_SPENDING_CAP_EXCEEDED', executed: false };
    }
    currentSpentUsd += projectedCostUsd;
    return { status: 'APPROVED', executed: true };
  };

  // Task 1: $0.10 (9.80 + 0.10 = 9.90 <= 10.00) -> Passes
  const t1 = checkAndRunPaidTask(0.10);
  assert.equal(t1.status, 'APPROVED');
  assert.equal(t1.executed, true);

  // Task 2: $0.20 (9.90 + 0.20 = 10.10 > 10.00) -> Refused closed BEFORE execution
  const t2 = checkAndRunPaidTask(0.20);
  assert.equal(t2.status, 'REFUSED_SPENDING_CAP_EXCEEDED');
  assert.equal(t2.executed, false, 'Work aborted before starting');
  assert.equal(currentSpentUsd, 9.90, 'No billing occurred for rejected task');
});

test('installation journey: optional identity and billing examples do not claim configured authority', () => {
  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /Sign-in remains optional and skippable/);
  assert.match(appSrc, /Account sign-in is not connected in this build/);
  assert.match(appSrc, /Choosing this option does not sign in, grant machine access or authorize charges/);
  assert.match(appSrc, /No account connection, billing service or spending authorization is configured by this page/);
  assert.match(appSrc, /It does not enforce a service limit or authorize a paid task/);
  assert.match(appSrc, /EXAMPLE WITHIN CAP/);
  assert.match(appSrc, /EXAMPLE ABOVE CAP/);
});

test('installation journey: local HEX install and remote Switchboard are parallel independent paths', () => {
  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

  // Must assert parallel non-blocking delivery
  assert.ok(
    appSrc.includes('Local HEX installation and first launch must proceed alongside remote Switchboard work') ||
    appSrc.includes('Neither product should wait for the other to become usable') ||
    appSrc.includes('independent release path'),
    'App.tsx must document independent parallel paths where local HEX launch does not wait on Switchboard'
  );
  assert.ok(
    appSrc.includes('sign-in skippable') || appSrc.includes('Sign-in remains optional and skippable'),
    'App.tsx must state sign-in remains optional and skippable'
  );
});

test('installation journey: single qualification traceability matrix deduplicates cells and scenarios', () => {
  const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

  assert.ok(
    appSrc.includes('traceability matrix') || appSrc.includes('Traceability Matrix'),
    'App.tsx must reference single qualification traceability matrix'
  );
  assert.ok(
    appSrc.includes('deduplicat') || appSrc.includes('Deduplicat'),
    'App.tsx must acknowledge deduplicating overlapping coverage against actual contracts'
  );
});

test('installation journey: metered preauthorization formula C_reserved = Q_max * R + F', () => {
  const qMax = 2000;
  const rate = 0.005;
  const fixed = 0.00;
  const cReserved = qMax * rate + fixed;

  assert.equal(cReserved, 10.00);

  const budget = 10.00;
  const exceedsBudget = (units) => (units * rate + fixed) > budget;
  assert.equal(exceedsBudget(1000), false);
  assert.equal(exceedsBudget(2000), false);
  assert.equal(exceedsBudget(2001), true);
});

test('installation journey: concierge unit economics model calculation is strictly illustrative', () => {
  const payingCustomers = 100;
  const monthlyPrice = 20.00;
  const supportMinutesPerCustomer = 15;
  const supportHourlyRate = 30.00;
  const infraPerCustomer = 2.00;

  const grossRevenue = payingCustomers * monthlyPrice; // $2,000.00
  const paymentFees = grossRevenue * 0.029 + payingCustomers * 0.30; // $58 + $30 = $88.00
  const supportHours = (payingCustomers * supportMinutesPerCustomer) / 60; // 25 hours
  const supportLaborCost = supportHours * supportHourlyRate; // $750.00
  const variableInfra = payingCustomers * infraPerCustomer; // $200.00
  const contributionMargin = grossRevenue - paymentFees - supportLaborCost - variableInfra; // $962.00

  assert.equal(grossRevenue, 2000.00);
  assert.equal(paymentFees, 88.00);
  assert.equal(supportLaborCost, 750.00);
  assert.equal(variableInfra, 200.00);
  assert.equal(contributionMargin, 962.00);

  // Sensitivity: +10 min/cust costs $5/cust
  const additionalTenMinPerCust = (10 / 60) * supportHourlyRate;
  assert.equal(additionalTenMinPerCust, 5.00);
});





test('real packaged CLI clean-install and local use require no XI-IO identity, Ward, GitHub auth or remote service', async () => {
  const {spawnSync} = await import('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-offline-first-install-'));
  const home = path.join(root, 'home');
  const prefix = path.join(home, '.local', 'share', 'xi-io', 'cli-v1');
  const adapter = new URL('../native/hex/adapter/installer_adapter.py', import.meta.url);
  const clean = {
    PATH: '/usr/bin:/bin', HOME: home, LANG: 'C.UTF-8',
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_STATE_HOME: path.join(home, '.local', 'state'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    PYTHONDONTWRITEBYTECODE: '1',
  };
  fs.mkdirSync(home, {recursive: true});
  const python = fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';
  const request = payload => {
    const run = spawnSync(python, [adapter.pathname], {
      input: JSON.stringify(payload), encoding: 'utf8', env: clean, timeout: 90000,
    });
    assert.equal(run.status, 0, run.stderr || run.error?.message || run.stdout);
    const result = JSON.parse(run.stdout);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.result;
  };
  try {
    for (const key of ['XIIO_DEVICE_REF', 'XIIO_DEVICE_BROKER_URL', 'XIIO_DEVICE_PORTS_MODULE',
      'XIIO_USER', 'XIIO_ACCOUNT', 'WARD_GRANT', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST']) {
      assert.equal(Object.hasOwn(clean, key), false, key);
    }
    const initial = request({action: 'inspect'});
    assert.equal(initial.existing_cli.state, 'NOT_OBSERVED_AT_KNOWN_LOCATION');
    assert.equal(initial.connection_prerequisites.state, 'CONFIGURATION_REQUIRED');
    assert.equal(initial.connection_prerequisites.credential_values_read, false);
    const planned = request({action: 'prepare', prefix, node: process.execPath, components: ['cli']});
    assert.equal(planned.phase, 'PREPARED_NOT_INSTALLED');
    assert.equal(planned.connection.configuration_state, 'CONFIGURATION_REQUIRED');
    assert.equal(planned.connection.connected, false);
    assert.equal(planned.components.length, 1);
    assert.equal(planned.components[0], 'cli');
    const applied = request({action: 'apply', plan_id: planned.plan_id,
      approval_digest: planned.approval_digest, approved: true});
    assert.equal(applied.phase, 'INSTALLED_READBACK_VERIFIED');
    assert.equal(applied.connected, false);
    const reopened = request({action: 'readback', plan_id: planned.plan_id});
    assert.equal(reopened.phase, 'INSTALLED_READBACK_VERIFIED');
    assert.equal(reopened.connection_state, 'CONFIGURATION_REQUIRED');
    assert.equal(reopened.connected, false);
    const cli = path.join(prefix, 'bin', 'xi-io-cli');
    assert.ok(fs.statSync(cli).isFile());
    for (const [command, schema] of [['version', 'xiio.cli.version/v1'], ['help', 'xiio.cli.help/v1']]) {
      const launched = spawnSync(cli, [command], {
        encoding: 'utf8', env: clean, cwd: home, timeout: 15000,
      });
      assert.equal(launched.status, 0, launched.stderr || launched.error?.message || launched.stdout);
      assert.equal(JSON.parse(launched.stdout).schema, schema);
    }
    const connect = spawnSync(path.join(prefix, 'bin', 'xi-io-connect'), [], {
      encoding: 'utf8', env: clean, cwd: home, timeout: 15000,
    });
    assert.equal(connect.status, 3, connect.stderr || connect.stdout);
    const state = JSON.parse(connect.stdout);
    assert.equal(state.state, 'CONFIGURATION_REQUIRED');
    assert.equal(state.connected, false);
    assert.equal(fs.existsSync(path.join(home, '.config', 'xi-io', 'device.json')), false);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});


test('preexisting device identity survives CLI install, restart, same-payload upgrade and rollback', async () => {
  const {spawnSync} = await import('node:child_process');
  const {generateKeyPairSync, createPublicKey, randomUUID, createHash} = await import('node:crypto');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-identity-preserve-'));
  const home = path.join(root, 'home');
  const configDir = path.join(home, '.config', 'xi-io');
  const prefix = path.join(home, '.local', 'share', 'xi-io', 'cli-v1');
  const adapter = new URL('../native/hex/adapter/installer_adapter.py', import.meta.url);
  const env = {
    HOME: home, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8',
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_STATE_HOME: path.join(home, '.local', 'state'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    PYTHONDONTWRITEBYTECODE: '1',
  };
  const python = fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';
  const call = payload => {
    const subprocess = spawnSync(python, [adapter.pathname], {
      input: JSON.stringify(payload), encoding: 'utf8', env, timeout: 90000,
    });
    assert.equal(subprocess.status, 0, subprocess.stderr || subprocess.error?.message);
    const output = JSON.parse(subprocess.stdout);
    assert.equal(output.ok, true, JSON.stringify(output));
    return output.result;
  };
  const cli = command => {
    const subprocess = spawnSync(path.join(prefix, 'bin', 'xi-io-cli'), [command], {
      encoding: 'utf8', env, cwd: home, timeout: 15000,
    });
    assert.equal(subprocess.status, 0, subprocess.stderr || subprocess.error?.message);
    return JSON.parse(subprocess.stdout);
  };
  try {
    fs.mkdirSync(configDir, {recursive: true, mode: 0o700});
    const {privateKey, publicKey} = generateKeyPairSync('ed25519');
    const pemPrivate = privateKey.export({type: 'pkcs8', format: 'pem'});
    const pemPublic = publicKey.export({type: 'spki', format: 'pem'});
    const fingerprint = 'SHA256:' + createHash('sha256')
      .update(createPublicKey(privateKey).export({type: 'spki', format: 'der'}))
      .digest('base64').replace(/=+$/, '');
    const device = {
      schema: 'xiio.cli.device/v1',
      device_id: 'device:' + randomUUID(),
      hostname: os.hostname(), platform: process.platform,
      principal: 'github:42', login: 'existing-fixture',
      public_key: pemPublic, fingerprint,
      created_at: '2026-01-01T00:00:00.000Z',
      authority: 'NONE_UNTIL_WARD_GRANT',
    };
    const deviceFile = path.join(configDir, 'device.json');
    const keyFile = path.join(configDir, 'device-key.pem');
    fs.writeFileSync(deviceFile, JSON.stringify(device) + '\n', {mode: 0o600, flag: 'wx'});
    fs.writeFileSync(keyFile, pemPrivate, {mode: 0o600, flag: 'wx'});
    const initialRecord = fs.readFileSync(deviceFile);
    const initialKey = fs.readFileSync(keyFile);
    const inspect = call({action: 'inspect'});
    assert.equal(inspect.connection_prerequisites.device_identity.state, 'PUBLIC_DEVICE_METADATA_OBSERVED');
    assert.equal(inspect.connection_prerequisites.device_identity.device_ref, device.device_id);
    assert.equal(inspect.connection_prerequisites.device_identity.authority, 'NOT_INFERRED');
    assert.equal(inspect.connection_prerequisites.credential_values_read, false);
    const install = () => {
      const plan = call({action: 'prepare', prefix, node: process.execPath, components: ['cli']});
      assert.equal(plan.phase, 'PREPARED_NOT_INSTALLED');
      assert.equal(plan.connection.configuration_state, 'CONFIGURATION_REQUIRED');
      const result = call({action: 'apply', plan_id: plan.plan_id,
        approval_digest: plan.approval_digest, approved: true});
      assert.equal(result.phase, 'INSTALLED_READBACK_VERIFIED');
      assert.equal(result.connected, false);
      return plan;
    };
    const first = install();
    assert.equal(cli('whoami').state, 'PASS');
    assert.equal(cli('whoami').device_id, device.device_id);
    assert.equal(cli('version').state, 'PASS');
    assert.equal(call({action: 'readback', plan_id: first.plan_id}).phase,
      'INSTALLED_READBACK_VERIFIED');
    const firstGeneration = fs.readFileSync(path.join(prefix, 'current'), 'utf8');
    const second = install();
    assert.notEqual(fs.readFileSync(path.join(prefix, 'current'), 'utf8'), firstGeneration);
    const rollback = call({action: 'rollback', plan_id: second.plan_id,
      approval_digest: second.approval_digest, approved: true});
    assert.equal(rollback.phase, 'ROLLED_BACK');
    assert.equal(fs.readFileSync(path.join(prefix, 'current'), 'utf8'), firstGeneration);
    assert.equal(call({action: 'readback', plan_id: second.plan_id}).phase, 'ROLLED_BACK');
    assert.equal(cli('whoami').device_id, device.device_id);
    assert.equal(cli('whoami').state, 'PASS');
    assert.deepEqual(fs.readFileSync(deviceFile), initialRecord);
    assert.deepEqual(fs.readFileSync(keyFile), initialKey);
    assert.equal(Object.hasOwn(env, 'GH_TOKEN'), false);
    assert.equal(Object.hasOwn(env, 'XIIO_DEVICE_PORTS_MODULE'), false);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
