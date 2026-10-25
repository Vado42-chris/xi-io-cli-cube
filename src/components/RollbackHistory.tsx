import React, { useState } from 'react';
import { buildRollbackHistory } from '../lib/rollbackHistory.mjs';

/**
 * Browser-native local-file read only. Browser sandboxes cannot silently read
 * $HOME/.local/share/xi-io/cli-v1, nor may this widget call Switchboard.
 * Users explicitly select their own CLI install directory or receipt files.
 * No local path, metadata, or binary bytes are sent to any server/persistence.
 */
const MAX_SELECTED_FILES = 256;
const MAX_RECEIPT_BYTES = 160_000;
const MAX_SOURCE_BYTES = 8_000_000;
function kind(path: string) {
  if (/(?:^|\/)versions\/[^/]+\/install-receipt\.json$/.test(path) || path === 'install-receipt.json') return 'receipt';
  if (/(?:^|\/)versions\/[^/]+\/src\/xiio\.mjs$/.test(path)) return 'binary';
  if (/(?:^|\/)(current|previous)$/.test(path)) return 'pointer';
  return 'ignore';
}
async function inspectSelectedFiles(list: FileList | null) {
  if (!list || !list.length) return buildRollbackHistory([]);
  if (list.length > MAX_SELECTED_FILES) return buildRollbackHistory(new Array(MAX_SELECTED_FILES + 1));
  const rows: Array<{path:string,content?:string,sha256?:string}> = [];
  for (const file of Array.from(list)) {
    const path = file.webkitRelativePath || file.name;
    const type = kind(path);
    if (type === 'ignore') continue;
    if (type === 'receipt' && file.size > MAX_RECEIPT_BYTES) {
      rows.push({path,content:''}); continue;
    }
    if (type === 'pointer' && file.size > 256) {
      rows.push({path,content:''}); continue;
    }
    if (type === 'binary') {
      if (file.size > MAX_SOURCE_BYTES || !globalThis.crypto?.subtle) {
        rows.push({path,sha256:''}); continue;
      }
      const hash = await globalThis.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
      rows.push({path,sha256});
    } else rows.push({path,content:await file.text()});
  }
  return buildRollbackHistory(rows);
}

type Projection = ReturnType<typeof buildRollbackHistory>;

export default function RollbackHistory() {
  const [record,setRecord] = useState<Projection|null>(null);
  const [working,setWorking] = useState(false);
  const [readError,setReadError] = useState<string|null>(null);
  const load = async (event:React.ChangeEvent<HTMLInputElement>) => {
    setWorking(true);
    setReadError(null);
    try {
      const result = await inspectSelectedFiles(event.currentTarget.files);
      setRecord(result);
    } catch {
      setRecord(null);
      setReadError('LOCAL_FILE_READ_FAILED: Selection could not be parsed. No files were changed.');
    } finally {
      setWorking(false);
      event.currentTarget.value = '';
    }
  };
  return (
    <section aria-labelledby="rollback-history-title" className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
      <div>
        <h4 id="rollback-history-title" className="text-sm font-bold text-white">Rollback History — recorded CLI generations</h4>
        <p className="text-xs text-slate-400 mt-1">
          Choose a local CLI V1 installation folder to inspect its current/previous pointers,
          version receipts and installed source-file hashes. Nothing is uploaded or modified.
          A receipt is historical evidence, not proof that this host currently runs that version.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-200 font-semibold">
          Select CLI installation folder
          <input type="file" multiple {...({webkitdirectory:''} as any)} onChange={load}
            disabled={working} aria-label="Choose CLI V1 installation directory"
            className="block mt-1 w-full max-w-sm text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-amber-400 file:px-3 file:py-1.5 file:text-slate-950" />
        </label>
        <label className="text-xs text-slate-200 font-semibold">
          Or select receipt and pointer files
          <input type="file" multiple onChange={load} disabled={working}
            aria-label="Choose CLI installation receipt files"
            className="block mt-1 w-full max-w-sm text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-white" />
        </label>
      </div>
      <p className="text-[11px] text-slate-400">
        Source: xiio.cli.install-receipt/v2, <code>versions/&lt;generation&gt;/install-receipt.json</code>,
        and optional <code>current</code>, <code>previous</code>, <code>src/xiio.mjs</code>.
        A browser requires your explicit file selection. Folder selection support varies by browser.
      </p>
      <div aria-live="polite" className="space-y-3">
        {working && <p className="text-xs text-amber-300">Reading selected files locally…</p>}
        {readError && <p role="alert" className="text-xs text-rose-300">{readError}</p>}
        {!record && !working && <p className="text-xs text-slate-400">No local rollback history loaded.</p>}
        {record && (
          <>
            <p className="text-xs text-slate-300">
              <strong>{record.entries.length}</strong> recorded generation(s).
              {record.state==='REVIEW_REQUIRED' ? ' Some records require review.' :
               ' Installed host state and release qualification remain unverified.'}
            </p>
            {record.problems.length>0 && (
              <ul role="alert" className="text-xs font-mono text-rose-300 list-disc list-inside space-y-1">
                {record.problems.map((p,i)=><li key={i}>{p}</li>)}
              </ul>
            )}
            {record.entries.length>0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-950 text-slate-300">
                    <tr>
                      <th scope="col" className="p-3">Generation</th>
                      <th scope="col" className="p-3">Installed at (receipt)</th>
                      <th scope="col" className="p-3">Source SHA</th>
                      <th scope="col" className="p-3">Recorded CLI source-file SHA-256</th>
                      <th scope="col" className="p-3">Byte observation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.entries.map(item=>(
                      <tr key={item.generation} className="border-t border-slate-800 align-top">
                        <td className="p-3">
                          <div className="break-all font-mono text-slate-200">{item.generation}</div>
                          <div className="mt-1 text-[10px] text-amber-300">{item.pointer.replace(/_/g,' ')}</div>
                        </td>
                        <td className="p-3 text-slate-300">{item.installedAt}</td>
                        <td className="p-3 font-mono break-all text-slate-300">{item.sourceSha}</td>
                        <td className="p-3 font-mono break-all text-slate-300">{item.recordedBinarySha256}</td>
                        <td className="p-3">
                          <span className={item.byteState==='BYTE_MISMATCH'?'text-rose-300':item.byteState==='BYTE_MATCH'?'text-amber-300':'text-slate-400'}>
                            {item.byteState==='BYTE_MATCH'?'Selected bytes match receipt (not runtime proof)':
                              item.byteState==='BYTE_MISMATCH'?'HASH MISMATCH — do not promote':'Binary not selected; receipt only'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
