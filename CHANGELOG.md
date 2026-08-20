# Changelog

All notable changes to `n8n-nodes-frihet` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] - 2026-08-20

### Fixed (contract audit f901d429)

- **`markPaid` rejects `paymentMethod`.** The `POST /v1/invoices/{id}/paid`
  endpoint (strict zod at `publicApi.ts:5832-5834`) accepts only `paidDate`.
  The previous default value (`bank_transfer`) was being sent on every call,
  causing 100% failure rate on first save. Removed the `paymentMethod`
  selector from the `markPaid` UI; payment-method tracking lives on the
  legacy `payments[]` ledger, Stripe Connect `paymentDetails`, or Payment
  Authority V1 (callable).
- **`send` body now uses `recipientEmail`.** The `sendSchema`
  (`publicApi.ts:5690-5695`) requires `recipientEmail` — the previous wire
  field `email` was rejected. The n8n UI parameter is still `sendEmail`
  for UX continuity.
- **List pagination honors `cursor`.** The server reads `?cursor=<base64url>`
  from `nextCursor` returned at the response root. The previous
  `?after=...` + `meta.nextCursor` combination silently fell back to offset
  pagination and never advanced.
- **Invoice create strips `currency` and `clientEmail`.** Both are
  phantom under the strict client schema (`publicApi.ts:737-778`). The
  server defaults `currency` to EUR and resolves `clientEmail` from the
  client doc. The three templates (`stripe-payment-to-invoice`,
  `shopify-order-to-invoice`, `quote-accepted-to-invoice`) no longer
  forward these fields.
- **Webhook subscribers use the live envelope.** `client.created` and
  `quote.accepted` deliver as `{ client: { ... } }` / `{ quote: { ... } }`,
  not the legacy `{ data: { ... } }` shape. Templates updated.

### Added
- `tests/contract/invoice.test.ts` — drives the actual node `execute()` against
  a mocked transport, pinning URL, method, body, query string, and auth.
  11 tests, all RED before the audit fixes, all GREEN after.
- `tests/contract/templates.test.ts` — 41 assertions across 8 templates
  (valid JSON, only valid operations, no phantom fields, correct webhook
  envelope).
- `jest.config.js` + `tsconfig.test.json` — minimal ts-jest harness.
- `CONTRACT_MATRIX.md` — full inventory, defects, fixes, and remaining
  coverage.

### Changed
- `tsconfig.json` now excludes `tests/` from the build.
- `templates/README.md` documents the actual webhook envelope.

### Notes
- Coverage is unchanged: 6 resources, 33 operations, ~20% of the public
  REST surface. The contract audit confirmed the existing surface is the
  ceiling for this minor; expansion is Wave 2.
- The n8n node does NOT emit `Idempotency-Key` on any operation. Retries
  of fiscal writes can produce duplicate fiscal numbers. Adding
  `Idempotency-Key` propagation is a Wave 2 priority.

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
