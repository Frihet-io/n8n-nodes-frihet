import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse } from 'yaml';

const ROOT = path.resolve(__dirname, '../..');
const RELEASE_WORKFLOW = path.join(ROOT, '.github/workflows/release.yml');
const control = require('../../.github/scripts/release-control.cjs');

type JsonObject = Record<string, any>;

const EXPECTED_STEP_NAMES = [
	'Check out exact dispatch revision',
	'Use release runtime',
	'Verify dispatch provenance',
	'Verify protected release environment',
	'Verify exact package metadata',
	'Install from lockfile',
	'Build exact committed artifacts',
	'Run contract and release-policy tests',
	'Audit production dependency surface',
	'Build expected package evidence',
	'Reconcile existing npm version or request publish',
	'Publish missing npm version with trusted publishing',
	'Reconcile final npm bytes',
	'Reconcile immutable Git tag and GitHub Release',
];

const EXPECTED_RUNS: Record<string, string> = {
	'Verify dispatch provenance': "node .github/scripts/release-control.cjs verify-dispatch | grep -Fx 'release-control:verify-dispatch:ok'",
	'Verify protected release environment': "node .github/scripts/release-control.cjs verify-environment | grep -Fx 'release-control:verify-environment:ok'",
	'Verify exact package metadata': "node .github/scripts/release-control.cjs verify-metadata | grep -Fx 'release-control:verify-metadata:ok'",
	'Install from lockfile': 'npm ci --no-audit --no-fund',
	'Build exact committed artifacts': [
		'npm run build',
		'git diff --exit-code -- dist',
		'test -z "$(git status --porcelain --untracked-files=no)"',
	].join('\n'),
	'Run contract and release-policy tests': 'npm run test:ci',
	'Audit production dependency surface': 'npm audit --omit=dev',
	'Build expected package evidence': "node .github/scripts/release-control.cjs pack-evidence | grep -Fx 'release-control:pack-evidence:ok'",
	'Reconcile existing npm version or request publish': "node .github/scripts/release-control.cjs registry-decision | grep -Fx 'release-control:registry-decision:ok'",
	'Publish missing npm version with trusted publishing': [
		"node .github/scripts/release-control.cjs verify-dispatch | grep -Fx 'release-control:verify-dispatch:ok'",
		'npm publish --provenance --access public',
	].join('\n'),
	'Reconcile final npm bytes': "node .github/scripts/release-control.cjs reconcile-registry --retry | grep -Fx 'release-control:reconcile-registry:ok'",
	'Reconcile immutable Git tag and GitHub Release': "node .github/scripts/release-control.cjs reconcile-github-release | grep -Fx 'release-control:reconcile-github-release:ok'",
};

function fakeResponse(status: number, body: JsonObject | Buffer): JsonObject {
	const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
	return {
		status,
		ok: status >= 200 && status < 300,
		text: async () => bytes.toString('utf8'),
		arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	};
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function parseWorkflow(): JsonObject {
	return parse(fs.readFileSync(RELEASE_WORKFLOW, 'utf8')) as JsonObject;
}

function stepByName(workflow: JsonObject, name: string): JsonObject {
	const step = workflow.jobs.publish.steps.find((candidate: JsonObject) => candidate.name === name);
	if (!step) throw new Error(`Missing release step: ${name}`);
	return step;
}

function validateReleaseWorkflow(workflow: JsonObject): void {
	const dispatch = workflow.on?.workflow_dispatch;
	if (!dispatch || dispatch.inputs?.version?.default !== '1.0.2') {
		throw new Error('workflow_dispatch must require exact version 1.0.2');
	}
	if (dispatch.inputs.version.required !== true || dispatch.inputs.version.type !== 'string') {
		throw new Error('workflow_dispatch version input is not a required string');
	}

	const expectedPermissions = { actions: 'read', contents: 'write', 'id-token': 'write' };
	if (JSON.stringify(workflow.permissions) !== JSON.stringify(expectedPermissions)) {
		throw new Error('Release permissions must be exactly actions:read, contents:write, id-token:write');
	}

	const job = workflow.jobs?.publish;
	if (!job || Object.keys(workflow.jobs).length !== 1) throw new Error('Release must have one publish job');
	if (job.environment !== 'npm-release') throw new Error('Release job must use npm-release environment');
	if (job['runs-on'] !== 'ubuntu-latest' || job['timeout-minutes'] !== 20) {
		throw new Error('Release runner contract changed');
	}
	if (workflow.concurrency?.group !== 'npm-release' || workflow.concurrency?.['cancel-in-progress'] !== false) {
		throw new Error('Release concurrency contract changed');
	}

	const stepNames = job.steps.map((step: JsonObject) => step.name);
	if (JSON.stringify(stepNames) !== JSON.stringify(EXPECTED_STEP_NAMES)) {
		throw new Error(`Release step order changed: ${JSON.stringify(stepNames)}`);
	}

	const checkout = stepByName(workflow, 'Check out exact dispatch revision');
	if (checkout.uses !== 'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803') {
		throw new Error('Checkout action is not pinned to the reviewed SHA');
	}
	if (
		checkout.with?.ref !== '${{ github.sha }}' ||
		checkout.with?.['fetch-depth'] !== 0 ||
		checkout.with?.['persist-credentials'] !== false
	) {
		throw new Error('Checkout must use the exact dispatch SHA without persisted credentials');
	}

	const setup = stepByName(workflow, 'Use release runtime');
	if (setup.uses !== 'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38') {
		throw new Error('setup-node action is not pinned to the reviewed SHA');
	}
	if (
		setup.with?.['node-version'] !== '24.20.0' ||
		setup.with?.['registry-url'] !== 'https://registry.npmjs.org' ||
		setup.with?.['package-manager-cache'] !== false
	) {
		throw new Error('Release runtime contract changed');
	}

	for (const step of job.steps) {
		if (step.uses && !/^[^@]+@[0-9a-f]{40}$/.test(step.uses)) {
			throw new Error(`Unpinned action: ${step.uses}`);
		}
		if (EXPECTED_RUNS[step.name] !== undefined && String(step.run).trim() !== EXPECTED_RUNS[step.name]) {
			throw new Error(`Release run step was defanged: ${step.name}`);
		}
	}

	const environment = stepByName(workflow, 'Verify protected release environment');
	const registry = stepByName(workflow, 'Reconcile existing npm version or request publish');
	const publish = stepByName(workflow, 'Publish missing npm version with trusted publishing');
	const githubRelease = stepByName(workflow, 'Reconcile immutable Git tag and GitHub Release');
	if (environment.env?.GITHUB_TOKEN !== '${{ github.token }}') throw new Error('Environment readback lacks GitHub token');
	if (registry.id !== 'registry') throw new Error('Registry decision step must expose the registry id');
	if (publish.if !== "steps.registry.outputs.exists == 'false'") throw new Error('Publish condition is not fail-closed');
	if (githubRelease.env?.GITHUB_TOKEN !== '${{ github.token }}') throw new Error('GitHub reconciliation lacks GitHub token');
	if (/NPM_TOKEN|NODE_AUTH_TOKEN/.test(JSON.stringify(workflow))) {
		throw new Error('Release must use OIDC, never a long-lived npm token');
	}
}

describe('npm release control plane', () => {
	const workflow = parseWorkflow();
	let pack: JsonObject;
	let tarball: Buffer;
	let evidence: JsonObject;
	let manifest: JsonObject;
	let npmCache: string;
	const expectedSha = '0123456789abcdef0123456789abcdef01234567';

	beforeAll(() => {
		npmCache = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-frihet-release-test-'));
		const report = JSON.parse(
			execFileSync('npm', ['pack', '--json', '--ignore-scripts'], {
				cwd: ROOT,
				encoding: 'utf8',
				env: { ...process.env, npm_config_cache: npmCache },
			}),
		)[0];
		pack = report;
		const filename = path.join(ROOT, report.filename);
		try {
			tarball = fs.readFileSync(filename);
			evidence = control.buildPackEvidence(report, tarball, expectedSha);
		} finally {
			if (fs.existsSync(filename)) fs.unlinkSync(filename);
		}
		manifest = {
			name: control.PACKAGE_NAME,
			version: control.VERSION,
			gitHead: expectedSha,
			dist: {
				integrity: evidence.integrity,
				shasum: evidence.shasum,
				tarball: evidence.tarballUrl,
				fileCount: evidence.entryCount,
				unpackedSize: evidence.unpackedSize,
			},
		};
	});

	afterAll(() => {
		if (npmCache) fs.rmSync(npmCache, { recursive: true, force: true });
	});

	it('parses and structurally pins the exact release graph', () => {
		expect(() => validateReleaseWorkflow(workflow)).not.toThrow();
	});

	it('requires a live CLI marker and rejects the exact defanged-main mutant', () => {
		const script = fs.readFileSync(path.join(ROOT, '.github/scripts/release-control.cjs'), 'utf8');
		const live = spawnSync(process.execPath, [path.join(ROOT, '.github/scripts/release-control.cjs'), 'selftest'], {
			cwd: ROOT,
			encoding: 'utf8',
		});
		expect(live.status).toBe(0);
		expect(live.stdout.trim()).toBe('release-control:selftest:ok');

		const mutantSource = script.replace(
			'if (require.main === module)',
			'if (false && require.main === module)',
		);
		expect(mutantSource).not.toBe(script);
		const mutantPath = path.join(npmCache, 'release-control-defanged.cjs');
		fs.writeFileSync(mutantPath, mutantSource);
		const defanged = spawnSync(process.execPath, [mutantPath, 'selftest'], { encoding: 'utf8' });
		expect(defanged.status).toBe(0);
		expect(defanged.stdout.trim()).not.toBe('release-control:selftest:ok');
	});

	it('rejects a defanged publish step even when dead text contains the real command', () => {
		const mutant = clone(workflow);
		const publish = stepByName(mutant, 'Publish missing npm version with trusted publishing');
		publish.run = 'echo "publish intentionally disabled"';
		publish.dead_text = EXPECTED_RUNS[publish.name];
		expect(() => validateReleaseWorkflow(mutant)).toThrow('defanged');
	});

	it('rejects missing actions permission', () => {
		const mutant = clone(workflow);
		delete mutant.permissions.actions;
		expect(() => validateReleaseWorkflow(mutant)).toThrow('permissions');
	});

	it('rejects a stale dispatch version structurally', () => {
		const mutant = clone(workflow);
		mutant.on.workflow_dispatch.inputs.version.default = '1.0.1';
		expect(() => validateReleaseWorkflow(mutant)).toThrow('exact version');
	});

	it('rejects a defanged source/dist drift guard even when dead text preserves it', () => {
		const mutant = clone(workflow);
		const build = stepByName(mutant, 'Build exact committed artifacts');
		build.run = 'npm run build';
		build.dead_text = EXPECTED_RUNS[build.name];
		expect(() => validateReleaseWorkflow(mutant)).toThrow('defanged');
	});

	it('rejects a publish step that can run after a matching registry readback', () => {
		const mutant = clone(workflow);
		stepByName(mutant, 'Publish missing npm version with trusted publishing').if = 'always()';
		expect(() => validateReleaseWorkflow(mutant)).toThrow('condition');
	});

	it('requires reviewer approval, self-review prevention, protected branches, and no admin bypass', () => {
		const environment = {
			protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', id: 1 }], prevent_self_review: true }],
			deployment_branch_policy: { protected_branches: true },
			can_admins_bypass: false,
		};
		expect(() => control.validateEnvironmentPolicy(environment)).not.toThrow();
		const mutant = clone(environment);
		mutant.can_admins_bypass = true;
		expect(() => control.validateEnvironmentPolicy(mutant)).toThrow('administrator bypass');
	});

	it.each([
		['stale version', { inputVersion: '1.0.1' }],
		['wrong repository', { repository: 'someone/fork' }],
		['non-main ref', { ref: 'refs/heads/release' }],
		['wrong checked-out SHA', { head: 'f'.repeat(40) }],
		['dirty tree', { status: ' M package.json' }],
		['tracked node_modules', { trackedNodeModules: 'node_modules/yaml/index.js' }],
	])('hard-fails dispatch provenance with %s', (_name, mutation) => {
		const valid = {
			repository: 'Frihet-io/n8n-nodes-frihet',
			ref: 'refs/heads/main',
			inputVersion: '1.0.2',
			sha: expectedSha,
			head: expectedSha,
			status: '',
			trackedNodeModules: '',
		};
		expect(() => control.validateDispatchContext({ ...valid, ...mutation })).toThrow();
	});

	it('keeps the original main dispatch SHA retryable after the mutable branch tip advances', () => {
		expect(() => control.validateDispatchContext({
			repository: 'Frihet-io/n8n-nodes-frihet',
			ref: 'refs/heads/main',
			inputVersion: '1.0.2',
			sha: expectedSha,
			head: expectedSha,
			status: '',
			trackedNodeModules: '',
		})).not.toThrow();
	});

	it('pins input, package, lock, Node, and npm versions together', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
		const packageLock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
		const valid = {
			inputVersion: '1.0.2',
			packageJson,
			packageLock,
			nodeVersion: 'v24.20.0',
			npmVersion: '11.19.0',
		};
		expect(() => control.validateMetadataContract(valid)).not.toThrow();
		const mutant = clone(valid);
		mutant.packageLock.packages[''].version = '1.0.1';
		expect(() => control.validateMetadataContract(mutant)).toThrow('package-lock package');
	});

	it('builds exact local evidence for the 10-file runtime package', () => {
		expect(pack.entryCount).toBe(10);
		expect(evidence.files.map((entry: JsonObject) => entry.path)).toEqual(control.EXPECTED_FILES);
		expect(evidence.size).toBe(tarball.length);
		expect(evidence.sha).toBe(expectedSha);
	});

	it('retries safely after publish by accepting only byte-identical existing npm state', () => {
		expect(control.decideRegistryAction(null, evidence, expectedSha)).toEqual({
			exists: false,
			shouldPublish: true,
			readback: null,
		});
		const retry = control.decideRegistryAction({ manifest, tarball }, evidence, expectedSha);
		expect(retry.exists).toBe(true);
		expect(retry.shouldPublish).toBe(false);
		expect(retry.readback.validated).toBe(true);
	});

	it.each([404, 408, 425, 429, 500, 502, 599])('classifies npm HTTP %s as transient', (status) => {
		expect(control.isTransientRegistryStatus(status)).toBe(true);
	});

	it.each([400, 401, 403, 409, 422])('classifies npm HTTP %s as permanent', (status) => {
		expect(control.isTransientRegistryStatus(status)).toBe(false);
	});

	it('retries the exact manifest-200/tarball-404 state until byte-identical success', async () => {
		const responses = [
			fakeResponse(200, manifest),
			fakeResponse(404, { error: 'tarball not propagated' }),
			fakeResponse(200, manifest),
			fakeResponse(200, tarball),
		];
		const requestImpl = jest.fn(async () => responses.shift());
		const sleep = jest.fn(async () => undefined);
		const readback = await control.reconcileRegistryReadback({
			attempts: 2,
			delayMs: 0,
			evidence,
			expectedSha,
			fetchPublished: () => control.fetchPublishedPackage(evidence, expectedSha, requestImpl),
			sleep,
		});
		expect(readback.validated).toBe(true);
		expect(requestImpl).toHaveBeenCalledTimes(4);
		expect(sleep).toHaveBeenCalledTimes(1);
	});

	it.each([
		Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
		Object.assign(new Error('request timed out'), { name: 'TimeoutError' }),
	])('retries transient npm network failures before success', async (networkError) => {
		const requestImpl = jest
			.fn()
			.mockRejectedValueOnce(networkError)
			.mockResolvedValueOnce(fakeResponse(200, manifest))
			.mockResolvedValueOnce(fakeResponse(200, tarball));
		const readback = await control.reconcileRegistryReadback({
			attempts: 2,
			delayMs: 0,
			evidence,
			expectedSha,
			fetchPublished: () => control.fetchPublishedPackage(evidence, expectedSha, requestImpl),
			sleep: async () => undefined,
		});
		expect(readback.validated).toBe(true);
	});

	it.each(['manifest body', 'tarball body'])('retries a connection failure while reading the npm %s', async (phase) => {
		const bodyError = Object.assign(new Error('connection reset while streaming'), { code: 'ECONNRESET' });
		const brokenManifest = fakeResponse(200, manifest);
		brokenManifest.text = async () => { throw bodyError; };
		const brokenTarball = fakeResponse(200, tarball);
		brokenTarball.arrayBuffer = async () => { throw bodyError; };
		const responses = phase === 'manifest body'
			? [brokenManifest, fakeResponse(200, manifest), fakeResponse(200, tarball)]
			: [fakeResponse(200, manifest), brokenTarball, fakeResponse(200, manifest), fakeResponse(200, tarball)];
		const requestImpl = jest.fn(async () => responses.shift());
		const readback = await control.reconcileRegistryReadback({
			attempts: 2,
			delayMs: 0,
			evidence,
			expectedSha,
			fetchPublished: () => control.fetchPublishedPackage(evidence, expectedSha, requestImpl),
			sleep: async () => undefined,
		});
		expect(readback.validated).toBe(true);
	});

	it('exhausts the bounded retry budget when the matching manifest tarball stays 404', async () => {
		expect(control.REGISTRY_RETRY_ATTEMPTS).toBe(12);
		expect(control.REGISTRY_RETRY_DELAY_MS).toBe(10_000);
		expect(control.REGISTRY_REQUEST_TIMEOUT_MS).toBe(10_000);
		const maximumBudgetMs =
			control.REGISTRY_RETRY_ATTEMPTS * 2 * control.REGISTRY_REQUEST_TIMEOUT_MS +
			(control.REGISTRY_RETRY_ATTEMPTS - 1) * control.REGISTRY_RETRY_DELAY_MS;
		expect(maximumBudgetMs).toBe(350_000);
		const requestImpl = jest.fn(async (url: string) => (
			url === evidence.tarballUrl
				? fakeResponse(404, { error: 'still propagating' })
				: fakeResponse(200, manifest)
		));
		const sleep = jest.fn(async () => undefined);
		await expect(control.reconcileRegistryReadback({
			attempts: 3,
			delayMs: 0,
			evidence,
			expectedSha,
			fetchPublished: () => control.fetchPublishedPackage(evidence, expectedSha, requestImpl),
			sleep,
		})).rejects.toThrow('after 3 attempts');
		expect(requestImpl).toHaveBeenCalledTimes(6);
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it('hard-fails a permanent manifest mismatch without retrying its tarball', async () => {
		const wrong = clone(manifest);
		wrong.gitHead = 'f'.repeat(40);
		const requestImpl = jest.fn(async () => fakeResponse(200, wrong));
		const sleep = jest.fn(async () => undefined);
		await expect(control.reconcileRegistryReadback({
			attempts: 3,
			delayMs: 0,
			evidence,
			expectedSha,
			fetchPublished: () => control.fetchPublishedPackage(evidence, expectedSha, requestImpl),
			sleep,
		})).rejects.toThrow('gitHead mismatch');
		expect(requestImpl).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it.each([
		['gitHead', (mutant: JsonObject) => { mutant.gitHead = 'f'.repeat(40); }],
		['integrity', (mutant: JsonObject) => { mutant.dist.integrity = 'sha512-wrong'; }],
		['shasum', (mutant: JsonObject) => { mutant.dist.shasum = '0'.repeat(40); }],
	])('hard-fails an existing npm version with wrong %s', (_field, mutate) => {
		const mutant = clone(manifest);
		mutate(mutant);
		expect(() => control.decideRegistryAction({ manifest: mutant, tarball }, evidence, expectedSha)).toThrow();
	});

	it('hard-fails downloaded npm bytes that differ from the expected pack', () => {
		const mutant = Buffer.from(tarball);
		mutant[mutant.length - 1] ^= 1;
		expect(() => control.decideRegistryAction({ manifest, tarball: mutant }, evidence, expectedSha)).toThrow();
	});

	it('resolves annotated tags and rejects a tag pointing at the wrong main SHA', () => {
		const annotated = {
			object: { type: 'tag', sha: 'a'.repeat(40) },
			objects: {
				['a'.repeat(40)]: { type: 'commit', sha: expectedSha },
			},
		};
		const target = control.resolveTagTargetFromObjects(annotated.object, annotated.objects);
		expect(target).toBe(expectedSha);
		const release = {
			tag_name: control.TAG,
			target_commitish: expectedSha,
			name: control.RELEASE_NAME,
			body: control.RELEASE_BODY,
			draft: false,
			prerelease: false,
		};
		expect(() => control.validateReleaseRecord(release, target, expectedSha)).not.toThrow();
		expect(() => control.validateReleaseRecord(release, 'b'.repeat(40), expectedSha)).toThrow('points to');
	});

	it.each(['develop', 'refs/heads/develop', 'f'.repeat(40)])(
		'rejects a GitHub Release target_commitish outside exact main semantics: %s',
		(targetCommitish) => {
			const release = {
				tag_name: control.TAG,
				target_commitish: targetCommitish,
				name: control.RELEASE_NAME,
				body: control.RELEASE_BODY,
				draft: false,
				prerelease: false,
			};
			expect(() => control.validateReleaseRecord(release, expectedSha, expectedSha)).toThrow('target_commitish');
		},
	);

	it.each([expectedSha, 'main', 'refs/heads/main'])(
		'accepts target_commitish %s only with the exact peeled tag SHA',
		(targetCommitish) => {
			const release = {
				tag_name: control.TAG,
				target_commitish: targetCommitish,
				name: control.RELEASE_NAME,
				body: control.RELEASE_BODY,
				draft: false,
				prerelease: false,
			};
			expect(() => control.validateReleaseRecord(release, expectedSha, expectedSha)).not.toThrow();
		},
	);

	it('keeps package and lock metadata on exact version 1.0.2', () => {
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
});
