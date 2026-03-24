"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrihetApi = void 0;
class FrihetApi {
    constructor() {
        this.name = 'frihetApi';
        this.displayName = 'Frihet API';
        this.documentationUrl = 'https://docs.frihet.io/api';
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
