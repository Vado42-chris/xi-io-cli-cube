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
  Lock
} from 'lucide-react';

const RELEASE = {
  label: "V1 candidate — not a release yet",
  repo: "Vado42-chris/xi-io-cli",
  sha: "54509965c9d91ab02febcc8e49755e2b072a0ca9",
  issueUrl: "https://github.com/Vado42-chris/xi-io-cli/issues/12",
};

const OS_LIST = ['linux', 'macos', 'windows'] as const;
type OperatingSystem = typeof OS_LIST[number];

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        
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
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                  1
                </span>
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  Download the installer
                </h3>
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
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                  2
                </span>
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  Install
                </h3>
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
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                  3
                </span>
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  Check what got installed
                </h3>
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
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                  4
                </span>
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  Start
                </h3>
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
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-mono text-xs font-bold border border-slate-700">
                  5
                </span>
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  If anything goes wrong, go back
                </h3>
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
