# Changelog

All notable changes to `n8n-nodes-frihet` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] - 2026-08-20

### R2 — second audit (canonical `berthelius/Frihet-ERP origin/main = d5f3f3cd`)

#### Fixed (R2 BLOCKERS)

- **B3 — `sendEmail` is now required.** The R1 description "uses
  client email by default" was a phantom assumption — the server's
  `sendSchema` requires `recipientEmail` literally. The n8n UI marks
  the field `required: true` with an email regex; the execute()
  function throws a clear `NodeOperationError` on empty value
  (defense in depth).
- **B6 — Shopify template address fix.** `clientAdditional.city`
  and `clientAdditional.country` were at the top level — rejected by
  the strict `clients` schema (`publicApi.ts:815-845`). Moved to
  the `address: { city, country }` JSON object.
- **B6 — Stripe template Liquid `| trim` fix.** The customerName
  expression used a Liquid pipe inside a JS-context `={{ }}` — that
  would be JS bitwise OR, `trim` would resolve undefined, the
  expression would throw at runtime. Replaced with `.trim()` (a
  real JS string method).
- **B6 — Stripe template markPaid response fix.** `markPaid` returns
  `{ success, status, paidAt }` (publicApi.ts:5856) — NO `id` field.
  The downstream `Send Invoice` read `invoiceId: $json.id` from
  `markPaid` and got `undefined`. Inserted a `Pin Invoice Id` Set
  node that captures the id from `Create Invoice` so both
  `Mark Invoice Paid` and `Send Invoice` read `$json.invoiceId`.
- **B7 — pagination truncation surfaced.** The `q`/search path
  saturates at 500 docs (`publicApi.ts:7574, :7596`) and returns
  `truncated: true` without a `nextCursor`. The previous
  implementation terminated the loop and silently claimed
  completeness. The R2 fix appends a synthetic
  `{_truncated: true, reason: ...}` item to the returned list so
  the workflow author can detect (and remediate) an incomplete
  pagination.
- **B1/B2 — Payment Authority V1 fail-closed.** The
  `paymentAuthorityVersion` field IS exposed on the invoice
  GET response. The legacy `/paid` endpoint does NOT check this
  field. On V1-enabled workspaces, calling `/paid` creates
  `AUTHORITY_MISSING` / `PROJECTION_DRIFT` divergence
  (`paymentAuthorityV1.ts:501-502, :881, :1346`). The R2 fix
  pre-fetches the invoice and hard-fails closed on V1.

#### Quarantined (B4 + B5)

- `templates/new-client-to-hubspot.json` and
  `templates/quote-accepted-to-invoice.json` moved to
  `templates/unverified-webhooks/`. **B4**: their Filter
  expressions `{{ $json.body.event || $json.event }}` evaluate
  to `undefined` against the real Frihet payload (the event
  type is in the `X-Frihet-Event` header, not the body). **B5**:
  they expose a public webhook URL; n8n's Webhook trigger does
  not expose request headers in the data flow, so the workflow
  has no n8n-native way to verify the `X-Frihet-Signature`
  HMAC. The 6 templates remaining in `templates/` are the
  safe, ready-to-use set.

#### Residual (B9)

- `invoice:update` allows `status` mutation that can drop issued
  docs from Modelo 303. The PATCH schema (`publicApi.ts:762`)
  accepts `status` in partial — a caller can move a
  `status: 'sent'` or `status: 'paid'` invoice back to
  `draft` or `cancelled`. The VeriFactu hash on the document
  is NOT rewritten; only the `status` field flips. The document
  is excluded from the current period's IVA aggregation.
  Payment Authority V1's rule lock covers payment-related
  fields but NOT `status` mutations. **This is a server
  residual, not a node bug** — logged as a follow-up.

#### Test foundation (B8)

- `package.json`: added `test` + `test:ci` scripts, devDeps
  pinned to exact installed versions
  (`jest@30.4.2`, `ts-jest@29.4.11`, `@types/jest@30.0.0`,
  `typescript@5.9.3`).
- `.github/workflows/ci.yml`: NEW — runs `npm ci && npm run
  build && npm test` on Node 20.x and 22.x on every PR.
- Removed the fake RED `after:''` test from the R1 contract
  suite; replaced with a real `FORWARDS a real cursor value
  as the cursor query param` test that exercises the wire
  mutation.
- `tests/contract/webhook-expressions.test.ts`: NEW —
  executes the templates' literal `{{ ... }}` and `={{ ... }}`
  expressions through a sandboxed `vm.runInNewContext`
  evaluator against the real Frihet webhook payload.
  Reproduces B4 (filter broken) and B6 (Liquid `| trim`,
  markPaid response). 7 new tests.
- `tests/_helpers/n8n-expression.ts`: NEW — the minimal
  n8n expression evaluator (supports `{{ }}`, `={{ }}`,
  `$json`, `$('NodeName').item.json`, Liquid `| trim`)
  used by the webhook-expression test.

### R1 — first audit (canonical `berthelius/Frihet-ERP origin/main = f901d429`)

#### Fixed (R1)

- **`markPaid` rejects `paymentMethod`.** The
  `POST /v1/invoices/{id}/paid` endpoint (strict zod at
  `publicApi.ts:5832-5834`) accepts only `paidDate`. The
  previous default value (`bank_transfer`) was being sent on
  every call, causing 100% failure rate on first save.
  Removed the `paymentMethod` selector from the `markPaid` UI;
  payment-method tracking lives on the legacy `payments[]`
  ledger, Stripe Connect `paymentDetails`, or Payment Authority
  V1 (callable).
- **`send` body now uses `recipientEmail`.** The `sendSchema`
  (`publicApi.ts:5690-5695`) requires `recipientEmail` — the
  previous wire field `email` was rejected. The n8n UI
  parameter is still `sendEmail` for UX continuity.
- **List pagination honors `cursor`.** The server reads
  `?cursor=<base64url>` from `nextCursor` returned at the
  response root. The previous `?after=...` + `meta.nextCursor`
  combination silently fell back to offset pagination and
  never advanced.
- **Invoice create strips `currency` and `clientEmail`.** Both
  are phantom under the strict client schema
  (`publicApi.ts:737-778`). The server defaults `currency` to
  EUR and resolves `clientEmail` from the client doc. The
  three templates (`stripe-payment-to-invoice`,
  `shopify-order-to-invoice`, `quote-accepted-to-invoice`) no
  longer forward these fields.
- **Webhook subscribers use the live envelope.** `client.created`
  and `quote.accepted` deliver as `{ client: { ... } }` /
  `{ quote: { ... } }`, not the legacy `{ data: { ... } }` shape.
  Templates updated.

#### Added (R1)

- `tests/contract/invoice.test.ts` — drives the actual node
  `execute()` against a mocked transport, pinning URL, method,
  body, query string, and auth. 11 tests, all RED before the
  audit fixes, all GREEN after.
- `tests/contract/templates.test.ts` — 41 assertions across 8
  templates (valid JSON, only valid operations, no phantom
  fields, correct webhook envelope).
- `jest.config.js` + `tsconfig.test.json` — minimal ts-jest
  harness.
- `CONTRACT_MATRIX.md` — full inventory, defects, fixes, and
  remaining coverage.

#### Changed (R1)

- `tsconfig.json` now excludes `tests/` from the build.
- `templates/README.md` documents the actual webhook envelope.

### Notes
- Coverage is unchanged: 6 resources, 33 operations, ~20% of
  the public REST surface. The contract audit confirmed the
  existing surface is the ceiling for this minor; expansion
  is Wave 2.
- The n8n node does NOT emit `Idempotency-Key` on any
  operation. Retries of fiscal writes can produce duplicate
  fiscal numbers. Adding `Idempotency-Key` propagation is a
  Wave 2 priority.
- 2 of 8 templates moved to `templates/unverified-webhooks/`
  (B4 + B5 disposition). 6 remain in `templates/` as the
  safe, ready-to-use set.
- `paymentAuthorityVersion` exposes the V1 cut marker; the
  node pre-fetches and fail-closes V1 invoices on `markPaid`.
  Use the `@frihet/mcp-server` Payment Authority tool for V1
  write operations.

## [1.0.1] - 2026-06-15

### Fixed
- Corrected homepage URL and broken docs link in `package.json` (`homepage` field now points to
  `https://docs.frihet.io/desarrolladores/api-rest`).
- README refreshed: clearer community-node installation instructions (UI path + Docker/npm path),
  added Roadmap section with honest current coverage (~6 resources, ~33 ops, ~20% of Frihet REST
  API surface) and Wave 2 plans.

### Notes
- This is a docs/metadata-only patch. No node logic, credential schema, or API surface changed.
- Current coverage: Invoice, Quote, Expense, Client, Product, Vendor (6 resources).
- Wave 2 (broader API coverage + n8n verified-node CI/provenance/tests) is roadmap.
- For the full Frihet API surface (151 tools, native VeriFactu/TicketBAI/Facturae compliance),
  use [@frihet/mcp-server](https://www.npmjs.com/package/@frihet/mcp-server).

## [1.0.0] - 2026-03-24

### Added
- Initial release: n8n community node for Frihet ERP.
- 6 resources: Invoice, Quote, Expense, Client, Product, Vendor.
- ~33 operations across all resources.
- Spanish tax compliance fields: IVA/IGIC/IPSI rates, IRPF withholding, fiscal zones,
  equivalence surcharge.
- Cursor-based pagination with "Return All" support.
- Send invoices/quotes by email; mark invoices as paid.
- CRM stages on clients; structured address support.
- 8 n8n workflow templates bundled in `templates/`.
