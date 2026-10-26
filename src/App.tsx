/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useThemeMode, setThemeMode } from './shared/window-frame.mjs';
import brandPlate from './assets/brand/7d133412d_blue-bg.png';
import TabletBackdrop from './components/TabletBackdrop';
import ExternalSiteLink from './components/ExternalSiteLink';
import RollbackHistory from './components/RollbackHistory';
import NativeInstallerPanel from './components/NativeInstallerPanel';
import LocalJourneyControls from './components/LocalJourneyControls';
import {selectNativeDirectory} from './lib/nativeDirectory.mjs';
import { validateCasReceipt } from './cas-receipt.mjs';
import { compareVersionReport } from './version-readback.mjs';
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
  FileCheck2,
  Code,
  Play,
  CheckSquare,
  Square,
  FileCode,
  History,
  RotateCcw,
  Database,
  CreditCard,
  UserCheck,
  Zap,
  Repeat,
  DollarSign,
  Calculator,
  Grid,
  Shield,
  Key,
  Users,
  Coins,
  Sun,
  Moon,
  Monitor,
  Mic,
  MicOff,
  Folder,
  Sparkles,
  ChevronDown,
  ChevronRight,
  X,
  Info,
  Download,
  BookOpen,
  RefreshCw
} from 'lucide-react';

const RELEASE = {
  label: "V1 candidate — not a release yet",
  repo: "Vado42-chris/xi-io-cli",
  sha: "54509965c9d91ab02febcc8e49755e2b072a0ca9",
  issueUrl: "https://github.com/Vado42-chris/xi-io-cli/issues/12",
};

const OS_LIST = ['linux', 'macos', 'windows'] as const;
type OperatingSystem = typeof OS_LIST[number];
type ActiveView = 'catalog' | 'installer' | 'status-dashboard' | 'rebaseline';
type TargetComponentId = 'cli' | 'editor' | 'studio' | 'web' | 'switchboard' | 'bins' | 'ward';
type CliInstallMode = 'script' | 'source' | 'validator';
type PerspectiveMode = 'client' | 'auditor';
type ThemeMode = 'dark' | 'light' | 'system';
type ComfortScale = 'compact' | 'standard' | 'comfortable';

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
    <div className="relative group rounded-none bg-workspace-canvas border border-workspace-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-workspace-surface/80 border-b border-workspace-border/80 text-xs text-workspace-muted select-none">
        <span className="font-mono text-[11px] text-workspace-muted">Terminal</span>
        <button
          type="button"
          onClick={() => onCopy(command, id)}
          aria-label={`Copy command: ${command}`}
          className={`min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workspace-focus focus-visible:ring-offset-1 focus-visible:ring-offset-workspace-canvas ${
            isCopied
              ? 'bg-emerald-500/20 text-workspace-success border border-emerald-500/40'
              : 'bg-workspace-surface hover:bg-workspace-surface text-workspace-text border border-workspace-border-strong active:scale-95'
          }`}
        >
          {isCopied ? (
            <>
              <Check className="w-3.5 h-3.5 text-workspace-success" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-workspace-muted" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto">
        <pre className="font-mono text-xs sm:text-sm text-workspace-text whitespace-pre leading-relaxed select-all">
          <code ref={codeRef}>{command}</code>
        </pre>
      </div>
    </div>
  );
}

// Canonical Rosetta Stone Lexicon: maps internal/engineering architecture to plain-language customer vocabulary
const ROSETTA_LEXICON = [
  {
    internal: "Ollama runtime",
    customer: "Set up your local AI",
    explanation: "The engine that runs AI models directly on your hardware without sending your code or prompts to any external server."
  },
  {
    internal: "Model router",
    customer: "Choose what your assistant is best at",
    explanation: "Routes programming tasks to code-specialized models (e.g. Qwen 2.5 Coder) and conversation to reasoning models."
  },
  {
    internal: "Cube",
    customer: "Your portable project workspace",
    explanation: "The self-contained, offline-first project capsule holding your files, verification state, and local execution rules."
  },
  {
    internal: "BINS",
    customer: "Your files and versions",
    explanation: "Immutable, content-addressed storage engine keeping every edit versioned safely with zero silent loss."
  },
  {
    internal: "Ward",
    customer: "Permissions and approvals",
    explanation: "Security boundary that verifies explicit human consent before allowing any file write or command execution."
  },
  {
    internal: "Switchboard",
    customer: "Connect another computer",
    explanation: "Optional secure bridge between machines for remote execution or team coordination. Not required for local use."
  },
  {
    internal: "ResourceVersion / CAS",
    customer: "This file changed. Review before saving.",
    explanation: "Content-Addressable Storage (CAS) pre-commit check that detects intervening edits and refuses overwrites closed (exit code 3)."
  },
  {
    internal: "Rollback generation",
    customer: "Go back to the previous working version",
    explanation: "1-click command (xi-io-cli rollback) that swaps back to the prior known-good binary or file generation."
  },
  {
    internal: "Host admission receipt",
    customer: "Connection verified only after real proof",
    explanation: "Cryptographic proof from physical host execution, preventing simulated progress from masquerading as real qualification."
  },
  {
    internal: "Source generation mismatch",
    customer: "Installed version differs from expected pin",
    explanation: "The installed executable or wrapper hash does not match the candidate pin. Indicates a differing generation; requires verification rather than silent assumption."
  },
  {
    internal: "Execution receipt / APPLY_RETURN",
    customer: "Recorded operation receipt",
    explanation: "Recorded metadata from an executed run. A recorded receipt documents recorded output but does not automatically certify live hardware acceptance without physical execution."
  },
  {
    internal: "HEX Identity Currentness (PR #1109)",
    customer: "Personal Computer Workspace (Tauri Host)",
    explanation: "Active software delivery: HEX is the native Tauri Host carrier standardized in framework PR #1109. Historical README references to a PCIe accelerator board are preserved as exploratory hardware research, not the shipping software."
  },
  {
    internal: "Framework PR #1109 Carrier Boundary",
    customer: "Standardized Native Carrier Window",
    explanation: "The existing native carrier is in framework PR #1109. Absence from HEX main is not permission to construct a separate shell; we standardize on the PR #1109 window."
  },
  {
    internal: "Studio Session Gate vs Local HEX",
    customer: "Decoupled Signed-Out Local Entry",
    explanation: "Studio's private session gate protects authenticated multi-tenant cloud workspaces. Local HEX provides a separate, signed-out, 100% offline entry that skips sign-in and has zero billing dependencies."
  }
];

export type ProductNavigation = { perspective: PerspectiveMode; activeView: ActiveView };

export default function App({ embedded = false, navigation, onNavigate }: { embedded?: boolean; navigation?: ProductNavigation; onNavigate?: (patch: Partial<ProductNavigation>) => void }) {
  // The tablet and product controls share the same views; standalone keeps its local state.
  const [localNavigation, setLocalNavigation] = useState<ProductNavigation>({perspective: 'client', activeView: 'catalog'});
  const {perspective, activeView} = navigation ?? localNavigation;
  const navigate = (patch: Partial<ProductNavigation>) => onNavigate ? onNavigate(patch) : setLocalNavigation(current => ({...current, ...patch}));
  const setPerspective = (next: PerspectiveMode) => navigate({perspective: next});
  const setActiveView = (next: ActiveView) => navigate({activeView: next});
  const theme = useThemeMode();
  const setTheme = setThemeMode;
  const [comfort, setComfort] = useState<ComfortScale>('standard');

  // Active View in Auditor / Developer Perspective
  const [selectedTarget, setSelectedTarget] = useState<TargetComponentId>('cli');
  const [selectedOS, setSelectedOS] = useState<OperatingSystem>('linux');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cliMode, setCliMode] = useState<CliInstallMode>('script');

  // Client 5-Step Guided First-Run Journey State
  const [journeyStep, setJourneyStep] = useState<number>(1);
  const [journeyMode, setJourneyMode] = useState<'local' | 'account'>('local');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [localCheckPlanId, setLocalCheckPlanId] = useState<string>('');
  const [folderSelectionMessage, setFolderSelectionMessage] = useState('');
  async function chooseWorkspaceFolder() {
    try {
      const selected = await selectNativeDirectory('workspace');
      if (selected !== null) setSelectedFolder(selected);
      setFolderSelectionMessage(selected === null ? 'Directory selection cancelled.' : 'Directory selected. Access still requires its existing permission checks.');
    } catch (error) { setFolderSelectionMessage(String(error instanceof Error ? error.message : error)); }
  }
  
  // Local AI readiness state (distinguishes 0 models from daemon offline!)
  const [ollamaStatus, setOllamaStatus] = useState<'not_checked' | 'ready' | 'no_models' | 'offline'>('not_checked');
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:coder');
  const [isPullingModel, setIsPullingModel] = useState<boolean>(false);
  const [pullProgress, setPullProgress] = useState<number>(0);
  
  // Microphone Speech Input state (Honest handling - no fake recording animation!)
  const [micStatus, setMicStatus] = useState<'idle' | 'checking' | 'unsupported' | 'listening'>('idle');
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string>('Write a greeting function with error handling');

  // Step 5 Task Sandbox State
  const [fileContent, setFileContent] = useState<string>(
    '// Sample project file: app.ts\nexport function calculateTotal(items: number[]): number {\n  return items.reduce((sum, item) => sum + item, 0);\n}\n'
  );
  const [proposalBaseDigest, setProposalBaseDigest] = useState<string>('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  const [currentDiskDigest, setCurrentDiskDigest] = useState<string>('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  const [taskOutcome, setTaskOutcome] = useState<{
    status: 'idle' | 'approved' | 'conflict_refused' | 'rolled_back' | 'ready';
    exitCode?: number;
    message?: string;
  }>({ status: 'idle' });

  // Interactive Version Readback Validator State (Auditor)
  const [readbackInput, setReadbackInput] = useState<string>('');
  const [readbackResult, setReadbackResult] = useState<{
    status: 'idle' | 'valid' | 'repaired' | 'mismatch' | 'invalid' | 'path_warning';
    detectedSha?: string;
    details?: string;
    p1Notice?: {
      type: 'violation' | 'warning';
      title: string;
      message: string;
    };
  }>({ status: 'idle' });

  // Acceptance Test Runner for Native Code Editor (Auditor Mode)
  const [editorSteps, setEditorSteps] = useState<{
    install: boolean;
    openProject: boolean;
    approvedEdit: boolean;
    save: boolean;
    reopen: boolean;
  }>({
    install: false,
    openProject: false,
    approvedEdit: false,
    save: false,
    reopen: false,
  });

  // Interactive CAS Conflict Validator State (Auditor Mode)
  const [casInput, setCasInput] = useState<string>('');
  const [casValidation, setCasValidation] = useState<{
    valid: boolean;
    checked: boolean;
    errors: string[];
    parsed?: any;
  }>({ valid: false, checked: false, errors: [] });

  // Tab 4: HEX Onboarding & 5.5 Rebaseline State
  const [hexOnboardingChoice, setHexOnboardingChoice] = useState<'local' | 'account'>('local');
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'github' | 'microsoft'>('google');

  // Interactive $20 Concierge Economics Calculator
  const [conciergeCustomers, setConciergeCustomers] = useState<number>(100);
  const [conciergePrice, setConciergePrice] = useState<number>(20.00);
  const [conciergeSupportMinutes, setConciergeSupportMinutes] = useState<number>(15);
  const [conciergeHourlyRate, setConciergeHourlyRate] = useState<number>(30.00);
  const [conciergeInfraPerCust, setConciergeInfraPerCust] = useState<number>(2.00);

  // Metered Usage Preauthorization Calculator State
  const [meteredMaxUnits, setMeteredMaxUnits] = useState<number>(2000);
  const [meteredRate, setMeteredRate] = useState<number>(0.005);
  const [meteredFixedFee, setMeteredFixedFee] = useState<number>(0.00);
  const [meteredBudgetCap, setMeteredBudgetCap] = useState<number>(10.00);
  const [simulatedEvents, setSimulatedEvents] = useState<{ id: string; units: number; chargedUsd: number; deduplicated: boolean; timestamp: string }[]>([]);
  const [meteredNotice, setMeteredNotice] = useState<string | null>(null);

  // Traceability Matrix State
  const [selectedEstate, setSelectedEstate] = useState<'platform' | 'workspace' | 'device'>('platform');
  const [selectedCellId, setSelectedCellId] = useState<string>('CELL-01');

  // Accessibility Refs for Tablist Arrow Key Movement
  const osTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const viewTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  // OS tab keyboard navigation with real focus movement
  const handleTabKeyDown = (e: React.KeyboardEvent, currentOS: OperatingSystem) => {
    const currentIndex = OS_LIST.indexOf(currentOS);
    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % OS_LIST.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + OS_LIST.length) % OS_LIST.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = OS_LIST.length - 1;
    }
    if (nextIndex !== currentIndex) {
      setSelectedOS(OS_LIST[nextIndex]);
      osTabRefs.current[nextIndex]?.focus();
    }
  };

  // Live validator for Step 3 Readback
  const handleVerifyReadback = (text: string) => {
    setReadbackInput(text);
    setReadbackResult(compareVersionReport(text, RELEASE.sha));
  };

  // Live validator for CAS conflict schema
  const handleValidateCasReceipt = (inputStr: string) => {
    setCasInput(inputStr);
    setCasValidation(validateCasReceipt(inputStr));
  };

  const handleGenerateCanaryReceipt = () => {
    const dummyUUID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
    const sample = JSON.stringify({
      schema: "xiio.bins.conflict-receipt/v1",
      status: "REFUSED_STALE_VERSION",
      resource_ref: `bins:resource:${dummyUUID}`,
      expected_version: `bins:resource:${dummyUUID}:sha256:${'0'.repeat(64)}`,
      actual_version: `bins:resource:${dummyUUID}:sha256:${'a'.repeat(64)}`,
      actual_sha256: 'a'.repeat(64),
      timestamp: "2026-10-25T16:00:00.000Z",
      recovery_action: "FETCH_LATEST_VERSION_AND_REBASE"
    }, null, 2);
    handleValidateCasReceipt(sample);
  };

  // Client Journey: Honest Microphone handler (no fake recording animation!)
  const handleMicrophoneClick = () => {
    setMicStatus('checking');
    setMicMessage('Checking browser speech recognition support...');
    
    // Check if Web Speech API is present in browser environment
    const hasWebSpeech = typeof window !== 'undefined' && 
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    setTimeout(() => {
      if (!hasWebSpeech) {
        setMicStatus('unsupported');
        setMicMessage(
          'Microphone input is disabled: Speech-to-text requires a local Whisper model or browser speech recognition support. Please type your prompt in the box below.'
        );
      } else {
        // If web speech exists, test if accessible or denied
        setMicStatus('unsupported');
        setMicMessage(
          'Microphone input requires local whisper model binding in offline desktop mode. Please type your instructions.'
        );
      }
    }, 600);
  };

  // No model acquisition adapter is bound; never turn a timer into installed state.
  const handlePullModel = () => {
    setIsPullingModel(false);
    setPullProgress(0);
    setOllamaStatus('not_checked');
  };

  // Client Journey: Task Approval & CAS Check Demonstration
  const handleApproveProposal = () => {
    // Check CAS pre-commit condition
    if (currentDiskDigest !== proposalBaseDigest) {
      // Exit Code 3: REFUSED_STALE_FILE / REFUSED_STALE_VERSION
      setTaskOutcome({
        status: 'conflict_refused',
        exitCode: 3,
        message: 'Example conflict refusal (simulated code 3). The sample changed; no disk read or write occurred.'
      });
      return;
    }

    // Safe write succeeds
    const newContent = fileContent + '\nexport function welcome() { return "Welcome to XI-IO"; }\n';
    setFileContent(newContent);
    const newDigest = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    setProposalBaseDigest(newDigest);
    setCurrentDiskDigest(newDigest);
    setTaskOutcome({
      status: 'approved',
      exitCode: 0,
      message: 'Example updated in this page only. No file was written and no installation was verified.'
    });
  };

  const handleSimulateExternalCollision = () => {
    // Simulates an external background process editing the file on disk
    setCurrentDiskDigest('9999999999999999999999999999999999999999999999999999999999999999');
    setTaskOutcome({
      status: 'idle',
      message: 'Example conflict selected. The sample digest changed; no external process or disk file was used.'
    });
  };

  const handleRollbackTask = () => {
    // Rollback restores original content and digest
    setFileContent('// Sample project file: app.ts\nexport function calculateTotal(items: number[]): number {\n  return items.reduce((sum, item) => sum + item, 0);\n}\n');
    setProposalBaseDigest('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    setCurrentDiskDigest('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    setTaskOutcome({
      status: 'rolled_back',
      exitCode: 0,
      message: 'Example reset in this page only. No installed files or saved versions were changed.'
    });
  };

  // Product purpose and source-package scope are not observations of this computer.
  // Actual install/readback evidence remains in NativeInstallerPanel and RollbackHistory.
  const PHYSICAL_SIX_GATES = [
    {gate: 1, name: "Service connection", owner: "Switchboard", status: "NOT REPORTED", criteria: "No service connection has been checked by this page."},
    {gate: 2, name: "Installed software", owner: "HEX", status: "NOT REPORTED", criteria: "Use the native installer's saved plans and actual readback; a source version is not an installed version."},
    {gate: 3, name: "Permission to use a resource", owner: "Ward", status: "NOT REPORTED", criteria: "Signing in or choosing a folder does not grant access."},
    {gate: 4, name: "Requested operation", owner: "Switchboard", status: "NOT REPORTED", criteria: "No operation on another computer has been observed here."},
    {gate: 5, name: "File version protection", owner: "BINS", status: "NOT REPORTED", criteria: "Version and conflict behavior must be checked against the installed service; source changes do not prove it."},
    {gate: 6, name: "Result returned", owner: "Original request", status: "NOT REPORTED", criteria: "A completed action needs its actual result and independent readback, not a demonstration."},
  ];

  const SUITE_PRODUCTS = [
    {id: "cli" as TargetComponentId, name: "XI-IO CLI", icon: Terminal,
      description: "Command-line tools for local projects and installation diagnostics.",
      statusDetail: "A Linux component candidate exists. No installed version or current one-click download is reported here.",
      prerequisites: "The existing component candidate requires Python 3.10+, Bash and Node 22.13+. This computer has not been checked. A model runtime is needed only for AI features."},
    {id: "editor" as TargetComponentId, name: "XI-IO Code Editor", icon: Code,
      description: "A project editing workspace under development.",
      statusDetail: "No editor installation package is connected to this build of HEX.",
      prerequisites: "Package-specific requirements have not been published here. A particular developer's computer is not a requirement."},
    {id: "studio" as TargetComponentId, name: "XI-IO Studio", icon: Laptop,
      description: "A desktop for opening and organizing XI-IO products and workspaces.",
      statusDetail: "No Studio installation package or launch connection is bound here.",
      prerequisites: "Supported desktop and runtime requirements must come from the selected Studio package. KDE integration is not a requirement of this installer."},
    {id: "web" as TargetComponentId, name: "XI-IO Web Interface", icon: Globe,
      description: "Browser-based product interfaces.",
      statusDetail: "This preview is a web interface, not proof of an installed desktop app or connected service.",
      prerequisites: "A compatible browser. Offline operation and service connections have not been checked here."},
    {id: "switchboard" as TargetComponentId, name: "Switchboard", icon: Server,
      description: "Connects products and devices through their configured services.",
      statusDetail: "A local consumer is included in the Linux component candidate. Account enrollment and a working connection are not configured by installing those files.",
      prerequisites: "The component candidate requires Node 22.13+. The existing consumer also needs a device identity, HTTPS broker and approved host adapters; none are reported by this page."},
    {id: "bins" as TargetComponentId, name: "BINS", icon: Layers,
      description: "File search and version-custody components.",
      statusDetail: "A local search component is included in the Linux candidate. Running search does not grant protected-file access or prove cross-computer atomic writes.",
      prerequisites: "The component candidate requires Node 22.13+ and an explicitly selected project folder for foreground search. Protected-file access needs a separate approved binding."},
    {id: "ward" as TargetComponentId, name: "Ward", icon: ShieldAlert,
      description: "Permission and policy checks used by product operations.",
      statusDetail: "No standalone Ward installer or enrollment service is connected here.",
      prerequisites: "Requirements belong to the selected product's permission binding. Do not create keys or change security settings based on this catalog."},
  ];

  // These are checks to perform, not a static table of successful host results.
  const TRACEABILITY_CELLS = [
    {id: "CELL-01", estate: "platform", name: "Installed version", contract: "Actual installer readback", gate: 2, status: "NOT REPORTED", evidence: "No installed-version observation supplied."},
    {id: "CELL-02", estate: "platform", name: "Selected Node executable", contract: "Actual executable path and digest", gate: 2, status: "NOT REPORTED", evidence: "No runtime observation supplied."},
    {id: "CELL-03", estate: "platform", name: "Saved rollback history", contract: "install-receipt.json and current/previous pointers", gate: 2, status: "NOT REPORTED", evidence: "Use the read-only history tool below. A recorded receipt is not current installed-byte verification."},
    {id: "CELL-04", estate: "workspace", name: "File conflict protection", contract: "Installed BINS behavior", gate: 5, status: "NOT REPORTED", evidence: "No current service qualification supplied."},
    {id: "CELL-05", estate: "workspace", name: "Saved file readback", contract: "Actual file operation", gate: 6, status: "NOT REPORTED", evidence: "The sample editor does not write files."},
    {id: "CELL-06", estate: "workspace", name: "Selected project path", contract: "Explicit path and permission checks", gate: 4, status: "NOT REPORTED", evidence: "Typing a path does not verify access."},
    {id: "CELL-07", estate: "device", name: "Account connection", contract: "Actual sign-in binding", gate: 3, status: "NOT REPORTED", evidence: "An account choice is not a sign-in."},
    {id: "CELL-08", estate: "device", name: "Usage records", contract: "Actual service records", gate: 3, status: "NOT REPORTED", evidence: "The calculator below does not record usage."},
    {id: "CELL-09", estate: "device", name: "Spending authorization", contract: "Explicit service approval", gate: 3, status: "NOT REPORTED", evidence: "A calculation does not authorize charges."},
  ];

  const currentComponent = SUITE_PRODUCTS.find((p) => p.id === selectedTarget) || SUITE_PRODUCTS[0];
  const editorCompleteCount = Object.values(editorSteps).filter(Boolean).length;

  // Concierge economics calculation
  const grossRevenue = conciergeCustomers * conciergePrice;
  const paymentFees = grossRevenue * 0.029 + conciergeCustomers * 0.30;
  const supportHours = (conciergeCustomers * conciergeSupportMinutes) / 60;
  const supportLaborCost = supportHours * conciergeHourlyRate;
  const variableInfra = conciergeCustomers * conciergeInfraPerCust;
  const contributionMargin = grossRevenue - paymentFees - supportLaborCost - variableInfra;
  const sensitivityPer10Min = (10 / 60) * conciergeHourlyRate;

  // Theme styling helpers
  const isLight = theme === 'light';
  const comfortClass = comfort === 'compact' ? 'text-xs' : comfort === 'comfortable' ? 'text-base' : 'text-sm';

  return (
    <div data-tablet-surface data-hex-workspace data-product-theme={theme} style={{'--workspace-plate-image': `url("${brandPlate}")`} as React.CSSProperties} className={`${embedded ? 'min-h-full' : 'min-h-screen'} transition-colors duration-200 selection:bg-workspace-focus/30 selection:text-workspace-focus ${
      isLight ? 'bg-workspace-canvas text-workspace-text' : 'bg-workspace-canvas text-workspace-text'
    }`}>
      <TabletBackdrop />
      {/* HEX product workspace inside the shared tablet. */}
      <div className="hex-workspace-layout max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-5">
        <div className={`${embedded ? '' : 'border border-workspace-border'} overflow-hidden transition-all duration-200`}>
          
          {/* Product toolbar */}
          <div className={`px-4 py-3 border-b flex items-center justify-between flex-wrap gap-3 select-none ${
            isLight ? 'bg-workspace-surface border-workspace-border text-workspace-text' : 'bg-workspace-canvas/90 border-workspace-border text-workspace-text'
          }`}>
            {/* Product tools; native tablet controls belong to the shared frame. */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Comfort Scale Selector */}
              <div className="inline-flex rounded-none border p-1 text-[11px] items-center" role="group" aria-label="Text Comfort Scale">
                {(['compact', 'standard', 'comfortable'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setComfort(lvl)}
                    className={`min-h-[44px] px-3 py-1 rounded-none capitalize font-medium transition-all ${
                      comfort === lvl
                        ? isLight ? 'bg-workspace-focus text-workspace-inverse font-bold' : 'bg-workspace-focus text-workspace-inverse font-bold'
                        : isLight ? 'text-workspace-muted hover:text-workspace-text' : 'text-workspace-muted hover:text-workspace-text'
                    }`}
                  >
                    {lvl[0].toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Theme Toggle (Light / Dark) */}
              <button
                type="button"
                onClick={() => setTheme(isLight ? 'dark' : 'light')}
                aria-label={`Switch to ${isLight ? 'dark' : 'light'} theme`}
                className={`min-h-[44px] min-w-[44px] p-2 rounded-none border flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-workspace-focus ${
                  isLight ? 'bg-workspace-surface border-workspace-border-strong text-workspace-text hover:bg-workspace-surface' : 'bg-workspace-surface border-workspace-border-strong text-workspace-focus hover:bg-workspace-surface'
                }`}
              >
                {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {/* Perspective Mode Switcher */}
              <div className="inline-flex p-1 rounded-none border bg-workspace-canvas border-workspace-border" role="tablist" aria-label="Perspective View">
                <button
                  type="button"
                  role="tab"
                  aria-selected={perspective === 'client'}
                  onClick={() => setPerspective('client')}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-none text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-workspace-focus ${
                    perspective === 'client'
                      ? 'bg-workspace-focus text-workspace-inverse shadow-sm'
                      : 'text-workspace-muted hover:text-workspace-text'
                  }`}
                >
                  Setup
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={perspective === 'auditor'}
                  onClick={() => setPerspective('auditor')}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-none text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-workspace-focus ${
                    perspective === 'auditor'
                      ? 'bg-workspace-focus text-workspace-inverse shadow-sm'
                      : 'text-workspace-muted hover:text-workspace-text'
                  }`}
                >
                  Tools &amp; Diagnostics
                </button>
              </div>
            </div>
          </div>

          {/* PERSPECTIVE 1: CLIENT EXPERIENCE (GUIDED LOCAL-FIRST SETUP) */}
          {perspective === 'client' && (
            <div className="p-4 sm:p-6 space-y-5">
              
              {/* Front-Door Hero: "Make anything here, and keep all of it." */}
              <div className="hex-workspace-heading py-3 relative overflow-hidden">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mb-2">
                  Make anything here, and keep all of it.
                </h1>
                <p className={`max-w-2xl text-sm leading-relaxed ${
                  isLight ? 'text-workspace-muted' : 'text-workspace-muted'
                }`}>
                  Choose your software and installation location. Review the changes before applying them.
                </p>

              </div>

              {/* The 3 Primary Hero Choices */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Choice 1: Use this computer (Recommended) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { setJourneyMode('local'); setJourneyStep(1); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setJourneyMode('local'); setJourneyStep(1); } }}
                  aria-pressed={journeyMode === 'local'}
                  className={`min-h-[120px] p-4 rounded-none border cursor-pointer transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workspace-focus ${
                    journeyMode === 'local'
                      ? isLight ? 'bg-workspace-surface/80 border-workspace-border-strong shadow-md ring-1 ring-workspace-focus' : 'bg-workspace-surface border-workspace-border-strong shadow-lg ring-1 ring-workspace-focus'
                      : isLight ? 'bg-workspace-surface border-workspace-border hover:border-workspace-border-strong' : 'bg-workspace-surface border-workspace-border hover:border-workspace-border-strong'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold font-mono uppercase tracking-wider text-workspace-focus">Recommended</span>
                      <Shield className="w-5 h-5 text-workspace-success" />
                    </div>
                    <h3 className="font-bold text-base mb-1">Use this computer</h3>
                    <p className="text-xs text-workspace-muted leading-relaxed">
                      Choose a local installation. Account connection is optional.
                    </p>
                  </div>
                  <div className="pt-3 font-semibold text-xs text-workspace-focus flex items-center gap-1">
                    <span>Get started locally</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Choice 2: Connect an account — optional */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { setJourneyMode('account'); setJourneyStep(2); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setJourneyMode('account'); setJourneyStep(2); } }}
                  aria-pressed={journeyMode === 'account'}
                  className={`min-h-[120px] p-4 rounded-none border cursor-pointer transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workspace-focus ${
                    journeyMode === 'account'
                      ? isLight ? 'bg-workspace-surface/80 border-workspace-border-strong shadow-md ring-1 ring-workspace-focus' : 'bg-workspace-surface border-workspace-border-strong shadow-lg ring-1 ring-workspace-focus'
                      : isLight ? 'bg-workspace-surface border-workspace-border hover:border-workspace-border-strong' : 'bg-workspace-surface border-workspace-border hover:border-workspace-border-strong'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold font-mono uppercase tracking-wider text-workspace-muted">Optional</span>
                      <Users className="w-5 h-5 text-workspace-text" />
                    </div>
                    <h3 className="font-bold text-base mb-1">Connect an account</h3>
                    <p className="text-xs text-workspace-muted leading-relaxed">
                      Sync and additional services can be set up later without blocking local work.
                    </p>
                  </div>
                  <div className="pt-3 font-semibold text-xs text-workspace-text flex items-center gap-1">
                    <span>Review sign-in options</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Choice 3: Advanced setup & Diagnostics */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPerspective('auditor')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPerspective('auditor'); } }}
                  className={`min-h-[120px] p-4 rounded-none border cursor-pointer transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workspace-focus ${
                    isLight ? 'bg-workspace-surface border-workspace-border hover:border-workspace-border-strong' : 'bg-workspace-surface border-workspace-border hover:border-workspace-border-strong'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold font-mono uppercase tracking-wider text-workspace-muted">Developer</span>
                      <Cpu className="w-5 h-5 text-workspace-text" />
                    </div>
                    <h3 className="font-bold text-base mb-1">Advanced setup</h3>
                    <p className="text-xs text-workspace-muted leading-relaxed">
                      Installation plans, recovery history, and connection diagnostics.
                    </p>
                  </div>
                  <div className="pt-3 font-semibold text-xs text-workspace-text flex items-center gap-1">
                    <span>Open diagnostics</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* 5-STEP FIRST-RUN CUSTOMER JOURNEY */}
              <div className={`p-6 sm:p-8 rounded-none border space-y-6 ${
                isLight ? 'bg-workspace-surface border-workspace-border' : 'bg-workspace-surface border-workspace-border'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-workspace-border">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-workspace-focus" />
                      <span>Installation setup</span>
                    </h2>
                    <p className="text-xs text-workspace-muted">
                      Step {journeyStep} of 5: Contained, zero-command setup for your personal workspace.
                    </p>
                  </div>

                  {/* Step Indicators */}
                  <div className="flex items-center gap-1.5" role="navigation" aria-label="First-run steps">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setJourneyStep(s)}
                        aria-label={`Jump to step ${s}`}
                        aria-current={journeyStep === s ? 'step' : undefined}
                        title="Navigation only — not a completed check"
                        className={`min-h-[44px] min-w-[36px] rounded-none font-mono text-xs font-bold transition-all ${
                          journeyStep === s
                            ? 'bg-workspace-focus text-workspace-inverse ring-2 ring-workspace-focus/50'
                            : 'bg-workspace-surface text-workspace-muted'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* STEP 1: GET THE APP */}
                {journeyStep === 1 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-workspace-focus/10 border border-workspace-border-strong/30 flex items-center justify-center text-workspace-focus">
                        <Download className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 1: Open the Local Installer</h3>
                        <p className="text-xs text-workspace-muted">
                          Selected operating-system guide: <strong className="capitalize text-workspace-focus">{selectedOS}</strong>. Browser hints are not a checked installation target; choose the correct guide below.
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-sm text-workspace-text">HEX Local Installation</div>
                        <div className="text-xs text-workspace-muted">
                          Review a real plan inside native HEX. Browser preview cannot install; the current component candidate is Linux-only.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedTarget('cli'); setPerspective('auditor'); setActiveView('installer'); }}
                        className="min-h-[48px] px-6 py-2.5 rounded-none bg-workspace-focus hover:bg-workspace-focus text-workspace-inverse font-bold text-xs flex items-center gap-2 justify-center transition-all focus-visible:ring-2 focus-visible:ring-workspace-focus"
                      >
                        <Download className="w-4 h-4" />
                        <span>Review local installation</span>
                      </button>
                    </div>

                    {/* SDK Progressive Disclosure: Fallback Command for Developers */}
                    <details className="p-3 rounded-none border border-workspace-border text-xs text-workspace-muted">
                      <summary className="cursor-pointer font-medium text-workspace-text hover:text-workspace-focus select-none py-1">
                        Historical CLI commands (Developer Reference)
                      </summary>
                      <div className="pt-3 space-y-2">
                        <p className="text-[11px]">
                          These commands reference an older CLI candidate, not the current release or evidence of an installation:
                        </p>
                        <CommandBlock
                          id="step-1-cmd"
                          command={downloadCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                      </div>
                    </details>
                  </div>
                )}

                {/* STEP 2: START MODE (USE LOCALLY) */}
                {journeyStep === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-workspace-success">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 2: Choose Your Start Mode</h3>
                        <p className="text-xs text-workspace-muted">
                          Local HEX installation and first launch must proceed alongside remote Switchboard work, not wait behind it. Sign-in remains optional and skippable.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setJourneyMode('local')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setJourneyMode('local'); } }}
                        className={`min-h-[100px] p-4 rounded-none border cursor-pointer transition-all ${
                          journeyMode === 'local'
                            ? 'bg-workspace-surface border-emerald-500 text-workspace-success ring-1 ring-emerald-500'
                            : 'bg-workspace-canvas border-workspace-border text-workspace-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm mb-1">
                          <CheckCircle2 className="w-4 h-4 text-workspace-success" />
                          <span>Use Locally (Skipped Sign-in)</span>
                        </div>
                        <p className="text-xs leading-relaxed text-workspace-text">
                          Review local installation choices and prerequisites. Installing files does not start services or connect an account.
                        </p>
                      </div>

                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setJourneyMode('account')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setJourneyMode('account'); } }}
                        className={`min-h-[100px] p-4 rounded-none border cursor-pointer transition-all ${
                          journeyMode === 'account'
                            ? 'bg-workspace-surface border-blue-500 text-workspace-text ring-1 ring-blue-500'
                            : 'bg-workspace-canvas border-workspace-border text-workspace-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm mb-1">
                          <Key className="w-4 h-4 text-workspace-text" />
                          <span>Connect Account (Optional)</span>
                        </div>
                        <p className="text-xs leading-relaxed text-workspace-text">
                          Account sign-in is not connected in this build. Choosing this option does not sign in, grant machine access or authorize charges.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setJourneyStep(3)}
                        className="min-h-[48px] px-6 py-2.5 rounded-none bg-workspace-focus hover:bg-workspace-focus text-workspace-inverse font-bold text-xs flex items-center gap-2 transition-all focus-visible:ring-2 focus-visible:ring-workspace-focus"
                      >
                        <span>Continue to Workspace Folder</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: CHOOSE WORKSPACE FOLDER */}
                {journeyStep === 3 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-workspace-text">
                        <Folder className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 3: What do you want to work on?</h3>
                        <p className="text-xs text-workspace-muted">
                          Choose your project directory using the native folder picker. Selecting a directory does not grant permissions.
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border space-y-3">
                      <label htmlFor="folder-input" className="block text-xs font-semibold text-workspace-text">
                        Workspace Folder Path:
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="folder-input"
                          type="text"
                          value={selectedFolder}
                          placeholder="Enter a path; access is not checked"
                          onChange={(e) => setSelectedFolder(e.target.value)}
                          className="min-h-[48px] flex-1 px-3 py-2 rounded-none bg-workspace-surface border border-workspace-border-strong text-xs font-mono text-workspace-text focus:outline-none focus:ring-2 focus:ring-workspace-focus"
                        />
                        <button
                          type="button"
                          onClick={() => void chooseWorkspaceFolder()}
                          className="min-h-[48px] px-4 rounded-none bg-workspace-surface hover:bg-workspace-surface text-workspace-text text-xs font-medium"
                        >
                          Choose Folder
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-workspace-muted pt-1">
                        <Info className="w-4 h-4" />
                        <span>{folderSelectionMessage || 'Access not checked. Selecting a directory does not grant file permissions.'}</span>
                      </div>
                    </div>

                    <div className="flex justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setJourneyStep(2)}
                        className="min-h-[48px] px-4 py-2 rounded-none text-xs text-workspace-muted hover:text-workspace-text"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setJourneyStep(4)}
                        className="min-h-[48px] px-6 py-2.5 rounded-none bg-workspace-focus hover:bg-workspace-focus text-workspace-inverse font-bold text-xs flex items-center gap-2 transition-all focus-visible:ring-2 focus-visible:ring-workspace-focus"
                      >
                        <span>Next: Set Up Local AI</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4: SET UP LOCAL AI (OLLAMA RUNTIME) */}
                {journeyStep === 4 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-workspace-text">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 4: Set Up Your Local AI</h3>
                        <p className="text-xs text-workspace-muted">
                          Check the local runtime and installed models without starting, installing or loading anything.
                        </p>
                      </div>
                    </div>

                    <LocalJourneyControls step={4} workspace={selectedFolder} planId={localCheckPlanId} onPlanId={setLocalCheckPlanId} />

                    <div className="flex justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setJourneyStep(3)}
                        className="min-h-[48px] px-4 py-2 rounded-none text-xs text-workspace-muted hover:text-workspace-text"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setJourneyStep(5)}
                        className="min-h-[48px] px-6 py-2.5 rounded-none bg-workspace-focus hover:bg-workspace-focus text-workspace-inverse font-bold text-xs flex items-center gap-2 transition-all focus-visible:ring-2 focus-visible:ring-workspace-focus"
                      >
                        <span>Next: Try a Safe Task</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 5: TRY YOUR FIRST SAFE TASK (CAS SANDBOX) */}
                {journeyStep === 5 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-workspace-success">
                        <CheckSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 5: Try One Safe Task (CAS Pre-Commit Guard)</h3>
                        <p className="text-xs text-workspace-muted">
                          Review and approve one fixed disposable local file test using the installed CLI CAS guard. Existing project files remain unchanged.
                        </p>
                      </div>
                    </div>

                    <LocalJourneyControls step={5} workspace={selectedFolder} planId={localCheckPlanId} onPlanId={setLocalCheckPlanId} />

                    <div className="flex justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setJourneyStep(4)}
                        className="min-h-[48px] px-4 py-2 rounded-none text-xs text-workspace-muted hover:text-workspace-text"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setPerspective('auditor')}
                        className="min-h-[48px] px-6 py-2.5 rounded-none bg-workspace-surface hover:bg-workspace-surface text-workspace-text font-medium text-xs flex items-center gap-2"
                      >
                        <span>Open Tools &amp; Diagnostics Mode</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PERSPECTIVE 2: DEVELOPER & AUDITOR MODE (FULL TECHNICAL SPECS) */}
          {perspective === 'auditor' && (
            <div className="p-4 sm:p-6 space-y-6">

              <section className="border border-workspace-border p-4 bg-workspace-surface">
                {/* 4 Navigation Tabs for Auditor Mode */}
                <div className="mt-4 pt-3 border-t border-workspace-border flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-workspace-muted">Tools:</span>
                  <div className="inline-flex p-1 bg-workspace-surface rounded-none border border-workspace-border flex-wrap gap-1" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'catalog'}
                      onClick={() => setActiveView('catalog')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-none text-xs font-medium transition-all ${
                        activeView === 'catalog' ? 'bg-workspace-focus text-workspace-inverse font-bold' : 'text-workspace-muted hover:text-workspace-text'
                      }`}
                    >
                      1. HEX Software Suite
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'installer'}
                      onClick={() => setActiveView('installer')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-none text-xs font-medium transition-all flex items-center gap-1.5 ${
                        activeView === 'installer' ? 'bg-workspace-focus text-workspace-inverse font-bold' : 'text-workspace-muted hover:text-workspace-text'
                      }`}
                    >
                      <span>2. Install &amp; Compile</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-workspace-surface text-workspace-focus font-mono">
                        {selectedTarget.toUpperCase()}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'status-dashboard'}
                      onClick={() => setActiveView('status-dashboard')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-none text-xs font-medium transition-all ${
                        activeView === 'status-dashboard' ? 'bg-workspace-focus text-workspace-inverse font-bold' : 'text-workspace-muted hover:text-workspace-text'
                      }`}
                    >
                      3. System Diagnostics
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'rebaseline'}
                      onClick={() => setActiveView('rebaseline')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-none text-xs font-medium transition-all ${
                        activeView === 'rebaseline' ? 'bg-workspace-focus text-workspace-inverse font-bold' : 'text-workspace-muted hover:text-workspace-text'
                      }`}
                    >
                      4. Onboarding &amp; Revenue (5.5)
                    </button>
                  </div>
                </div>
              </section>

              {/* AUDITOR TAB 1: HEX SOFTWARE SUITE */}
              {activeView === 'catalog' && (
                <section className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-workspace-text">XI-IO Ecosystem Component Catalog</h3>
                    <p className="text-xs text-workspace-muted">
                      Software reference catalog. These entries do not report the installed state of this computer.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {SUITE_PRODUCTS.map((prod) => {
                      const IconComp = prod.icon;
                      return (
                        <div
                          key={prod.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setSelectedTarget(prod.id); setActiveView('installer'); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTarget(prod.id); setActiveView('installer'); } }}
                          className="min-h-[48px] p-4 rounded-none bg-workspace-canvas border border-workspace-border hover:border-workspace-border-strong cursor-pointer space-y-2 focus-visible:ring-2 focus-visible:ring-workspace-focus"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <IconComp className="w-4 h-4 text-workspace-focus" />
                              <span className="font-bold text-sm text-workspace-text">{prod.name}</span>
                            </div>

                          </div>
                          <p className="text-xs text-workspace-muted">{prod.description}</p>
                          <p className="text-xs text-workspace-text" data-product-availability={prod.id}>{prod.statusDetail}</p>
                          <p className="text-xs text-workspace-muted">Installed on this computer: not reported</p>
                          <div className="text-[11px] font-mono text-workspace-text">
                            <strong>Requirements:</strong> {prod.prerequisites}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* AUDITOR TAB 2: INSTALL & COMPILE GUIDE */}
              <div className={activeView === 'installer' ? 'block' : 'hidden'}>
                <section className="space-y-6">
                  <div className={['cli', 'bins', 'switchboard'].includes(selectedTarget) ? 'block' : 'hidden'}><NativeInstallerPanel /></div>
                  {!['cli', 'bins', 'switchboard'].includes(selectedTarget) && <section role="status" className="p-5 border border-workspace-border space-y-2">
                    <h3>{currentComponent.name}</h3><p>{currentComponent.statusDetail}</p><p>{currentComponent.prerequisites}</p>
                  </section>}
                  {/* Selected target switcher */}
                  <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase font-mono text-workspace-muted">Selected Target Component:</div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-workspace-text text-base">{currentComponent.name}</h3>

                      </div>
                    </div>
                    <div className="inline-flex p-1 bg-workspace-surface rounded-none border border-workspace-border gap-1 flex-wrap">
                      {SUITE_PRODUCTS.map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => setSelectedTarget(prod.id)}
                          className={`min-h-[44px] px-2.5 py-1 rounded text-xs capitalize ${
                            selectedTarget === prod.id ? 'bg-workspace-focus text-workspace-inverse font-bold' : 'text-workspace-muted hover:text-workspace-text'
                          }`}
                        >
                          {prod.id}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Independent Parallel Delivery Statement */}
                  <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border-strong/30 text-xs text-workspace-text leading-relaxed">
                    <strong className="text-workspace-text">Local setup and account connection:</strong> Local setup does not require sign-in. Installing component files does not configure an account, enroll a device or establish a remote connection.
                  </div>

                  <details className="space-y-3"><summary className="cursor-pointer text-sm text-workspace-muted">Historical CLI developer reference — not an installer for the selected product</summary>
                  <p className="text-xs text-workspace-muted">The commands below are pinned to an older CLI candidate ({RELEASE.sha.slice(0, 8)}), not the current release or evidence of what is installed. They do not describe requirements for other products. Current native setup and its actual readback are above.</p>
                  {/* OS Selection Tabs */}
                  <div className="space-y-2">
                    <label className="block text-xs text-workspace-muted">Select Operating System:</label>
                    <div
                      role="tablist"
                      aria-label="Target Operating Systems"
                      className="inline-flex p-1 bg-workspace-canvas rounded-none border border-workspace-border gap-1"
                    >
                      {OS_LIST.map((os, index) => (
                        <button
                          key={os}
                          ref={(el) => { osTabRefs.current[index] = el; }}
                          role="tab"
                          aria-selected={selectedOS === os}
                          aria-controls={`tabpanel-${os}`}
                          tabIndex={selectedOS === os ? 0 : -1}
                          onClick={() => setSelectedOS(os)}
                          onKeyDown={(e) => handleTabKeyDown(e, os)}
                          className={`min-h-[48px] px-4 py-2 rounded-none text-xs font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workspace-focus ${
                            selectedOS === os ? 'bg-workspace-focus text-workspace-inverse font-bold' : 'text-workspace-muted hover:text-workspace-text'
                          }`}
                        >
                          {os}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Linked Tabpanel */}
                  <div id={`tabpanel-${selectedOS}`} role="tabpanel" className="space-y-6">
                    {/* Prerequisites */}
                    <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border text-xs space-y-2">
                      <div className="font-semibold text-workspace-text">Prerequisites:</div>
                      <ul className="space-y-1.5 text-workspace-text">
                        <li>Node.js 22 or newer</li>
                        <li>
                          For this historical source-fetch command only, GitHub CLI access may be needed: <code className="font-mono bg-workspace-surface px-1 py-0.5 rounded text-workspace-focus">gh auth login</code> (not required to inspect this UI or use a packaged local installer)
                        </li>
                        <li>AI features require a separately configured compatible model runtime; this is not a file-install prerequisite.</li>
                        {selectedOS === 'linux' && (
                          <li className="text-workspace-text">
                            <strong>Linux only:</strong> bubblewrap (<code className="font-mono bg-workspace-surface px-1 py-0.5 rounded text-workspace-focus">sudo apt install bubblewrap</code>) — without it, commands stay off and reading/edits still work
                          </li>
                        )}
                      </ul>
                    </div>

                    {/* Mode Switcher: Script vs Source */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCliMode('script')}
                        className={`min-h-[44px] px-3 py-1.5 rounded-none text-xs font-semibold ${
                          cliMode === 'script' ? 'bg-workspace-focus text-workspace-inverse' : 'bg-workspace-surface text-workspace-muted'
                        }`}
                      >
                        Historical CLI Script Reference
                      </button>
                      <button
                        type="button"
                        onClick={() => setCliMode('source')}
                        className={`min-h-[44px] px-3 py-1.5 rounded-none text-xs font-semibold ${
                          cliMode === 'source' ? 'bg-workspace-focus text-workspace-inverse' : 'bg-workspace-surface text-workspace-muted'
                        }`}
                      >
                        Compile from Source
                      </button>
                    </div>

                    {/* Source Compilation Flow */}
                    {cliMode === 'source' && (
                      <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border space-y-3 text-xs">
                        <div className="font-bold text-workspace-text">Source Verification &amp; Installation</div>
                        <div>1. Clone pinned repository and detach to candidate SHA:</div>
                        <CommandBlock
                          id="compile-cmd-1"
                          command={`gh repo clone ${RELEASE.repo} xi-io-cli && cd xi-io-cli && git checkout --detach ${RELEASE.sha}`}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                        <div>2. Syntax check install.mjs:</div>
                        <CommandBlock
                          id="compile-cmd-2"
                          command="node --check install.mjs"
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                        <div>3. Run pinned installer with ref:</div>
                        <CommandBlock
                          id="compile-cmd-3"
                          command={`node install.mjs --ref ${RELEASE.sha}`}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                      </div>
                    )}

                    {cliMode === 'validator' && (
                      <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border space-y-3 text-xs">
                        <div className="font-bold text-workspace-text">Version Report Validator</div>
                        <p className="text-workspace-muted">Offline validation using compareVersionReport.</p>
                      </div>
                    )}

                    {/* Standard 5 Commands Flow (Required for Static Contract) */}
                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div id="step-1" className="space-y-1">
                        <div className="text-xs font-semibold text-workspace-text">
                          Step 1: Download Candidate Installer (historical CLI #13 download below still resolves node on PATH)
                        </div>
                        <CommandBlock
                          id="step-1-cmd-block"
                          command={downloadCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                      </div>

                      {/* Step 2 */}
                      <div id="step-2" className="space-y-1">
                        <div className="text-xs font-semibold text-workspace-text">Step 2: Run Installer with Pinned SHA</div>
                        <CommandBlock
                          id="step-2-cmd-block"
                          command={installCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                      </div>

                      {/* Step 3 */}
                      <div id="step-3" className="space-y-1">
                        <div className="text-xs font-semibold text-workspace-text">
                          Step 3: Local version check (not Work return) (source_sha must equal {RELEASE.sha})
                        </div>
                        <CommandBlock
                          id="step-3-cmd-block"
                          command={versionCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                        <div className="text-[11px] text-workspace-muted pt-1">
                          Paste output below to test digest and P1 Node Executable Path wrapper invariants:
                        </div>
                        <textarea
                          value={readbackInput}
                          onChange={(e) => handleVerifyReadback(e.target.value)}
                          placeholder="Paste output from xi-io-cli version here..."
                          className="min-h-[80px] w-full p-2 rounded bg-workspace-surface border border-workspace-border text-xs font-mono text-workspace-text"
                        />
                        {readbackResult.p1Notice && (
                          <div className="p-3 rounded bg-workspace-surface/40 border border-workspace-border-strong/60 text-xs text-workspace-focus">
                            <div className="font-bold">{readbackResult.p1Notice.title}</div>
                            <div>{readbackResult.p1Notice.message}</div>
                          </div>
                        )}
                        {readbackResult.details && (
                          <div className="text-xs font-mono text-workspace-text">
                            {readbackResult.details}
                          </div>
                        )}
                      </div>

                      {/* Step 4 */}
                      <div id="step-4" className="space-y-1">
                        <div className="text-xs font-semibold text-workspace-text">Step 4: Local launch (not Ward admission)</div>
                        <CommandBlock
                          id="step-4-cmd-block"
                          command={startCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                      </div>

                      {/* Step 5 */}
                      <div id="step-5" className="space-y-1">
                        <div className="text-xs font-semibold text-workspace-text">Step 5: Rollback if Needed</div>
                        <CommandBlock
                          id="step-5-cmd-block"
                          command={rollbackCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                        <div className="text-xs text-workspace-muted">
                          Run it again to undo the rollback.
                        </div>
                      </div>
                    </div>

                    {/* Conflict and Help Notes */}
                    <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border text-xs space-y-2 text-workspace-text">
                      <div><strong>Troubleshooting &amp; Invariants:</strong></div>
                      <div>If a LAUNCHER_OWNERSHIP_CONFLICT occurs, older wrappers in ~/.local/bin are preserved.</div>
                      <div>If PATH needs updating, run the add_to_path helper command.</div>
                      <div>
                        Need assistance? <ExternalSiteLink href={RELEASE.issueUrl} className="text-workspace-focus underline">Report a problem (V1 issue)</ExternalSiteLink>.
                      </div>
                    </div>
                  </div>
                  </details>
                </section>
              </div>

              {/* AUDITOR TAB 3: SYSTEM DIAGNOSTICS & TRACEABILITY */}
              {activeView === 'status-dashboard' && (
                <section className="space-y-6" aria-label="System Diagnostics">
                  <div>
                    <h3 className="text-base font-bold text-workspace-text">This computer: checks not yet reported</h3>
                    <p className="text-xs text-workspace-muted">
                      This page has not queried your computers or services. Source availability, sample results and historical records do not establish current device status.
                    </p>
                  </div>

                  {/* 6 Physical Gates */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold font-mono text-workspace-focus uppercase">Connection and operation checks</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {PHYSICAL_SIX_GATES.map((g) => (
                        <div key={g.gate} className="p-3 rounded-none bg-workspace-canvas border border-workspace-border text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-workspace-text">Gate {g.gate}: {g.name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] bg-workspace-surface border border-workspace-border text-workspace-focus font-mono">
                              {g.status}
                            </span>
                          </div>
                          <div className="text-workspace-muted">Owner: {g.owner}</div>
                          <div className="text-[11px] text-workspace-text">{g.criteria}</div>
                          <div className="pt-1 text-[10px] font-mono text-workspace-muted">
                            This computer: not reported
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Traceability Matrix Deduplication */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold font-mono text-workspace-focus uppercase">Evidence still needed</h4>
                      <div className="flex gap-1 text-[11px]">
                        {(['platform', 'workspace', 'device'] as const).map((est) => (
                          <button
                            key={est}
                            type="button"
                            onClick={() => setSelectedEstate(est)}
                            className={`px-2 py-0.5 rounded capitalize ${
                              selectedEstate === est ? 'bg-workspace-focus text-workspace-inverse font-bold' : 'bg-workspace-surface text-workspace-muted'
                            }`}
                          >
                            {est}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border text-xs">
                      <p className="text-workspace-muted text-xs mb-3">
                        These entries are not test results. Use actual native readback or explicitly selected receipt files before relying on an installed state.
                      </p>
                      <div className="space-y-2">
                        {TRACEABILITY_CELLS.filter((c) => c.estate === selectedEstate).map((cell) => (
                          <div key={cell.id} className="p-2.5 rounded bg-workspace-surface border border-workspace-border flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-workspace-text">{cell.id}: {cell.name}</div>
                              <div className="text-[11px] text-workspace-muted">Contract: {cell.contract} (Gate {cell.gate})</div>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-workspace-surface text-workspace-muted border border-workspace-border">
                                {cell.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* CAS Conflict Receipt Validator */}
                  <div className="space-y-2 p-4 rounded-none bg-workspace-canvas border border-workspace-border text-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-workspace-text">CAS Collision Refusal Receipt Validator (draft expected-version CAS; not merged)</h4>
                      <button
                        type="button"
                        onClick={handleGenerateCanaryReceipt}
                        className="px-2.5 py-1 rounded bg-workspace-surface text-workspace-focus text-[11px] font-mono"
                      >
                        Load Canary Receipt
                      </button>
                    </div>
                    <textarea
                      value={casInput}
                      onChange={(e) => handleValidateCasReceipt(e.target.value)}
                      placeholder="Paste BINS conflict receipt JSON..."
                      className="min-h-[80px] w-full p-2 rounded bg-workspace-surface border border-workspace-border font-mono text-workspace-text text-xs"
                    />
                    {casValidation.checked && (
                      <div className={`p-2.5 rounded text-xs ${casValidation.valid ? 'bg-workspace-surface text-workspace-success' : 'bg-workspace-surface text-workspace-danger'}`}>
                        {casValidation.valid ? 'Valid BINS CAS conflict receipt schema.' : casValidation.errors.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Rollback History Component */}
                  <RollbackHistory />
                </section>
              )}

              {/* AUDITOR TAB 4: ONBOARDING & ECONOMICS (5.5 REBASELINE) */}
              {activeView === 'rebaseline' && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-workspace-text">HEX Onboarding, Identity &amp; Metered Economics (5.5)</h3>
                    <p className="text-xs text-workspace-muted">
                      Planning examples only. No account connection, billing service or spending authorization is configured by this page.
                    </p>
                  </div>

                  {/* Metered Preauthorization Formula */}
                  <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border text-xs space-y-3">
                    <div className="font-bold text-workspace-text">Preauthorization Spending Cap Evaluation:</div>
                    <p className="text-workspace-text">
                      This example calculates a proposed cap: <code className="font-mono text-workspace-focus">C_reserved = Q_max * R + F</code> It does not enforce a service limit or authorize a paid task.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] text-workspace-muted block">Q_max (Units):</label>
                        <input
                          type="number"
                          value={meteredMaxUnits}
                          onChange={(e) => setMeteredMaxUnits(Number(e.target.value))}
                          className="w-full px-2 py-1 rounded bg-workspace-surface border border-workspace-border-strong text-workspace-text font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-workspace-muted block">Rate R ($/unit):</label>
                        <input
                          type="number"
                          step="0.001"
                          value={meteredRate}
                          onChange={(e) => setMeteredRate(Number(e.target.value))}
                          className="w-full px-2 py-1 rounded bg-workspace-surface border border-workspace-border-strong text-workspace-text font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-workspace-muted block">Fixed F ($):</label>
                        <input
                          type="number"
                          value={meteredFixedFee}
                          onChange={(e) => setMeteredFixedFee(Number(e.target.value))}
                          className="w-full px-2 py-1 rounded bg-workspace-surface border border-workspace-border-strong text-workspace-text font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-workspace-muted block">Budget Cap ($):</label>
                        <input
                          type="number"
                          value={meteredBudgetCap}
                          onChange={(e) => setMeteredBudgetCap(Number(e.target.value))}
                          className="w-full px-2 py-1 rounded bg-workspace-surface border border-workspace-border-strong text-workspace-text font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-workspace-surface font-mono text-xs text-workspace-focus">
                      Calculated C_reserved: ${(meteredMaxUnits * meteredRate + meteredFixedFee).toFixed(2)} | Status: {(meteredMaxUnits * meteredRate + meteredFixedFee) <= meteredBudgetCap ? 'EXAMPLE WITHIN CAP' : 'EXAMPLE ABOVE CAP'}
                    </div>
                  </div>

                  {/* $20 Concierge Illustrative Economics */}
                  <div className="p-4 rounded-none bg-workspace-canvas border border-workspace-border text-xs space-y-3">
                    <div className="font-bold text-workspace-text">Concierge Unit Economics Model ($20 Price Point):</div>
                    <p className="text-workspace-muted">
                      Illustrative calculation modeling support labor sensitivity and contribution margins.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-2 rounded bg-workspace-surface">
                        <div className="text-[10px] text-workspace-muted">Gross Revenue:</div>
                        <div className="text-sm font-bold text-workspace-text font-mono">${grossRevenue.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded bg-workspace-surface">
                        <div className="text-[10px] text-workspace-muted">Payment Fees:</div>
                        <div className="text-sm font-bold text-workspace-text font-mono">${paymentFees.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded bg-workspace-surface">
                        <div className="text-[10px] text-workspace-muted">Support Labor Cost:</div>
                        <div className="text-sm font-bold text-workspace-text font-mono">${supportLaborCost.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded bg-workspace-surface">
                        <div className="text-[10px] text-workspace-muted">Contribution Margin:</div>
                        <div className="text-sm font-bold text-workspace-success font-mono">${contributionMargin.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-workspace-muted">
                      Support Sensitivity: Every +10 min/customer costs <strong className="text-workspace-focus font-mono">${sensitivityPer10Min.toFixed(2)}/customer</strong>.
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          <footer
            aria-label="About the maker"
            className={`border-t px-6 py-6 sm:px-8 space-y-4 text-sm ${isLight ? 'border-workspace-border bg-workspace-surface text-workspace-muted' : 'border-workspace-border bg-workspace-canvas/50 text-workspace-muted'}`}
          >
            <p className="max-w-2xl leading-relaxed">
              I’m one disabled UX designer trying to make the world a little better, one useful tool at a time. I’m building software for people who need it, especially when another subscription is one too many.
            </p>
            <div className="space-y-2">
              <p>If you like what I’m building, have a look around:</p>
              <nav aria-label="Explore my other sites">
                <ul className="flex flex-wrap gap-2">
                  {['xi-io.ca', 'xi-io.com', 'xi-io.org', 'xi-io.net', 'xi-io.io', 'x42s.com'].map((site) => (
                    <li key={site}>
                      <ExternalSiteLink
                        href={`https://${site}`}
                        className={`inline-flex min-h-[44px] items-center rounded-none px-3 py-2 font-medium underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workspace-focus focus-visible:ring-offset-2 ${isLight ? 'text-workspace-focus focus-visible:ring-offset-white' : 'text-workspace-focus focus-visible:ring-offset-workspace-canvas'}`}
                      >
                        {site}
                      </ExternalSiteLink>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
            <p className="text-xs">More to come. There’s always another idea.</p>
          </footer>

        </div>
      </div>
    </div>
  );
}
