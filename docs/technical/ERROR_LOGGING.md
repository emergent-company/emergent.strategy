# Error Logging System

This document explains how to access and use the error logging system for debugging issues in both the browser and server.

## Log Directory Overview

All runtime logs now live in the project root `logs/` directory. The main files are:

| File | Source | Purpose |
| --- | --- | --- |
| `logs/app.log` | NestJS FileLogger | Structured Nest logs (startup, service diagnostics, workers) |
| `logs/errors.log` | NestJS FileLogger & GlobalHttpExceptionFilter | Fatal errors, bootstrap failures, JSON-structured 5xx responses |
| `logs/api.log` | `scripts/dev-manager.mjs` | Background `npm run dev:server` stdout/stderr (ts-node-dev restarts, migration output) |
| `logs/admin.log` | `scripts/dev-manager.mjs` | Background Vite dev server output and proxy errors |
| `logs/db.log` | Docker `postgres` service | Postgres statements, connections, and collector output |
| `logs/e2e-tests/` | `scripts/run-e2e-with-logs.mjs` | Timestamped Playwright stdout/stderr and summary JSON |

### Quick snapshot script

Use the Dev Manager helper to grab the last 100 lines from every service log in a single report:

```bash
npm run dev-manager:logs:snapshot
```

Adjust the number of lines or emit JSON for automated analysis:

```bash
npm run dev-manager:logs:snapshot -- --lines 200
npm run dev-manager:logs:snapshot -- --json
```

The script prints grouped sections for the backend API, admin frontend, NestJS application logs, aggregated error log, Postgres log, and any other `.log` files discovered in the root `logs/` directory.

Previous per-app folders (for example `apps/server/logs/`) are no longer used and can be removed safely. To change the destination, set `LOG_DIR` (global) or stack-specific variables such as `ERROR_LOG_DIR` before starting services.

## Server-Side Logging (API/Backend)

### Automatic Logging

All 5xx errors are automatically logged to `logs/errors.log` in the project root. Each log entry includes:

- Timestamp (ISO 8601)
- HTTP status code
- Error code
- Error message
- Request path and method
- Request ID (if available)
- User ID (from JWT token)
- Organization ID (from headers)
- Project ID (from headers)
- Additional error details
- Stack trace (in development, truncated in production)

### Viewing Server Logs

```bash
# View all errors
cat logs/errors.log

# View last 50 errors
tail -50 logs/errors.log

# View today's errors
grep "$(date +%Y-%m-%d)" logs/errors.log

# View errors with stack traces (formatted)
cat logs/errors.log | jq '.'

# Follow live errors
tail -f logs/errors.log | jq '.'

# Filter by status code
cat logs/errors.log | jq 'select(.status == 500)'

# Filter by path
cat logs/errors.log | jq 'select(.path | contains("/template-packs"))'

# Count errors by path
cat logs/errors.log | jq -r '.path' | sort | uniq -c | sort -rn
```

### Configuration

Environment variables:

- `ERROR_LOG_DIR`: Directory for error logs (default: `logs/`)
- `ERROR_LOG_INCLUDE_STACK`: Set to `1` to include full stack traces in production

## Browser-Side Logging (Frontend)

### Automatic Logging

The frontend automatically captures:

- `console.error()` calls
- Unhandled errors
- Unhandled promise rejections  
- API errors (HTTP 4xx, 5xx)
- Network errors

Logs are stored in browser localStorage (last 100 errors).

### Viewing Browser Logs

Open the browser console and use these commands:

```javascript
// View all logs in table format
window.__errorLogs.printLogs()

// Get raw logs array
window.__errorLogs.getLogs()

// Download logs as JSON file
window.__errorLogs.downloadLogs()

// Clear all logs
window.__errorLogs.clearLogs()

// Enable logging (enabled by default in dev)
window.__errorLogs.enable()

// Disable logging
window.__errorLogs.disable()
```

### Log Structure

Each browser log entry contains:

```typescript
{
  timestamp: "2025-10-04T12:34:56.789Z",
  type: "console-error" | "api-error" | "unhandled-error" | "network-error",
  message: "Error description",
  stack?: "Stack trace if available",
  url?: "http://localhost:3001/api/...",
  method?: "GET",
  status?: 500,
  response?: { /* API response */ },
  extra?: { /* Additional context */ }
}
```

### Manual Logging

You can also manually log errors from your code:

```typescript
import { errorLogger } from '@/lib/error-logger';

// Log API errors
errorLogger.logApiError(url, method, status, response);

// Log network errors
errorLogger.logNetworkError(url, method, error);
```

## Debugging Workflow

### When You Encounter an Error

1. **Check Browser Logs First**
   ```javascript
   window.__errorLogs.printLogs()
   ```
   Look for recent API errors with full request/response details.

2. **Check Server Logs**
   ```bash
   tail -20 logs/errors.log | jq '.'
   ```
   Look for 500 errors with stack traces.

3. **Download Logs for Analysis**
   ```javascript
   window.__errorLogs.downloadLogs()
   ```
   Share the JSON file for detailed analysis.

### Common Issues

#### "Internal server error" with No Details

1. Check server logs for the actual error:
   ```bash
   tail -1 logs/errors.log | jq '.'
   ```

2. Look for the stack trace to identify the source:
   ```bash
   tail -1 logs/errors.log | jq -r '.stack'
   ```

#### API Errors Not Showing in Browser

1. Ensure error logging is enabled:
   ```javascript
   window.__errorLogs.enable()
   ```

2. Check if logs exist:
   ```javascript
   window.__errorLogs.getLogs().length
   ```

#### Missing Server Logs

1. Ensure the `logs/` directory exists:
   ```bash
   mkdir -p logs
   ```

2. Check file permissions:
   ```bash
   ls -la logs/errors.log
   ```

## Production Considerations

### Browser Logging

- **Default**: Disabled in production (localStorage key: `enable_error_logging`)
- **Enable**: Users can enable by running `window.__errorLogs.enable()` in console
- **Privacy**: Logs are stored locally in browser, never sent to server automatically

### Server Logging

- **Default**: Always enabled for 5xx errors
- **Stack Traces**: Truncated in production (4000 chars) unless `ERROR_LOG_INCLUDE_STACK=1`
- **Rotation**: Logs grow indefinitely - implement log rotation:
  ```bash
  # Add to crontab for daily rotation
  0 0 * * * gzip -9 /path/to/spec-server/logs/errors.log && mv /path/to/spec-server/logs/errors.log.gz /path/to/spec-server/logs/errors-$(date +\%Y\%m\%d).log.gz && touch /path/to/spec-server/logs/errors.log
  ```

## Integration with Monitoring Tools

### Sentry / Error Tracking

To integrate with external error tracking:

1. Install Sentry SDK
2. In `apps/server/src/common/filters/http-exception.filter.ts`:
   ```typescript
   // Before appendFileSync
   if (status >= 500 && exception instanceof Error) {
       Sentry.captureException(exception);
   }
   ```

3. In `apps/admin/src/lib/error-logger.ts`:
   ```typescript
   // In addLog method
   if (log.type === 'api-error' && log.status >= 500) {
       Sentry.captureMessage(log.message, { level: 'error', extra: log });
   }
   ```

### Log Aggregation (ELK, Datadog, etc.)

Use a log shipper to send `logs/errors.log` to your aggregation service:

```bash
# Example: Filebeat configuration
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /path/to/spec-server/logs/errors.log
  json.keys_under_root: true
  json.add_error_key: true
```

## Troubleshooting the Logging System

### Browser Logger Not Working

Check console for initialization message:
```
[Error Logger] Enabled. View logs with: window.__errorLogs.getLogs()
```

If missing, check that `@/lib/error-logger` is imported in `main.tsx`.

### Server Logs Empty

1. Trigger a test error:
   ```bash
   curl -X GET http://localhost:3001/api/nonexistent
   ```

2. Check if `logs/` directory was created:
   ```bash
   ls -la logs/
   ```

3. Check Node.js file permissions

### Performance Impact

- **Browser**: Negligible (<1ms per error, max 100 logs in memory)
- **Server**: Minimal (async file append, ~2-5ms per 500 error)

## Summary

- ✅ **Server errors**: Automatically logged to `logs/errors.log`
- ✅ **Browser errors**: Automatically logged to localStorage (dev mode)
- ✅ **Access browser logs**: `window.__errorLogs.printLogs()`
- ✅ **Download browser logs**: `window.__errorLogs.downloadLogs()`
- ✅ **View server logs**: `tail -f logs/errors.log | jq '.'`
- ✅ **No setup required**: Works out of the box in development
