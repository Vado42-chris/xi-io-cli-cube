# Native HEX Plugins: first-party account reader (2026-10-28)

**Owner:** existing Cube #27 native Plugins consumer. **Donors:** framework #1380 `engines/identity/onboarding-current.mjs`, SDK #207 `src/identity/onboarding-current.mjs`, HEX #1398 `onboarding-current-owner.mjs`, @ibal #205 Account page. This is a read-only consumer, not an identity producer, consent or Work/Ward admission.

## What changes

The existing bundled Tauri HEX window exposes `native_plugin_onboarding_current` as a read-only native command, called by its existing Plugins panel. It reads only the fixed local HEX route `http://127.0.0.1:8798/v1/onboarding/current`. There is no selected URL, internet request, stored credential, Unix socket resolver, additional desktop/window or service creation.

The native Tauri process has no XI-IO browser cookie or current first-party bearer. It sends none, and refuses to promote an unsolicited 200/signed-in response into native identity. Only properly shaped `OWNER_SIGNIN_REQUIRED` (native unauthenticated context) or `AUTHORITY_UNAVAILABLE` (owner unavailable/invalid) results are surfaced. The panel says a separate browser may still be signed in; that is not proof of shared login. Even on a successful API response, the native panel never changes consent, services, provisioning, Ward or Work status.

The view refuses response fields outside an exact allowlist. Malformed, oversized, privileged or unsolicited signed-in status is not promoted. Stale status is cleared before refresh and native plugin receipt failures do not trap the UI in busy state. The existing provider browser link is only a handoff attempt, not user sign-in, and remains under its prior owner.

## Acceptance and ownership boundaries

Source-level checks: `node --test tests/hex-plugin-catalog.test.mjs tests/native-plugin-ui-contract.test.mjs`; `npm run lint`; `npm run build`. Native Rust owner tests: `cargo test` from the existing Tauri carrier, including signed-out, owner unavailable, malformed/oversized, forged status, and no credentials on the loopback request. Same-generation and actually installed window readback still require independent physical evidence. Source qualification is NOT installed-consumer acceptance.

For authenticated native owner account state, the framework's existing first-party auth/session owner must supply a reviewed, current browser-to-native handoff with device ownership and revocation. Until then this native reader cannot identify a signed-in principal, show account profiles, or operate remotely. `connection_choice`, consent, service discovery and provisioning remain unselected/ungranted. Do not fake identity from local HEX/SSH, an OAuth token, a status flag, a metadata receipt, or a selected workspace.

### Local busy-state bug

Cube #27 previously returned early when `native_plugin_inspect` returned a malformed local receipt after `setBusy(true)`, before reaching its later `finally { setBusy(false) }`. The repair removes that early return and adds `createNativePluginOperationLifecycle`, a latest-owner busy-state primitive. The Plugins UI now bounds each async refresh to its generation, discards stale/late responses, releases busy after success, rejection or exception, releases busy on explicit cancellation and avoids React state writes after unmount. Eight executable Node regressions test all these outcomes. This is one **confirmed Plugins consumer** defect, not evidence that other products' handlers are broken. The common pattern (begin busy -> success/error/denial/cancel/stale -> guaranteed release) is a reusable SDK contract candidate and should be investigated by the owner of those other consumers. Preserve separate evidence for Publisher/Desktop/Articles; do not infer a shared defect.

## Scope / no competing owner

This change touches only Cube #27's native Plugins consumer and its exact Tauri boundary. It does not edit HEX #1398's account API, framework #1380 issuer, SDK #207 consumer, Ibal #205 Account page or the maths kernel path. The separate maths and packaging agent retains exact source/build/installed-window acceptance. No broad installer is triggered or changed.
