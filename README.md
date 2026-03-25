# n8n-nodes-frihet

n8n community node for [Frihet](https://frihet.io) — AI-native business management.

Create invoices, manage expenses, sync clients, and automate your business workflows from n8n.

## Installation

In your n8n instance: **Settings → Community Nodes → Install → `n8n-nodes-frihet`**

Or via CLI:

```bash
npm install n8n-nodes-frihet
```

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

## Links

- [Frihet](https://frihet.io)
- [API Documentation](https://docs.frihet.io/api)
- [MCP Server](https://www.npmjs.com/package/@frihet/mcp-server)
- [GitHub](https://github.com/Frihet-io/n8n-nodes-frihet)

## License

MIT
