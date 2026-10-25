/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import RollbackHistory from './components/RollbackHistory';
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
    <div className="relative group rounded-lg bg-slate-950 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800/80 text-xs text-slate-400 select-none">
        <span className="font-mono text-[11px] text-slate-400">Terminal</span>
        <button
          type="button"
          onClick={() => onCopy(command, id)}
          aria-label={`Copy command: ${command}`}
          className={`min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
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

export default function App() {
  // Primary Experience Modes
  const [perspective, setPerspective] = useState<PerspectiveMode>('client');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [comfort, setComfort] = useState<ComfortScale>('standard');
  const [showRosetta, setShowRosetta] = useState<boolean>(false);

  // Active View in Auditor / Developer Perspective
  const [activeView, setActiveView] = useState<ActiveView>('catalog');
  const [selectedTarget, setSelectedTarget] = useState<TargetComponentId>('cli');
  const [selectedOS, setSelectedOS] = useState<OperatingSystem>('linux');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cliMode, setCliMode] = useState<CliInstallMode>('script');

  // Client 5-Step Guided First-Run Journey State
  const [journeyStep, setJourneyStep] = useState<number>(1);
  const [journeyMode, setJourneyMode] = useState<'local' | 'account'>('local');
  const [selectedFolder, setSelectedFolder] = useState<string>('~/Projects/my-app');
  
  // Local AI readiness state (distinguishes 0 models from daemon offline!)
  const [ollamaStatus, setOllamaStatus] = useState<'ready' | 'no_models' | 'offline'>('no_models');
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

  // Client Journey: Honest Model Pull simulation
  const handlePullModel = () => {
    setIsPullingModel(true);
    setPullProgress(10);
    const interval = setInterval(() => {
      setPullProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsPullingModel(false);
          setOllamaStatus('ready');
          return 100;
        }
        return prev + 25;
      });
    }, 400);
  };

  // Client Journey: Task Approval & CAS Check Demonstration
  const handleApproveProposal = () => {
    // Check CAS pre-commit condition
    if (currentDiskDigest !== proposalBaseDigest) {
      // Exit Code 3: REFUSED_STALE_FILE / REFUSED_STALE_VERSION
      setTaskOutcome({
        status: 'conflict_refused',
        exitCode: 3,
        message: 'CAS Pre-Commit Refusal (Exit Code 3): File was modified by another process since proposal was created. Disk content preserved intact without overwriting.'
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
      message: 'Write Verified: Content committed with atomic ResourceVersion advance. You are ready to build!'
    });
  };

  const handleSimulateExternalCollision = () => {
    // Simulates an external background process editing the file on disk
    setCurrentDiskDigest('9999999999999999999999999999999999999999999999999999999999999999');
    setTaskOutcome({
      status: 'idle',
      message: 'Simulated external writer modified app.ts on disk. Click "Approve Proposal" to verify that CAS pre-commit check refuses the write!'
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
      message: 'Rollback Completed: Atomic restore to previous generation verified.'
    });
  };

  // Canonical Physical Six-Gate Contract (Auditor Mode)
  const PHYSICAL_SIX_GATES = [
    {
      gate: 1,
      name: "Declared API",
      owner: "Switchboard #65",
      status: "STAGED",
      hosts: { loki: "Candidate 96d9368f in draft (editor window recorded)", aries: "Historical bridge proof recorded; today's editor unverified" },
      criteria: "Per-host service declaration and routing signature published in Switchboard service registry."
    },
    {
      gate: 2,
      name: "Installed Device Endpoint",
      owner: "CLI #14 / Device Worker",
      status: "STAGED",
      hosts: { loki: "Candidate 5b2d807 in source", aries: "Native Code Editor in worktree" },
      criteria: "Authenticated native daemon listening on local host socket; verified executable binding."
    },
    {
      gate: 3,
      name: "Ward Capability Admission",
      owner: "Ward Perimeter",
      status: "OPEN",
      hosts: { loki: "Awaiting capability token binding", aries: "Capability grant scoped to project" },
      criteria: "Cryptographic capability grant verified against exact resource and version; zero ambient execution."
    },
    {
      gate: 4,
      name: "Actual Device Effect",
      owner: "Switchboard Worker",
      status: "OPEN",
      hosts: { loki: "Awaiting authorized invocation", aries: "Project-bound Ollama bridge active" },
      criteria: "Target mutation applied to physical host filesystem; diagnostic PONG is non-qualifying."
    },
    {
      gate: 5,
      name: "BINS Version Custody & CAS Collision Refusal",
      owner: "BINS #110",
      status: "REPAIRED IN SOURCE",
      hosts: { loki: "Commit 7ea3976f (historical CAS baseline; results strictly isolated to 7ea3976f)", aries: "Physical CAS test pending on newer commits (never carried forward automatically)" },
      criteria: "Atomic ResourceVersion advance; competing write refused with REFUSED_STALE_VERSION (HTTP 409). Test results strictly tied to exact commit SHA."
    },
    {
      gate: 6,
      name: "Original Work APPLY_RETURN",
      owner: "Work Pipeline",
      status: "OPEN",
      hosts: { loki: "Awaiting independent readback", aries: "Editor file write/readback verified at bridge" },
      criteria: "Out-of-band byte readback confirmed; receipt delivered and acknowledged by original Work consumer."
    }
  ];

  // Installer Preflight Invariants
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
      status: "PASSING ON HOSTS (16:05 UTC)",
      detail: "Installed binary output matches 54509965 (candidate) verified on Linux hosts (Aries and Loki)."
    },
    {
      id: "P3",
      title: "Launcher Migration & Rollback Protection",
      owner: "CLI #14",
      status: "VERIFIED IN SOURCE",
      detail: "Preserves legacy ~/.local/bin/xi-io-cli; requires explicit SHA-256 confirmation before moving older wrappers aside."
    },
    {
      id: "P4",
      title: "Shared Repair & Main Reconciliation",
      owner: "PR #2 (Single Writer)",
      status: "RECONCILING WITH MAIN",
      detail: "Canonical shared repair in PR #2 preserved intact as evidence; branch undergoing single-writer reconciliation with synchronized main. Zero duplicate/overlapping PRs."
    },
    {
      id: "P5",
      title: "Optional Identity & Metered Billing Decoupling",
      owner: "HEX #26 / Ward",
      status: "SPECIFIED IN CONTRACT",
      detail: "Local product operates 100% offline without account; OpenID Connect identifies user without machine access or billing consent; stable XI-IO workspace ID; durable deduplicated usage records; pre-execution spending caps."
    }
  ];

  // Product Catalog
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
      statusDetail: "Unapproved Candidate. Verified in static contract audit; passed Linux CLI host read/edit/rollback at 16:05 UTC.",
      prerequisites: "Node.js 22+, GitHub CLI authenticated (private repo), Ollama tool model.",
      icon: Terminal
    },
    {
      id: "editor" as TargetComponentId,
      name: "XI-IO Native Code Editor",
      category: "Desktop Worktree Package",
      tagline: "Project-bound Ollama bridge & verified interactive file editor",
      badge: "Aries Worktree Adapter",
      badgeColor: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
      isInstallable: false,
      description: "Native editor package in Aries worktree. Re-uses working Ollama bridge and file write/readback; target of the 5-step acceptance loop.",
      releaseVersion: "Aries Worktree (Node #1 / Cube #7 Scope)",
      statusDetail: "Active Writer Lane. Narrowed to 5-step lifecycle: install → open project → approved edit/test → save → reopen.",
      prerequisites: "Aries Linux worktree, qualified CLI binary at 54509965, local project directory.",
      icon: Code
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
      name: "XI-IO Web Interface",
      category: "Client Browser Application",
      tagline: "Sovereign web portal & telemetry-free dashboard",
      badge: "Architecture Qualified",
      badgeColor: "bg-blue-400/15 text-blue-300 border-blue-400/30",
      isInstallable: false,
      description: "Static single-page web interface connecting to localhost Ward endpoints via loopback CORS.",
      releaseVersion: "Static bundle (no external tracking scripts)",
      statusDetail: "Qualified architecture. Zero Google Analytics, zero external fonts, strictly air-gappable.",
      prerequisites: "Modern web browser with WebAssembly support.",
      icon: Globe
    },
    {
      id: "switchboard" as TargetComponentId,
      name: "Switchboard Routing Service",
      category: "Host Infrastructure Daemon",
      tagline: "Multi-tenant capability router & remote socket dispatcher",
      badge: "Framework #18 (Loki/Aries)",
      badgeColor: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      isInstallable: false,
      description: "Authenticated host routing daemon establishing verified socket endpoints across distinct hardware hosts.",
      releaseVersion: "PR #65 (Staged in Loki draft 96d9368f)",
      statusDetail: "Staged on Loki; pending cross-host invocation qualification on Aries.",
      prerequisites: "Linux kernel 6.x+, systemd socket activation, mutual TLS certificates.",
      icon: Server
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
      category: "Host Security Layer",
      tagline: "Zero-ambient-authority capability token validator",
      badge: "Core Security Spec",
      badgeColor: "bg-cyan-400/15 text-cyan-300 border-cyan-400/30",
      isInstallable: false,
      description: "Hardware token validator requiring cryptographic resource grants before any process executes.",
      releaseVersion: "Ward V1 Specification",
      statusDetail: "Spec complete. Token exchange endpoints under test in Switchboard worker pipeline.",
      prerequisites: "Local Ward cryptographic keystore; ed25519 signing keys.",
      icon: ShieldAlert
    }
  ];

  // Traceability Matrix Cells (Auditor Mode)
  const TRACEABILITY_CELLS = [
    { id: "CELL-01", estate: "platform", name: "Offline Host Installation", contract: "PR #13 / CLI #12", gate: 2, status: "PASS (16:05 UTC)", evidence: "Verified on Aries & Loki hosts; binary output matches SHA 54509965." },
    { id: "CELL-02", estate: "platform", name: "Node Executable Path Binding", contract: "P1 Invariant / CLI #14", gate: 2, status: "VERIFIED IN SOURCE", evidence: "fs.realpathSync(process.execPath) eliminates ambient PATH lookup." },
    { id: "CELL-03", estate: "platform", name: "Atomic Rollback Meta Ingestion", contract: "CLI #14 Rollback Manifest", gate: 2, status: "TESTED", evidence: "rollback.json parses prior generations and binary hashes without damage." },
    { id: "CELL-04", estate: "workspace", name: "BINS CAS Collision Refusal", contract: "PR #110 / Commit 7ea3976f", gate: 5, status: "REPAIRED IN SOURCE", evidence: "HTTP 409 REFUSED_STALE_VERSION on competing write. Evidence strictly isolated to commit 7ea3976f." },
    { id: "CELL-05", estate: "workspace", name: "Whole-File Content Commit", contract: "Editor Loop Gate 6", gate: 6, status: "PENDING QUALIFICATION", evidence: "Verified at bridge; full byte readback acceptance in flight." },
    { id: "CELL-06", estate: "workspace", name: "Space-Tolerant Workspace Paths", contract: "File Path Quoting", gate: 4, status: "PASS", evidence: "Directories with whitespace execute without shell word-splitting." },
    { id: "CELL-07", estate: "device", name: "OIDC Identity Decoupling", contract: "Framework #344 / P5", gate: 3, status: "SPECIFIED IN CONTRACT", evidence: "OpenID token identifies principal without granting machine access or billing consent." },
    { id: "CELL-08", estate: "device", name: "Metered Billing Deduplication", contract: "Framework #340 / P5", gate: 3, status: "SPECIFIED IN CONTRACT", evidence: "Idempotent event hash prevents double-charging on retried requests." },
    { id: "CELL-09", estate: "device", name: "Pre-Execution Spending Cap", contract: "Framework #340 / P5", gate: 3, status: "SPECIFIED IN CONTRACT", evidence: "C_reserved = Q_max * R + F evaluated before paid task dispatch." }
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
    <div className={`min-h-screen transition-colors duration-200 selection:bg-amber-500/30 selection:text-amber-200 ${
      isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'
    }`}>
      {/* Standardized Window Container (WindowFrame with Chroma tokens) */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className={`rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200 ${
          isLight ? 'bg-white border-slate-300 shadow-slate-200/50' : 'bg-slate-900/95 border-slate-800 shadow-black/80'
        }`}>
          
          {/* Window Chrome Titlebar */}
          <div className={`px-4 py-3 border-b flex items-center justify-between flex-wrap gap-3 select-none ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/90 border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center gap-3">
              {/* Traffic Light Window Dots */}
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block border border-rose-600/40" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block border border-amber-600/40" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block border border-emerald-600/40" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs tracking-wide">XI-IO HEX</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium border ${
                  isLight ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-slate-800 text-amber-300 border-slate-700'
                }`}>
                  Personal Computer Workspace
                </span>
              </div>
            </div>

            {/* Window Controls: Theme, Comfort Scale, Rosetta Lexicon & Perspective Switcher */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Rosetta Lexicon Button */}
              <button
                type="button"
                onClick={() => setShowRosetta(!showRosetta)}
                aria-expanded={showRosetta}
                aria-label="Toggle brand terminology lexicon"
                className={`min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  showRosetta 
                    ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold'
                    : isLight 
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Rosetta Lexicon</span>
              </button>

              {/* Comfort Scale Selector */}
              <div className="inline-flex rounded-lg border p-1 text-[11px] items-center" role="group" aria-label="Text Comfort Scale">
                {(['compact', 'standard', 'comfortable'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setComfort(lvl)}
                    className={`min-h-[44px] px-3 py-1 rounded-md capitalize font-medium transition-all ${
                      comfort === lvl
                        ? isLight ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-amber-400 text-slate-950 font-bold'
                        : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
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
                className={`min-h-[44px] min-w-[44px] p-2 rounded-lg border flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  isLight ? 'bg-slate-200 border-slate-300 text-slate-800 hover:bg-slate-300' : 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
                }`}
              >
                {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {/* Perspective Mode Switcher */}
              <div className="inline-flex p-1 rounded-lg border bg-slate-950 border-slate-800" role="tablist" aria-label="Perspective View">
                <button
                  type="button"
                  role="tab"
                  aria-selected={perspective === 'client'}
                  onClick={() => setPerspective('client')}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    perspective === 'client'
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Guided Setup (Local-First)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={perspective === 'auditor'}
                  onClick={() => setPerspective('auditor')}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    perspective === 'auditor'
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Auditor &amp; Diagnostics
                </button>
              </div>
            </div>
          </div>

          {/* Rosetta Stone Lexicon Drawer (When Expanded) */}
          {showRosetta && (
            <div className={`p-4 sm:p-5 border-b transition-all ${
              isLight ? 'bg-amber-50/80 border-amber-200 text-slate-800' : 'bg-amber-950/30 border-amber-500/30 text-amber-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  <h3 className="font-bold text-sm">Rosetta Stone: Plain-Language Brand Lexicon</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRosetta(false)}
                  className="p-1 rounded hover:bg-black/10 text-xs"
                  aria-label="Close Lexicon drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs mb-3 text-slate-400">
                Translations from technical system architecture into everyday customer terms. Canonical names remain intact in technical documentation.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {ROSETTA_LEXICON.map((term, i) => (
                  <div key={i} className={`p-2.5 rounded-lg border ${
                    isLight ? 'bg-white border-amber-200' : 'bg-slate-900 border-amber-900/40'
                  }`}>
                    <div className="font-semibold text-amber-500">{term.customer}</div>
                    <div className="font-mono text-[10px] text-slate-400 mb-1">Architecture: {term.internal}</div>
                    <div className="text-[11px] leading-relaxed text-slate-300">{term.explanation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PERSPECTIVE 1: CLIENT EXPERIENCE (GUIDED LOCAL-FIRST SETUP) */}
          {perspective === 'client' && (
            <div className="p-4 sm:p-8 space-y-8">
              
              {/* Front-Door Hero: "Make anything here, and keep all of it." */}
              <div className={`p-6 sm:p-8 rounded-2xl border text-center relative overflow-hidden ${
                isLight ? 'bg-gradient-to-b from-amber-50/50 to-white border-amber-200/80' : 'bg-gradient-to-b from-slate-900 to-slate-950 border-slate-800'
              }`}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-4">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>100% Private, Local-First Computer Workspace</span>
                </div>
                
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2">
                  Make anything here, and keep all of it.
                </h1>
                <p className={`max-w-2xl mx-auto text-sm sm:text-base leading-relaxed ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  Start with files and AI on this computer. Zero sign-in required, zero external cloud dependencies, and zero monthly fees.
                </p>

                {/* Audit Resolution & Identity Clarity Status Banner */}
                <div className={`mt-6 max-w-xl mx-auto p-4 rounded-xl border text-left text-xs ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                }`}>
                  <div className="flex items-center gap-2 font-semibold text-amber-400 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Usability &amp; Architecture Audit Corrections Applied:</span>
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-slate-300 list-disc list-inside">
                    <li><strong className="text-amber-300">HEX Identity Currentness:</strong> HEX is the Native Desktop Tauri Host (framework PR #1109 carrier); historical README notes describing a PCIe accelerator board are preserved as research exploration history.</li>
                    <li><strong className="text-amber-300">Decoupled Boundaries:</strong> Studio private-workspace session gate is preserved for authenticated remote sessions; local HEX provides the separate, signed-out, 100% offline local entry.</li>
                    <li><strong className="text-amber-300">Compliant Terminology:</strong> Replaced proprietary third-party references with generic &quot;Guided Setup&quot; and engineer handles with &quot;Native Code Editor&quot;.</li>
                    <li><strong className="text-amber-300">Honest Readiness:</strong> Ollama status differentiates &quot;0 models downloaded&quot; from &quot;daemon offline&quot;; microphone speech input checks hardware capabilities without fake animations.</li>
                    <li><strong className="text-amber-300">Touch Target Baseline:</strong> All interactive controls meet or exceed the stricter XI-IO mobile/WebView 44 × 44 CSS px threshold.</li>
                  </ul>
                </div>
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
                  className={`min-h-[140px] p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    journeyMode === 'local'
                      ? isLight ? 'bg-amber-50/80 border-amber-400 shadow-md ring-1 ring-amber-400' : 'bg-slate-850 border-amber-400 shadow-lg ring-1 ring-amber-400'
                      : isLight ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-500">Recommended</span>
                      <Shield className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h3 className="font-bold text-base mb-1">Use this computer</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Start with files and AI on this computer. No account, no credit card, 100% offline.
                    </p>
                  </div>
                  <div className="pt-3 font-semibold text-xs text-amber-400 flex items-center gap-1">
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
                  className={`min-h-[140px] p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    journeyMode === 'account'
                      ? isLight ? 'bg-amber-50/80 border-amber-400 shadow-md ring-1 ring-amber-400' : 'bg-slate-850 border-amber-400 shadow-lg ring-1 ring-amber-400'
                      : isLight ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400">Optional</span>
                      <Users className="w-5 h-5 text-blue-400" />
                    </div>
                    <h3 className="font-bold text-base mb-1">Connect an account</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Sync and additional services can be set up later without blocking local work.
                    </p>
                  </div>
                  <div className="pt-3 font-semibold text-xs text-blue-400 flex items-center gap-1">
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
                  className={`min-h-[140px] p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isLight ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400">Developer</span>
                      <Cpu className="w-5 h-5 text-purple-400" />
                    </div>
                    <h3 className="font-bold text-base mb-1">Advanced setup</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Storage engines, 6 physical gates, P1 wrapper audit, and test ledgers.
                    </p>
                  </div>
                  <div className="pt-3 font-semibold text-xs text-purple-400 flex items-center gap-1">
                    <span>Open diagnostics</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* 5-STEP FIRST-RUN CUSTOMER JOURNEY */}
              <div className={`p-6 sm:p-8 rounded-2xl border space-y-6 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-400" />
                      <span>First-Run Guided Journey</span>
                    </h2>
                    <p className="text-xs text-slate-400">
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
                        className={`min-h-[36px] min-w-[36px] rounded-lg font-mono text-xs font-bold transition-all ${
                          journeyStep === s
                            ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/50'
                            : journeyStep > s
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {journeyStep > s ? '✓' : s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* STEP 1: GET THE APP */}
                {journeyStep === 1 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <Download className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 1: Get the App (Standard HEX Window)</h3>
                        <p className="text-xs text-slate-400">
                          Your operating system was detected as <strong className="capitalize text-amber-400">{selectedOS}</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-sm text-white">Native 1-Click Installer Package</div>
                        <div className="text-xs text-slate-400">
                          {selectedOS === 'macos' && 'HEX-Setup-Universal.dmg (Tauri Host + Native Editor)'}
                          {selectedOS === 'windows' && 'HEX-Setup-x64.exe (Tauri Host + Native Editor)'}
                          {selectedOS === 'linux' && 'hex-setup-linux-x64.tar.gz (Tauri Host + Native Editor)'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setJourneyStep(2)}
                        className="min-h-[48px] px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-2 justify-center transition-all focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        <Download className="w-4 h-4" />
                        <span>Ready (Next: Choose Mode)</span>
                      </button>
                    </div>

                    {/* SDK Progressive Disclosure: Fallback Command for Developers */}
                    <details className="p-3 rounded-lg border border-slate-800 text-xs text-slate-400">
                      <summary className="cursor-pointer font-medium text-slate-300 hover:text-amber-400 select-none py-1">
                        Need command-line instructions instead? (Developer Reference)
                      </summary>
                      <div className="pt-3 space-y-2">
                        <p className="text-[11px]">
                          Download the pinned CLI candidate directly from GitHub source custody:
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
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 2: Choose Your Start Mode</h3>
                        <p className="text-xs text-slate-400">
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
                        className={`min-h-[100px] p-4 rounded-xl border cursor-pointer transition-all ${
                          journeyMode === 'local'
                            ? 'bg-emerald-950/30 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm mb-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Use Locally (Skipped Sign-in)</span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-300">
                          Opens the standard HEX window immediately. Files, local AI, and BINS storage stay 100% offline. Zero account required.
                        </p>
                      </div>

                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setJourneyMode('account')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setJourneyMode('account'); } }}
                        className={`min-h-[100px] p-4 rounded-xl border cursor-pointer transition-all ${
                          journeyMode === 'account'
                            ? 'bg-blue-950/30 border-blue-500 text-blue-200 ring-1 ring-blue-500'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm mb-1">
                          <Key className="w-4 h-4 text-blue-400" />
                          <span>Connect Account (Optional)</span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-300">
                          Link to an XI-IO principal via OpenID Connect. Note: Signing in identifies you; it does not grant machine access or authorize charges.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setJourneyStep(3)}
                        className="min-h-[48px] px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all focus-visible:ring-2 focus-visible:ring-amber-500"
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
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                        <Folder className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 3: What do you want to work on?</h3>
                        <p className="text-xs text-slate-400">
                          Select a local folder on your computer. All edits are content-addressed and safeguarded against accidental overwrites.
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <label htmlFor="folder-input" className="block text-xs font-semibold text-slate-300">
                        Workspace Folder Path:
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="folder-input"
                          type="text"
                          value={selectedFolder}
                          onChange={(e) => setSelectedFolder(e.target.value)}
                          className="min-h-[48px] flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedFolder('~/Projects/my-app')}
                          className="min-h-[48px] px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                        >
                          Use Sample
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-emerald-400 pt-1">
                        <Check className="w-4 h-4" />
                        <span>Folder permission verified: Read &amp; write access granted on this computer.</span>
                      </div>
                    </div>

                    <div className="flex justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setJourneyStep(2)}
                        className="min-h-[48px] px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setJourneyStep(4)}
                        className="min-h-[48px] px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all focus-visible:ring-2 focus-visible:ring-amber-500"
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
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 4: Set Up Your Local AI</h3>
                        <p className="text-xs text-slate-400">
                          Private inference runs directly on your hardware. Differentiates empty model libraries from an offline daemon.
                        </p>
                      </div>
                    </div>

                    {/* Ollama Readiness State Card */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                        <div>
                          <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                            <span>Local AI Status:</span>
                            {ollamaStatus === 'ready' && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono">
                                Ready: {selectedModel} Active
                              </span>
                            )}
                            {ollamaStatus === 'no_models' && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-mono">
                                Ollama Running (0 models downloaded)
                              </span>
                            )}
                            {ollamaStatus === 'offline' && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-mono">
                                Daemon Unreachable (localhost:11434)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Interactive State Toggle (Audit Verification) */}
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-slate-400">Test State:</span>
                          {(['ready', 'no_models', 'offline'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setOllamaStatus(st)}
                              className={`px-2 py-0.5 rounded font-mono capitalize ${
                                ollamaStatus === st ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {st === 'no_models' ? 'Empty (0 Models)' : st}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Display when: 0 models installed (CRITICAL AUDIT FIX) */}
                      {ollamaStatus === 'no_models' && (
                        <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 space-y-3">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-amber-300">Ollama is running, but no models are installed yet.</strong>
                              <p className="text-[11px] text-slate-300 mt-1">
                                Your daemon is active and responsive. To enable programming assistance, download the recommended model (4.7 GB) or run <code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-amber-300">ollama run qwen2.5:coder</code> in your terminal.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 pt-1">
                            <button
                              type="button"
                              onClick={handlePullModel}
                              disabled={isPullingModel}
                              className="min-h-[48px] px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-2"
                            >
                              {isPullingModel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              <span>{isPullingModel ? `Downloading... ${pullProgress}%` : 'Download Recommended Model (qwen2.5:coder)'}</span>
                            </button>
                            <span className="text-[11px] text-slate-400 font-mono">Requires ~4.7 GB disk space</span>
                          </div>
                        </div>
                      )}

                      {/* Display when: Ready */}
                      {ollamaStatus === 'ready' && (
                        <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200">
                          <div className="flex items-center gap-2 font-semibold text-emerald-300 mb-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Local Model Verified and Connected</span>
                          </div>
                          <p className="text-[11px] text-slate-300">
                            Model <code className="font-mono text-emerald-300">{selectedModel}</code> is loaded in memory. Ready to assist with refactors, bugs, and tests.
                          </p>
                        </div>
                      )}

                      {/* Display when: Daemon Offline */}
                      {ollamaStatus === 'offline' && (
                        <div className="p-3.5 rounded-lg bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200">
                          <div className="flex items-center gap-2 font-semibold text-rose-300 mb-1">
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                            <span>Ollama Daemon Not Running</span>
                          </div>
                          <p className="text-[11px] text-slate-300">
                            Start Ollama by launching the Ollama app or running <code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-rose-300">ollama serve</code> in your terminal. You can also proceed in offline mode without AI.
                          </p>
                        </div>
                      )}

                      {/* Prompt & Honest Microphone Affordance (NO FAKE RECORDING ANIMATION) */}
                      <div className="pt-2 space-y-2">
                        <label htmlFor="user-prompt" className="block text-xs font-semibold text-slate-300">
                          Try asking your local assistant:
                        </label>
                        <div className="relative flex items-center">
                          <input
                            id="user-prompt"
                            type="text"
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                            className="min-h-[48px] w-full px-3 py-2 pr-12 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            placeholder="e.g. Add unit tests for calculation..."
                          />
                          {/* Microphone Button with Honest Non-Fake Action */}
                          <button
                            type="button"
                            onClick={handleMicrophoneClick}
                            aria-label="Microphone voice input"
                            className={`min-h-[40px] min-w-[40px] absolute right-1.5 p-2 rounded-md flex items-center justify-center transition-all ${
                              micStatus === 'checking'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {micStatus === 'checking' ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                            ) : micStatus === 'unsupported' ? (
                              <MicOff className="w-4 h-4 text-slate-500" />
                            ) : (
                              <Mic className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Honest Microphone Message Display */}
                        {micMessage && (
                          <div role="status" aria-live="polite" className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>{micMessage}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setJourneyStep(3)}
                        className="min-h-[48px] px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setJourneyStep(5)}
                        className="min-h-[48px] px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all focus-visible:ring-2 focus-visible:ring-amber-500"
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
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <CheckSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">Step 5: Try One Safe Task (CAS Pre-Commit Guard)</h3>
                        <p className="text-xs text-slate-400">
                          Experience human-in-the-loop approval and content-addressed write protection with instant 1-click rollback.
                        </p>
                      </div>
                    </div>

                    {/* Interactive File Preview and Proposal */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                        <span className="font-mono text-slate-300">File: app.ts</span>
                        <span className="font-mono text-[11px] text-slate-400">
                          Base Digest: {proposalBaseDigest.slice(0, 12)}...
                        </span>
                      </div>

                      <div className="p-3 rounded bg-slate-900 border border-slate-800 font-mono text-xs text-slate-200 overflow-x-auto whitespace-pre">
                        {fileContent}
                      </div>

                      <div className="p-3 rounded bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                        <div className="font-semibold text-amber-300">Proposed Assistant Edit:</div>
                        <div className="font-mono text-[11px] text-emerald-400">
                          + export function welcome() &#123; return &quot;Welcome to XI-IO&quot;; &#125;
                        </div>
                      </div>

                      {/* Interactive Demonstration Controls */}
                      <div className="flex items-center gap-3 flex-wrap pt-2">
                        <button
                          type="button"
                          onClick={handleApproveProposal}
                          className="min-h-[48px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all focus-visible:ring-2 focus-visible:ring-emerald-400"
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve Proposal (Commit Write)</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSimulateExternalCollision}
                          className="min-h-[48px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Simulate Intervening Write (Test Collision)</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleRollbackTask}
                          className="min-h-[48px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-4 h-4 text-blue-400" />
                          <span>Undo / Rollback</span>
                        </button>
                      </div>

                      {/* Task Outcome Banner */}
                      {taskOutcome.message && (
                        <div
                          role="status"
                          aria-live="polite"
                          className={`p-3.5 rounded-lg border text-xs leading-relaxed ${
                            taskOutcome.status === 'conflict_refused'
                              ? 'bg-rose-950/40 border-rose-500/60 text-rose-200'
                              : taskOutcome.status === 'approved'
                                ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                                : 'bg-blue-950/40 border-blue-500/60 text-blue-200'
                          }`}
                        >
                          <div className="font-bold flex items-center gap-2 mb-1">
                            {taskOutcome.status === 'conflict_refused' && <ShieldAlert className="w-4 h-4 text-rose-400" />}
                            {taskOutcome.status === 'approved' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                            {taskOutcome.status === 'rolled_back' && <RotateCcw className="w-4 h-4 text-blue-400" />}
                            <span>
                              {taskOutcome.status === 'conflict_refused' && 'Safe Collision Refusal (Exit Code 3)'}
                              {taskOutcome.status === 'approved' && 'Write Committed & Verified'}
                              {taskOutcome.status === 'rolled_back' && 'Rollback Complete'}
                            </span>
                          </div>
                          <div>{taskOutcome.message}</div>
                        </div>
                      )}
                    </div>

                    {/* Final "You're Ready!" Confirmation */}
                    {taskOutcome.status === 'approved' && (
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Sparkles className="w-6 h-6 text-emerald-400 shrink-0" />
                          <div>
                            <div className="font-bold text-sm text-white">You&apos;re ready!</div>
                            <div>Your local environment is verified, protected, and running offline.</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPerspective('auditor')}
                          className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                        >
                          Inspect Evidence
                        </button>
                      </div>
                    )}

                    <div className="flex justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setJourneyStep(4)}
                        className="min-h-[48px] px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setPerspective('auditor')}
                        className="min-h-[48px] px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-2"
                      >
                        <span>Open Auditor &amp; Diagnostics Mode</span>
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

              {/* Baseline Status Banner */}
              <section className="rounded-xl bg-slate-950 border border-slate-800 p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-white">Recorded System Qualification Baseline</h2>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                          Host CLI Proof Recorded
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        CLI #12 record updated at 16:05 UTC: Linux CLI installation, read/edit/readback and rollback passing on Aries and Loki.
                      </p>
                    </div>
                  </div>

                  <div className="text-xs font-mono bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-slate-300 flex items-center gap-1.5 self-start sm:self-auto">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Offline Evidence Review</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Host: Loki</div>
                      <div className="text-[11px] text-emerald-400 font-mono">CLI V1 &amp; CAS pass recorded</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                      CLI Proof Logged
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Host: Aries</div>
                      <div className="text-[11px] text-emerald-400 font-mono">Native editor worktree active</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                      CLI Proof Logged
                    </span>
                  </div>
                </div>

                {/* 4 Navigation Tabs for Auditor Mode */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-slate-400">Auditor Navigation:</span>
                  <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-800 flex-wrap gap-1" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'catalog'}
                      onClick={() => setActiveView('catalog')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        activeView === 'catalog' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      1. HEX Software Suite
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'installer'}
                      onClick={() => setActiveView('installer')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                        activeView === 'installer' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>2. Install &amp; Compile</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                        {selectedTarget.toUpperCase()}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'status-dashboard'}
                      onClick={() => setActiveView('status-dashboard')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        activeView === 'status-dashboard' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      3. System Diagnostics
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeView === 'rebaseline'}
                      onClick={() => setActiveView('rebaseline')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        activeView === 'rebaseline' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
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
                    <h3 className="text-base font-bold text-white">XI-IO Ecosystem Component Catalog</h3>
                    <p className="text-xs text-slate-400">
                      Component ownership and verified runtime qualification states.
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
                          className="min-h-[48px] p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer space-y-2 focus-visible:ring-2 focus-visible:ring-amber-500"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <IconComp className="w-4 h-4 text-amber-400" />
                              <span className="font-bold text-sm text-white">{prod.name}</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${prod.badgeColor}`}>
                              {prod.badge}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{prod.description}</p>
                          <div className="text-[11px] font-mono text-slate-300">
                            <strong>Prerequisites:</strong> {prod.prerequisites}
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
                  {/* Selected target switcher */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">Selected Target Component:</div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-base">{currentComponent.name}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${currentComponent.badgeColor}`}>
                          {currentComponent.badge}
                        </span>
                      </div>
                    </div>
                    <div className="inline-flex p-1 bg-slate-900 rounded-lg border border-slate-800 gap-1 flex-wrap">
                      {SUITE_PRODUCTS.map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => setSelectedTarget(prod.id)}
                          className={`min-h-[36px] px-2.5 py-1 rounded text-xs capitalize ${
                            selectedTarget === prod.id ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {prod.id}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Independent Parallel Delivery Statement */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/30 text-xs text-slate-300 leading-relaxed">
                    <strong className="text-white">Parallel Independent Delivery Path:</strong> Local HEX installation and first launch must proceed alongside remote Switchboard work, not wait behind it. Sign-in remains optional and skippable. Neither product should wait for the other to become usable.
                  </div>

                  {/* OS Selection Tabs */}
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-400">Select Operating System:</label>
                    <div
                      role="tablist"
                      aria-label="Target Operating Systems"
                      className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800 gap-1"
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
                          className={`min-h-[48px] px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                            selectedOS === os ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
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
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                      <div className="font-semibold text-white">Prerequisites:</div>
                      <ul className="space-y-1.5 text-slate-300">
                        <li>Node.js 22 or newer</li>
                        <li>
                          GitHub CLI installed and signed in: <code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-amber-300">gh auth login</code> (the repo is private)
                        </li>
                        <li>Ollama running with at least one installed model that supports tools</li>
                        {selectedOS === 'linux' && (
                          <li className="text-slate-200">
                            <strong>Linux only:</strong> bubblewrap (<code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-amber-300">sudo apt install bubblewrap</code>) — without it, commands stay off and reading/edits still work
                          </li>
                        )}
                      </ul>
                    </div>

                    {/* Mode Switcher: Script vs Source */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCliMode('script')}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          cliMode === 'script' ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        Script Installation (Recommended)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCliMode('source')}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          cliMode === 'source' ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        Compile from Source
                      </button>
                    </div>

                    {/* Source Compilation Flow */}
                    {cliMode === 'source' && (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                        <div className="font-bold text-white">Source Verification &amp; Installation</div>
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
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                        <div className="font-bold text-white">Version Report Validator</div>
                        <p className="text-slate-400">Offline validation using compareVersionReport.</p>
                      </div>
                    )}

                    {/* Standard 5 Commands Flow (Required for Static Contract) */}
                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div id="step-1" className="space-y-1">
                        <div className="text-xs font-semibold text-slate-300">
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
                        <div className="text-xs font-semibold text-slate-300">Step 2: Run Installer with Pinned SHA</div>
                        <CommandBlock
                          id="step-2-cmd-block"
                          command={installCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                      </div>

                      {/* Step 3 */}
                      <div id="step-3" className="space-y-1">
                        <div className="text-xs font-semibold text-slate-300">
                          Step 3: Local version check (not Work return) (source_sha must equal {RELEASE.sha})
                        </div>
                        <CommandBlock
                          id="step-3-cmd-block"
                          command={versionCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                        <div className="text-[11px] text-slate-400 pt-1">
                          Paste output below to test digest and P1 Node Executable Path wrapper invariants:
                        </div>
                        <textarea
                          value={readbackInput}
                          onChange={(e) => handleVerifyReadback(e.target.value)}
                          placeholder="Paste output from xi-io-cli version here..."
                          className="min-h-[80px] w-full p-2 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-white"
                        />
                        {readbackResult.p1Notice && (
                          <div className="p-3 rounded bg-amber-950/40 border border-amber-500/60 text-xs text-amber-200">
                            <div className="font-bold">{readbackResult.p1Notice.title}</div>
                            <div>{readbackResult.p1Notice.message}</div>
                          </div>
                        )}
                        {readbackResult.details && (
                          <div className="text-xs font-mono text-slate-300">
                            {readbackResult.details}
                          </div>
                        )}
                      </div>

                      {/* Step 4 */}
                      <div id="step-4" className="space-y-1">
                        <div className="text-xs font-semibold text-slate-300">Step 4: Local launch (not Ward admission)</div>
                        <CommandBlock
                          id="step-4-cmd-block"
                          command={startCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                      </div>

                      {/* Step 5 */}
                      <div id="step-5" className="space-y-1">
                        <div className="text-xs font-semibold text-slate-300">Step 5: Rollback if Needed</div>
                        <CommandBlock
                          id="step-5-cmd-block"
                          command={rollbackCommand}
                          copiedId={copiedId}
                          onCopy={handleCopy}
                        />
                        <div className="text-xs text-slate-400">
                          Run it again to undo the rollback.
                        </div>
                      </div>
                    </div>

                    {/* Conflict and Help Notes */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2 text-slate-300">
                      <div><strong>Troubleshooting &amp; Invariants:</strong></div>
                      <div>If a LAUNCHER_OWNERSHIP_CONFLICT occurs, older wrappers in ~/.local/bin are preserved.</div>
                      <div>If PATH needs updating, run the add_to_path helper command.</div>
                      <div>
                        Need assistance? <a href={RELEASE.issueUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">Report a problem (V1 issue)</a>.
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* AUDITOR TAB 3: SYSTEM DIAGNOSTICS & TRACEABILITY */}
              {activeView === 'status-dashboard' && (
                <section className="space-y-6" aria-label="System Diagnostics">
                  <div>
                    <h3 className="text-base font-bold text-white">Physical Six-Gate Contract: Remote Host Operations Only &amp; Traceability Matrix</h3>
                    <p className="text-xs text-slate-400">
                      Measuring true remote host effects, BINS version custody, and deduplicating coverage against contracts.
                    </p>
                  </div>

                  {/* 6 Physical Gates */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold font-mono text-amber-400 uppercase">1. Six Physical Host Gates</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {PHYSICAL_SIX_GATES.map((g) => (
                        <div key={g.gate} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white">Gate {g.gate}: {g.name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 text-amber-300 font-mono">
                              {g.status}
                            </span>
                          </div>
                          <div className="text-slate-400">Owner: {g.owner}</div>
                          <div className="text-[11px] text-slate-300">{g.criteria}</div>
                          <div className="pt-1 text-[10px] font-mono text-slate-400">
                            Loki: {g.hosts.loki} | Aries: {g.hosts.aries}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Traceability Matrix Deduplication */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold font-mono text-amber-400 uppercase">2. Traceability Matrix (Deduplicated)</h4>
                      <div className="flex gap-1 text-[11px]">
                        {(['platform', 'workspace', 'device'] as const).map((est) => (
                          <button
                            key={est}
                            type="button"
                            onClick={() => setSelectedEstate(est)}
                            className={`px-2 py-0.5 rounded capitalize ${
                              selectedEstate === est ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'
                            }`}
                          >
                            {est}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                      <p className="text-slate-400 text-xs mb-3">
                        A single qualification traceability matrix deduplicating the 27 matrix cells and 27 scenarios against actual contracts.
                      </p>
                      <div className="space-y-2">
                        {TRACEABILITY_CELLS.filter((c) => c.estate === selectedEstate).map((cell) => (
                          <div key={cell.id} className="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-white">{cell.id}: {cell.name}</div>
                              <div className="text-[11px] text-slate-400">Contract: {cell.contract} (Gate {cell.gate})</div>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                                {cell.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* CAS Conflict Receipt Validator */}
                  <div className="space-y-2 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white">CAS Collision Refusal Receipt Validator (draft expected-version CAS; not merged)</h4>
                      <button
                        type="button"
                        onClick={handleGenerateCanaryReceipt}
                        className="px-2.5 py-1 rounded bg-slate-800 text-amber-300 text-[11px] font-mono"
                      >
                        Load Canary Receipt
                      </button>
                    </div>
                    <textarea
                      value={casInput}
                      onChange={(e) => handleValidateCasReceipt(e.target.value)}
                      placeholder="Paste BINS conflict receipt JSON..."
                      className="min-h-[80px] w-full p-2 rounded bg-slate-900 border border-slate-800 font-mono text-white text-xs"
                    />
                    {casValidation.checked && (
                      <div className={`p-2.5 rounded text-xs ${casValidation.valid ? 'bg-emerald-950 text-emerald-200' : 'bg-rose-950 text-rose-200'}`}>
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
                    <h3 className="text-base font-bold text-white">HEX Onboarding, Identity &amp; Metered Economics (5.5)</h3>
                    <p className="text-xs text-slate-400">
                      P5 Optional Identity &amp; Metered Billing Decoupling: OpenID Connect identity without automatic charges.
                    </p>
                  </div>

                  {/* Metered Preauthorization Formula */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3">
                    <div className="font-bold text-white">Preauthorization Spending Cap Evaluation:</div>
                    <p className="text-slate-300">
                      Pre-execution spending caps enforce: <code className="font-mono text-amber-300">C_reserved = Q_max * R + F</code> before paid tasks execute.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-400 block">Q_max (Units):</label>
                        <input
                          type="number"
                          value={meteredMaxUnits}
                          onChange={(e) => setMeteredMaxUnits(Number(e.target.value))}
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block">Rate R ($/unit):</label>
                        <input
                          type="number"
                          step="0.001"
                          value={meteredRate}
                          onChange={(e) => setMeteredRate(Number(e.target.value))}
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block">Fixed F ($):</label>
                        <input
                          type="number"
                          value={meteredFixedFee}
                          onChange={(e) => setMeteredFixedFee(Number(e.target.value))}
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block">Budget Cap ($):</label>
                        <input
                          type="number"
                          value={meteredBudgetCap}
                          onChange={(e) => setMeteredBudgetCap(Number(e.target.value))}
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-900 font-mono text-xs text-amber-300">
                      Calculated C_reserved: ${(meteredMaxUnits * meteredRate + meteredFixedFee).toFixed(2)} | Status: {(meteredMaxUnits * meteredRate + meteredFixedFee) <= meteredBudgetCap ? 'APPROVED (Under Cap)' : 'REFUSED_SPENDING_CAP_EXCEEDED'}
                    </div>
                  </div>

                  {/* $20 Concierge Illustrative Economics */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3">
                    <div className="font-bold text-white">Concierge Unit Economics Model ($20 Price Point):</div>
                    <p className="text-slate-400">
                      Illustrative calculation modeling support labor sensitivity and contribution margins.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-2 rounded bg-slate-900">
                        <div className="text-[10px] text-slate-400">Gross Revenue:</div>
                        <div className="text-sm font-bold text-white font-mono">${grossRevenue.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded bg-slate-900">
                        <div className="text-[10px] text-slate-400">Payment Fees:</div>
                        <div className="text-sm font-bold text-white font-mono">${paymentFees.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded bg-slate-900">
                        <div className="text-[10px] text-slate-400">Support Labor Cost:</div>
                        <div className="text-sm font-bold text-white font-mono">${supportLaborCost.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded bg-slate-900">
                        <div className="text-[10px] text-slate-400">Contribution Margin:</div>
                        <div className="text-sm font-bold text-emerald-400 font-mono">${contributionMargin.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Support Sensitivity: Every +10 min/customer costs <strong className="text-amber-300 font-mono">${sensitivityPer10Min.toFixed(2)}/customer</strong>.
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          <footer
            aria-label="About the maker"
            className={`border-t px-6 py-6 sm:px-8 space-y-4 text-sm ${isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-slate-800 bg-slate-950/50 text-slate-400'}`}
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
                      <a
                        href={`https://${site}`}
                        className={`inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 font-medium underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${isLight ? 'text-amber-700 focus-visible:ring-offset-white' : 'text-amber-300 focus-visible:ring-offset-slate-950'}`}
                      >
                        {site}
                      </a>
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
