# Pagination

How to paginate through API results in the Finqu REST API.

## Default Behavior

- Default page size: **50 items** per request
- Results include pagination metadata

## Navigating Pages

Use pagination parameters in your requests to navigate through results. Always check if more pages exist before stopping.

## Best Practices

- Don't fetch more data than you need — use appropriate page sizes
- Process pages sequentially to avoid rate limiting
- Store cursor/offset state if building incremental sync
- Handle empty pages gracefully (indicates end of results)

## Full Reference

- [REST API pagination](https://developers.finqu.com/apis-and-tools/rest-api/pagination.md.txt)
