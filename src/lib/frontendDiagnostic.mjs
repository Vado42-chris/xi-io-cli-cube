// Observation only: never read DOM content, URLs, error objects or user settings.
// nodes order: React root, shared frame, product host, shadow workspace.
// Each tuple: present, width (clamped px), height (clamped px), computed visible.
export function startFrontendDiagnostic(view) {
  const invoke = view.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== 'function') return {};
  const errors = [0, 0, 0, 0, 0];
  const increment = index => () => { errors[index] = Math.min(255, errors[index] + 1); };
  const listeners = [
    ['error', increment(2)], ['unhandledrejection', increment(3)],
    ['securitypolicyviolation', increment(4)],
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
      const diagnostic = {sample, errors: [...errors], nodes: [root, frame, host, workspace].map(node),
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
