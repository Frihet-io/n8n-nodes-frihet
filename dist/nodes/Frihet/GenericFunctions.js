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
    }
    catch (error) {
        // Unwrap Frihet API error envelope
        const errorMessage = error?.response?.body?.error ||
            error?.response?.body?.message ||
            error?.message ||
            'Unknown error';
        const statusCode = error?.statusCode || error?.response?.statusCode;
        throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
            message: `Frihet API error${statusCode ? ` (${statusCode})` : ''}: ${errorMessage}`,
        });
    }
}
