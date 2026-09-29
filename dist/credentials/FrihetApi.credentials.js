"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrihetApi = void 0;
class FrihetApi {
    constructor() {
        this.name = 'frihetApi';
        this.displayName = 'Frihet API';
        this.documentationUrl = 'https://docs.frihet.io/desarrolladores/api-rest';
        this.icon = { light: 'file:../nodes/Frihet/frihet.svg', dark: 'file:../nodes/Frihet/frihet.svg' };
        this.authenticate = {
            type: 'generic',
            properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.baseUrl || "https://api.frihet.io"}}',
                url: '/v1/clients',
                method: 'GET',
                qs: { limit: 1 },
            },
        };
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                description: 'Your Frihet API key. Generate one in Frihet: Settings → API → Generate API Key. Keys start with fri_',
            },
            {
                displayName: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                default: 'https://api.frihet.io',
                description: 'API base URL. Change only for self-hosted Frihet deployments.',
            },
        ];
    }
}
exports.FrihetApi = FrihetApi;
