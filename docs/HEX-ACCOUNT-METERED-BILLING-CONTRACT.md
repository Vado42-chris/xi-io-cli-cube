# XI-IO HEX Onboarding, Identity & Revenue: 5.5 Rebaseline Contract

**Canonical Reference:** HEX #26, Framework #1100, Framework #276, Framework #344, Framework #340, Studio #232, Switchboard #18, BINS #110.  
**Standard:** Independent Parallel Delivery Paths, Sovereign Customer Identity, and Deduplicated Contract Qualification.

---

## 1. Governing Principle: Parallel Independent Delivery Paths

**"Neither product should wait for the other to become usable."**

### Path A: Local HEX Installation (Independent Release Path)
- The standard Tauri window, installer UI, local provisioning, and first launch **must work without Loki, Aries, Switchboard, a cloud account, or a billing connection**.
- Sign-in remains **optional and skippable** (`Use locally` default).
- Local file editing, local Ollama execution, and local BINS version custody operate 100% offline.
- Existing OAuth accounts can supply provisioning data later from the same HEX window.

### Path B: Switchboard Infrastructure (Parallel Infrastructure Path)
- Provides authenticated remote execution, communication failover, BINS custody, and cross-machine synchronization.
- Its incomplete runtime **must not prevent customers from installing and using HEX locally**.
- Switchboard connectivity can be activated when qualified, without reinstalling HEX or changing the user's local data ownership.

---

## 2. The 7 Existing Owner Contracts

| Existing owner | Responsibility | Verified condition |
| :--- | :--- | :--- |
| **Framework #1100** | HEX native Tauri host and projected product recipes | Architecture documented, full runtime not qualified |
| **Framework #276** | UserPrincipal, Workspace, Membership and Grants | Lifecycle contracts exist |
| **Framework #344** | First-party enrolment, sessions, optional provider linking | Sovereign Loki auth service unverified |
| **Framework #340** | Commerce offers, payment evidence and entitlements | Commercial contract, not live payment proof |
| **Studio #232** | $20 Concierge and cancellation economics | Proposed pricing, economics not qualified |
| **Switchboard #18** | Provisioning communication and durable returns | Native execution and failover still open |
| **BINS #110** | Shared data/version custody and stale-write refusal | Physical concurrency qualification remains open |

*October 19 Identity Correction:* Explicitly supersedes the older Google-first onboarding flow. XI-IO identity comes first, optional provider linking comes later. Locally installed products must also work without signing in at all.

---

## 3. The 4-Tier HEX Installation Journey

1. **Install HEX:** Native installer verifies package provenance, establishes local installation identity, and opens the standard HEX window. No payment, cloud account, or external OAuth required.
2. **First-launch choices:**
   - **Use locally (Zero Account):** Open Studio and locally installed tools, work offline, use local Ollama and BINS storage. Sign-in remains optional and skippable.
   - **Create account / Sign in (Zero Payment):** Resolve an XI-IO principal, workspace, and grants through first-party authentication (OpenID Connect claims).
3. **Connect services when needed:** GitHub, Google, Microsoft, cloud storage, servers, and other providers are independent, revocable grants. Each connection identifies its actual scope and authority.
4. **Activate paid capabilities separately:** Show offer, currency, rate, usage denominator, spending limit, billing identity, and payer before payment or metered execution.

---

## 4. Illustrative $20 Concierge Unit Economics Model

*Disclaimer:* Illustrative CAD-equivalent scenario, not an actual forecast, approved pricing, or verified Stripe quote. Excludes fixed engineering costs, taxes, refunds, chargebacks, and acquisition.

### Baseline Financial Scenario (100 Paying Customers)
- Monthly price: **$20.00 / month**
- Monthly gross revenue: **$2,000.00**
- Payment processing (2.9% + $0.30 per payment): **$88.00**
- Support labor (15 min/cust = 25 hours @ $30/hour): **$750.00**
- Variable infrastructure ($2.00/cust): **$200.00**
- Contribution margin before overhead/tax: **$962.00 (48.1%)**

### Critical Sensitivity: Support Time
- At $30/hour, every additional 10 minutes of support per customer costs **$5.00/customer**.
- For 100 customers, that is **$500.00/month**.
- A $20 Concierge service cannot economically promise unlimited manual agent troubleshooting. Automation, self-service recovery, and native Switchboard matter commercially, not just technically.

---

## 5. Metered Usage Preauthorization Contract

Before dispatching paid cloud operations, the spending gate must evaluate the maximum authorized exposure:

$$C_{\text{reserved}} = Q_{\max} \times R + F$$

Where:
- $Q_{\max}$ = Maximum admitted usage units
- $R$ = Qualified rate per unit
- $F$ = Disclosed fixed charges

### Metering Invariants:
1. **Pre-Dispatch Reservation:** If $C_{\text{reserved}} + \text{accumulated} > \text{Budget Cap}$, the request is refused closed with `REFUSED_SPENDING_CAP_EXCEEDED` before execution begins.
2. **Idempotent Deduplication:** Every billable event carries an idempotency key `sha256(workspace + job + seq + input_hash)`. Retried network events return the cached receipt with $0 additional charge. A customer with a $10 cap must never receive a $14 bill due to network retries.
3. **Reconciliation & Unused Release:** Unused reserved capacity is atomically released back to the customer's budget upon job completion.

---

## 6. Single Qualification Traceability Matrix (Deduplicated)

The 27 matrix cells (3 Estates $\times$ 3 Provisioning states $\times$ 3 Truth states) and 27 listed hostile scenarios are reconciled into a single traceability matrix identifying:
- Unique test IDs
- Contract coverage
- Overlapping cases
- Required evidence
- Actual execution results

*Rule:* Do not advertise 54 independent tests without mapping and deduplicating overlapping coverage against actual contracts.

| Dimension | Three Required States |
| :--- | :--- |
| **Estate** | Platform, Customer Workspace, Device |
| **Provisioning** | Grant, Correlation/ACK, Installation |
| **Truth** | Local observation, Cloud observation, Reconciliation |

---

## 7. Ordered Implementation Priority

| Priority | Deliverable | Exact Proof |
| :--- | :--- | :--- |
| **P0** | CLI and Switchboard connection to Loki/Aries | Cloud request $\to$ authorized host operation $\to$ BINS byte readback $\to$ original Work return |
| **P0** | BINS ResourceVersion CAS | Two competing writes, exactly one accepted, stale writer refused (HTTP 409) |
| **P1** | HEX local-only first launch | Fresh install, no account, no payment, offline project open/reopen |
| **P1** | Sovereign XI-IO account | Principal/workspace persisted, authenticated own read, foreign 403, revocation |
| **P1** | Optional provider linking | Link/unlink preserves XI-IO identity and local data |
| **P2** | Commerce and entitlements | Payment TEST receipt, one entitlement, cancellation preserves base features |
| **P2** | Metered execution | Atomic budget reservation, duplicate retry charged once, cap enforced |
| **P2** | Concierge economics | Actual per-customer support minutes, infrastructure spend and contribution margin |

### Non-Reopenable Invariants:
1. **HEX owns the native window.**
2. **Commerce owns billing semantics independently of Stripe.**
