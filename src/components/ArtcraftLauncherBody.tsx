import React, {useEffect, useRef, useState} from 'react';
import {mountArtcraftLauncher} from '../lib/artcraftLauncherMount.mjs';

type LauncherLifecycle = {pending: Promise<void>; cleanupFailure: string | null};

type LauncherModule = {mount_launcher(canvas: HTMLCanvasElement): Promise<{destroy(): void; free(): void}>};

// Real donor canvas only. The installed asset owner supplies this loader after
// compiling and qualifying the hosted-canvas donor; no remote/default fallback.
export default function ArtcraftLauncherBody({loadModule, lifecycle}: {loadModule?: () => Promise<LauncherModule>; lifecycle?: LauncherLifecycle}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const local = useRef<LauncherLifecycle>({pending: Promise.resolve(), cleanupFailure: null});
  const owner = lifecycle || local.current;
  const [status, setStatus] = useState('loading');
  const [openResult, setOpenResult] = useState('');
  const [opening, setOpening] = useState(false);
  async function openProduct(productId: string) {
    if (opening) return;
    setOpening(true); setOpenResult('');
    try {
      if (!/^[a-z][a-z0-9._-]{0,127}$/.test(productId) || productId.includes('..'))
        throw new Error('PRODUCT_IDENTITY_INVALID');
      const invoke = (globalThis as typeof globalThis & {__TAURI__?: {core?: {invoke?: (name:string, args:object)=>Promise<unknown>}}}).__TAURI__?.core?.invoke;
      if (typeof invoke !== 'function') throw new Error('NATIVE_HEX_REQUIRED');
      const result = await invoke('native_product_open', {productId});
      // A returned command response does not establish a displayed window.
      if (!result || typeof result !== 'object' ||
          (result as {state?:string}).state !== 'NATIVE_PRODUCT_WINDOW_READBACK_VERIFIED')
        throw new Error('NATIVE_PRODUCT_OPEN_UNVERIFIED');
      setOpenResult('NATIVE_PRODUCT_WINDOW_READBACK_VERIFIED');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setOpenResult(/^[A-Z][A-Z0-9_]{4,90}$/.test(msg) ? msg : 'NATIVE_PRODUCT_OPEN_REFUSED');
    } finally { setOpening(false); }
  }
  useEffect(() => {
    let active = true;
    let lease: ReturnType<typeof mountArtcraftLauncher> | undefined;
    setStatus('loading');
    // Serialize React effect replacement, including StrictMode replay, until
    // an interrupted asynchronous runner has resolved and been disposed.
    const current = owner.pending.then(async () => {
      if (!active) return;
      if (owner.cleanupFailure) {
        setStatus(owner.cleanupFailure);
        return;
      }
      try {
        lease = mountArtcraftLauncher({canvas: canvas.current, loadModule});
        const result = await lease.ready;
        if (active) setStatus(result.status);
      } catch (error) {
        if (error instanceof Error && ['ARTCRAFT_CLEANUP_UNVERIFIED', 'ARTCRAFT_DONOR_HANDLE_INVALID'].includes(error.message))
          owner.cleanupFailure = error.message;
        if (active) setStatus(error instanceof Error && /^ARTCRAFT_[A-Z_]+$/.test(error.message) ? error.message : 'ARTCRAFT_MOUNT_FAILED');
      }
    });
    owner.pending = current;
    return () => {
      active = false;
      try {
        lease?.dispose();
      } catch (error) {
        // A donor cleanup failure must not tear down the shared React shell.
        // Keep the canvas blocked and show the failure on a replacement effect.
        owner.cleanupFailure ||= error instanceof Error ? error.message : 'ARTCRAFT_CLEANUP_UNVERIFIED';
      }
    };
  }, [loadModule, owner]);
  return <section aria-label="HEX launcher body" className="h-full min-h-0 relative" data-artcraft-mount-status={status}>
    <canvas ref={canvas} aria-label="HEX software marketplace" className="w-full h-full block" />
    <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3" data-hex-native-open="registered-only">
      <button type="button" onClick={() => void openProduct('sam_law')}
        disabled={opening}
        className="rounded border px-3 py-2 text-sm bg-black/80 text-white disabled:opacity-50">
        Open SAM_LAW in HEX
      </button>
      {openResult && <span role="status" className="text-sm bg-black/80 text-white px-2 py-1">{openResult}</span>}
    </div>
    <p className="absolute top-3 left-3 right-3 pointer-events-none"
      role={status === 'loading' || status === 'mounted' ? 'status' : 'alert'}
      aria-label={status === 'mounted' ? 'HEX software marketplace initialized' : undefined}>
      {status === 'mounted' ? 'ArtCraft launcher initialized' : status}
    </p>
  </section>;
}
