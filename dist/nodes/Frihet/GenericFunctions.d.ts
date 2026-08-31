import { IDataObject, IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';
/**
 * Make an authenticated request to the Frihet REST API.
 * Automatically prepends /v1 and injects Bearer auth header.
 */
export declare function frihetApiRequest(this: IExecuteFunctions, method: IHttpRequestMethods, endpoint: string, body?: IDataObject, qs?: IDataObject): Promise<any>;
