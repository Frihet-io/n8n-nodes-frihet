/**
 * Frihet n8n community node — unit tests
 *
 * Covers:
 *  1. Node class can be imported and instantiated
 *  2. description.name and n8nNodesApiVersion declared in package.json match
 *  3. All declared resources have at least one operation
 *  4. All operations have noDataExpression: true on the Operation param
 *  5. Credential class is importable and has required fields
 *  6. Base URL defaults to https://api.frihet.io
 *  7. Workflow fixture JSON files are valid and reference the correct node type
 */

import { Frihet } from '../nodes/Frihet/Frihet.node';
import { FrihetApi } from '../credentials/FrihetApi.credentials';
import * as pkg from '../package.json';

// ── Workflow fixtures ──────────────────────────────────────────────────────────
import quoteToInvoiceFixture from './fixtures/workflow-quote-to-invoice.json';
import overdueReminderFixture from './fixtures/workflow-overdue-reminder.json';

const EXPECTED_NODE_TYPE = 'n8n-nodes-frihet.frihet';
const EXPECTED_BASE_URL = 'https://api.frihet.io';

// ── 1. Node instantiation ──────────────────────────────────────────────────────
describe('Frihet node', () => {
	let node: Frihet;

	beforeEach(() => {
		node = new Frihet();
	});

	test('can be instantiated', () => {
		expect(node).toBeDefined();
		expect(node.description).toBeDefined();
	});

	test('has correct displayName', () => {
		expect(node.description.displayName).toBe('Frihet');
	});

	test('name matches package.json n8n node entry', () => {
		// package.json n8n.nodes[0] = "dist/nodes/Frihet/Frihet.node.js"
		// The node name in the registry becomes n8n-nodes-frihet.frihet
		const pkgNodeEntry = pkg.n8n.nodes[0];
		expect(pkgNodeEntry).toMatch(/Frihet\.node/);
		expect(node.description.name).toBe('frihet');
	});

	// ── 2. n8nNodesApiVersion in package.json ─────────────────────────────────
	test('package.json has n8nNodesApiVersion set to a number', () => {
		expect(typeof pkg.n8n.n8nNodesApiVersion).toBe('number');
		expect(pkg.n8n.n8nNodesApiVersion).toBeGreaterThanOrEqual(1);
	});

	// ── 3. Resources ──────────────────────────────────────────────────────────
	test('declares the Resource parameter with noDataExpression', () => {
		const resourceParam = node.description.properties.find(
			(p) => p.name === 'resource',
		);
		expect(resourceParam).toBeDefined();
		expect(resourceParam!.noDataExpression).toBe(true);
	});

	test('has at least 4 resources', () => {
		const resourceParam = node.description.properties.find((p) => p.name === 'resource');
		const options = (resourceParam as any)?.options ?? [];
		expect(options.length).toBeGreaterThanOrEqual(4);
	});

	test('covers invoice, quote, expense, client, product, vendor resources', () => {
		const resourceParam = node.description.properties.find((p) => p.name === 'resource');
		const values: string[] = ((resourceParam as any)?.options ?? []).map((o: any) => o.value);
		for (const expected of ['invoice', 'quote', 'expense', 'client', 'product', 'vendor']) {
			expect(values).toContain(expected);
		}
	});

	// ── 4. Operations have noDataExpression ───────────────────────────────────
	test('all Operation params have noDataExpression: true', () => {
		const operationParams = node.description.properties.filter((p) => p.name === 'operation');
		expect(operationParams.length).toBeGreaterThan(0);
		for (const param of operationParams) {
			expect(param.noDataExpression).toBe(true);
		}
	});

	// ── 5. Icons ──────────────────────────────────────────────────────────────
	test('uses an SVG icon', () => {
		expect(node.description.icon).toMatch(/\.svg$/);
	});

	// ── 6. Credentials declared ───────────────────────────────────────────────
	test('declares frihetApi credential', () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c) => c.name === 'frihetApi')).toBe(true);
	});

	// ── 7. Subtitle expression set ────────────────────────────────────────────
	test('has a subtitle expression', () => {
		expect(node.description.subtitle).toBeDefined();
		expect(typeof node.description.subtitle).toBe('string');
		expect(node.description.subtitle!.length).toBeGreaterThan(0);
	});
});

// ── Credential class ──────────────────────────────────────────────────────────
describe('FrihetApi credential', () => {
	let cred: FrihetApi;

	beforeEach(() => {
		cred = new FrihetApi();
	});

	test('can be instantiated', () => {
		expect(cred).toBeDefined();
	});

	test('has name "frihetApi"', () => {
		expect(cred.name).toBe('frihetApi');
	});

	test('displayName includes "Frihet"', () => {
		expect(cred.displayName).toContain('Frihet');
	});

	test('has documentationUrl', () => {
		expect(cred.documentationUrl).toBeDefined();
		expect(cred.documentationUrl).toMatch(/^https?:\/\//);
	});

	test('has apiKey property', () => {
		const apiKeyProp = cred.properties.find((p) => p.name === 'apiKey');
		expect(apiKeyProp).toBeDefined();
		expect((apiKeyProp as any)?.typeOptions?.password).toBe(true);
	});

	test('baseUrl defaults to https://api.frihet.io', () => {
		const baseUrlProp = cred.properties.find((p) => p.name === 'baseUrl');
		expect(baseUrlProp).toBeDefined();
		expect(baseUrlProp!.default).toBe(EXPECTED_BASE_URL);
	});
});

// ── Workflow fixture tests ─────────────────────────────────────────────────────
describe('Workflow fixture: quote-to-invoice', () => {
	test('is valid JSON with a name', () => {
		expect(quoteToInvoiceFixture).toBeDefined();
		expect(typeof quoteToInvoiceFixture.name).toBe('string');
	});

	test('contains at least one Frihet node', () => {
		const frihetNodes = quoteToInvoiceFixture.nodes.filter(
			(n: any) => n.type === EXPECTED_NODE_TYPE,
		);
		expect(frihetNodes.length).toBeGreaterThan(0);
	});

	test('Frihet node targets invoice resource with create operation', () => {
		const node = quoteToInvoiceFixture.nodes.find(
			(n: any) => n.type === EXPECTED_NODE_TYPE,
		) as any;
		expect(node.parameters.resource).toBe('invoice');
		expect(node.parameters.operation).toBe('create');
	});

	test('invoice node has at least one line item', () => {
		const node = quoteToInvoiceFixture.nodes.find(
			(n: any) => n.type === EXPECTED_NODE_TYPE,
		) as any;
		const items = node.parameters.items?.item ?? [];
		expect(items.length).toBeGreaterThan(0);
		const firstItem = items[0];
		expect(typeof firstItem.description).toBe('string');
		expect(typeof firstItem.unitPrice).toBe('number');
	});
});

describe('Workflow fixture: overdue-reminder', () => {
	test('is valid JSON with a name', () => {
		expect(overdueReminderFixture).toBeDefined();
		expect(typeof overdueReminderFixture.name).toBe('string');
	});

	test('contains at least two Frihet nodes', () => {
		const frihetNodes = overdueReminderFixture.nodes.filter(
			(n: any) => n.type === EXPECTED_NODE_TYPE,
		);
		expect(frihetNodes.length).toBeGreaterThanOrEqual(2);
	});

	test('first Frihet node lists overdue invoices', () => {
		const listNode = overdueReminderFixture.nodes.find(
			(n: any) => n.type === EXPECTED_NODE_TYPE && n.parameters.operation === 'list',
		) as any;
		expect(listNode).toBeDefined();
		expect(listNode.parameters.resource).toBe('invoice');
		expect(listNode.parameters.filters?.status).toBe('overdue');
	});

	test('second Frihet node sends the invoice', () => {
		const sendNode = overdueReminderFixture.nodes.find(
			(n: any) => n.type === EXPECTED_NODE_TYPE && n.parameters.operation === 'send',
		) as any;
		expect(sendNode).toBeDefined();
		expect(sendNode.parameters.resource).toBe('invoice');
	});

	test('nodes are connected in sequence', () => {
		const connections = overdueReminderFixture.connections as Record<string, any>;
		// At least one connection entry should exist
		expect(Object.keys(connections).length).toBeGreaterThan(0);
	});
});

// ── package.json fields required by n8n Creator Portal ────────────────────────
describe('package.json n8n community node fields', () => {
	test('has "n8n-community-node-package" keyword', () => {
		expect(pkg.keywords).toContain('n8n-community-node-package');
	});

	test('has repository.url pointing to GitHub', () => {
		expect(pkg.repository?.url).toMatch(/github\.com/);
	});

	test('has license set', () => {
		expect(pkg.license).toBe('MIT');
	});

	test('n8n.n8nNodesApiVersion is a positive integer', () => {
		const v = pkg.n8n.n8nNodesApiVersion;
		expect(Number.isInteger(v)).toBe(true);
		expect(v).toBeGreaterThan(0);
	});

	test('n8n.nodes array is non-empty', () => {
		expect(pkg.n8n.nodes.length).toBeGreaterThan(0);
	});

	test('n8n.credentials array is non-empty', () => {
		expect(pkg.n8n.credentials.length).toBeGreaterThan(0);
	});
});
