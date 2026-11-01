# Original-requester cloud backbeat: prepared consumer boundary

Prepared 2026-11-01T13:09Z following Chris's explicit correction that the local return bridge to this cloud conversation was never qualified. Planning artifact only. No listener, credential, event subscription, runtime deployment or ACK was created.

## Existing ownership and scope
Root: LEGAL_SITES_CORDFREE_V1, Framework #1404.
Work: aab28cae-92af-47eb-bdf9-4b260422acae.
Local receiver ACK remains separately owned by Inbox #491 / Ibal #193. Framework #516 is the existing subscription ABI lead. Switchboard PR #73 head8505a47a821ecb2192e8e0c04ace9f0432a7fbdf provides proposed native transport; PR #72 head3d61057678a89074ea3c917448c7c71078a9dc40 provides bounded verified result bytes to the original authenticated requester. Neither proves a cloud chat wake.

This file does not replace current local execution or reopen closed Work-bound dispatch. It defines the missing distinct consumer test and fields to carry using existing schemas, not a new dispatcher, mailbox, authority plane or result schema.

## Required boundary
1. Retain original requester/client/conversation reference, request ID, Work/WA/Attempt/generation and result return target under existing identity/privacy contracts. A conversation ID is a destination hint, not authentication.
2. Commit local result through existing custody before any notification. Bind coordinate/version/digest/size and result identity. No full transcript or private document in a notification.
3. Resolve a supported authorized external receiver and its actual event trigger. An HTTP route returning success, GitHub publication, local AI-Mail send or typed local ACK is not evidence that this cloud receiver was woken.
4. Cloud receiver independently retrieves authorized immutable result bytes and validates Work/generation/request/result binding. Preserve uncertainty or inaccessible content as WAIT, not acceptance.
5. Return a receiver-specific ACK via the existing transport, tied to exact result identity and authenticated receiver. Local consumer validates it independently; do not reuse bridge registration or another seat's ACK.
6. Retry notification idempotently after loss/restart, without repeating completed effects. Local authorized work must continue when cloud planning is absent. Cloud continuation never expands local authority.

## Verified platform discovery, not activation
The connected event-source catalog exposes GitHub/Gmail/Slack and other source listings. GitHub webhook schema supports PR-scoped new comments, commit updates and reviews. The execution guidance limits comment/review wakes to human-created events; arbitrary automated XI-IO comments and arbitrary local HTTP callbacks are not verified supported wake sources. No webhook was created. Do not silently substitute periodic polling for a push/subscription claim or add a paid runtime dependency.

## Acceptance / hostiles
Use a single nonprivate result in existing admitted local custody. Prove actual subscribed cloud delivery, exact byte readback, authenticated cloud ACK and local ACK consumption without Chris pasting. Test cloud offline, lost notification, duplicate notification, lost ACK, wrong receiver, wrong Work, stale generation, changed bytes, revoked disclosure and consumer restart. Preserve raw result and independent receiver receipts. No simulated receiver or manual GitHub intake may satisfy the cloud wake cell.

## Unresolved prerequisite
A supported authenticated XI-IO-to-this-cloud-client receiver/wake adapter is not verified. The runtime-specific destination, callback registration and ACK implementation must be resolved through existing supported integration surfaces. Do not fabricate a callback URL, export session secrets, grant new access, or mark an adapter available merely because source documentation names it. Any new persistent access requires Chris's specific authorization.

## Ownership of next action
Existing cloud ingress/subscription and local return owners resolve this boundary. Prepare against current owner Result; do not send a competing executor prompt. Main local Work receiver-ACK repair continues independently. This cloud return supports optional external planning; it must not become necessary to finish local cord-free jobs.
