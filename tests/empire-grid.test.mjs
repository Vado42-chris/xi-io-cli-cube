import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
test('full-width product consumes recovered Empire lattice, not a centered page or invented breakpoints',()=>{
 const manifest=JSON.parse(readFileSync(root+'src/styles/empire-grid.custody.json'));
 const source=readFileSync(new URL('./fixtures/node-responsiveGrid.mjs',import.meta.url),'utf8');
 const bytes=Buffer.from(source);assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex'),'1dc3e95e1368fcbb1d5fdb37d67dc5e441b17398');
 const css=readFileSync(root+'src/styles/product-workspace.css','utf8'),app=readFileSync(root+'src/components/HexProductMicrosites.tsx','utf8'),panel=readFileSync(root+'src/components/NativeInstallerPanel.tsx','utf8');
 const host=readFileSync(root+'src/SharedProductHost.tsx','utf8'),micrositeCss=readFileSync(root+'src/styles/hex-product-microsites.css','utf8');
 assert.deepEqual(manifest.adopted_declaration.breakpoints.map(b=>[b.min_width,b.columns,b.margin,b.gutter]),[[0,4,12,12],[768,8,12,12],[1024,12,12,12]]);
 assert.match(css,/container: hex-workspace \/ inline-size/);
 assert.match(css,/width: 100%; max-width: none; min-width: 0/);
 assert.match(css,/--empire-grid-gutter: 12px/);assert.match(css,/--empire-grid-margin: 12px/);
 assert.deepEqual([...css.matchAll(/@container hex-workspace \(min-width: (\d+)px\)/g)].map(m=>Number(m[1])),[768,1024]);
 assert.match(css,/repeat\(var\(--empire-grid-columns\),minmax\(0,1fr\)\)/);
 // Inspect the mounted composition, not merely the retired App source. The
 // existing installer inherits the same lattice through its persistent slot.
 assert.match(host,/<HexProductMicrosites\b/);assert.doesNotMatch(host,/import\s+App\b|<App\b/);
 assert.match(app,/data-hex-microsites data-hex-workspace/);
 assert.match(app,/className="hex-workspace-layout hex-ms-layout"/);
 assert.match(app,/data-hex-installer-slot="cli"/);assert.match(app,/\{installer\}/);
 assert.match(micrositeCss,/container-name:\s*hex-workspace hex-microsites;\s*container-type:\s*inline-size/);
 const layout=micrositeCss.match(/\[data-hex-microsites\] \.hex-ms-layout\s*\{([^}]+)\}/)?.[1];assert.ok(layout);
 assert.match(layout,/--hex-ms-columns:\s*var\(--empire-grid-columns\)/);
 assert.match(layout,/width:\s*100%;\s*max-width:\s*none;\s*min-width:\s*0/);
 assert.match(layout,/margin:\s*0;\s*padding:\s*var\(--empire-grid-margin\)/);
 assert.doesNotMatch(micrositeCss,/--hex-ms-columns:\s*\d/);
 assert.deepEqual([...micrositeCss.matchAll(/@container hex-microsites \(min-width: (\d+)px\)/g)].map(m=>Number(m[1])),[768,1024]);
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
