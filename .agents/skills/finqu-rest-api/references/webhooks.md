# Webhooks

How to receive real-time event notifications from Finqu via webhooks.

## Overview

Webhooks are HTTP callbacks that Finqu sends to your server when events occur (e.g., order created, product updated, customer registered). They enable event-driven integrations without polling.

## Setup

1. Configure webhook endpoints in the Finqu admin
2. Select which events to subscribe to
3. Provide a publicly accessible HTTPS URL
4. Finqu sends POST requests with event data to your URL

## Receiving Webhooks

Your endpoint should:

1. **Respond quickly** — Return 200 within a few seconds
2. **Process asynchronously** — Queue the event for background processing
3. **Verify authenticity** — Validate the webhook signature
4. **Handle duplicates** — Use event IDs for idempotency

## Security

- Always verify webhook signatures to ensure requests come from Finqu
- Use HTTPS endpoints only
- Don't expose sensitive logic in webhook handlers
- Validate event data before processing

## Retry Behavior

If your endpoint fails to respond with 2xx:

- Finqu retries delivery with increasing delays
- After multiple failures, the webhook may be disabled
- Monitor webhook delivery status in the admin

## Full Reference

- [REST API webhooks](https://developers.finqu.com/apis-and-tools/rest-api/webhooks.md.txt)
