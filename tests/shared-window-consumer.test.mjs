import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('generated dependency bytes match canonical source custody',()=>{
 const custody=JSON.parse(read('../src/shared/source-custody.json'));
 assert.equal(custody.repository,'Vado42-chris/xi-io-node');
 assert.equal(custody.base_commit,'053b4da87b644846adf4b15fe04d7986c0b0f51d');
 assert.equal(custody.qualification,'DERIVED_LOCAL_UNPUBLISHED_NODE_PATCH_NOT_MAIN_BASELINE');
 assert.equal(custody.react,'EXTERNAL_EXISTING_CONSUMER_RUNTIME');
 assert.equal(custody.product_payloads_included,false);
 for(const item of custody.artifact_files){
  const bytes=readFileSync(new URL('../src/shared/'+item.path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
 }
});
test('Cube is self-contained and shares one existing appearance store',()=>{
 const app=read('../src/App.tsx'),host=read('../src/SharedProductHost.tsx');
 assert.match(app,/useThemeMode, setThemeMode.*from '\.\/shared\/window-frame.mjs'/);
 assert.doesNotMatch(app,/\[theme, setTheme\] = useState/);
 assert.doesNotMatch(app+host,/\.\.\/\.\.\/shared-node/);
 assert.match(host,/NativeProductWindowShell.*from '\.\/shared\/window-frame.mjs'/);
 assert.match(host,/controlsAvailable=\{nativeInstallerAvailable\(\)\}/);
 assert.match(host,/attachShadow\(\{mode: 'open'\}\)/);
 assert.match(host,/<App embedded navigation=\{navigation\} onNavigate=\{onNavigate\} visible=\{!pluginsVisible\} \/>/);
 assert.doesNotMatch(app,/Traffic Light Window Dots|bg-rose-500\/80/);
});
test('unbound product/context is honest, with no fake authority or navigation',()=>{
 const host=read('../src/SharedProductHost.tsx');
 assert.match(host,/Owner-directed HEX accent uses the existing Node cyan-500 token/);
 assert.match(host,/id: 'hex', title: 'XI-IO HEX', theme: 'cyan-500'/);
 assert.match(host,/Account tools\/settings and Return to Studio remain unbound/);

 assert.match(host,/isAuthenticated=\{false\}/);
 assert.doesNotMatch(host,/AuthProvider|shell\.navigate|theme: ['"](?:amber|violet)/);
});
test('preview remains one rendered host with no automatic extra windows',()=>{
 const host=read('../src/SharedProductHost.tsx'),main=read('../src/main.tsx');
 assert.equal((host.match(/<NativeProductWindowShell\b/g)||[]).length,1);
 assert.equal((main.match(/<SharedProductHost\s*\/>/g)||[]).length,1);
 assert.doesNotMatch(host+main,/window\.open|new WebviewWindow/);
});

test('workspace omits rejected announcements and unsupported marketing claims',()=>{
 const app=read('../src/App.tsx');
 assert.doesNotMatch(app,/Usability &amp; Architecture Audit Corrections Applied|100% Private|zero monthly fees|>Rosetta Lexicon<|setShowRosetta|data-preview-probe|Host CLI Proof Recorded|CLI Proof Logged|Auditor Navigation:/);
 assert.match(app,/Make anything here, and keep all of it\./);
 assert.match(app,/<NativeInstallerPanel/);
});

test('product styling uses the current family baseline, not a hardcoded slate/amber skin',()=>{
 const files=['../src/App.tsx','../src/components/NativeInstallerPanel.tsx','../src/components/RollbackHistory.tsx'];
 for(const p of files){const body=read(p); assert.doesNotMatch(body,/(?:bg|text|border)-(?:slate|amber)-/); assert.doesNotMatch(body,/text-(?:emerald|red|rose)-[123]00/); assert.doesNotMatch(body,/bg-(?:emerald|rose|red|blue|purple)-9[05]0/);}
 const css=read('../src/styles/product-workspace.css');
 for(const token of ['#050505','rgba(12,12,13,.96)','#f4f4f2','#c1c1c1','--chroma-hue,188','prefers-reduced-motion'])assert.ok(css.includes(token));
 assert.doesNotMatch(css,/#b64a43|ca-hero|ca-nav/);
 assert.match(css,/data-product-theme="light"/);
});

test('original carved plate is bundled locally with exact source custody',()=>{
 const source=JSON.parse(read('../src/styles/ca-reference.custody.json'));
 const bytes=readFileSync(new URL('../'+source.asset.consumer_path,import.meta.url));
 assert.equal(bytes.length,1107994);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'0cdfc4c4674c60856fdcf316b8d0ea82d54ae7b72ab6d7aa0a70aee0da9d1733');
 assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex'),'0dab949092b553360bf5884674686569d38b43de');
 assert.match(read('../src/App.tsx'),/import brandPlate from '\.\/assets\/brand\/7d133412d_blue-bg\.png'/);
 assert.match(read('../src/styles/product-workspace.css'),/grayscale\(100%\) brightness\(\.72\) contrast\(1\.08\)/);
});

test('product backdrop retains existing parallax layers with reduced-motion and cleanup',()=>{
 const app=read('../src/components/TabletBackdrop.tsx'),css=read('../src/styles/product-workspace.css');
 assert.match(read('../src/App.tsx'),/<TabletBackdrop active=\{visible\} \/>/);
 for(const coefficient of ['*-34','*-22','*-.018'])assert.ok(app.includes(coefficient));
 assert.match(read('../src/lib/backdropMotion.mjs'),/\*\.055/);
 for(const cleanup of ["motion.dispose()","removeEventListener('pointermove'","removeEventListener('scroll'","removeEventListener('change'","removeEventListener('pagehide'","removeEventListener('pageshow'"])assert.ok(app.includes(cleanup));
 assert.match(app,/motion.enable\(pageActive&&!document.hidden&&!media.matches\)/);
 assert.doesNotMatch(app,/document\.documentElement\.style\.setProperty/);
 for(const layer of ['ca-brand-field','ca-brand-plate','ca-atmosphere','ca-vignette'])assert.ok(css.includes(layer));
 assert.match(css,/inset 0 0 150px 35px rgba\(0,0,0,\.48\)/);
});

test('reading content is not dimmed by the decorative native glass ring',()=>{
 const css=read('../src/styles/hex-native-surface.css');
 assert.match(css,/:has\(\[data-native-product="hex"\]\)/);
 assert.match(css,/> \[data-glass-side="GLASS"\]\[aria-hidden="true"\]/);
 assert.match(css,/background-color: transparent !important/);
 assert.match(read('../src/main.tsx'),/hex-native-surface.css/);
});
test('comfort names and typography bindings are real, idle background has no infinite animation',()=>{
 const app=read('../src/App.tsx'),css=read('../src/styles/product-workspace.css');
 assert.match(app,/data-comfort=\{comfort\}/);assert.ok(app.includes('{lvl}'));assert.ok(!app.includes('{lvl[0].toUpperCase()}'));
 assert.match(css,/data-comfort="comfortable"/);assert.match(css,/data-comfort="compact"/);
 assert.doesNotMatch(css,/animation:[^;]*infinite/);assert.doesNotMatch(css,/transition: transform 80ms/);assert.doesNotMatch(css,/backdrop-filter: blur/);
});
