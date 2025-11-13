# ClickUp Import Logging System

## Overview

The ClickUp import logging system provides comprehensive tracking of import operations, similar to the extraction logging system. It logs all import steps to both a database table and JSONL files for easy review.

## Components

### 1. ClickUpImportLoggerService

Located: `apps/server/src/modules/clickup/clickup-import-logger.service.ts`

**Features:**
- Dual logging: Database table (`kb.clickup_import_logs`) + JSONL files (`logs/clickup-import/*.jsonl`)
- Operation types: discovery, fetch_spaces, fetch_docs, fetch_pages, store_document, create_extraction, api_call, error
- Status tracking: pending, success, error, warning, info
- Metrics: duration_ms, items_processed
- Full error capture with stack traces

**Key Methods:**
- `logStep()` - Create a log entry
- `updateLogStep()` - Update existing log entry
- `getSessionLogs()` - Get all logs for an import session
- `getLogsByType()` - Filter logs by operation type
- `getErrorLogs()` - Get only error logs
- `getLogSummary()` - Get statistics summary
- `getIntegrationSessions()` - List recent import sessions

### 2. Database Table

Table: `kb.clickup_import_logs`

**Columns:**
- `id` - UUID primary key
- `integration_id` - Integration identifier
- `import_session_id` - Unique ID for each import run
- `logged_at` - When the log was created
- `step_index` - Sequential step number
- `operation_type` - Type of operation
- `operation_name` - Optional descriptive name
- `status` - pending | success | error | warning | info
- `input_data` - JSONB of input parameters
- `output_data` - JSONB of output/results
- `error_message` - Error description if failed
- `error_stack` - Full error stack trace
- `duration_ms` - Duration in milliseconds
- `items_processed` - Number of items processed (docs, pages, etc.)
- `metadata` - Additional JSONB metadata

**Indexes:**
- By import session
- By integration
- By operation type
- By status (errors)
- By step index

### 3. JSONL Log Files

Location: `logs/clickup-import/{importSessionId}.jsonl`

Each line is a JSON object with the same fields as the database table. Files are append-only for simplicity and reliability.

### 4. Pretty-Print Script

Location: `scripts/pretty-print-log.js`

**Usage:**
```bash
# Basic usage
npm run log:pretty logs/clickup-import/abc-123.jsonl

# Show only errors
npm run log:pretty logs/clickup-import/abc-123.jsonl --errors-only

# Filter by operation type
npm run log:pretty logs/clickup-import/abc-123.jsonl --operation-type=fetch_docs

# Verbose output with full data
npm run log:pretty logs/clickup-import/abc-123.jsonl --verbose

# All ClickUp logs (wildcard)
npm run log:clickup
```

**Features:**
- Color-coded output (green=success, red=error, yellow=warning)
- Duration formatting (ms, seconds, minutes)
- Automatic summarization (total steps, success/error counts)
- Operation type breakdowns
- Error details with stack traces (verbose mode)
- Input/output data inspection (verbose mode)

## Usage in ClickUpImportService

### Basic Logging Pattern

```typescript
import { ClickUpImportLoggerService } from './clickup-import-logger.service';
import { v4 as uuidv4 } from 'uuid';

export class ClickUpImportService {
    constructor(
        private readonly logger: ClickUpImportLoggerService
    ) {}

    async runFullImport(integrationId: string, workspaceId: string) {
        const importSessionId = uuidv4();
        let stepIndex = 0;

        try {
            // Log discovery start
            const startTime = Date.now();
            await this.logger.logStep({
                integrationId,
                importSessionId,
                stepIndex: stepIndex++,
                operationType: 'discovery',
                operationName: 'Fetch workspace structure',
                status: 'pending',
                inputData: { workspaceId }
            });

            // Perform discovery
            const structure = await this.fetchWorkspaceStructure(workspaceId);
            
            // Log discovery success
            await this.logger.logStep({
                integrationId,
                importSessionId,
                stepIndex: stepIndex++,
                operationType: 'discovery',
                operationName: 'Fetch workspace structure',
                status: 'success',
                inputData: { workspaceId },
                outputData: { 
                    spaces: structure.spaces.length,
                    totalDocs: structure.totalDocs 
                },
                durationMs: Date.now() - startTime
            });

            // Continue with more operations...
            
        } catch (error) {
            // Log error
            await this.logger.logStep({
                integrationId,
                importSessionId,
                stepIndex: stepIndex++,
                operationType: 'error',
                status: 'error',
                errorMessage: error.message,
                errorStack: error.stack
            });
            throw error;
        }
    }
}
```

### Update Pattern for Long Operations

```typescript
// Create pending log entry
const logId = await this.logger.logStep({
    integrationId,
    importSessionId,
    stepIndex: stepIndex++,
    operationType: 'fetch_docs',
    status: 'pending',
    inputData: { workspaceId }
});

try {
    const startTime = Date.now();
    const docs = await this.fetchDocs(workspaceId);
    
    // Update to success
    await this.logger.updateLogStep(logId, {
        status: 'success',
        outputData: { count: docs.length },
        itemsProcessed: docs.length,
        durationMs: Date.now() - startTime
    });
} catch (error) {
    // Update to error
    await this.logger.updateLogStep(logId, {
        status: 'error',
        errorMessage: error.message,
        errorStack: error.stack
    });
    throw error;
}
```

## Operation Types

| Type | Description | Typical Input | Typical Output |
|------|-------------|---------------|----------------|
| `discovery` | Discovering workspace structure | `{ workspaceId }` | `{ spaces, totalDocs }` |
| `fetch_spaces` | Fetching space list | `{ workspaceId }` | `{ spaceIds: [...] }` |
| `fetch_docs` | Fetching documents | `{ spaceId, cursor }` | `{ docs: [...], nextCursor }` |
| `fetch_pages` | Fetching doc pages | `{ docId }` | `{ pages: [...] }` |
| `store_document` | Storing to database | `{ docId, title }` | `{ documentId, created }` |
| `create_extraction` | Creating extraction job | `{ documentId }` | `{ jobId }` |
| `api_call` | Generic API call | `{ endpoint, method }` | `{ status, data }` |
| `error` | Error occurred | varies | N/A |

## Querying Logs

### Get All Logs for Session

```typescript
const logs = await this.logger.getSessionLogs(importSessionId);
```

### Get Error Logs

```typescript
const errors = await this.logger.getErrorLogs(importSessionId);
```

### Get Summary

```typescript
const summary = await this.logger.getLogSummary(importSessionId);
console.log(`Total: ${summary.totalSteps}, Errors: ${summary.errorSteps}`);
console.log(`Duration: ${summary.totalDurationMs}ms`);
console.log(`Operations:`, summary.operationCounts);
```

### List Recent Import Sessions

```typescript
const sessions = await this.logger.getIntegrationSessions(integrationId, 10);
sessions.forEach(session => {
    console.log(`Session: ${session.import_session_id}`);
    console.log(`Started: ${session.started_at}`);
    console.log(`Steps: ${session.total_steps}, Errors: ${session.error_count}`);
});
```

## Best Practices

1. **Generate Session ID**: Use `uuidv4()` to create unique import session IDs
2. **Sequential Steps**: Increment step index for each operation
3. **Capture Timing**: Always measure and log duration_ms
4. **Meaningful Names**: Use descriptive operation names
5. **Rich Context**: Include relevant input/output data
6. **Error Details**: Always capture error message and stack
7. **Batch Metrics**: Log items_processed for batch operations
8. **Use Metadata**: Store additional context in metadata field

## Example Output

### Console (using pretty-print)

```
═══════════════════════════════════════════════════════════════════
ClickUp Import Log: abc-123-def-456.jsonl
═══════════════════════════════════════════════════════════════════

09:15:23.456 ✓ #001 discovery          234ms  Fetch workspace structure
  spaces=5, totalDocs=150

09:15:23.890 ✓ #002 fetch_spaces       123ms  (5 items)
  spaceIds=[...]

09:15:24.012 ✓ #003 fetch_docs         2.34s  Fetch docs from space 1 (50 items)
  docs=50, nextCursor=abc...

09:15:26.345 ✗ #004 store_document     12ms   Store doc "My Document"
  Error: Unique constraint violation

═══════════════════════════════════════════════════════════════════
SUMMARY
═══════════════════════════════════════════════════════════════════

• Total Steps:     4
✓ Success:         3
✗ Errors:          1
⚠ Warnings:        0
ℹ Info:            0
• Total Duration:  2.7s
• Items Processed: 55

Operations:
  discovery:       1
  fetch_spaces:    1
  fetch_docs:      1
  store_document:  1

═══════════════════════════════════════════════════════════════════
```

## Troubleshooting

### Logs not appearing

1. Check that ClickUpImportLoggerService is registered in ClickUpModule providers
2. Verify logs directory exists: `mkdir -p logs/clickup-import`
3. Check file permissions on logs directory

### Database errors

1. Ensure migration has been applied: `npm run db:migrate`
2. Check table exists: `SELECT * FROM kb.clickup_import_logs LIMIT 1;`
3. Verify database permissions

### Pretty-print errors

1. Check JSONL file is valid JSON per line
2. Ensure script is executable: `chmod +x scripts/pretty-print-log.js`
3. Check file path is correct

## Migration

The database table is created by migration: `20251022_add_clickup_import_logs.sql`

To apply:
```bash
npm run db:migrate
```

## Related Files

- Logger Service: `apps/server/src/modules/clickup/clickup-import-logger.service.ts`
- Migration: `apps/server/src/migrations/20251022_add_clickup_import_logs.sql`
- Pretty-Print: `scripts/pretty-print-log.js`
- Module Registration: `apps/server/src/modules/clickup/clickup.module.ts`
