# Extraction Logging UI - User Guide

## How to Access Detailed Logs

### Step 1: Navigate to Extraction Job Detail Page

Go to the extraction jobs list and click on any job to view its details:

```
http://localhost:5175/admin/extraction-jobs
```

Then click on a job ID to open the detail page.

### Step 2: Click "View Detailed Logs" Button

In the job detail page header, you'll see a blue button:

```
┌─────────────────────────────────────────────────┐
│ ← Extraction Job                                │
│   ID: abc-123-def-456                           │
│                                                  │
│   [View Detailed Logs] [Cancel] [Delete]       │
└─────────────────────────────────────────────────┘
```

### Step 3: Explore the Logs Modal

When you click the button, a full-screen modal opens showing:

```
╔════════════════════════════════════════════════════════════╗
║ Extraction Logs                                            ║
║ Detailed step-by-step execution logs showing LLM calls    ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    ║
║ │ Total    │ │ Success  │ │ Errors   │ │ Duration │    ║
║ │ Steps    │ │ Steps    │ │ Steps    │ │          │    ║
║ │   12     │ │   11     │ │    1     │ │  5.67s   │    ║
║ └──────────┘ └──────────┘ └──────────┘ └──────────┘    ║
║                                                            ║
║ 🪙 Total Tokens Used: 1,801                               ║
║                                                            ║
║ Filter by type:                                            ║
║ [All (12)] [llm_call (1)] [object_creation (10)] [error (1)]║
║                                                            ║
║ ┌──────────────────────────────────────────────────────┐ ║
║ │ Step │ Time     │ Operation         │ Status │ ... │ ║
║ ├──────┼──────────┼───────────────────┼────────┼─────┤ ║
║ │  0   │ 10:15:30 │ extract_entities  │ ✓      │ ▼   │ ║
║ │  1   │ 10:15:32 │ create_object     │ ✓      │ ▼   │ ║
║ │  2   │ 10:15:33 │ create_object     │ ✗      │ ▼   │ ║
║ └──────┴──────────┴───────────────────┴────────┴─────┘ ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║                                              [Close]       ║
╚════════════════════════════════════════════════════════════╝
```

## What Each Part Shows

### 1. Summary Statistics (Top Cards)

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Total Steps      │ Success Steps    │ Error Steps      │ Duration         │
│ 12               │ 11 (green)       │ 1 (red)          │ 5.67s            │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

- **Total Steps**: How many operations were logged
- **Success**: How many completed successfully (green badge)
- **Errors**: How many failed (red badge)
- **Duration**: Total time taken for all operations

### 2. Token Usage Banner (if LLM calls exist)

```
┌────────────────────────────────────────────────────────────┐
│ 🪙 Total Tokens Used: 1,801                                │
│    (Important for cost tracking and performance analysis)  │
└────────────────────────────────────────────────────────────┘
```

### 3. Filter Buttons

```
Filter by type: [All (12)] [llm_call (1)] [object_creation (10)] [error (1)]
                 ^^^^^^^^^ active (blue) | ^^^^^^^^^^^^^^^^^ inactive (outline)
```

Click any filter to show only that operation type.

### 4. Logs Table

```
┌──────┬──────────┬───────────────────┬────────┬──────────┬─────────┬─────────┐
│ Step │ Time     │ Operation         │ Status │ Duration │ Tokens  │ Actions │
├──────┼──────────┼───────────────────┼────────┼──────────┼─────────┼─────────┤
│  0   │ 10:15:30 │ 🧠 extract_entity │ ✓      │ 2.35s    │ 1,801   │   ▼     │
│  1   │ 10:15:32 │ ➕ create_object  │ ✓      │ 145ms    │ -       │   ▼     │
│  2   │ 10:15:33 │ ➕ create_object  │ ✗      │ 89ms     │ -       │   ▼     │
└──────┴──────────┴───────────────────┴────────┴──────────┴─────────┴─────────┘
```

- **Step**: Sequential operation number
- **Time**: When the operation occurred (HH:MM:SS)
- **Operation**: Type with icon (🧠 LLM, ➕ Create, ⚠️ Error)
- **Status**: ✓ Success (green) | ✗ Error (red) | ⚠ Warning (yellow)
- **Duration**: How long it took (ms or s)
- **Tokens**: LLM token usage (if applicable)
- **Actions**: ▼ Click to expand and see details

### 5. Expanded Log Entry

When you click the ▼ chevron, the row expands to show full details:

```
┌────────────────────────────────────────────────────────────────┐
│ Step 0: extract_entities                                       │
│                                                                 │
│ → Input Data                                                   │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ {                                                         │  │
│ │   "prompt": "Extract entities from the following text...",│  │
│ │   "content_preview": "John Doe works at Acme Corp...",   │  │
│ │   "content_length": 5234,                                │  │
│ │   "allowed_types": ["Person", "Organization"]            │  │
│ │ }                                                         │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ← Output Data                                                  │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ {                                                         │  │
│ │   "entities_count": 5,                                   │  │
│ │   "entities": [                                          │  │
│ │     {                                                     │  │
│ │       "type": "Person",                                  │  │
│ │       "name": "John Doe",                                │  │
│ │       "properties": { "role": "CEO" }                    │  │
│ │     }                                                     │  │
│ │   ],                                                      │  │
│ │   "raw_response": { /* Full LLM JSON */ }                │  │
│ │ }                                                         │  │
│ └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 6. Error Details (for failed operations)

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠️ Error                                                       │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ null value in column 'key' violates not-null constraint  │  │
│ │                                                           │  │
│ │ ▸ Stack Trace (click to expand)                          │  │
│ │   at GraphService.createObject (graph.service.ts:400)    │  │
│ │   at ExtractionWorkerService.processJob (...:668)        │  │
│ └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Common Use Cases

### 1. Debug Why Entities Weren't Extracted

**Problem**: "The LLM should have found this entity but didn't"

**Solution**:
1. Filter by `llm_call`
2. Expand the log entry
3. Check **Input Data** → See the exact prompt sent to LLM
4. Check **Output Data** → See what the LLM actually returned
5. Compare with your expectations

**What to look for**:
- Is the entity in the content preview?
- Is the entity type in `allowed_types`?
- Did the LLM mention it in the response but not format it correctly?
- Does the prompt need improvement?

### 2. Investigate Extraction Failures

**Problem**: "Extraction job failed but I don't know why"

**Solution**:
1. Filter by `error`
2. Expand each error entry
3. Read the error message
4. Check the stack trace for the exact line that failed
5. Look at the entity context (what was being processed)

**Common errors**:
- Missing required fields (null constraints)
- Type validation failures
- Database connection issues
- LLM API rate limits

### 3. Improve Extraction Performance

**Problem**: "Extraction is too slow"

**Solution**:
1. Look at the **Duration** column for all operations
2. Identify the slowest operations
3. Check **Tokens** column for LLM calls (higher tokens = more cost & time)

**Optimization strategies**:
- Reduce content length sent to LLM
- Use smaller, faster LLM models for simple extractions
- Batch similar operations
- Cache common entity types

### 4. Track Token Usage and Costs

**Problem**: "How much is this extraction costing me?"

**Solution**:
1. Check **Total Tokens Used** banner at top
2. Filter by `llm_call` to see individual LLM operations
3. Multiply tokens by your provider's cost per token

**Example**:
- Total tokens: 1,801
- GPT-4 cost: ~$0.03/1K input tokens
- Estimated cost: ~$0.05 per extraction

### 5. Review Confidence Scores

**Problem**: "Which entities need manual review?"

**Solution**:
1. Filter by `object_creation`
2. Expand entries
3. Check **Input Data** → `confidence` field
4. Check **Output Data** → `requires_review` field

**Decision making**:
- confidence < 0.5 → Auto-reject
- confidence 0.5-0.7 → Needs review
- confidence > 0.7 → Auto-approve

## Tips & Tricks

### Keyboard Shortcuts

- **ESC**: Close modal
- **Click backdrop**: Close modal
- **Scroll**: Navigate long log lists

### Reading JSON Output

The JSON is formatted with 2-space indentation for readability:

```json
{
  "parent": {
    "child": "value",
    "array": [
      "item1",
      "item2"
    ]
  }
}
```

### Understanding Operation Types

| Icon | Type | Description |
|------|------|-------------|
| 🧠 | llm_call | LLM extraction request/response |
| ➕ | object_creation | Creating graph object |
| 📄 | chunk_processing | Processing document chunk |
| 🔗 | relationship_creation | Creating entity relationship |
| 💡 | suggestion_creation | Creating extraction suggestion |
| ✅ | validation | Data validation step |
| ⚠️ | error | Operation failure |

### Status Badge Colors

- 🟢 **Green (Success)**: Operation completed successfully
- 🔴 **Red (Error)**: Operation failed
- 🟡 **Yellow (Warning)**: Operation completed with warnings

### Duration Formatting

- `< 1000ms`: Shows as `XXXms` (e.g., `145ms`)
- `≥ 1000ms`: Shows as `X.XXs` (e.g., `2.35s`)

## Troubleshooting

### Modal Won't Open

**Check**:
- Is the extraction job loaded? (wait for page to finish loading)
- Is there a jobId in the URL?
- Check browser console for errors (F12 → Console tab)

### No Logs Shown

**Possible reasons**:
- Job hasn't run yet (logs only created during execution)
- Job was created before logging system was deployed
- Backend API is down (check status in console)

### Logs Not Loading

**Check**:
1. Network tab (F12 → Network)
2. Look for `GET /api/admin/extraction-jobs/:jobId/logs`
3. Check response status:
   - 200 ✓ Success
   - 401 ✗ Not authenticated
   - 403 ✗ No permission
   - 404 ✗ Job not found
   - 500 ✗ Server error

### Performance Issues

**If modal is slow**:
- Large number of logs (> 100 operations)
- Enable filtering to reduce visible rows
- Collapse all expanded entries before opening new ones
- Consider pagination (future feature)

## Privacy & Security

- **Authentication Required**: Must be logged in to view logs
- **Project Scoped**: Can only view logs for jobs in your active project
- **Audit Trail**: All log views are tracked (future feature)
- **Data Retention**: Logs stored permanently (configurable per org)

---

**Questions?** Check the main documentation at `docs/EXTRACTION_LOGGING_IMPLEMENTATION.md`
