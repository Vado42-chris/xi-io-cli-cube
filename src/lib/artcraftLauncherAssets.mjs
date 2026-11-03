// Only fixed, package-owned assets. These bounded failure codes do not expose
// browser exception text, URLs, provider data or credentials to native receipts.
let current;
export async function loadPackagedArtcraftLauncher() {
  if (!current) {
    current = (async () => {
      const script = new URL('/donor/artcraft-launcher-web/launcher.js', window.location.href);
      const wasm = new URL('/donor/artcraft-launcher-web/launcher_bg.wasm', window.location.href);
      let phase = 'import';
      let policyFailure = null;
      const policy = event => {
        if (event.disposition !== 'enforce') return;
        const directive = event.effectiveDirective;
        if (phase === 'import' && ['script-src', 'script-src-elem'].includes(directive) && event.blockedURI === script.href)
          policyFailure = 'ARTCRAFT_LOCAL_MODULE_IMPORT_FAILED_WITH_LOCAL_POLICY_EVENT';
        if (phase === 'initialize' && directive === 'connect-src' && event.blockedURI === wasm.href)
          policyFailure = 'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_LOCAL_FETCH_POLICY_EVENT';
        if (phase === 'initialize' && directive === 'script-src' && ['wasm-eval', 'eval'].includes(event.blockedURI))
          policyFailure = 'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_UNATTRIBUTED_COMPILE_POLICY_EVENT';
      };
      window.addEventListener('securitypolicyviolation', policy);
      try {
        const module = await import(/* @vite-ignore */ script.href);
        if (typeof module.default !== 'function' || typeof module.mount_launcher !== 'function')
          throw new Error('ARTCRAFT_GENERATED_EXPORTS_UNBOUND');
        phase = 'initialize';
        await module.default({module_or_path: wasm.href});
        return module;
      } catch (error) {
        // Policy events may be queued behind the rejected import/compile promise.
        // This records correlation only, not proof that the event caused this failure.
        // No event means no policy classification; never infer it from a generic error.
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const code = policyFailure || (error?.message === 'ARTCRAFT_GENERATED_EXPORTS_UNBOUND'
          ? error.message : phase === 'import' ? 'ARTCRAFT_LOCAL_MODULE_IMPORT_FAILED' : 'ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED');
        throw new Error(code, {cause: error});
      } finally {
        window.removeEventListener('securitypolicyviolation', policy);
      }
    })().catch(error => { current = undefined; throw error; });
  }
  return current;
}
