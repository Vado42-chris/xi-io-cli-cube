import React, {useState} from 'react';
import {calculateDesktopSnap55} from '../math/snap55-desktop.mjs';

// Synthetic example only; no profile, private health history, storage or network.
// Source adapter requires literal decimal-string epochs, never rounded JSON numbers.
const EXAMPLE = JSON.stringify({
  questions: [
    {id: 'example-a', pillar: 'autism'},
    {id: 'example-b', pillar: 'adhd'}
  ],
  responses: {'example-a': 4, 'example-b': 0},
  nowMs: '1793200000000',
  decayMode: 'legacy_efold18',
  journal: [{timestamp: '1793196400000', sensoryEntropy: 50}]
}, null, 2);

export default function Snap55Workbench() {
  const [source, setSource] = useState(EXAMPLE);
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState('');
  function calculate() {
    setError('');
    setOutput(null);
    try { setOutput(calculateDesktopSnap55(source)); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'SNAP_CALCULATION_FAILED');
    }
  }
  return <section aria-label="Offline SNAP 5.5 maths workbench" data-hex-snap55-workbench className="space-y-4 border border-workspace-border bg-workspace-surface p-4">
    <div className="space-y-1">
      <h3 className="font-bold text-workspace-text text-lg">SNAP 5.5 · Offline Maths</h3>
      <p className="text-xs text-workspace-muted">Exact SDK source generation cfb7719. Local computation in this HEX window; no sign-in, network call, file write, Ward grant or provider effect.</p>
      <p className="text-xs text-workspace-muted">Historical Field Guide application heuristic, not the complete KM1–KM16 kernel, clinical validation or operational ROTFL authority.</p>
    </div>
    <div className="space-y-2">
      <label htmlFor="hex-snap55-input" className="text-sm font-semibold text-workspace-text">SNAP input JSON (synthetic example, editable)</label>
      <p className="text-xs text-workspace-muted">nowMs and journal timestamps must be quoted exact integer-millisecond strings. All required responses must be supplied for a numeric result.</p>
      <textarea
        id="hex-snap55-input"
        value={source}
        onChange={event => {setSource(event.target.value);setOutput(null);setError('');}}
        spellCheck={false}
        className="w-full min-h-[260px] font-mono text-xs p-3 border border-workspace-border-strong bg-workspace-canvas text-workspace-text"
        aria-label="SNAP 5.5 input JSON"
      />
      <button type="button" onClick={calculate} className="min-h-[44px] px-4 py-2 bg-workspace-focus text-workspace-inverse font-semibold focus-visible:ring-2 focus-visible:ring-workspace-focus">
        Calculate locally
      </button>
    </div>
    {error && <p role="alert" data-snap55-error className="text-sm text-workspace-danger">Calculation rejected: {error}</p>}
    {output && <div role="status" data-snap55-result className="space-y-2 border-t border-workspace-border pt-3" aria-live="polite">
      <div className="flex flex-wrap gap-4 text-sm text-workspace-text">
        <span>State: <strong data-snap55-state>{output.result.state}</strong></span>
        <span>R: <strong data-snap55-r>{output.result.R === null ? 'UNKNOWN' : String(output.result.R)}</strong></span>
        <span>Known: <strong>{output.result.known_count}/{output.result.question_denominator}</strong></span>
      </div>
      <p className="text-xs text-workspace-muted">COMPUTED means local arithmetic completed. It is not an authenticated runtime or permission receipt. Unknown input remains UNKNOWN.</p>
      <pre className="text-xs font-mono whitespace-pre-wrap break-words overflow-auto max-h-96 p-3 bg-workspace-canvas border border-workspace-border text-workspace-text">{JSON.stringify(output, null, 2)}</pre>
    </div>}
  </section>;
}
