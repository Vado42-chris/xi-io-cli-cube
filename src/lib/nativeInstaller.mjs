// Finite caller for the packaged HEX installer. No browser fallback or Ward claims.
export function nativeInstallerAvailable(host = globalThis) {
  return typeof host.__TAURI__?.core?.invoke === 'function';
}

export function installerStatus(plan, observed = false) {
  if (!plan) return {tone: 'neutral', message: 'No installation plan selected.'};
  if (plan.do_not_retry || ['APPLYING', 'APPLY_OUTCOME_UNCERTAIN', 'ROLLING_BACK', 'ROLLBACK_OUTCOME_UNCERTAIN', 'EVIDENCE_UNREADABLE_DO_NOT_RETRY'].includes(plan.phase)) {
    return {tone: 'warning', message: 'Outcome uncertain. Check actual state; do not repeat the operation.'};
  }
  if (plan.phase === 'PREPARED_REPAIR_NOT_APPLIED') return {tone: 'neutral', message: 'Launcher-only repair prepared. Existing CLI generations and runtime will be retained. Review before approval.'};
  if (plan.phase === 'LAUNCHER_REPAIR_READBACK_VERIFIED') return observed
    ? {tone: 'success', message: 'Launcher bytes and version execution verified; generation history preserved. Doctor and an approved local read still require acceptance. No remote connection is claimed.'}
    : {tone: 'neutral', message: 'History records launcher repair. Recheck actual state before treating it as current.'};
  if (plan.phase === 'INSTALLED_READBACK_VERIFIED') return observed
    ? {tone: 'success', message: 'Files installed and read back; services not started. Remote connection is not configured by this installer.'}
    : {tone: 'neutral', message: 'History records an installation. Check actual state before treating it as current.'};
  if (plan.phase === 'ROLLED_BACK') return observed
    ? {tone: 'success', message: 'Rollback postconditions verified. Original files restored or installed files removed.'}
    : {tone: 'neutral', message: 'History records a rollback. Check actual state to verify it.'};
  if (plan.phase === 'PREPARED_NOT_INSTALLED') return {tone: 'neutral', message: 'Plan prepared; nothing installed. Review the exact changes before approval.'};
  return {tone: 'warning', message: 'Unrecognized state. Inspect saved evidence; no success is implied.'};
}

export function createInstallerClient(invoke) {
  return async request => {
    if (typeof invoke !== 'function') throw new Error('Native HEX is required. This browser cannot install files.');
    const response = await invoke('installer_request', {request});
    if (!response || typeof response.ok !== 'boolean') throw new Error('Installer response unreadable. Check saved state before repeating an operation.');
    if (!response.ok) throw new Error(response.error || 'Installer refused the request.');
    if (!response.result || typeof response.result !== 'object') throw new Error('Installer result missing. Check saved state.');
    return response.result;
  };
}
