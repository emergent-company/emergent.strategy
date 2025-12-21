# Troubleshooting External Sources

This guide covers common issues when importing documents from external sources and how to resolve them.

## Common Error Codes

| Error Code              | Description                          | Resolution                                           |
| ----------------------- | ------------------------------------ | ---------------------------------------------------- |
| `SOURCE_NOT_ACCESSIBLE` | Cannot access the source URL         | Check if the document is publicly shared             |
| `SOURCE_NOT_FOUND`      | URL points to non-existent resource  | Verify the URL is correct and the file exists        |
| `RATE_LIMITED`          | Provider rate limit exceeded         | Wait and retry; check rate limit configuration       |
| `UNSUPPORTED_TYPE`      | File type not supported              | Convert to a supported format (PDF, TXT, HTML, etc.) |
| `FILE_TOO_LARGE`        | File exceeds size limit              | Use a smaller file or increase limit in config       |
| `NETWORK_ERROR`         | Network connectivity issue           | Check network connectivity and retry                 |
| `PROVIDER_ERROR`        | Provider-specific error              | Check provider status and logs                       |
| `CONTENT_FETCH_FAILED`  | Failed to download content           | Verify URL accessibility and retry                   |
| `PARSE_ERROR`           | Failed to parse content              | Check file format and encoding                       |
| `AUTH_REQUIRED`         | Private file requires authentication | Use a public link or wait for OAuth (Phase 2)        |
| `QUOTA_EXCEEDED`        | Provider quota exceeded              | Wait for quota reset or use different account        |
| `INVALID_RESPONSE`      | Unexpected response from provider    | Check provider API status                            |

## Google Drive Issues

### "Source not accessible" for Google Docs

**Symptom**: Import fails with `SOURCE_NOT_ACCESSIBLE` error.

**Causes**:

1. Document is not publicly shared
2. Sharing is set to "Anyone with the link" but requires sign-in

**Resolution**:

1. Open the document in Google Drive
2. Click "Share" button
3. Change to "Anyone with the link"
4. Ensure "Viewer" access is selected
5. Copy the sharing link and try importing again

### "Unsupported type" for Google Sheets

**Symptom**: Google Sheets import fails or produces unexpected content.

**Resolution**:
Google Sheets are exported as CSV (first sheet only). For complex spreadsheets:

1. Export manually as PDF or CSV
2. Upload the exported file directly

### Rate Limiting

**Symptom**: Imports fail with `RATE_LIMITED` after many requests.

**Current Limits**:

- 60 requests per minute
- 1000 requests per day

**Resolution**:

1. Wait for rate limit window to reset
2. For bulk imports, add delays between requests
3. Use the periodic sync feature instead of manual imports

## URL Provider Issues

### "Content fetch failed" for web pages

**Symptom**: URL import fails with `CONTENT_FETCH_FAILED`.

**Causes**:

1. Website blocks automated requests
2. SSL certificate issues
3. Redirect loops

**Resolution**:

1. Verify URL is accessible in a browser
2. Check if site requires JavaScript (not supported)
3. Try a direct link to the file instead of a page

### ETag/Last-Modified not available

**Symptom**: Sync always re-downloads content even if unchanged.

**Explanation**: Some servers don't provide ETag or Last-Modified headers. The URL provider will:

1. Fall back to content hash comparison
2. Download content on every sync check

**Resolution**: This is expected behavior for servers without proper caching headers. Consider using `manual` sync policy for such sources.

## Sync Issues

### Source stuck in "error" status

**Symptom**: Source shows `status: error` and won't sync.

**Resolution**:

```sql
-- Check error details
SELECT id, display_name, status, error_count, last_error, last_error_at
FROM kb.external_sources
WHERE status = 'error';

-- Reset error count to re-enable
UPDATE kb.external_sources
SET error_count = 0, status = 'active'
WHERE id = 'your-source-id';
```

Or via API:

```bash
# Trigger manual sync (resets error count)
curl -X POST http://localhost:3002/api/external-sources/{id}/sync \
  -H "Authorization: Bearer $TOKEN"
```

### Periodic sync not running

**Symptom**: Sources with `sync_policy: periodic` not being updated.

**Checks**:

1. Verify sync worker is running (check server logs)
2. Check `sync_interval_minutes` is set
3. Check `last_checked_at` timestamp

```sql
SELECT id, display_name, sync_policy, sync_interval_minutes,
       last_checked_at, last_synced_at
FROM kb.external_sources
WHERE sync_policy = 'periodic';
```

### Duplicate documents after sync

**Symptom**: Multiple document versions exist for same source.

**Explanation**: This is expected behavior. Each sync creates a new document version. The `sync_version` field tracks versions.

**To view versions**:

```sql
SELECT d.id, d.name, d.sync_version, d.created_at
FROM kb.documents d
JOIN kb.external_sources es ON d.external_source_id = es.id
WHERE es.id = 'your-source-id'
ORDER BY d.sync_version DESC;
```

## Database Queries

### Find sources by status

```sql
-- All errored sources
SELECT id, display_name, provider_type, last_error
FROM kb.external_sources
WHERE status = 'error'
ORDER BY last_error_at DESC;

-- Sources that need sync
SELECT id, display_name, sync_policy, last_checked_at
FROM kb.external_sources
WHERE status = 'active'
  AND sync_policy = 'periodic'
  AND (last_checked_at IS NULL
       OR last_checked_at < NOW() - INTERVAL '1 minute' * sync_interval_minutes);
```

### Find documents by source

```sql
SELECT d.id, d.name, d.source_type, d.sync_version, es.original_url
FROM kb.documents d
LEFT JOIN kb.external_sources es ON d.external_source_id = es.id
WHERE d.source_type = 'external';
```

### Source import history

```sql
SELECT
  es.display_name,
  es.provider_type,
  es.status,
  es.error_count,
  es.created_at as imported_at,
  es.last_synced_at,
  COUNT(d.id) as document_count
FROM kb.external_sources es
LEFT JOIN kb.documents d ON d.external_source_id = es.id
GROUP BY es.id
ORDER BY es.created_at DESC;
```

## Logging

### Enable debug logging

Set environment variable:

```bash
LOG_LEVEL=debug
```

### Check import logs

Look for entries with these patterns:

- `ExternalSourcesService` - Main service operations
- `GoogleDriveProvider` - Google Drive specific
- `UrlProvider` - URL provider specific
- `ExternalSourceSyncWorker` - Sync operations

```bash
# Using logs MCP
"Search logs for 'ExternalSourcesService'"
"Show debug logs filtered by 'GoogleDriveProvider'"
```

### Langfuse traces

External source operations are traced in Langfuse. Look for:

- Trace name: `external-source-import`
- Trace name: `external-source-sync`

## Getting Help

1. Check the [API documentation](./API.md) for endpoint details
2. Review [Architecture](./ARCHITECTURE.md) for system design
3. For provider-specific issues, check the provider implementation in:
   - `apps/server/src/modules/external-sources/providers/`
4. Create a bug report in `docs/bugs/` for persistent issues
