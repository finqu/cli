# Rate Limits

How the Finqu REST API rate limits work and how to respect them.

## Limits

- **500 requests per second** per API key
- Exceeding the limit returns HTTP **429 Too Many Requests**

## Handling Rate Limits

1. Monitor rate limit headers in responses
2. When receiving 429, wait before retrying
3. Use exponential backoff with jitter
4. Batch operations where possible to reduce request count
5. Cache responses when data doesn't change frequently

## Best Practices

- Design integrations to work within rate limits
- Use bulk endpoints when available instead of individual requests
- Implement request queuing for high-volume operations
- Monitor and alert on rate limit hits

## Full Reference

- [REST API rate limits](https://developers.finqu.com/apis-and-tools/rest-api/rate-limits.md.txt)
