# Path to Official n8n Node

## The Reality
PRs adding new nodes to the n8n monorepo are **auto-closed** unless explicitly invited by n8n team.

## The Path: Verified Community Node
1. Publish community node on npm (DONE: `n8n-nodes-frihet@1.0.0`)
2. Submit to Creator Portal: `internal.users.n8n.cloud/form/f0ff9304-f34a-420e-99da-6103a2f8ac5b`
3. Review: 4-7 weeks
4. Result: Shield badge + appears in canvas node browser for all users

## Requirements for Verification
- MIT license (have it)
- Zero external deps (have it)
- `n8n-community-node-package` keyword (have it)
- Tests (TODO: add workflow JSON + unit tests)
- GitHub Actions provenance (TODO: required from May 1 2026)
- Pass verification + UX guidelines

## Key Links
- Verification guidelines: docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/
- UX guidelines: docs.n8n.io/integrations/creating-nodes/build/reference/ux-guidelines/
- Creator Portal: internal.users.n8n.cloud/form/f0ff9304-f34a-420e-99da-6103a2f8ac5b
- n8n-nodes-starter: github.com/n8n-io/n8n-nodes-starter

## TODO Before Submission
- [ ] Add workflow JSON tests (follow Switch node pattern)
- [ ] Add unit tests with jest-mock-extended
- [ ] Add GitHub Actions CI + provenance
- [ ] Verify against UX guidelines
- [ ] Submit to Creator Portal
