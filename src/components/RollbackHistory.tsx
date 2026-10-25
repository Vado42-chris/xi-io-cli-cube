import React, {useEffect, useRef, useState} from 'react';
import {FileClock, FolderOpen, AlertTriangle} from 'lucide-react';
import {parseRollbackFiles} from '../lib/rollbackHistory.mjs';

/**
 * Read-only on-device diagnostic. The CLI installer's canonical metadata is
 * versions/<generation>/install-receipt.json + current/previous pointer files.
 * It does not currently emit a single canonical rollback-meta JSON.
 */
export default function RollbackHistory(){
  const request=useRef(0);
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
    const requestId=++request.current;
    setBusy(true);
    try{
      // Never ingest arbitrary project files from a selected directory.
      const relevant=Array.from(files).filter(f=>
        ['install-receipt.json','current','previous'].includes(f.name));
      if(relevant.length>32)throw new Error('Select at most 32 relevant metadata files');
      const entries=await Promise.all(relevant.map(async f=>({
        name:f.name,
        relativePath:f.webkitRelativePath||f.name,
        // Read only bounded candidate metadata. A larger file is rejected,
        // never uploaded or displayed.
        text:f.size>65536?'x'.repeat(65537):await f.text()
      })));
      if(requestId!==request.current)return;
      setHistory(parseRollbackFiles(entries));
      setSelected(true);
    }catch(error){
      if(requestId!==request.current)return;
      setHistory({state:'REJECTED',first_red:'LOCAL_FILE_READ_FAILED',
        records:[],pointers:{current:null,previous:null},
        issues:[error instanceof Error ? error.message : 'Unable to read selected local metadata.'],evidence:'LOCAL_USER_SELECTED_METADATA_ONLY',
        installedBinaryVerified:false,fullByteReadbackVerified:false});
      setSelected(true);
    }finally{if(requestId===request.current)setBusy(false);}
  }

  return (
    <section aria-labelledby="rollback-history-title"
      className="rounded-none border border-workspace-border bg-workspace-surface/70 p-5">
      <div className="flex items-start gap-3">
        <FileClock className="mt-0.5 h-5 w-5 shrink-0 text-workspace-focus" aria-hidden="true"/>
        <div className="min-w-0">
          <h3 id="rollback-history-title" className="text-base font-semibold text-workspace-text">
            Rollback History
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-workspace-muted">
            Inspect previously recorded CLI generations without executing commands or contacting a server.
            The V1 installer writes <code className="text-workspace-focus">versions/&lt;generation&gt;/install-receipt.json</code>
            and plain-text <code className="text-workspace-focus">current</code> / <code className="text-workspace-focus">previous</code> pointers.
            Select those files, or choose the installation folder if supported (32 relevant files maximum, 64 KiB each).
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <label className="flex-1 text-xs text-workspace-text" htmlFor="rollback-files">
          Select receipt or pointer files
          <input id="rollback-files" type="file" multiple
            aria-label="Select CLI install-receipt.json and current or previous files"
            onChange={e=>void inspect(e.currentTarget.files)}
            className="mt-1.5 block w-full rounded-none border border-workspace-border-strong bg-workspace-canvas p-2 text-xs text-workspace-text
              file:mr-3 file:rounded-none file:border-0 file:bg-workspace-surface file:px-3 file:py-1.5
              file:text-workspace-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-workspace-focus"/>
        </label>
        <label className="flex-1 text-xs text-workspace-text" htmlFor="rollback-folder">
          Select CLI install folder (supported browsers)
          <span className="mt-1.5 flex items-center gap-2 rounded-none border border-workspace-border-strong bg-workspace-canvas p-2">
            <FolderOpen className="h-4 w-4 shrink-0 text-workspace-focus" aria-hidden="true"/>
            <input ref={folderRef} id="rollback-folder" type="file" multiple
              aria-label="Select a CLI installation folder for read-only rollback history"
              onChange={e=>void inspect(e.currentTarget.files)}
              className="min-w-0 w-full text-xs text-workspace-text
                file:mr-3 file:rounded-none file:border-0 file:bg-workspace-surface file:px-3 file:py-1.5 file:text-workspace-text
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-workspace-focus"/>
          </span>
        </label>
      </div>

      <div aria-live="polite" className="mt-4 space-y-2 text-xs">
        {!selected
          ? <p className="rounded-none border border-workspace-border bg-workspace-canvas/70 p-3 text-workspace-muted">
              No local rollback metadata selected. No versions are assumed to be installed or qualified.
            </p>
          : busy
            ? <p className="text-workspace-muted">Reading selected metadata locally…</p>
            : <>
                <p className="text-workspace-muted">
                  Metadata: <strong className="text-workspace-text">{history.state}</strong>.
                  {' '}Recorded generations: {history.records.length}.
                  {' '}No binary or BINS content was independently read back.
                </p>
                {history.issues.length>0&&(
                  <div role="status" className="rounded-none border border-workspace-border-strong bg-workspace-surface/30 p-3 text-workspace-focus">
                    <div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true"/>
                      Some metadata could not be trusted:
                    </div>
                    <ul className="mt-2 list-disc pl-5">{history.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>
                  </div>
                )}
                {history.records.length===0&&(
                  <p className="rounded-none border border-workspace-border bg-workspace-canvas/70 p-3 text-workspace-muted">
                    No recognized CLI install receipts found. This does not prove an installation is absent.
                  </p>
                )}
                {history.records.map((row,index)=>(
                  <article key={(row.generation||'unknown')+'-'+index}
                    className="rounded-none border border-workspace-border bg-workspace-canvas/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="break-all font-mono text-workspace-text">
                        {row.generation||'Generation not recorded (legacy v1)'}
                      </span>
                      <span className="rounded border border-workspace-border-strong px-2 py-0.5 font-mono text-workspace-text">
                        {row.pointerState==='PREVIOUS_POINTER'?'Previous pointer (metadata)'
                          :row.pointerState==='CURRENT_POINTER'?'Current pointer (metadata)'
                          :'Pointer state unknown'}
                      </span>
                    </div>
                    {row.conflict&&<p className="mt-2 text-workspace-danger">POTENTIAL CONFLICT: differing records for the same reported scope/generation; none is authoritative.</p>}
                    <p className="mt-2 break-all text-workspace-muted">Recorded scope: {row.repo||'unknown repo'} / {row.prefix||'unknown prefix'} / {row.platform||'unknown platform'}. Host identity not supplied.</p>
                    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                      <div><dt className="text-workspace-muted">Source commit (Git SHA-1)</dt>
                        <dd className="break-all font-mono text-workspace-text">{row.sourceSha||'UNKNOWN'}</dd></div>
                      <div><dt className="text-workspace-muted">Recorded CLI entry bytes (SHA-256)</dt>
                        <dd className="break-all font-mono text-workspace-text">{row.cliFileSha256||'NOT RECORDED'}</dd></div>
                      <div><dt className="text-workspace-muted">Recorded installation time</dt>
                        <dd className="text-workspace-text">{row.installedAt||'UNKNOWN'}</dd></div>
                      <div><dt className="text-workspace-muted">Qualification</dt>
                        <dd className="text-workspace-focus">Not independently verified</dd></div>
                    </dl>
                  </article>
                ))}
              </>
        }
        <p className="text-workspace-muted">
          Privacy: selected files are parsed in this browser only; no upload, token read, network call,
          execution, installation or rollback occurs. Selection order is not rollback order. Receipts can precede failed install checks; pointers are unverified metadata, not current runtime proof. Recorded SHA-256 is not proof that a binary
          on disk still matches it. Node executable hashes are not recorded by these CLI receipts.
        </p>
      </div>
    </section>
  );
}
