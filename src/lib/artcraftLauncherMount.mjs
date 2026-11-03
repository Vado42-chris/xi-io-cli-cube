// Consumer for the explicitly adapted donor mount_launcher export.
// loadModule must supply the initialized, pinned local WASM module.
// This does not select assets, authorize effects or replace the donor UI.
const owners = new WeakMap();

export function mountArtcraftLauncher({canvas, loadModule}) {
  const Canvas = canvas?.ownerDocument?.defaultView?.HTMLCanvasElement;
  if (!Canvas || !(canvas instanceof Canvas) || !canvas.isConnected)
    throw new Error('ARTCRAFT_CONNECTED_CANVAS_REQUIRED');
  if (typeof loadModule !== 'function')
    throw new Error('ARTCRAFT_MODULE_LOADER_UNBOUND');
  if (owners.has(canvas)) throw new Error('ARTCRAFT_CANVAS_ALREADY_OWNED');
  const owner = {};
  owners.set(canvas, owner);
  let disposed = false;
  let handle = null;
  let cleanupFailed = false;
  const release = () => {
    if (owners.get(canvas) === owner) owners.delete(canvas);
  };
  const cleanup = () => {
    if (!handle) return;
    const current = handle;
    handle = null;
    let failure = null;
    try { current.destroy(); } catch (error) { failure = error; }
    try { current.free(); } catch (error) { failure ||= error; }
    if (failure) {
      // Do not admit another runner on a canvas whose cleanup is uncertain.
      cleanupFailed = true;
      throw new Error('ARTCRAFT_CLEANUP_UNVERIFIED', {cause: failure});
    }
    release();
  };
  const ready = (async () => {
    try {
      const module = await loadModule();
      if (disposed || !canvas.isConnected) { release(); return {status: 'disposed'}; }
      if (typeof module?.mount_launcher !== 'function')
        throw new Error('ARTCRAFT_DONOR_EXPORT_UNBOUND');
      try { handle = await module.mount_launcher(canvas); }
      catch (error) { throw new Error('ARTCRAFT_RUNNER_START_FAILED', {cause: error}); }
      if (typeof handle?.destroy !== 'function' || typeof handle?.free !== 'function') {
        cleanupFailed = true;
        throw new Error('ARTCRAFT_DONOR_HANDLE_INVALID');
      }
      if (disposed || !canvas.isConnected) {
        cleanup();
        return {status: 'disposed'};
      }
      return {status: 'mounted'};
    } catch (error) {
      if (!cleanupFailed) release();
      throw error;
    }
  })();
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      // Pending startup keeps its ownership until it resolves and is cleaned.
      cleanup();
    },
  };
}
