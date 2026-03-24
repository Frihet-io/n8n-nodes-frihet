import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	NodeOperationError,
} from 'n8n-workflow';
import { frihetApiRequest, frihetApiRequestAllItems } from './GenericFunctions';

export class Frihet implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Frihet',
		name: 'frihet',
		icon: 'file:frihet.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'AI-native ERP — invoices, expenses, clients, products, quotes, and vendors',
		defaults: { name: 'Frihet' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'frihetApi', required: true }],
		properties: [
			// =====================================================================
			// Resource selector
			// =====================================================================
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Client', value: 'client' },
					{ name: 'Expense', value: 'expense' },
					{ name: 'Invoice', value: 'invoice' },
					{ name: 'Product', value: 'product' },
					{ name: 'Quote', value: 'quote' },
					{ name: 'Vendor', value: 'vendor' },
				],
				default: 'invoice',
				description: 'The Frihet resource to operate on',
			},

			// =====================================================================
			// INVOICE operations
			// =====================================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['invoice'] } },
				options: [
					{ name: 'Create', value: 'create', description: 'Create a new invoice', action: 'Create an invoice' },
					{ name: 'Delete', value: 'delete', description: 'Delete an invoice', action: 'Delete an invoice' },
					{ name: 'Get', value: 'get', description: 'Retrieve a single invoice by ID', action: 'Get an invoice' },
					{ name: 'List', value: 'list', description: 'List invoices with optional filters', action: 'List invoices' },
					{ name: 'Mark Paid', value: 'markPaid', description: 'Mark an invoice as paid', action: 'Mark invoice as paid' },
					{ name: 'Send', value: 'send', description: 'Send an invoice by email', action: 'Send an invoice' },
					{ name: 'Update', value: 'update', description: 'Update an invoice (partial)', action: 'Update an invoice' },
				],
				default: 'create',
			},

			// =====================================================================
			// QUOTE operations
			// =====================================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['quote'] } },
				options: [
					{ name: 'Create', value: 'create', description: 'Create a new quote', action: 'Create a quote' },
					{ name: 'Delete', value: 'delete', description: 'Delete a quote', action: 'Delete a quote' },
					{ name: 'Get', value: 'get', description: 'Retrieve a single quote by ID', action: 'Get a quote' },
					{ name: 'List', value: 'list', description: 'List quotes with optional filters', action: 'List quotes' },
					{ name: 'Send', value: 'send', description: 'Send a quote by email', action: 'Send a quote' },
					{ name: 'Update', value: 'update', description: 'Update a quote (partial)', action: 'Update a quote' },
				],
				default: 'create',
			},

			// =====================================================================
			// EXPENSE operations
			// =====================================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['expense'] } },
				options: [
					{ name: 'Create', value: 'create', description: 'Create a new expense', action: 'Create an expense' },
					{ name: 'Delete', value: 'delete', description: 'Delete an expense', action: 'Delete an expense' },
					{ name: 'Get', value: 'get', description: 'Retrieve a single expense by ID', action: 'Get an expense' },
					{ name: 'List', value: 'list', description: 'List expenses with optional filters', action: 'List expenses' },
					{ name: 'Update', value: 'update', description: 'Update an expense (partial)', action: 'Update an expense' },
				],
				default: 'create',
			},

			// =====================================================================
			// CLIENT operations
			// =====================================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['client'] } },
				options: [
					{ name: 'Create', value: 'create', description: 'Create a new client', action: 'Create a client' },
					{ name: 'Delete', value: 'delete', description: 'Delete a client', action: 'Delete a client' },
					{ name: 'Get', value: 'get', description: 'Retrieve a single client by ID', action: 'Get a client' },
					{ name: 'List', value: 'list', description: 'List clients with optional filters', action: 'List clients' },
					{ name: 'Update', value: 'update', description: 'Update a client (partial)', action: 'Update a client' },
				],
				default: 'create',
			},

			// =====================================================================
			// PRODUCT operations
			// =====================================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['product'] } },
				options: [
					{ name: 'Create', value: 'create', description: 'Create a new product', action: 'Create a product' },
					{ name: 'Delete', value: 'delete', description: 'Delete a product', action: 'Delete a product' },
					{ name: 'Get', value: 'get', description: 'Retrieve a single product by ID', action: 'Get a product' },
					{ name: 'List', value: 'list', description: 'List products with optional filters', action: 'List products' },
					{ name: 'Update', value: 'update', description: 'Update a product (partial)', action: 'Update a product' },
				],
				default: 'create',
			},

			// =====================================================================
			// VENDOR operations
			// =====================================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['vendor'] } },
				options: [
					{ name: 'Create', value: 'create', description: 'Create a new vendor', action: 'Create a vendor' },
					{ name: 'Delete', value: 'delete', description: 'Delete a vendor', action: 'Delete a vendor' },
					{ name: 'Get', value: 'get', description: 'Retrieve a single vendor by ID', action: 'Get a vendor' },
					{ name: 'List', value: 'list', description: 'List vendors with optional filters', action: 'List vendors' },
					{ name: 'Update', value: 'update', description: 'Update a vendor (partial)', action: 'Update a vendor' },
				],
				default: 'create',
			},

			// =====================================================================
			// SHARED: ID field for Get / Delete / Update / Send / MarkPaid
			// =====================================================================
			{
				displayName: 'Invoice ID',
				name: 'invoiceId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['get', 'delete', 'update', 'send', 'markPaid'],
					},
				},
				description: 'The ID of the invoice',
			},
			{
				displayName: 'Quote ID',
				name: 'quoteId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['quote'],
						operation: ['get', 'delete', 'update', 'send'],
					},
				},
				description: 'The ID of the quote',
			},
			{
				displayName: 'Expense ID',
				name: 'expenseId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['expense'],
						operation: ['get', 'delete', 'update'],
					},
				},
				description: 'The ID of the expense',
			},
			{
				displayName: 'Client ID',
				name: 'clientId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['get', 'delete', 'update'],
					},
				},
				description: 'The ID of the client',
			},
			{
				displayName: 'Product ID',
				name: 'productId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['product'],
						operation: ['get', 'delete', 'update'],
					},
				},
				description: 'The ID of the product',
			},
			{
				displayName: 'Vendor ID',
				name: 'vendorId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['vendor'],
						operation: ['get', 'delete', 'update'],
					},
				},
				description: 'The ID of the vendor',
			},

			// =====================================================================
			// INVOICE / QUOTE CREATE — required fields
			// =====================================================================
			{
				displayName: 'Client Name',
				name: 'clientName',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice', 'quote'],
						operation: ['create'],
					},
				},
				description: 'Name of the client (required even when clientId is provided)',
			},
			{
				displayName: 'Items',
				name: 'items',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				required: true,
				default: {},
				displayOptions: {
					show: {
						resource: ['invoice', 'quote'],
						operation: ['create'],
					},
				},
				description: 'Line items on the invoice or quote',
				options: [
					{
						displayName: 'Item',
						name: 'item',
						values: [
							{
								displayName: 'Description',
								name: 'description',
								type: 'string',
								default: '',
								description: 'Description of the line item',
							},
							{
								displayName: 'Quantity',
								name: 'quantity',
								type: 'number',
								default: 1,
								description: 'Quantity',
							},
							{
								displayName: 'Unit Price',
								name: 'unitPrice',
								type: 'number',
								default: 0,
								description: 'Unit price (excluding tax)',
							},
						],
					},
				],
			},

			// =====================================================================
			// EXPENSE CREATE — required fields
			// =====================================================================
			{
				displayName: 'Description',
				name: 'expenseDescription',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['expense'],
						operation: ['create'],
					},
				},
				description: 'Description of the expense',
			},
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				required: true,
				default: 0,
				displayOptions: {
					show: {
						resource: ['expense'],
						operation: ['create'],
					},
				},
				description: 'Expense amount (total including tax)',
			},

			// =====================================================================
			// CLIENT CREATE — required fields
			// =====================================================================
			{
				displayName: 'Name',
				name: 'clientName',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['create'],
					},
				},
				description: 'Name of the client (company or individual)',
			},

			// =====================================================================
			// PRODUCT CREATE — required fields
			// =====================================================================
			{
				displayName: 'Name',
				name: 'productName',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['product'],
						operation: ['create'],
					},
				},
				description: 'Name of the product or service',
			},
			{
				displayName: 'Unit Price',
				name: 'unitPrice',
				type: 'number',
				required: true,
				default: 0,
				displayOptions: {
					show: {
						resource: ['product'],
						operation: ['create'],
					},
				},
				description: 'Unit price of the product (excluding tax)',
			},

			// =====================================================================
			// VENDOR CREATE — required fields
			// =====================================================================
			{
				displayName: 'Name',
				name: 'vendorName',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['vendor'],
						operation: ['create'],
					},
				},
				description: 'Name of the vendor',
			},

			// =====================================================================
			// LIST — pagination + filter fields
			// =====================================================================
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { operation: ['list'] },
				},
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 50,
				displayOptions: {
					show: {
						operation: ['list'],
						returnAll: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Cursor (After)',
				name: 'after',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['list'],
						returnAll: [false],
					},
				},
				description: 'Cursor for pagination — use nextCursor from previous response',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: { operation: ['list'] },
				},
				options: [
					{
						displayName: 'Status',
						name: 'status',
						type: 'string',
						default: '',
						description:
							'Filter by status. Invoices: draft, sent, partial, paid, overdue, cancelled. Quotes: draft, sent, accepted, rejected, expired.',
					},
					{
						displayName: 'From Date',
						name: 'from',
						type: 'string',
						default: '',
						description: 'Filter records from this date (ISO 8601: YYYY-MM-DD)',
					},
					{
						displayName: 'To Date',
						name: 'to',
						type: 'string',
						default: '',
						description: 'Filter records up to this date (ISO 8601: YYYY-MM-DD)',
					},
					{
						displayName: 'Search Query',
						name: 'q',
						type: 'string',
						default: '',
						description: 'Full-text search query',
					},
					{
						displayName: 'Client ID',
						name: 'clientId',
						type: 'string',
						default: '',
						description: 'Filter invoices or quotes by client ID',
					},
				],
			},

			// =====================================================================
			// INVOICE SEND — additional params
			// =====================================================================
			{
				displayName: 'Email',
				name: 'sendEmail',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice', 'quote'],
						operation: ['send'],
					},
				},
				description: 'Override recipient email (uses client email by default)',
			},

			// =====================================================================
			// MARK PAID — additional params
			// =====================================================================
			{
				displayName: 'Additional Fields',
				name: 'markPaidAdditional',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['markPaid'],
					},
				},
				options: [
					{
						displayName: 'Payment Date',
						name: 'paidDate',
						type: 'string',
						default: '',
						description: 'Date of payment (ISO 8601: YYYY-MM-DD). Defaults to today.',
					},
					{
						displayName: 'Payment Method',
						name: 'paymentMethod',
						type: 'options',
						default: 'bank_transfer',
						options: [
							{ name: 'Bank Transfer', value: 'bank_transfer' },
							{ name: 'Cash', value: 'cash' },
							{ name: 'Card', value: 'card' },
							{ name: 'Stripe', value: 'stripe' },
							{ name: 'PayPal', value: 'paypal' },
							{ name: 'Other', value: 'other' },
						],
					},
				],
			},

			// =====================================================================
			// INVOICE CREATE — additional optional fields
			// =====================================================================
			{
				displayName: 'Additional Fields',
				name: 'invoiceAdditional',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Client ID',
						name: 'clientId',
						type: 'string',
						default: '',
						description: 'Link to an existing client by ID',
					},
					{
						displayName: 'Client Tax ID',
						name: 'clientTaxId',
						type: 'string',
						default: '',
						description: 'Tax identification number of the client (NIF, VAT, etc.)',
					},
					{
						displayName: 'Client Location',
						name: 'clientLocation',
						type: 'options',
						default: 'peninsula',
						description: 'Fiscal zone — determines tax regime (IVA, IGIC, IPSI, exempt)',
						options: [
							{ name: 'Spain (Peninsula)', value: 'peninsula' },
							{ name: 'Canary Islands (IGIC)', value: 'canarias' },
							{ name: 'Ceuta / Melilla (IPSI)', value: 'ceuta_melilla' },
							{ name: 'EU (Reverse Charge)', value: 'eu' },
							{ name: 'World (Exempt)', value: 'world' },
						],
					},
					{
						displayName: 'Tax Rate (%)',
						name: 'taxRate',
						type: 'number',
						default: 21,
						description: 'Tax rate percentage (IVA/IGIC/IPSI). Leave 0 for exempt.',
					},
					{
						displayName: 'IRPF Rate (%)',
						name: 'irpfRate',
						type: 'number',
						default: 0,
						description: 'IRPF withholding tax rate (Spain only, typically 15%)',
					},
					{
						displayName: 'Equivalence Surcharge Rate (%)',
						name: 'equivalenceSurchargeRate',
						type: 'number',
						default: 0,
						description: 'Recargo de equivalencia rate (e.g. 5.2% for general goods)',
					},
					{
						displayName: 'Issue Date',
						name: 'issueDate',
						type: 'string',
						default: '',
						description: 'Invoice issue date (ISO 8601: YYYY-MM-DD). Defaults to today.',
					},
					{
						displayName: 'Due Date',
						name: 'dueDate',
						type: 'string',
						default: '',
						description: 'Payment due date (ISO 8601: YYYY-MM-DD)',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						default: 'draft',
						options: [
							{ name: 'Draft', value: 'draft' },
							{ name: 'Sent', value: 'sent' },
							{ name: 'Paid', value: 'paid' },
							{ name: 'Overdue', value: 'overdue' },
							{ name: 'Cancelled', value: 'cancelled' },
						],
					},
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						default: '',
						description: 'Additional notes or payment instructions',
					},
					{
						displayName: 'Series ID',
						name: 'seriesId',
						type: 'string',
						default: '',
						description: 'Invoice numbering series ID (from Settings → Numbering)',
					},
					{
						displayName: 'Prepayment Amount',
						name: 'prepayment',
						type: 'number',
						default: 0,
						description: 'Prepayment or advance amount to deduct from total',
					},
					{
						displayName: 'Client Address (JSON)',
						name: 'clientAddress',
						type: 'json',
						default: '{}',
						description:
							'Structured address object: { street, city, zip, province, country, countryCode }',
					},
				],
			},

			// =====================================================================
			// INVOICE UPDATE — fields
			// =====================================================================
			{
				displayName: 'Update Fields',
				name: 'invoiceUpdate',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['update'],
					},
				},
				options: [
					{
						displayName: 'Client Name',
						name: 'clientName',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Client ID',
						name: 'clientId',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Client Tax ID',
						name: 'clientTaxId',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Client Location',
						name: 'clientLocation',
						type: 'options',
						default: 'peninsula',
						options: [
							{ name: 'Spain (Peninsula)', value: 'peninsula' },
							{ name: 'Canary Islands (IGIC)', value: 'canarias' },
							{ name: 'Ceuta / Melilla (IPSI)', value: 'ceuta_melilla' },
							{ name: 'EU (Reverse Charge)', value: 'eu' },
							{ name: 'World (Exempt)', value: 'world' },
						],
					},
					{
						displayName: 'Tax Rate (%)',
						name: 'taxRate',
						type: 'number',
						default: 21,
					},
					{
						displayName: 'IRPF Rate (%)',
						name: 'irpfRate',
						type: 'number',
						default: 0,
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						default: 'draft',
						options: [
							{ name: 'Draft', value: 'draft' },
							{ name: 'Sent', value: 'sent' },
							{ name: 'Partial', value: 'partial' },
							{ name: 'Paid', value: 'paid' },
							{ name: 'Overdue', value: 'overdue' },
							{ name: 'Cancelled', value: 'cancelled' },
						],
					},
					{
						displayName: 'Due Date',
						name: 'dueDate',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Series ID',
						name: 'seriesId',
						type: 'string',
						default: '',
					},
				],
			},

			// =====================================================================
			// QUOTE CREATE — additional optional fields
			// =====================================================================
			{
				displayName: 'Additional Fields',
				name: 'quoteAdditional',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['quote'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Client ID',
						name: 'clientId',
						type: 'string',
						default: '',
						description: 'Link to an existing client by ID',
					},
					{
						displayName: 'Client Tax ID',
						name: 'clientTaxId',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Client Location',
						name: 'clientLocation',
						type: 'options',
						default: 'peninsula',
						options: [
							{ name: 'Spain (Peninsula)', value: 'peninsula' },
							{ name: 'Canary Islands (IGIC)', value: 'canarias' },
							{ name: 'Ceuta / Melilla (IPSI)', value: 'ceuta_melilla' },
							{ name: 'EU (Reverse Charge)', value: 'eu' },
							{ name: 'World (Exempt)', value: 'world' },
						],
					},
					{
						displayName: 'Tax Rate (%)',
						name: 'taxRate',
						type: 'number',
						default: 21,
					},
					{
						displayName: 'IRPF Rate (%)',
						name: 'irpfRate',
						type: 'number',
						default: 0,
					},
					{
						displayName: 'Issue Date',
						name: 'issueDate',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Due Date',
						name: 'dueDate',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Valid Until',
						name: 'validUntil',
						type: 'string',
						default: '',
						description: 'Expiration date of the quote (ISO 8601: YYYY-MM-DD)',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						default: 'draft',
						options: [
							{ name: 'Draft', value: 'draft' },
							{ name: 'Sent', value: 'sent' },
							{ name: 'Accepted', value: 'accepted' },
							{ name: 'Rejected', value: 'rejected' },
							{ name: 'Expired', value: 'expired' },
						],
					},
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Client Address (JSON)',
						name: 'clientAddress',
						type: 'json',
						default: '{}',
						description:
							'Structured address: { street, city, zip, province, country, countryCode }',
					},
				],
			},

			// =====================================================================
			// QUOTE UPDATE — fields
			// =====================================================================
			{
				displayName: 'Update Fields',
				name: 'quoteUpdate',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['quote'],
						operation: ['update'],
					},
				},
				options: [
					{
						displayName: 'Client Name',
						name: 'clientName',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Client ID',
						name: 'clientId',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Tax Rate (%)',
						name: 'taxRate',
						type: 'number',
						default: 21,
					},
					{
						displayName: 'IRPF Rate (%)',
						name: 'irpfRate',
						type: 'number',
						default: 0,
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						default: 'draft',
						options: [
							{ name: 'Draft', value: 'draft' },
							{ name: 'Sent', value: 'sent' },
							{ name: 'Accepted', value: 'accepted' },
							{ name: 'Rejected', value: 'rejected' },
							{ name: 'Expired', value: 'expired' },
						],
					},
					{
						displayName: 'Valid Until',
						name: 'validUntil',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						default: '',
					},
				],
			},

			// =====================================================================
			// EXPENSE CREATE — additional optional fields
			// =====================================================================
			{
				displayName: 'Additional Fields',
				name: 'expenseAdditional',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['expense'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Date',
						name: 'date',
						type: 'string',
						default: '',
						description: 'Expense date (ISO 8601: YYYY-MM-DD). Defaults to today.',
					},
					{
						displayName: 'Category',
						name: 'category',
						type: 'options',
						default: 'other',
						options: [
							{ name: 'Office Supplies', value: 'office_supplies' },
							{ name: 'Software & Subscriptions', value: 'software' },
							{ name: 'Travel', value: 'travel' },
							{ name: 'Meals & Entertainment', value: 'meals' },
							{ name: 'Marketing & Advertising', value: 'marketing' },
							{ name: 'Professional Services', value: 'professional_services' },
							{ name: 'Equipment', value: 'equipment' },
							{ name: 'Other', value: 'other' },
						],
					},
					{
						displayName: 'Vendor Name',
						name: 'vendor',
						type: 'string',
						default: '',
						description: 'Name of the vendor (free text)',
					},
					{
						displayName: 'Vendor ID',
						name: 'vendorId',
						type: 'string',
						default: '',
						description: 'Link to an existing vendor by ID',
					},
					{
						displayName: 'Tax Amount',
						name: 'tax',
						type: 'number',
						default: 0,
						description: 'Tax amount (VAT/IVA/IGIC paid — for deductibility)',
					},
					{
						displayName: 'Tax Type',
						name: 'taxType',
						type: 'options',
						default: 'IVA',
						options: [
							{ name: 'IVA (Spain Peninsula)', value: 'IVA' },
							{ name: 'IGIC (Canary Islands)', value: 'IGIC' },
							{ name: 'IPSI (Ceuta/Melilla)', value: 'IPSI' },
							{ name: 'Exempt', value: 'Exento' },
						],
					},
					{
						displayName: 'IRPF Amount',
						name: 'irpf',
						type: 'number',
						default: 0,
						description: 'IRPF withholding on this expense (Spain only)',
					},
					{
						displayName: 'Invoice Number',
						name: 'invoiceNumber',
						type: 'string',
						default: '',
						description: "Vendor's invoice number for this expense",
					},
					{
						displayName: 'Tax Deductible',
						name: 'taxDeductible',
						type: 'boolean',
						default: true,
						description: 'Whether this expense is tax-deductible',
					},
					{
						displayName: 'Is Investment Good',
						name: 'isInvestmentGood',
						type: 'boolean',
						default: false,
						description: 'Whether this is an investment good (for amortization)',
					},
				],
			},

			// =====================================================================
			// EXPENSE UPDATE
			// =====================================================================
			{
				displayName: 'Update Fields',
				name: 'expenseUpdate',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['expense'],
						operation: ['update'],
					},
				},
				options: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Amount',
						name: 'amount',
						type: 'number',
						default: 0,
					},
					{
						displayName: 'Date',
						name: 'date',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Category',
						name: 'category',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Vendor Name',
						name: 'vendor',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Tax Amount',
						name: 'tax',
						type: 'number',
						default: 0,
					},
					{
						displayName: 'Tax Type',
						name: 'taxType',
						type: 'options',
						default: 'IVA',
						options: [
							{ name: 'IVA', value: 'IVA' },
							{ name: 'IGIC', value: 'IGIC' },
							{ name: 'IPSI', value: 'IPSI' },
							{ name: 'Exempt', value: 'Exento' },
						],
					},
					{
						displayName: 'Tax Deductible',
						name: 'taxDeductible',
						type: 'boolean',
						default: true,
					},
				],
			},

			// =====================================================================
			// CLIENT CREATE — additional optional fields
			// =====================================================================
			{
				displayName: 'Additional Fields',
				name: 'clientAdditional',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
						default: '',
						description: 'Client email address (used for sending invoices)',
					},
					{
						displayName: 'Phone',
						name: 'phone',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Tax ID',
						name: 'taxId',
						type: 'string',
						default: '',
						description: 'Tax identification number (NIF, VAT, EIN, etc.)',
					},
					{
						displayName: 'Website',
						name: 'website',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Fiscal Zone',
						name: 'fiscalZone',
						type: 'options',
						default: 'peninsula',
						description: 'Determines tax regime applied to invoices for this client',
						options: [
							{ name: 'Spain (Peninsula)', value: 'peninsula' },
							{ name: 'Canary Islands (IGIC)', value: 'canarias' },
							{ name: 'Ceuta / Melilla (IPSI)', value: 'ceuta_melilla' },
							{ name: 'EU (Reverse Charge)', value: 'eu' },
							{ name: 'World (Exempt)', value: 'world' },
						],
					},
					{
						displayName: 'Client Type',
						name: 'clientType',
						type: 'options',
						default: 'company',
						options: [
							{ name: 'Company', value: 'company' },
							{ name: 'Individual', value: 'individual' },
						],
					},
					{
						displayName: 'CRM Stage',
						name: 'stage',
						type: 'options',
						default: 'active',
						options: [
							{ name: 'Lead', value: 'lead' },
							{ name: 'Contacted', value: 'contacted' },
							{ name: 'Proposal', value: 'proposal' },
							{ name: 'Active', value: 'active' },
							{ name: 'Inactive', value: 'inactive' },
							{ name: 'Lost', value: 'lost' },
						],
					},
					{
						displayName: 'Apply Equivalence Surcharge',
						name: 'applyEquivalenceSurcharge',
						type: 'boolean',
						default: false,
						description: 'Whether to apply recargo de equivalencia (Spain retailers)',
					},
					{
						displayName: 'Address (JSON)',
						name: 'address',
						type: 'json',
						default: '{}',
						description:
							'Structured address: { street, city, zip, province, country, countryCode }',
					},
				],
			},

			// =====================================================================
			// CLIENT UPDATE
			// =====================================================================
			{
				displayName: 'Update Fields',
				name: 'clientUpdate',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['client'],
						operation: ['update'],
					},
				},
				options: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{ displayName: 'Email', name: 'email', type: 'string', default: '' },
					{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
					{ displayName: 'Tax ID', name: 'taxId', type: 'string', default: '' },
					{ displayName: 'Website', name: 'website', type: 'string', default: '' },
					{
						displayName: 'Fiscal Zone',
						name: 'fiscalZone',
						type: 'options',
						default: 'peninsula',
						options: [
							{ name: 'Spain (Peninsula)', value: 'peninsula' },
							{ name: 'Canary Islands (IGIC)', value: 'canarias' },
							{ name: 'Ceuta / Melilla (IPSI)', value: 'ceuta_melilla' },
							{ name: 'EU (Reverse Charge)', value: 'eu' },
							{ name: 'World (Exempt)', value: 'world' },
						],
					},
					{
						displayName: 'CRM Stage',
						name: 'stage',
						type: 'options',
						default: 'active',
						options: [
							{ name: 'Lead', value: 'lead' },
							{ name: 'Contacted', value: 'contacted' },
							{ name: 'Proposal', value: 'proposal' },
							{ name: 'Active', value: 'active' },
							{ name: 'Inactive', value: 'inactive' },
							{ name: 'Lost', value: 'lost' },
						],
					},
					{
						displayName: 'Client Type',
						name: 'clientType',
						type: 'options',
						default: 'company',
						options: [
							{ name: 'Company', value: 'company' },
							{ name: 'Individual', value: 'individual' },
						],
					},
				],
			},

			// =====================================================================
			// PRODUCT CREATE — additional optional fields
			// =====================================================================
			{
				displayName: 'Additional Fields',
				name: 'productAdditional',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['product'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
					},
					{
						displayName: 'SKU',
						name: 'sku',
						type: 'string',
						default: '',
						description: 'Stock keeping unit code',
					},
					{
						displayName: 'Category',
						name: 'category',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Tax Rate (%)',
						name: 'taxRate',
						type: 'number',
						default: 21,
					},
					{
						displayName: 'IRPF Rate (%)',
						name: 'irpfRate',
						type: 'number',
						default: 0,
					},
					{
						displayName: 'Active',
						name: 'isActive',
						type: 'boolean',
						default: true,
					},
				],
			},

			// =====================================================================
			// PRODUCT UPDATE
			// =====================================================================
			{
				displayName: 'Update Fields',
				name: 'productUpdate',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['product'],
						operation: ['update'],
					},
				},
				options: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{ displayName: 'Unit Price', name: 'unitPrice', type: 'number', default: 0 },
					{ displayName: 'Description', name: 'description', type: 'string', default: '' },
					{ displayName: 'SKU', name: 'sku', type: 'string', default: '' },
					{ displayName: 'Category', name: 'category', type: 'string', default: '' },
					{ displayName: 'Tax Rate (%)', name: 'taxRate', type: 'number', default: 21 },
					{ displayName: 'IRPF Rate (%)', name: 'irpfRate', type: 'number', default: 0 },
					{ displayName: 'Active', name: 'isActive', type: 'boolean', default: true },
				],
			},

			// =====================================================================
			// VENDOR CREATE — additional optional fields
			// =====================================================================
			{
				displayName: 'Additional Fields',
				name: 'vendorAdditional',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['vendor'],
						operation: ['create'],
					},
				},
				options: [
					{ displayName: 'Email', name: 'email', type: 'string', default: '' },
					{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
					{ displayName: 'Tax ID', name: 'taxId', type: 'string', default: '' },
					{
						displayName: 'Address (JSON)',
						name: 'address',
						type: 'json',
						default: '{}',
						description: 'Structured address: { street, city, zip, province, country, countryCode }',
					},
				],
			},

			// =====================================================================
			// VENDOR UPDATE
			// =====================================================================
			{
				displayName: 'Update Fields',
				name: 'vendorUpdate',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['vendor'],
						operation: ['update'],
					},
				},
				options: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{ displayName: 'Email', name: 'email', type: 'string', default: '' },
					{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
					{ displayName: 'Tax ID', name: 'taxId', type: 'string', default: '' },
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: IDataObject[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		// Map resource names to API endpoints (plural)
		const resourceMap: Record<string, string> = {
			invoice: 'invoices',
			quote: 'quotes',
			expense: 'expenses',
			client: 'clients',
			product: 'products',
			vendor: 'vendors',
		};

		const endpoint = resourceMap[resource];
		if (!endpoint) {
			throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				// ===================================================================
				// GET — single item
				// ===================================================================
				if (operation === 'get') {
					const idParam = `${resource}Id`;
					const id = this.getNodeParameter(idParam, i) as string;
					const response = await frihetApiRequest.call(this, 'GET', `/${endpoint}/${id}`);
					returnData.push(response?.data ?? response);
				}

				// ===================================================================
				// DELETE — single item
				// ===================================================================
				else if (operation === 'delete') {
					const idParam = `${resource}Id`;
					const id = this.getNodeParameter(idParam, i) as string;
					const response = await frihetApiRequest.call(this, 'DELETE', `/${endpoint}/${id}`);
					returnData.push(response?.data ?? { id, deleted: true });
				}

				// ===================================================================
				// LIST — paginated
				// ===================================================================
				else if (operation === 'list') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

					// Build query string params
					const qs: Record<string, any> = {};
					if (filters.status) qs.status = filters.status;
					if (filters.from) qs.from = filters.from;
					if (filters.to) qs.to = filters.to;
					if (filters.q) qs.q = filters.q;
					if (filters.clientId) qs.clientId = filters.clientId;

					if (returnAll) {
						// Paginate through all pages
						let allItems: IDataObject[] = [];
						let after: string | undefined;

						do {
							const pageQs = { ...qs, limit: 100, ...(after ? { after } : {}) };
							const response = await frihetApiRequest.call(this, 'GET', `/${endpoint}`, undefined, pageQs);
							const pageItems: IDataObject[] = response?.data ?? [];
							allItems = allItems.concat(pageItems);
							after = response?.meta?.nextCursor;
							if (!response?.meta?.hasMore) break;
						} while (after);

						returnData.push(...allItems);
					} else {
						const limit = this.getNodeParameter('limit', i) as number;
						const after = this.getNodeParameter('after', i, '') as string;

						const pageQs: Record<string, any> = { ...qs, limit };
						if (after) pageQs.after = after;

						const response = await frihetApiRequest.call(this, 'GET', `/${endpoint}`, undefined, pageQs);
						const pageItems: IDataObject[] = response?.data ?? [];
						// Include pagination meta as a wrapper so workflows can use nextCursor
						if (pageItems.length > 0) {
							returnData.push(...pageItems);
						} else {
							returnData.push({ items: [], meta: response?.meta ?? {} });
						}
					}
				}

				// ===================================================================
				// CREATE — invoice
				// ===================================================================
				else if (operation === 'create' && resource === 'invoice') {
					const clientName = this.getNodeParameter('clientName', i) as string;
					const itemsParam = this.getNodeParameter('items', i) as { item?: Array<{ description: string; quantity: number; unitPrice: number }> };
					const additional = this.getNodeParameter('invoiceAdditional', i, {}) as IDataObject;

					const items_ = (itemsParam?.item ?? []).map((it) => ({
						description: it.description,
						quantity: it.quantity,
						unitPrice: it.unitPrice,
					}));

					const body: IDataObject = { clientName, items: items_ };

					// Merge additional fields, stripping empty strings and parsing JSON
					for (const [key, val] of Object.entries(additional)) {
						if (val === '' || val === null || val === undefined) continue;
						if (key === 'clientAddress') {
							try { body.clientAddress = typeof val === 'string' ? JSON.parse(val) : val; }
							catch { /* ignore malformed JSON */ }
						} else {
							body[key] = val;
						}
					}

					const response = await frihetApiRequest.call(this, 'POST', '/invoices', body);
					returnData.push(response?.data ?? response);
				}

				// ===================================================================
				// CREATE — quote
				// ===================================================================
				else if (operation === 'create' && resource === 'quote') {
					const clientName = this.getNodeParameter('clientName', i) as string;
					const itemsParam = this.getNodeParameter('items', i) as { item?: Array<{ description: string; quantity: number; unitPrice: number }> };
					const additional = this.getNodeParameter('quoteAdditional', i, {}) as IDataObject;

					const items_ = (itemsParam?.item ?? []).map((it) => ({
						description: it.description,
						quantity: it.quantity,
						unitPrice: it.unitPrice,
					}));

					const body: IDataObject = { clientName, items: items_ };

					for (const [key, val] of Object.entries(additional)) {
						if (val === '' || val === null || val === undefined) continue;
						if (key === 'clientAddress') {
							try { body.clientAddress = typeof val === 'string' ? JSON.parse(val) : val; }
							catch { /* ignore */ }
						} else {
							body[key] = val;
						}
					}

					const response = await frihetApiRequest.call(this, 'POST', '/quotes', body);
					returnData.push(response?.data ?? response);
				}

				// ===================================================================
				// CREATE — expense
				// ===================================================================
				else if (operation === 'create' && resource === 'expense') {
					const description = this.getNodeParameter('expenseDescription', i) as string;
					const amount = this.getNodeParameter('amount', i) as number;
					const additional = this.getNodeParameter('expenseAdditional', i, {}) as IDataObject;

					const body: IDataObject = { description, amount };

					for (const [key, val] of Object.entries(additional)) {
						if (val === '' || val === null || val === undefined) continue;
						body[key] = val;
					}

					const response = await frihetApiRequest.call(this, 'POST', '/expenses', body);
					returnData.push(response?.data ?? response);
				}

				// ===================================================================
				// CREATE — client
				// ===================================================================
				else if (operation === 'create' && resource === 'client') {
					const name = this.getNodeParameter('clientName', i) as string;
					const additional = this.getNodeParameter('clientAdditional', i, {}) as IDataObject;

					const body: IDataObject = { name };

					for (const [key, val] of Object.entries(additional)) {
						if (val === '' || val === null || val === undefined) continue;
						if (key === 'address') {
							try { body.address = typeof val === 'string' ? JSON.parse(val) : val; }
							catch { /* ignore */ }
						} else {
							body[key] = val;
						}
					}

					const response = await frihetApiRequest.call(this, 'POST', '/clients', body);
					returnData.push(response?.data ?? response);
				}

				// ===================================================================
				// CREATE — product
				// ===================================================================
				else if (operation === 'create' && resource === 'product') {
					const name = this.getNodeParameter('productName', i) as string;
					const unitPrice = this.getNodeParameter('unitPrice', i) as number;
					const additional = this.getNodeParameter('productAdditional', i, {}) as IDataObject;

					const body: IDataObject = { name, unitPrice };

					for (const [key, val] of Object.entries(additional)) {
						if (val === '' || val === null || val === undefined) continue;
						body[key] = val;
					}

					const response = await frihetApiRequest.call(this, 'POST', '/products', body);
					returnData.push(response?.data ?? response);
				}

				// ===================================================================
				// CREATE — vendor
				// ===================================================================
				else if (operation === 'create' && resource === 'vendor') {
					const name = this.getNodeParameter('vendorName', i) as string;
					const additional = this.getNodeParameter('vendorAdditional', i, {}) as IDataObject;

					const body: IDataObject = { name };

					for (const [key, val] of Object.entries(additional)) {
						if (val === '' || val === null || val === undefined) continue;
						if (key === 'address') {
							try { body.address = typeof val === 'string' ? JSON.parse(val) : val; }
							catch { /* ignore */ }
						} else {
							body[key] = val;
						}
					}

					const response = await frihetApiRequest.call(this, 'POST', '/vendors', body);
					returnData.push(response?.data ?? response);
				}

				// ===================================================================
				// UPDATE — PATCH (partial) for all resources
				// ===================================================================
				else if (operation === 'update') {
					const idParam = `${resource}Id`;
					const id = this.getNodeParameter(idParam, i) as string;

					// Determine which "update fields" collection to use
					const updateParamMap: Record<string, string> = {
						invoice: 'invoiceUpdate',
						quote: 'quoteUpdate',
						expense: 'expenseUpdate',
						client: 'clientUpdate',
						product: 'productUpdate',
						vendor: 'vendorUpdate',
					};

					const updateParam = updateParamMap[resource];
					const updateFields = this.getNodeParameter(updateParam, i, {}) as IDataObject;

					// Strip empty values
					const body: IDataObject = {};
					for (const [key, val] of Object.entries(updateFields)) {
						if (val === '' || val === null || val === undefined) continue;
						body[key] = val;
					}

					if (Object.keys(body).length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'Update requires at least one field to update.',
							{ itemIndex: i },
						);
					}

					const response = await frihetApiRequest.call(this, 'PATCH', `/${endpoint}/${id}`, body);
					returnData.push(response?.data ?? response);
				}

				// ===================================================================
				// SEND — invoice or quote email
				// ===================================================================
				else if (operation === 'send') {
					const idParam = `${resource}Id`;
					const id = this.getNodeParameter(idParam, i) as string;
					const emailOverride = this.getNodeParameter('sendEmail', i, '') as string;

					const body: IDataObject = {};
					if (emailOverride) body.email = emailOverride;

					const response = await frihetApiRequest.call(this, 'POST', `/${endpoint}/${id}/send`, body);
					returnData.push(response?.data ?? response ?? { id, sent: true });
				}

				// ===================================================================
				// MARK PAID — invoice only
				// ===================================================================
				else if (operation === 'markPaid') {
					const id = this.getNodeParameter('invoiceId', i) as string;
					const markPaidAdditional = this.getNodeParameter('markPaidAdditional', i, {}) as IDataObject;

					const body: IDataObject = {};
					if (markPaidAdditional.paidDate) body.paidDate = markPaidAdditional.paidDate;
					if (markPaidAdditional.paymentMethod) body.paymentMethod = markPaidAdditional.paymentMethod;

					const response = await frihetApiRequest.call(this, 'POST', `/invoices/${id}/paid`, body);
					returnData.push(response?.data ?? response ?? { id, paid: true });
				}

				else {
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation "${operation}" for resource "${resource}"`,
						{ itemIndex: i },
					);
				}
			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({ error: error.message });
					continue;
				}
				throw error;
			}
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}
