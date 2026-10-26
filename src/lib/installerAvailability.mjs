// Projection only: actual native backend owns bundled component qualification.
export const installerComponents = ['cli', 'bins', 'switchboard'];
export function availabilityFrom(result) {
  const raw = result?.supported_components || result?.component_availability;
  return Object.fromEntries(installerComponents.map(name => [name, {
    available: raw?.[name]?.available === true,
    required: name === 'cli',
    reason: raw?.[name]?.available === true ? null :
      (typeof raw?.[name]?.reason === 'string' ? raw[name].reason : 'PAYLOAD_AVAILABILITY_NOT_OBSERVED'),
  }]));
}
export function availableSelection(selection, availability) {
  return installerComponents.filter(name => availability?.[name]?.available === true &&
    (name === 'cli' || selection.includes(name)));
}
export function canPrepareComponents(selection, availability) {
  return selection.includes('cli') && selection.length > 0 &&
    selection.every(name => installerComponents.includes(name) && availability?.[name]?.available === true);
}
export function canRollbackPlan(plan, unknown) {
  return plan?.phase === 'INSTALLED_READBACK_VERIFIED' && plan?.rollback_available === true && !unknown;
}
