/**
 * Contract tests — drives the actual Frihet node execute() against the
 * canonical ERP publicApi schema. The authority is berthelius/Frihet-ERP
 * origin/main = d5f3f3cdfdead47880f611696d25066dcb2b8051.
 *
 * Each test reproduces a real defect observed in the n8n node vs the live
 * server contract. RED tests pin the contract; fixes turn them GREEN.
 *
 * The harness mocks `this.helpers.request` and captures every HTTP call so
 * assertions can pin the wire shape. The transport is real (the same
 * shape n8n emits at runtime); only the network leg is replaced.
 */
import { Frihet } from '../../nodes/Frihet/Frihet.node';
import { buildMockContext, lastRequest } from '../_helpers/n8n-mock';

describe('Frihet node — contract vs Frihet ERP publicApi d5f3f3cd', () => {
	describe('invoice.markPaid', () => {
		it('pre-fetches the invoice and POSTs /paid only when paymentAuthorityVersion !== 1', async () => {
			// ERP contract: legacy /paid does NOT check paymentAuthorityVersion
			// (publicApi.ts:5827-5859). V1 invoices diverge silently. The
			// node pre-fetches and fails closed on V1.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'markPaid',
					invoiceId: 'inv_legacy',
					markPaidAdditional: { paidDate: '2026-08-15' },
				},
				responseFor: (req) => {
					// First call: GET invoice (pre-fetch)
					if (req.method === 'GET' && req.uri.endsWith('/v1/invoices/inv_legacy')) {
						return { data: { id: 'inv_legacy', status: 'sent', paymentAuthorityVersion: undefined } };
					}
					// Second call: POST /paid
					if (req.method === 'POST' && req.uri.endsWith('/v1/invoices/inv_legacy/paid')) {
						return { data: { success: true, status: 'paid', paidAt: '2026-08-15' } };
					}
					throw new Error(`Unexpected request: ${req.method} ${req.uri}`);
				},
			});

			await new Frihet().execute.call(ctx);

			// Two requests: GET invoice, POST /paid
			expect(captured.length).toBe(2);
			expect(captured[0].method).toBe('GET');
			expect(captured[0].uri).toBe('https://api.frihet.io/v1/invoices/inv_legacy');
			expect(captured[1].method).toBe('POST');
			expect(captured[1].uri).toBe('https://api.frihet.io/v1/invoices/inv_legacy/paid');
			expect(captured[1].body).toEqual({ paidDate: '2026-08-15' });
		});

		it('FAILS CLOSED when invoice has paymentAuthorityVersion=1', async () => {
			// V1 invoices must NOT be touched by the legacy endpoint.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'markPaid',
					invoiceId: 'inv_v1',
					markPaidAdditional: { paidDate: '2026-08-15' },
				},
				responseFor: (req) => {
					if (req.method === 'GET' && req.uri.endsWith('/v1/invoices/inv_v1')) {
						return { data: { id: 'inv_v1', status: 'sent', paymentAuthorityVersion: 1 } };
					}
					throw new Error(`Unexpected request: ${req.method} ${req.uri}`);
				},
			});

			await expect(new Frihet().execute.call(ctx)).rejects.toThrow(/paymentAuthorityVersion=1/);

			// Only the GET was issued. No POST /paid reached the wire.
			expect(captured.length).toBe(1);
			expect(captured[0].method).toBe('GET');
		});

		it('POST /v1/invoices/:id/paid body contains only paidDate (no paymentMethod)', async () => {
			// Even if the user passes a paymentMethod (legacy or template), it
			// must not appear on the wire: the server's strict zod rejects it.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'markPaid',
					invoiceId: 'inv_pm',
					markPaidAdditional: {
						paidDate: '2026-08-15',
						paymentMethod: 'bank_transfer', // <- phantom field on the legacy endpoint
					},
				},
				responseFor: (req) => {
					if (req.method === 'GET') {
						return { data: { id: 'inv_pm', status: 'sent' } };
					}
					return { data: { success: true, status: 'paid', paidAt: '2026-08-15' } };
				},
			});

			await new Frihet().execute.call(ctx);

			const post = captured.find((c) => c.method === 'POST');
			expect(post).toBeDefined();
			expect(post!.body).toEqual({ paidDate: '2026-08-15' });
		});

		it('POST /v1/invoices/:id/paid omits body when no paidDate given', async () => {
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'markPaid',
					invoiceId: 'inv_no_date',
					markPaidAdditional: {},
				},
				responseFor: (req) => {
					if (req.method === 'GET') {
						return { data: { id: 'inv_no_date', status: 'sent' } };
					}
					return { data: { success: true, status: 'paid', paidAt: '2026-08-20' } };
				},
			});

			await new Frihet().execute.call(ctx);

			const post = captured.find((c) => c.method === 'POST');
			expect(post).toBeDefined();
			expect(post!.body).toBeUndefined();
		});
	});

	describe('invoice.send', () => {
		it('POST /v1/invoices/:id/send sends recipientEmail only', async () => {
			// sendSchema (publicApi.ts:5690-5695) is strict zod with
			// recipientEmail REQUIRED. The previous wire field `email` was
			// rejected. The field is now required in the n8n UI.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'send',
					invoiceId: 'inv_789',
					sendEmail: '[email protected]',
				},
				responseFor: () => ({ data: { success: true, messageId: 'msg_xyz' } }),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			expect(req.method).toBe('POST');
			expect(req.uri).toBe('https://api.frihet.io/v1/invoices/inv_789/send');
			expect(req.body).toEqual({ recipientEmail: '[email protected]' });
		});

		it('POST /v1/quotes/:id/send sends recipientEmail only', async () => {
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'quote',
					operation: 'send',
					quoteId: 'q_001',
					sendEmail: '[email protected]',
				},
				responseFor: () => ({ data: { success: true, messageId: 'msg_q' } }),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			expect(req.uri).toBe('https://api.frihet.io/v1/quotes/q_001/send');
			expect(req.body).toEqual({ recipientEmail: '[email protected]' });
		});

		it('THROWS a clear error when recipientEmail is empty (no phantom default fallback)', async () => {
			// B3: the previous description lied — "uses client email by default"
			// was a phantom assumption. The server has no default. We surface
			// a clear NodeOperationError instead of letting the wire 400.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'send',
					invoiceId: 'inv_empty',
					sendEmail: '',
				},
				responseFor: () => ({ data: { success: true, messageId: 'msg_ne' } }),
			});

			await expect(new Frihet().execute.call(ctx)).rejects.toThrow(/recipientEmail is required/);
			// No request hits the wire.
			expect(captured.length).toBe(0);
		});

		it('TRIMS whitespace before sending recipientEmail', async () => {
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'send',
					invoiceId: 'inv_ws',
					sendEmail: '  [email protected]  ',
				},
				responseFor: () => ({ data: { success: true, messageId: 'msg_ws' } }),
			});

			await new Frihet().execute.call(ctx);
			const req = lastRequest(captured);
			expect(req.body).toEqual({ recipientEmail: '[email protected]' });
		});
	});

	describe('invoice.list + pagination', () => {
		it('GET /v1/invoices uses cursor param (not after) and reads nextCursor at root', async () => {
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'list',
					returnAll: false,
					limit: 50,
					after: '',
					filters: { status: 'overdue', q: 'Foo' },
				},
				responseFor: () => ({
					data: [{ id: 'inv_1', documentNumber: 'F2026-0001', total: 100 }],
					total: 1,
					limit: 50,
					offset: 0,
					nextCursor: 'eyJfX2lkIjoiaW52XzEifQ',
				}),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			expect(req.method).toBe('GET');
			expect(req.uri).toBe('https://api.frihet.io/v1/invoices');
			expect(req.qs).toMatchObject({
				limit: 50,
				status: 'overdue',
				q: 'Foo',
			});
			expect(req.qs).not.toHaveProperty('after');
		});

		it('FORWARDS a real cursor value as the cursor query param (not after)', async () => {
			// Real mutation proof: the user passes a base64url cursor from a
			// previous response, and the node forwards it as `cursor` (not
			// `after`). This is the canonical cursor walk.
			const realCursor = 'eyJfX2lkIjoiaW52XzEifQ';
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'list',
					returnAll: false,
					limit: 25,
					after: realCursor,
					filters: {},
				},
				responseFor: () => ({
					data: [{ id: 'inv_2', documentNumber: 'F2026-0002' }],
					total: 1,
					limit: 25,
					offset: 1,
				}),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			expect(req.qs).toMatchObject({
				limit: 25,
				cursor: realCursor,
			});
			// The legacy `after` query param is NOT in the server spec.
			expect(req.qs).not.toHaveProperty('after');
		});

		it('GET /v1/clients paginates with cursor/limit (when returnAll=true)', async () => {
			let page = 0;
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'client',
					operation: 'list',
					returnAll: true,
					limit: 50,
					after: '',
					filters: { stage: 'active' },
				},
				responseFor: () => {
					page += 1;
					if (page === 1) {
						return {
							data: [{ id: 'c_1', name: 'Acme' }],
							total: 2,
							limit: 100,
							offset: 0,
							nextCursor: 'eyJfX2lkIjoiY18xIn0',
						};
					}
					return { data: [], total: 1, limit: 100, offset: 1 };
				},
			});

			await new Frihet().execute.call(ctx);

			expect(captured.length).toBe(2);
			expect(captured[0].qs).toMatchObject({ limit: 100, stage: 'active' });
			expect(captured[0].qs).not.toHaveProperty('cursor');
			expect(captured[1].qs).toMatchObject({
				limit: 100,
				stage: 'active',
				cursor: 'eyJfX2lkIjoiY18xIn0',
			});
		});

		it('SURFACES truncated:true from the q/search path as a synthetic truncated item', async () => {
			// B7: publicApi.ts:7574, :7596 — q/search saturates at 500 docs
			// and returns truncated:true without nextCursor. The previous
			// implementation terminated the loop and silently claimed
			// completeness. The R2 fix appends a `{_truncated:true}` item
			// so the workflow author can detect.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'client',
					operation: 'list',
					returnAll: true,
					limit: 100,
					after: '',
					filters: { q: 'saturate' },
				},
				responseFor: () => ({
					data: [{ id: 'c_1', name: 'Acme' }],
					total: 500,
					limit: 100,
					offset: 0,
					truncated: true, // server saturated at 500 docs
					// NO nextCursor — server says "more exists but I can't page it"
				}),
			});

			const result = await new Frihet().execute.call(ctx);
			const items = result[0].map((item) => item.json);
			const truncated = items.find((it: any) => it._truncated === true) as any;
			expect(truncated).toBeDefined();
			expect(truncated?.reason).toMatch(/saturated/);
			// Only ONE request issued — the loop terminates on truncated:true.
			expect(captured.length).toBe(1);
		});

		it('surfaces truncated:true on a single-page response with items', async () => {
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'list',
					returnAll: false,
					limit: 50,
					after: '',
					filters: {},
				},
				responseFor: () => ({
					data: [{ id: 'inv_1', documentNumber: 'F2026-0001' }],
					total: 500,
					limit: 50,
					offset: 0,
					truncated: true,
				}),
			});

			const result = await new Frihet().execute.call(ctx);
			const items = result[0].map((item) => item.json);
			const truncated = items.find((it: any) => it._truncated === true);
			expect(truncated).toBeDefined();
		});
	});

	describe('invoice.create — strict schema', () => {
		it('POST /v1/invoices sends only fields from the ERP create schema', async () => {
			// ERP contract (publicApi.ts:737-778): strict zod accepts ONLY
			// the listed fields. `clientEmail` and `currency` are NOT in the
			// schema (clientEmail is server-resolved from the client doc;
			// the server defaults currency to 'EUR').
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'create',
					clientName: 'Acme SA',
					items: { item: [{ description: 'Service', quantity: 1, unitPrice: 100 }] },
					invoiceAdditional: {
						clientId: 'c_1',
						taxRate: 21,
						currency: 'EUR', // <- phantom
						clientEmail: '[email protected]', // <- phantom
						notes: 'Stripe pi_123',
					},
				},
				responseFor: () => ({
					data: { id: 'inv_new', documentNumber: 'F2026-0007', total: 121 },
				}),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			expect(req.method).toBe('POST');
			expect(req.uri).toBe('https://api.frihet.io/v1/invoices');
			const allowedKeys = new Set([
				'clientName',
				'clientId',
				'clientAddress',
				'clientTaxId',
				'documentNumber',
				'items',
				'issueDate',
				'dueDate',
				'status',
				'notes',
				'taxRate',
				'irpfRate',
				'equivalenceSurchargeRate',
				'clientLocation',
				'prepayment',
				'seriesId',
				'discountRate',
				'poNumber',
				'operationType',
				'recurring',
			]);
			const sentKeys = Object.keys(req.body ?? {});
			const phantom = sentKeys.filter((k) => !allowedKeys.has(k));
			expect(phantom).toEqual([]);
		});
	});

	describe('request URL & auth header', () => {
		it('uses POST https://api.frihet.io/v1/... and Bearer auth (apiKeyAuth accepts both)', async () => {
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'client',
					operation: 'get',
					clientId: 'c_test',
				},
				responseFor: () => ({ data: { id: 'c_test', name: 'X' } }),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			expect(req.uri).toBe('https://api.frihet.io/v1/clients/c_test');
			expect(req.headers.Authorization).toMatch(/^Bearer fri_/);
			expect(req.headers['Content-Type']).toBe('application/json');
		});

		it('honors a custom baseUrl from credentials', async () => {
			const { ctx, captured } = buildMockContext({
				credentials: {
					apiKey: 'fri_test_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					baseUrl: 'https://staging.frihet.io/',
				},
				params: {
					resource: 'client',
					operation: 'get',
					clientId: 'c_test',
				},
				responseFor: () => ({ data: { id: 'c_test' } }),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			expect(req.uri).toBe('https://staging.frihet.io/v1/clients/c_test');
		});
	});

	describe('error envelope', () => {
		it('preserves the API error envelope format from the server', async () => {
			const { ctx, captured } = buildMockContext({
				credentials: {
					apiKey: 'fri_test_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					baseUrl: 'https://api.frihet.io',
				},
				params: {
					resource: 'client',
					operation: 'get',
					clientId: 'missing',
				},
				responseFor: () => {
					const err: any = new Error('Request failed');
					err.statusCode = 404;
					err.response = { body: { error: 'Client not found', meta: { requestId: 'r-1' } } };
					throw err;
				},
			});

			await expect(new Frihet().execute.call(ctx)).rejects.toThrow(/Client not found/);
			expect(captured.length).toBe(1);
		});
	});

	describe('description.parameters — UI surface vs server contract', () => {
		// The n8n node surfaces the operations via INodeTypeDescription.properties.
		// Any UI option that maps to a non-existent server field is a
		// "phantom" — the workflow author can configure it but the wire
		// either 400s or silently drops it. The contracts between the
		// node UI and the server strict-zod schemas are pinned here.
		it('lists operations matching the 6-resources/33-ops inventory', () => {
			const node = new Frihet();
			const props = node.description.properties;
			const resourceProp = props.find((p) => p.name === 'resource') as any;
			const resources = resourceProp.options.map((o: any) => o.value);
			expect(resources.sort()).toEqual(['client', 'expense', 'invoice', 'product', 'quote', 'vendor']);
		});

		it('invoice.send parameter is required (recipientEmail is REQUIRED server-side)', () => {
			const node = new Frihet();
			const props = node.description.properties;
			const sendEmail = props.find((p) => p.name === 'sendEmail') as any;
			expect(sendEmail).toBeDefined();
			expect(sendEmail.required).toBe(true);
			// The field is bounded to invoice/quote send operations only.
			const show = sendEmail.displayOptions.show;
			expect(show.resource).toEqual(['invoice', 'quote']);
			expect(show.operation).toEqual(['send']);
		});

		it('markPaidAdditional collection does NOT expose paymentMethod (no backend authority)', () => {
			// The R1 description previously allowed a `paymentMethod` selector
			// with values {bank_transfer, cash, card, stripe, paypal, other}.
			// The server's strict zod rejects any unknown key — there is no
			// payment-method field on /paid. The selector is removed.
			const node = new Frihet();
			const props = node.description.properties;
			const markPaid = props.find((p) => p.name === 'markPaidAdditional') as any;
			expect(markPaid).toBeDefined();
			const optionNames = (markPaid.options as any[]).map((o) => o.name);
			expect(optionNames).not.toContain('Payment Method');
		});
	});
});
