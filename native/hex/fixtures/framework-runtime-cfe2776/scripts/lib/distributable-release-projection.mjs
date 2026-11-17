import crypto from 'node:crypto';

const text=(v,c)=>{const s=String(v??'').trim();if(!s)throw Error(c);return s};
const sha=(v,c)=>{const s=text(v,c).toLowerCase();if(!/^[a-f0-9]{64}$/.test(s))throw Error(c);return s};
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>String(x??'').trim()).filter(Boolean))].sort();

function hosts(values){
 const out=uniq(values);
 if(!out.length)throw Error('RELEASE_PROVIDER_HOSTS_REQUIRED');
 for(const host of out){
  if(host!==host.toLowerCase()||host==='*'||host==='localhost'||host.endsWith('.local')||host.includes('/')||host.includes(':'))
   throw Error('RELEASE_PROVIDER_HOST_INVALID');
 }
 return out;
}

export function compileDistributableReleaseProjection({release,qualification,observed_at=new Date().toISOString()}={}){
 if(!release||typeof release!=='object')throw Error('RELEASE_REQUIRED');
 if(release.lifecycle!=='DISTRIBUTABLE')throw Error('RELEASE_NOT_DISTRIBUTABLE');
 if(!qualification||qualification.current!==true||qualification.qualified!==true)
  throw Error('RELEASE_QUALIFICATION_CURRENT_REQUIRED');
 const productRef=text(release.product_ref,'RELEASE_PRODUCT_REQUIRED');
 const generation=text(release.release_generation,'RELEASE_GENERATION_REQUIRED');
 const lock=sha(release.approved_lock_sha256,'RELEASE_LOCK_SHA256_REQUIRED');
 const providerHosts=hosts(release.provider_hosts);
 const qref=text(qualification.qualification_ref,'RELEASE_QUALIFICATION_REF_REQUIRED');
 if(qualification.product_ref!==productRef||qualification.release_generation!==generation||qualification.approved_lock_sha256!==lock)
  throw Error('RELEASE_QUALIFICATION_BINDING_MISMATCH');
 const releaseRef=text(release.release_ref,'RELEASE_REF_REQUIRED');
 const artifactRefs=uniq(release.artifact_refs);
 const manifestRefs=uniq(release.manifest_refs);
 if(!artifactRefs.length||!manifestRefs.length)throw Error('RELEASE_PUBLISHED_REFS_REQUIRED');
 return Object.freeze({
  schema:'xiio.framework.distributable-release-projection/v1',
  release_ref:releaseRef,product_ref:productRef,release_generation:generation,
  approved_lock_sha256:lock,artifact_refs:Object.freeze(artifactRefs),manifest_refs:Object.freeze(manifestRefs),
  provider_hosts:Object.freeze(providerHosts),qualification_ref:qref,lifecycle:'DISTRIBUTABLE',
  observed_at:text(observed_at,'RELEASE_OBSERVED_AT_REQUIRED'),effect_authority:false,
 });
}

export function resolveReleaseAdopterLock({projection,adopter,currentness}={}){
 if(projection?.schema!=='xiio.framework.distributable-release-projection/v1'||projection.lifecycle!=='DISTRIBUTABLE')
  throw Error('DISTRIBUTABLE_RELEASE_PROJECTION_REQUIRED');
 if(!adopter||typeof adopter!=='object')throw Error('RELEASE_ADOPTER_REQUIRED');
 const productRef=text(adopter.product_ref,'ADOPTER_PRODUCT_REQUIRED');
 const consumerRef=text(adopter.consumer_ref,'ADOPTER_CONSUMER_REQUIRED');
 if(productRef!==projection.product_ref)throw Error('ADOPTER_PRODUCT_MISMATCH');
 if(adopter.release_ref!==projection.release_ref||adopter.release_generation!==projection.release_generation
   || String(adopter.approved_lock_sha256??'').toLowerCase()!==projection.approved_lock_sha256)
  throw Error('ADOPTER_RELEASE_BINDING_MISMATCH');
 if(!currentness||currentness.current!==true||currentness.adopter_lock_ref!==adopter.adopter_lock_ref
   || currentness.release_ref!==projection.release_ref||currentness.release_generation!==projection.release_generation
   || currentness.consumer_ref!==consumerRef)
  throw Error('ADOPTER_CURRENTNESS_UNVERIFIED');
 return Object.freeze({
  schema:'xiio.framework.release-adopter-lock/v1',
  adopter_lock_ref:text(adopter.adopter_lock_ref,'ADOPTER_LOCK_REF_REQUIRED'),
  consumer_ref:consumerRef,product_ref:productRef,release_ref:projection.release_ref,
  release_generation:projection.release_generation,approved_lock_sha256:projection.approved_lock_sha256,
  provider_hosts:projection.provider_hosts,currentness_ref:text(currentness.currentness_ref,'ADOPTER_CURRENTNESS_REF_REQUIRED'),
  state:'ADOPTED_CURRENT',effect_authority:false,
 });
}
