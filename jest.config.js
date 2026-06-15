/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	testMatch: ['**/*.test.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', {
			tsconfig: {
				// Relax strict mode for test helpers
				strict: false,
			},
		}],
	},
	moduleFileExtensions: ['ts', 'js', 'json'],
	clearMocks: true,
};
