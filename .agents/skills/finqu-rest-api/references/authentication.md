# Authentication

How to authenticate with the Finqu REST API.

## Overview

All API requests require authentication via the `Authorization` header with a Bearer token.

```http
Authorization: Bearer YOUR_API_TOKEN
```

## OAuth 2.0 Flow

For third-party integrations and partner apps:

1. **Authorization request** — Redirect user to Finqu authorization URL
2. **User grants access** — Merchant approves requested scopes
3. **Authorization code** — Finqu redirects back with a code
4. **Token exchange** — Exchange code for access token using client credentials
5. **API calls** — Use access token in the `Authorization` header

## Scoped Access

Access tokens have scoped permissions. Common scopes control access to:

- Orders (read/write)
- Products (read/write)
- Customers (read/write)
- Store settings (read)

Request only the scopes your integration needs.

## Security Best Practices

- Store tokens securely — never in client-side code or version control
- Use environment variables for credentials
- Implement token refresh before expiration
- Use HTTPS for all API communication
- Rotate tokens periodically

## Full Reference

- [REST API authentication](https://developers.finqu.com/apis-and-tools/rest-api/authentication.md.txt)
- [General authentication guide](https://developers.finqu.com/get-started/authentication.md.txt)
