/** Minimal Jest config for the n8n-nodes-frihet contract test suite.
 *
 * Drives the actual Frihet node execute() code against a fake transport so we
 * can pin the request shapes that the ERP publicApi accepts/rejects. The
 * publicApi canonical authority is at berthelius/Frihet-ERP
 * origin/main = f901d4292dfd20438de34e21795f27683beaeb37.
 */
/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	testMatch: ['<rootDir>/tests/**/*.test.ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
	},
	// Keep the dotenv / node_modules noise out of the test output.
	silent: false,
	verbose: false,
	// The harness lives next to mock-sources; isolate transient workflow JSON
	// fixtures so the actual templates/ directory stays untouched.
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
	collectCoverageFrom: ['nodes/**/*.ts', 'credentials/**/*.ts'],
	coverageDirectory: 'tests/coverage',
};
