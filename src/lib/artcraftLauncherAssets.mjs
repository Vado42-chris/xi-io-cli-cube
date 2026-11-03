// Fixed, package-owned assets only. No URL, credentials or provider settings
// are accepted from product data. Compilation alone is not a rendered body.
let current;
export async function loadPackagedArtcraftLauncher() {
  if (!current) {
    current = (async () => {
      const script = new URL('/donor/artcraft-launcher-web/launcher.js', window.location.href);
      const wasm = new URL('/donor/artcraft-launcher-web/launcher_bg.wasm', window.location.href);
      const module = await import(/* @vite-ignore */ script.href);
      if (typeof module.default !== 'function' || typeof module.mount_launcher !== 'function')
        throw new Error('ARTCRAFT_GENERATED_EXPORTS_UNBOUND');
      await module.default({module_or_path: wasm.href});
      return module;
    })().catch(error => { current = undefined; throw error; });
  }
  return current;
}
