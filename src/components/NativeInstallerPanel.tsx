import React, {useEffect, useRef, useState} from 'react';
import {createInstallerClient, installerStatus, nativeInstallerAvailable} from '../lib/nativeInstaller.mjs';

type Plan = {plan_id: string; phase: string; prefix?: string; components?: string[]; approval_digest?: string; payload_files?: number; payload_bytes?: number; created_at?: string; [key: string]: any};
type Request = {action: 'inspect'; plan_id?: string} | {action: 'prepare'; prefix: string; node: string; components: string[]} | {action: 'readback'; plan_id: string} | {action: 'apply' | 'rollback'; plan_id: string; approval_digest: string; approved: true};

/** Local native controls within the accepted Cube design, not another launcher. */
export default function NativeInstallerPanel() {
  const native = nativeInstallerAvailable();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prefix, setPrefix] = useState('');
  const [node, setNode] = useState('');
  const [components, setComponents] = useState(['cli', 'bins', 'switchboard']);
  const [history, setHistory] = useState<Plan[]>([]);
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
    const effect = request.action === 'apply' || request.action === 'rollback';
    if (effect) {setUnknown(true); setObserved(false);}
    try {
      const result = await client(request);
      if (select) {
        setPlan(result as Plan);
        const terminal = ['INSTALLED_READBACK_VERIFIED', 'ROLLED_BACK'].includes(result.phase);
        setObserved(request.action !== 'inspect' && terminal);
        setUnknown(Boolean(result.do_not_retry) || ['APPLYING', 'APPLY_OUTCOME_UNCERTAIN', 'ROLLING_BACK', 'ROLLBACK_OUTCOME_UNCERTAIN'].includes(result.phase));
      } else {
        setHistory(result.plans || []);
        setPrefix(current => current || result.prefix_suggestion || '');
        setNode(current => current || result.node_suggestion || '');
      }
      return result;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      if (effect || request.action === 'readback') setObserved(false);
    } finally {busyRef.current = false; setBusy(false);}
  }
  useEffect(() => {if (native) void run({action: 'inspect'}, false);}, []);
  function edit() {setPlan(null); setObserved(false); setApproval(false); setRollbackApproval(false);}
  const status = installerStatus(plan, observed);
  const canApply = plan?.phase === 'PREPARED_NOT_INSTALLED' && !unknown;
  const canRollback = plan?.phase === 'INSTALLED_READBACK_VERIFIED' && !unknown;
  const button = 'min-h-[44px] rounded-none border border-workspace-border-strong px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:border-workspace-border-strong';
  return <section aria-label="Native HEX installer" className="space-y-4 p-5 rounded-none border border-workspace-border-strong/40 bg-workspace-canvas">
    <div><h3 className="font-bold text-workspace-text">Install on this computer</h3>
      <p className="text-sm text-workspace-muted">Local Linux candidate · CLI, BINS and Switchboard files · No sign-in required</p></div>
    {!native ? <p role="status" className="text-sm text-workspace-focus">Native HEX is required. This browser preview cannot inspect, install or roll back files. The guides below are not proof of an installation.</p> : <>
      <p className="text-xs text-workspace-muted">Requires system Python 3.10+, bash and your selected Node 22.13+. Preparing a plan runs that Node executable to check its identity/version, but does not install the payload. Same capabilities on either computer; no fixed Loki/Aries role.</p>
      <fieldset disabled={busy || unknown} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-workspace-text">Absolute installation folder<input aria-label="Installation folder" value={prefix} onChange={e => {edit(); setPrefix(e.target.value);}} className="mt-1 w-full rounded bg-workspace-surface border border-workspace-border-strong p-2 font-mono" /></label>
        <label className="text-xs text-workspace-text">Absolute Node executable<input aria-label="Node executable" value={node} onChange={e => {edit(); setNode(e.target.value);}} className="mt-1 w-full rounded bg-workspace-surface border border-workspace-border-strong p-2 font-mono" /></label>
        <div className="flex flex-wrap gap-4 sm:col-span-2">{['cli', 'bins', 'switchboard'].map(name => <label key={name} className="text-sm"><input type="checkbox" checked={components.includes(name)} disabled={name === 'cli'} onChange={e => {edit(); setComponents(current => e.target.checked ? [...current, name] : current.filter(x => x !== name));}} /> {name.toUpperCase()}{name === 'cli' ? ' (required)' : ''}</label>)}</div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || unknown || !prefix.startsWith('/') || !node.startsWith('/')} onClick={() => void run({action: 'prepare', prefix, node, components})}>Check selected Node & prepare plan</button>
        <button className={button} disabled={busy} onClick={() => void run({action: 'inspect'}, false)}>Refresh saved history</button>
      </div>
      {history.length > 0 && <div className="space-y-2"><p className="text-xs text-workspace-muted">Saved history — not a current observation</p>{history.map(entry => <button key={entry.plan_id} className={`${button} block text-left w-full`} disabled={busy} onClick={() => void run({action: 'inspect', plan_id: entry.plan_id})}>{entry.created_at || entry.plan_id} · {entry.prefix || 'Unreadable evidence'} · {entry.phase}</button>)}</div>}
      {plan && <div className="space-y-3 border-t border-workspace-border-strong pt-4">
        <p role="status" className={`text-sm ${status.tone === 'success' && !unknown ? 'text-workspace-success' : 'text-workspace-focus'}`}>{unknown ? 'Outcome uncertain. Check actual state; do not repeat an operation.' : status.message}</p>
        <div className="text-xs font-mono text-workspace-text break-all"><p>Target: {plan.prefix}</p><p>Components: {plan.components?.join(', ')}</p><p>Payload: {plan.payload_files ?? '?'} files · {plan.payload_bytes ?? '?'} bytes</p><p>Plan: {plan.plan_id}</p><p>Receipts: {plan.receipt_directory || 'See saved plan evidence'}</p></div>
        <details className="text-xs"><summary className="cursor-pointer text-workspace-text">Exact file changes, source generations and receipts</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-workspace-muted">{JSON.stringify(plan, null, 2)}</pre></details>
        {canApply && <><label className="block text-sm text-workspace-text"><input type="checkbox" checked={approval} disabled={busy} onChange={e => setApproval(e.target.checked)} /> I approve the exact displayed plan and target. This writes these files; it does not start services.</label><button className={button} disabled={busy || !approval} onClick={() => void run({action: 'apply', plan_id: plan.plan_id, approval_digest: plan.approval_digest!, approved: true})}>Install this reviewed plan</button></>}
        {(unknown || plan.phase !== 'PREPARED_NOT_INSTALLED') && <button className={button} disabled={busy} onClick={() => void run({action: 'readback', plan_id: plan.plan_id})}>Check actual state</button>}
        {canRollback && <><label className="block text-sm text-workspace-text"><input type="checkbox" checked={rollbackApproval} disabled={busy} onChange={e => setRollbackApproval(e.target.checked)} /> I have stopped services using these files. Restore/remove exactly this plan's files using its saved receipts. Unrelated data is retained; rollback does not stop processes.</label><button className={button} disabled={busy || !rollbackApproval} onClick={() => void run({action: 'rollback', plan_id: plan.plan_id, approval_digest: plan.approval_digest!, approved: true})}>Roll back this plan</button></>}
      </div>}
      {busy && <p role="status" className="text-sm text-workspace-focus">Working on the real local request. Please keep HEX open; duplicate actions are disabled.</p>}
      {error && <p role="alert" className="text-sm text-workspace-danger whitespace-pre-wrap break-all">{error}{unknown ? ' Check actual state or reopen saved history before continuing.' : ''}</p>}
      <p className="text-xs text-workspace-muted">File installation is not service startup, protected-file admission, OAuth enrollment or a connected remote server. BINS foreground setup remains in the packaged interactive setup entry. ibal and Studio are not included in this component payload.</p>
    </>}
  </section>;
}
