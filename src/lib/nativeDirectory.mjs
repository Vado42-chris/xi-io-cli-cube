// The existing native chooser selects a directory; selection grants no authority.
export async function selectNativeDirectory(purpose, host = globalThis) {
  if (!['workspace', 'installation'].includes(purpose)) throw new Error('Directory purpose is not supported.');
  const invoke = host.__TAURI__?.core?.invoke;
  if (typeof invoke !== 'function') throw new Error('Open the native HEX application to choose a local directory.');
  const result = await invoke('native_select_directory', {purpose});
  if (!result || typeof result.cancelled !== 'boolean') throw new Error('Directory selection response unreadable.');
  if (result.cancelled) return null;
  if (typeof result.path !== 'string' || !result.path.startsWith('/') || result.path.includes('\0')) throw new Error('Native directory path is invalid.');
  return result.path;
}
