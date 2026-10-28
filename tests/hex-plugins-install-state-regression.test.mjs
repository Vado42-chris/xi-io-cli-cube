import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Install remains mounted rather than conditionally replaced by Plugins',()=>{
 const host=read('src/SharedProductHost.tsx');
 const segment=host.slice(host.indexOf('root && createPortal('),host.indexOf('</>, root)'));
 assert.ok(segment.length>400,'Persistent portal must exist');
 assert.equal((segment.match(/<App\b/g)||[]).length,1,'One persistent App/installer instance');
 assert.match(segment,/data-hex-installer-state-host="persistent"/);
 assert.match(segment,/<App embedded navigation=\{navigation\} onNavigate=\{onNavigate\} visible=\{!pluginsVisible\} \/>/);
 assert.match(segment,/\{pluginsVisible && <div[^>]*data-hex-plugin-native-panel/);
 assert.doesNotMatch(segment,/pluginsVisible\s*\?\s*<div[^>]*NativePluginMarketplace[\s\S]*:\s*<App/);
});

test('Hidden Install cannot receive focus or be seen by screen readers',()=>{
 const host=read('src/SharedProductHost.tsx');
 assert.match(host,/pluginsVisible \? 'hidden h-full min-h-0' : 'h-full min-h-0'/);
 assert.match(host,/aria-hidden=\{pluginsVisible\}/);
 assert.doesNotMatch(host,/new WebviewWindow|window\.open\(/);
});

test('Leaving visible Install invalidates approval without losing reviewed plan',()=>{
 const app=read('src/App.tsx');
 const installer=read('src/components/NativeInstallerPanel.tsx');
 assert.match(app,/NativeInstallerPanel active=\{visible && perspective === 'auditor' && activeView === 'installer'\}/);
 assert.match(installer,/if \(!active\) \{\s*setApproval\(false\);\s*setRollbackApproval\(false\);\s*\}/);
 // Never clear a prepared/uncertain plan, receipts or the busy lock upon tab switch.
 const visibilityEffect=installer.slice(installer.indexOf('// Reviewed plans'),installer.indexOf('const invoke ='));
 assert.doesNotMatch(visibilityEffect,/setPlan\(|setUnknown\(|setObserved\(|busyRef\.current|setHistory\(/);
 assert.match(installer,/const busyRef = useRef\(false\)/);
 assert.match(installer,/const \[plan, setPlan\] = useState/);
});

test('Hidden page stops pointer/light/animation work without remounting installer',()=>{
 const app=read('src/App.tsx');
 const backdrop=read('src/components/TabletBackdrop.tsx');
 assert.match(app,/<TabletBackdrop active=\{visible\} \/>/);
 assert.match(backdrop,/if \(!active\) return;/);
 assert.match(backdrop,/\},\[active\]\);/);
 assert.match(backdrop,/motion\.dispose\(\)/);
 assert.match(backdrop,/removeEventListener\('pointermove'/);
});

test('Repair does not invent sign-in, Ward grants, a new installer or parallel window',()=>{
 const host=read('src/SharedProductHost.tsx');
 const installer=read('src/components/NativeInstallerPanel.tsx');
 const lib=read('native/hex/carrier/src-tauri/src/lib.rs');
 assert.equal((host.match(/<NativeProductWindowShell\b/g)||[]).length,1);
 assert.match(installer,/No sign-in required/);
 assert.match(lib,/native_plugin_onboarding_current/);
 assert.doesNotMatch(host,/createDeviceSessionIssuer|grantWard|installer_request|new WebviewWindow/);
});
