# Unverified-webhooks — TEMPLATES NOT IN READY-TO-USE SET

These two templates are **quarantined** because they expose a public
webhook endpoint that can spend the owner's Frihet API credentials
without a verifiable authenticity check.

The user-facing `templates/` folder contains only templates we can
truthfully stand behind. See `templates/README.md` for the safe set.

## Why they are quarantined

Both templates subscribe to a Frihet webhook event
(`client.created` / `quote.accepted`) and then chain Frihet API calls
on the owner's behalf. The Frihet webhook emitter IS capable of HMAC
signing (`X-Frihet-Signature: sha256=<hex>`) — but the receiving n8n
**Webhook node** does not expose request headers in the downstream data
flow by default in n8n 1.x. There is no n8n-supported trigger node
that verifies the `X-Frihet-Signature` HMAC for Frihet deliveries.

This means: even if the user enables every "Include Headers" / "Raw
body" option n8n offers, the workflow author cannot write a
deterministic, n8n-native HMAC verification step on the webhook
payload. The webhook endpoint is therefore **public** — anyone who
learns the URL can POST a forged payload and chain it to the Frihet
API, draining the owner's API quota and (depending on the chained
operation) writing documents under the owner's authority.

## B4 (BLOCKER) — event-type filter is also broken

The templates' Filter nodes read `{{ $json.body.event || $json.event }}`
to gate the chain on the event type. The Frihet webhook emitter
carries the event type in the **`X-Frihet-Event` header**, NOT in the
body (`webhooks.ts:385-388`). The body's only top-level keys are
`{ client: { ... } }` / `{ quote: { ... } }`. With or without
header access, the legacy filter expression evaluates to `undefined`
and the chain never fires.

## What would unblock them

A truthful implementation requires one of:

1. **n8n ships a generic HMAC-verified webhook trigger** that exposes
   the signature header (or a pre-verified `verified: true` flag) in
   the downstream data flow. n8n does not currently ship this for
   community nodes.
2. We add a Frihet-specific FrihetVerifyingWebhook node (custom
   trigger, not generic) that wraps `n8n-workflow`'s Webhook node
   implementation with the HMAC verification in the same module.
   This is a real prod-quality piece of code; out of scope for this
   audit PR.
3. The user accepts that the webhook URL itself is the secret and
   mitigates with Frihet's per-webhook URL allowlist + IP allowlist
   (`webhooks.ts:198-268`). This is "security by obscurity" but is
   the actual mitigation the platform offers today.

Until one of these lands, the templates remain quarantined.

## What users do today

A user who needs the same business outcome can:

- For `client.created` and `quote.accepted` notifications: read the
  Frihet resource directly via a 1-minute Schedule Trigger + the
  Frihet node's `list` operation. The 1-minute polling cadence is a
  tradeoff but no verification is required.
- For real-time events: contact the Frihet team to enable HMAC
  verification on a custom node — out of scope for the community
  package.

## Files

- `new-client-to-hubspot.json` — quarantined since 2026-08-20
- `quote-accepted-to-invoice.json` — quarantined since 2026-08-20
