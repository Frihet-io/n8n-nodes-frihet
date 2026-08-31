# Unverified webhooks — QUARANTINED, NOT FOR PRODUCTION

These two templates are **quarantined** because they expose a public
webhook endpoint that can spend the owner's Frihet API credentials
without a verifiable authenticity check.

The top-level `templates/` folder contains the six supported examples. These
two JSON files are retained as audit evidence only. Do not import, activate,
or adapt them for a production workflow.

## Why they are quarantined

Both templates subscribe to a Frihet webhook event
(`client.created` / `quote.accepted`) and then chain Frihet API calls
on the owner's behalf. The Frihet webhook emitter IS capable of HMAC
signing (`X-Frihet-Signature: sha256=<hex>`) — but the receiving n8n
**Webhook node** does not expose request headers in the downstream data
flow by default in n8n 1.x. There is no n8n-supported trigger node
that verifies the `X-Frihet-Signature` HMAC for Frihet deliveries.

This means the files contain **no receiver-side HMAC verification**. The
webhook endpoint is therefore **public** — anyone who
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

## Release condition

These files remain quarantined until a Frihet-specific receiver performs
raw-body HMAC verification before any credentialed action and the event-type
filter reads an authenticated event value. That implementation and its tests
do not exist in this package version. A secret URL, allowlist, header presence,
or documentation alone does not satisfy this condition.

## What users do today

A user who needs the same business outcome can:

- For `client.created` and `quote.accepted` notifications: read the
  Frihet resource directly via a 1-minute Schedule Trigger + the
  Frihet node's `list` operation. The 1-minute polling cadence is a
  tradeoff but no verification is required.
- For real-time events: no production-safe template is shipped in this
  package version.

## Files

- `new-client-to-hubspot.json` — quarantined since 2026-08-20
- `quote-accepted-to-invoice.json` — quarantined since 2026-08-20
