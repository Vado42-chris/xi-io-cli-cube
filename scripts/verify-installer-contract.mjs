#!/usr/bin/env node
/**
 * XI-IO CLI Cube — offline static contract audit.
 * No web requests, app execution, CLI installation, credentials, or network.
 * A source PASS is NOT a working installer or installed-host acceptance.
 * Independent Agent 2 audit. Does not change App.tsx or its RELEASE object.
 */
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDefault = resolve(fileURLToPath(new URL('..', import.meta.url)));
function read(root, rel, optional=false) {
  try { return readFileSync(join(root, rel), 'utf8'); }
  catch (err) { if (optional && err?.code === 'ENOENT') return ''; throw err; }
}
const check = (name, passed, reason) => ({name, state: passed ? 'PASS' : 'FAIL', first_red: passed ? null : reason});

export function auditInstallerCube({app, metadata, pkg, env='', html, css=''}) {
  const results=[];
  const add=(name,passed,red)=>results.push(check(name,Boolean(passed),red));
  const source=String(app||'');
  const metadataText=String(metadata||'');
  const packageText=String(pkg||'');
  const envText=String(env||'');
  const page=String(html||'');
  let pack={};let meta={};
  try {pack=JSON.parse(packageText)}catch { /* explicit FAIL below */ }
  try {meta=JSON.parse(metadataText)}catch { /* explicit FAIL below */ }
  let config='';
  const releaseMatch=source.match(/\bconst\s+RELEASE\s*=\s*\{([\s\S]*?)\}\s*(?:as\s+const\s*)?;/);
  if(releaseMatch) config=releaseMatch[1];
  const sha=config.match(/\bsha:\s*['"]([a-f0-9]{40})['"]/i)?.[1]||null;
  const repo=config.match(/\brepo:\s*['"]([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)['"]/)?.[1]||null;
  const issue=config.match(/\bissueUrl:\s*['"](https:\/\/github\.com\/[^'" ]+)['"]/)?.[1]||null;
  add('CONFIG_ONE_RELEASE',Boolean(sha&&repo&&issue)&&source.match(/\bconst\s+RELEASE\s*=/g)?.length===1,'RELEASE_MISSING_DUPLICATE_OR_INVALID');
  add('ISSUE_LINK_BOUND_TO_REPO',Boolean(repo&&issue&&issue===`https://github.com/${repo}/issues/12`),'ISSUE_REPO_MISMATCH');
  add('DOWNLOAD_PINS_REPO_AND_SHA',source.includes('repos/${RELEASE.repo}/contents/install.mjs?ref=${RELEASE.sha}')&&source.includes('gh api'),'DOWNLOAD_NOT_FROM_RELEASE');
  add('INSTALL_PINS_SHA',source.includes('node xiio-install.mjs --ref ${RELEASE.sha}'),'INSTALL_REF_NOT_FROM_RELEASE');
  add('RELEASE_READBACK_AND_ROLLBACK',source.includes('xi-io-cli version')&&source.includes('xi-io-cli rollback')&&source.includes('source_sha')&&source.includes('{RELEASE.sha}'),'INSTALL_VERIFICATION_OR_ROLLBACK_MISSING');
  add('NO_APP_NETWORK_OR_REMOTE_SCRIPTS',!(/\bfetch\s*\(|\bXMLHttpRequest\b|\baxios\b|\bGoogleGenAI\b|\bgtag\s*\(|\bgtm\b/i.test(source))&&!(/<script[^>]+src\s*=\s*['"]https?:|<link[^>]+href\s*=\s*['"]https?:/i.test(page)),'RUNTIME_NETWORK_OR_EXTERNAL_RESOURCE_PRESENT');
  add('NO_PROVIDER_SECRET_TEMPLATE',!(/GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|MY_GEMINI_API_KEY/i.test(envText+source+metadataText)),'SECRET_TEMPLATE_OR_PROVIDER_KEY_PRESENT');
  add('NO_AI_BACKEND_DEPENDENCIES',Boolean(pack.dependencies&&pack.devDependencies)&&!Object.keys({...pack.dependencies,...pack.devDependencies}).some(x=>['@google/genai','express','dotenv','motion','tsx','@types/express'].includes(x)),'UNUSED_AI_OR_BACKEND_DEPENDENCY');
  add('NO_TEMPERATURE_TRANSPORT_BRANDING',Boolean(meta.name)&&!/TempTransport|Cold Chain|Transport Tracker|GEMINI_API|SERVER_SIDE_GEMINI/i.test(metadataText+page),'LEGACY_TEMPLATE_BRANDING');
  // `document.execCommand('copy')` returns a boolean. Never show "Copied" on false.
  // A prompt/selection fallback may be used, but must not be represented as a successful clipboard write.
  const usesLegacyCopy=/document\.execCommand\(\s*['"]copy['"]\s*\)/.test(source);
  const checkedCopy=/if\s*\(\s*document\.execCommand\(\s*['"]copy['"]\s*\)\s*\)/.test(source)
    || /(?:const|let)\s+(\w+)\s*=\s*document\.execCommand\(\s*['"]copy['"]\s*\)[\s\S]{0,200}?if\s*\(\s*\1\s*\)/.test(source);
  add('COPY_SUCCESS_IS_CONFIRMED',!usesLegacyCopy||checkedCopy,'COPY_FALLBACK_FALSE_SUCCESS');
  add('COPY_HAS_MANUAL_SELECTION_FALLBACK',/(?:\.select\(\)|\.selectNodeContents\()/.test(source),'COPY_NO_SELECTABLE_FALLBACK');
  const isTab=/role\s*=\s*['"]tab['"]/.test(source);
  const keyboard=/onKeyDown\s*=/.test(source)||/tabIndex\s*=\s*\{\s*0\s*\}/.test(source);
  const associatedPanels=source.includes('tabpanel-')&&(/id=\{`tabpanel-/.test(source)||/id=['"]tabpanel-/.test(source));
  add('TABS_KEYBOARD_AND_PANEL',isTab&&keyboard&&associatedPanels,'OS_TABS_KEYBOARD_OR_PANEL_MISSING');
  add('LINUX_ONLY_PREREQUISITE',!source.includes("selectedOS === 'linux' || true")&&!source.includes('selectedOS === "linux" || true'),'LINUX_PREREQUISITE_SHOWN_ON_OTHER_OS');
  add('MOBILE_COMMAND_SCROLL_AND_ACCESSIBLE_COPY',source.includes('overflow-x-auto')&&source.includes('aria-label')&&source.includes('Copy'),'COMMAND_PRESENTATION_ACCESSIBILITY_UNQUALIFIED');
  add('NO_SHELL_EXECUTION_IN_PAGE',!(/\bchild_process\b|\bspawnSync\b|\bexecSync\b|\bexecFile\b/.test(source)),'PAGE_HAS_EXECUTION_CAPABILITY');
  return Object.freeze({schema:'xiio.cli-cube.static-contract-audit/v1',qualifier:'STATIC_SOURCE_ONLY_NOT_INSTALLATION',state:results.every(x=>x.state==='PASS')?'PASS':'FAIL',first_red:results.find(x=>x.state==='FAIL')?.first_red||null,checks:results,denominator:results.length,passed:results.filter(x=>x.state==='PASS').length});
}

export function auditDirectory(root=rootDefault) {
  return auditInstallerCube({app:read(root,'src/App.tsx'),metadata:read(root,'metadata.json'),pkg:read(root,'package.json'),env:read(root,'.env.example',true),html:read(root,'index.html'),css:read(root,'src/index.css',true)});
}
if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  if(process.argv.length>3) {process.stderr.write('USAGE: node scripts/verify-installer-contract.mjs [directory]\n');process.exitCode=2;}
  else {
    try {const result=auditDirectory(process.argv[2]?resolve(process.argv[2]):rootDefault);process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.state!=='PASS')process.exitCode=1;}
    catch(e) {process.stderr.write(JSON.stringify({state:'BLOCKED',first_red:'SOURCE_READ_FAILED',detail:e.code||'UNCLASSIFIED'})+'\n');process.exitCode=2;}
  }
}