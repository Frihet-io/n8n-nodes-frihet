import {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
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
): Promise<IDataObject> {
	const credentials = await this.getCredentials('frihetApi');
	const baseUrl = ((credentials.baseUrl as string) || 'https://api.frihet.io').replace(/\/$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/v1${endpoint}`,
		headers: {
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
		return await this.helpers.httpRequestWithAuthentication.call(this, 'frihetApi', options);
	} catch (error: unknown) {
		const apiError = error as {
			response?: { body?: { error?: string; message?: string }; data?: { error?: string; message?: string }; statusCode?: number; status?: number };
			message?: string;
			statusCode?: number;
		};
		// Unwrap Frihet API error envelope
		const errorMessage =
			apiError?.response?.body?.error ||
			apiError?.response?.body?.message ||
			apiError?.response?.data?.error ||
			apiError?.response?.data?.message ||
			apiError?.message ||
			'Unknown error';
		const statusCode = apiError?.statusCode || apiError?.response?.statusCode || apiError?.response?.status;
		throw new NodeApiError(this.getNode(), (error instanceof Error ? error : { message: String(error) }) as JsonObject, {
			message: `Frihet API error${statusCode ? ` (${statusCode})` : ''}: ${errorMessage}`,
		});
	}
}
