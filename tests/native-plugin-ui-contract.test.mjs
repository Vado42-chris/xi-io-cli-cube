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
 assert.match(panel,/Current account-profile service not yet connected/);
});
test('local Tauri plugin operations require bundled-window provenance',()=>{
 const rs=read('native/hex/carrier/src-tauri/src/lib.rs');
 assert.match(rs,/fn native_plugin_inspect/);
 assert.match(rs,/fn native_plugin_open_provider/);
 assert.match(rs,/native_plugin_inspect,native_plugin_open_provider/);
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
