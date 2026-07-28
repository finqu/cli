---
name: finqu-rest-api
description: 'Finqu REST API integration — authentication, CRUD operations, error handling, pagination, and webhooks'
---

# Finqu REST API

## When to use

Use this skill when:

- Building a custom integration with the Finqu REST API
- Implementing CRUD operations for orders, products, customers, or other resources
- Setting up OAuth authentication for API access
- Handling API errors, pagination, or rate limits
- Configuring webhooks for event-driven integrations

## Inputs required

- **Merchant API base URL**: e.g., `https://merchant-zfds.api.myfinqu.com/{version}/`
- **API version**: check the project for which version it uses; the latest stable version is `3.2` but the project may target a different one
- **Authentication**: API token (Bearer) or OAuth credentials
- **Target resource**: which API endpoints to use (orders, products, customers, etc.)

## Procedure

### 0) Understand API basics

1. Each merchant has a unique API base URL: `https://{merchant-slug}.api.myfinqu.com/{version}/`
2. All requests use JSON (`Content-Type: application/json`)
3. All endpoints require authentication (`Authorization: Bearer YOUR_TOKEN`)
4. Standard HTTP methods: GET (read), POST (create), PUT (update), DELETE (delete)
5. API version is in the URL path (e.g., `/3.2/`)
6. **Always check the project's existing code or configuration to determine which API version it uses** — do not assume the latest
7. **Consult the [Finqu API Reference](https://finqu.readme.io/reference) to verify endpoint paths, request/response objects, required fields, and available parameters** before writing integration code

### 1) Set up authentication

Two paths depending on your use case:

**For custom integrations (merchant-specific):**

- Obtain API credentials from the merchant's admin area
- Use OAuth 2.0 flow to get access tokens

**For partner apps:**

- Register app in Partner dashboard
- Implement OAuth install flow (see **finqu-apps** skill)

Read: `references/authentication.md`

### 2) Make API requests

Example request pattern:

```http
POST https://merchant-zfds.api.myfinqu.com/{version}/orders
Content-Type: application/json
Authorization: Bearer YOUR_API_TOKEN

{
  "customer_id": "12345",
  "items": [...]
}
```

Example response:

```json
{
    "id": "order-67890",
    "status": "created"
}
```

### 3) Handle errors

1. Check HTTP status codes on every response
2. Parse error response body for details
3. Implement retry logic for transient errors (5xx, 429)
4. Never retry 4xx errors without fixing the request

Read: `references/error-handling.md`

### 4) Implement pagination

1. Default page size is 50 items
2. Use pagination parameters to navigate datasets
3. Always handle the case where more pages exist

Read: `references/pagination.md`

### 5) Respect rate limits

1. Rate limit: 500 requests per second per API key
2. Monitor response headers for rate limit status
3. Implement exponential backoff when rate limited (429 responses)

Read: `references/rate-limits.md`

### 6) Set up webhooks (if needed)

1. Configure webhook endpoints in Finqu admin
2. Verify webhook signatures for security
3. Respond quickly (within timeout) and process asynchronously
4. Handle retries for failed deliveries

Read: `references/webhooks.md`

## Verification

- API requests return expected HTTP status codes
- Authentication token is valid and correctly scoped
- Pagination correctly traverses all pages of results
- Error handling gracefully manages all error types
- Rate limiting is respected (no 429 errors in normal operation)
- Webhooks are received and processed correctly (if configured)

## Failure modes / debugging

- **401 Unauthorized**: Token expired or invalid — re-authenticate
- **403 Forbidden**: Token lacks required scopes — check OAuth permissions
- **404 Not Found**: Wrong resource ID or base URL — verify merchant slug and endpoint
- **429 Too Many Requests**: Rate limited — implement backoff and reduce request frequency
- **5xx Server Error**: Temporary platform issue — retry with exponential backoff
- **JSON parse error**: Ensure `Content-Type: application/json` header is set

## Escalation

- See [REST API overview](https://developers.finqu.com/apis-and-tools/rest-api/overview.md.txt)
- See [REST API authentication](https://developers.finqu.com/apis-and-tools/rest-api/authentication.md.txt)
- See [REST API error handling](https://developers.finqu.com/apis-and-tools/rest-api/error-handling.md.txt)
- Contact Finqu support for API issues
