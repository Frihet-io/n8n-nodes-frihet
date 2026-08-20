/**
 * Contract tests — drives the actual Frihet node execute() against the
 * canonical ERP publicApi schema. The authority is berthelius/Frihet-ERP
 * origin/main = f901d4292dfd20438de34e21795f27683beaeb37.
 *
 * Each test reproduces a real defect observed in the n8n node vs the live
 * server contract. RED tests pin the contract; fixes turn them GREEN.
 */
import { Frihet } from '../../nodes/Frihet/Frihet.node';
import { buildMockContext, lastRequest, type CapturedRequest } from '../_helpers/n8n-mock';

describe('Frihet node — contract vs Frihet ERP publicApi f901d4292', () => {
	describe('invoice.markPaid', () => {
		it('POST /v1/invoices/:id/paid sends ONLY paidDate (no paymentMethod)', async () => {
			// ERP contract (publicApi.ts:5832-5834): strict zod schema with only
			// paidDate. Any unknown key returns 400.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'markPaid',
					invoiceId: 'inv_123',
					markPaidAdditional: {
						paidDate: '2026-08-15',
						paymentMethod: 'bank_transfer', // <- phantom field — must be ignored
					},
				},
				responseFor: () => ({
					data: { success: true, status: 'paid', paidAt: '2026-08-15' },
				}),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			// Pin the route
			expect(req.method).toBe('POST');
			expect(req.uri).toBe('https://api.frihet.io/v1/invoices/inv_123/paid');
			// Pin the body shape — server rejects unknown keys
			expect(Object.keys(req.body).sort()).toEqual(['paidDate']);
			expect(req.body).toEqual({ paidDate: '2026-08-15' });
		});

		it('POST /v1/invoices/:id/paid omits body when no paidDate given', async () => {
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'markPaid',
					invoiceId: 'inv_456',
					markPaidAdditional: {},
				},
				responseFor: () => ({
					data: { success: true, status: 'paid', paidAt: '2026-08-20' },
				}),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			expect(req.method).toBe('POST');
			expect(req.uri).toBe('https://api.frihet.io/v1/invoices/inv_456/paid');
			// No body sent (omit empty body to match the helper's request contract)
			expect(req.body).toBeUndefined();
		});
	});

	describe('invoice.send', () => {
		it('POST /v1/invoices/:id/send uses recipientEmail (not email)', async () => {
			// ERP contract (publicApi.ts:5690-5695): sendSchema is strict zod
			// requiring recipientEmail. Unknown keys (incl. "email") return 400.
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
			// Server expects recipientEmail, not email
			expect(req.body).toEqual({ recipientEmail: '[email protected]' });
		});

		it('POST /v1/quotes/:id/send uses recipientEmail (not email)', async () => {
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

		it('POST /v1/invoices/:id/send can omit body when no recipient override', async () => {
			// Server defaults to client's email, so the node should NOT send
			// an empty body. Currently the node sends { email: '' } — server rejects.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'send',
					invoiceId: 'inv_empty',
					sendEmail: '',
				},
				responseFor: () => ({ data: { success: true, messageId: 'msg_ne' } }),
			});

			await new Frihet().execute.call(ctx);

			const req = lastRequest(captured);
			// recipientEmail is required by server; if we don't have one, the
			// node should NOT send a request with an empty value (server will 400).
			// Per the contract: sendSchema has recipientEmail REQUIRED, so the
			// node must either send a populated value or surface an error here.
			// For now: the node omits the body — caller must always supply
			// recipientEmail or the server rejects.
			expect(req.body).toBeUndefined();
		});
	});

	describe('invoice.list + pagination', () => {
		it('GET /v1/invoices uses cursor param (not after) and reads nextCursor at root', async () => {
			// ERP contract (publicApi.ts:7642-7705): cursor is base64url-encoded
			// JSON {__id: <docId>}. Response: { data, total, limit, offset, nextCursor }.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'list',
					returnAll: false,
					limit: 50,
					after: '', // user did not supply a cursor
					filters: {
						status: 'overdue',
						q: 'Foo',
					},
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
			// Query string uses limit + the server-supported filters
			expect(req.qs).toMatchObject({
				limit: 50,
				status: 'overdue',
				q: 'Foo',
			});
			// The node must NOT send `after` — that name is not in the server spec.
			expect(req.qs).not.toHaveProperty('after');
		});

		it('GET /v1/clients paginates with cursor/limit (when returnAll=true)', async () => {
			// We feed two server pages and assert the node re-issues a second
			// request with the cursor from the first response. The node uses
			// limit=100 (the server's max) when returnAll=true and pages
			// until `nextCursor` is absent.
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
				responseFor: (req) => {
					page += 1;
					if (page === 1) {
						// Full page → cursor present
						return {
							data: [{ id: 'c_1', name: 'Acme' }],
							total: 2,
							limit: 100,
							offset: 0,
							nextCursor: 'eyJfX2lkIjoiY18xIn0',
						};
					}
					// Last page (empty) → no cursor
					return {
						data: [],
						total: 1,
						limit: 100,
						offset: 1,
					};
				},
			});

			await new Frihet().execute.call(ctx);

			// Two GETs in total
			expect(captured.length).toBe(2);
			// First page: no cursor, page-size 100 (server max)
			expect(captured[0].qs).toMatchObject({
				limit: 100,
				stage: 'active',
			});
			expect(captured[0].qs).not.toHaveProperty('cursor');
			// Second page: cursor set from previous response — server returns
			// `nextCursor` at the response root, so the node must read it there.
			expect(captured[1].qs).toMatchObject({
				limit: 100,
				stage: 'active',
				cursor: 'eyJfX2lkIjoiY18xIn0',
			});
		});
	});

	describe('invoice.create — strict schema', () => {
		it('POST /v1/invoices sends only fields from the ERP create schema', async () => {
			// ERP contract (publicApi.ts:737-778): strict zod accepts ONLY
			// clientName, clientId, clientAddress, clientTaxId, documentNumber,
			// items, issueDate, dueDate, status, notes, taxRate, irpfRate,
			// equivalenceSurchargeRate, clientLocation, prepayment, seriesId,
			// discountRate, poNumber, operationType, recurring. Plus the implicit
			// snapshot fields clientEmail, clientTaxId, clientAddress, clientLocation.
			// Anything else (e.g. `--VCARD--currency`, `--VCARD--clientEmail`) is rejected.
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'create',
					clientName: 'Acme SA',
					items: { item: [{ description: 'Service', quantity: 1, unitPrice: 100 }] },
					invoiceAdditional: {
						clientId: 'c_1',
						taxRate: 21,
						currency: 'EUR', // <- phantom field — must be stripped
						clientEmail: '[email protected]', // <- snapshot from client doc — must be stripped here
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
			// Body must contain only the schema-allowed keys.
			// Server schema (publicApi.ts:737-778) is strict zod and rejects
			// unknown keys. `clientEmail` and `currency` are NOT in the schema
			// (clientEmail is server-resolved from the client doc; the server
			// defaults currency to 'EUR' on its own — never accepts it from
			// the create body).
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
			// apiKeyAuth extracts both X-API-Key and Bearer.
			// The Authorized header is acceptable because the server also accepts
			// Authorization: Bearer <fri_...> (see apiKeyAuth.ts:14-19).
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
				// Server returns 404 with { error: 'Client not found', meta: { requestId } }
				responseFor: () => {
					const err: any = new Error('Request failed');
					err.statusCode = 404;
					err.response = { body: { error: 'Client not found', meta: { requestId: 'r-1' } } };
					throw err;
				},
			});

			await expect(new Frihet().execute.call(ctx)).rejects.toThrow(/Client not found/);
			// Sanity: the request was issued
			expect(captured.length).toBe(1);
		});
	});
});
