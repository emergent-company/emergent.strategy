# Monitoring Dashboard - Job Detail Modal Implementation

**Session Date:** October 22, 2025  
**Status:** ✅ COMPLETE - Job detail modal with tabs for overview, logs, and LLM calls

## What Was Implemented

### 1. Job Detail Modal Component (`JobDetailModal.tsx`)

A comprehensive modal that displays full extraction job information with three tabs:

#### **Overview Tab**
- **Job Information Card**:
  - Job ID (truncated, monospace)
  - Source type and ID
  - Start and completion timestamps
  - Duration in minutes and seconds
  - Error message (if failed)
  
- **Metrics Card** (4 stat tiles):
  - Objects Created
  - LLM Calls count
  - Total Tokens used
  - Total Cost (USD, 4 decimal places)
  
- **Recent Logs Preview**:
  - Shows last 5 log entries
  - Each entry displays: level badge, timestamp, message
  - "View All" button to switch to logs tab
  - Only shown if logs exist

#### **Process Logs Tab**
- **Log Level Filter**: Dropdown to filter by debug/info/warn/error/fatal/all
- **Logs List** (scrollable, max 100 entries):
  - Each log entry shows:
    - Level badge (color-coded: debug=neutral, info=blue, warn=yellow, error/fatal=red)
    - Timestamp (formatted locale string)
    - Message (monospace font)
    - Expandable metadata section (JSON formatted)
  - Empty state when no logs match filter
  - Loading spinner when fetching

#### **LLM Calls Tab**
- **LLM Calls List** (scrollable, max 50 entries):
  - Each call card displays:
    - Model name and timestamp (header)
    - Cost (large, primary color) and duration (top right)
    - **Token Stats** (3 mini stat tiles):
      - Input tokens
      - Output tokens
      - Total tokens
    - Expandable request payload (JSON formatted)
    - Expandable response payload (JSON formatted)
  - Empty state when no LLM calls exist
  - Loading spinner when fetching

### 2. Dashboard Integration

**Updated:** `apps/admin/src/pages/admin/monitoring/dashboard/index.tsx`

#### Changes Made:
1. **Import Modal Component**:
   ```tsx
   import { JobDetailModal } from "./JobDetailModal";
   ```

2. **Add Modal State**:
   ```tsx
   const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
   const [isModalOpen, setIsModalOpen] = useState(false);
   ```

3. **Add Click Handlers**:
   ```tsx
   const handleJobClick = (jobId: string) => {
       setSelectedJobId(jobId);
       setIsModalOpen(true);
   };

   const handleModalClose = () => {
       setIsModalOpen(false);
       setSelectedJobId(null);
   };
   ```

4. **Make Table Rows Clickable**:
   ```tsx
   <tr 
       key={job.id} 
       className="hover:bg-base-200 cursor-pointer"
       onClick={() => handleJobClick(job.id)}
   >
   ```

5. **Render Modal**:
   ```tsx
   {selectedJobId && (
       <JobDetailModal
           jobId={selectedJobId}
           isOpen={isModalOpen}
           onClose={handleModalClose}
       />
   )}
   ```

## Technical Implementation Details

### API Client Usage
The modal uses `createMonitoringClient()` from the monitoring API:

```tsx
const { apiBase, fetchJson } = useApi();
const { config } = useConfig();

const monitoringClient = useMemo(() => createMonitoringClient(
    apiBase,
    fetchJson,
    config.activeProjectId,
    config.activeOrgId
), [apiBase, fetchJson, config.activeProjectId, config.activeOrgId]);
```

### Three Backend Endpoints Called

1. **Job Detail**: `GET /monitoring/extraction-jobs/:id`
   - Returns: Full job info, recent logs (last 100), all LLM calls, aggregated metrics
   - Called: On modal open

2. **Process Logs**: `GET /monitoring/extraction-jobs/:id/logs?level=<level>`
   - Returns: Array of log entries filtered by level
   - Called: On logs tab activation, when log level filter changes

3. **LLM Calls**: `GET /monitoring/extraction-jobs/:id/llm-calls?limit=50`
   - Returns: Array of LLM call records with payloads and costs
   - Called: On LLM calls tab activation

### React Hooks Pattern

**useCallback for Data Loading**:
- All three load functions use `useCallback` with proper dependencies
- Prevents unnecessary re-renders and re-fetching
- Dependencies: `jobId`, `logLevel`, `monitoringClient`

**useEffect for Lifecycle**:
1. Load job detail when modal opens
2. Load tab data on first tab activation (lazy loading)
3. Reload logs when filter changes

### Error Handling
- Try-catch blocks in all async functions
- Error state displayed as alert banner
- Console errors for secondary data (logs/LLM calls) to avoid breaking modal
- Graceful fallbacks (empty states, "N/A" for missing data)

## UI/UX Features

### Modal Behavior
- **Overlay Click**: Clicking backdrop closes modal
- **Close Button**: X button in top-right corner
- **Max Width**: 6xl (very wide for detailed content)
- **Max Height**: 90vh (scrollable if content exceeds)
- **Sticky Header**: Header with close button stays visible when scrolling

### Visual Design (daisyUI)
- **Status Badges**: Color-coded (pending=warning, in_progress=info, completed=success, failed=error)
- **Log Level Badges**: Sized small, color-coded by severity
- **Stat Cards**: Base-100 background on Base-200 parent for depth
- **Code Elements**: Monospace font for IDs, JSON payloads, log messages
- **Details/Summary**: Native HTML elements for expandable sections (metadata, payloads)

### Responsive Layout
- **Metrics Grid**: 4 columns on desktop
- **Logs/LLM Cards**: Full width, vertical stacking
- **Scrollable Content**: Independent scroll for each tab content area
- **Fixed Header/Footer**: Modal header and footer stay visible

## User Flow

1. **User clicks any job row** in the dashboard table
2. **Modal opens** with loading spinner
3. **Overview tab loads** with full job details and metrics
4. **User switches to "Logs" tab**:
   - First load: Fetches all logs
   - Filter dropdown: Instant filter by level
   - Re-fetches when filter changes
5. **User switches to "LLM Calls" tab**:
   - First load: Fetches all LLM calls (up to 50)
   - Expandable request/response payloads
6. **User clicks "Close" or backdrop** to dismiss modal

## Code Quality

### TypeScript
- ✅ All data properly typed (no `any` except in catch blocks)
- ✅ Interface for props (`JobDetailModalProps`)
- ✅ Type union for log levels: `'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'all'`

### React Best Practices
- ✅ Proper hook dependency arrays
- ✅ useCallback for expensive functions
- ✅ useMemo for derived values (client instance)
- ✅ Conditional rendering based on state
- ✅ Key props on list items

### Accessibility
- ✅ Semantic HTML (`<details>`, `<summary>`, `<thead>`, `<tbody>`)
- ✅ ARIA roles implied by daisyUI components
- ✅ Keyboard accessible (modal, tabs, buttons)
- ✅ Focus management (close button, tab navigation)

## File Structure

```
apps/admin/src/pages/admin/monitoring/dashboard/
├── index.tsx                  # Main dashboard (updated)
└── JobDetailModal.tsx         # New modal component
```

## Testing Checklist

To verify implementation:

1. **✅ Modal Opens**: Click any job row → modal appears
2. **✅ Overview Tab**: Shows job info, metrics, recent logs preview
3. **✅ Logs Tab**: Displays process logs, filter dropdown works
4. **✅ LLM Calls Tab**: Shows LLM call details with expandable payloads
5. **✅ Close Modal**: Click X button or backdrop → modal dismisses
6. **✅ Loading States**: Spinners show during async operations
7. **✅ Empty States**: Proper messages when no logs/LLM calls exist
8. **✅ Error Handling**: Error alert shows if job detail fetch fails
9. **✅ HMR**: Code changes hot reload without page refresh

## Performance

- **Lazy Loading**: Logs and LLM calls only fetch when tabs are activated
- **Memoization**: API client instance memoized to prevent recreation
- **Pagination**: API returns limited results (100 logs, 50 LLM calls)
- **Efficient Re-renders**: useCallback prevents unnecessary function recreations

## Future Enhancements

Potential improvements identified:

1. **Pagination for Logs**: Add "Load More" or offset pagination for >100 logs
2. **Search in Logs**: Text search/filter within log messages
3. **Copy to Clipboard**: Button to copy job ID, log entries, payloads
4. **Export Modal Data**: Download button for logs/LLM calls as JSON/CSV
5. **Real-time Updates**: WebSocket or polling for live job status updates
6. **Log Streaming**: Auto-scroll for in_progress jobs
7. **Cost Breakdown Chart**: Visualize cost per LLM call
8. **Diff View**: For failed jobs, show what succeeded vs failed

## Integration Points

### Backend Dependencies
- `MonitoringController` endpoints:
  - `GET /monitoring/extraction-jobs/:id`
  - `GET /monitoring/extraction-jobs/:id/logs`
  - `GET /monitoring/extraction-jobs/:id/llm-calls`
- `MonitoringService` methods:
  - `getExtractionJobDetail()`
  - `getLogsForResource()`
  - `getLLMCallsForResource()`

### Frontend Dependencies
- `@/hooks/use-api` - For apiBase and fetchJson
- `@/contexts/config` - For org/project context
- `@/api/monitoring` - Type definitions and client factory
- DaisyUI components - Modal, tabs, badges, stats, cards

## Next Steps

With the job detail modal complete, the next priorities are:

1. **✅ DONE**: Job detail modal with logs and LLM calls
2. **TODO**: Cost visualization (charts showing trends)
3. **TODO**: Metrics summary cards at top of dashboard
4. **TODO**: Real-time updates/polling
5. **TODO**: Date range filtering
6. **TODO**: Export functionality

---

**Implementation Time**: ~2 hours  
**Files Changed**: 2 (1 new, 1 updated)  
**Lines of Code**: ~450 lines (modal component)  
**Backend Endpoints Used**: 3  
**HMR Status**: ✅ Working (instant updates)
