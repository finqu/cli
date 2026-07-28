# Error Handling

How to handle errors from the Finqu REST API.

## HTTP Status Codes

| Code | Meaning               | Action                                                      |
| ---- | --------------------- | ----------------------------------------------------------- |
| 200  | Success               | Process response                                            |
| 201  | Created               | Resource created successfully                               |
| 204  | No Content            | Success, no response body                                   |
| 400  | Bad Request           | Fix request payload — check required fields, types, formats |
| 401  | Unauthorized          | Re-authenticate — token expired or invalid                  |
| 403  | Forbidden             | Check scopes — token lacks permission                       |
| 404  | Not Found             | Verify resource ID and endpoint URL                         |
| 422  | Unprocessable Entity  | Validation error — check field values                       |
| 429  | Too Many Requests     | Rate limited — back off and retry                           |
| 500  | Internal Server Error | Platform issue — retry with backoff                         |
| 503  | Service Unavailable   | Temporary outage — retry later                              |

## Error Response Format

Errors return JSON with details:

```json
{
    "error": "validation_failed",
    "message": "The given data was invalid.",
    "errors": {
        "email": ["The email field is required."]
    }
}
```

## Retry Strategy

For retriable errors (429, 5xx):

1. Wait with exponential backoff: 1s, 2s, 4s, 8s...
2. Add jitter to avoid thundering herd
3. Set a maximum retry count (e.g., 5 attempts)
4. Log failures for monitoring

**Never retry** 4xx errors (except 429) without modifying the request.

## Full Reference

- [REST API error handling](https://developers.finqu.com/apis-and-tools/rest-api/error-handling.md.txt)
