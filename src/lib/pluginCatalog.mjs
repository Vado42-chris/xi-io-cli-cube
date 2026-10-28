/** XI-IO native HEX plugin catalogue. Provider plugins != suite products.
 * Provider logins never become XI-IO first-party user identities. Profiles
 * belong to canonical UserPrincipal -> WorkspaceMembership -> AccessGrant;
 * this projection neither stores credentials nor grants authority.
 */
export const PLUGIN_CATALOG_SCHEMA='xiio.hex.plugin-catalog/v1';
export const PLUGIN_CATEGORIES=Object.freeze([
  {id:'ai',label:'AI and agents'},
  {id:'accounts',label:'Accounts and productivity'},
  {id:'developer',label:'Developer and automation'},
]);
export const PLUGINS=Object.freeze([
  {id:'chatgpt',name:'ChatGPT',category:'ai',kind:'MCP_PLUGIN',
    owner:'XIIO_HEX_MCP',credentials:'PROVIDER_OWNED',
    description:'Add ChatGPT connections and inspect the XI-IO MCP tool boundary.'},
  {id:'ibal',name:'Ibal / Ollama',category:'ai',kind:'LOCAL_AGENT_PLUGIN',
    owner:'XIIO_IBAL',credentials:'LOCAL_OPERATOR_OWNED',
    description:'Local model assistance without cloud or sign-in requirements.'},
  {id:'gmail',name:'Gmail',category:'accounts',kind:'PROVIDER_PLUGIN',
    owner:'XIIO_INBOX',credentials:'INBOX_PRIVATE_STORE',
    description:'Existing connected mail accounts remain owned by Inbox.'},
  {id:'google-drive',name:'Google Drive',category:'accounts',kind:'PROVIDER_PLUGIN',
    owner:'XIIO_PROVIDER_OWNER',credentials:'PROVIDER_PRIVATE_STORE',
    description:'Authorize separate Drive connections per XI-IO workspace.'},
  {id:'github',name:'GitHub',category:'developer',kind:'PROVIDER_PLUGIN',
    owner:'XIIO_PROVIDER_OWNER',credentials:'PROVIDER_PRIVATE_STORE',
    description:'Developer account and project bindings, subject to scope.'},
  {id:'zed',name:'Zed / Cadence',category:'developer',kind:'EDITOR_PLUGIN',
    owner:'XIIO_SDK',credentials:'LOCAL_OPERATOR_OWNED',
    description:'Existing local editor and agent integration.'},
]);
const REF=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const STATES=new Set(['CONNECTED','AUTHORIZED','PENDING','UNVERIFIED','DISCONNECTED','REVOKED','EXPIRED']);
const banned=/token|secret|password|api_key|private_key|email|cookie|session/i;
/** Present only records already admitted by XI-IO owner API; arbitrary depth
 * of customer/tenant relationships stays in its authoritative membership graph.
 * This is a display-only projection and cannot grant access.
 */
export function projectPluginProfiles(records=[],scope={}){
  if(!Array.isArray(records)||records.length>2000)
    return {state:'BLOCKED',first_red:'PROFILE_INPUT_INVALID',profiles:[],effect_authority:0};
  const allowed=new Set(PLUGINS.map(p=>p.id)),seen=new Set(),profiles=[];
  if(Object.keys(scope).some(k=>!['principal_ref','workspace_ref'].includes(k)))
    return {state:'BLOCKED',first_red:'PROFILE_SCOPE_INVALID',profiles:[],effect_authority:0};
  for(const value of records){
    if(!value||typeof value!=='object'||Array.isArray(value))continue;
    if(Object.keys(value).some(k=>banned.test(k)))continue;
    const {plugin_id,profile_ref,principal_ref,workspace_ref,status}=value;
    if(!allowed.has(plugin_id)||![profile_ref,principal_ref,workspace_ref].every(x=>typeof x==='string'&&REF.test(x))||!STATES.has(status))continue;
    if(scope.principal_ref&&scope.principal_ref!==principal_ref)continue;
    if(scope.workspace_ref&&scope.workspace_ref!==workspace_ref)continue;
    const identity=[principal_ref,workspace_ref,plugin_id,profile_ref].join('|');
    if(seen.has(identity))continue;
    seen.add(identity);
    profiles.push(Object.freeze({plugin_id,profile_ref,principal_ref,workspace_ref,status}));
  }
  return Object.freeze({schema:'xiio.hex.plugin-profiles-projection/v1',
    state:'DISPLAY_ONLY_OWNER_AUTHORITY_REQUIRED',profiles,
    effect_authority:0, credential_values_present:false});
}
export function statusForPlugin(observation,pluginId){
  if(!PLUGINS.some(p=>p.id===pluginId))return 'UNKNOWN_PLUGIN';
  if(pluginId!=='chatgpt')return 'NOT_OBSERVED';
  const aria=observation?.aries_mcp||{};
  const tunnel=observation?.tunnel||{};
  if(aria.state==='ARIES_MCP_STDIO_INSTALLED_READBACK_VERIFIED'&&
     tunnel.state==='TUNNEL_LOCAL_CLIENT_READY'&&tunnel.live_checked===true)
     return 'TUNNEL_LOCAL_VERIFIED_PLUGIN_NOT_ATTACHED';
  if(aria.state==='ARIES_MCP_STDIO_INSTALLED_READBACK_VERIFIED')
     return 'LOCAL_MCP_INSTALLED_CHATGPT_NOT_CONNECTED';
  return 'NOT_OBSERVED';
}
