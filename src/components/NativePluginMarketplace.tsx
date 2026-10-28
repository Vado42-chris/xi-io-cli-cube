import React,{useCallback,useEffect,useState} from 'react';
import {PLUGIN_CATEGORIES,PLUGINS,statusForPlugin} from '../lib/pluginCatalog.mjs';

type Observation={
  schema:string;
  aries_mcp?:{state?:string};
  tunnel?:{state?:string;live_checked?:boolean};
  chatgpt_plugin?:string;
  credential_values_read?:boolean;
  ward_admission?:boolean;
  effect_authority?:number;
};
type NativeOnboarding={
  schema:'xiio.onboarding.current/v1';
  plane:'XIIO_FIRST_PARTY';
  state:'OWNER_SIGNIN_REQUIRED'|'AUTHORITY_UNAVAILABLE';
  next?:string;
  first_red?:string;
  authenticated:false;
  connection_choice:'NOT_ASKED';
  consent:'NOT_REQUESTED';
  services:'NOT_DISCOVERED';
  provisioning:'NOT_AUTHORIZED';
  authority_granted:false;
  ward_admission:false;
  provider_effect:false;
  native_browser_session_shared?:false;
};
function acceptNativeOnboarding(value:any):value is NativeOnboarding{
  const keys=new Set(['schema','plane','state','next','first_red','authenticated',
    'connection_choice','consent','services','provisioning','authority_granted',
    'ward_admission','provider_effect','native_browser_session_shared']);
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).some(key=>!keys.has(key)))return false;
  if(value.state==='AUTHORITY_UNAVAILABLE'&&
     (value.next!=='RESTORE_FIRST_PARTY_SESSION_OWNER'||
      typeof value.first_red!=='string'||
      !/^[A-Z][A-Z0-9_]{3,100}$/.test(value.first_red)))return false;
  if(value.state==='OWNER_SIGNIN_REQUIRED'&&
     (value.next!=='XIIO_FIRST_PARTY_SIGN_IN'||
      value.native_browser_session_shared!==false))return false;
  return value?.schema==='xiio.onboarding.current/v1'&&
    value?.plane==='XIIO_FIRST_PARTY'&&value.authenticated===false&&
    value.connection_choice==='NOT_ASKED'&&
    value.consent==='NOT_REQUESTED'&&value.services==='NOT_DISCOVERED'&&
    value.provisioning==='NOT_AUTHORIZED'&&
    value.authority_granted===false&&value.ward_admission===false&&
    value.provider_effect===false&&
    (value.state==='OWNER_SIGNIN_REQUIRED'||value.state==='AUTHORITY_UNAVAILABLE')&&
    (value.state!=='OWNER_SIGNIN_REQUIRED'||value.native_browser_session_shared===false);
}
const base='min-h-[44px] px-4 py-2 border border-workspace-border-strong text-xs font-semibold hover:border-workspace-focus focus-visible:ring-2 focus-visible:ring-workspace-focus';
const nativeAvailable=()=>typeof (globalThis as any).__TAURI__?.core?.invoke==='function';
const categoryInfo=()=>[{id:'all',label:'All plugins'},...PLUGIN_CATEGORIES];
export default function NativePluginMarketplace() {
  const [category,setCategory]=useState('all');
  const [selected,setSelected]=useState('chatgpt');
  const [observation,setObservation]=useState<Observation|null>(null);
  const [onboarding,setOnboarding]=useState<NativeOnboarding|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [visit,setVisit]=useState('');
  const refresh=useCallback(async()=>{
    if(!nativeAvailable()){setObservation(null);setOnboarding(null);setMessage('Preview only. Open installed native HEX to inspect local connection receipts.');return}
    setBusy(true);setMessage('');setOnboarding(null);
    try{
      const result=await (globalThis as any).__TAURI__.core.invoke('native_plugin_inspect');
      if(result?.schema!=='xiio.hex.plugin-local-inspection/v1'||
         result.credential_values_read!==false||result.effect_authority!==0||
         result.ward_admission!==false){
        setObservation(null);setMessage('Installed plugin receipt did not pass local verification.');
      }else{
        setObservation(result);
      }
    }catch{setObservation(null);setMessage('Native plugin observation unavailable. No account or permission was changed.');}
    try{
      const current=await (globalThis as any).__TAURI__.core.invoke('native_plugin_onboarding_current');
      setOnboarding(acceptNativeOnboarding(current)?current:null);
    }catch{setOnboarding(null)}
    finally{setBusy(false)}
  },[]);
  useEffect(()=>{void refresh()},[refresh]);
  const openProvider=async(id:string)=>{
    if(!nativeAvailable()){setVisit('Provider handoff requires installed native HEX.');return}
    setVisit('');
    const provider=id==='chatgpt'?'chatgpt':id==='gmail'?'inbox':null;
    if(!provider){setVisit('Provider setup remains under its owning XI-IO product.');return}
    try{
      const result=await (globalThis as any).__TAURI__.core.invoke('native_plugin_open_provider',{provider});
      setVisit(result?.state==='EXTERNAL_BROWSER_HANDOFF_ATTEMPTED'
        ? 'Provider opened in your browser. Authorization is not yet verified.'
        : 'Provider handoff did not return an accepted result.');
    }catch{setVisit('Could not open provider browser. Existing accounts were not changed.')}
  };
  // Only the authenticated XI-IO account owner may return real profiles.
  // Never treat a provider token or platform login as a XI-IO principal.
  const cards=PLUGINS.filter((p:any)=>category==='all'||p.category===category);
  const current=PLUGINS.find((p:any)=>p.id===selected)||PLUGINS[0];
  const status=statusForPlugin(observation,selected);
  return <section data-native-hex-plugins="v1" aria-label="XI-IO plugins" className="space-y-5">
    <div className="border border-workspace-border bg-workspace-surface p-4">
      <h3 className="font-bold text-base text-workspace-text">Plugins</h3>
      <p className="text-sm text-workspace-muted">Install and connect providers from HEX. Applications remain in Software; accounts belong to XI-IO users and workspaces. Link separate work, family, business or client accounts to the same provider.</p>
      <div className="flex gap-2 flex-wrap mt-3" role="group" aria-label="Plugin categories">
        {categoryInfo().map(x=><button key={x.id} type="button" onClick={()=>setCategory(x.id)}
           aria-pressed={category===x.id} className={base+(category===x.id?' bg-workspace-focus text-workspace-inverse':' text-workspace-text')}>{x.label}</button>)}
      </div>
    </div>
    <div className="hex-responsive-grid hex-grid-halves">
      {cards.map((p:any)=><button type="button" key={p.id} onClick={()=>setSelected(p.id)}
        data-plugin-id={p.id} aria-pressed={selected===p.id}
        className={'p-4 min-h-[98px] text-left space-y-2 border bg-workspace-canvas '+(selected===p.id?'border-workspace-focus':'border-workspace-border')+' hover:border-workspace-focus'}>
          <div className="flex justify-between gap-2 items-start">
            <strong className="text-sm">{p.name}</strong><span className="text-[10px] text-workspace-muted">PLUGIN</span>
          </div>
          <p className="text-xs text-workspace-muted">{p.description}</p>
          <small className="text-xs text-workspace-text">{statusForPlugin(observation,p.id).replaceAll('_',' ')}</small>
        </button>)}
    </div>
    <section className="p-4 space-y-3 border border-workspace-border" aria-label="Selected plugin">
      <div><h4 className="text-sm font-bold">{current.name}</h4>
        <p className="text-xs text-workspace-muted">Installer class: {current.kind} · Credential owner: {current.owner} · Multiple accounts per plugin</p></div>
      <p role="status" className="text-sm" data-plugin-connection-status={selected}>Local observation: <strong>{status.replaceAll('_',' ')}</strong></p>
      {selected==='chatgpt'&&<p className="text-xs text-workspace-muted">An installed MCP adapter does not prove a ChatGPT connection. A real tunnel and owner authorization need independent readback. Remote execution remains behind Ward.</p>}
      {selected==='gmail'&&<p className="text-xs text-workspace-muted">Inbox owns existing Gmail sessions and saved credentials. HEX does not import, duplicate or reveal provider tokens.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={base} disabled={busy} onClick={()=>void refresh()}>{busy?'Checking…':'Refresh installed status'}</button>
        {(selected==='chatgpt'||selected==='gmail')&&<button type="button" className={base}
          onClick={()=>void openProvider(selected)}>{selected==='chatgpt'?'Open ChatGPT authorization':'Open Inbox account manager'}</button>}
      </div>
      {message&&<p role="status" className="text-xs text-workspace-muted">{message}</p>}
      {visit&&<p role="status" className="text-xs text-workspace-muted">{visit}</p>}
    </section>
    <section className="p-4 space-y-2 border border-workspace-border" aria-label="XI-IO account profiles">
      <h4 className="text-sm font-bold">Linked account profiles</h4>
      <p className="text-xs text-workspace-muted">Account ownership and access grants come from XI-IO's existing user/workspace lifecycle. No default identity or account limit is imposed.</p>
      <p role="status" data-native-onboarding-state={onboarding?.state||'NOT_VERIFIED'} className="text-xs text-workspace-text">
        {onboarding?.state==='OWNER_SIGNIN_REQUIRED'
          ? 'Native XI-IO session not established. A separate browser session may still be signed in.'
          : onboarding?.state==='AUTHORITY_UNAVAILABLE'
            ? 'First-party onboarding authority unavailable on this native surface.'
            : 'First-party onboarding state has not been verified by the installed native consumer.'}
      </p>
      {onboarding?.state==='AUTHORITY_UNAVAILABLE'&&
        <p className="text-xs text-workspace-muted">Source: {onboarding.first_red||'FIRST_PARTY_ONBOARDING_READBACK_UNVERIFIED'}</p>}
      <p className="text-xs text-workspace-muted">Account-profile service is not yet connected. Existing provider accounts remain untouched. This surface has not verified any linked profiles or granted access.</p>
    </section>
  </section>;
}
