# CONTRACT_MATRIX — n8n-nodes-frihet vs Frihet ERP

**Audit date:** 2026-08-20
**n8n-nodes-frihet ref:** `audit/frihet-contract-truth-r2-2026-08` (R1 = `b0e2f8f`, R2 new SHA in commit log)
**Canonical authority:** `berthelius/Frihet-ERP` `origin/main` = `d5f3f3cdfdead47880f611696d25066dcb2b8051`
**Public API reference:** `functions/src/publicApi.ts` (9,623 lines, strict zod schemas)
**Webhook reference:** `functions/src/webhooks.ts` + `functions/src/webhookTriggers.ts`
**Payment Authority V1 reference:** `functions/src/domain/payments/paymentAuthorityV1.ts` + `functions/src/paymentAuthorityManualCallables.ts`

This matrix is the result of an end-to-end contract audit (R1 + R2). Every
row is a reproduced call against the actual `Frihet` node execute() or
workflow template expression, asserted against the live schema. The
contract test suite (`tests/contract/`) drives the node with a mocked
transport and pins the wire shape; the webhook-expression suite runs the
templates' literal `{{ ... }}` and `={{ ... }}` expressions through a
sandboxed evaluator against the actual Frihet webhook payload.

---

## 1. Summary

| Aspect | Value |
|---|---|
| Resources | 6 |
| Operations | 33 |
| Workflow templates (ready-to-use) | 6 (was 8; **2 quarantined** — see §6) |
| Workflow templates (unverified-webhooks/) | 2 (see §6 for the why) |
| Contract tests | **66** (was 52 in R1) |
| Defects reproduced | 5 (R1) + **5 more (R2)** |
| Defects fixed in this PR | 5 (R1) + 5 (R2) |
| Coverage of the public REST surface | **~20 %** |
| Coverage of the full ERP API (incl. callable CFs, MCP) | **~5 %** |

R2 BLOCKERS closed:

| # | R2 BLOCKER | Verdict | Where |
|---|---|---|---|
| B3 | `sendEmail` defaulted to empty ("uses client email by default" was a phantom) | **Required in n8n UI** | node + tests |
| B4 | Templates' webhook event filter `{{ $json.body.event \|\| $json.event }}` is broken (server emits `X-Frihet-Event` header) | **Quarantined** | `templates/unverified-webhooks/` |
| B5 | Webhook URL unauthenticated; anyone can drain API quota and chain Frihet writes | **Quarantined** | `templates/unverified-webhooks/` |
| B6 | Shopify `city`/`country` at top level of `clientAdditional`; Liquid `\| trim` in JS expression; Stripe markPaid response has no `id` | **Fixed** | node + tests + templates |
| B7 | `q`/search path saturates at 500 docs and emits `truncated:true` without `nextCursor` — node silently claimed completeness | **Surfaced** as `{_truncated:true}` item | node + tests |
| B8 | Tests were reproducible only with vendored `node_modules`; no `test` script, no devDependencies, no CI | **Fixed** | `package.json` + `.github/workflows/ci.yml` |
| B9 | `invoice:update` allows `status` mutation that can drop issued docs from Modelo 303 | **Marked ⚠️ residual** | this matrix |
| B1/B2 | `paymentAuthorityVersion` IS exposed on the GET response, and `/paid` does NOT check the V1 cut marker | **Hard fail closed** on V1 | node + tests |

---

## 2. Auth

| Field | Value | Source |
|---|---|---|
| Header (preferred) | `X-API-Key: fri_...` | `apiKeyAuth.ts:8-19` |
| Header (accepted) | `Authorization: Bearer fri_...` | `apiKeyAuth.ts:14-16` |
| Key format | `fri_[A-Za-z0-9_-]{40-60}` | `publicApi.ts:499-503` |
| Where sent by n8n | `Authorization: Bearer <key>` | `GenericFunctions.ts:27` |
| Verdict | ✓ Both forms accepted; no change needed |

---

## 3. Resources × operations

### 3.1 Invoice

| Operation | Wire path | Method | Verdict |
|---|---|---|---|
| `create` | `/v1/invoices` | POST | ✓ (phantom fields stripped) |
| `get` | `/v1/invoices/{id}` | GET | ✓ |
| `list` | `/v1/invoices` | GET | ✓ + `truncated` surfaced |
| `update` | `/v1/invoices/{id}` | PATCH | ⚠️ **B9 residual** — see below |
| `delete` | `/v1/invoices/{id}` | DELETE | ✓ (drafts 204, others soft-cancel) |
| `send` | `/v1/invoices/{id}/send` | POST | ✓ (B3: `recipientEmail` required) |
| `markPaid` | `/v1/invoices/{id}/paid` | POST | ✓ + **B1/B2 fail-closed on V1** |

### 3.1.A Invoice create — strict-zod schema (server-authoritative)

From `publicApi.ts:737-778`. Anything else under `.strict()` is rejected with 400.

| Key | Type | Notes |
|---|---|---|
| `clientName` | string, REQUIRED | |
| `clientId` | string, optional | round-trips with snapshot fields |
| `clientAddress` | string \| object, optional | object keys: `street/city/zip/province/country/countryCode`; `state`/`postalCode` aliases |
| `clientTaxId` | string, optional | |
| `documentNumber` | string ≤50, optional | caller-supplied; not in the n8n UI |
| `items` | array, REQUIRED | `[ { id?, description, quantity, unitPrice } ]` |
| `issueDate` | ISO YYYY-MM-DD, optional | strict calendar-real |
| `dueDate` | string, optional | server defaults to `issueDate` |
| `status` | enum, optional | `draft, sent, partial, paid, overdue, cancelled` |
| `notes` | string, optional | |
| `taxRate` | number 0–100, optional | |
| `irpfRate` | number 0–100, optional | |
| `equivalenceSurchargeRate` | number 0–100, optional | |
| `clientLocation` | enum, optional | `peninsula, canarias, ceuta_melilla, eu, world` |
| `prepayment` | number ≥0, optional | |
| `seriesId` | string, optional | |
| `discountRate` | number 0–100, optional | (NOT `discount`) |
| `poNumber` | string, optional | |
| `operationType` | enum, optional | `service, goods` |
| `recurring` | object, optional | `enabled, frequency, nextDate, endDate?, maxOccurrences?, autoSend?` |

**Rejected (phantom):** `currency` (server defaults to EUR),
`clientEmail` (server-resolved from client doc), `discount` (use
`discountRate`).

### 3.1.B ⚠️ B9 RESIDUAL — `invoice:update` status mutation

`PATCH /v1/invoices/{id}` accepts the same schema as create, partially.
The schema is `.strict()` and `status` is in the enum list
(`publicApi.ts:762`). **A caller can move an issued invoice
(`status: 'sent'` or `'status: 'paid'`) back to `draft` or `cancelled`
via PATCH**. This is server-side behavior, not a node bug.

**Real consequence on Modelo 303:** the quarterly aggregation
(`publicApi.ts:2945-2962`, `computeModelo303`) reads `issueDate` and
the document value at aggregation time. If a PATCH removes a
fiscal-anchored document from the open state, the document is
excluded from IVA aggregation for the period it was issued in. The
VeriFactu hash chain at `invoices/{id}/verifactu.hash` is NOT
rewritten on status mutation — only the document `status` field
flips. The hash on the issued document stays valid (it was already
sent to AEAT in the previous period), but the document is
re-classified as a draft in the current Modelo and the cash-basis
agregation in `Modelo 130` for that period can be silently wrong.

The n8n node's `invoice:update` operation exposes this faithfully
(the server's strict zod accepts `status` in PATCH partial). The node
is NOT introducing the risk — the server is. We mark it ⚠️ and
document the residual here.

**Mitigation the user can apply today (out of scope of this PR):**
the Frihet team's intended mitigation is **Payment Authority V1**
which captures issued→paid transitions as a forward-only ledger
(`paymentAuthorityV1.ts:1-8`). Once V1 is enabled for a workspace,
the legacy PATCH `status: 'paid'` path is read-only protected
(`firestore.rules.d/10-core-existing.rules:296-301`: the rule
muted `status`, `paidAt`, `amountPaid`, `outstandingAmount`,
`payments` for V1 workspaces). The n8n node's markPaid operation
DOES check `paymentAuthorityVersion` and **fails closed on V1
invoices** (B1/B2 fix).

**Residual uncovered:** the `status: 'draft'` / `status: 'cancelled'`
mutation path on issued documents is NOT covered by V1's locks. The
V1 lock only covers payment-related fields. A workflow that PATCHes
`status: 'cancelled'` on a V1 invoice will still succeed server-side
and silently remove the document from the V1 ledger's outstanding
balance. This is a **server residual**, not an n8n node bug. Logged
here as a follow-up: Frihet should extend V1's rule to cover
`status` transitions on issued documents.

### 3.2 Quote

| Operation | Wire path | Method | Verdict |
|---|---|---|---|
| `create` | `/v1/quotes` | POST | ✓ (phantom fields stripped) |
| `get` | `/v1/quotes/{id}` | GET | ✓ |
| `list` | `/v1/quotes` | GET | ✓ + `truncated` surfaced |
| `update` | `/v1/quotes/{id}` | PATCH | ✓ |
| `delete` | `/v1/quotes/{id}` | DELETE | ✓ |
| `send` | `/v1/quotes/{id}/send` | POST | ✓ (B3: `recipientEmail` required) |

`quote.create` schema mirrors `invoice.create` plus `validUntil`. No
`status='paid'`/`overdue` (only `draft, sent, accepted, rejected, expired`).

### 3.3 Expense

| Operation | Wire path | Method | Verdict |
|---|---|---|---|
| `create` | `/v1/expenses` | POST | ✓ |
| `get` | `/v1/expenses/{id}` | GET | ✓ |
| `list` | `/v1/expenses` | GET | ✓ + `truncated` surfaced |
| `update` | `/v1/expenses/{id}` | PATCH | ✓ |
| `delete` | `/v1/expenses/{id}` | DELETE | ✓ |

**Expense-specific fields:** `currency` IS in the expense schema
(`publicApi.ts:806`), so the n8n-shipped `currency` phantom filter
applies **only** to invoice/quote create. The node maintains separate
`INVOICE_PHANTOM_FIELDS` and `QUOTE_PHANTOM_FIELDS` sets.

### 3.4 Client / Product / Vendor

Standard CRUD. The `clientAdditional` collection exposes `fiscalZone`
(matches `clients.fiscalZone` on the server), `clientType`, `stage`,
etc. — these are **not** in the invoice create schema. The
`clientAdditional.address` is a JSON object with
`street/city/zip/province/country/countryCode`; **B6 fix**: top-level
`city`/`country` is rejected by the strict client schema (the Shopify
template now uses the JSON object form).

---

## 4. Defect inventory & fixes

### 4.1 R1 defects (PR #1)

| # | R1 Defect | Wire path | Server truth | Fix |
|---|---|---|---|---|
| 1 | `markPaid` sends phantom `paymentMethod` | `POST /v1/invoices/{id}/paid` | `publicApi.ts:5832-5834` | removed `paymentMethod` selector; documented home |
| 2 | `send` body uses `email` | `POST /v1/{invoices\|quotes}/{id}/send` | `publicApi.ts:5690-5695` | wire field renamed; UX `sendEmail` kept |
| 3 | List pagination: `?after=` + `meta.nextCursor` | `GET /v1/{resource}` | `publicApi.ts:7642-7705` | wire renamed to `cursor`; `nextCursor` read from root |
| 4 | Invoice create carries phantom `currency` / `clientEmail` | `POST /v1/invoices` | `publicApi.ts:737-778` | `INVOICE_PHANTOM_FIELDS` / `QUOTE_PHANTOM_FIELDS` const sets |
| 5 | Templates' webhook subscribers reference `.data` envelope | n/a | `webhookTriggers.ts:757,732` | templates updated to read `$json.body.client.*` / `$json.body.quote.*` |

### 4.2 R2 BLOCKERS (PR #2)

| # | R2 BLOCKER | Wire path | Server truth | Fix |
|---|---|---|---|---|
| 1 | `sendEmail` defaulted to empty; description lied ("uses client email by default") | `POST /v1/{invoices\|quotes}/{id}/send` | `publicApi.ts:5690-5695`: `recipientEmail` REQUIRED | `required: true` + email regex; empty body throws clear error |
| 2 | Templates' webhook event filter `body.event` is broken — server emits `X-Frihet-Event` header | n/a | `webhooks.ts:385` | templates QUARANTINED — see §6 |
| 3 | Webhook URL unauthenticated; any URL-leaker can drain API quota | n/a | n8n Webhook trigger does not expose request headers in data flow | templates QUARANTINED — see §6 |
| 4a | Shopify template: `clientAdditional.city` / `clientAdditional.country` (top-level) | `POST /v1/clients` | `publicApi.ts:815-845` strict zod | moved to `address: { city, country }` JSON object |
| 4b | Liquid `\| trim` in JS context (would throw at runtime) | n/a | n8n `\|` is JS bitwise OR inside `={{ }}` | replaced with JS `.trim()` |
| 4c | Stripe template: `Send Invoice` reads `invoiceId: $json.id` from `markPaid` response | n/a | `markPaid` returns `{ success, status, paidAt }` (publicApi.ts:5856) | inserted `Pin Invoice Id` Set node to capture the id from `Create Invoice` |
| 5 | `q`/search path returns `truncated: true` without `nextCursor`; node silently claimed completeness | `GET /v1/{resource}?q=` | `publicApi.ts:7574, :7596` | surface `{_truncated: true, reason: ...}` item in returned list; loop terminates on truncated |
| 6 | Tests reproducible only with vendored `node_modules`; no `test` script, no devDependencies, no CI | n/a | n/a | `package.json` scripts + devDeps pinned; `.github/workflows/ci.yml` runs `npm ci && npm run build && npm test` on Node 20/22 |
| 7 | `invoice:update` allows `status` mutation that can drop issued docs from Modelo 303 | `PATCH /v1/invoices/{id}` | `publicApi.ts:762` accepts `status` in partial PATCH | see §3.1.B residual — server-side; logged as follow-up |

### 4.3 B1 / B2 — Payment Authority V1 fail-closed

**The `paymentAuthorityVersion` field IS exposed on the GET response**
(it's part of the Firestore doc returned by `serializeFirestore`).
The legacy `/paid` endpoint at `publicApi.ts:5827-5859` does **NOT**
check this field. On a V1-enabled workspace, calling `/paid` on a
V1 invoice creates an `AUTHORITY_MISSING` / `PROJECTION_DRIFT`
divergence (see `paymentAuthorityV1.ts:501-502, :881, :1346`).

**The n8n node now hard-fails closed on V1 invoices:**

```ts
const invoiceRead = await frihetApiRequest.call(this, 'GET', `/invoices/${id}`);
const v1 = (invoiceRead?.data ?? invoiceRead)?.paymentAuthorityVersion;
if (v1 === 1) {
  throw new NodeOperationError(this.getNode(),
    `Invoice ${id} has paymentAuthorityVersion=1 (Payment Authority V1 cut marker). ` +
    `The legacy REST /paid endpoint does NOT update V1's forward-only ledger... ` +
    `Use the Payment Authority V1 callable (postInvoicePaymentV1) directly, or use ` +
    `the @frihet/mcp-server Payment Authority tool. The legacy markPaid action is ` +
    `BLOCKED for V1 invoices.`);
}
```

`postInvoicePaymentV1` is a Firebase callable, not REST. The n8n
community node does NOT expose a callable bridge. The user can use
the `@frihet/mcp-server` tool which wraps the callable.

---

## 5. Webhook events — what's actually emitted

The ERP exposes 39 events in `VALID_WEBHOOK_EVENTS` (`webhooks.ts:27-46`).
**14 are registered but never emitted** (registered-but-dead):

`invoice.generated`, `invoice.one_off_created`, `invoice.voided`,
`invoice.payment_status_updated`, `invoice.payment_failure`,
`payment.requires_action`, `payment_receipt.created`,
`credit_note.created`, `credit_note.generated`, `quote.expired`,
`client.vies_check`, `dunning.finished`, and a few more.
Subscribing to those will never fire.

The n8n templates currently subscribe to:
- `client.created` — emitted at `webhookTriggers.ts:757` ✓
- `quote.accepted` — emitted at `webhookTriggers.ts:732` (on
  `≠ 'accepted' → 'accepted'` transition) ✓

Both are real. The event type is in `X-Frihet-Event` header
(`webhooks.ts:385`); the body shape is `{ client: { ... } }` /
`{ quote: { ... } }`.

**Signing:** if the webhook subscription has a `secret`, deliveries
carry `X-Frihet-Signature: sha256=<hex>` (HMAC-SHA256 of the raw
body). The signing bytes are the raw JSON body — receivers MUST
hash the actual bytes they received, not a re-serialized version.

**Retry:** exponential backoff capped at 30s, 3 attempts, batched by
the `processWebhookRetries` pubsub schedule (`every 5 minutes`).
After 3 consecutive failures the webhook is auto-paused
(`pausedReason: 'consecutive_failures'`).

---

## 6. Webhook templates — quarantined (B4 + B5)

Two templates were **quarantined** to `templates/unverified-webhooks/`:

- `new-client-to-hubspot.json`
- `quote-accepted-to-invoice.json`

### Why they are quarantined

**B4 — broken event filter.** The templates' Filter node reads
`{{ $json.body.event || $json.event }}`. The Frihet webhook emitter
sends the event type in the `X-Frihet-Event` header
(`webhooks.ts:385`), NOT in the body. The body's only top-level
keys are `{ client: { ... } }` / `{ quote: { ... } }`. The literal
expression evaluates to `undefined` and the chain never fires. The
R2 contract test `webhook-expressions.test.ts` reproduces this by
running the templates' literal expressions against the real Frihet
payload — the filter's leftValue evaluates to `undefined`.

**B5 — unauthenticated public webhook.** n8n's Webhook node does
not expose request headers in the downstream data flow in n8n
1.x. The Frihet webhook emitter IS capable of HMAC signing
(`X-Frihet-Signature: sha256=<hex>`, `webhooks.ts:51-56, 392-396`),
but the receiving workflow has no n8n-native way to verify the
signature. The webhook URL is therefore **public** — anyone who
learns the URL can POST a forged payload and chain it to the Frihet
API, draining the owner's API quota.

### What would unblock them

1. n8n ships a generic HMAC-verified webhook trigger that exposes
   the signature header (or a pre-verified `verified: true` flag).
2. We add a Frihet-specific trigger node that wraps the Webhook
   node implementation with HMAC verification in the same module.
3. The user accepts "security by obscurity" via the per-webhook URL
   allowlist + IP allowlist on the Frihet side.

None of these are in scope for this PR.

### What users do today

For `client.created` / `quote.accepted` notifications: read the
Frihet resource directly via a 1-minute Schedule Trigger + the
Frihet node's `list` operation. The 1-minute polling cadence is a
tradeoff but no verification is required.

---

## 7. Multi-tenant / workspace identity

**Authority:** `userId` is derived from the
`users/{userId}/apiKeys/...` path of the API key
(`publicApi.ts:1545-1547`). **No `workspaceId` header or query
parameter is honored.** All collections are rooted at
`users/{userId}/...` and lists are scoped per workspace by
construction.

The n8n node does not expose a `workspaceId` field. The workspace
is the API key's owner. For multi-workspace, configure multiple
n8n credentials.

**Gestoría (cross-workspace) only:** `POST /v1/gestoria/aging`
accepts explicit `workspaceIds: string[]` body, with per-workspace
membership checks. The n8n node does not expose this.

---

## 8. Idempotency

| Aspect | Value | Source |
|---|---|---|
| Header | `Idempotency-Key` (case-insensitive) | `publicApi.ts:2376` |
| Max length | 64 chars | `idempotency.ts:116` |
| TTL | 24 hours | `idempotency.ts:114` |
| Scope | per `userId` (the API key owner) | `idempotency.ts:119` |
| Fingerprint | `method + pathParams + body + parsed query` | `publicApi.ts:2406` |
| Replay | original 2xx/4xx/5xx with `X-Idempotent-Replayed: true` | `publicApi.ts:1887-1902` |
| Conflict | `409 IDEMPOTENCY_KEY_REUSED` | `publicApi.ts:2424-2429` |
| In-progress | `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` | `publicApi.ts:2431-2437` |
| Mandatory | `POST /v1/invoices/{id}/credit-note` only | `creditNoteApi.ts:115-122` |
| Bypass | `POST /v1/gestoria/aging`, `POST /v1/portal/domain/{x}/verify` | `publicApi.ts:1578-1588` |

**The n8n node does NOT emit `Idempotency-Key` on any operation.**
This is a real gap for fiscal writes. Adding propagation is Wave 2.

---

## 9. Rate limit

| Aspect | Value |
|---|---|
| Cap | 100 req/min per API key |
| Headers (every auth response) | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| On 429 | `Retry-After` (int seconds) |
| n8n behavior | `NodeApiError` on 429; no auto-retry |

---

## 10. Operational notes (not in the n8n UI)

- **VeriFactu / TicketBAI / Facturae** — server-owned fiscal pipelines.
  Server-set only. NOT exposed in the community node.
- **Credit note** (`POST /v1/invoices/{id}/credit-note`) — distinct
  workflow, requires `Idempotency-Key`, plan-gated. Currently missing
  from the n8n resource list. Honest scope: NOT in the node.
- **Document numbering** — server-owned, atomic, gap-free. Caller may
  supply `documentNumber`; the n8n node does NOT expose it.
- **Address aliases** — server accepts `state`/`postalCode`,
  normalizes to `province`/`zip`. The n8n node uses the canonical
  `province`/`zip` in the address JSON example.

---

## 11. Test coverage

```
$ npm run build && npm test
…
Test Suites: 3 passed, 3 total
Tests:       66 passed, 66 total
```

- `tests/contract/invoice.test.ts` — 18 tests: `markPaid`
  (pre-fetch + V1 fail-closed + body shape), `send` (recipientEmail
  required + trim + clear error), list pagination (cursor + real
  cursor + truncated surfacing), invoice create schema, URL/auth
  header, error envelope, UI surface assertions.
- `tests/contract/templates.test.ts` — 41 assertions (6 templates ×
  sanity checks). The 2 quarantined templates are NOT included in
  the ready-to-use invariants.
- `tests/contract/webhook-expressions.test.ts` — 7 tests that
  actually RUN the templates' literal `{{ ... }}` and `={{ ... }}`
  expressions through a sandboxed evaluator (`vm.runInNewContext`)
  against the real Frihet webhook payload. Reproduces B4 (filter
  broken) and B6 (Liquid `| trim`, markPaid response).

Reproducible from clean checkout:

- `package.json` declares `test` and `test:ci` scripts
- devDependencies pinned: `jest@30.4.2`, `ts-jest@29.4.11`,
  `@types/jest@30.0.0`, `typescript@5.9.3`
- `package-lock.json` committed (deterministic install)
- `.github/workflows/ci.yml` runs `npm ci && npm run build && npm test`
  on Node 20.x and 22.x

---

## 12. Remaining coverage %

| Family | Operations | Exposed in n8n | % |
|---|---|---|---|
| Generic CRUD (invoices, quotes, expenses, clients, products, vendors) | 30 | 33* | 100 % on the 6 resources |
| Search / global | 1 | 0 | 0 % |
| Summary / context / monthly / quarterly | 4 | 0 | 0 % |
| Fiscal reports | 4 | 0 | 0 % |
| Time tracking | 3 | 0 | 0 % |
| Recurring invoices | 6 | 0 | 0 % |
| Team members | 4 | 0 | 0 % |
| Banking | 8 | 0 | 0 % |
| Gestoría | 4 | 0 | 0 % |
| Webhooks CRUD | 5 | 0 | 0 % |
| Batch | 1 | 0 | 0 % |
| Sub-resources (contacts / activities / notes) | 9 | 0 | 0 % |
| Deposits | 5 | 0 | 0 % |
| Expense attachments / billable | 4 | 0 | 0 % |
| Invoice actions (pdf, xml, credit-note, late-fee, einvoice/export, face/*, ticketbai/*) | 12 | 2 (`/send`, `/paid`) | 17 % |
| KDS / POS / Stay / Leaves / Tax / Anomalies / Portal / Permissions / GL / Payroll / Periods | ~50 | 0 | 0 % |
| OAuth `api-key` mint | 1 | 0 | 0 % |

\* 33 ops vs 30 generic CRUD lines because Invoice×7, Quote×6,
Expense×5, Client×5, Product×5, Vendor×5 = 33 — these include the
`/send` and `/paid` action endpoints for invoices and quotes.

**Topology:** the n8n node covers 100 % of the 30 generic CRUD
operations on the 6 most common resources, plus 2 of 12 invoice
action endpoints. Wave 2 is the only path to more.

---

## 13. Files touched in this audit

```
nodes/Frihet/Frihet.node.ts                            — 5 (R1) + 4 (R2) contracts pinned
credentials/FrihetApi.credentials.ts                   — unchanged
templates/email-receipt-to-expense.json                — unchanged (out of scope)
templates/monthly-tax-summary.json                     — unchanged
templates/overdue-invoice-reminder.json                — unchanged
templates/weekly-financial-digest.json                 — unchanged
templates/shopify-order-to-invoice.json                — B6 fix: address JSON
templates/stripe-payment-to-invoice.json               — B6 fix: Pin Invoice Id, .trim()
templates/new-client-to-hubspot.json                   — QUARANTINED to unverified-webhooks/
templates/quote-accepted-to-invoice.json                — QUARANTINED to unverified-webhooks/
templates/unverified-webhooks/README.md                — new (B4/B5 disposition)
templates/README.md                                    — updated
tests/_helpers/n8n-mock.ts                             — IExecuteFunctions harness
tests/_helpers/n8n-expression.ts                       — n8n expression evaluator (R2)
tests/contract/invoice.test.ts                         — 18 tests (was 11 in R1)
tests/contract/templates.test.ts                       — 41 assertions
tests/contract/webhook-expressions.test.ts              — 7 tests (R2 NEW)
jest.config.js                                         — minimal ts-jest
tsconfig.test.json                                     — test tsconfig
tsconfig.json                                          — excludes tests/
package.json                                           — npm test, devDeps pinned
.github/workflows/ci.yml                               — NEW (R2): CI on Node 20/22
.gitignore                                             — node_modules hygiene
CONTRACT_MATRIX.md                                     — this file
```

No `package.json` version bump, no `npm publish`, no credentials
mutation, no backend change.
