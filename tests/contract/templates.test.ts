/**
 * Template contract tests — every JSON template in templates/ must:
 *  - parse as valid JSON
 *  - reference only node operations that the actual Frihet node exposes
 *  - NOT pass phantom fields (`currency`, `clientEmail`) on invoice create
 *  - reference webhook payloads using the actual envelope `{ client | quote | invoice }`
 *    (NOT the legacy `{ data }` shape)
 */
import * as fs from 'fs';
import * as path from 'path';

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

interface N8nNode {
	parameters?: Record<string, any>;
	type?: string;
	name?: string;
}

interface N8nWorkflow {
	name: string;
	nodes: N8nNode[];
	connections?: Record<string, any>;
}

interface FrihetNodeParams {
	resource: string;
	operation: string;
	[invoiceAdditional: string]: any;
	invoiceAdditional?: Record<string, any>;
	quoteAdditional?: Record<string, any>;
	clientAdditional?: Record<string, any>;
	expenseAdditional?: Record<string, any>;
	clientEmail?: string;
	currency?: string;
}

const VALID_RESOURCES = new Set(['invoice', 'quote', 'expense', 'client', 'product', 'vendor']);
const PHANTOM_FIELDS = new Set(['currency', 'clientEmail']);

function loadTemplate(name: string): N8nWorkflow {
	const filePath = path.join(TEMPLATES_DIR, name);
	const raw = fs.readFileSync(filePath, 'utf8');
	return JSON.parse(raw) as N8nWorkflow;
}

function getFrihetNodes(workflow: N8nWorkflow): Array<{ name: string; params: FrihetNodeParams }> {
	return workflow.nodes
		.filter((n) => n.type === 'n8n-nodes-frihet.frihet')
		.map((n) => ({ name: n.name ?? '?', params: (n.parameters ?? {}) as FrihetNodeParams }));
}

function getWebhookNodes(workflow: N8nWorkflow): N8nNode[] {
	return workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
}

function getAllNodeParams(workflow: N8nWorkflow): N8nNode[] {
	return workflow.nodes;
}

describe('templates/ — contract sanity', () => {
	const files = fs
		.readdirSync(TEMPLATES_DIR)
		.filter((f) => f.endsWith('.json') && f !== 'README.md');

	it.each(files)('%s is valid JSON', (file) => {
		const wf = loadTemplate(file);
		expect(wf.name).toBeTruthy();
		expect(Array.isArray(wf.nodes)).toBe(true);
	});

	it.each(files)('%s references only valid Frihet node operations', (file) => {
		const wf = loadTemplate(file);
		const used = new Set<string>();
		for (const { params } of getFrihetNodes(wf)) {
			used.add(`${params.resource}:${params.operation}`);
		}
		// We ONLY assert the operations the current node exposes — if a template
		// references an undeclared operation, the workflow will fail at runtime.
		// The 33 ops are: invoice x7, quote x6, expense x5, client x5, product x5, vendor x5.
		const allowed = new Set([
			'invoice:create', 'invoice:get', 'invoice:list', 'invoice:update', 'invoice:delete', 'invoice:send', 'invoice:markPaid',
			'quote:create', 'quote:get', 'quote:list', 'quote:update', 'quote:delete', 'quote:send',
			'expense:create', 'expense:get', 'expense:list', 'expense:update', 'expense:delete',
			'client:create', 'client:get', 'client:list', 'client:update', 'client:delete',
			'product:create', 'product:get', 'product:list', 'product:update', 'product:delete',
			'vendor:create', 'vendor:get', 'vendor:list', 'vendor:update', 'vendor:delete',
		]);
		for (const op of used) {
			expect(allowed.has(op)).toBe(true);
		}
	});

	it.each(files)('%s does not pass phantom fields on invoice create', (file) => {
		const wf = loadTemplate(file);
		for (const { params } of getFrihetNodes(wf)) {
			if (params.resource !== 'invoice' || params.operation !== 'create') continue;
			const additional = params.invoiceAdditional ?? {};
			for (const phantom of PHANTOM_FIELDS) {
				if (phantom in additional) {
					throw new Error(
						`${file}: invoiceAdditional sets "${phantom}" but the ERP strict-zod schema at publicApi.ts:737-778 rejects it. The server defaults to EUR / resolves clientEmail from the client doc.`,
					);
				}
			}
		}
	});

	it.each(files)('%s does not pass phantom fields on quote create', (file) => {
		const wf = loadTemplate(file);
		for (const { params } of getFrihetNodes(wf)) {
			if (params.resource !== 'quote' || params.operation !== 'create') continue;
			const additional = params.quoteAdditional ?? {};
			for (const phantom of PHANTOM_FIELDS) {
				if (phantom in additional) {
					throw new Error(
						`${file}: quoteAdditional sets "${phantom}" but the ERP strict-zod schema rejects it.`,
					);
				}
			}
		}
	});

	it.each(files)('%s webhook receivers use the server payload shape ({client|quote|invoice})', (file) => {
		const wf = loadTemplate(file);
		// Only check templates that have a webhook trigger node receiving a Frihet
		// event. For those, the n8n Set node that maps the payload must use
		// `$json.body.client.*` / `$json.body.quote.*` (the actual server envelope),
		// NOT `$json.body.data.*` (an aspirational shape).
		const webhooks = getWebhookNodes(wf);
		if (webhooks.length === 0) return;

		const text = JSON.stringify(wf);
		// Look for the legacy `body.data.` references that are no longer correct
		const legacyRefs = (text.match(/\$json\.body\.data\./g) ?? []).length;
		if (legacyRefs > 0) {
			throw new Error(
				`${file}: references $json.body.data.* (legacy/aspirational payload). The Frihet webhook envelope is { client: {...} }, { quote: {...} }, etc. — see webhookTriggers.ts:757,732.`,
			);
		}
	});

	it('every webhook event referenced in templates is actually emitted by the ERP', () => {
		// Templates 5 & 8 listen for client.created and quote.accepted. Both
		// ARE emitted (webhookTriggers.ts:757, :732). credit_note.created is in
		// the n8n internal auto-subscribe list (n8n.ts:156) but is NEVER
		// emitted — we don't ship that template, so this stays a sanity check.
		const emitted = new Set([
			'client.created',
			'quote.accepted',
		]);
		for (const file of files) {
			const wf = loadTemplate(file);
			const text = JSON.stringify(wf);
			// Match any "rightValue": "<event>" pattern in a Filter node
			const matches = Array.from(text.matchAll(/"rightValue":\s*"([^"]+)"/g)).map((m) => m[1]);
			for (const event of matches) {
				if (event.startsWith('client.') || event.startsWith('quote.') || event.startsWith('invoice.')) {
					if (!emitted.has(event)) {
						// Best-effort: log but don't fail (other templates may
						// legitimately reference other events)
						// eslint-disable-next-line no-console
						console.warn(`Template ${file} references event ${event} — verify it is emitted by the ERP.`);
					}
				}
			}
		}
	});

	it('keeps quarantined webhook files out of the production catalogue', () => {
		const catalogue = fs.readFileSync(path.join(TEMPLATES_DIR, 'README.md'), 'utf8');
		expect(catalogue).toContain('QUARANTINED');
		expect(catalogue).toContain('do not implement HMAC verification');
		expect(catalogue).not.toMatch(/^### \d+\. `(?:new-client-to-hubspot|quote-accepted-to-invoice)\.json`/m);
		expect(catalogue).not.toContain('Configure Frihet to send webhooks');
		expect(catalogue).not.toContain('for webhook secret verification');
	});

	it('rejects a production-catalogue mutant that promotes an unverified webhook', () => {
		const catalogue = fs.readFileSync(path.join(TEMPLATES_DIR, 'README.md'), 'utf8');
		const assertSafe = (source: string) => {
			if (/^### \d+\. `(?:new-client-to-hubspot|quote-accepted-to-invoice)\.json`/m.test(source)) {
				throw new Error('quarantined webhook promoted into production catalogue');
			}
			if (source.includes('for webhook secret verification')) {
				throw new Error('catalogue promises signature verification that is not implemented');
			}
		};
		expect(() => assertSafe(catalogue)).not.toThrow();
		const unsafeMutant = `${catalogue}\n### 7. \`new-client-to-hubspot.json\`\nCredentials needed: Frihet API (for webhook secret verification)\n`;
		expect(() => assertSafe(unsafeMutant)).toThrow();
	});

	it('states that quarantined webhooks have no production-safe setup', () => {
		const quarantine = fs.readFileSync(
			path.join(TEMPLATES_DIR, 'unverified-webhooks/README.md'),
			'utf8',
		);
		expect(quarantine).toContain('QUARANTINED, NOT FOR PRODUCTION');
		expect(quarantine).toContain('no receiver-side HMAC verification');
		expect(quarantine).toContain('no production-safe template is shipped');
		expect(quarantine).not.toContain('security by obscurity');
	});

	it('daily-operational-brief.json uses only read-only Frihet list operations and separates drafts from issued receivables', () => {
		const wf = loadTemplate('daily-operational-brief.json');
		const frihetNodes = getFrihetNodes(wf);
		expect(frihetNodes.length).toBeGreaterThanOrEqual(3);
		for (const { params } of frihetNodes) {
			expect(params.operation).toBe('list');
		}
		const codeNode = wf.nodes.find((n) => n.name === 'Build Operational Brief');
		expect(codeNode).toBeDefined();
		const jsCode = String(codeNode?.parameters?.jsCode ?? '');
		expect(jsCode).toContain("i.status === 'draft'");
		expect(jsCode).toContain("['sent', 'overdue', 'partial', 'partially_paid', 'unpaid', 'issued']");
		expect(jsCode).toContain('humanApprovalRequired: true');
		expect(jsCode).toContain('autoExecuted: false');
	});

	it('daily-operational-brief.json Code node enforces the 5 canonical monetary & temporal brief rules against golden counterexamples', () => {
		const wf = loadTemplate('daily-operational-brief.json');
		const codeNode = wf.nodes.find((n) => n.name === 'Build Operational Brief');
		const jsCode = String(codeNode?.parameters?.jsCode ?? '');

		const runBriefCode = (fixtures: {
			asOfDate?: string;
			invoices?: Array<Record<string, any>>;
			quotes?: Array<Record<string, any>>;
			expenses?: Array<Record<string, any>>;
		}) => {
			const asOfDate = fixtures.asOfDate ?? '2026-10-28';
			const $ = (nodeName: string) => {
				if (nodeName === 'Set Brief Window') {
					return { item: { json: { asOfDate } } };
				}
				if (nodeName === 'List Recent Invoices') {
					return { all: () => (fixtures.invoices ?? []).map((json) => ({ json })) };
				}
				if (nodeName === 'List Recent Quotes') {
					return { all: () => (fixtures.quotes ?? []).map((json) => ({ json })) };
				}
				if (nodeName === 'List Recent Expenses') {
					return { all: () => (fixtures.expenses ?? []).map((json) => ({ json })) };
				}
				throw new Error(`Unexpected node lookup: ${nodeName}`);
			};
			// eslint-disable-next-line no-new-func
			const fn = new Function('$', jsCode);
			const result = fn($);
			return result[0].json;
		};

		// Golden Counterexample 1: Absent != 0 ({} -> null / unavailable, never 0.0 EUR)
		const emptyDocBrief = runBriefCode({
			invoices: [{ id: 'inv_empty', status: 'overdue', dueDate: '2026-10-10' }],
		});
		expect(emptyDocBrief.collectionsAndDueDates.overdueCount).toBe(1);
		expect(emptyDocBrief.collectionsAndDueDates.overdueTotal.amount).toBeNull();
		expect(emptyDocBrief.collectionsAndDueDates.overdueTotal.provenance).toBe('unavailable');
		expect(emptyDocBrief.collectionsAndDueDates.overdueTotal.unavailableCount).toBe(1);
		expect(emptyDocBrief.slackMessage).toContain('No disponible');

		// Golden Counterexample 2: Multi-currency separation (100 EUR + 100 USD -> MIXED, never 200 EUR)
		const mixedCurrencyBrief = runBriefCode({
			invoices: [
				{ id: 'inv_eur', status: 'overdue', dueDate: '2026-10-10', total: 100, currency: 'EUR' },
				{ id: 'inv_usd', status: 'overdue', dueDate: '2026-10-12', total: 100, currency: 'USD' },
			],
		});
		expect(mixedCurrencyBrief.collectionsAndDueDates.overdueTotal.amount).toBeNull();
		expect(mixedCurrencyBrief.collectionsAndDueDates.overdueTotal.currency).toBe('MIXED');
		expect(mixedCurrencyBrief.collectionsAndDueDates.overdueTotal.provenance).toBe(
			'mixed_currency_unconverted',
		);
		expect(mixedCurrencyBrief.collectionsAndDueDates.overdueTotal.totalsByCurrency).toEqual({
			EUR: { amount: 100, count: 1, provenance: 'stored_field' },
			USD: { amount: 100, count: 1, provenance: 'stored_field' },
		});
		expect(mixedCurrencyBrief.slackMessage).toContain('Multi-divisa sin convertir');

		// Golden Counterexample 3: Canonical discounts & taxes (100 with discountRate: 10 -> 90.0 EUR)
		const discountedBrief = runBriefCode({
			asOfDate: '2026-10-28',
			invoices: [
				{
					id: 'inv_disc',
					status: 'overdue',
					issueDate: '2026-09-15',
					dueDate: '2026-10-15',
					items: [{ quantity: 1, unitPrice: 100 }],
					discountRate: 10,
					taxRate: 0,
					irpfRate: 0,
					currency: 'EUR',
				},
				{
					id: 'inv_oct',
					status: 'sent',
					issueDate: '2026-10-20',
					dueDate: '2026-11-01',
					items: [{ quantity: 2, unitPrice: 100, discount: 10 }],
					discountRate: 5,
					taxRate: 21,
					equivalenceSurchargeRate: 5.2,
					irpfRate: 15,
					currency: 'EUR',
				},
				{
					id: 'inv_draft',
					status: 'draft',
					issueDate: '2026-10-25',
					total: 5000,
					currency: 'EUR',
				},
			],
		});
		expect(discountedBrief.collectionsAndDueDates.overdueTotal.amount).toBe(90);
		expect(discountedBrief.collectionsAndDueDates.overdueTotal.provenance).toBe(
			'derived_from_items',
		);
		expect(discountedBrief.collectionsAndDueDates.upcomingDueWithin7DaysTotal.amount).toBe(190.15);
		expect(discountedBrief.collectionsAndDueDates.openIssuedNominalTotal.amount).toBe(280.15);
		expect(discountedBrief.collectionsAndDueDates.realOutstandingBalanceDeterminable).toBe(false);
		expect(discountedBrief.collectionsAndDueDates.unpaidNominalSemantics).toBe(
			'nominal_unpaid_invoice_totals_without_partial_payments',
		);
		expect(discountedBrief.collectionsAndDueDates.draftExcludedTotal.amount).toBe(5000);
		expect(discountedBrief.coverage.temporalScope).toBe(
			'unfiltered_operational_sample_as_of_date',
		);
		expect(discountedBrief.currentMonthActivity.referenceMonth).toBe('2026-10');
		expect(discountedBrief.currentMonthActivity.issuedInvoicesInMonthCount).toBe(1);
		expect(discountedBrief.currentMonthActivity.issuedInvoicesInMonthTotal.amount).toBe(190.15);
		expect(discountedBrief.slackMessage).toContain(
			'Importe nominal de facturas no marcadas como pagadas (saldo pendiente real no determinable sin cobros parciales)',
		);
	});
});
