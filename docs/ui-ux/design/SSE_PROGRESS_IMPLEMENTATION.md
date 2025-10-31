# SSE Progress Implementation for ClickUp Integration

## Overview

Implemented Server-Sent Events (SSE) streaming endpoint for real-time progress updates during ClickUp data imports. This replaces the need for polling and provides immediate feedback to users about what's happening during long-running import operations.

## Architecture

### Backend Changes

1. **Base Integration (`base-integration.ts`)**
   - Added `runFullImportWithProgress()` method
   - Added `onRunFullImportWithProgress()` protected method (default delegates to regular import)
   - Progress callback type: `(progress: { step: string; message: string; count?: number }) => void`

2. **ClickUp Integration (`clickup.integration.ts`)**
   - Implemented `onRunFullImportWithProgress()` 
   - Delegates to `ClickUpImportService.runFullImportWithProgress()`

3. **ClickUp Import Service (`clickup-import.service.ts`)**
   - Added `runFullImportWithProgress()` - main import orchestration with progress
   - Added `importDocsWithProgress()` - docs import with progress callbacks
   - Emits progress events for:
     - Fetching workspace
     - Fetching spaces
     - Importing docs (with count and names)
     - Fetching pages
     - Storing pages
     - Errors
     - Completion

4. **Integrations Service (`integrations.service.ts`)**
   - Added `triggerSyncWithProgress()` method
   - Calls integration instance's `runFullImportWithProgress()`

5. **Integrations Controller (`integrations.controller.ts`)**
   - Added `GET /integrations/:name/sync/stream` endpoint
   - Sets SSE headers (Content-Type: text/event-stream, Cache-Control: no-cache)
   - Streams progress events as they occur
   - Sends completion or error event at end
   - Requires `integrations:write` scope

## SSE Event Format

Events follow Server-Sent Events specification:

```
event: progress
data: {"step":"fetching_docs","message":"Fetching docs... (0 processed so far)","count":0}

event: progress
data: {"step":"storing_doc","message":"Storing doc: Getting Started","count":1}

event: progress
data: {"step":"fetching_pages","message":"Fetching pages for: Getting Started"}

event: complete
data: {"success":true,"result":{"totalImported":15,"totalFailed":0,...}}

event: error
data: {"error":"Authentication failed"}
```

## Progress Steps

### Common Steps
- `starting` - Import initialization
- `fetching_workspace` - Fetching workspace details
- `fetching_spaces` - Fetching spaces
- `spaces_fetched` - Spaces retrieved (includes count)

### Docs Import
- `importing_docs` - Starting docs import
- `fetching_docs` - Fetching docs from API (with count)
- `storing_docs` - Storing batch of docs
- `storing_doc` - Storing individual doc (with name)
- `fetching_pages` - Fetching pages for a doc
- `storing_pages` - Storing pages (with count)
- `docs_complete` - Docs import finished

### Completion/Error
- `complete` - Import finished successfully
- `error` - Import failed (includes error message)

## Usage

### Frontend (EventSource API)

```typescript
const eventSource = new EventSource(
  `/api/integrations/clickup/sync/stream`,
  { 
    headers: {
      'X-Project-ID': projectId,
      'X-Org-ID': orgId
    }
  }
);

eventSource.addEventListener('progress', (event) => {
  const data = JSON.parse(event.data);
  console.log(`[${data.step}] ${data.message}`, data.count);
  
  // Update UI
  setProgressMessage(data.message);
  if (data.count !== undefined) {
    setProgressCount(data.count);
  }
});

eventSource.addEventListener('complete', (event) => {
  const data = JSON.parse(event.data);
  console.log('Import complete:', data.result);
  eventSource.close();
  
  // Update UI
  showSuccess(`Imported ${data.result.totalImported} items`);
});

eventSource.addEventListener('error', (event) => {
  const data = JSON.parse(event.data);
  console.error('Import failed:', data.error);
  eventSource.close();
  
  // Update UI
  showError(data.error);
});

// Cleanup on unmount
return () => eventSource.close();
```

### Backend Testing (curl)

```bash
# Start streaming import
curl -N \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Project-ID: $PROJECT_ID" \
  -H "X-Org-ID: $ORG_ID" \
  http://localhost:3001/integrations/clickup/sync/stream
```

Expected output:
```
event: progress
data: {"step":"starting","message":"Starting ClickUp import..."}

event: progress
data: {"step":"fetching_workspace","message":"Fetching workspace details..."}

event: progress
data: {"step":"spaces_fetched","message":"Found 3 spaces","count":3}

...

event: complete
data: {"success":true,"result":{"totalImported":42,"totalFailed":0}}
```

## Benefits

1. **Real-Time Feedback**: Users see what's happening as it happens
2. **Reduced Polling**: No need for frontend to poll status endpoint
3. **Better UX**: Users know import isn't stuck, can see progress
4. **Lower Server Load**: One connection vs. repeated polling requests
5. **Network Efficiency**: Server pushes updates only when they occur

## Comparison: Before vs After

### Before (Polling)
```typescript
// Frontend continuously polls every 2 seconds
const interval = setInterval(async () => {
  const status = await fetchJson('/api/integrations/clickup/status');
  if (status.state === 'complete') {
    clearInterval(interval);
  }
}, 2000);

// Many unnecessary requests if import takes 30 seconds:
// 30 seconds / 2 seconds = 15 polling requests
```

### After (SSE)
```typescript
// Frontend opens one connection, receives updates as they happen
const eventSource = new EventSource('/api/integrations/clickup/sync/stream');

eventSource.addEventListener('progress', (event) => {
  // Updates pushed from server
});

// Only 1 connection, updates as events occur
```

## Implementation Notes

1. **Default Behavior**: If an integration doesn't implement `onRunFullImportWithProgress`, it falls back to regular import (no progress updates)

2. **Error Handling**: Errors during import are sent as `error` events, not HTTP errors

3. **Connection Management**: Client should close EventSource when complete or on error

4. **Browser Compatibility**: EventSource is supported in all modern browsers

5. **Nginx Buffering**: Added `X-Accel-Buffering: no` header to prevent nginx from buffering SSE responses

## Future Enhancements

1. Add progress tracking for tasks/lists/folders import (currently disabled)
2. Add estimated time remaining based on current pace
3. Add cancellation support (client sends signal to abort)
4. Add reconnection logic with `Last-Event-ID` header
5. Consider WebSocket for bidirectional communication if needed

## Testing Checklist

- [x] Backend compiles without errors
- [ ] SSE endpoint returns correct headers
- [ ] Progress events emitted during import
- [ ] Complete event sent on success
- [ ] Error event sent on failure
- [ ] Multiple concurrent imports work correctly
- [ ] Frontend EventSource connection established
- [ ] Frontend receives and displays progress
- [ ] Frontend handles completion properly
- [ ] Frontend handles errors properly
- [ ] No memory leaks (EventSource properly closed)
- [ ] Server logs show progress events
