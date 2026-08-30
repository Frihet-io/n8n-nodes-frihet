import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const RELEASE_WORKFLOW = path.join(ROOT, '.github/workflows/release.yml');

const REQUIRED_RELEASE_GUARDS = [
	'workflow_dispatch:',
	'default: 1.0.2',
	'environment: npm-release',
	'contents: read',
	'id-token: write',
	'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
	'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
	'node-version: 24.20.0',
	"'X-GitHub-Api-Version': '2026-03-10'",
	'test "$GITHUB_REPOSITORY" = "Frihet-io/n8n-nodes-frihet"',
	'test "$GITHUB_REF" = "refs/heads/main"',
	'test "$INPUT_VERSION" = "1.0.2"',
	'test "$GITHUB_SHA" = "$(git rev-parse HEAD)"',
	'git ls-remote origin refs/heads/main',
	'test -z "$(git status --porcelain=v1)"',
	'git ls-files node_modules',
	"environment.protection_rules",
	"rule.type === 'required_reviewers'",
	'reviewers.prevent_self_review !== true',
	'protected_branches !== true',
	"l.packages[''].version",
	'npm view n8n-nodes-frihet versions --json',
	'npm ci --no-audit --no-fund',
	'npm run build',
	'git diff --exit-code -- dist',
	'npm run test:ci',
	'npm audit --omit=dev',
	'npm pack --json --ignore-scripts',
	'fs.unlinkSync(pack.filename)',
	'npm publish --provenance --access public',
	'readback.gitHead !== process.env.GITHUB_SHA',
	'readback.dist?.integrity !== pack.integrity',
	'readback.dist?.tarball !== expectedTarball',
];

function validateReleaseWorkflow(source: string): void {
	for (const guard of REQUIRED_RELEASE_GUARDS) {
		if (!source.includes(guard)) throw new Error(`Missing release guard: ${guard}`);
	}
	if (/NPM_TOKEN|NODE_AUTH_TOKEN/.test(source)) {
		throw new Error('Release workflow must use OIDC, never a long-lived npm token');
	}
	if (/^\s+(?:contents|actions|packages|deployments): write$/m.test(source)) {
		throw new Error('Release workflow permissions exceed contents:read + id-token:write');
	}
	for (const uses of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
		if (!/@[0-9a-f]{40}$/.test(uses[1])) throw new Error(`Unpinned action: ${uses[1]}`);
	}
}

describe('npm release control plane', () => {
	const workflow = fs.readFileSync(RELEASE_WORKFLOW, 'utf8');

	it('pins every fail-closed release guard and uses no npm token', () => {
		expect(() => validateReleaseWorkflow(workflow)).not.toThrow();
	});

	it.each([
		['stale version', 'default: 1.0.2', 'default: 1.0.3'],
		['non-main dispatch', 'test "$GITHUB_REF" = "refs/heads/main"', 'test -n "$GITHUB_REF"'],
		['wrong repository', 'Frihet-io/n8n-nodes-frihet', 'someone/fork'],
		['wrong SHA', 'test "$GITHUB_SHA" = "$(git rev-parse HEAD)"', 'git rev-parse HEAD'],
		['dirty tree', 'test -z "$(git status --porcelain=v1)"', 'git status --short'],
		['existing npm version', 'npm view n8n-nodes-frihet versions --json', 'echo []'],
		['tracked dependencies', 'git ls-files node_modules', 'echo node_modules'],
		['source/dist drift', 'git diff --exit-code -- dist', 'git diff --stat -- dist'],
		['self approval', 'reviewers.prevent_self_review !== true', 'reviewers.prevent_self_review === true'],
	])('rejects the %s mutant', (_name, needle, replacement) => {
		const mutant = workflow.replace(needle, replacement);
		expect(mutant).not.toBe(workflow);
		expect(() => validateReleaseWorkflow(mutant)).toThrow();
	});

	it('keeps package and lock metadata on the exact unpublished candidate version', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
		const packageLock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
		expect(packageJson.version).toBe('1.0.2');
		expect(packageLock.version).toBe('1.0.2');
		expect(packageLock.packages[''].version).toBe('1.0.2');
	});

	it('tracks no dependency installation', () => {
		const tracked = execFileSync('git', ['ls-files', 'node_modules'], { cwd: ROOT, encoding: 'utf8' });
		expect(tracked).toBe('');
	});

	it('packs only the n8n runtime contract', () => {
		const report = JSON.parse(
			execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
				cwd: ROOT,
				encoding: 'utf8',
			}),
		)[0];
		const files = report.files.map((entry: { path: string }) => entry.path).sort();
		expect(report.name).toBe('n8n-nodes-frihet');
		expect(report.version).toBe('1.0.2');
		expect(files).toEqual([
			'README.md',
			'dist/credentials/FrihetApi.credentials.d.ts',
			'dist/credentials/FrihetApi.credentials.js',
			'dist/nodes/Frihet/Frihet.node.d.ts',
			'dist/nodes/Frihet/Frihet.node.js',
			'dist/nodes/Frihet/Frihet.node.json',
			'dist/nodes/Frihet/GenericFunctions.d.ts',
			'dist/nodes/Frihet/GenericFunctions.js',
			'dist/nodes/Frihet/frihet.svg',
			'package.json',
		]);
	});
});
