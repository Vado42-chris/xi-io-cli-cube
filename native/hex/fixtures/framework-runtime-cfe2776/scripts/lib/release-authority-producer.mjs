import {compileDistributableReleaseProjection,resolveReleaseAdopterLock} from './distributable-release-projection.mjs';
import {qualifyExecutableEntrypoints} from './executable-entrypoint-qualification.mjs';
import {persistAcceptedRelease,persistCurrentAdopter,persistEntrypointQualification,createAuthoritativeReleaseReaders} from './release-authoritative-readback.mjs';

export async function produceDurableReleaseAuthority({
 release,release_qualification,adopter,currentness,
 artifact_root,artifact_generation,entrypoints,product_ref,
 root,run,observed_at
}={}){
 const projection=compileDistributableReleaseProjection({release,qualification:release_qualification,observed_at});
 if(projection.product_ref!==product_ref||projection.release_generation!==artifact_generation)
  throw Error('RELEASE_AUTHORITY_PRODUCER_BINDING_MISMATCH');
 const adopterLock=resolveReleaseAdopterLock({projection,adopter,currentness});
 const entrypointQualification=qualifyExecutableEntrypoints({artifact_root,artifact_generation,entrypoints,run});
 persistAcceptedRelease(projection,{root});
 persistCurrentAdopter(adopterLock,{root});
 persistEntrypointQualification(entrypointQualification,{product_ref,root});
 const readers=createAuthoritativeReleaseReaders({root});
 const reopenedRelease=await readers.readAcceptedRelease({product_ref});
 const reopenedAdopter=await readers.readCurrentAdopter({consumer_ref:adopterLock.consumer_ref,product_ref});
 const reopenedEntrypoint=await readers.readEntrypointQualification({product_ref,release_generation:artifact_generation});
 if(reopenedRelease.release_ref!==projection.release_ref
   ||reopenedAdopter.adopter_lock_ref!==adopterLock.adopter_lock_ref
   ||reopenedEntrypoint.qualification_digest!==entrypointQualification.qualification_digest)
  throw Error('RELEASE_AUTHORITY_PRODUCER_READBACK_MISMATCH');
 return Object.freeze({
  schema:'xiio.framework.durable-release-authority/v1',
  product_ref,consumer_ref:adopterLock.consumer_ref,release_ref:projection.release_ref,
  release_generation:projection.release_generation,
  release_qualification_ref:projection.qualification_ref,
  adopter_currentness_ref:adopterLock.currentness_ref,
  entrypoint_qualification_ref:entrypointQualification.qualification_digest,
  state:'DURABLE_REOPEN_VERIFIED',effect_authority:false,provider_effect:false,
 });
}
