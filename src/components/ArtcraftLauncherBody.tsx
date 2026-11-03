import React, {useEffect, useRef, useState} from 'react';
import {mountArtcraftLauncher} from '../lib/artcraftLauncherMount.mjs';

type LauncherModule = {mount_launcher(canvas: HTMLCanvasElement): Promise<{destroy(): void; free(): void}>};

// Real donor canvas only. The installed asset owner supplies this loader after
// compiling and qualifying the hosted-canvas donor; no remote/default fallback.
export default function ArtcraftLauncherBody({loadModule}: {loadModule?: () => Promise<LauncherModule>}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<Promise<void>>(Promise.resolve());
  const cleanupFailure = useRef<string | null>(null);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    let active = true;
    let lease: ReturnType<typeof mountArtcraftLauncher> | undefined;
    setStatus('loading');
    // Serialize React effect replacement, including StrictMode replay, until
    // an interrupted asynchronous runner has resolved and been disposed.
    const current = previous.current.then(async () => {
      if (!active) return;
      if (cleanupFailure.current) {
        setStatus(cleanupFailure.current);
        return;
      }
      try {
        lease = mountArtcraftLauncher({canvas: canvas.current, loadModule});
        const result = await lease.ready;
        if (active) setStatus(result.status);
      } catch (error) {
        if (error instanceof Error && error.message === 'ARTCRAFT_CLEANUP_UNVERIFIED')
          cleanupFailure.current = error.message;
        if (active) setStatus(error instanceof Error ? error.message : 'ARTCRAFT_MOUNT_FAILED');
      }
    });
    previous.current = current;
    return () => {
      active = false;
      try {
        lease?.dispose();
      } catch (error) {
        // A donor cleanup failure must not tear down the shared React shell.
        // Keep the canvas blocked and show the failure on a replacement effect.
        cleanupFailure.current = error instanceof Error ? error.message : 'ARTCRAFT_CLEANUP_UNVERIFIED';
      }
    };
  }, [loadModule]);
  return <section aria-label="HEX launcher body" className="h-full min-h-0 relative" data-artcraft-mount-status={status}>
    <canvas ref={canvas} aria-label="HEX software marketplace" className="w-full h-full block" />
    {status !== 'mounted' && <p role={status === 'loading' ? 'status' : 'alert'}>{status}</p>}
  </section>;
}
