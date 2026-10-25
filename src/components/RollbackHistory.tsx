import React, {useEffect, useRef, useState} from 'react';
import {FileClock, FolderOpen, AlertTriangle} from 'lucide-react';
import {parseRollbackFiles} from '../lib/rollbackHistory.mjs';

/**
 * Read-only on-device diagnostic. The CLI installer's canonical metadata is
 * versions/<generation>/install-receipt.json + current/previous pointer files.
 * It does not currently emit a single canonical rollback-meta JSON.
 */
export default function RollbackHistory(){
  const folderRef=useRef<HTMLInputElement>(null);
  const [history,setHistory]=useState<ReturnType<typeof parseRollbackFiles>>(
    ()=>parseRollbackFiles([])
  );
  const [selected,setSelected]=useState(false);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    // Directory selection is progressive enhancement (Chromium). The normal
    // multi-file input remains available on browsers without this feature.
    folderRef.current?.setAttribute('webkitdirectory','');
    folderRef.current?.setAttribute('directory','');
  },[]);

  async function inspect(files: FileList | null){
    if(!files||!files.length)return;
    setBusy(true);
    try{
      // Never ingest arbitrary project files from a selected directory.
      const relevant=Array.from(files).filter(f=>
        ['install-receipt.json','current','previous'].includes(f.name));
      const entries=await Promise.all(relevant.map(async f=>({
        name:f.name,
        relativePath:f.webkitRelativePath||f.name,
        // Read only bounded candidate metadata. A larger file is rejected,
        // never uploaded or displayed.
        text:f.size>262144?'x'.repeat(262145):await f.text()
      })));
      setHistory(parseRollbackFiles(entries));
      setSelected(true);
    }catch{
      setHistory({state:'REJECTED',first_red:'LOCAL_FILE_READ_FAILED',
        records:[],pointers:{current:null,previous:null},
        issues:['Unable to read selected local metadata.'],evidence:'LOCAL_USER_SELECTED_METADATA_ONLY',
        installedBinaryVerified:false,fullByteReadbackVerified:false});
      setSelected(true);
    }finally{setBusy(false);}
  }

  return (
    <section aria-labelledby="rollback-history-title"
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-start gap-3">
        <FileClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true"/>
        <div className="min-w-0">
          <h3 id="rollback-history-title" className="text-base font-semibold text-white">
            Rollback History
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Inspect previously recorded CLI generations without executing commands or contacting a server.
            The V1 installer writes <code className="text-amber-300">versions/&lt;generation&gt;/install-receipt.json</code>
            and plain-text <code className="text-amber-300">current</code> / <code className="text-amber-300">previous</code> pointers.
            Select those files, or choose the installation folder if supported.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <label className="flex-1 text-xs text-slate-300" htmlFor="rollback-files">
          Select receipt or pointer files
          <input id="rollback-files" type="file" multiple
            aria-label="Select CLI install-receipt.json and current or previous files"
            onChange={e=>void inspect(e.currentTarget.files)}
            className="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300
              file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5
              file:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"/>
        </label>
        <label className="flex-1 text-xs text-slate-300" htmlFor="rollback-folder">
          Select CLI install folder (supported browsers)
          <span className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 p-2">
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true"/>
            <input ref={folderRef} id="rollback-folder" type="file" multiple
              aria-label="Select a CLI installation folder for read-only rollback history"
              onChange={e=>void inspect(e.currentTarget.files)}
              className="min-w-0 w-full text-xs text-slate-300
                file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-100
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"/>
          </span>
        </label>
      </div>

      <div aria-live="polite" className="mt-4 space-y-2 text-xs">
        {!selected
          ? <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-slate-400">
              No local rollback metadata selected. No versions are assumed to be installed or qualified.
            </p>
          : busy
            ? <p className="text-slate-400">Reading selected metadata locally…</p>
            : <>
                <p className="text-slate-400">
                  Metadata: <strong className="text-slate-200">{history.state}</strong>.
                  {' '}Recorded generations: {history.records.length}.
                  {' '}No binary or BINS content was independently read back.
                </p>
                {history.issues.length>0&&(
                  <div role="status" className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-amber-200">
                    <div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true"/>
                      Some metadata could not be trusted:
                    </div>
                    <ul className="mt-2 list-disc pl-5">{history.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>
                  </div>
                )}
                {history.records.length===0&&(
                  <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-slate-400">
                    No recognized CLI install receipts found. This does not prove an installation is absent.
                  </p>
                )}
                {history.records.map((row,index)=>(
                  <article key={(row.generation||'unknown')+'-'+index}
                    className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="break-all font-mono text-slate-100">
                        {row.generation||'Generation not recorded (legacy v1)'}
                      </span>
                      <span className="rounded border border-slate-700 px-2 py-0.5 font-mono text-slate-300">
                        {row.pointerState==='PREVIOUS_POINTER'?'Previous pointer (metadata)'
                          :row.pointerState==='CURRENT_POINTER'?'Current pointer (metadata)'
                          :'Pointer state unknown'}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                      <div><dt className="text-slate-500">Source commit (Git SHA-1)</dt>
                        <dd className="break-all font-mono text-slate-300">{row.sourceSha||'UNKNOWN'}</dd></div>
                      <div><dt className="text-slate-500">Recorded CLI entry bytes (SHA-256)</dt>
                        <dd className="break-all font-mono text-slate-300">{row.cliFileSha256||'NOT RECORDED'}</dd></div>
                      <div><dt className="text-slate-500">Recorded installation time</dt>
                        <dd className="text-slate-300">{row.installedAt||'UNKNOWN'}</dd></div>
                      <div><dt className="text-slate-500">Qualification</dt>
                        <dd className="text-amber-300">Not independently verified</dd></div>
                    </dl>
                  </article>
                ))}
              </>
        }
        <p className="text-slate-500">
          Privacy: selected files are parsed in this browser only; no upload, token read, network call,
          execution, installation or rollback occurs. Recorded SHA-256 is not proof that a binary
          on disk still matches it. Node executable hashes are not recorded by these CLI receipts.
        </p>
      </div>
    </section>
  );
}
