#!/usr/bin/env node

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const PACKAGE_NAME = 'n8n-nodes-frihet';
const VERSION = '1.0.2';
const TAG = `v${VERSION}`;
const REPOSITORY = 'Frihet-io/n8n-nodes-frihet';
const MAIN_BRANCH = 'main';
const MAIN_REF = `refs/heads/${MAIN_BRANCH}`;
const ENVIRONMENT = 'npm-release';
const NODE_VERSION = 'v24.20.0';
const NPM_VERSION = '11.19.0';
const REGISTRY = 'https://registry.npmjs.org';
const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const EVIDENCE_NAME = 'npm-pack-evidence.json';
const READBACK_NAME = 'npm-readback.json';
const REGISTRY_REQUEST_TIMEOUT_MS = 10_000;
const REGISTRY_RETRY_ATTEMPTS = 12;
const REGISTRY_RETRY_DELAY_MS = 10_000;
const RELEASE_NAME = `${PACKAGE_NAME} v${VERSION}`;
const RELEASE_BODY = [
	`Immutable release for ${PACKAGE_NAME}@${VERSION}.`,
	'',
	'The npm tarball, registry metadata, Git tag, and this GitHub Release were reconciled by the protected release workflow against the same main commit.',
].join('\n');

const EXPECTED_FILES = Object.freeze([
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

function invariant(condition, message) {
	if (!condition) throw new Error(message);
}

class RegistryTransientError extends Error {
	constructor(message, cause) {
		super(message, { cause });
		this.name = 'RegistryTransientError';
	}
}

function isTransientRegistryStatus(status) {
	return status === 404 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function sorted(values) {
	return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function sha1(buffer) {
	return crypto.createHash('sha1').update(buffer).digest('hex');
}

function integrity(buffer) {
	return `sha512-${crypto.createHash('sha512').update(buffer).digest('base64')}`;
}

function parseTarSize(header) {
	const value = header.toString('utf8').replace(/\0.*$/s, '').trim();
	return value === '' ? 0 : Number.parseInt(value, 8);
}

function parseTarFiles(tarball) {
	const archive = zlib.gunzipSync(tarball);
	const files = [];
	let offset = 0;

	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;

		const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
		const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
		const fullName = prefix ? `${prefix}/${name}` : name;
		const size = parseTarSize(header.subarray(124, 136));
		const type = header.subarray(156, 157).toString('utf8');

		if (type === '' || type === '0') {
			invariant(fullName.startsWith('package/'), `Unexpected tar entry root: ${fullName}`);
			files.push({ path: fullName.slice('package/'.length), size });
		}

		offset += 512 + Math.ceil(size / 512) * 512;
	}

	return files;
}

function validateFileContract(files, label) {
	const paths = sorted(files.map((entry) => entry.path));
	invariant(
		JSON.stringify(paths) === JSON.stringify(EXPECTED_FILES),
		`${label} file allowlist mismatch: ${JSON.stringify(paths)}`,
	);
	for (const entry of files) {
		invariant(Number.isInteger(entry.size) && entry.size >= 0, `${label} has invalid size for ${entry.path}`);
	}
}

function buildPackEvidence(pack, tarball, sha) {
	invariant(pack && typeof pack === 'object', 'npm pack returned no report');
	invariant(pack.name === PACKAGE_NAME, `Unexpected pack name: ${pack.name}`);
	invariant(pack.version === VERSION, `Unexpected pack version: ${pack.version}`);
	invariant(pack.filename === `${PACKAGE_NAME}-${VERSION}.tgz`, `Unexpected tarball filename: ${pack.filename}`);
	invariant(pack.entryCount === EXPECTED_FILES.length, `Unexpected pack entry count: ${pack.entryCount}`);
	invariant(pack.files.length === EXPECTED_FILES.length, `Unexpected pack files length: ${pack.files.length}`);
	validateFileContract(pack.files, 'npm pack report');

	const tarFiles = parseTarFiles(tarball);
	validateFileContract(tarFiles, 'local tarball');
	const reportSizes = new Map(pack.files.map((entry) => [entry.path, entry.size]));
	for (const entry of tarFiles) {
		invariant(reportSizes.get(entry.path) === entry.size, `Local tar size mismatch for ${entry.path}`);
	}

	const unpackedSize = pack.files.reduce((total, entry) => total + entry.size, 0);
	invariant(pack.unpackedSize === unpackedSize, 'npm pack unpackedSize does not equal file-size sum');
	invariant(pack.size === tarball.length, 'npm pack size does not equal tarball byte length');
	invariant(pack.shasum === sha1(tarball), 'npm pack shasum does not match tarball bytes');
	invariant(pack.integrity === integrity(tarball), 'npm pack integrity does not match tarball bytes');

	return {
		schemaVersion: 1,
		name: PACKAGE_NAME,
		version: VERSION,
		sha,
		tarballUrl: `${REGISTRY}/${PACKAGE_NAME}/-/${PACKAGE_NAME}-${VERSION}.tgz`,
		size: pack.size,
		unpackedSize: pack.unpackedSize,
		entryCount: pack.entryCount,
		shasum: pack.shasum,
		integrity: pack.integrity,
		files: pack.files
			.map((entry) => ({ path: entry.path, size: entry.size }))
			.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
	};
}

function validatePublishedManifest(manifest, evidence, expectedSha) {
	invariant(manifest && typeof manifest === 'object', 'npm manifest is missing');
	invariant(evidence.sha === expectedSha, 'Local pack evidence SHA does not match GITHUB_SHA');
	invariant(manifest.name === PACKAGE_NAME, `Published package name mismatch: ${manifest.name}`);
	invariant(manifest.version === VERSION, `Published version mismatch: ${manifest.version}`);
	invariant(manifest.gitHead === expectedSha, `Published gitHead mismatch: ${manifest.gitHead}`);
	invariant(manifest.dist?.integrity === evidence.integrity, 'Published integrity differs from expected pack');
	invariant(manifest.dist?.shasum === evidence.shasum, 'Published shasum differs from expected pack');
	invariant(manifest.dist?.tarball === evidence.tarballUrl, 'Published tarball URL differs from expected pack');
	invariant(manifest.dist?.fileCount === evidence.entryCount, 'Published file count differs from expected pack');
	invariant(manifest.dist?.unpackedSize === evidence.unpackedSize, 'Published unpacked size differs from expected pack');
	return true;
}

function validatePublishedPackage(manifest, tarball, evidence, expectedSha) {
	validatePublishedManifest(manifest, evidence, expectedSha);
	invariant(tarball.length === evidence.size, 'Downloaded tarball byte length differs from expected pack');
	invariant(sha1(tarball) === evidence.shasum, 'Downloaded tarball shasum differs from expected pack');
	invariant(integrity(tarball) === evidence.integrity, 'Downloaded tarball integrity differs from expected pack');

	const remoteFiles = parseTarFiles(tarball);
	validateFileContract(remoteFiles, 'downloaded npm tarball');
	const expectedSizes = new Map(evidence.files.map((entry) => [entry.path, entry.size]));
	for (const entry of remoteFiles) {
		invariant(expectedSizes.get(entry.path) === entry.size, `Downloaded tar size mismatch for ${entry.path}`);
	}

	return {
		validated: true,
		name: PACKAGE_NAME,
		version: VERSION,
		gitHead: manifest.gitHead,
		integrity: manifest.dist.integrity,
		shasum: manifest.dist.shasum,
		tarball: manifest.dist.tarball,
		fileCount: manifest.dist.fileCount,
		unpackedSize: manifest.dist.unpackedSize,
		size: tarball.length,
	};
}

function decideRegistryAction(published, evidence, expectedSha) {
	if (published === null) return { exists: false, shouldPublish: true, readback: null };
	const readback = validatePublishedPackage(published.manifest, published.tarball, evidence, expectedSha);
	return { exists: true, shouldPublish: false, readback };
}

function validateEnvironmentPolicy(environment) {
	invariant(environment && typeof environment === 'object', 'GitHub environment response is missing');
	const reviewers = (environment.protection_rules ?? []).find((rule) => rule.type === 'required_reviewers');
	invariant(reviewers && Array.isArray(reviewers.reviewers) && reviewers.reviewers.length > 0, 'npm-release must require at least one reviewer');
	invariant(reviewers.prevent_self_review === true, 'npm-release must prevent self-review');
	invariant(environment.deployment_branch_policy?.protected_branches === true, 'npm-release must allow protected branches only');
	invariant(environment.can_admins_bypass === false, 'npm-release must disallow administrator bypass');
	return true;
}

function resolveTagTargetFromObjects(refObject, tagObjects) {
	let object = refObject;
	for (let depth = 0; depth < 8; depth += 1) {
		invariant(object && typeof object.sha === 'string', 'Tag object is missing a SHA');
		if (object.type === 'commit') return object.sha;
		invariant(object.type === 'tag', `Unsupported tag object type: ${object.type}`);
		object = tagObjects[object.sha];
	}
	throw new Error('Annotated tag chain exceeds maximum depth');
}

function validateReleaseRecord(release, tagTarget, expectedSha) {
	invariant(tagTarget === expectedSha, `Tag ${TAG} points to ${tagTarget}, expected ${expectedSha}`);
	invariant(release && typeof release === 'object', 'GitHub Release is missing');
	invariant(release.tag_name === TAG, `GitHub Release tag mismatch: ${release.tag_name}`);
	invariant(
		[expectedSha, MAIN_BRANCH, MAIN_REF].includes(release.target_commitish),
		`GitHub Release target_commitish mismatch: ${release.target_commitish}`,
	);
	invariant(release.name === RELEASE_NAME, `GitHub Release name mismatch: ${release.name}`);
	invariant(release.body === RELEASE_BODY, 'GitHub Release body differs from the immutable release contract');
	invariant(release.draft === false, 'GitHub Release must not be a draft');
	invariant(release.prerelease === false, 'GitHub Release must not be a prerelease');
	return true;
}

function runnerFile(name) {
	const directory = process.env.RUNNER_TEMP;
	invariant(directory, 'RUNNER_TEMP is required');
	return path.join(directory, name);
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
	fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function git(...args) {
	return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function validateDispatchContext(context) {
	invariant(context.repository === REPOSITORY, `Unexpected repository: ${context.repository}`);
	invariant(context.ref === MAIN_REF, `Release must run from main, got ${context.ref}`);
	invariant(context.inputVersion === VERSION, `Release input must be ${VERSION}`);
	invariant(context.sha === context.head, 'Checked-out HEAD differs from GITHUB_SHA');
	invariant(context.status === '', 'Release worktree is dirty');
	invariant(context.trackedNodeModules === '', 'node_modules is tracked');
	return true;
}

function assertDispatch() {
	validateDispatchContext({
		repository: process.env.GITHUB_REPOSITORY,
		ref: process.env.GITHUB_REF,
		inputVersion: process.env.INPUT_VERSION,
		sha: process.env.GITHUB_SHA,
		head: git('rev-parse', 'HEAD'),
		status: git('status', '--porcelain=v1'),
		trackedNodeModules: git('ls-files', 'node_modules'),
	});
}

function validateMetadataContract(metadata) {
	const { packageJson, packageLock } = metadata;
	invariant(metadata.inputVersion === VERSION, `Release input must be ${VERSION}`);
	invariant(packageJson.version === VERSION, 'package.json version mismatch');
	invariant(packageLock.version === VERSION, 'package-lock root version mismatch');
	invariant(packageLock.packages?.['']?.version === VERSION, 'package-lock package version mismatch');
	invariant(metadata.nodeVersion === NODE_VERSION, `Release Node must be ${NODE_VERSION}, got ${metadata.nodeVersion}`);
	invariant(metadata.npmVersion === NPM_VERSION, `Release npm must be ${NPM_VERSION}, got ${metadata.npmVersion}`);
	return true;
}

function assertMetadata() {
	const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
	validateMetadataContract({
		inputVersion: process.env.INPUT_VERSION,
		packageJson: readJson('package.json'),
		packageLock: readJson('package-lock.json'),
		nodeVersion: process.version,
		npmVersion,
	});
}

async function request(url, options = {}) {
	const response = await fetch(url, {
		...options,
		headers: {
			Accept: 'application/vnd.github+json',
			'Cache-Control': 'no-cache',
			...(options.headers ?? {}),
		},
	});
	return response;
}

async function registryRequest(url, options, label, requestImpl = request) {
	try {
		return await requestImpl(url, {
			...options,
			signal: options?.signal ?? AbortSignal.timeout(REGISTRY_REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		throw new RegistryTransientError(`${label} network failure: ${error.message}`, error);
	}
}

function rejectTransientRegistryStatus(response, label) {
	if (isTransientRegistryStatus(response.status)) {
		throw new RegistryTransientError(`${label} is transiently unavailable (${response.status})`);
	}
}

async function readRegistryBody(response, method, label) {
	try {
		return await response[method]();
	} catch (error) {
		throw new RegistryTransientError(`${label} body read failed: ${error.message}`, error);
	}
}

async function registryResponseJson(response, label) {
	const body = await readRegistryBody(response, 'text', label);
	if (!response.ok) throw new Error(`${label} failed (${response.status}): ${body.slice(0, 500)}`);
	try {
		return JSON.parse(body);
	} catch (error) {
		throw new RegistryTransientError(`${label} returned incomplete or invalid JSON: ${error.message}`, error);
	}
}

async function responseJson(response, label) {
	const text = await response.text();
	if (!response.ok) throw new Error(`${label} failed (${response.status}): ${text.slice(0, 500)}`);
	return JSON.parse(text);
}

async function verifyEnvironment() {
	const token = process.env.GITHUB_TOKEN;
	invariant(token, 'GITHUB_TOKEN is required');
	const response = await request(`${GITHUB_API}/repos/${REPOSITORY}/environments/${ENVIRONMENT}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': API_VERSION,
		},
	});
	const environment = await responseJson(response, 'Environment readback');
	validateEnvironmentPolicy(environment);
}

function createPackEvidence() {
	const output = execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { encoding: 'utf8' });
	const pack = JSON.parse(output)[0];
	const tarballPath = path.resolve(pack.filename);
	try {
		const tarball = fs.readFileSync(tarballPath);
		const evidence = buildPackEvidence(pack, tarball, process.env.GITHUB_SHA);
		writeJson(runnerFile(EVIDENCE_NAME), evidence);
		return evidence;
	} finally {
		if (fs.existsSync(tarballPath)) fs.unlinkSync(tarballPath);
	}
}

async function fetchPublishedPackage(evidence, expectedSha, requestImpl = request) {
	const manifestResponse = await registryRequest(`${REGISTRY}/${PACKAGE_NAME}/${VERSION}`, {
		headers: { Accept: 'application/json' },
	}, 'npm manifest readback', requestImpl);
	if (manifestResponse.status === 404) return null;
	rejectTransientRegistryStatus(manifestResponse, 'npm manifest readback');
	const manifest = await registryResponseJson(manifestResponse, 'npm manifest readback');
	validatePublishedManifest(manifest, evidence, expectedSha);
	const tarballResponse = await registryRequest(
		manifest.dist.tarball,
		{ headers: { Accept: 'application/octet-stream' } },
		'npm tarball readback',
		requestImpl,
	);
	rejectTransientRegistryStatus(tarballResponse, 'npm tarball readback');
	if (!tarballResponse.ok) {
		const body = await readRegistryBody(tarballResponse, 'text', 'npm tarball readback');
		throw new Error(`npm tarball readback failed (${tarballResponse.status}): ${body.slice(0, 500)}`);
	}
	const tarball = await readRegistryBody(tarballResponse, 'arrayBuffer', 'npm tarball readback');
	return { manifest, tarball: Buffer.from(tarball) };
}

function appendOutput(name, value) {
	invariant(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required');
	fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function registryDecision() {
	const evidence = readJson(runnerFile(EVIDENCE_NAME));
	const published = await fetchPublishedPackage(evidence, process.env.GITHUB_SHA);
	const decision = decideRegistryAction(published, evidence, process.env.GITHUB_SHA);
	if (decision.readback) writeJson(runnerFile(READBACK_NAME), decision.readback);
	appendOutput('exists', decision.exists ? 'true' : 'false');
	return decision;
}

async function reconcileRegistryReadback({
	attempts,
	delayMs,
	evidence,
	expectedSha,
	fetchPublished,
	sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
	invariant(Number.isInteger(attempts) && attempts > 0, 'Registry retry attempts must be a positive integer');
	invariant(Number.isInteger(delayMs) && delayMs >= 0, 'Registry retry delay must be a non-negative integer');
	let lastTransient;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const published = await fetchPublished();
			if (published === null) {
				throw new RegistryTransientError(`${PACKAGE_NAME}@${VERSION} manifest is not readable yet (404)`);
			}
			return validatePublishedPackage(published.manifest, published.tarball, evidence, expectedSha);
		} catch (error) {
			if (!(error instanceof RegistryTransientError)) throw error;
			lastTransient = error;
		}
		if (attempt < attempts) await sleep(delayMs);
	}
	throw new Error(
		`${PACKAGE_NAME}@${VERSION} did not become fully readable after ${attempts} attempts: ${lastTransient.message}`,
		{ cause: lastTransient },
	);
}

async function reconcileRegistry(retry) {
	const evidence = readJson(runnerFile(EVIDENCE_NAME));
	const expectedSha = process.env.GITHUB_SHA;
	const readback = await reconcileRegistryReadback({
		attempts: retry ? REGISTRY_RETRY_ATTEMPTS : 1,
		delayMs: retry ? REGISTRY_RETRY_DELAY_MS : 0,
		evidence,
		expectedSha,
		fetchPublished: () => fetchPublishedPackage(evidence, expectedSha),
	});
	writeJson(runnerFile(READBACK_NAME), readback);
	return readback;
}

function githubHeaders() {
	const token = process.env.GITHUB_TOKEN;
	invariant(token, 'GITHUB_TOKEN is required');
	return {
		Authorization: `Bearer ${token}`,
		'X-GitHub-Api-Version': API_VERSION,
		'Content-Type': 'application/json',
	};
}

async function githubJson(method, pathname, body, allowedStatuses = [200]) {
	const response = await request(`${GITHUB_API}/repos/${REPOSITORY}${pathname}`, {
		method,
		headers: githubHeaders(),
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (allowedStatuses.includes(response.status)) {
		return { status: response.status, data: response.status === 204 ? null : JSON.parse(await response.text()) };
	}
	const text = await response.text();
	throw new Error(`GitHub ${method} ${pathname} failed (${response.status}): ${text.slice(0, 500)}`);
}

async function readTagTarget() {
	const ref = await githubJson('GET', `/git/ref/tags/${encodeURIComponent(TAG)}`, undefined, [200, 404]);
	if (ref.status === 404) return null;
	let object = ref.data.object;
	for (let depth = 0; depth < 8; depth += 1) {
		if (object.type === 'commit') return object.sha;
		invariant(object.type === 'tag', `Unsupported Git tag object type: ${object.type}`);
		const annotated = await githubJson('GET', `/git/tags/${object.sha}`);
		object = annotated.data.object;
	}
	throw new Error('Annotated tag chain exceeds maximum depth');
}

async function ensureTag(expectedSha) {
	let target = await readTagTarget();
	if (target === null) {
		try {
			await githubJson('POST', '/git/refs', { ref: `refs/tags/${TAG}`, sha: expectedSha }, [201]);
		} catch (error) {
			// A concurrent retry may have created the immutable tag. Verify it below.
			if (!String(error.message).includes('(422)')) throw error;
		}
		target = await readTagTarget();
	}
	invariant(target === expectedSha, `Tag ${TAG} points to ${target}, expected ${expectedSha}`);
	return target;
}

async function readRelease() {
	const release = await githubJson('GET', `/releases/tags/${encodeURIComponent(TAG)}`, undefined, [200, 404]);
	return release.status === 404 ? null : release.data;
}

async function ensureRelease(expectedSha) {
	const target = await ensureTag(expectedSha);
	let release = await readRelease();
	if (release === null) {
		try {
			await githubJson('POST', '/releases', {
				tag_name: TAG,
				target_commitish: expectedSha,
				name: RELEASE_NAME,
				body: RELEASE_BODY,
				draft: false,
				prerelease: false,
				generate_release_notes: false,
			}, [201]);
		} catch (error) {
			// A concurrent retry may have created the immutable release. Verify it below.
			if (!String(error.message).includes('(422)')) throw error;
		}
		release = await readRelease();
	}
	validateReleaseRecord(release, target, expectedSha);
	return release;
}

async function reconcileGitHubRelease() {
	const readback = readJson(runnerFile(READBACK_NAME));
	invariant(readback.validated === true, 'Validated npm readback is required before GitHub release');
	invariant(readback.gitHead === process.env.GITHUB_SHA, 'Validated npm gitHead differs from GITHUB_SHA');
	return ensureRelease(process.env.GITHUB_SHA);
}

const HANDLER_COMPLETION = Symbol('release-control-handler-completion');

const DEFAULT_COMMAND_HANDLERS = Object.freeze({
	verifyDispatch: assertDispatch,
	verifyEnvironment,
	verifyMetadata: assertMetadata,
	packEvidence: createPackEvidence,
	registryDecision,
	reconcileRegistry,
	reconcileGitHubRelease,
	dispatchSelftest: () => undefined,
	selftest: () => undefined,
});

async function dispatchCommand(command, args = [], handlers = DEFAULT_COMMAND_HANDLERS) {
	switch (command) {
		case 'verify-dispatch':
			await handlers.verifyDispatch();
			break;
		case 'verify-environment':
			await handlers.verifyEnvironment();
			break;
		case 'verify-metadata':
			await handlers.verifyMetadata();
			break;
		case 'pack-evidence':
			await handlers.packEvidence();
			break;
		case 'registry-decision':
			await handlers.registryDecision();
			break;
		case 'reconcile-registry':
			await handlers.reconcileRegistry(args.includes('--retry'));
			break;
		case 'reconcile-github-release':
			await handlers.reconcileGitHubRelease();
			break;
		case 'dispatch-selftest':
			await handlers.dispatchSelftest();
			break;
		case 'selftest':
			await handlers.selftest();
			break;
		default:
			throw new Error(`Unknown release-control command: ${command ?? '<missing>'}`);
	}
	return { command, completion: HANDLER_COMPLETION };
}

function hasCompletedHandler(result, command) {
	return Boolean(
		result &&
		typeof result === 'object' &&
		result.command === command &&
		result.completion === HANDLER_COMPLETION,
	);
}

async function main() {
	const [command, ...args] = process.argv.slice(2);
	return dispatchCommand(command, args);
}

function cliSuccessMarker(command) {
	return `release-control:${command}:ok`;
}

module.exports = {
	EXPECTED_FILES,
	PACKAGE_NAME,
	REGISTRY_REQUEST_TIMEOUT_MS,
	REGISTRY_RETRY_ATTEMPTS,
	REGISTRY_RETRY_DELAY_MS,
	RELEASE_BODY,
	RELEASE_NAME,
	TAG,
	VERSION,
	buildPackEvidence,
	cliSuccessMarker,
	decideRegistryAction,
	dispatchCommand,
	fetchPublishedPackage,
	hasCompletedHandler,
	isTransientRegistryStatus,
	parseTarFiles,
	reconcileRegistryReadback,
	resolveTagTargetFromObjects,
	validateDispatchContext,
	validateEnvironmentPolicy,
	validateFileContract,
	validateMetadataContract,
	validatePublishedManifest,
	validatePublishedPackage,
	validateReleaseRecord,
};

if (require.main === module) {
	main()
		.then((result) => {
			invariant(hasCompletedHandler(result, result?.command), 'Release-control command handler did not complete');
			console.log(cliSuccessMarker(result.command));
		})
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}
