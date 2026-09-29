import { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties, Icon } from 'n8n-workflow';
export declare class FrihetApi implements ICredentialType {
    name: string;
    displayName: string;
    documentationUrl: string;
    icon: Icon;
    authenticate: IAuthenticateGeneric;
    test: ICredentialTestRequest;
    properties: INodeProperties[];
}
