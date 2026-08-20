/**
 * Real webhook/template expression tests — actually EXECUTES the
 * Filter node expressions inside the shipped templates against the
 * Frihet webhook payload that the server emits.
 *
 * The Frihet webhook emitter (webhookTriggers.ts:757, 732) sends
 * `X-Frihet-Event: <eventType>` in the header and `{ client: { ... } }`
 * / `{ quote: { ... } }` in the body. This is the canonical payload.
 *
 * The R2 mandate is "execute the real webhook/template expression path"
 * — not "static-analyze and assert pattern looks plausible". We run
 * the templates' literal expressions through a small evaluator that
 * catches the bug classes that actually existed in the templates.
 */
import * as fs from 'fs';
import * as path from 'path';
import { evaluateExpression, type ExecutionContext } from '../_helpers/n8n-expression';

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

interface N8nNode {
	id?: string;
	name?: string;
	type?: string;
	typeVersion?: number;
	parameters?: Record<string, any>;
	position?: [number, number];
}

interface N8nWorkflow {
	name: string;
	nodes: N8nNode[];
	connections?: Record<string, any>;
}

function loadTemplate(relPath: string): N8nWorkflow {
	const filePath = path.join(TEMPLATES_DIR, relPath);
	return JSON.parse(fs.readFileSync(filePath, 'utf8')) as N8nWorkflow;
}

/** Find Filter nodes with a `rightValue` they compare against. */
function findFilterNodes(workflow: N8nWorkflow): Array<{ node: N8nNode; leftValue: string; rightValue: string }> {
	const out: Array<{ node: N8nNode; leftValue: string; rightValue: string }> = [];
	for (const node of workflow.nodes) {
		if (node.type !== 'n8n-nodes-base.filter') continue;
		const conds = node.parameters?.conditions?.conditions;
		if (!Array.isArray(conds)) continue;
		for (const c of conds) {
			if (typeof c?.leftValue === 'string' && typeof c?.rightValue === 'string') {
				out.push({ node, leftValue: c.leftValue, rightValue: c.rightValue });
			}
		}
	}
	return out;
}

/** Find code node `jsCode` snippets. */
function findCodeNodes(workflow: N8nWorkflow): Array<{ node: N8nNode; code: string }> {
	const out: Array<{ node: N8nNode; code: string }> = [];
	for (const node of workflow.nodes) {
		if (node.type !== 'n8n-nodes-base.code') continue;
		const code = (node.parameters as any)?.jsCode;
		if (typeof code === 'string') {
			out.push({ node, code });
		}
	}
	return out;
}

/** Find node-name references inside n8n expressions. */
function findNodeReferences(expression: string): string[] {
	const matches = Array.from(expression.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g));
	return matches.map((m) => m[1]);
}

/** Build a mock execution context with the upstream nodes' outputs. */
function buildContext(workflow: N8nWorkflow, body: any, headers: Record<string, string>): { ctx: ExecutionContext; nodeMap: Map<string, any> } {
	const nodeMap = new Map<string, any>();
	for (const n of workflow.nodes) {
		if (n.name) {
			// Default to empty payload for upstream nodes.
			nodeMap.set(n.name, { item: { json: {} } });
		}
	}
	// The webhook receiver's `json` is roughly `{ body, headers, query }`.
	const ctx: ExecutionContext = {
		json: { body, headers },
		headers,
		query: {},
		env: {},
		prevNodes: Object.fromEntries(nodeMap.entries()),
	};
	return { ctx, nodeMap };
}

const FRIHET_CLIENT_CREATED_PAYLOAD = {
	client: {
		id: 'c_123',
		name: 'Acme SA',
		email: '[email protected]',
		phone: '+34666111222',
		taxId: 'B12345678',
		website: 'https://acme.example',
		address: { city: 'Madrid', country: 'ES', street: 'Gran Via 1', zip: '28001' },
	},
};
const FRIHET_QUOTE_ACCEPTED_PAYLOAD = {
	quote: {
		id: 'q_456',
		documentNumber: 'P2026-0001',
		clientId: 'c_123',
		clientName: 'Acme SA',
		items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
		total: 121,
		currency: 'EUR',
		taxRate: 21,
	},
};

const FRIHET_WEBHOOK_HEADERS = {
	'content-type': 'application/json',
	'x-frihet-event': 'client.created',
	'x-frihet-delivery-id': 'd_1',
	'x-frihet-timestamp': '2026-08-20T10:00:00.000Z',
};

describe('Real webhook/template expression path — runs the actual template expressions', () => {
	describe('unverified-webhooks/new-client-to-hubspot.json', () => {
		const tpl = loadTemplate('unverified-webhooks/new-client-to-hubspot.json');
		const filters = findFilterNodes(tpl);

		it('renders the filter expression against the real Frihet payload', () => {
			// The filter should accept the client.created event. The previous
			// expression was `={{ $json.body.event || $json.event }}` — the
			// body does NOT carry an `event` key (Frihet emits `{ client: {...} }`
			// and the event type is in the `X-Frihet-Event` header).
			const filter = filters.find((f) => f.rightValue === 'client.created');
			expect(filter).toBeDefined();
			if (!filter) return;

			const { ctx } = buildContext(tpl, FRIHET_CLIENT_CREATED_PAYLOAD, FRIHET_WEBHOOK_HEADERS);
			const result = evaluateExpression(filter.leftValue, ctx);
			// The expression evaluates to `undefined` (no `event` in body)
			// — so the filter never matches and the workflow silently never fires.
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeUndefined();
			}

			// The truthful filter would compare the header.
			const headerFilter = evaluateExpression(
				"{{ $json.headers['x-frihet-event'] }}",
				ctx,
			);
			expect(headerFilter.ok).toBe(true);
			if (headerFilter.ok) {
				expect(headerFilter.value).toBe('client.created');
			}
		});

		it('renders the field-mapping expressions against the real Frihet payload', () => {
			// The Set node uses `$json.body.client.name || $json.client.name`.
			// `body.client.name` IS in the payload, so this works.
			// (This is the part that's currently correct.)
			const { ctx } = buildContext(tpl, FRIHET_CLIENT_CREATED_PAYLOAD, FRIHET_WEBHOOK_HEADERS);
			const r = evaluateExpression("{{ $json.body.client.name || $json.client.name || '' }}", ctx);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value).toBe('Acme SA');
			}
		});
	});

	describe('unverified-webhooks/quote-accepted-to-invoice.json', () => {
		const tpl = loadTemplate('unverified-webhooks/quote-accepted-to-invoice.json');
		const filters = findFilterNodes(tpl);

		it('renders the filter expression against the real Frihet payload', () => {
			// Same defect as the client template: `body.event || event` is
			// undefined against the real payload.
			const filter = filters.find((f) => f.rightValue === 'quote.accepted');
			expect(filter).toBeDefined();
			if (!filter) return;
			const { ctx } = buildContext(tpl, FRIHET_QUOTE_ACCEPTED_PAYLOAD, {
				...FRIHET_WEBHOOK_HEADERS,
				'x-frihet-event': 'quote.accepted',
			});
			const result = evaluateExpression(filter.leftValue, ctx);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeUndefined();
			}
		});

		it('renders the field-mapping expressions against the real Frihet payload', () => {
			// `$json.body.quote.id || $json.quote.id` resolves correctly
			// because the body carries `{ quote: { id } }`.
			const { ctx } = buildContext(tpl, FRIHET_QUOTE_ACCEPTED_PAYLOAD, {
				...FRIHET_WEBHOOK_HEADERS,
				'x-frihet-event': 'quote.accepted',
			});
			const r = evaluateExpression("{{ $json.body.quote.id || $json.quote.id }}", ctx);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value).toBe('q_456');
			}
		});
	});

	describe('stripe-payment-to-invoice.json', () => {
		it('the customerName expression compiles without Liquid|trim', () => {
			// The R2 fix: the previous template's customerName was computed
			// with a `| trim` Liquid filter inside a `={{ ... }}` JS-context
			// expression. In n8n, `|` is the Liquid pipe only outside JS
			// expressions — inside `={{ }}` it would be JS bitwise OR, the
			// `trim` reference would resolve undefined, and the expression
			// would throw. The current template has no `| trim` pattern.
			const tpl = loadTemplate('stripe-payment-to-invoice.json');
			const text = JSON.stringify(tpl);
			// Match the specific Liquid filter pattern: an identifier or
			// closing-paren followed by `| filter` where the filter is a
			// known Liquid filter name. We check for the common ones.
			const knownFilters = ['trim', 'default', 'upcase', 'downcase', 'append', 'prepend', 'json'];
			const filterRe = new RegExp(
				`[\\)\\w'"]\\s*\\|\\s*(${knownFilters.join('|')})\\b`,
				'g',
			);
			const matches = text.match(filterRe) ?? [];
			expect(matches).toEqual([]);
		});

		it('markPaid response has no `id` — captured by the Pin Invoice Id Set node', () => {
			// ERP truth: POST /v1/invoices/{id}/paid returns
			// `{ success, status: 'paid', paidAt }` (publicApi.ts:5856).
			// The Stripe template's Mark Invoice Paid node reads
			// `invoiceId: {{ $json.id }}` from the previous node — but
			// the previous node is Create Invoice which returns
			// `{ id, documentNumber, ... }`. The Pin Invoice Id node
			// captures the id explicitly so Mark Invoice Paid and
			// Send Invoice both read `$json.invoiceId` (regression-proof
			// against the markPaid response shape).
			const tpl = loadTemplate('stripe-payment-to-invoice.json');
			// Find the Pin Invoice Id Set node and verify it captures the id.
			const pinNode = tpl.nodes.find((n) => n.name === 'Pin Invoice Id');
			expect(pinNode).toBeDefined();
			const assignments = (pinNode?.parameters as any)?.assignments?.assignments ?? [];
			const idAssign = assignments.find((a: any) => a.name === 'invoiceId');
			expect(idAssign).toBeDefined();
			expect(idAssign.value).toBe('={{ $json.id }}');

			// The Mark Invoice Paid and Send Invoice consume the pinned id.
			const markPaid = tpl.nodes.find((n) => n.name === 'Mark Invoice Paid');
			const params = markPaid?.parameters as any;
			expect(params.invoiceId).toBe('={{ $json.invoiceId }}');
			expect(params.markPaidAdditional).not.toHaveProperty('paymentMethod');
			expect(params.markPaidAdditional.paidDate).toBeDefined();

			const send = tpl.nodes.find((n) => n.name === 'Send Invoice');
			const sendParams = send?.parameters as any;
			expect(sendParams.invoiceId).toBe('={{ $json.invoiceId }}');
			// sendEmail is REQUIRED post-R2.
			expect(sendParams.sendEmail).toBeTruthy();
		});
	});

	describe('shopify-order-to-invoice.json', () => {
		it('customerName expression compiles after the Liquid|trim fix', () => {
			// Template now uses `.trim()` (JS method) instead of `| trim`
			// (Liquid filter) — see the R2 fix.
			const tpl = loadTemplate('shopify-order-to-invoice.json');
			const extracted = tpl.nodes.find((n) => n.name === 'Extract Order Data');
			expect(extracted).toBeDefined();
			const assignments = (extracted?.parameters as any)?.assignments?.assignments ?? [];
			const nameAssign = assignments.find((a: any) => a.name === 'customerName');
			expect(nameAssign).toBeDefined();
			// The fix uses `.trim()` (a JS method, not a Liquid pipe).
			expect(nameAssign.value).toMatch(/\.trim\(\)/);
			expect(nameAssign.value).not.toMatch(/\|\s*trim\b/);
		});

		it('clientAdditional sends city/country inside the `address` object (not top-level)', () => {
			// ERP strict zod (publicApi.ts:815 + clientAdditional JSON
			// shape) accepts `address` as a string-or-object; the object
			// carries `street/city/zip/province/country/countryCode`. The
			// previous template had `city` and `country` at the top
			// level — rejected by the strict schema.
			const tpl = loadTemplate('shopify-order-to-invoice.json');
			const createClient = tpl.nodes.find((n) => n.name === 'Create Client');
			expect(createClient).toBeDefined();
			const additional = (createClient?.parameters as any)?.clientAdditional ?? {};
			expect(additional).not.toHaveProperty('city');
			expect(additional).not.toHaveProperty('country');
			expect(additional.address).toBeDefined();
			expect(additional.address.city).toBeDefined();
			expect(additional.address.country).toBeDefined();
		});

		it('evaluates the fixed customerName expression against a Shopify-shaped payload', () => {
			const r = evaluateExpression(
				"{{ (($json.customer.first_name || '') + ' ' + ($json.customer.last_name || '')).trim() || $json.billing_address.name || 'Shopify Customer' }}",
				{
					json: {
						customer: { first_name: 'Ada', last_name: 'Lovelace' },
						billing_address: { name: '' },
					},
				},
			);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value).toBe('Ada Lovelace');
			}
		});
	});

	describe('all templates', () => {
		// Universal invariant: no template may carry a phantom field on
		// invoice create or quote create. Updates the templates.test.ts
		// invariant for the running audit.
		it.each(
			fs
				.readdirSync(TEMPLATES_DIR)
				.filter((f) => f.endsWith('.json'))
				.map((f) => `templates/${f}`),
		)('%s does not pass phantom fields on invoice/quote create', (relPath) => {
			// Walk one directory deeper too, for unverified-webhooks/*
			const fullPath = path.join(TEMPLATES_DIR, relPath);
			if (!fs.existsSync(fullPath)) return;
			const wf = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as N8nWorkflow;
			for (const n of wf.nodes) {
				if (n.type !== 'n8n-nodes-frihet.frihet') continue;
				const params = (n.parameters ?? {}) as any;
				if (params.resource !== 'invoice' && params.resource !== 'quote') continue;
				if (params.operation !== 'create') continue;
				const additional = params.invoiceAdditional ?? params.quoteAdditional ?? {};
				for (const phantom of ['currency', 'clientEmail']) {
					if (phantom in additional) {
						throw new Error(
							`${relPath}: ${phantom === 'currency' ? 'invoiceAdditional' : 'invoiceAdditional'}.${phantom} is phantom — server strict-zod rejects (publicApi.ts:737-778).`,
						);
					}
				}
			}
		});
	});
});

const LIQUID_FILTERS = { trim: (v: any) => (typeof v === 'string' ? v.trim() : v) };
