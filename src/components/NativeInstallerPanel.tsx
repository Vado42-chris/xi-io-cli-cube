import React, {useEffect, useRef, useState} from 'react';
import {createInstallerClient, installerStatus, nativeInstallerAvailable} from '../lib/nativeInstaller.mjs';
import {installerReadiness, reviewedRuntimeReady} from '../lib/installerReadiness.mjs';
import {selectNativeDirectory} from '../lib/nativeDirectory.mjs';
import {availabilityFrom, availableSelection, canPrepareComponents, canRollbackPlan, installerComponents} from '../lib/installerAvailability.mjs';

type Plan = {plan_id: string; phase: string; prefix?: string; components?: string[]; approval_digest?: string; payload_files?: number; payload_bytes?: number; created_at?: string; [key: string]: any};
type Request = {action: 'inspect'; plan_id?: string} | {action: 'prepare'; prefix: string; node: string; components: string[]} | {action: 'readback'; plan_id: string} | {action: 'prepare_repair'; prefix: string; node: string; bin_dir: string} | {action: 'apply_repair' | 'apply' | 'rollback'; plan_id: string; approval_digest: string; approved: true} | {action: 'bundle_inspect'} | {action: 'bundle_apply'; lock_sha256: string; approved: true};

/** Local native controls within the accepted Cube design, not another launcher. */
export default function NativeInstallerPanel() {
  const native = nativeInstallerAvailable();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prefix, setPrefix] = useState('');
  const [node, setNode] = useState('');
  const [repairMode, setRepairMode] = useState(false);
  const [binDir, setBinDir] = useState('');
  const [components, setComponents] = useState<string[]>([]);
  const [availability, setAvailability] = useState(() => availabilityFrom(null));
  const [history, setHistory] = useState<Plan[]>([]);
  const [coreBundle, setCoreBundle] = useState<any>(null);
  const [coreApproved, setCoreApproved] = useState(false);
  const [coreUnknown, setCoreUnknown] = useState(false);
  const [coreError, setCoreError] = useState('');

  const [preflight, setPreflight] = useState<any>(null);
  async function chooseInstallationFolder() {
    try {
      const selected = await selectNativeDirectory('installation');
      if (selected !== null) { edit(); setPrefix(selected); }
    } catch (error) { setError(String(error instanceof Error ? error.message : error)); }
  }
  const [plan, setPlan] = useState<Plan | null>(null);
  const [observed, setObserved] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [approval, setApproval] = useState(false);
  const [rollbackApproval, setRollbackApproval] = useState(false);
  const invoke = (command: string, args: object) => (globalThis as any).__TAURI__.core.invoke(command, args);
  const client = createInstallerClient(native ? invoke : undefined);

  async function run(request: Request, select = true) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setApproval(false); setRollbackApproval(false);
    const effect = request.action === 'apply' || request.action === 'rollback' || request.action === 'apply_repair';
    if (effect) {setUnknown(true); setObserved(false);}
    try {
      const result = await client(request);
      if (result.system_metadata || result.preflight) setPreflight(result.preflight || result);
      if (result.supported_components || result.component_availability) {
        const observedAvailability = availabilityFrom(result);
        setAvailability(observedAvailability);
        setComponents(current => availableSelection(current, observedAvailability));
      }
      if (select) {
        setPlan(result as Plan);
        const terminal = ['INSTALLED_READBACK_VERIFIED', 'LAUNCHER_REPAIR_READBACK_VERIFIED', 'ROLLED_BACK'].includes(result.phase);
        setObserved(request.action !== 'inspect' && terminal);
        setUnknown(Boolean(result.do_not_retry) || ['APPLYING', 'APPLY_OUTCOME_UNCERTAIN', 'ROLLING_BACK', 'ROLLBACK_OUTCOME_UNCERTAIN', 'LAUNCHER_REPAIR_OUTCOME_UNCERTAIN'].includes(result.phase));
      } else {
        setHistory(result.plans || []);
        setPrefix(current => current || result.prefix_suggestion || '');
        setNode(current => current || result.node_suggestion || '');
        setBinDir(current => current || result.bin_dir_suggestion || '');
      }
      return result;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      if (effect || request.action === 'readback') setObserved(false);
    } finally {busyRef.current = false; setBusy(false);}
  }
  async function coreRequest(request: Extract<Request, {action:'bundle_inspect'|'bundle_apply'}>) {
    if (busyRef.current || (coreUnknown && request.action === 'bundle_apply')) return;
    busyRef.current = true; setBusy(true); setCoreError('');
    const effect = request.action === 'bundle_apply';
    if (effect) {setCoreUnknown(true); setCoreApproved(false);}
    try {
      const result = await client(request);
      setCoreBundle(result);
      // Installed is known but not retryable; duplicate prevention is not uncertainty.
      setCoreUnknown((result?.do_not_retry === true && result?.phase !== 'INSTALLED_BYTES_VERIFIED')
        || (effect && result?.state !== 'INSTALLED_BYTES_VERIFIED'));
    } catch (error) {
      setCoreError(String(error instanceof Error ? error.message : error));
    } finally {busyRef.current = false; setBusy(false);}
  }
  useEffect(() => {if (native) void run({action: 'inspect'}, false);}, []);
  function edit() {setPlan(null); setObserved(false); setApproval(false); setRollbackApproval(false);}
  const status = installerStatus(plan, observed);
  const runtimeReady = reviewedRuntimeReady(plan);
  const readiness = installerReadiness(preflight, plan);
  const canApply = plan?.phase === 'PREPARED_NOT_INSTALLED' && !unknown && runtimeReady;
  const canRepair = plan?.phase === 'PREPARED_REPAIR_NOT_APPLIED' && !unknown;
  const canRollback = canRollbackPlan(plan, unknown);
  const button = 'min-h-[44px] rounded-none border border-workspace-border-strong px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:border-workspace-border-strong';
  return <section aria-label="Native HEX installer" className="hex-installer-panel space-y-4 p-5 rounded-none border border-workspace-border-strong/40 bg-workspace-canvas">
    <div><h3 className="font-bold text-workspace-text">Install on this computer</h3>
      <p className="text-sm text-workspace-muted">Local Linux candidate · Available packaged components only · No sign-in required</p></div>
    <div className="space-y-2 border border-workspace-border-strong/40 p-3" aria-label="XI-IO core baseline">
      <h4 className="font-semibold text-workspace-text">XI-IO core baseline</h4>
      <p className="text-xs text-workspace-muted">CLI, @ibal, Ward, Switchboard, BINS and Inbox. Automatic XDG locations; no computer address or installation folder required. Exact release packages must be published before installation can be enabled.</p>
      {native && <button className={button} disabled={busy}
        onClick={() => {setCoreApproved(false);void coreRequest({action:'bundle_inspect'});}}>Check core package availability</button>}
      {coreBundle && <p role="status" className="text-xs text-workspace-text">{coreBundle.phase === 'BLOCKED_RELEASE_PROFILE_UNPUBLISHED'
        ? 'Core installer is blocked: qualified release package manifest is not yet shipped. No files were installed.'
        : coreBundle.phase === 'REVIEW_REQUIRED'
          ? 'All six core manifest roles are present. Review the exact release digest before installing; operation and connectivity still require independent qualification.'
          : coreBundle.phase === 'RECONCILED_NOT_INSTALLED'
            ? 'A prior attempt is durably reconciled as not installed. A fresh exact approval may be attempted.'
            : coreBundle.phase === 'APPLY_IN_PROGRESS'
              ? 'Another core install currently holds cross-process custody. Read-only inspection remains available; a second apply is blocked.'
              : coreBundle.phase === 'APPLY_OUTCOME_UNCERTAIN'
                ? 'A prior core install has unreconciled receipts or destination bytes. Retry is blocked until exact readback is clean.'
                : coreBundle.state === 'INSTALLED_BYTES_VERIFIED' || coreBundle.phase === 'INSTALLED_BYTES_VERIFIED'
                ? 'Verified child bytes installed. Service startup, authentication and two-way device connection are not yet proven.'
                : 'Installation result requires review.'}</p>}
      {['REVIEW_REQUIRED', 'RECONCILED_NOT_INSTALLED'].includes(coreBundle?.phase) && !coreUnknown && <>
        <p className="text-xs font-mono break-all text-workspace-text">Release manifest SHA-256: {coreBundle.lock_sha256}</p>
        <label className="text-xs text-workspace-text block"><input type="checkbox" disabled={busy}
          checked={coreApproved} onChange={e => setCoreApproved(e.target.checked)} /> I approve these exact child artifacts and XDG installations.</label>
        <button className={button} disabled={busy || !coreApproved}
          onClick={() => void coreRequest({action:'bundle_apply',lock_sha256:coreBundle.lock_sha256,approved:true})}>Install approved core products</button>
      </>}
      {coreUnknown && <p role="alert" className="text-xs text-workspace-danger">Core installation outcome may be uncertain. Do not retry until exact installed receipts are reconciled.</p>}
      {coreError && <p role="alert" className="text-xs text-workspace-danger">{coreError}</p>}
    </div>
    {!native ? <p role="status" className="text-sm text-workspace-focus">Native HEX is required. This browser preview cannot inspect, install or roll back files. The guides below are not proof of an installation.</p> : <>
      <p className="text-xs text-workspace-muted">Requires system Python 3.10+, bash and your selected Node 22.13+. Preparing a plan runs that Node executable to check its identity/version, but does not install the payload. Choose the intended installation folder on this computer.</p>
      <label className="block text-sm text-workspace-text"><input type="checkbox" checked={repairMode} disabled={busy || unknown} onChange={e => {edit(); setRepairMode(e.target.checked);}} /> Repair only the existing CLI launcher. Keep the installed runtime and generations.</label>
      <fieldset disabled={busy || unknown} className="hex-responsive-grid hex-grid-halves hex-form-grid">
        <label className="text-xs text-workspace-text">Absolute installation folder<input aria-label="Installation folder" value={prefix} onChange={e => {edit(); setPrefix(e.target.value);}} className="mt-1 w-full rounded bg-workspace-surface border border-workspace-border-strong p-2 font-mono" /><button type="button" className={button + " mt-2"} disabled={busy || unknown} onClick={() => void chooseInstallationFolder()}>Choose Folder</button></label>
        <label className="text-xs text-workspace-text">Absolute Node executable<input aria-label="Node executable" value={node} onChange={e => {edit(); setNode(e.target.value);}} className="mt-1 w-full rounded bg-workspace-surface border border-workspace-border-strong p-2 font-mono" /></label>
        {repairMode && <label className="text-xs text-workspace-text">Existing launcher directory<input aria-label="Existing launcher directory" value={binDir} onChange={e => {edit(); setBinDir(e.target.value);}} className="mt-1 w-full rounded bg-workspace-surface border border-workspace-border-strong p-2 font-mono" /></label>}
        {!repairMode && <div className="hex-grid-full flex flex-wrap gap-3">{installerComponents.map(name => <label key={name} className="text-sm"><input type="checkbox" checked={components.includes(name)} disabled={name === 'cli' || !availability[name].available} onChange={e => {edit(); setComponents(current => e.target.checked ? [...current, name] : current.filter(x => x !== name));}} /> {name.toUpperCase()}{name === 'cli' ? ' (required)' : ''}{!availability[name].available ? ' — unavailable' : ''}</label>)}</div>}
      </fieldset>
      {!repairMode && installerComponents.filter(name => !availability[name].available).map(name => <p key={name} className="text-xs text-workspace-muted">{name.toUpperCase()}: unavailable — {availability[name].reason}. No installation is offered for this payload.</p>)}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || unknown || !prefix.startsWith('/') || !node.startsWith('/') || (repairMode ? !binDir.startsWith('/') : !canPrepareComponents(components, availability))} onClick={() => void run(repairMode ? {action: 'prepare_repair', prefix, node, bin_dir: binDir} : {action: 'prepare', prefix, node, components})}>Check selected Node & prepare plan</button>
        <button className={button} disabled={busy} onClick={() => void run({action: 'inspect'}, false)}>Refresh requirements & history</button>
      </div>
      <div aria-label="Detected installation requirements" className="space-y-2 text-xs text-workspace-text" role="status">
        {readiness.slice(0, 3).map(row => <p key={row.label}><strong>{row.label}:</strong> {row.text}</p>)}
      </div>
      {readiness.length > 3 && <details className="hex-installer-disclosure">
        <summary>More installation &amp; connection checks ({readiness.length - 3})</summary>
        <div className="hex-detail-scroll space-y-3" tabIndex={0} role="region" aria-label="Additional installation and connection checks">
          {readiness.slice(3).map(row => <p key={row.label}><strong>{row.label}:</strong> {row.text}</p>)}
        </div>
      </details>}
      {preflight && <details className="hex-installer-disclosure text-xs"><summary>Detected requirements and connection prerequisites</summary><pre className="hex-detail-scroll text-workspace-muted" tabIndex={0} role="region" aria-label="Raw detected requirements and connection prerequisites">{JSON.stringify({system_metadata: preflight.system_metadata, node_candidates: preflight.node_candidates, existing_cli: preflight.existing_cli, connection_prerequisites: preflight.connection_prerequisites}, null, 2)}</pre><p className="text-workspace-muted">Discovery does not run candidate Node executables. Preparing your selected runtime checks its identity and version. Unobserved connection configuration is not proof that a host service is absent.</p></details>}
      {history.length > 0 && <details className="hex-installer-disclosure">
        <summary>Saved history ({history.length}) — not a current observation</summary>
        <div className="hex-detail-scroll space-y-2" tabIndex={0} role="region" aria-label="Saved installation and repair history">
          {history.map(entry => <button key={entry.plan_id} className={`${button} block text-left w-full`} disabled={busy} onClick={() => void run({action: 'inspect', plan_id: entry.plan_id})}>{entry.created_at || entry.plan_id} · {entry.prefix || 'Unreadable evidence'} · {entry.phase}</button>)}
        </div>
      </details>}
      {plan && <div className="space-y-3 border-t border-workspace-border-strong pt-4">
        <p role="status" className={`text-sm ${status.tone === 'success' && !unknown ? 'text-workspace-success' : 'text-workspace-focus'}`}>{unknown ? 'Outcome uncertain. Check actual state; do not repeat an operation.' : status.message}</p>
        <div className="text-xs font-mono text-workspace-text break-all"><p>Target: {plan.prefix}</p><p>Components: {plan.components?.join(', ')}</p><p>Payload: {plan.payload_files ?? '?'} files · {plan.payload_bytes ?? '?'} bytes</p><p>Plan: {plan.plan_id}</p><p>Receipts: {plan.receipt_directory || 'See saved plan evidence'}</p></div>
        <details className="hex-installer-disclosure text-xs"><summary>Exact file changes, source generations and receipts</summary><pre className="hex-detail-scroll text-workspace-muted" tabIndex={0} role="region" aria-label="Exact reviewed plan and receipts">{JSON.stringify(plan, null, 2)}</pre></details>
        {plan.phase === 'PREPARED_NOT_INSTALLED' && !runtimeReady && <p role="alert" className="text-sm text-workspace-danger">Installation unavailable: the reviewed Node 22.13+ runtime and mandatory connection payload must both be verified. Prepare a new plan; no partial CLI-only install is offered.</p>}
        {canRepair && <><label className="block text-sm text-workspace-text"><input type="checkbox" checked={approval} disabled={busy} onChange={e => setApproval(e.target.checked)} /> I approve only the displayed launcher repair, original SHA and existing Node binding. No new runtime or CLI generation.</label><button className={button} disabled={busy || !approval} onClick={() => void run({action: 'apply_repair', plan_id: plan.plan_id, approval_digest: plan.approval_digest!, approved: true})}>Repair this existing launcher</button></>}
        {canApply && <><label className="block text-sm text-workspace-text"><input type="checkbox" checked={approval} disabled={busy} onChange={e => setApproval(e.target.checked)} /> I approve the exact displayed plan and target. This writes these files; it does not start services.</label><button className={button} disabled={busy || !approval} onClick={() => void run({action: 'apply', plan_id: plan.plan_id, approval_digest: plan.approval_digest!, approved: true})}>Install this reviewed plan</button></>}
        {(unknown || !['PREPARED_NOT_INSTALLED', 'PREPARED_REPAIR_NOT_APPLIED'].includes(plan.phase)) && <button className={button} disabled={busy} onClick={() => void run({action: 'readback', plan_id: plan.plan_id})}>Check actual state</button>}
        {plan.phase === 'INSTALLED_READBACK_VERIFIED' && !canRollback && !unknown && <p className="text-xs text-workspace-muted">Rollback is unavailable for this plan. The CLI requires a previous installed generation; this is not an uninstall operation.</p>}
        {canRollback && <><label className="block text-sm text-workspace-text"><input type="checkbox" checked={rollbackApproval} disabled={busy} onChange={e => setRollbackApproval(e.target.checked)} /> I have stopped services using these files. Restore the previous CLI generation using the existing CLI rollback and saved evidence. Unrelated data is retained; rollback does not stop processes.</label><button className={button} disabled={busy || !rollbackApproval} onClick={() => void run({action: 'rollback', plan_id: plan.plan_id, approval_digest: plan.approval_digest!, approved: true})}>Roll back this plan</button></>}
      </div>}
      {busy && <p role="status" className="text-sm text-workspace-focus">Working on the real local request. Please keep HEX open; duplicate actions are disabled.</p>}
      {error && <p role="alert" className="text-sm text-workspace-danger whitespace-pre-wrap break-all">{error}{unknown ? ' Check actual state or reopen saved history before continuing.' : ''}</p>}
      <p className="text-xs text-workspace-muted">File installation is not service startup, protected-file admission, OAuth enrollment or a connected remote server. Unavailable components are not installed. CLI installation alone is not a complete HEX product installation; ibal and Studio are not included in this payload.</p>
    </>}
  </section>;
}
