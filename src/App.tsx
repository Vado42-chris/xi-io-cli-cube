/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Check, 
  Copy, 
  Terminal, 
  AlertTriangle, 
  ExternalLink, 
  CheckCircle2, 
  HelpCircle,
  FolderSync,
  ShieldAlert,
  Lock,
  Activity,
  Server,
  Layers,
  Cpu,
  ShieldCheck,
  Compass,
  ArrowRight,
  ShieldX,
  FileText,
  AlertCircle,
  Laptop,
  Globe,
  Radio,
  FileCheck2
} from 'lucide-react';

const RELEASE = {
  label: "V1 candidate — not a release yet",
  repo: "Vado42-chris/xi-io-cli",
  sha: "54509965c9d91ab02febcc8e49755e2b072a0ca9",
  issueUrl: "https://github.com/Vado42-chris/xi-io-cli/issues/12",
};

const OS_LIST = ['linux', 'macos', 'windows'] as const;
type OperatingSystem = typeof OS_LIST[number];
type ActiveView = 'catalog' | 'installer' | 'status-dashboard';
type TargetComponentId = 'cli' | 'studio' | 'web' | 'switchboard' | 'bins' | 'ward';

function detectUserOS(): OperatingSystem {
  if (typeof window === 'undefined') return 'linux';
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = ((navigator as any).userAgentData?.platform || navigator.platform || '').toLowerCase();

  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) {
    return 'macos';
  }
  if (platform.includes('win') || ua.includes('windows')) {
    return 'windows';
  }
  return 'linux';
}

interface CommandBlockProps {
  id: string;
  command: string;
  copiedId: string | null;
  onCopy: (command: string, id: string) => void;
}

function CommandBlock({ id, command, copiedId, onCopy }: CommandBlockProps) {
  const isCopied = copiedId === id;
  const codeRef = useRef<HTMLElement>(null);

  return (
    <div className="relative group rounded-lg bg-slate-950 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800/80 text-xs text-slate-400 select-none">
        <span className="font-mono text-[11px] text-slate-400">Terminal</span>
        <button
          type="button"
          onClick={() => onCopy(command, id)}
          aria-label={`Copy command: ${command}`}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 focus:ring-offset-slate-900 ${
            isCopied
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95'
          }`}
        >
          {isCopied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto">
        <pre className="font-mono text-xs sm:text-sm text-slate-100 whitespace-pre leading-relaxed select-all">
          <code ref={codeRef}>{command}</code>
        </pre>
      </div>
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('catalog');
  const [selectedTarget, setSelectedTarget] = useState<TargetComponentId>('cli');
  const [selectedOS, setSelectedOS] = useState<OperatingSystem>('linux');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedOS(detectUserOS());
  }, []);

  const handleCopy = async (command: string, id: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(command);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
        return;
      }
      throw new Error('Clipboard API unavailable');
    } catch {
      // Fallback selection and copy for restricted or non-secure contexts
      try {
        const textArea = document.createElement('textarea');
        textArea.value = command;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        textArea.remove();
        if (successful) {
          setCopiedId(id);
          setTimeout(() => setCopiedId(null), 2000);
        } else {
          window.prompt('Copy command to clipboard: Ctrl+C, Enter', command);
        }
      } catch {
        window.prompt('Copy command to clipboard: Ctrl+C, Enter', command);
      }
    }
  };

  const shortSha = RELEASE.sha.slice(0, 8);

  // Commands built strictly from the RELEASE config object
  const downloadCommand = `gh api -H "Accept: application/vnd.github.raw" "repos/${RELEASE.repo}/contents/install.mjs?ref=${RELEASE.sha}" > xiio-install.mjs`;
  const installCommand = `node xiio-install.mjs --ref ${RELEASE.sha}`;
  const versionCommand = `xi-io-cli version`;
  const startCommand = `xi-io-cli`;
  const rollbackCommand = `xi-io-cli rollback`;

  const handleTabKeyDown = (e: React.KeyboardEvent, currentOS: OperatingSystem) => {
    const currentIndex = OS_LIST.indexOf(currentOS);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % OS_LIST.length;
      setSelectedOS(OS_LIST[nextIndex]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + OS_LIST.length) % OS_LIST.length;
      setSelectedOS(OS_LIST[prevIndex]);
    }
  };

  // Canonical Physical Six-Gate Contract (Measuring true remote execution & custody)
  const PHYSICAL_SIX_GATES = [
    {
      gate: 1,
      name: "Declared API",
      owner: "Switchboard #65",
      status: "STAGED",
      hosts: { loki: "Candidate 9c568988 in draft", aries: "Last recorded: Offline" },
      criteria: "Per-host service declaration and routing signature published in Switchboard service registry."
    },
    {
      gate: 2,
      name: "Installed Device Endpoint",
      owner: "CLI #14 / Device Worker",
      status: "STAGED",
      hosts: { loki: "Candidate 5b2d807 in source", aries: "Last recorded: Offline" },
      criteria: "Authenticated native daemon listening on local host socket; verified executable binding."
    },
    {
      gate: 3,
      name: "Ward Capability Admission",
      owner: "Ward Perimeter",
      status: "OPEN",
      hosts: { loki: "Awaiting capability token binding", aries: "Last recorded: Offline" },
      criteria: "Cryptographic capability grant verified against exact resource and version; zero ambient execution."
    },
    {
      gate: 4,
      name: "Actual Device Effect",
      owner: "Switchboard Worker",
      status: "OPEN",
      hosts: { loki: "Awaiting authorized invocation", aries: "Last recorded: Offline" },
      criteria: "Target mutation applied to physical host filesystem; diagnostic PONG is non-qualifying."
    },
    {
      gate: 5,
      name: "BINS Version Custody & CAS Collision Refusal",
      owner: "BINS #110",
      status: "REPAIRED IN SOURCE",
      hosts: { loki: "Commit 7ea3976f (expected-version CAS merged)", aries: "Cross-host custody unverified" },
      criteria: "Atomic ResourceVersion advance; competing write refused with REFUSED_STALE_VERSION (HTTP 409)."
    },
    {
      gate: 6,
      name: "Original Work APPLY_RETURN",
      owner: "Work Pipeline",
      status: "OPEN",
      hosts: { loki: "Awaiting independent readback", aries: "Last recorded: Offline" },
      criteria: "Out-of-band byte readback confirmed; receipt delivered and acknowledged by original Work consumer."
    }
  ];

  // Installer Preflight Invariants (Governing the local client binary)
  const INSTALLER_PREFLIGHT = [
    {
      id: "P1",
      title: "Node Executable Path Binding",
      owner: "CLI #14",
      status: "VERIFIED IN SOURCE",
      detail: "Repaired launcher pins fs.realpathSync(process.execPath), eliminating ambient PATH lookup in desktop/service sessions."
    },
    {
      id: "P2",
      title: "Running Digest & SHA Readback",
      owner: "CLI #14",
      status: "PENDING HOST EXECUTION",
      detail: "Installed binary output must match 54509965 (candidate) or 5b2d807 (repaired) without relying on PRE_RUNNER passes."
    },
    {
      id: "P3",
      title: "Launcher Migration & Rollback Protection",
      owner: "CLI #14",
      status: "VERIFIED IN SOURCE",
      detail: "Preserves legacy ~/.local/bin/xi-io-cli; requires explicit SHA-256 confirmation before moving older wrappers aside."
    }
  ];

  // Comprehensive Product Catalog reflecting the real XI-IO ecosystem pipeline
  const SUITE_PRODUCTS = [
    {
      id: "cli" as TargetComponentId,
      name: "XI-IO CLI",
      category: "Customer Installable Client",
      tagline: "Local execution runtime & interactive CAS file editor",
      badge: "V1 Candidate Pinned",
      badgeColor: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      isInstallable: true,
      description: "Primary operator CLI with bubblewrap containment, whole-file content verification, and interactive edit approvals.",
      releaseVersion: "54509965 (Historical PR #13 Pin)",
      statusDetail: "Unapproved Candidate. Verified in static contract audit; awaiting physical host six-gate qualification.",
      prerequisites: "Node.js 22+, GitHub CLI authenticated (private repo), Ollama tool model.",
      icon: Terminal
    },
    {
      id: "studio" as TargetComponentId,
      name: "XI-IO Studio & KDE Adapters",
      category: "Desktop Application & Workspaces",
      tagline: "Native desktop session manager & Plasma workspace extension",
      badge: "PR #240 in Review",
      badgeColor: "bg-purple-400/15 text-purple-300 border-purple-400/30",
      isInstallable: false,
      description: "Desktop workspace environment with native KDE Plasma integration, D-Bus session controls, and background worker monitors.",
      releaseVersion: "PR #240 (14 passing local source tests)",
      statusDetail: "In Desktop Qualification. Isolated from CLI critical path; not yet published as customer installer.",
      prerequisites: "Linux Desktop / KDE Plasma 6 or standard X11/Wayland desktop session.",
      icon: Laptop
    },
    {
      id: "web" as TargetComponentId,
      name: "XI-IO Public Web & Docs",
      category: "Documentation & Release Portal",
      tagline: "Public product catalog, release ledgers & qualification reports",
      badge: "Draft PR #1367",
      badgeColor: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30",
      isInstallable: false,
      description: "Public distribution portal providing verified release manifests, changelogs, and audit ledger readouts.",
      releaseVersion: "PR #1367 (Draft Architecture)",
      statusDetail: "In Pipeline. Governs canonical release publishing; pending native build qualification.",
      prerequisites: "Web browser with offline cache capabilities.",
      icon: Globe
    },
    {
      id: "switchboard" as TargetComponentId,
      name: "Switchboard Bridge Daemon",
      category: "Infrastructure Daemon",
      tagline: "Authenticated device-to-cloud router & Ward admission relay",
      badge: "Draft PR #65 (9c568988)",
      badgeColor: "bg-blue-400/15 text-blue-300 border-blue-400/30",
      isInstallable: false,
      description: "Host infrastructure daemon routing cloud instructions through Ward capability admission to local executors.",
      releaseVersion: "PR #65 (Commit 9c568988)",
      statusDetail: "Infrastructure Dependency. Managed by host runtime; not a downloadable user package.",
      prerequisites: "Physical host daemon installation; requires valid Ward capability token.",
      icon: Cpu
    },
    {
      id: "bins" as TargetComponentId,
      name: "BINS Version Custody Engine",
      category: "Storage Engine & Ledger",
      tagline: "Atomic ResourceVersion custody & multi-agent CAS guard",
      badge: "PR #110 (Commit 7ea3976f)",
      badgeColor: "bg-rose-400/15 text-rose-300 border-rose-400/30",
      isInstallable: false,
      description: "Shared storage engine enforcing atomic pair staging, content-addressed versioning, and HTTP 409 collision refusal.",
      releaseVersion: "PR #110 (Commit 7ea3976f CAS refactor)",
      statusDetail: "Repaired in Source. Physical cross-host qualification pending on Loki & Aries.",
      prerequisites: "POSIX filesystem with atomic rename support; BINS store repository.",
      icon: Layers
    },
    {
      id: "ward" as TargetComponentId,
      name: "Ward Security Perimeter",
      category: "Authorization Framework",
      tagline: "Cryptographic capability minting & admission gate",
      badge: "Core Framework",
      badgeColor: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
      isInstallable: false,
      description: "Security boundary ensuring no execution occurs without explicit user OAuth consent bound to exact ResourceVersions.",
      releaseVersion: "Core Policy Framework",
      statusDetail: "Internal Boundary. Embedded within Switchboard and native worker endpoints.",
      prerequisites: "Internal cryptographic engine; non-downloadable.",
      icon: ShieldCheck
    }
  ];

  const currentComponent = SUITE_PRODUCTS.find(c => c.id === selectedTarget) || SUITE_PRODUCTS[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        
        {/* Truthful Baseline Status Component (Observation Evidence, Zero Telemetry) */}
        <section className="mb-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Recorded System Qualification Baseline</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/60">
                    Physical Gates: 0/6 Verified
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Static evidence review recorded at 2026-10-25 08:33 UTC (Ref: Switchboard #18 / CLI #12). Does not perform live network polling.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-slate-400 font-mono bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Offline Evidence Review</span>
            </div>
          </div>

          {/* Physical Node Baseline State with Exact Disclosures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            {/* Loki Status */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Host: Loki</div>
                  <div className="text-[11px] text-amber-300/90 font-mono">Candidate 5b2d807 identified in source</div>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/50 text-amber-300 border border-amber-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Installation Unverified
                </span>
                <div className="text-[10px] text-slate-400 mt-0.5">Physical receipt pending</div>
              </div>
            </div>

            {/* Aries Status */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-slate-500" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Host: Aries</div>
                  <div className="text-[11px] text-rose-300/90 font-mono">Desktop Device Bridge</div>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/50 text-rose-300 border border-rose-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Last Recorded: Offline
                </span>
                <div className="text-[10px] text-slate-400 mt-0.5">Device reports disconnected</div>
              </div>
            </div>
          </div>

          {/* 3-Tab Main Navigation Switcher */}
          <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-slate-400">Navigation:</span>
            <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800 flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setActiveView('catalog')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeView === 'catalog'
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1. HEX Software Suite
              </button>
              <button
                type="button"
                onClick={() => setActiveView('installer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  activeView === 'installer'
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>2. Install &amp; Compile</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono">
                  {selectedTarget.toUpperCase()}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('status-dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeView === 'status-dashboard'
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3. System Diagnostics
              </button>
            </div>
          </div>
        </section>

        {/* Header */}
        <header className="mb-6 border-b border-slate-800 pb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 shadow-sm">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    XI-IO CLI
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  {RELEASE.label}
                </span>
                <span className="font-mono text-xs text-slate-300 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-slate-400" />
                  {shortSha}
                </span>
              </div>
            </div>

            {/* Historical Candidate Safeguard Banner */}
            <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs sm:text-sm flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-300">
                  Historical V1 Candidate — Not an Approved Release
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  This public guide displays historical candidate <code className="font-mono bg-slate-950 px-1 py-0.5 rounded text-amber-300">{shortSha}</code>. 
                  It is not an approved production release. Promotion requires complete independent six-gate physical verification across Loki and Aries.
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* TAB 1: HEX SOFTWARE CATALOG & TARGET DISCOVERY */}
        {activeView === 'catalog' && (
          <section className="space-y-6 mb-12" aria-label="HEX Software Catalog">
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 border border-slate-800 p-6 sm:p-8">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/20 mb-4">
                  <Compass className="w-3.5 h-3.5" />
                  <span>HEX Ecosystem Discovery</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
                  Discover Products &amp; Infrastructure Targets
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                  Explore the full XI-IO product and toolchain pipeline. Genuinely installable user packages are clearly distinguished from infrastructure daemons, internal boundaries, and pipeline previews. Selecting any component binds its exact identity and requirements into Tab 2.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTarget('cli');
                      setActiveView('installer');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
                  >
                    <span>Configure CLI Installation</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('status-dashboard')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
                  >
                    <span>Inspect Six-Gate Evidence</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Products Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-base font-bold text-white">Products &amp; Infrastructure Pipeline</h4>
                  <p className="text-xs text-slate-400">Select a component to inspect its installation path and requirements</p>
                </div>
                <span className="text-xs font-mono text-slate-400">Catalog Registry: Active</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SUITE_PRODUCTS.map((product) => {
                  const Icon = product.icon;
                  const isSelected = selectedTarget === product.id;
                  return (
                    <div 
                      key={product.id}
                      className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                        isSelected
                          ? 'bg-slate-900 border-amber-400/40 ring-1 ring-amber-400/30'
                          : product.isInstallable
                          ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          : 'bg-slate-950/50 border-slate-800/60'
                      }`}
                    >
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-amber-400">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-bold text-sm text-white block">{product.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{product.category}</span>
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${product.badgeColor}`}>
                            {product.badge}
                          </span>
                        </div>
                        
                        <div className="text-xs text-amber-300/80 font-medium">{product.tagline}</div>
                        <p className="text-xs text-slate-400 leading-relaxed">{product.description}</p>
                        
                        <div className="text-[11px] space-y-1 pt-1 font-mono text-slate-400">
                          <div><span className="text-slate-400">Release:</span> <span className="text-slate-300">{product.releaseVersion}</span></div>
                          <div><span className="text-slate-400">Status:</span> <span className="text-slate-300">{product.statusDetail}</span></div>
                          <div><span className="text-slate-400">Prereqs:</span> <span className="text-slate-300">{product.prerequisites}</span></div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-slate-400">
                          {product.isInstallable ? 'Installable: Yes (Candidate)' : 'User Install: Blocked'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTarget(product.id);
                            setActiveView('installer');
                          }}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
                            product.isInstallable
                              ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                              : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                          }`}
                        >
                          <span>{product.isInstallable ? 'Install CLI' : 'Inspect Requirements'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: SYSTEM DIAGNOSTICS & QUALIFICATION GATES */}
        {activeView === 'status-dashboard' && (
          <section className="space-y-8 mb-10" aria-label="System Diagnostics">
            
            {/* Section 1: Canonical Physical Six-Gate Contract */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-400" />
                    Canonical Physical Six-Gate Acceptance Contract
                  </h3>
                  <p className="text-xs text-slate-400">
                    Mandatory end-to-end execution requirements governing live release authorization
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('installer')}
                  className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium"
                >
                  <span>Go to Installer</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {PHYSICAL_SIX_GATES.map((g) => (
                  <div key={g.gate} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                          {g.gate}
                        </span>
                        <h4 className="text-sm font-semibold text-white">Gate {g.gate}: {g.name}</h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{g.owner}</span>
                      </div>
                      <p className="text-xs text-slate-300">{g.criteria}</p>
                      <div className="text-[11px] text-slate-400 flex items-center gap-4 pt-1 font-mono">
                        <span>Loki: <strong className="text-amber-300 font-normal">{g.hosts.loki}</strong></span>
                        <span>Aries: <strong className="text-rose-300 font-normal">{g.hosts.aries}</strong></span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        g.status === 'REPAIRED IN SOURCE'
                          ? 'bg-blue-950/80 text-blue-300 border border-blue-800'
                          : g.status === 'STAGED'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {g.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: Installer Preflight Invariants */}
            <div className="pt-4 border-t border-slate-800/80">
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-400" />
                  Installer Preflight Invariants (Local Binary Checks)
                </h4>
                <p className="text-xs text-slate-400">Local environment preconditions verified during CLI installation</p>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {INSTALLER_PREFLIGHT.map((p) => (
                  <div key={p.id} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <span className="font-mono text-amber-400">{p.id}</span>
                        <span>{p.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({p.owner})</span>
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">{p.detail}</div>
                    </div>
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 shrink-0">
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </section>
        )}

        {/* TAB 2: INSTALL & COMPILE GUIDE */}
        <div className={activeView === 'installer' ? 'block' : 'hidden'}>
          
          {/* Target Identity & Selection Bar */}
          <div className="mb-6 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">Selected Target Component:</span>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{currentComponent.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${currentComponent.badgeColor}`}>
                    {currentComponent.badge}
                  </span>
                </div>
              </div>

              {/* Target Switcher across components */}
              <div className="inline-flex p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs flex-wrap gap-1">
                {SUITE_PRODUCTS.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => setSelectedTarget(prod.id)}
                    className={`px-2.5 py-1 rounded capitalize font-medium transition-colors ${
                      selectedTarget === prod.id
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {prod.id}
                  </button>
                ))}
              </div>
            </div>

            {/* If an unreleased or infrastructure component is selected, block installation and display exact requirements */}
            {!currentComponent.isInstallable && (
              <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/50 text-rose-200 text-xs space-y-2">
                <div className="font-semibold text-rose-300 flex items-center gap-2 text-sm">
                  <ShieldX className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Installation Blocked: {currentComponent.name} is not an Installable Customer Package</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {currentComponent.name} cannot be installed from this client. {currentComponent.category.includes('Infrastructure') ? 'It is an infrastructure daemon managed by host systems under Ward capability admission.' : 'It is currently in pipeline qualification and does not yet publish an approved installer artifact.'}
                </p>
                <div className="bg-slate-950/70 p-3 rounded border border-rose-900/50 font-mono text-[11px] text-slate-300 space-y-1">
                  <div><strong>Release Status:</strong> {currentComponent.statusDetail}</div>
                  <div><strong>Prerequisites:</strong> {currentComponent.prerequisites}</div>
                  <div><strong>Governing Gate:</strong> Requires physical host evidence in Tab 3 before release.</div>
                </div>
                <div className="pt-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveView('status-dashboard')}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:underline font-semibold"
                  >
                    <span>View Qualifying Gates in System Diagnostics</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTarget('cli')}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white underline font-medium"
                  >
                    <span>Switch to Installable XI-IO CLI</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CLI Installer Commands (Displayed for CLI target, DOM preserved for contract compliance) */}
          <div className={selectedTarget === 'cli' ? 'block' : 'opacity-40 pointer-events-none'}>
            
            {/* Warning callout adjacent to executable instructions */}
            <div className="mb-6 p-3.5 rounded-lg bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Candidate Pin: Executing this flow installs historical candidate <strong className="font-mono">{shortSha}</strong>.</span>
              </div>
              <span className="font-mono text-[11px] text-amber-300/80 shrink-0">Unapproved Candidate</span>
            </div>

            {/* OS Picker */}
            <section className="mb-8" aria-label="Operating system selection">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Select Target Operating System
                </span>
                <span className="text-xs font-mono text-slate-400">Target: {selectedTarget.toUpperCase()}</span>
              </div>
              <div 
                role="tablist" 
                aria-label="Operating Systems"
                className="grid grid-cols-3 gap-2 p-1 bg-slate-900/90 rounded-xl border border-slate-800"
              >
                {OS_LIST.map((os) => {
                  const label = os === 'linux' ? 'Linux' : os === 'macos' ? 'macOS' : 'Windows';
                  const isSelected = selectedOS === os;
                  return (
                    <button
                      key={os}
                      role="tab"
                      id={`tab-${os}`}
                      aria-selected={isSelected}
                      aria-controls={`tabpanel-${os}`}
                      tabIndex={isSelected ? 0 : -1}
                      onKeyDown={(e) => handleTabKeyDown(e, os)}
                      onClick={() => setSelectedOS(os)}
                      className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                        isSelected
                          ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Tab Panel for Selected OS */}
            <div id={`tabpanel-${selectedOS}`} role="tabpanel" aria-labelledby={`tab-${selectedOS}`}>

              {/* Before You Start Checklist */}
              <section className="mb-10 p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Before you start
                </h2>
                <ul className="space-y-3 text-xs sm:text-sm text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Node.js 22 or newer</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>
                      GitHub CLI installed and signed in:{' '}
                      <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-amber-300 border border-slate-800">
                        gh auth login
                      </code>{' '}
                      <span className="text-slate-400">(the repo is private)</span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>Ollama running with at least one installed model that supports tools</span>
                  </li>
                  {selectedOS === 'linux' && (
                    <li className="flex items-start gap-2.5 text-slate-200">
                      <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span>
                        <strong className="text-slate-200 font-semibold">Linux only:</strong> bubblewrap (
                        <code className="font-mono bg-slate-950 px-1.5 py-0.5 rounded text-amber-300 border border-slate-800">
                          sudo apt install bubblewrap
                        </code>
                        ) — without it, commands stay off and reading/edits still work
                      </span>
                    </li>
                  )}
                </ul>
              </section>

              {/* Step Cards */}
              <section className="space-y-6 mb-10" aria-label="Installation steps">
                
                {/* Step 1 */}
                <div id="step-1" className="p-5 sm:p-6 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                        1
                      </span>
                      <h3 className="text-base sm:text-lg font-semibold text-white">
                        Download the installer
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('status-dashboard')}
                      className="text-[11px] text-slate-400 hover:text-amber-300 font-mono"
                    >
                      Preflight: Node Path Binding
                    </button>
                  </div>

                  {selectedOS === 'windows' && (
                    <div className="mb-4 p-3.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs sm:text-sm flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Warning:</strong> Run this in Command Prompt (<code className="font-mono bg-slate-950/60 px-1 py-0.5 rounded">cmd.exe</code>), not PowerShell. PowerShell 5 changes the file&apos;s encoding.
                      </div>
                    </div>
                  )}

                  <CommandBlock
                    id="step-1"
                    command={downloadCommand}
                    copiedId={copiedId}
                    onCopy={handleCopy}
                  />
                </div>

                {/* Step 2 */}
                <div id="step-2" className="p-5 sm:p-6 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                        2
                      </span>
                      <h3 className="text-base sm:text-lg font-semibold text-white">
                        Install
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('status-dashboard')}
                      className="text-[11px] text-slate-400 hover:text-amber-300 font-mono"
                    >
                      Preflight: Runtime Hash
                    </button>
                  </div>

                  <CommandBlock
                    id="step-2"
                    command={installCommand}
                    copiedId={copiedId}
                    onCopy={handleCopy}
                  />
                </div>

                {/* Step 3 */}
                <div id="step-3" className="p-5 sm:p-6 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                        3
                      </span>
                      <h3 className="text-base sm:text-lg font-semibold text-white">
                        Check what got installed
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('status-dashboard')}
                      className="text-[11px] text-slate-400 hover:text-amber-300 font-mono"
                    >
                      Physical Gate 6: Readback
                    </button>
                  </div>

                  <div className="mb-3">
                    <CommandBlock
                      id="step-3"
                      command={versionCommand}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                    />
                  </div>

                  <p className="text-xs sm:text-sm text-slate-300">
                    source_sha must equal{' '}
                    <code className="font-mono text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 select-all">
                      {RELEASE.sha}
                    </code>
                    . If not, stop and report it on the V1 issue.
                  </p>
                </div>

                {/* Step 4 */}
                <div id="step-4" className="p-5 sm:p-6 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                        4
                      </span>
                      <h3 className="text-base sm:text-lg font-semibold text-white">
                        Start
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('status-dashboard')}
                      className="text-[11px] text-slate-400 hover:text-amber-300 font-mono"
                    >
                      Physical Gate 3 &amp; 4: Ward
                    </button>
                  </div>

                  <div className="mb-3">
                    <CommandBlock
                      id="step-4"
                      command={startCommand}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                    />
                  </div>

                  <p className="text-xs sm:text-sm text-slate-400">
                    Every edit and command is shown to you first. Nothing changes until you type yes.
                  </p>
                </div>

                {/* Step 5 */}
                <div id="step-5" className="p-5 sm:p-6 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                        5
                      </span>
                      <h3 className="text-base sm:text-lg font-semibold text-white">
                        If anything goes wrong, go back
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('status-dashboard')}
                      className="text-[11px] text-slate-400 hover:text-amber-300 font-mono"
                    >
                      Preflight P3: Rollback
                    </button>
                  </div>

                  <div className="mb-3">
                    <CommandBlock
                      id="step-5"
                      command={rollbackCommand}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                    />
                  </div>

                  <p className="text-xs sm:text-sm text-slate-400">
                    Run it again to undo the rollback.
                  </p>
                </div>

              </section>

              {/* Troubleshooting Boxes */}
              <section className="space-y-4 mb-10">
                
                {/* Troubleshooting 1 */}
                <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800">
                  <h4 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                    <FolderSync className="w-4 h-4 text-amber-400" />
                    If the installer says LAUNCHER_OWNERSHIP_CONFLICT
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    An older launcher exists and was left alone, and the installer printed the exact command to move it aside — run that command, then Step 2 again.
                  </p>
                </div>

                {/* Troubleshooting 2 */}
                <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800">
                  <h4 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    If it says PATH needs updating
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    The add_to_path line the installer prints is what to run, then open a new terminal.
                  </p>
                </div>

              </section>

              {/* Rollback note */}
              <div className="mb-12 p-4 rounded-xl bg-slate-900/30 border border-slate-800/80 text-xs text-slate-400">
                <span className="text-slate-300 font-medium">Rollback Reference:</span>{' '}
                <span>
                  The initial-bootstrap reference is a placeholder rollback target until an independently qualified generation is established.
                </span>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-800 pt-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            <a
              href={RELEASE.issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-medium underline underline-offset-4 decoration-amber-400/40 hover:decoration-amber-300 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-950 rounded"
            >
              <span>Report a problem (V1 issue)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span>Commit:</span>
            <span className="font-mono text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 select-all">
              {RELEASE.sha}
            </span>
          </div>
        </footer>

      </div>
    </div>
  );
}
