import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class FrihetApi implements ICredentialType {
	name = 'frihetApi';
	displayName = 'Frihet API';
	documentationUrl = 'https://docs.frihet.io/api';
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
