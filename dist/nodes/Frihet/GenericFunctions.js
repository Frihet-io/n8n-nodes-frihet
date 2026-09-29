"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.frihetApiRequest = frihetApiRequest;
const n8n_workflow_1 = require("n8n-workflow");
/**
 * Make an authenticated request to the Frihet REST API.
 * Automatically prepends /v1 and injects Bearer auth header.
 */
async function frihetApiRequest(method, endpoint, body, qs) {
    const credentials = await this.getCredentials('frihetApi');
    const baseUrl = (credentials.baseUrl || 'https://api.frihet.io').replace(/\/$/, '');
    const options = {
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
    }
    catch (error) {
        const apiError = error;
        // Unwrap Frihet API error envelope
        const errorMessage = apiError?.response?.body?.error ||
            apiError?.response?.body?.message ||
            apiError?.response?.data?.error ||
            apiError?.response?.data?.message ||
            apiError?.message ||
            'Unknown error';
        const statusCode = apiError?.statusCode || apiError?.response?.statusCode || apiError?.response?.status;
        throw new n8n_workflow_1.NodeApiError(this.getNode(), (error instanceof Error ? error : { message: String(error) }), {
            message: `Frihet API error${statusCode ? ` (${statusCode})` : ''}: ${errorMessage}`,
        });
    }
}
