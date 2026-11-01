# Existing-owner reconciliation: Framework PR #1403

Observed 2026-11-01 06:11 UTC. This addendum prevents duplicate implementation of the prepared Ibal/Zed packet. It does not dispatch a new task.

Owner: Vado42-chris/xi-io.net PR #1403
Branch: fix/zed-ibal-local-work-front-door-20261101
Inspected head: 0e34d18da88110f9eba1f3eeef47b684debcb989
Base: f992d96e0f3fb27e5040aaad7433389cf516f218
Status when inspected: OPEN, DRAFT, not merged. Source review only; no tests or Aries inspection performed in this check.

## Reuse work already present

The diff adds installed-agent candidate resolution and explicit agent/model settings. installAndConfigure no longer installs the Cursor plugin and makes Cursor status diagnostic-only. Do not assign a second implementation of those changes. Preserve the existing owner's branch and reconcile its final returned revision before consuming.

## Remaining source concerns at this exact head

1. XIIO_IBAL_PIN_SHA is read and reported as frozen_pin_sha, but resolveIbalAgent does not validate installed bytes/revision against it. An explicit agent path is checked only for existence. A printed pin is not integrity enforcement.
2. If EXPLICIT_MODEL is unavailable, ollamaInventory falls through to nemotron or another listed model instead of reporting the unavailable selected model. Prefix matching can select a candidate string different from the actual model name. Qualify exact configured selection and explicit fallback policy separately.
3. Without an explicit path, the historical ibal-acp-001a root precedes other discovered roots. First existing path does not establish current qualified generation.
4. Generated configuration changes IBAL_ACP_STATE_DIR from ibal-acp-001a to ibal-acp. No migration/adoption of prior session state is included in this two-file diff. Preserve the user's existing state path or supply an explicit qualified migration before claiming continuity.
5. Ollama endpoint remains fixed to loopback :11434 in inventory and emitted configuration. Do not silently overwrite an existing authorized user-selected endpoint.
6. Existing replay scripts/run-r3-zed-ledger-tool-topology-replay.mjs is not changed in this PR diff. The prepared packet's Cursor-readiness predicate mismatch and top-level configureZedIbal settings mutation therefore remain outside this change.
7. New validator coverage is source-regex assertions and hand-built Boolean cases, not execution of resolver/model/configuration behavior. Runtime cases remain required in disposable HOME/config.
8. DEFAULT_LOCAL_AGENT_REF is attribution only. The PR correctly says it grants no CRM/Ward authority; retain that boundary.

## Routing

Keep these items with the PR #1403 owner. Do not redirect the current worker/HEX executor or start another Zed implementation. At its final Result, use actual installed worker interfaces and this owner's reconciled candidate for the staged Ibal/Zed consumer payload. No regular third-party settings/profile/session mutation by an agent; Chris performs that action. Offline consumer qualification does not require production BINS activation.

Framework PR #1402 is a separate existing-owner dependency lead. Its earlier NOT ENFORCED audit and later repair notifications must not be used as current installed enforcement without checking the relevant returned code and evidence. It is not a new task in this packet.
