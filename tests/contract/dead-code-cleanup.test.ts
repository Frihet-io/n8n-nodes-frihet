/**
 * Cross-surface dead-code cleanup — pins the post-1.0.2 mechanical cleanup
 * PR. Three facts must hold:
 *
 *   1. `frihetApiRequestAllItems` is NOT exported from GenericFunctions.ts.
 *      It was dead code (imported in Frihet.node.ts but never invoked) and
 *      carried two stale assertions: a legacy `after` param name and a
 *      `meta.nextCursor` doc comment that contradicted the actual ERP
 *      response shape (root `nextCursor`). The execute() method inlines
 *      its own cursor walk — the helper had no remaining caller.
 *
 *   2. Frihet.node.ts no longer imports `frihetApiRequestAllItems`. A
 *      stale import would have re-introduced the same dead function
 *      into the bundled node output.
 *
 *   3. The list-operation pagination parameter exposes `name: 'cursor'`
 *      and `displayName: 'Cursor'`. The R1 wire fix already used `cursor`
 *      end-to-end; this surfaces the canonical name in the n8n UI
 *      (previously: `name: 'after'`, `displayName: 'Cursor (After)'`).
 *
 * Together these three facts guarantee the cleanup holds and that
 * future regressions — re-introducing the helper, re-adding the `after`
 * alias, or relabelling the UI parameter — are caught here.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Frihet } from '../../nodes/Frihet/Frihet.node';
import * as GenericFunctions from '../../nodes/Frihet/GenericFunctions';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('chore(n8n): cross-surface dead-code cleanup', () => {
	describe('1. frihetApiRequestAllItems is no longer exported', () => {
		it('GenericFunctions module does NOT export frihetApiRequestAllItems', () => {
			expect((GenericFunctions as any).frihetApiRequestAllItems).toBeUndefined();
		});

		it('GenericFunctions source file does NOT define the function (text check)', () => {
			const src = fs.readFileSync(
				path.join(REPO_ROOT, 'nodes/Frihet/GenericFunctions.ts'),
				'utf8',
			);
			expect(src).not.toMatch(/frihetApiRequestAllItems/);
		});

		it('GenericFunctions source file does NOT carry the legacy `after` param name (text check)', () => {
			// The dead helper accepted `after?: string`; if any caller still
			// references that param name elsewhere in this file, the
			// cleanup is incomplete.
			const src = fs.readFileSync(
				path.join(REPO_ROOT, 'nodes/Frihet/GenericFunctions.ts'),
				'utf8',
			);
			expect(src).not.toMatch(/\bafter\b/);
		});
	});

	describe('2. Frihet.node.ts no longer imports the dead helper', () => {
		it('Frihet.node.ts source does NOT import frihetApiRequestAllItems (text check)', () => {
			const src = fs.readFileSync(
				path.join(REPO_ROOT, 'nodes/Frihet/Frihet.node.ts'),
				'utf8',
			);
			expect(src).not.toMatch(/frihetApiRequestAllItems/);
		});
	});

	describe('3. list-operation pagination parameter is `cursor` / `Cursor`', () => {
		let listCursorParam: any;
		let cursorAfterParam: any;
		let oldAfterParam: any;

		beforeAll(() => {
			const node = new Frihet();
			const props = node.description.properties as any[];
			// The cursor parameter is shared across all 6 list operations
			// (invoice.list, expense.list, client.list, product.list,
			// vendor.list, quote.list) — it appears once on the node
			// because displayOptions handle visibility.
			listCursorParam = props.find((p) => p.name === 'cursor');
			cursorAfterParam = props.find((p) => p.name === 'cursor' && p.displayName === 'Cursor (After)');
			oldAfterParam = props.find((p) => p.name === 'after');
		});

		it('declares a `cursor` parameter on the node description', () => {
			expect(listCursorParam).toBeDefined();
			expect(listCursorParam.type).toBe('string');
			expect(listCursorParam.default).toBe('');
		});

		it('uses the canonical displayName "Cursor" (NOT "Cursor (After)")', () => {
			expect(listCursorParam.displayName).toBe('Cursor');
			expect(cursorAfterParam).toBeUndefined();
		});

		it('is only visible on list operations where returnAll=false', () => {
			expect(listCursorParam.displayOptions.show.operation).toEqual(['list']);
			expect(listCursorParam.displayOptions.show.returnAll).toEqual([false]);
		});

		it('does NOT declare a legacy `after` parameter', () => {
			expect(oldAfterParam).toBeUndefined();
		});
	});

	describe('4. execute() reads the renamed parameter', () => {
		// Wire-shape regression guard. After the cleanup, the canonical
		// cursor walk in execute() must consume `cursor` (not `after`) so
		// that a workflow author typing a real base64url cursor in the UI
		// has it forwarded as `?cursor=...` on the wire.
		it('forwards the UI cursor parameter to ?cursor=...', async () => {
			// Lazy-import the harness so the same test file can pin both
			// the source-text checks and the runtime wire check.
			const { buildMockContext, lastRequest } = require('../_helpers/n8n-mock');

			const realCursor = 'eyJfX2lkIjoiaW52XzEifQ';
			const { ctx, captured } = buildMockContext({
				params: {
					resource: 'invoice',
					operation: 'list',
					returnAll: false,
					limit: 25,
					cursor: realCursor,
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
			expect(req.qs).toMatchObject({ cursor: realCursor, limit: 25 });
			expect(req.qs).not.toHaveProperty('after');
		});
	});
});