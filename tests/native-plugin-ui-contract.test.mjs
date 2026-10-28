import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Plugins is a top-level tab in the pre-existing native HEX shell',()=>{
 const shell=read('src/SharedProductHost.tsx');
 assert.match(shell,/id: 'plugins', label: 'Plugins'/);
 assert.match(shell,/<NativePluginMarketplace\s*\/>/);
 assert.match(shell,/createPortal/);
 assert.match(shell,/pluginsVisible/);
 assert.doesNotMatch(shell,/WebviewWindowBuilder|createWindow/);
});
test('the existing six-product installer remains separate',()=>{
 const app=read('src/App.tsx');
 assert.match(app,/const SUITE_PRODUCTS = \[/);
 assert.match(app,/<NativeInstallerPanel/);
 const panel=read('src/components/NativePluginMarketplace.tsx');
 assert.doesNotMatch(panel,/installer_request|apply_repair|shell_command|eval\(/);
 assert.match(panel,/Account-profile service is not yet connected/);
});
test('local Tauri plugin operations require bundled-window provenance',()=>{
 const rs=read('native/hex/carrier/src-tauri/src/lib.rs');
 assert.match(rs,/fn native_plugin_inspect/);
 assert.match(rs,/fn native_plugin_open_provider/);
 assert.match(rs,/native_plugin_inspect,native_plugin_onboarding_current,native_plugin_open_provider/);
 assert.match(rs,/local_caller\(&window\)\?/);
});
test('provider browser open is allowlisted and never accepts a URL argument',()=>{
 const rs=read('native/hex/carrier/src-tauri/src/lib.rs');
 assert.match(rs,/"chatgpt"=>"https:\/\/chatgpt\.com\/plugins"/);
 assert.match(rs,/"inbox"=>"http:\/\/127\.0\.0\.1:8791\/"/);
 assert.match(rs,/PLUGIN_PROVIDER_NOT_REGISTERED/);
 assert.match(rs,/\.arg\(url\)/);
 assert.doesNotMatch(rs,/Command::new\("sh"\)/);
});
test('native receipt reader cannot reveal credentials or infer plugin attachment',()=>{
 const rs=read('native/hex/carrier/src-tauri/src/lib.rs');
 const start=rs.indexOf('fn native_plugin_inspect(');
 const end=rs.indexOf('fn native_plugin_open_provider(',start);
 assert.ok(start>0&&end>start);
 const section=rs.slice(start,end);
 assert.match(section,/credential_values_read":false/);
 assert.match(section,/chatgpt_plugin":"NOT_VERIFIED"/);
 assert.match(section,/effect_authority":0/);
 assert.doesNotMatch(section,/tunnel_id|access_token|refresh_token|api_key/);
});
test('no structural modification to HEX six-component installer',()=>{
 const app=read('src/App.tsx');
 const expected=['cli','editor','studio','web','switchboard','bins','ward'];
 assert.ok(expected.every(x=>app.includes('id: "'+x+'" as TargetComponentId')));
 const native=read('src/components/NativeInstallerPanel.tsx');
 assert.match(native,/createInstallerClient/);
});

test('native Plugins consumer reads existing first-party owner without fabricating login',()=>{
 const rs=read('native/hex/carrier/src-tauri/src/lib.rs');
 const adapter=read('native/hex/carrier/src-tauri/src/plugin_onboarding.rs');
 const ui=read('src/components/NativePluginMarketplace.tsx');
 assert.match(rs,/mod plugin_onboarding;/);
 assert.match(rs,/fn native_plugin_onboarding_current/);
 assert.match(rs,/local_caller\(&window\)\?/);
 assert.match(rs,/plugin_onboarding::read_current\(\)/);
 assert.match(ui,/invoke\('native_plugin_onboarding_current'\)/);
 assert.match(ui,/data-native-onboarding-state/);
 assert.match(ui,/Account-profile service is not yet connected/);
 assert.doesNotMatch(ui,/projectPluginProfiles\(\[\]\)/);
 assert.match(adapter,/127\.0\.0\.1:8798/);
 assert.match(adapter,/GET \/v1\/onboarding\/current/);
 assert.doesNotMatch(adapter,/https:\/\//);
});
test('native account status is an observation without browser credential custody',()=>{
 const rs=read('native/hex/carrier/src-tauri/src/plugin_onboarding.rs');
 assert.match(rs,/NATIVE_AUTHENTICATED_HANDOFF_UNBOUND/);
 assert.match(rs,/native_browser_session_shared/);
 assert.match(rs,/Some\(200\)=>unavailable/);
 assert.match(rs,/NATIVE_ONBOARDING_HTTP_INVALID/);
 assert.match(rs,/NATIVE_ONBOARDING_SCHEMA_UNVERIFIED/);
 const request=rs.match(/const REQUEST:&\[u8\]=b"([\s\S]*?)";/)?.[1]||'';
 assert.ok(request.includes('127.0.0.1:8798'));
 assert.doesNotMatch(request,/Authorization|Cookie|X-Forwarded|password|secret/i);
 assert.doesNotMatch(rs,/createDeviceSessionIssuer|grantWard|CREATE TABLE|mint[A-Z]/);
});
test('native account readback refuses stale privilege and UI clears busy on denial',()=>{
 const rs=read('native/hex/carrier/src-tauri/src/plugin_onboarding.rs');
 const ui=read('src/components/NativePluginMarketplace.tsx');
 assert.match(rs,/value\.get\("ward_admission"\)==Some\(&json!\(false\)\)/);
 assert.match(rs,/value\.get\("authority_granted"\)==Some\(&json!\(false\)\)/);
 assert.match(rs,/value\.get\("provider_effect"\)==Some\(&json!\(false\)\)/);
 assert.match(rs,/let mut raw=Vec::new/);
 assert.match(rs,/MAX_RESPONSE\+1/);
 assert.match(rs,/#\[test\]fn even_200_with_fake_identity_never_becomes_native_auth/);
 assert.match(ui,/setOnboarding\(null\)/);
 assert.match(ui,/finally\{setBusy\(false\)\}/);
 assert.match(ui,/Object\.keys\(value\)\.some\(key=>!keys\.has\(key\)\)/);
 assert.match(ui,/value\.next!=='XIIO_FIRST_PARTY_SIGN_IN'/);
 assert.match(ui,/value\.next!=='RESTORE_FIRST_PARTY_SESSION_OWNER'/);
 const start=ui.indexOf("const refresh=useCallback(");
 const end=ui.indexOf("useEffect(",start);
 const refresh=ui.slice(start,end);
 assert.doesNotMatch(refresh,/setMessage\('Installed plugin receipt did not pass local verification\.'\);return;/);
});
