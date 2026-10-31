import crypto from 'node:crypto';

export const AUDHD_INTENT_SCHEMA = 'xiio.audhd-intent-projection/v1';
export const AUDHD_COMMAND_POLICY_SCHEMA = 'xiio.audhd-command-policy/v1';

const INTENSIFIER_WORDS = new Set([
  'fuck','fucking','fucked','fucker','fuckers','fuckin','fucks',
  'shit','shitty','damn','goddamn','goddammit','bloody',
]);

const WRITE_ACTIONS = new Set([
  'write','writing','edit','editing','change','changing','modify','modifying',
  'patch','patching','fix','fixing','update','updating','create','creating',
  'add','adding','delete','deleting','remove','removing','implement','implementing',
  'wire','wiring',
  // Existing artifact-operation vocabulary shares the directive classifier.
  'save','append','replace','store','persist','materialize',
]);

const TERMINAL_ACTIONS = new Set([
  'run','running','execute','executing','execution','test','testing','build','building',
  'deploy','deploying','deployment','install','installing','lint','linting','check','checking',
  'commit','committing','checkout','fetch','fetching','pull','pulling','start','starting',
  'restart','restarting','smoke','simulate','simulating','simulation','verify','verifying',
  'verification','scan','scanning',
]);

const NEGATION_TOKENS = new Set([
  'not','never',"don't",'dont',"can't",'cant','cannot','without',
  'cancel','cancelled','canceled','abort','stop','avoid',
]);

const COMMAND_PREFIX = /^(?:@\w+\s+|#\w[\w-]*\s+|[+!#@][\w-]+\s*)*/i;

function stableRef(raw) {
  return `audhd-intent:${crypto.createHash('sha256').update(raw).digest('hex').slice(0,24)}`;
}

function normalizeApostrophes(value) {
  return String(value || '').replace(/[’‘]/g, "'");
}

function tokenize(value) {
  return normalizeApostrophes(value).toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
}

function policyTokens(tokens) {
  return tokens.filter((token) => !INTENSIFIER_WORDS.has(token));
}

function isWordChar(ch) {
  return typeof ch === 'string' && /^[\p{L}\p{N}]$/u.test(ch);
}

function splitProtected(text) {
  const parts = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { current += ch; escaped = true; continue; }
    if (quote) {
      current += ch;
      if (ch === quote) { parts.push({ protected:true, text:current }); current=''; quote=null; }
      continue;
    }
    if (ch === "'" && isWordChar(text[i - 1]) && isWordChar(text[i + 1])) {
      current += ch;
      continue;
    }
    if (ch === '`' || ch === '"' || ch === "'") {
      if (current) parts.push({ protected:false, text:current });
      current = ch; quote = ch; continue;
    }
    current += ch;
  }
  if (current) parts.push({ protected:Boolean(quote), text:current });
  return parts;
}

function stripIntensityFromUnprotected(text, { preserveSpacing = false } = {}) {
  const tokens = text.split(/(\s+|[^\p{L}\p{N}_@#+!:=/.-]+)/u);
  const removed = [];
  const kept = tokens.map((token) => {
    const key = token.toLowerCase();
    if (INTENSIFIER_WORDS.has(key)) { removed.push(token); return ''; }
    return token;
  }).join('');
  return { text: preserveSpacing ? kept : kept.replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;:!?])/g,'$1'), removed };
}

function semanticLine(line) {
  const protectedParts = splitProtected(line);
  const removed = [];
  const normalized = protectedParts.map((part) => {
    if (part.protected) return part.text;
    const out = stripIntensityFromUnprotected(part.text);
    removed.push(...out.removed);
    return out.text;
  }).join('').replace(/[ \t]{2,}/g,' ').trim();
  return { normalized, removed };
}

function canonicalKey(line) {
  return line.toLowerCase().replace(/[^a-z0-9@#+!:=/.-]+/g,' ').replace(/\s+/g,' ').trim();
}

function classifyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return 'EMPTY';
  if (/\b(?:not done|not complete|still red|still blocked|=\s*no|=\s*not|live\s*=\s*no)\b/i.test(trimmed)) return 'STATE_ASSERTION';
  if (/^(?:hard|invariant|truth)\s*[:=]/i.test(trimmed)) return 'INVARIANT';
  if (/^(?:no|do not|don't|never|cancel|abort|stop)\b/i.test(trimmed)) return 'NEGATIVE_DIRECTIVE';
  const withoutTags = trimmed.replace(COMMAND_PREFIX,'').trim();
  if (/^(?:use|fix|run|execute|rebase|re-onboard|onboard|simulate|compile|project|return|reap|apply|promote|deploy|keep|continue|fill|find|check|read|distribute|filter|prove|get|reduce|batch|plan|bind|consume|rejoin|mirror|pull|merge)\b/i.test(withoutTags)) return 'DIRECTIVE';
  const request = withoutTags
    .replace(/^(?:(?:please|now|instead|only)\s+|current\s+(?:request|instruction)\s*:\s*)+/i,'')
    .replace(/^(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|need)(?:\s+you)?\s+to\s+)/i,'');
  const head = tokenize(request)[0] || '';
  if (!/(?:ing|tion|ment)$/.test(head) && (WRITE_ACTIONS.has(head) || TERMINAL_ACTIONS.has(head)
    || ['read','open','inspect','view','show','load','access','use'].includes(head))) return 'DIRECTIVE';
  // Preserve supported present-tense corrections addressed to this worker.
  // Third-person reports and descriptions are not this request form.
  if (/^(?:the issue is\s+)?you\s+(?:fail|are failing)\s+to\b/i.test(withoutTags)) return 'DIRECTIVE';
  return 'CONTEXT';
}

function currentInstructionClauses(raw) {
  const source = String(raw);
  const masked = splitProtected(source.replace(/```[\s\S]*?```/g, text => text.replace(/[^\n]/g, ' ')))
    .map(part => part.protected ? part.text.replace(/[^\n]/g, ' ') : part.text).join('');
  const kept = [];
  let reported = false;
  const boundaries = [...masked.matchAll(/(?:[\n;,!?]+|\.(?=\s|$)|\b(?:and(?:\s+then)?|but|however|then)\b)/gi)];
  let start = 0;
  let precedingBoundary = '', groupKind = null;
  for (const boundary of [...boundaries, {index: masked.length, 0: ''}]) {
    const sourceStart = start;
    const boundaryBefore = precedingBoundary;
    const part = masked.slice(start, boundary.index);
    const text = source.slice(start, boundary.index);
    start = boundary.index + boundary[0].length;
    const hardBoundary = /[\n;.!?]/.test(precedingBoundary);
    precedingBoundary = boundary[0];
    if (hardBoundary) groupKind = null;
    const clause = stripIntensityFromUnprotected(part,{preserveSpacing:true}).text.trim().replace(/^[,:\s]+/, '');
    if (!clause) {
      // A protected filename can continue a preceding explicit read list.
      // It supplies no action verb; the artifact resolver owns its meaning.
      if (!reported && text.trim()) kept.push(Object.freeze({text,masked_text:part,action_text:'',kind:'CONTEXT',source_start:sourceStart,source_end:boundary.index,boundary_before:boundaryBefore}));
      continue;
    }
    if (/^(?:now\b|current\s+(?:request|instruction)\s*:|instead\b)/i.test(clause)) { reported = false; groupKind = null; }
    if (/\b(?:earlier|previously|historical|history|old\s+(?:report|text|instruction)|saved\s+research|research\s+says|someone\s+(?:said|requested)|tool\s+output)\b/i.test(clause)
      || /^(?:please\s+)?(?:explain|describe|summari[sz]e|discuss|show\s+me\s+how|tell\s+me\s+how|what\s+(?:does|did|is)|why\b)/i.test(clause)) {
      reported = true;
      continue;
    }
    if (!reported) {
      let kind = classifyLine(clause);
      // Conjunctions do not turn the tail of a report into a directive.
      if (groupKind === 'CONTEXT') kind = 'CONTEXT';
      else if (groupKind === 'NEGATIVE_DIRECTIVE') kind = 'NEGATIVE_DIRECTIVE';
      const operandOnly = /^[A-Za-z0-9_./-]+\.[A-Za-z0-9._-]+$/.test(clause);
      if (!operandOnly) groupKind = kind;
      kept.push(Object.freeze({text,masked_text:part,action_text:clause,kind,source_start:sourceStart,source_end:boundary.index,boundary_before:boundaryBefore}));
    }
  }
  return Object.freeze(kept);
}

export function normalizeAudhdIntent(rawInput, { userCorrections = {} } = {}) {
  const raw = String(rawInput ?? '');
  if (!raw.trim()) throw new Error('RAW_INPUT_REQUIRED');
  const lines = raw.split(/\r?\n/);
  const projected = [];
  const intensitySignals = [];
  const seen = new Set();
  const currentSourceLines = [];

  for (const sourceLine of lines) {
    const { normalized, removed } = semanticLine(sourceLine);
    if (removed.length) intensitySignals.push({ source_line:sourceLine, tokens:removed });
    if (!normalized) continue;
    const correction = userCorrections[normalized] || userCorrections[sourceLine];
    const corrected = typeof correction === 'string' && correction.trim() ? correction.trim() : normalized;
    const kind = classifyLine(corrected);
    if (kind === 'EMPTY') continue;
    const key = `${kind}:${canonicalKey(corrected)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    projected.push({ kind, text:corrected, semantic_key:key });
    currentSourceLines.push(typeof correction === 'string' && correction.trim() ? correction.trim() : sourceLine);
  }

  const directives = projected.filter((row) => ['DIRECTIVE','NEGATIVE_DIRECTIVE'].includes(row.kind));
  const stateAssertions = projected.filter((row) => row.kind === 'STATE_ASSERTION');
  const invariants = projected.filter((row) => row.kind === 'INVARIANT');
  const currentClauses = currentInstructionClauses(currentSourceLines.join('\n'));
  return {
    schema:AUDHD_INTENT_SCHEMA,
    raw_ref:stableRef(raw),
    raw_preserved:true,
    raw_text:raw,
    current_instruction_text:currentClauses.map(row => row.action_text).join('; '),
    current_instruction_clauses:currentClauses,
    privacy_posture:'PRIVATE_BY_DEFAULT',
    intensity_is_context_not_authority:true,
    intensity_signals:intensitySignals,
    projected_lines:projected,
    directives,
    state_assertions:stateAssertions,
    invariants,
    duplicate_semantic_lines_removed: Math.max(0, lines.filter((line)=>line.trim()).length - projected.length),
    command_ready:directives.length > 0,
    hard:[
      'RAW_USER_LANGUAGE_PRESERVED',
      'INTENSITY!=COMMAND_AUTHORITY',
      'PROFANITY_AS_INTENSIFIER!=OPERAND',
      'USER_CORRECTION_OVERRIDES_PROJECTION',
      'STATE_ASSERTION!=EXECUTION_REQUEST',
    ],
  };
}

function splitClauses(value) {
  return normalizeApostrophes(value)
    .split(/(?:[\n;,!?]+|\.(?=\s|$)|\b(?:and(?:\s+then)?|but|however|then)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function actionNegated(tokens, index) {
  if (tokens.some(token => ['cancel','cancelled','canceled','abort','stop'].includes(token))) return true;
  const start = Math.max(0, index - 5);
  const prefix = policyTokens(tokens.slice(start, index));
  if (prefix.some((token) => NEGATION_TOKENS.has(token))) return true;
  for (let i = 0; i < prefix.length - 1; i += 1) {
    if (prefix[i] === 'do' && prefix[i + 1] === 'not') return true;
  }
  return false;
}

function classifyActions(clauses) {
  const result = { positiveWrite:0, negatedWrite:0, positiveTerminal:0, negatedTerminal:0 };
  for (const row of clauses) {
    if (!['DIRECTIVE','NEGATIVE_DIRECTIVE'].includes(row.kind)) continue;
    const clause = row.action_text;
    // Treat filename/path operands as data, not e.g. an "edit" verb in edit.md.
    const tokens = tokenize(clause.replace(/[^\s]+\.[A-Za-z0-9.]+(?=\s|$)/g, ' ARTIFACT '));
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const negated = row.kind === 'NEGATIVE_DIRECTIVE' || actionNegated(tokens, index);
      if (WRITE_ACTIONS.has(token)) result[negated ? 'negatedWrite' : 'positiveWrite'] += 1;
      if (TERMINAL_ACTIONS.has(token)) result[negated ? 'negatedTerminal' : 'positiveTerminal'] += 1;
    }
  }
  return result;
}

function blanketToolRestraint(text) {
  const normalized = policyTokens(tokenize(text)).join(' ');
  return /\b(?:do not|don't|dont|never) (?:use )?(?:any )?tools?\b/i.test(normalized)
    || /\bplan only\b/i.test(normalized)
    || /\bdo not execute\b/i.test(normalized)
    || /\bstop and wait for go\b/i.test(normalized);
}

export const AUDHD_COMMAND_REQUIREMENTS_SCHEMA = 'xiio.audhd-command-requirements/v1';

function freezeRequirement(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeRequirement(child);
    Object.freeze(value);
  }
  return value;
}

// Recognition only: this bounded grammar grants no permission and does not
// replace the executor's executable/argv/environment/path policy.
const REQUIREMENT_EXECUTABLES = new Set(['npm','pnpm','yarn','bun','git','node','python','python3','cargo','rustc','bash']);
const REQUIREMENT_REQUEST_PREFIX = /^(?:(?:please|now|instead|only)\s+|current\s+(?:request|instruction)\s*:\s*|(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|need)(?:\s+you)?\s+to\s+)*/i;

function literalCommandOperand(text) {
  let operand = text.trim();
  if ((operand.startsWith('`') && operand.endsWith('`'))
      || (operand.startsWith('"') && operand.endsWith('"'))
      || (operand.startsWith("'") && operand.endsWith("'"))) operand = operand.slice(1,-1);
  if (!operand || /[^A-Za-z0-9_./:@=+\s-]/.test(operand)) return null;
  const words = operand.split(/\s+/);
  let repeat = 1;
  const suffix = words.at(-1);
  if (suffix === 'twice' || suffix === 'thrice') {
    repeat = suffix === 'twice' ? 2 : 3; words.pop();
  } else if (suffix === 'times' && /^\d+$/.test(words.at(-2) || '')) {
    words.pop(); repeat = Number(words.pop());
  } else if (suffix === 'again' && words[0] === 'npm'
      && ((words[1] === 'test' && words.length === 3) || (words[1] === 'run' && words.length === 4))) words.pop();
  if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 16) return null;
  const [command,...args] = words;
  if (!REQUIREMENT_EXECUTABLES.has(command) || args.length > 32
      || words.some(word => word.length > 2048 || word.startsWith('/') || word.split('/').includes('..'))) return null;
  if (command === 'npm' && !(args.length === 1 && args[0] === 'test'
      || args.length === 2 && args[0] === 'run' && /^[A-Za-z0-9_-]+$/.test(args[1]))) return null;
  if (command === 'git' && !(args[0] === 'status' && args.slice(1).every(x=>['--short','--porcelain'].includes(x))
      || args[0] === 'diff' && (args.length === 1 || args.length === 2 && args[1] === '--stat'
        || args[1] === '--' && args.length > 2))) return null;
  if (['node','python','python3','bash'].includes(command)
      && (!args.length || args[0].startsWith('-') || args.some(x=>['-e','--eval','-p','--print','-c','-lc'].includes(x)))) return null;
  return {command,args,repeat};
}

/** Original-request obligations, never obligations inferred from tool proposals. */
export function compileCommandRequirements(userText, {workspaceIdentityState='bound'} = {}) {
  const raw = String(userText ?? '');
  const requestDigest = crypto.createHash('sha256').update(raw).digest('hex');
  const finish = (state,reason,obligations=[],unresolved=[]) => freezeRequirement({
    schema:AUDHD_COMMAND_REQUIREMENTS_SCHEMA,state,reason,
    source_ref:stableRef(raw),raw_request_sha256:requestDigest,raw_preserved:true,
    authority_granted:false,effect_ceiling:'NO_EFFECT_INTENT_PROJECTION_ONLY',
    consumer_binding_required:true,
    required_result_binding_fields:['original_request_id','session_id','workspace_identity','occurrence_ref','attempt_id','command','args','terminal_receipt_id'],
    obligations,unresolved,
    hard:['ORIGINAL_REQUEST!=MODEL_PROPOSAL','ELIGIBILITY!=AUTHORITY','ONE_RESULT_PER_OCCURRENCE','REPEAT!=DUPLICATE_RESULT','SOURCE_ORDER_MUST_SURVIVE_EDIT_BOUNDARIES'],
  });
  if (workspaceIdentityState !== 'bound') return finish('UNKNOWN','session_workspace_identity_unbound');
  if (!raw.trim()) return finish('NONE','no_current_command_request');
  if (raw.length > 65536) return finish('UNKNOWN','command_requirement_input_bound');
  const clauses = currentInstructionClauses(raw);
  if (clauses.some(row=>row.kind==='NEGATIVE_DIRECTIVE' && blanketToolRestraint(row.action_text)))
    return finish('NONE','user_blanket_restraint');
  const obligations=[],unresolved=[];
  let commandGroup = false;
  for (let clauseIndex=0;clauseIndex<clauses.length;clauseIndex++) {
    const row=clauses[clauseIndex];
    const conjunction = /^(?:and(?:\s+then)?|then)$/i.test(row.boundary_before.trim());
    const continued = commandGroup && conjunction && row.kind==='CONTEXT';
    if (!conjunction) commandGroup=false;
    if (row.kind==='NEGATIVE_DIRECTIVE') { commandGroup=false; continue; }
    const request=row.text.trim().replace(COMMAND_PREFIX,'').replace(REQUIREMENT_REQUEST_PREFIX,'');
    const head=request.match(/^(?:run|execute)\s+/i);
    const explicitTool=request.match(/^(?:build|test|check|lint|verify)\s+(?:(?:this|the)\s+(?:project|workspace)\s+)?(?:using|with)\s+(.+)$/i);
    if (!(row.kind==='DIRECTIVE' && (head || explicitTool)) && !continued) {
      const requestHead=tokenize(row.action_text)[0];
      const artifactOperand=/^[A-Za-z0-9_./-]+\.[A-Za-z0-9._-]+$/.test(row.action_text);
      if (row.kind==='DIRECTIVE' && !artifactOperand && TERMINAL_ACTIONS.has(requestHead)
          || row.kind==='CONTEXT' && REQUIREMENT_EXECUTABLES.has(request.split(/\s+/)[0]))
        unresolved.push({source:{start:row.source_start,end:row.source_end},reason:'command_requires_explicit_bounded_operand'});
      if (row.kind==='DIRECTIVE') commandGroup=false;
      continue;
    }
    let operand=explicitTool ? explicitTool[1] : head ? request.slice(head[0].length) : request;
    if (head) operand=operand.replace(/^(?:(?:fucking|fuckin|damn|goddamn|bloody)\s+)+/i,'');
    const namedTask=operand.match(/^(?:the\s+)?(?:(?:fucking|fuckin|damn|goddamn|bloody)\s+)*(?:build|tests?|checks?|lints?)\s+(?:using|with)\s+(.+)$/i);
    if (head && namedTask) operand=namedTask[1];
    const parsed=literalCommandOperand(operand);
    const source={start:row.source_start,end:row.source_end,clause_index:clauseIndex};
    if (!parsed) { unresolved.push({source,reason:'unsupported_or_ambiguous_command_operand'}); commandGroup=false; continue; }
    commandGroup=true;
    for(let repetition=0;repetition<parsed.repeat;repetition++) {
      const order=obligations.length;
      obligations.push({
        occurrence_ref:`${stableRef(raw)}:command:${order}`,
        order,source:{...source,repetition_index:repetition},
        command:parsed.command,args:[...parsed.args],
        expected_result:{kind:'EXIT_CODE',exit_code:0,origin:'DEFAULT_COMMAND_SUCCESS'},
      });
    }
  }
  // An explicit expected-red assertion is a result constraint, not a command.
  // The bounded form deliberately does not guess which command "it" denotes.
  const ordinals={first:0,second:1,third:2,fourth:3};
  let outcomeContinuation=false;
  for(const row of clauses) {
    if (/[\n;.!?]/.test(row.boundary_before) || /^(?:then|and\s+then)$/i.test(row.boundary_before)
        || row.kind==='DIRECTIVE') outcomeContinuation=false;
    if(row.kind==='NEGATIVE_DIRECTIVE') continue;
    const clause=row.text.trim();
    const match=clause.match(/^(?:the\s+)?(first|second|third|fourth)\s+(test|command)\s+must\s+(fail|succeed|pass)(?:\s+because\s+(.+))?$/i);
    if(!match) {
      if (outcomeContinuation || /^(?:(?:with\s+)?expect(?:ed)?\b|(?:the\s+)?(?:first|second|third|fourth)\s+(?:test|command)\s+must\b)/i.test(clause))
        unresolved.push({source:{start:row.source_start,end:row.source_end},reason:'expected_outcome_syntax_unresolved'});
      continue;
    }
    outcomeContinuation=true;
    if (match[4] && /\b(?:if|unless|when|until|provided|except|exit(?:s|ed)?(?:\s+with)?\s+(?:code|status))\b/i.test(match[4])) {
      unresolved.push({source:{start:row.source_start,end:row.source_end},reason:'expected_outcome_syntax_unresolved'});
      continue;
    }
    const relevant=obligations.filter(o=>match[2].toLowerCase()==='command'
      || o.args.includes('test') || o.args.includes('--test'));
    const selected=relevant[ordinals[match[1].toLowerCase()]];
    if(!selected) { unresolved.push({source:{start:row.source_start,end:row.source_end},reason:'expected_outcome_target_unresolved'}); continue; }
    const expected=match[3].toLowerCase()==='fail'
      ? {kind:'NONZERO_EXIT',origin:'EXPLICIT_ORIGINAL_REQUEST',source:{start:row.source_start,end:row.source_end}}
      : {kind:'EXIT_CODE',exit_code:0,origin:'EXPLICIT_ORIGINAL_REQUEST',source:{start:row.source_start,end:row.source_end}};
    if(selected.expected_result.origin==='EXPLICIT_ORIGINAL_REQUEST'
      && JSON.stringify({...selected.expected_result,source:null})!==JSON.stringify({...expected,source:null}))
      unresolved.push({source:{start:row.source_start,end:row.source_end},reason:'conflicting_expected_outcomes'});
    else selected.expected_result=expected;
  }
  if (unresolved.length) return finish('UNKNOWN','command_requirements_unresolved',[],unresolved);
  return finish(obligations.length?'RESOLVED':'NONE',obligations.length?'bounded_original_command_requirements':'no_current_command_request',obligations);
}

export function compileCommandIntentProjection(userText, { workspaceIdentityState = 'bound' } = {}) {
  const raw = String(userText || '').trim();
  const intent = raw ? normalizeAudhdIntent(raw) : null;
  const command_requirements = compileCommandRequirements(userText, {workspaceIdentityState});
  if (workspaceIdentityState !== 'bound') {
    return Object.freeze({ schema:AUDHD_COMMAND_POLICY_SCHEMA, allowWrite:false, allowTerminal:false, authority_granted:false, effect_ceiling:'NO_EFFECT_INTENT_PROJECTION_ONLY', reason:'session_workspace_identity_unbound', intent, command_requirements });
  }
  if (blanketToolRestraint(raw)) {
    return Object.freeze({ schema:AUDHD_COMMAND_POLICY_SCHEMA, allowWrite:false, allowTerminal:false, authority_granted:false, effect_ceiling:'NO_EFFECT_INTENT_PROJECTION_ONLY', reason:'user_blanket_restraint', intent, command_requirements });
  }
  const actions = classifyActions(intent?.current_instruction_clauses || []);
  return Object.freeze({
    schema:AUDHD_COMMAND_POLICY_SCHEMA,
    allowWrite:actions.positiveWrite > 0,
    allowTerminal:actions.positiveTerminal > 0,
    authority_granted:false,
    effect_ceiling:'NO_EFFECT_INTENT_PROJECTION_ONLY',
    reason:'current_turn_meaning_projection',
    intent,
    command_requirements,
    projection:Object.freeze({ rawPreserved:true, emphasisTokensAreAuthorityNeutral:true, scopedNegation:true, ...actions }),
  });
}
