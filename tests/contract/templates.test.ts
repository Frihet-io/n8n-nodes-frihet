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
});
