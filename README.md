# n8n-nodes-frihet

n8n community node for [Frihet](https://frihet.io) — AI-native business management.

Create invoices, manage expenses, sync clients, and automate your business workflows from n8n.

> **Release status:** this source declares `1.0.2`; a source checkout is not
> evidence of npm or GitHub release state. The protected, manually dispatched
> workflow either publishes a missing version or verifies an existing version
> byte-for-byte before reconciling its immutable tag and GitHub Release.

## Installation

### Self-hosted n8n

In a self-hosted instance with community packages enabled, open
**Settings → Community Nodes → Install** and enter `n8n-nodes-frihet`.

### n8n Cloud

Verification by n8n is pending. This package is not currently available as a
verified node on n8n Cloud. Once approved, users with verified community nodes
enabled can discover and install Frihet from the node panel.

### npm (self-hosted / Docker)

```bash
npm install n8n-nodes-frihet
```

Then restart your n8n instance. The Frihet node will appear in the node palette under **Action in an app → Frihet**.

## Operations

| Resource | Operations |
|----------|-----------|
| Invoice | Create, Get, List, Update, Delete, Send, Mark Paid |
| Quote | Create, Get, List, Update, Delete, Send |
| Expense | Create, Get, List, Update, Delete |
| Client | Create, Get, List, Update, Delete |
| Product | Create, Get, List, Update, Delete |
| Vendor | Create, Get, List, Update, Delete |

> **Note on `Mark Paid`:** the `POST /v1/invoices/{id}/paid` endpoint
> mutates `status` only. The node pre-fetches the invoice and
> **fail-closes on `paymentAuthorityVersion === 1`** (Payment
> Authority V1) — the legacy endpoint would create an
> `AUTHORITY_MISSING` divergence. For V1 mark-paid, use the Frihet
> app's Payment Authority V1 UI (which calls the
> `postInvoicePaymentV1` Firebase Callable) — the only supported
> surface today. The `@frihet/mcp-server` does NOT expose a V1
> write tool; its `mark_invoice_paid` wraps the same legacy REST
> endpoint and carries the same divergence risk.
>
> **Note on `send`:** the `recipientEmail` field is **required** —
> there is no server-side default to the client's email. The
> R1 description ("uses client email by default") was a phantom
> assumption and is removed.

## Credentials

1. In Frihet: **Settings → API → Generate API Key**
2. In n8n: **Credentials → New → Frihet API**
3. Paste your API key (starts with `fri_`) and save

Optionally set a custom **Base URL** for self-hosted Frihet deployments.

## Features

- Cursor-based pagination on all List operations (use "Return All" to fetch every page automatically)
- Full Spanish tax compliance fields: IVA/IGIC/IPSI tax rates, IRPF withholding, fiscal zones, equivalence surcharge
- Invoice line items with description, quantity, and unit price
- CRM stages on clients (lead, contacted, proposal, active, inactive, lost)
- Structured address support on clients, vendors, invoices, and quotes
- Send invoices and quotes directly by email from n8n workflows
- Mark legacy invoices as paid with an optional payment date; V1 invoices fail closed
- Expense categories, tax deductibility, and investment goods flags

## Tax Zones (Spain)

| Zone | Tax | Value |
|------|-----|-------|
| Peninsula | IVA | 21% / 10% / 4% |
| Canary Islands | IGIC | 7% / 3% / 0% |
| Ceuta / Melilla | IPSI | — |
| EU | Reverse Charge | 0% |
| World | Exempt | 0% |

## API Rate Limits

Frihet API: 100 requests/minute per API key. The node will throw `NodeApiError` on 429 responses.

## Roadmap

Current coverage: 6 resources, **33 operations** across generic CRUD plus
`/send` and `/paid` actions. Approximately **20% of the Frihet REST API
surface** — the 6 generic CRUD resources out of ~30 route families in
`publicApi.ts`.

**`markPaid` caveat:** the `POST /v1/invoices/{id}/paid` endpoint only
mutates `status`, `paidAt`, and `updatedAt`. It does NOT create a payment
record. The node **fail-closes on V1 invoices** (B1/B2) — the legacy
endpoint would create an `AUTHORITY_MISSING` divergence on a
Payment-Authority-V1-enabled workspace. For V1 writes, use the Frihet
app's Payment Authority V1 UI (which calls the `postInvoicePaymentV1`
Firebase Callable). The `@frihet/mcp-server` does NOT currently expose
a V1 write tool — its `mark_invoice_paid` wraps the same legacy REST
endpoint and has the same divergence risk.

**`send` payload:** the `recipientEmail` field is **required** by the
server's strict zod schema (`publicApi.ts:5690-5695`). The n8n UI
parameter is `sendEmail` for UX continuity; the wire field is
`recipientEmail`. The previous R1 description ("uses client email by
default") was a phantom — there is no server-side default.

**Invoice create phantom fields:** `currency` and `clientEmail` are stripped
defensively. The server defaults `currency` to EUR and resolves
`clientEmail` from the client doc. See `CONTRACT_MATRIX.md` §3.1.A
for the canonical schema.

**Templates:** the six top-level JSON templates are ready-to-use. **Two legacy
webhook templates (`new-client-to-hubspot`,
`quote-accepted-to-invoice`) are quarantined under
`templates/unverified-webhooks/`** — their event-type filter is broken
(server emits `X-Frihet-Event` header, the body has no `event` key)
and the receiving workflow has no n8n-native way to verify the
HMAC signature. They are not production-usable and must not be imported or
activated. See `CONTRACT_MATRIX.md` §6.

**Wave 2** — planned but not yet shipped:
- Extended resource coverage (bank accounts, fiscal calendar, VeriFactu/TicketBAI signed-invoice flows, Facturae e-invoice export, payment splits)
- n8n verified-node status (community review, npm provenance)
- HMAC-verified Frihet webhook trigger (replaces the unverified-webhooks templates)
- `Idempotency-Key` propagation on fiscal writes (currently the node does
  not emit it; retries of fiscal writes can produce duplicate fiscal numbers)

The [Frihet MCP Server](https://github.com/Frihet-io/frihet-mcp) is maintained
and released separately. Its package version and directory approvals do not
establish this node's release or verification status.

## Development and verification

Install the locked dependencies with `npm ci --ignore-scripts`, then run:

```bash
npm run lint
npm run build
npm run test:ci
```

The linter uses n8n's official configuration with Cloud compatibility checks.
Tests and release scripts are outside the published `dist` package and are
checked by the contract suite. Development-only native packages pulled in by
the n8n CLI are not needed by these checks or included in the published node.

Before submitting, run the official scanner against the published version:

```bash
npx @n8n/scan-community-package n8n-nodes-frihet
```

A scanner failure, missing npm provenance, or an untested live API workflow
blocks verification. Follow [OFFICIAL_NODE_GUIDE.md](./OFFICIAL_NODE_GUIDE.md)
for the protected release and submission steps.

## Links

- [Frihet](https://frihet.io)
- [API Documentation](https://docs.frihet.io/desarrolladores/api-rest)
- [MCP Server](https://www.npmjs.com/package/@frihet/mcp-server)
- [GitHub](https://github.com/Frihet-io/n8n-nodes-frihet)

## License

MIT
