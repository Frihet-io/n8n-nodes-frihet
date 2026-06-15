# Frihet n8n Community Node — VERIFIED Submission Guide

## What "VERIFIED" means

The n8n Creator Portal awards a **Shield badge** ("Verified community node") to packages that pass:

1. Automated checks via `eslint-plugin-n8n-nodes-base`
2. A manual review by the n8n team (typically 4–7 weeks)
3. npm **provenance** requirement (mandatory since 1 May 2026)
4. A live test suite that proves the node loads and behaves correctly

---

## Checklist

### Automatically satisfied by this branch (`feat/verified-node-infra`)

| Requirement | Status | Evidence |
|---|---|---|
| `n8n-community-node-package` keyword in `package.json` | DONE | `package.json` line 6 |
| `n8n.n8nNodesApiVersion` is a number ≥ 1 | DONE | `package.json` — value: `1` |
| `n8n.nodes` and `n8n.credentials` arrays populated | DONE | `package.json` |
| `repository.url` set to real GitHub URL | DONE | `https://github.com/Frihet-io/n8n-nodes-frihet.git` |
| `license` set to MIT | DONE | `package.json` |
| `author` with name and email | DONE | `package.json` |
| Icon is SVG | DONE | `frihet.svg` — enforced by ESLint rule |
| Resource and Operation params have `noDataExpression: true` | DONE | ESLint rule + test |
| `credentialDocumentation.documentationUrl` set | DONE | `FrihetApi.credentials.ts` |
| `apiKey` uses `typeOptions.password: true` | DONE | `FrihetApi.credentials.ts` |
| Subtitle expression set on node | DONE | `Frihet.node.ts` |
| Test suite (`npm test`) passes | DONE | 32 tests via Jest + ts-jest |
| Lint (`npm run lint`) passes | DONE | 0 errors, 1 warning (unused import, non-blocking) |
| Build (`npm run build`) passes | DONE | TypeScript clean compile |
| CI on PR/push (`.github/workflows/ci.yml`) | DONE | Runs build + test + lint on Node 20 + 22 |
| npm publish with `--provenance` (`.github/workflows/publish.yml`) | DONE | GitHub OIDC `id-token: write` + `npm publish --provenance --access public` |

### Required secrets on Frihet-io/n8n-nodes-frihet

| Secret | Where to add | Value |
|---|---|---|
| `NPM_TOKEN` | GitHub → Settings → Secrets → Actions | npm automation token from npmjs.com (account: `frihet`) |

Steps to create the npm token:
1. Log in to npmjs.com as `frihet`
2. Account → Access Tokens → Generate New Token → **Automation** type
3. Copy the token, add it as `NPM_TOKEN` in the GitHub repo secrets

### Pending — Viktor web-form steps

See section below.

---

## Viktor web-form steps (Creator Portal submission)

You cannot automate these — they require manual browser actions.

**URL:** <https://www.n8n.io/creator-hub/>

1. **Sign in / create n8n creator account** at <https://www.n8n.io/creator-hub/> using the Frihet developer email (`dev@frihet.io`).
2. Click **"Submit a community node"** (or navigate to the submission form).
3. Fill in:
   - **npm package name:** `n8n-nodes-frihet`
   - **GitHub repository:** `https://github.com/Frihet-io/n8n-nodes-frihet`
   - **Description:** `AI-native ERP node — invoices, expenses, quotes, clients, products, vendors with ES/EU fiscal depth (IVA/IGIC/IPSI/VeriFactu/TicketBAI)`
   - **Categories:** Finance, Productivity
4. Accept the community node contribution guidelines.
5. Submit. You will receive a confirmation email. **Review takes 4–7 weeks.**
6. During review, the n8n team may ask for:
   - A demo workflow (the `templates/` directory already has 8)
   - Clarification on fiscal-specific fields (IRPF, IGIC, recargo de equivalencia)

---

## Provenance: how it works

When the GitHub Actions `publish.yml` workflow runs on a tag push or release:

1. GitHub generates an OIDC token proving the build ran in this specific repo/workflow.
2. npm's registry receives `--provenance`, attaches a signed attestation to the package.
3. Anyone can verify via `npm audit signatures` or the npmjs.com package page shield.
4. The n8n Creator Portal checks for the attestation as of May 2026.

**Never publish manually without `--provenance`** from the next release onward.

---

## Triggering the first provenance publish

After this PR is merged to `main`:

1. Bump the version in `package.json` (e.g., `1.1.0` for the next release).
2. Create a git tag: `git tag v1.1.0 && git push origin v1.1.0`
3. Or create a GitHub Release (UI or `gh release create v1.1.0`).
4. The `publish.yml` workflow fires automatically, builds, tests, lints, and publishes with provenance.

Do **not** run `npm publish` locally — that bypasses provenance.

---

## Positioning note for the submission form

Lead with fiscal depth, not tool count:

> Frihet is an AI-native ERP for Spain and the EU. This node covers IVA, IGIC, IPSI fiscal zones; IRPF withholding; equivalence surcharge (recargo de equivalencia); VeriFactu-compliant invoice creation; and TicketBAI-ready fields — things generic accounting nodes don't model. 6 resources, 32 operations, cursor-based pagination, 8 ready-to-import workflow templates.
