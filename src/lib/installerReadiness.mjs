/** Projections of native observations only. No simulated readiness or second ledger. */
export function installerReadiness(observation, plan) {
  const scan = plan?.preflight || observation || {};
  const system = scan.system_metadata;
  const existing = scan.existing_cli;
  const config = plan?.connection_prerequisites || scan.connection_prerequisites;
  const node = plan?.node;
  const connection = plan?.connection;
  if (plan?.kind === 'launcher_repair') return [
    {label: 'Node runtime', text: node ? `${node.version} · ${node.path} — verified existing executable` : 'Not verified'},
    {label: 'Repair source', text: plan.repair_source?.ref || 'Exact source not reported'},
    {label: 'Preservation', text: 'Existing current/previous pointers, receipts and payloads must remain unchanged. No new runtime or generation.'},
    {label: 'Connection', text: 'Not required for launcher-only repair. No remote connection is established or claimed.'},
  ];
  const rows = [
    {label: 'Computer', text: system ? `${system.os} · ${system.architecture} (observed locally)` : 'Not inspected'},
    {label: 'Node runtime', text: node ? `${node.version} · ${node.path} — checked for this plan` : `${scan.node_candidates?.length || 0} candidate(s) observed; select and prepare to verify Node 22.13+`},
    {label: 'Existing CLI', text: existing?.state === 'RECEIPT_METADATA_OBSERVED' ? `Generation ${existing.generation} at ${existing.prefix}; receipt only, current runtime not verified` : 'No CLI receipt observed at the known location; other locations were not searched'},
    {label: 'Required connection payload', text: connection?.required === true && connection?.source?.ref ? `Switchboard native consumer ${connection.source.ref.slice(0, 12)} · ${connection.payload_files} files included in this plan` : scan.connection_payload?.available ? 'Pinned Switchboard native consumer bundled; mandatory with CLI' : 'Required bundled consumer has not been verified; preparation must verify its source before installation'},
    {label: 'Connection configuration', text: config ? 'Configuration required — authenticated connection has not been demonstrated. No service absence is inferred.' : 'Not observed; no authenticated connection claimed'},
  ];
  for (const binding of config?.required_bindings || []) rows.push({label: binding.name, text: binding.state === 'PUBLIC_METADATA_AVAILABLE' ? 'Public identity metadata observed; admission not verified' : 'Not observed in installer process; existing host configuration not ruled out'});
  if (config) rows.push({label: 'Session / Ward / BINS', text: 'Trusted device ports module and broker binding still required. The bundled consumer does not provide these production implementations; installation does not enroll or start a connection.'});
  return rows;
}
export function reviewedRuntimeReady(plan) {
  const version = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(plan?.node?.version || '');
  return Boolean(version && (+version[1] > 22 || (+version[1] === 22 && +version[2] >= 13)) && plan.node.sha256 && plan.node.path?.startsWith('/') && plan.connection?.required === true && plan.connection?.source?.ref && plan.connection?.manifest_sha256 && plan.connection?.payload_files > 0);
}
