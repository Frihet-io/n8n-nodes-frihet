import { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class FrihetApi implements ICredentialType {
	name = 'frihetApi';
	displayName = 'Frihet API';
	documentationUrl = 'https://docs.frihet.io/desarrolladores/api-rest';

	icon: Icon = { light: 'file:../nodes/Frihet/frihet.svg', dark: 'file:../nodes/Frihet/frihet.svg' };

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://api.frihet.io"}}',
			url: '/v1/clients',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Frihet API key. Generate one in Frihet: Settings → API → Generate API Key. Keys start with fri_',
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
