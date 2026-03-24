import {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IRequestOptions,
	NodeApiError,
} from 'n8n-workflow';

/**
 * Make an authenticated request to the Frihet REST API.
 * Automatically prepends /v1 and injects Bearer auth header.
 */
export async function frihetApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<any> {
	const credentials = await this.getCredentials('frihetApi');
	const baseUrl = ((credentials.baseUrl as string) || 'https://api.frihet.io').replace(/\/$/, '');

	const options: IRequestOptions = {
		method,
		uri: `${baseUrl}/v1${endpoint}`,
		headers: {
			Authorization: `Bearer ${credentials.apiKey}`,
			'Content-Type': 'application/json',
		},
		body,
		qs,
		json: true,
	};

	// Remove undefined body for GET/DELETE
	if (!body || Object.keys(body).length === 0) {
		delete options.body;
	}

	try {
		return await this.helpers.request(options);
	} catch (error: any) {
		// Unwrap Frihet API error envelope
		const errorMessage =
			error?.response?.body?.error ||
			error?.response?.body?.message ||
			error?.message ||
			'Unknown error';
		const statusCode = error?.statusCode || error?.response?.statusCode;
		throw new NodeApiError(this.getNode(), error, {
			message: `Frihet API error${statusCode ? ` (${statusCode})` : ''}: ${errorMessage}`,
		});
	}
}

/**
 * Make a paginated list request, following cursor-based pagination.
 * Returns all items if returnAll is true, otherwise returns one page.
 */
export async function frihetApiRequestAllItems(
	this: IExecuteFunctions,
	endpoint: string,
	qs: Record<string, any> = {},
	limit?: number,
	after?: string,
): Promise<any[]> {
	const params: Record<string, any> = { ...qs };
	if (limit) params.limit = limit;
	if (after) params.after = after;

	const response = await frihetApiRequest.call(this, 'GET', endpoint, undefined, params);

	// Frihet API returns { data: [...], meta: { nextCursor, hasMore, ... } }
	return response?.data ?? response ?? [];
}
