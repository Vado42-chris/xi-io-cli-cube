export const REUSABLE_PAYLOAD_BINDING_SCHEMA = 'xiio.reusable-payload-binding-qualification/v1';
export const REQUIRED_REUSABLE_BINDINGS = Object.freeze([
  'product','tenant','workspace','host','model','paths','permissions','return_target',
]);

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const strings = (values) => Array.isArray(values) ? [...new Set(values.map(text).filter(Boolean))] : [];
const fail = (code, details = {}) => Object.assign(new Error(code), { code, details });

const FORBIDDEN_DEFAULT_KEYS = new Set([
  'product','product_ref','tenant','tenant_ref','tenant_id','workspace','workspace_ref','workspace_id',
  'host','host_ref','hosts','model','model_profile_ref','workspace_root','path','paths','permissions',
  'permission_refs','qualified_capability_refs','return_target','return_target_ref','return_ref',
  'checkpoint_return_destination',
]);

function walk(value, visit, trail = '$') {
  visit(value, trail);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, `${trail}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visit({__key:key,__value:child}, `${trail}.${key}`);
      walk(child, visit, `${trail}.${key}`);
    }
  }
}

export function assertReusableRuntimeDefaultsNeutral(defaults = {}, { deploymentPins = [] } = {}) {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) throw fail('REUSABLE_RUNTIME_DEFAULTS_OBJECT_REQUIRED');
  const pins = strings(deploymentPins);
  const serialized = JSON.stringify(defaults);
  for (const pin of pins) if (serialized.includes(pin)) throw fail('DEPLOYMENT_PIN_IN_REUSABLE_DEFAULTS', { pin });
  walk(defaults, (entry, trail) => {
    if (entry && typeof entry === 'object' && Object.hasOwn(entry, '__key')) {
      if (FORBIDDEN_DEFAULT_KEYS.has(entry.__key) && entry.__value !== null && entry.__value !== undefined && entry.__value !== '') {
        throw fail(`REUSABLE_RUNTIME_DEFAULT_LITERAL_FORBIDDEN:${entry.__key}`, { trail });
      }
    }
  });
  return Object.freeze({ state:'PASS', neutral:true, deployment_pin_count:pins.length });
}

function need(field, value, sourceRefs) {
  const sourceRef = text(sourceRefs?.[field]);
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    throw fail(`REUSABLE_PAYLOAD_BINDING_MISSING:${field}`);
  }
  if (!sourceRef) throw fail(`REUSABLE_PAYLOAD_BINDING_SOURCE_MISSING:${field}`);
  return { value, source_ref: sourceRef };
}

export function qualifyReusablePayloadBindings({
  currentUser = {},
  product = {},
  taskContext = {},
  runtimeConfig = {},
  localWorkPacket = {},
  workerProjection = {},
  assignment = {},
  sourceRefs = {},
} = {}) {
  const productRef = text(product.product_ref);
  const tenantRef = text(currentUser.tenant_ref || currentUser.tenant_id);
  const workspaceRef = text(taskContext?.identity?.workspace_id || taskContext?.scope?.workspace_ref);
  const hostRef = text(currentUser.host_ref || currentUser.host);
  const runtimeHosts = strings(runtimeConfig.hosts);
  if (hostRef && !runtimeHosts.includes(hostRef)) throw fail('HOST_NOT_QUALIFIED_BY_RUNTIME_CONFIG', { host_ref:hostRef, runtime_hosts:runtimeHosts });
  const modelRef = text(taskContext?.runtime?.model_profile_ref);
  const workspaceRoot = text(localWorkPacket.workspace_root);
  const allowedPaths = strings(localWorkPacket?.allowed_scope?.paths);
  const paths = workspaceRoot && allowedPaths.length ? Object.freeze({ workspace_root:workspaceRoot, allowed_scope_paths:Object.freeze(allowedPaths) }) : null;
  const permissions = strings([...(workerProjection.qualified_capability_refs || []), ...(assignment.permission_refs || [])]);
  const returnTarget = text(workerProjection.return_target_ref || assignment.return_ref || localWorkPacket.return_target_ref);
  const userRef = text(currentUser.user_ref || currentUser.principal_ref);
  if (!userRef) throw fail('CURRENT_USER_REF_MISSING');

  const bindings = Object.freeze({
    product: need('product', productRef, sourceRefs),
    tenant: need('tenant', tenantRef, sourceRefs),
    workspace: need('workspace', workspaceRef, sourceRefs),
    host: need('host', hostRef, sourceRefs),
    model: need('model', modelRef, sourceRefs),
    paths: need('paths', paths, sourceRefs),
    permissions: need('permissions', permissions, sourceRefs),
    return_target: need('return_target', returnTarget, sourceRefs),
  });

  return Object.freeze({
    schema: REUSABLE_PAYLOAD_BINDING_SCHEMA,
    state: 'QUALIFIED',
    current_user_ref: userRef,
    bindings,
    authority_inherited: false,
    reusable_runtime_defaults_may_supply_binding_literals: false,
  });
}
