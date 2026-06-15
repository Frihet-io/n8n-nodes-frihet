# Changelog

All notable changes to `n8n-nodes-frihet` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
