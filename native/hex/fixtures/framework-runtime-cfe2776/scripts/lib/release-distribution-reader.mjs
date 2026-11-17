import {compileReleaseDistributionLock} from './release-distribution-lock.mjs';
import {createAuthoritativeReleaseReaders} from './release-authoritative-readback.mjs';
export async function readReleaseDistribution({product_ref,consumer_ref,root}={}){
 const readers=createAuthoritativeReleaseReaders({root});
 return compileReleaseDistributionLock({product_ref,consumer_ref,...readers});
}
