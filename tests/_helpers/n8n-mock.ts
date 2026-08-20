/**
 * n8n-mock — minimal IExecuteFunctions harness for the contract test suite.
 *
 * Drives the actual Frihet node execute() code against a fake transport so we
 * can pin the request shapes that the ERP publicApi accepts. The publicApi
 * canonical authority is at berthelius/Frihet-ERP origin/main = f901d4292.
 *
 * Pattern: each test sets up a `params` map and a `responseFor(request)` that
 * returns canned server responses. The harness captures every HTTP request
 * through `this.helpers.request` so assertions can compare the wire shape
 * against the documented zod schemas in publicApi.ts.
 */
import {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INode,
	INodeCredentialsDetails,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';

export interface CapturedRequest {
	method: string;
	uri: string;
	headers: Record<string, string>;
	body?: any;
	qs?: Record<string, any>;
}

export interface MockOptions {
	/** Parameters to expose via getNodeParameter(name, index). */
	params: Record<string, any>;
	/** Credentials to return from getCredentials(). */
	credentials?: ICredentialDataDecryptedObject;
	/** Continue-on-fail toggle. */
	continueOnFail?: boolean;
	/** Per-call response stub. Resolves with the canned data. */
	responseFor: (req: CapturedRequest) => any;
	/** Input items (default: one empty item). */
	inputItems?: INodeExecutionData[];
}

const NODE: INode = {
	id: 'test',
	name: 'Frihet',
	type: 'n8n-nodes-frihet.frihet',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
	credentials: { frihetApi: { id: 'cred-1', name: 'Frihet' } },
};

/**
 * Build a mock IExecuteFunctions that:
 *  - Returns `params[<name>]` from getNodeParameter
 *  - Returns `credentials` from getCredentials
 *  - Captures every request body and returns the stubbed response
 *  - Implements continueOnFail, getNode, helpers.returnJsonArray
 */
export function buildMockContext(options: MockOptions): {
	ctx: IExecuteFunctions;
	captured: CapturedRequest[];
} {
	const captured: CapturedRequest[] = [];
	const inputItems = options.inputItems ?? [{ json: {} }];

	const ctx = {
		getInputData: () => inputItems,
		getNodeParameter: (name: string, _index: number, fallback?: any) => {
			if (Object.prototype.hasOwnProperty.call(options.params, name)) {
				return options.params[name];
			}
			return fallback;
		},
		getCredentials: async (_type: string) => {
			return (
				options.credentials ?? {
					apiKey: 'fri_test_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					baseUrl: 'https://api.frihet.io',
				}
			);
		},
		continueOnFail: () => options.continueOnFail ?? false,
		getNode: () => NODE,
		helpers: {
			request: async (opts: any) => {
				const req: CapturedRequest = {
					method: opts.method,
					uri: opts.uri,
					headers: { ...(opts.headers ?? {}) },
					body: opts.body,
					qs: opts.qs,
				};
				captured.push(req);
				return options.responseFor(req);
			},
			returnJsonArray: (data: IDataObject[]) => data.map((d) => ({ json: d })),
		},
	} as unknown as IExecuteFunctions;

	return { ctx, captured };
}

/**
 * Convert any object body to JSON-encoded shape expected by the wire.
 * Mirrors what options helpers.request does (json: true).
 */
export function jsonBody(req: CapturedRequest): any {
	return req.body;
}

/**
 * Convenience: assert the request captured the expected attributes.
 */
export function lastRequest(captured: CapturedRequest[]): CapturedRequest {
	if (captured.length === 0) {
		throw new Error('No HTTP request was captured — the node may have skipped the call');
	}
	return captured[captured.length - 1];
}
