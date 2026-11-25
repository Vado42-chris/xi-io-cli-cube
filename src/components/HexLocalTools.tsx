import React, {useState} from 'react';
import LocalJourneyControls from './LocalJourneyControls';
import {nativeInstallerAvailable} from '../lib/nativeInstaller.mjs';
import {selectNativeDirectory} from '../lib/nativeDirectory.mjs';

/** Existing local checks, composed without the retired onboarding screens. */
export default function HexLocalTools() {
  const [workspace, setWorkspace] = useState('');
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);
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
    <LocalJourneyControls step={4} workspace={workspace} planId={planId} onPlanId={setPlanId} />
    <LocalJourneyControls step={5} workspace={workspace} planId={planId} onPlanId={setPlanId} />
  </section>;
}
