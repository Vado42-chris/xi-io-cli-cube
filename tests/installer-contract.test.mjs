import test from 'node:test';
import assert from 'node:assert/strict';
import {auditInstallerCube} from '../scripts/verify-installer-contract.mjs';
const app=`const RELEASE = {
 label: "V1 candidate — not a release yet",
 repo: "Vado42-chris/xi-io-cli",
 sha: "54509965c9d91ab02febcc8e49755e2b072a0ca9",
 issueUrl: "https://github.com/Vado42-chris/xi-io-cli/issues/12",
};
const downloadCommand = \`gh api "repos/\${RELEASE.repo}/contents/install.mjs?ref=\${RELEASE.sha}"\`;
const installCommand = \`node xiio-install.mjs --ref \${RELEASE.sha}\`;
const other = "xi-io-cli version xi-io-cli rollback source_sha";
const sha = {RELEASE.sha};
<div role="tab" tabIndex={0} aria-label="Linux" onKeyDown={() => {}} />
<div id={\`tabpanel-\${selectedOS}\`} />
{selectedOS === 'linux' && <div>bubblewrap</div>}
<div className="overflow-x-auto" aria-label="Copy"><button>Copy</button></div>
const area = document.createElement('textarea');
area.select();
if (document.execCommand('copy')) { setCopiedId(id); }
`;
const clean={app,metadata:JSON.stringify({name:'XI-IO CLI Install',description:'Offline command guide'}),pkg:JSON.stringify({dependencies:{react:'^19.0.0', 'react-dom':'^19.0.0','lucide-react':'^0.546.0'},devDependencies:{typescript:'^6.0.0',vite:'^8.0.0'}}),env:'',html:'<html><head></head><body><div id="root"></div></body></html>'};
const failures=(v)=>auditInstallerCube(v).checks.filter(c=>c.state==='FAIL').map(c=>c.first_red);
test('strict clean offline installer fixture passes entire 15-cell denominator',()=>{
 const x=auditInstallerCube(clean);assert.equal(x.state,'PASS',JSON.stringify(x.checks.filter(c=>c.state==='FAIL')));assert.equal(x.denominator,15);
});
test('catches copied state after unchecked legacy execCommand(false)',()=>{
 const x={...clean,app:app.replace("if (document.execCommand('copy')) { setCopiedId(id); }","document.execCommand('copy'); setCopiedId(id);")};
 assert.ok(failures(x).includes('COPY_FALLBACK_FALSE_SUCCESS'));
});
test('catches missing linked tabpanel and inaccessible keyboard tabs',()=>{
 const x={...clean,app:app.replace('onKeyDown={() => {}}','').replace('tabIndex={0}','tabIndex={isSelected ? 0 : -1}').replace('id={\`tabpanel-\${selectedOS}\`}','data-panel="missing"')};
 assert.ok(failures(x).includes('OS_TABS_KEYBOARD_OR_PANEL_MISSING'));
});
test('catches React/AISTUDIO Gemini key and unused backend packages',()=>{
 const x={...clean,env:'GEMINI_API_KEY="MY_GEMINI_API_KEY"',pkg:JSON.stringify({dependencies:{'@google/genai':'^2',react:'^19',express:'^4'},devDependencies:{typescript:'^6'}})};
 assert.ok(failures(x).includes('SECRET_TEMPLATE_OR_PROVIDER_KEY_PRESENT'));
 assert.ok(failures(x).includes('UNUSED_AI_OR_BACKEND_DEPENDENCY'));
});
test('catches legacy TempTransport metadata, not only runtime text',()=>{
 assert.ok(failures({...clean,metadata:JSON.stringify({name:'TempTransport - Cold Chain & Transport Tracker'})}).includes('LEGACY_TEMPLATE_BRANDING'));
});
test('catches floating source/ref in install command',()=>{
 assert.ok(failures({...clean,app:app.replace('node xiio-install.mjs --ref \${RELEASE.sha}','node xiio-install.mjs --ref main')}).includes('INSTALL_REF_NOT_FROM_RELEASE'));
});
test('catches an external network path despite static-looking page',()=>{
 assert.ok(failures({...clean,app:app+'fetch("https://example.com")'}).includes('RUNTIME_NETWORK_OR_EXTERNAL_RESOURCE_PRESENT'));
 assert.ok(failures({...clean,html:'<script src="https://cdn.example.com/tool.js"></script>'}).includes('RUNTIME_NETWORK_OR_EXTERNAL_RESOURCE_PRESENT'));
});
test('catches Linux prerequisite shown for every platform',()=>{
 assert.ok(failures({...clean,app:app.replace("selectedOS === 'linux' &&", "selectedOS === 'linux' || true &&")}).includes('LINUX_PREREQUISITE_SHOWN_ON_OTHER_OS'));
});
test('catches a repo/issue identity mismatch',()=>{
 assert.ok(failures({...clean,app:app.replace('xi-io-cli/issues/12','xi-io-cli/issues/99')}).includes('ISSUE_REPO_MISMATCH'));
});