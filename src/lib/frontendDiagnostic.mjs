// Observation only: never read DOM content, URLs, error objects or user settings.
// nodes order: React root, shared frame, product host, shadow workspace.
// Each tuple: present, width (clamped px), height (clamped px), computed visible.
export function startFrontendDiagnostic(view) {
  const invoke = view.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== 'function') return {};
  const errors = [0, 0, 0, 0, 0];
  // Only fixed codes reach the native log. Never transmit raw blockedURI,
  // document URLs, source files, inline text, or CSP sample values.
  // Directives: 1 connect, 2 script, 3 style, 4 font, 5 image,
  // 6 worker, 7 default. Targets: 1 same origin, 2 exact local ArtCraft WASM,
  // 3 cross origin, 4 data, 5 blob/inline.
  const csp = [0, 0];
  const directiveCodes = {
    'connect-src': 1, 'script-src': 2, 'script-src-elem': 2,
    'style-src': 3, 'style-src-elem': 3, 'font-src': 4,
    'img-src': 5, 'worker-src': 6, 'default-src': 7,
  };
  const policyViolation = event => {
    errors[4] = Math.min(255, errors[4] + 1);
    try {
      const code = directiveCodes[event?.effectiveDirective] || 0;
      if (!code || csp[0] === 1 || (csp[0] && code !== 1)) return;
      // A malformed or unavailable blocked URI must not erase the directive.
      csp[0] = code; csp[1] = 0;
      let kind = 0;
      const raw = event?.blockedURI;
      if (typeof raw === 'string' && raw.length <= 2048) {
        if (raw === 'inline' || raw === 'eval') kind = 5;
        else if (raw.startsWith('data:')) kind = 4;
        else if (raw.startsWith('blob:')) kind = 5;
        else if (raw) {
          const own = new URL(view.location.href);
          const target = new URL(raw, own);
          const local = target.protocol === own.protocol && target.host === own.host;
          kind = local ? (target.pathname.endsWith('/artcraft_launcher_web_bg.wasm') ? 2 : 1) : 3;
        }
      }
      csp[1] = kind;
    } catch { /* Untrusted event details cannot escape the fixed code set. */ }
  };
  const increment = index => () => { errors[index] = Math.min(255, errors[index] + 1); };
  const listeners = [
    ['error', increment(2)], ['unhandledrejection', increment(3)],
    ['securitypolicyviolation', policyViolation],
  ];
  for (const [name, listener] of listeners) view.addEventListener(name, listener);
  let raf = false;
  const frame = view.requestAnimationFrame(() => { raf = true; });
  const bounded = value => Number.isFinite(value) ? Math.min(16384, Math.max(0, Math.round(value))) : 0;
  const node = element => {
    if (!element) return [0, 0, 0, 0];
    const rect = element.getBoundingClientRect();
    let visible = Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0;
    let current = element;
    // Traverse through the open ShadowRoot to account for hidden ancestors.
    for (let depth = 0; current && depth < 64; depth++) {
      const style = view.getComputedStyle(current);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) visible = false;
      current = current.parentElement || current.getRootNode()?.host || null;
      if (depth === 63 && current) visible = false;
    }
    return [1, bounded(rect.width), bounded(rect.height), Number(visible)];
  };
  const snapshot = sample => {
    try {
      const root = view.document.getElementById('root');
      const frame = root?.querySelector('[data-native-window="true"]');
      const host = root?.querySelector('[data-hex-product-content="accepted-cube"]');
      const shadow = host?.shadowRoot;
      const workspace = shadow?.querySelector('[data-hex-workspace]');
      const diagnostic = {sample, errors: [...errors], csp: [...csp], nodes: [root, frame, host, workspace].map(node),
        root_children: Boolean(root?.childElementCount),
        document_visible: view.document.visibilityState === 'visible', raf, shadow: Boolean(shadow)};
      // Failed diagnostic IPC never changes rendering, retries or acceptance.
      Promise.resolve(invoke('native_product_window', {action: 'state', diagnostic})).catch(() => {});
    } catch { /* Observation unavailable; never invent a successful snapshot. */ }
    if (sample === 2) {
      view.cancelAnimationFrame(frame);
      for (const [name, listener] of listeners) view.removeEventListener(name, listener);
    }
  };
  [0, 2000, 10000].forEach((delay, sample) => view.setTimeout(() => snapshot(sample), delay));
  // React 19 still performs normal failed-root handling; callbacks only count.
  return {onUncaughtError: increment(0), onRecoverableError: increment(1)};
}
