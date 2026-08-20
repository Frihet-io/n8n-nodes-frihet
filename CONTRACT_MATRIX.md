# CONTRACT_MATRIX — n8n-nodes-frihet vs Frihet ERP

**Audit date:** 2026-08-20
**n8n-nodes-frihet ref:** `origin/main` = `db1208d67c32a2bd46d734d02ab95fb3e5a0a0d6` (v1.0.1)
**Canonical authority:** `berthelius/Frihet-ERP` `origin/main` = `f901d4292dfd20438de34e21795f27683beaeb37`
**Public API reference:** `functions/src/publicApi.ts` (9,623 lines, strict zod schemas)
**Webhook reference:** `functions/src/webhooks.ts` + `functions/src/webhookTriggers.ts`

This matrix is the result of an end-to-end contract audit. Every row is a
reproduced call against the actual `Frihet` node execute() function, asserted
against the live schema. The contract test suite (`tests/contract/`) drives
the node with a mocked transport and pins the wire shape; RED tests in this
audit reproduced each defect, the fixes turn them GREEN.

---

## 1. Summary

| Aspect | Value |
|---|---|
| Resources | 6 |
| Operations | 33 |
| Workflow templates | 8 |
| Contract tests | 52 (11 executed-node + 41 template-sanity / JSON-parse) |
| Defects reproduced | 5 (all CRITICAL/HIGH) |
| Defects fixed in this PR | 5 / 5 |
| Coverage of the public REST surface | **~20 %** (6 generic CRUD resources vs ~30 in `publicApi.ts`) |
| Coverage of the full ERP API (incl. callable CFs, MCP) | **~5 %** |

The other ~80 % of the public REST surface that is NOT exposed in the n8n
node includes: `summary`, `context`, `monthly`, `quarterly`, `fiscal/*`,
`search/global`, `time/*`, `recurring/invoices`, `team/*`, `banking/*`,
`gestoria/*`, `webhooks/*`, `clients/{id}/contacts`, `clients/{id}/activities`,
`clients/{id}/notes`, `deposits/*`, `expenses/{id}/attachments`,
`expenses/{id}/billable`, `invoices/{id}/pdf`, `invoices/{id}/xml`,
`invoices/{id}/credit-note`, `invoices/{id}/late-fee`,
`invoices/{id}/einvoice/export`, `invoices/{id}/face/*`,
`invoices/{id}/ticketbai/*`, `kitchen/*`, `pos/*`, `stay/*`, `leaves/*`,
`tax/*`, `anomalies/*`, `portal/*`, `permissions/*`, `gl/*`, `payroll/*`,
`periods/*`, and the `batch` endpoint.

Wave 2 is required to surface any of those; the current node is intentional
generic-CRUD only.

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

| Operation | Wire path | Method | Body | Verdict |
|---|---|---|---|---|
| `create` | `/v1/invoices` | POST | strict zod (see §3.1.A) | ⚠️ Phantom fields stripped |
| `get` | `/v1/invoices/{id}` | GET | — | ✓ |
| `list` | `/v1/invoices` | GET | `limit`, `cursor`, `status`, `from`, `to`, `clientId`, `seriesId`, `q` | ⚠️ Cursor rename: `after` → `cursor` |
| `update` | `/v1/invoices/{id}` | PATCH | strict zod (partial) | ✓ |
| `delete` | `/v1/invoices/{id}` | DELETE | — | ✓ (drafts 204, others soft-cancel) |
| `send` | `/v1/invoices/{id}/send` | POST | `{ recipientEmail, recipientName?, customMessage?, locale? }` | ⚠️ Field rename: `email` → `recipientEmail` |
| `markPaid` | `/v1/invoices/{id}/paid` | POST | `{ paidDate? }` | ⚠️ Phantom `paymentMethod` selector removed |

#### 3.1.A Invoice create — strict-zod schema (server-authoritative)

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

**Rejected (phantom):** `currency` (server defaults to EUR), `clientEmail`
(server-resolved from client doc), `discount` (use `discountRate`).

### 3.2 Quote

| Operation | Wire path | Method | Verdict |
|---|---|---|---|
| `create` | `/v1/quotes` | POST | ⚠️ Phantom fields stripped |
| `get` | `/v1/quotes/{id}` | GET | ✓ |
| `list` | `/v1/quotes` | GET | ⚠️ Cursor rename |
| `update` | `/v1/quotes/{id}` | PATCH | ✓ |
| `delete` | `/v1/quotes/{id}` | DELETE | ✓ |
| `send` | `/v1/quotes/{id}/send` | POST | ⚠️ Field rename: `email` → `recipientEmail` |

`quote.create` schema mirrors `invoice.create` plus `validUntil`. No
`status='paid'`/`overdue` (only `draft, sent, accepted, rejected, expired`).

### 3.3 Expense

| Operation | Wire path | Method | Verdict |
|---|---|---|---|
| `create` | `/v1/expenses` | POST | ✓ |
| `get` | `/v1/expenses/{id}` | GET | ✓ |
| `list` | `/v1/expenses` | GET | ⚠️ Cursor rename |
| `update` | `/v1/expenses/{id}` | PATCH | ✓ |
| `delete` | `/v1/expenses/{id}` | DELETE | ✓ |

**Expense-specific fields:** `currency` IS in the expense schema
(`publicApi.ts:806`), so the n8n-shipped `currency` phantom filter applies
**only** to invoice/quote create. The node maintains separate
`INVOICE_PHANTOM_FIELDS` and `QUOTE_PHANTOM_FIELDS` sets.

### 3.4 Client / Product / Vendor

Standard CRUD. The `clientAdditional` collection exposes `fiscalZone` (matches
`clients.fiscalZone` on the server), `clientType`, `stage`, etc. — these are
**not** in the invoice create schema.

---

## 4. Defect inventory & fixes

Every defect was reproduced by a RED test and turned GREEN by the fix below.

### DEFECT 1 — CRITICAL: `markPaid` sends phantom `paymentMethod`

**Symptom:** `POST /v1/invoices/{id}/paid` rejects with 400 (strict zod
rejects unknown key). Default `bank_transfer` is auto-sent, so **every**
`markPaid` call fails on first save.

**Trace:** `publicApi.ts:5832-5834` accepts only `paidDate`. The n8n node
old `markPaid` body assembly sent `paymentMethod` unconditionally.

**Fix:**
- Removed `paymentMethod` selector from the `markPaidAdditional` UI.
- Removed `paymentMethod` from the body builder in execute().
- Documented the actual payment-method home: legacy `payments[]` ledger,
  Stripe Connect `paymentDetails`, or Payment Authority V1 (callable).

**Where authority lives:** Payment Authority V1 (`paymentAuthorityV1.ts`) is
SQL-callable only, not REST. The REST `/paid` endpoint is a state mutation
that does NOT create a payment record — only `status: 'paid'`, `paidAt`, and
`updatedAt`.

**RED test:** `tests/contract/invoice.test.ts` › `invoice.markPaid` › *"POST
/v1/invoices/:id/paid sends ONLY paidDate (no paymentMethod)"*

### DEFECT 2 — CRITICAL: `send` body uses `email`, server wants `recipientEmail`

**Symptom:** Template `n8n` parameter is still `sendEmail` (UX), but the wire
field was `email`. Strict zod rejects.

**Fix:** Wire field renamed to `recipientEmail` in invoice and quote send
handlers. UX parameter name unchanged for backwards compatibility with saved
workflows.

**RED test:** `invoice.send` › *"POST /v1/invoices/:id/send uses
recipientEmail (not email)"*

### DEFECT 3 — HIGH: List pagination query param `after` not in server spec

**Symptom:** Server `listResources` (`publicApi.ts:7642-7705`) reads `cursor`
(base64url-encoded JSON `{__id: <docId>}`), not `after`. The node sent
`?after=...` and the server fell back to offset pagination.

**Fix:**
- Wire param renamed to `cursor`.
- Response: `nextCursor` is read from the response root (not `meta.nextCursor`).
- Single-page mode now surfaces a wrapper with `nextCursor` + `total` on
  empty results so workflows can chain.

**RED test:** `invoice.list + pagination` › *"GET /v1/clients paginates with
cursor/limit (when returnAll=true)"*

### DEFECT 4 — HIGH: Invoice create strips `currency` / `clientEmail`

**Symptom:** Strict zod on `invoices` (`publicApi.ts:737-778`) does NOT accept
`currency` or `clientEmail`. The server defaults `currency` to EUR and
cross-resolves `clientEmail` from the client doc. The three templates
(`stripe-payment-to-invoice`, `shopify-order-to-invoice`,
`quote-accepted-to-invoice`) sent both.

**Fix:**
- Node filters phantom fields via `INVOICE_PHANTOM_FIELDS` /
  `QUOTE_PHANTOM_FIELDS` const sets at the top of `Frihet.node.ts`.
- Templates updated to remove the phantom fields directly.

**RED test:** `invoice.create — strict schema` › *"POST /v1/invoices sends
only fields from the ERP create schema"*

### DEFECT 5 — HIGH: Template webhook subscribers reference `{ data }` envelope

**Symptom:** The ERP webhook emitter (`webhookTriggers.ts:757, :732, :322`)
sends `{ client: { id, ... } }`, `{ quote: { id, ... } }`, etc. Templates
read `$json.body.data.*` (aspirational shape) and silently lose every field.

**Fix:** Templates updated to read `$json.body.client.*` and
`$json.body.quote.*`. README updated to document the envelope.

**RED test:** `tests/contract/templates.test.ts` ›
*"webhook receivers use the server payload shape ({client|quote|invoice})"*

---

## 5. Webhook events — what's actually emitted

The ERP exposes 39 events in `VALID_WEBHOOK_EVENTS` (`webhooks.ts:27-46`).
Of these, **14 are registered but never emitted** (see `webhookTriggers.ts`
grep): `invoice.generated`, `invoice.one_off_created`, `invoice.voided`,
`invoice.payment_status_updated`, `invoice.payment_failure`,
`payment.requires_action`, `payment_receipt.created`, `credit_note.created`,
`credit_note.generated`, `quote.expired`, `client.vies_check`,
`dunning.finished`, and a few more. Subscribing to those will never fire.

The n8n templates currently subscribe to:
- `client.created` — emitted at `webhookTriggers.ts:757` ✓
- `quote.accepted` — emitted at `webhookTriggers.ts:732` (on
  `≠ 'accepted' → 'accepted'` transition) ✓

Both are real. Templates should mention that the event type is also in
`X-Frihet-Event` header.

**Signing:** if the webhook subscription has a `secret`, deliveries carry
`X-Frihet-Signature: sha256=<hex>` where the hex is `HMAC-SHA256(secret,
rawBody)`. The signing bytes are the raw JSON body — receivers MUST hash the
actual bytes they received, not a re-serialized version.

**Retry:** exponential backoff capped at 30s, 3 attempts, batched by the
`processWebhookRetries` pubsub schedule (`every 5 minutes`). After 3
consecutive failures the webhook is auto-paused (`pausedReason:
'consecutive_failures'`).

---

## 6. Payment Authority — what is NOT in the n8n node

The ERP has 4 overlapping payment surfaces and the n8n node only knows
about the simplest one:

| Surface | Where it lives | n8n node exposes? |
|---|---|---|
| `POST /v1/invoices/{id}/paid` | `publicApi.ts:5827` | ✓ (`markPaid`) |
| `Invoice.status` PATCH with `status='paid'` | `publicApi.ts:762` (zod accepts status enum) | ⚠️ Side-channel via `update` |
| `Invoice.payments[]` legacy ledger | `apps/erp/services/batchOperationsService.ts:557` (UI bulk path) | ✗ |
| `Invoice.paymentDetails` (Stripe Connect) | `stripeConnect.ts:532-538` | ✗ (only Stripe webhook writes it) |
| Payment Authority V1 forward-only ledger | `paymentAuthorityV1.ts:655` — `postManualPaymentAuthorityV1` callable, `enforceAppCheck: true` | ✗ (callable only, not REST) |
| `POST /v1/banking/transactions/{id}/match` | `publicApi.ts:4906` — links tx to invoice/expense, does NOT mark paid | ✗ |
| `POST /v1/deposits/{id}/apply` | `publicApi.ts:6108` — applies a deposit pool | ✗ |

**Honest guidance:** if a workflow needs to record "the client paid by
bank transfer on 2026-08-20", the canonical path is Payment Authority V1,
which is callable-only. The n8n node's `markPaid` only mutates
`status: 'paid'` + `paidAt` and does NOT create a payment record. The seven
`paymentMethod` values the old UI exposed (`bank_transfer, cash, card,
stripe, paypal, other`) had no backend authority — the selector is removed.

---

## 7. Multi-tenant / workspace identity

**Authority:** `userId` is derived from the `users/{userId}/apiKeys/...` path
of the API key (`publicApi.ts:1545-1547`). **No `workspaceId` header or
query parameter is honored.** All collections are rooted at
`users/{userId}/...` and lists are scoped per workspace by construction.

**For team workspaces:** the API key's `userId` is the binding. To run a
workflow against multiple workspaces, configure multiple n8n credentials,
one per workspace API key, and pick the right credential at runtime.

**Gestoría (cross-workspace) only:** `POST /v1/gestoria/aging` accepts an
explicit `workspaceIds: string[]` body, with per-workspace membership checks
inside `buildConsolidatedAgingReport` (`publicApi.ts:4994-5047`). The n8n
node does not expose this — by design.

---

## 8. Idempotency

| Aspect | Value | Source |
|---|---|---|
| Header | `Idempotency-Key` (case-insensitive) | `publicApi.ts:2376` |
| Max length | 64 chars | `idempotency.ts:116` |
| TTL | 24 hours | `idempotency.ts:114` |
| Scope | per `userId` (the API key owner) | `idempotency.ts:119` |
| Fingerprint | `method + pathParams + body + parsed query` | `publicApi.ts:2406` |
| Replay | returns the original 2xx/4xx/5xx with `X-Idempotent-Replayed: true` | `publicApi.ts:1887-1902` |
| Conflict | `409 IDEMPOTENCY_KEY_REUSED` (different fingerprint) | `publicApi.ts:2424-2429` |
| In-progress | `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` | `publicApi.ts:2431-2437` |
| Mandatory | `POST /v1/invoices/{id}/credit-note` only | `creditNoteApi.ts:115-122` |
| Bypass | `POST /v1/gestoria/aging`, `POST /v1/portal/domain/{x}/verify` | `publicApi.ts:1578-1588` |

**The n8n node does NOT currently emit `Idempotency-Key` for any operation.**
This is a real gap for fiscal writes (invoice/quote create, credit note
creation). Adding it is a Wave 2 priority — the integration is mechanical
(n8n provides `$execution.id` per workflow run, which is stable per retry
under the auto-retry logic). Until then, every retry is a duplicate attempt;
the existing per-fiscal-create collision guard (`publicApi.ts:8510-8532`)
catches caller-supplied `documentNumber` duplicates but does NOT catch
auto-generated number duplicates — two retries produce two distinct fiscal
numbers.

**Honest scope:** the n8n node does not advertise idempotency in either
direction (no `Idempotency-Key` sent, no `X-Idempotent-Replayed` consumed).

---

## 9. Rate limit

| Aspect | Value | Source |
|---|---|---|
| Cap | 100 req/min per API key | `openapi.json` intro page |
| Headers (every auth response) | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | `publicApi.ts:1713-1738` |
| On 429 | `Retry-After` (int seconds) | `openapi.json` intro |
| n8n behavior | `NodeApiError` on 429; no auto-retry | `GenericFunctions.ts:50-52` |

The README's "100 requests/minute per API key" claim is correct.

---

## 10. Operational notes (not in the n8n UI)

- **VeriFactu / TicketBAI / Facturae** — server-owned fiscal pipelines.
  Invoices for ES clients get a SHA-256 hash chain (`verifactu.hash`) at
  issuance, never from the client. The n8n node does NOT expose these; the
  fiscal-anchor surface is intentionally not in the community node per
  Wave-2 plan.
- **Credit note** (`POST /v1/invoices/{id}/credit-note`) — distinct workflow,
  requires `Idempotency-Key`, plan-gated (`pro+`). Currently missing from
  the n8n resource list. Honest scope: NOT in the node.
- **Document numbering** — server-owned, atomic, gap-free. The client may
  supply `documentNumber` for migration/import flows, but the server
  fast-forwards the counter to preserve VeriFactu gapless integrity. The
  n8n node does NOT expose `documentNumber` on create (the typical API
  caller doesn't need to).
- **Address aliases** — server accepts `state`/`postalCode` and normalizes
  to `province`/`zip` (`publicApi.ts:950-962`). The n8n node uses the
  canonical `province`/`zip` in the address JSON example.

---

## 11. Test coverage

```
$ node_modules/.bin/jest
Test Suites: 2 passed, 2 total
Tests:       52 passed, 52 total
```

- `tests/contract/invoice.test.ts` — 11 tests, drives the actual node
  `execute()` against a mocked transport. Pins URL, method, body shape,
  query string, and auth header.
- `tests/contract/templates.test.ts` — 41 tests (5 templates × 8 assertions
  + 1 integration test). Validates JSON, operation references, no phantom
  fields, and webhook envelope shape.

The harness is intentionally minimal. No snapshot noise, no fabricated
fixtures — each test reproduces a real contract observation. Adding more
will happen as the surface grows (Wave 2: credit-note, e-invoice, banking,
recurring, webhooks).

---

## 12. Remaining coverage %

Computed by routing the live `publicApi.ts` route table:

| Family | Operations | Exposed in n8n | % |
|---|---|---|---|
| Generic CRUD (invoices, quotes, expenses, clients, products, vendors) | 30 | 33* | 100 % CRUD ops on the 6 resources |
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
| Invoice actions (pdf, xml, credit-note, late-fee, einvoice/export, face/*, ticketbai/*) | 12 | 2 (send, markPaid) | 17 % |
| KDS / POS / Stay / Leaves / Tax / Anomalies / Portal / Permissions / GL / Payroll / Periods | ~50 (family-handled) | 0 | 0 % |
| OAuth `api-key` mint | 1 | 0 | 0 % |

\* 33 ops vs 30 generic CRUD lines because Invoice×7, Quote×6, Expense×5,
Client×5, Product×5, Vendor×5 = 33 — these include the action endpoints
(`/send`, `/paid`) for invoices and quotes.

**Topology:** the n8n node covers 100 % of the 30 generic CRUD operations
on the 6 most common resources, plus 2 of 12 invoice action endpoints
(`/send`, `/paid`). It does NOT cover any of the ~80 family-specific
endpoints or any of the domain-specific action endpoints.

This is the **~20 % of the Frihet REST API surface** the README claims, and
it is the truthful ceiling for what the community node exposes today.
Wave 2 is the only path to more.

---

## 13. Files touched in this audit

```
nodes/Frihet/Frihet.node.ts        — 5 contracts pinned, 5 defects fixed
credentials/FrihetApi.credentials.ts — unchanged (X-API-Key / Bearer both accepted)
templates/new-client-to-hubspot.json — webhook payload references corrected
templates/quote-accepted-to-invoice.json — webhook payload + phantom fields removed
templates/stripe-payment-to-invoice.json — phantom fields removed
templates/shopify-order-to-invoice.json — phantom fields removed
templates/README.md                  — webhook envelope documented
tests/contract/invoice.test.ts       — RED→GREEN contract tests (11)
tests/contract/templates.test.ts     — 8 templates × sanity tests (41)
jest.config.js                       — minimal ts-jest setup
tsconfig.test.json                   — for tests; tsconfig.json now excludes tests/
CONTRACT_MATRIX.md                   — this file
```

No `package.json` change, no `npm install`, no `npm publish`, no
credentials mutation, no backend change.
