# Path to Official n8n Node

## The Reality
PRs adding new nodes to the n8n monorepo are **auto-closed** unless explicitly invited by n8n team.

## The Path: Verified Community Node
1. Publish or reconcile community node `1.0.2` on npm (verify registry state;
   source metadata alone is not publication evidence)
2. Submit to Creator Portal: `internal.users.n8n.cloud/form/f0ff9304-f34a-420e-99da-6103a2f8ac5b`
3. Review: 4-7 weeks
4. Result: Shield badge + appears in canvas node browser for all users

## Measured Requirements
- MIT package declaration: present.
- Runtime dependency surface: no direct runtime dependencies; `n8n-workflow` is a peer dependency.
- `n8n-community-node-package` keyword: present.
- Contract tests: run on Node 20 and 22 in CI; they execute the node transport,
  template expressions, package allowlist, and release-policy mutants.
- Deterministic artifacts: CI runs `npm ci`, rebuilds `dist`, and requires
  `git diff --exit-code -- dist`.
- Provenance: source metadata does not claim registry provenance.
  `.github/workflows/release.yml` uses npm trusted publishing with OIDC and
  reconciles `gitHead`, integrity, shasum, downloaded tarball bytes, file
  allowlist/count/sizes, immutable tag, and GitHub Release.
- Verification and UX review: still outstanding.

## Owner setup required before the first release dispatch

Code cannot create or prove npm's trusted-publisher relationship before an
OIDC publish attempt. The package owner must configure npm with these exact
claims:

- GitHub organization: `Frihet-io`
- Repository: `n8n-nodes-frihet`
- Workflow filename: `release.yml`
- Environment: `npm-release`
- Allowed action: `npm publish`

The GitHub `npm-release` environment must require at least one reviewer,
prevent self-review, allow protected branches only, and disallow administrator
bypass. The workflow checks those GitHub settings at runtime and fails before
publish if they are absent.
A missing or mismatched
npm trusted publisher causes `npm publish` to fail authentication; no
`NPM_TOKEN` fallback exists. Do not dispatch until these provider settings are
reviewed by an owner.

## Key Links
- Verification guidelines: docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/
- UX guidelines: docs.n8n.io/integrations/creating-nodes/build/reference/ux-guidelines/
- Creator Portal: internal.users.n8n.cloud/form/f0ff9304-f34a-420e-99da-6103a2f8ac5b
- n8n-nodes-starter: github.com/n8n-io/n8n-nodes-starter

## Remaining Before Submission
- [x] Add executable node and workflow-template contract tests
- [x] Add GitHub Actions CI on Node 20/22
- [x] Add a fail-closed, retry-safe OIDC release workflow
- [ ] Complete or reconcile the protected `1.0.2` terminal release state and retain npm/GitHub readback evidence
- [ ] Verify against UX guidelines
- [ ] Submit to Creator Portal
