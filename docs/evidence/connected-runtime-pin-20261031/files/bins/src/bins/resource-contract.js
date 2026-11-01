const RESOURCE_ALLOWED_KEYS = new Set([
  'resource_ref',
  'resource_class',
  'provenance_refs',
  'integrity',
  'media_type',
  'created_at',
]);

const BINDING_ALLOWED_KEYS = new Set([
  'binding_ref',
  'resource_ref',
  'binding_role',
  'provider_ref',
  'provider_connection_ref',
  'provider_object_ref',
  'location_hint',
  'availability_state',
]);

const VERSION_ALLOWED_KEYS = new Set([
  'version_ref',
  'resource_ref',
  'parent_version_ref',
  'provenance_refs',
  'digest',
  'size_bytes',
  'media_type',
  'provider_version_ref',
]);

const DIGEST_ALLOWED_KEYS = new Set(['algorithm', 'value']);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function rejectUnknownKeys(input, allowed, label) {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported key: ${key}`);
    }
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    throw new TypeError(`${label} must be ${nonEmpty ? 'a non-empty ' : 'an '}array`);
  }
  const normalized = value.map((entry, index) =>
    requireNonEmptyString(entry, `${label}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return normalized;
}

function normalizeDigest(value, label) {
  if (value == null) return null;
  requireObject(value, label);
  rejectUnknownKeys(value, DIGEST_ALLOWED_KEYS, label);
  const algorithm = requireNonEmptyString(value.algorithm, `${label}.algorithm`).toLowerCase();
  const digestValue = requireNonEmptyString(value.value, `${label}.value`).toLowerCase();
  return Object.freeze({ algorithm, value: digestValue });
}

function freezeArray(values) {
  return Object.freeze([...values]);
}

export function createResourceRecord(input) {
  requireObject(input, 'ResourceRecord');
  rejectUnknownKeys(input, RESOURCE_ALLOWED_KEYS, 'ResourceRecord');

  const resourceRef = requireNonEmptyString(input.resource_ref, 'resource_ref');
  const resourceClass = requireNonEmptyString(input.resource_class, 'resource_class');
  const provenanceRefs = requireStringArray(input.provenance_refs, 'provenance_refs', { nonEmpty: true });

  return Object.freeze({
    resource_ref: resourceRef,
    resource_class: resourceClass,
    provenance_refs: freezeArray(provenanceRefs),
    integrity: normalizeDigest(input.integrity, 'integrity'),
    media_type: input.media_type == null ? null : requireNonEmptyString(input.media_type, 'media_type'),
    created_at: input.created_at == null ? null : requireNonEmptyString(input.created_at, 'created_at'),
  });
}

export function createStorageBinding(input) {
  requireObject(input, 'StorageBinding');
  rejectUnknownKeys(input, BINDING_ALLOWED_KEYS, 'StorageBinding');

  return Object.freeze({
    binding_ref: requireNonEmptyString(input.binding_ref, 'binding_ref'),
    resource_ref: requireNonEmptyString(input.resource_ref, 'resource_ref'),
    binding_role: requireNonEmptyString(input.binding_role, 'binding_role'),
    provider_ref: input.provider_ref == null ? null : requireNonEmptyString(input.provider_ref, 'provider_ref'),
    provider_connection_ref:
      input.provider_connection_ref == null
        ? null
        : requireNonEmptyString(input.provider_connection_ref, 'provider_connection_ref'),
    provider_object_ref:
      input.provider_object_ref == null
        ? null
        : requireNonEmptyString(input.provider_object_ref, 'provider_object_ref'),
    location_hint:
      input.location_hint == null ? null : requireNonEmptyString(input.location_hint, 'location_hint'),
    availability_state:
      input.availability_state == null
        ? 'UNKNOWN'
        : requireNonEmptyString(input.availability_state, 'availability_state'),
  });
}

export function createResourceVersion(input) {
  requireObject(input, 'ResourceVersion');
  rejectUnknownKeys(input, VERSION_ALLOWED_KEYS, 'ResourceVersion');

  const sizeBytes = input.size_bytes == null ? null : input.size_bytes;
  if (sizeBytes != null && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0)) {
    throw new TypeError('size_bytes must be a non-negative safe integer or null');
  }

  return Object.freeze({
    version_ref: requireNonEmptyString(input.version_ref, 'version_ref'),
    resource_ref: requireNonEmptyString(input.resource_ref, 'resource_ref'),
    parent_version_ref:
      input.parent_version_ref == null
        ? null
        : requireNonEmptyString(input.parent_version_ref, 'parent_version_ref'),
    provenance_refs: freezeArray(
      requireStringArray(input.provenance_refs, 'provenance_refs', { nonEmpty: true })
    ),
    digest: normalizeDigest(input.digest, 'digest'),
    size_bytes: sizeBytes,
    media_type: input.media_type == null ? null : requireNonEmptyString(input.media_type, 'media_type'),
    provider_version_ref:
      input.provider_version_ref == null
        ? null
        : requireNonEmptyString(input.provider_version_ref, 'provider_version_ref'),
  });
}

function indexUnique(items, key, label) {
  const index = new Map();
  for (const item of items) {
    const value = item[key];
    if (index.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    index.set(value, item);
  }
  return index;
}

function assertAcyclicVersionLineage(versionByRef) {
  for (const version of versionByRef.values()) {
    const visited = new Set();
    let cursor = version;
    while (cursor?.parent_version_ref != null) {
      if (visited.has(cursor.version_ref)) {
        throw new Error(`ResourceVersion lineage cycle detected at ${cursor.version_ref}`);
      }
      visited.add(cursor.version_ref);
      cursor = versionByRef.get(cursor.parent_version_ref);
    }
  }
}

export function compileResourceSet({ resources = [], bindings = [], versions = [] } = {}) {
  if (!Array.isArray(resources) || !Array.isArray(bindings) || !Array.isArray(versions)) {
    throw new TypeError('resources, bindings and versions must be arrays');
  }

  const resourceRecords = resources.map(createResourceRecord);
  const storageBindings = bindings.map(createStorageBinding);
  const resourceVersions = versions.map(createResourceVersion);

  const resourceByRef = indexUnique(resourceRecords, 'resource_ref', 'resource_ref');
  indexUnique(storageBindings, 'binding_ref', 'binding_ref');
  const versionByRef = indexUnique(resourceVersions, 'version_ref', 'version_ref');

  for (const binding of storageBindings) {
    if (!resourceByRef.has(binding.resource_ref)) {
      throw new Error(`StorageBinding ${binding.binding_ref} references unknown resource_ref ${binding.resource_ref}`);
    }
  }

  for (const version of resourceVersions) {
    if (!resourceByRef.has(version.resource_ref)) {
      throw new Error(`ResourceVersion ${version.version_ref} references unknown resource_ref ${version.resource_ref}`);
    }
    if (version.parent_version_ref != null) {
      const parent = versionByRef.get(version.parent_version_ref);
      if (!parent) {
        throw new Error(`ResourceVersion ${version.version_ref} references unknown parent_version_ref ${version.parent_version_ref}`);
      }
      if (parent.resource_ref !== version.resource_ref) {
        throw new Error(`ResourceVersion ${version.version_ref} parent belongs to another ResourceRecord`);
      }
      if (parent.version_ref === version.version_ref) {
        throw new Error(`ResourceVersion ${version.version_ref} cannot parent itself`);
      }
    }
  }

  assertAcyclicVersionLineage(versionByRef);

  return Object.freeze({
    resources: freezeArray(resourceRecords),
    bindings: freezeArray(storageBindings),
    versions: freezeArray(resourceVersions),
    counts: Object.freeze({
      resources: resourceRecords.length,
      bindings: storageBindings.length,
      versions: resourceVersions.length,
    }),
    effect_count: 0,
    provider_fetch_count: 0,
  });
}
