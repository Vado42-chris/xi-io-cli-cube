import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
test('persistent installer retains the recovered full-width Empire lattice',()=>{
 const manifest=JSON.parse(readFileSync(root+'src/styles/empire-grid.custody.json'));
 const source=readFileSync(new URL('./fixtures/node-responsiveGrid.mjs',import.meta.url),'utf8');
 const bytes=Buffer.from(source);assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex'),'1dc3e95e1368fcbb1d5fdb37d67dc5e441b17398');
 const css=readFileSync(root+'src/styles/product-workspace.css','utf8'),app=readFileSync(root+'src/components/ArtcraftLauncherBody.tsx','utf8'),panel=readFileSync(root+'src/components/NativeInstallerPanel.tsx','utf8');
 const host=readFileSync(root+'src/SharedProductHost.tsx','utf8');
 assert.deepEqual(manifest.adopted_declaration.breakpoints.map(b=>[b.min_width,b.columns,b.margin,b.gutter]),[[0,4,12,12],[768,8,12,12],[1024,12,12,12]]);
 assert.match(css,/container: hex-workspace \/ inline-size/);
 assert.match(css,/width: 100%; max-width: none; min-width: 0/);
 assert.match(css,/--empire-grid-gutter: 12px/);assert.match(css,/--empire-grid-margin: 12px/);
 assert.deepEqual([...css.matchAll(/@container hex-workspace \(min-width: (\d+)px\)/g)].map(m=>Number(m[1])),[768,1024]);
 assert.match(css,/repeat\(var\(--empire-grid-columns\),minmax\(0,1fr\)\)/);
 // The host mounts the recovered canvas directly. The retained DOM installer
 // still inherits its existing grid; this does not impose a DOM grid on Artcraft.
 assert.match(host,/<ArtcraftLauncherBody\b/);
 assert.doesNotMatch(host,/import\s+(?:App|HexProductMicrosites)\b|<(?:App|HexProductMicrosites)\b/);
 assert.match(host,/data-hex-workspace/);
 assert.match(host,/className="[^"]*hex-workspace-layout[^\"]*"[\s\S]*?<NativeInstallerPanel\b/);
 assert.equal((host.match(/<NativeInstallerPanel\b/g)||[]).length,1);
 assert.match(app,/<canvas[^>]*className="w-full h-full block"/);
 assert.doesNotMatch(app,/max-w-|(?:sm|md):grid-cols/);assert.doesNotMatch(panel,/(?:sm|md):grid-cols|sm:col-span/);
 assert.match(panel,/hex-responsive-grid hex-grid-halves hex-form-grid/);assert.match(panel,/hex-grid-full flex flex-wrap gap-3/);
 assert.doesNotMatch(app,/(?:bg|text|border|ring)-(?:emerald|blue|purple|rose|cyan|teal|amber|green|red|orange|yellow)-\d/);
 assert.equal(manifest.render_readback,'OWED_BROWSER_WIDE_AND_NARROW');
});


test('step pager cannot lose touch targets to the product min-width reset',()=>{
 const css=readFileSync(root+'src/styles/product-workspace.css','utf8'),app=readFileSync(root+'src/App.tsx','utf8');
 assert.doesNotMatch(css,/:is\(input,select,textarea,button,fieldset\)\s*\{\s*min-width: 0/);
 assert.match(css,/\.hex-step-pager > button \{ min-width: 44px; min-height: 44px; flex: 0 0 44px;/);
 assert.match(app,/hex-step-pager flex flex-wrap/);
 assert.match(app,/min-h-\[44px\] min-w-\[44px\] shrink-0/);
});
