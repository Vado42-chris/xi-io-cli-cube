import React, {useRef, useState} from 'react';
import {readSelectedReceipts, MAX_RECEIPT_FILES} from './rollback-history.mjs';

export default function RollbackHistory() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof readSelectedReceipts>>>({rows:[], errors:[]});
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  async function selectReceipts(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const current = ++request.current;
    setLoading(true);
    setResult({rows:[], errors:[]});
    const next = await readSelectedReceipts(files);
    if (current === request.current) { setResult(next); setLoading(false); }
  }
  return (
    <section aria-labelledby="rollback-history-title" className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
      <h3 id="rollback-history-title" className="text-base font-bold text-white mb-2">Rollback History — selected installation receipts</h3>
      <p className="text-xs text-slate-400 mb-3">Read-only local view. Select individual versions/&lt;generation&gt;/install-receipt.json files. No files are uploaded, changed, or rolled back.</p>
      <p className="text-xs text-amber-300 mb-4">RECORDED / UNVERIFIED: receipts can describe staged or failed installs. They do not prove current runtime, successful installation, rollback eligibility, or rollback order. The installer stores current and previous as separate plaintext pointers; these are not read here. Dates below are recorded timestamps, not an inferred sequence. Records are separated by reported repository, prefix and platform; no host identity is supplied, so matching scopes do not prove the same host.</p>
      <label htmlFor="rollback-receipts" className="block text-sm text-slate-200 mb-2">Choose install-receipt.json files (up to {MAX_RECEIPT_FILES}, 64 KiB each)</label>
      <input id="rollback-receipts" type="file" accept=".json,application/json" multiple onChange={selectReceipts} className="block max-w-full text-xs text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded file:border-0 file:bg-slate-800 file:text-amber-300" />
      <div aria-live="polite" className="mt-4 text-xs text-slate-400">
        {loading ? 'Reading selected receipts…' : `${result.rows.length} distinct selected record(s).`}
        {!loading && result.rows.length === 0 && <p className="mt-2">No history loaded. Select receipts to inspect recorded generations; this page never scans your filesystem.</p>}
      </div>
      {result.errors.length > 0 && <ul role="alert" className="mt-3 space-y-1 text-xs text-rose-300">{result.errors.map((error,index)=><li key={index}>{error}</li>)}</ul>}
      <div className="mt-4 space-y-3">
        {result.rows.map((row,index)=><article key={index} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs break-all">
          <p className={row.conflict ? 'font-semibold text-rose-300' : 'font-semibold text-amber-300'}>{row.conflict ? 'POTENTIAL CONFLICT — same recorded scope/generation differs; host identity unknown' : 'RECORDED / UNVERIFIED'}</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-[9rem_1fr] text-slate-300">
            <dt>Generation</dt><dd className="font-mono">{row.receipt.generation}</dd>
            <dt>Recorded install time</dt><dd>{row.receipt.installed_at}</dd>
            <dt>Repository / ref</dt><dd>{row.receipt.repo} / {row.receipt.ref}</dd>
            <dt>Source commit</dt><dd className="font-mono">{row.receipt.source_sha}</dd>
            <dt>CLI file SHA-256</dt><dd className="font-mono">{row.receipt.files['src/xiio.mjs']}</dd>
            <dt>Recorded prefix</dt><dd>{row.receipt.prefix}</dd>
            <dt>Recorded environment</dt><dd>{row.receipt.platform}; Node {row.receipt.node}</dd>
            <dt>Identical selections</dt><dd>{row.copies}</dd>
          </dl>
        </article>)}
      </div>
    </section>
  );
}
