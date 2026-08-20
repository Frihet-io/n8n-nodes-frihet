# n8n-nodes-frihet

n8n community node for [Frihet](https://frihet.io) — AI-native business management.

Create invoices, manage expenses, sync clients, and automate your business workflows from n8n.

## Installation

### n8n Cloud / Self-hosted UI

In your n8n instance: **Settings → Community Nodes → Install → `n8n-nodes-frihet`**

> Community nodes require n8n ≥ 0.187.0 and must be enabled in your instance settings
> (`N8N_NODES_INCLUDE_UNVERIFIED=true` for self-hosted).

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
- Mark invoices as paid with optional payment date and method
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
record. If your workflow needs to record "the client paid by bank transfer
on 2026-08-20", use the [@frihet/mcp-server](https://www.npmjs.com/package/@frihet/mcp-server)
(`Payment Authority V1` tool) — the REST `/paid` endpoint alone is the
state mutation, not the authoritative payment ledger.

**`send` payload:** the n8n UI parameter is `sendEmail` for UX continuity,
but the wire field is `recipientEmail` (strict zod on the server).

**Invoice create phantom fields:** `currency` and `clientEmail` are accepted
in the n8n UI's `invoiceAdditional` collection for legacy reasons but the
ERP strict-zod schema rejects them. The node strips them silently — the
server defaults `currency` to EUR and resolves `clientEmail` from the client
doc. See `CONTRACT_MATRIX.md` §3.1.A for the canonical schema.

**Webhook payload:** the `client.created` and `quote.accepted` events
deliver as `{ client: { id, ... } }` and `{ quote: { id, ... } }`
respectively (the `X-Frihet-Event` header carries the event type).

**Wave 2** — planned but not yet shipped:
- Extended resource coverage (bank accounts, fiscal calendar, VeriFactu/TicketBAI signed-invoice flows, Facturae e-invoice export, payment splits)
- n8n verified-node status (automated tests, CI provenance, community review)
- Trigger nodes for Frihet webhooks (invoice paid, client created, etc.)
- `Idempotency-Key` propagation on fiscal writes (currently the node does
  not emit it; retries of fiscal writes can produce duplicate fiscal numbers)

The Frihet [MCP Server](https://www.npmjs.com/package/@frihet/mcp-server) (`@frihet/mcp-server@1.12.0`) exposes the full API surface (151 tools, native ES/EU fiscal compliance including VeriFactu/TicketBAI/Facturae) and is available today for AI agent workflows.

## Links

- [Frihet](https://frihet.io)
- [API Documentation](https://docs.frihet.io/desarrolladores/api-rest)
- [MCP Server](https://www.npmjs.com/package/@frihet/mcp-server)
- [GitHub](https://github.com/Frihet-io/n8n-nodes-frihet)

## License

MIT
