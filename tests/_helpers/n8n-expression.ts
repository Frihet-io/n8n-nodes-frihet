/**
 * n8n-expression-runner — minimal evaluator for the expressions embedded
 * in `={{ ... }}` and `{{ ... }}` forms inside workflow templates.
 *
 * We use Node's `vm` module to actually EXECUTE the JS expressions
 * (rather than static-analyze them) so the templates' literal
 * behavior is observed against the real Frihet webhook payload.
 *
 * Limits:
 *  - The Liquid pipe `|` (e.g. `| trim`) is preprocessed into a JS
 *    bitwise OR with a sandboxed helper. We do NOT support every
 *    Liquid filter; only `trim`, `default`, and `json` are mapped.
 *  - `$json`, `$env`, `$('NodeName').item.json` are populated from
 *    the caller's fixture.
 *
 * This is intentionally smaller than n8n's real expression engine.
 * What it DOES catch is the classes of bug the templates actually
 * exhibit: references to `$json.body.event` (server doesn't emit),
 * `$json.id` on a response that has no `id` (markPaid), and the
 * `| trim` Liquid-in-JS expression pattern.
 */
import * as vm from 'vm';

export interface ExecutionContext {
	json: any;
	headers?: Record<string, string>;
	query?: Record<string, string>;
	env?: Record<string, string>;
	prevNodes?: Record<string, { item: { json: any } }>;
}

const LIQUID_FILTERS: Record<string, (val: any, ...args: any[]) => any> = {
	trim: (val: any) => (typeof val === 'string' ? val.trim() : val),
	default: (val: any, fallback: any) => (val === undefined || val === null || val === '' ? fallback : val),
	json: (val: any) => JSON.stringify(val),
};

/**
 * Replace Liquid-style `| filter` with a JS-compatible form. We use a
 * simple regex on the JS expression body (between `{{` and `}}`) and
 * only touch the `| FILTER` patterns where the filter is known.
 */
function preprocessLiquid(expression: string): string {
	// Replace `EXPR | filter` with `LIQUID_FILTERS.filter(EXPR)`.
	// Order matters: liquid pipes are LEFT-associative.
	const filterPattern = /([\s\S(|]+?)\s*\|\s*([a-z_]+)\b/g;
	let prev = '';
	let cur = expression;
	// Loop until no more replacement happens.
	while (cur !== prev) {
		prev = cur;
		cur = cur.replace(filterPattern, (m, lhs, name) => {
			const fn = LIQUID_FILTERS[name];
			if (!fn) return m; // unknown filter — leave as-is so the runtime throws
			return `${fn.name}((${lhs}).trim !== undefined ? (${lhs}).toString() : (${lhs}))`;
		});
	}
	return cur;
}

/**
 * Evaluate a `{{ ... }}` or `={{ ... }}` template literal.
 * - If the expression starts with `=`, the result is returned as-is
 *   (JS expression). Otherwise it is coerced to string.
 */
export function evaluateExpression(raw: string, ctx: ExecutionContext): { ok: true; value: any } | { ok: false; error: string } {
	const trimmed = raw.trim();
	const isJs = trimmed.startsWith('={'); // `={{ ... }}` form
	// Strip the outer `{{ }}` or `={{ }}` to get the inner expression.
	const inner = trimmed.replace(/^=?\s*\{\{([\s\S]*?)\}\}\s*$/, '$1').trim();
	if (inner === '') {
		return { ok: true, value: '' };
	}
	const preprocessed = preprocessLiquid(inner);

	const sandbox = {
		$json: ctx.json,
		$headers: ctx.headers ?? {},
		$query: ctx.query ?? {},
		$env: ctx.env ?? {},
		$node: ctx.prevNodes ?? {},
		// Liquid filter functions are exposed as top-level names.
		...LIQUID_FILTERS,
		// n8n helper: ($('NodeName').item.json)
		$: (name: string) => ctx.prevNodes?.[name] ?? ({ item: { json: undefined } }),
		// JSON helpers
		JSON: { parse: (s: string) => JSON.parse(s), stringify: (v: any) => JSON.stringify(v) },
		// Date for date math
		Date,
		Math,
	};
	try {
		const result = vm.runInNewContext(preprocessed, sandbox, {
			timeout: 250,
			displayErrors: false,
		});
		if (!isJs) {
			if (result === null || result === undefined) return { ok: true, value: '' };
			if (typeof result === 'object') return { ok: true, value: JSON.stringify(result) };
			return { ok: true, value: String(result) };
		}
		return { ok: true, value: result };
	} catch (e: any) {
		return { ok: false, error: e?.message ?? String(e) };
	}
}
