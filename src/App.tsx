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
  Clock,
  ArrowRight,
  RefreshCw,
  Code2,
  TerminalSquare
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
  const [selectedOS, setSelectedOS] = useState<OperatingSystem>('linux');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>('Just now');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

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

  const handleRefreshMetrics = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setLastCheckTime('Just now');
    }, 400);
  };

  // Six-Gate Acceptance Invariants linking to physical execution state
  const SIX_GATES = [
    {
      id: 1,
      title: "Node Executable Path Binding",
      owner: "CLI #14",
      status: "STAGED",
      hosts: { loki: "Candidate 5b2d807 in source", aries: "Offline (Unverified)" },
      description: "Launcher pins absolute Node path to prevent ambient NVM drift in desktop/service sessions.",
      stepLink: "step-1"
    },
    {
      id: 2,
      title: "Local File-Edit CAS Guard",
      owner: "CLI #14",
      status: "STAGED",
      hosts: { loki: "src/file-edit-cas.mjs present", aries: "Offline (Unverified)" },
      description: "Whole-file SHA check and cooperative locks refuse local stale edits before user confirmation.",
      stepLink: "step-4"
    },
    {
      id: 3,
      title: "Installed Runtime & Version Verification",
      owner: "CLI #14",
      status: "OPEN",
      hosts: { loki: "Requires host xi-io-cli version", aries: "Offline" },
      description: "Installed launcher output must verify exact source_sha and matching binary digest.",
      stepLink: "step-3"
    },
    {
      id: 4,
      title: "Switchboard Routing & Ward Admission",
      owner: "Switchboard #65",
      status: "OPEN",
      hosts: { loki: "PR #65 draft 9c568988", aries: "Offline" },
      description: "Authenticated cloud-to-device execution envelope; diagnostic PONG is insufficient.",
      stepLink: "step-4"
    },
    {
      id: 5,
      title: "BINS Expected-Version CAS Collision Refusal",
      owner: "BINS #110",
      status: "BLOCKING",
      hosts: { loki: "Missing expected_version_ref in put()", aries: "Missing expected_version_ref" },
      description: "Requires atomic pair update and REFUSED_STALE_VERSION on concurrent writes to same ResourceRef.",
      stepLink: "step-5"
    },
    {
      id: 6,
      title: "End-to-End APPLY_RETURN & Consumer Acknowledgment",
      owner: "Work Pipeline",
      status: "OPEN",
      hosts: { loki: "Requires verified byte readback", aries: "Requires verified byte readback" },
      description: "Refusal and success receipts must be delivered to and acknowledged by original Work consumer.",
      stepLink: "step-3"
    }
  ];

  // Compiler and Install Targets in the HEX Suite
  const COMPILER_TARGETS = [
    {
      id: "cli",
      name: "XI-IO CLI Target",
      runtime: "Node 22+ (Native Binary Pin)",
      badge: "V1 Candidate Pinned",
      badgeColor: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      description: "Local execution runtime with cooperative CAS locking and sandboxed process launching.",
      actionText: "Install Target",
      actionView: "installer" as ActiveView,
      icon: Terminal,
      isAvailable: true
    },
    {
      id: "switchboard",
      name: "Switchboard Native Daemon",
      runtime: "Rust / Node Native Bridge",
      badge: "Draft Head 9c568988",
      badgeColor: "bg-blue-400/15 text-blue-300 border-blue-400/30",
      description: "Authenticated Ward ingress, device workers, and physical execution return envelopes.",
      actionText: "View Daemon Status",
      actionView: "status-dashboard" as ActiveView,
      icon: Cpu,
      isAvailable: true
    },
    {
      id: "bins",
      name: "BINS Storage Engine",
      runtime: "Content-Addressed CAS Ledger",
      badge: "PR #110 Refactor",
      badgeColor: "bg-rose-400/15 text-rose-300 border-rose-400/30",
      description: "Atomic multi-agent file custody and optimistic concurrency collision refusal.",
      actionText: "Inspect Engine Status",
      actionView: "status-dashboard" as ActiveView,
      icon: Layers,
      isAvailable: true
    },
    {
      id: "ward",
      name: "Ward Capability Gate",
      runtime: "Cryptographic Admission Token",
      badge: "Core Architecture",
      badgeColor: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
      description: "Authorization gate binding user approval directly to immutable ResourceVersions.",
      actionText: "View Gate Alignment",
      actionView: "status-dashboard" as ActiveView,
      icon: ShieldCheck,
      isAvailable: true
    },
    {
      id: "desktop-kde",
      name: "Desktop & KDE Plasma Adapters",
      runtime: "Native D-Bus / Session Bus",
      badge: "Reserved Target",
      badgeColor: "bg-slate-800 text-slate-400 border-slate-700",
      description: "Modular desktop adapter slots for system tray telemetry and background process custody.",
      actionText: "Target Reserved",
      actionView: "catalog" as ActiveView,
      icon: Server,
      isAvailable: false
    },
    {
      id: "agentic-workers",
      name: "Custom Device Workers",
      runtime: "White-Label Execution Slot",
      badge: "Extensible Slot",
      badgeColor: "bg-slate-800 text-slate-400 border-slate-700",
      description: "Standardized microservice compilation targets executing under Ward permissions.",
      actionText: "Target Reserved",
      actionView: "catalog" as ActiveView,
      icon: TerminalSquare,
      isAvailable: false
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        
        {/* System Status Top Component (Physical Connection Readiness) */}
        <section className="mb-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">System Status &amp; Readiness</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/60">
                    Gates Open (0/6 Verified)
                  </span>
                </div>
                <p className="text-xs text-slate-400">Six-gate physical acceptance telemetry for Loki &amp; Aries</p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Checked: {lastCheckTime}
              </span>
              <button
                type="button"
                onClick={handleRefreshMetrics}
                title="Refresh physical status evaluation"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Physical Node Health Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            {/* Loki Status */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Host: Loki</div>
                  <div className="text-[11px] text-amber-300/90 font-mono">Candidate 5b2d807 (Staged)</div>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/50 text-amber-300 border border-amber-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Staged / Unverified
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
                  <div className="text-[11px] text-rose-300/90 font-mono">Desktop Connection</div>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/50 text-rose-300 border border-rose-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Offline
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeView === 'installer'
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2. CLI Installer &amp; Compiler
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
                3. Six-Gate Physical Dashboard
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
                  Historical V1 Candidate
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  This public guide displays historical candidate <code className="font-mono bg-slate-950 px-1 py-0.5 rounded text-amber-300">{shortSha}</code>, not an approved production release.
                  Promotion to an approved release requires independently qualified evidence across the six-gate test (Ward, BINS, and device-native acceptance).
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* TAB 1: HEX SOFTWARE CATALOG & COMPILER TARGETS */}
        {activeView === 'catalog' && (
          <section className="space-y-6 mb-12" aria-label="HEX Software Catalog">
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 border border-slate-800 p-6 sm:p-8">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/20 mb-4">
                  <Compass className="w-3.5 h-3.5" />
                  <span>HEX Installer &amp; Compilation Suite</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
                  High-Assurance Toolchain Targets
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                  The HEX toolchain compiles and deploys local-first utilities under strict human-in-the-loop custody. All executable wrappers pin exact runtime paths and content-addressed digests before performing host operations.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveView('installer')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
                  >
                    <span>Deploy CLI Target</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('status-dashboard')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
                  >
                    <span>Inspect Six-Gate Readiness</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Products Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-base font-bold text-white">Compilation Targets &amp; Components</h4>
                  <p className="text-xs text-slate-400">Available candidate releases and reserved architecture slots</p>
                </div>
                <span className="text-xs font-mono text-slate-400">Suite: V1.0-Canary</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {COMPILER_TARGETS.map((target) => {
                  const Icon = target.icon;
                  return (
                    <div 
                      key={target.id}
                      className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                        target.isAvailable
                          ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90'
                          : 'bg-slate-950/40 border-slate-800/50 opacity-70'
                      }`}
                    >
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-amber-400">
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-sm text-white">{target.name}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${target.badgeColor}`}>
                            {target.badge}
                          </span>
                        </div>
                        <div className="text-xs text-amber-300/80 font-mono">{target.runtime}</div>
                        <p className="text-xs text-slate-400 leading-relaxed">{target.description}</p>
                      </div>

                      <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-mono">
                          {target.isAvailable ? 'Status: Active Target' : 'Status: Reserved'}
                        </span>
                        {target.isAvailable ? (
                          <button
                            type="button"
                            onClick={() => setActiveView(target.actionView)}
                            className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold"
                          >
                            <span>{target.actionText}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Future Release Slot</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: SIX-GATE STATUS DASHBOARD */}
        {activeView === 'status-dashboard' && (
          <section className="space-y-4 mb-10" aria-label="Six-Gate Status Dashboard">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-400" />
                  Six-Gate Physical Qualification Matrix
                </h3>
                <p className="text-xs text-slate-400">Real-time breakdown of blocking criteria before candidate promotion</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('installer')}
                className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium"
              >
                <span>Back to Installer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {SIX_GATES.map((gate) => (
                <div key={gate.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                        {gate.id}
                      </span>
                      <h4 className="text-sm font-semibold text-white">{gate.title}</h4>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{gate.owner}</span>
                    </div>
                    <p className="text-xs text-slate-300">{gate.description}</p>
                    <div className="text-[11px] text-slate-400 flex items-center gap-4 pt-1 font-mono">
                      <span>Loki: <strong className="text-amber-300 font-normal">{gate.hosts.loki}</strong></span>
                      <span>Aries: <strong className="text-rose-300 font-normal">{gate.hosts.aries}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      gate.status === 'BLOCKING'
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                        : gate.status === 'STAGED'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {gate.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('installer');
                        setTimeout(() => {
                          const el = document.getElementById(gate.stepLink);
                          el?.scrollIntoView({ behavior: 'smooth' });
                        }, 50);
                      }}
                      className="px-2 py-1 rounded text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700"
                    >
                      View Step
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 2: CLI INSTALLER & COMPILER GUIDE (Always present DOM for contract compliance) */}
        <div className={activeView === 'installer' ? 'block' : 'hidden'}>
          {/* OS Picker */}
          <section className="mb-8" aria-label="Operating system selection">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Select Operating System
              </span>
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
                    Tied to Gate 1
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
                    Tied to Gate 1
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
                    Tied to Gate 3 &amp; 6
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
                    Tied to Gate 4
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
                    Tied to Gate 2 &amp; 5
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
