# Frihet ERP — n8n Workflow Templates

Ready-to-import n8n workflow templates for [Frihet ERP](https://frihet.io). All templates use the `n8n-nodes-frihet` community node.

## Prerequisites

1. Install the Frihet node: **Settings → Community Nodes → Install** → `n8n-nodes-frihet`
2. Create Frihet credentials: **Credentials → New → Frihet API** → enter your API key and base URL (`https://api.frihet.io`)

## How to Import

1. Open n8n
2. Go to **Workflows → Import from file**
3. Select the `.json` template
4. Connect your credentials when prompted
5. Configure any environment-specific values (emails, channel IDs, etc.)
6. Activate

---

## Templates

### 1. `stripe-payment-to-invoice.json`
**Stripe Payment → Create & Send Invoice**

Triggered by `payment_intent.succeeded` on Stripe. Extracts payment data, creates a Frihet invoice, marks it as paid (payment method: Stripe), and sends it to the customer.

**Nodes:** Stripe Trigger → Set (extract fields) → Frihet (create invoice) → Frihet (mark paid) → Frihet (send invoice)

**Credentials needed:** Stripe API, Frihet API

**Setup:** Configure Stripe webhook to point to your n8n instance. Make sure customer metadata includes `customer_name` and `email` fields for best results.

---

### 2. `email-receipt-to-expense.json`
**Email Receipt → Create Expense**

Polls your IMAP inbox for emails with subject lines matching receipt/invoice keywords. Parses the sender, date, and attempts to extract the amount from the email body. Creates an expense in Frihet. If the amount cannot be detected, sends an internal alert.

**Nodes:** Email Trigger (IMAP) → Filter (receipt keywords) → Set (parse data) → Frihet (create expense) → IF (amount detected?) → Email (alert if missing)

**Credentials needed:** IMAP Email, Frihet API, SMTP Email

**Setup:** Set `FINANCE_EMAIL` environment variable, or hardcode the alert recipient email in the "Notify: Amount Missing" node.

---

### 3. `monthly-tax-summary.json`
**Monthly Tax Summary Report**

Runs on the 1st of each month at 8am. Lists all paid invoices and expenses for the previous month, calculates gross revenue, net revenue, VAT collected, total expenses, VAT paid, net VAT to declare, and net profit. Sends a formatted HTML email report.

**Nodes:** Schedule (1st of month) → Set (date range) → Frihet (list invoices) + Frihet (list expenses) → Code (calculate) → Email (send report)

**Credentials needed:** Frihet API, SMTP Email

**Setup:** Set `FINANCE_EMAIL` environment variable or update the recipient in the Send node.

---

### 4. `overdue-invoice-reminder.json`
**Daily Overdue Invoice Reminders**

Runs Monday–Friday at 9am. Lists all overdue invoices, filters those with a client email on record, categorizes them by urgency (Standard < 14 days, High 14–30 days, Urgent > 30 days), sends a reminder via the Frihet send endpoint for each one, and delivers an internal summary report.

**Nodes:** Schedule (weekdays 9am) → Frihet (list overdue) → Filter (has email) → Set (enrich + urgency) → Frihet (send reminder) + Code (build summary) → Email (internal report)

**Credentials needed:** Frihet API, SMTP Email

**Setup:** Set `FINANCE_EMAIL` for the internal daily report.

---

### 5. `new-client-to-hubspot.json`
**New Frihet Client → HubSpot Contact**

Receives Frihet webhook events for `client.created`. Maps the client fields to HubSpot contact properties and upserts the contact (creates or updates by email). Tags the contact with `lead_source: Frihet ERP` and stores the Frihet client ID as a custom property.

**Nodes:** Webhook (client.created) → Respond 200 → Filter (verify event) → Set (map fields) → HubSpot (upsert contact) → HubSpot (add custom properties)

**Credentials needed:** HubSpot API, Frihet API (for webhook secret verification)

**Setup:**
- Configure Frihet to send webhooks to `https://your-n8n.com/webhook/frihet-client-created`
- Create HubSpot custom properties: `frihet_client_id`, `tax_id`, `lead_source`

---

### 6. `shopify-order-to-invoice.json`
**Shopify Order → Create & Send Invoice**

Triggered when a new Shopify order is created. Searches Frihet for an existing client matching the customer email. If not found, creates the client first. Builds invoice line items from Shopify order items (including shipping), creates the invoice in Frihet, and sends it to the customer.

**Nodes:** Shopify Trigger → Set (extract order) → Frihet (search client) → IF (exists?) → [Frihet create client] → Set (resolved client) → Code (build items) → Frihet (create invoice) → Frihet (send invoice)

**Credentials needed:** Shopify API, Frihet API

**Setup:** Configure Shopify credentials with your store URL and API key.

---

### 7. `weekly-financial-digest.json`
**Weekly Financial Digest → Slack**

Runs every Monday at 8am. Fetches all invoices and expenses from the previous 7 days. Calculates revenue (paid/pending/overdue), total expenses, net profit, profit margin, and top clients by revenue. Posts a formatted Markdown message to a Slack channel.

**Nodes:** Schedule (Monday 8am) → Set (week range) → Frihet (list invoices) + Frihet (list expenses) → Code (calculate summary) → Slack (send message)

**Credentials needed:** Frihet API, Slack OAuth2

**Setup:** Set `SLACK_CHANNEL_ID` environment variable to your target channel ID (e.g., `C0123456789`), or update directly in the Slack node.

---

### 8. `quote-accepted-to-invoice.json`
**Quote Accepted → Auto-Create & Send Invoice**

Receives Frihet webhook events for `quote.accepted`. Fetches the full quote from the API, maps all line items and client data to an invoice, sets a 30-day due date, creates the invoice, sends it to the client, and notifies the internal team by email.

**Nodes:** Webhook (quote.accepted) → Respond 200 → Filter (verify event) → Set (extract quote ID) → Frihet (get quote) → Code (map fields) → Frihet (create invoice) → Frihet (send invoice) → Email (notify team)

**Credentials needed:** Frihet API, SMTP Email

**Setup:**
- Configure Frihet to send webhooks to `https://your-n8n.com/webhook/frihet-quote-accepted`
- Set `FINANCE_EMAIL` for internal notification

---

## Environment Variables

| Variable | Used In | Description |
|----------|---------|-------------|
| `FINANCE_EMAIL` | Templates 2, 3, 4, 8 | Internal email for reports and alerts |
| `SLACK_CHANNEL_ID` | Template 7 | Slack channel ID for weekly digest |

Set these in n8n under **Settings → Environment Variables** (self-hosted) or directly in the node parameters.

---

## Frihet Webhook Configuration

For templates 5 and 8, configure webhooks in your Frihet settings:

- **client.created** → `https://your-n8n.instance/webhook/frihet-client-created`
- **quote.accepted** → `https://your-n8n.instance/webhook/frihet-quote-accepted`

The webhook payload format is:
```json
{
  "event": "client.created",
  "data": { ... resource fields ... }
}
```

---

Built for [Frihet ERP](https://frihet.io) — AI-native business management.
