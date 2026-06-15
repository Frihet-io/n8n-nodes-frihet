/**
 * ESLint config for n8n-nodes-frihet.
 * Uses eslint-plugin-n8n-nodes-base (requires ESLint 8 due to legacy context API usage).
 */
'use strict';

module.exports = {
	root: true,
	env: {
		node: true,
		es2020: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: './tsconfig.json',
		sourceType: 'module',
	},
	plugins: ['@typescript-eslint', 'n8n-nodes-base'],
	extends: [
		'plugin:@typescript-eslint/recommended',
	],
	rules: {
		// ── n8n community-node verification rules ──────────────────────────────
		// These are checked by the n8n Creator Portal during the VERIFIED review.
		// Reference: https://github.com/n8n-io/eslint-plugin-n8n-nodes-base

		// Node class description
		'n8n-nodes-base/node-class-description-icon-not-svg': 'error',
		'n8n-nodes-base/node-class-description-missing-subtitle': 'warn',

		// Param level
		'n8n-nodes-base/node-param-operation-without-no-data-expression': 'error',
		'n8n-nodes-base/node-param-resource-without-no-data-expression': 'error',
		'n8n-nodes-base/node-param-default-missing': 'warn',

		// Execute block
		'n8n-nodes-base/node-execute-block-missing-continue-on-fail': 'warn',

		// Credentials
		'n8n-nodes-base/cred-class-field-documentation-url-missing': 'warn',
		'n8n-nodes-base/cred-class-field-type-options-password-missing': 'warn',

		// ── TypeScript baseline ────────────────────────────────────────────────
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
	},
	overrides: [
		{
			// Test files: relax all n8n rules and most TS strictness
			files: ['tests/**/*.ts'],
			rules: {
				'n8n-nodes-base/node-class-description-icon-not-svg': 'off',
				'n8n-nodes-base/node-class-description-missing-subtitle': 'off',
				'n8n-nodes-base/node-param-operation-without-no-data-expression': 'off',
				'n8n-nodes-base/node-param-resource-without-no-data-expression': 'off',
				'n8n-nodes-base/node-execute-block-missing-continue-on-fail': 'off',
				'n8n-nodes-base/cred-class-field-documentation-url-missing': 'off',
				'@typescript-eslint/no-explicit-any': 'off',
				'@typescript-eslint/no-unused-vars': 'off',
			},
		},
	],
};
