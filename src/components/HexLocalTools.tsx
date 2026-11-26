import React, {useCallback, useEffect, useRef, useState} from 'react';
import LocalJourneyControls, {type LocalPlanSnapshot} from './LocalJourneyControls';
import {createInstallerClient, nativeInstallerAvailable} from '../lib/nativeInstaller.mjs';
import {selectNativeDirectory} from '../lib/nativeDirectory.mjs';

/** Existing local checks, composed without the retired onboarding screens. */
export default function HexLocalTools({active}: {active: boolean}) {
  const native = nativeInstallerAvailable();
  const [workspace, setWorkspace] = useState('');
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [planSnapshot, setPlanSnapshot] = useState<LocalPlanSnapshot>({plans: [], busy: false, error: ''});
  const requestLock = useRef(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const tryAcquire = useCallback(() => {
    if (!mounted.current || requestLock.current) return false;
    requestLock.current = true;
    setRequestBusy(true);
    return true;
  }, []);
  const release = useCallback(() => {
    requestLock.current = false;
    if (mounted.current) setRequestBusy(false);
  }, []);
  const requestGate = {busy: requestBusy, tryAcquire, release};
  const refreshPlans = useCallback(async () => {
    if (!native || !tryAcquire()) return;
    setPlanSnapshot({plans: [], busy: true, error: ''});
    try {
      const client = createInstallerClient((command: string, args: object) => (globalThis as any).__TAURI__.core.invoke(command, args));
      const result = await client({action: 'inspect'});
      if (!Array.isArray(result.plans)) throw new Error('Saved installation list was unreadable. Refresh to check again.');
      if (mounted.current) setPlanSnapshot({plans: result.plans, busy: false, error: ''});
    } catch (failure) {
      if (mounted.current) setPlanSnapshot({plans: [], busy: false, error: failure instanceof Error ? failure.message : String(failure)});
    } finally {release();}
  }, [native, tryAcquire, release]);
  useEffect(() => {if (active) void refreshPlans();}, [active, refreshPlans]);
  async function chooseWorkspace() {
    if (choosing) return;
    setChoosing(true); setError('');
    try {
      const selected = await selectNativeDirectory('workspace');
      if (selected !== null) setWorkspace(selected);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally { setChoosing(false); }
  }
  return <section data-hex-local-tools aria-label="Local tools" className="space-y-6 p-6 text-workspace-text">
    <header className="space-y-2"><h1 className="text-3xl font-semibold">Local tools</h1><p className="text-workspace-muted">Check your installed CLI, local AI and workspace files.</p></header>
    <div className="space-y-3"><h2 className="text-lg font-semibold">Workspace</h2><p className="break-all text-sm">{workspace || 'Choose a folder for the disposable file check.'}</p><button type="button" className="min-h-[48px] border border-workspace-border-strong px-4 py-2 disabled:opacity-40" disabled={!nativeInstallerAvailable() || choosing} onClick={() => void chooseWorkspace()}>Choose workspace folder</button>{error && <p role="alert">{error}</p>}</div>
    <div className="space-y-2" aria-label="Saved installations for local checks">
      <button type="button" className="min-h-[48px] border border-workspace-border-strong px-4 py-2 disabled:opacity-40" disabled={!native || !active || requestBusy} onClick={() => void refreshPlans()}>Refresh saved installations</button>
      {planSnapshot.busy && <p role="status">Reading saved installations…</p>}
      {planSnapshot.error && <p role="alert">{planSnapshot.error}</p>}
    </div>
    <LocalJourneyControls active={active} step={4} workspace={workspace} planId={planId} onPlanId={setPlanId} planSnapshot={planSnapshot} requestGate={requestGate} />
    <LocalJourneyControls active={active} step={5} workspace={workspace} planId={planId} onPlanId={setPlanId} planSnapshot={planSnapshot} requestGate={requestGate} />
  </section>;
}
