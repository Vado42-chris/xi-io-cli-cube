// Existing XI-IO product-session consumer boundary. No token issuer, cookie
// parser, Cloudflare assertion trust or client-side Ward decision lives here.
// The receiving server must independently verify the XI-IO principal, current
// workspace membership and the requested product's Ward capabilities.
const REF=/^[a-z][a-z0-9._:-]{2,127}$/;
const HASH=/^[a-f0-9]{64}$/;
export function acceptProductSession(readback, expected={productId:'hex'}) {
  if (!readback || readback.schema!=='xiio.product-session-readback/v1' ||
      readback.state!=='AUTHENTICATED' || readback.authenticated!==true ||
      readback.ward_authorized!==true || readback.capability_current===false ||
      readback.product_id!==expected.productId)
    throw new Error('XIIO_PRODUCT_SESSION_UNVERIFIED');
  for (const key of ['principal_ref','workspace_ref','session_ref','grant_ref','product_id']) {
    if (typeof readback[key]!=='string' || !REF.test(readback[key]))
      throw new Error('XIIO_PRODUCT_SESSION_IDENTITY_UNBOUND');
  }
  if (!HASH.test(readback.artifact_sha256||'') ||
      (expected.artifactSha256 && readback.artifact_sha256!==expected.artifactSha256))
    throw new Error('XIIO_PRODUCT_SESSION_ARTIFACT_MISMATCH');
  if (!Array.isArray(readback.capabilities) || !readback.capabilities.length ||
      readback.capabilities.some(cap=>typeof cap!=='string'||!REF.test(cap)))
    throw new Error('XIIO_PRODUCT_SESSION_CAPABILITIES_UNBOUND');
  if (!Number.isSafeInteger(readback.expires_at_ms) ||
      readback.expires_at_ms<=Date.now() ||
      !Number.isSafeInteger(readback.verified_at_ms) ||
      readback.verified_at_ms>Date.now() ||
      Date.now()-readback.verified_at_ms>30000)
    throw new Error('XIIO_PRODUCT_SESSION_STALE');
  return Object.freeze({
    principal_ref:readback.principal_ref,
    workspace_ref:readback.workspace_ref,
    session_ref:readback.session_ref,
    grant_ref:readback.grant_ref,
    product_id:readback.product_id,
    artifact_sha256:readback.artifact_sha256,
    capabilities:Object.freeze([...readback.capabilities]),
    verified_at_ms:readback.verified_at_ms,
    expires_at_ms:readback.expires_at_ms
  });
}

// Only a trusted server-owned same-origin endpoint may supply the readback.
// HTTP success, Cloudflare cookies, a caller-supplied JSON blob and a viewport
// rendering are insufficient. A missing or invalid receiver must refuse.
export async function readProductSession({fetcher,endpoint,expected,signal}={}) {
  if(typeof fetcher!=='function' || typeof endpoint!=='string')
    throw new Error('XIIO_PRODUCT_SESSION_RECEIVER_UNBOUND');
  const url=new URL(endpoint,globalThis.location?.href);
  if(url.origin!==globalThis.location?.origin || url.protocol!=='https:' ||
     url.username || url.password || url.hash || url.search)
    throw new Error('XIIO_PRODUCT_SESSION_ENDPOINT_UNTRUSTED');
  const response=await fetcher(url.href,{method:'GET',credentials:'include',
    cache:'no-store',redirect:'error',headers:{accept:'application/json'},signal});
  if(!response || response.status!==200 ||
     !String(response.headers?.get('content-type')||'').includes('application/json'))
    throw new Error('XIIO_PRODUCT_SESSION_READBACK_UNAVAILABLE');
  const readback=await response.json();
  return acceptProductSession(readback,expected);
}
