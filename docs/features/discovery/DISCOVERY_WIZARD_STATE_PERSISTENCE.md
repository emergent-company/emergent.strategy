# Discovery Wizard State Persistence & Error Recovery

## Overview

The Discovery Wizard now persists state on the **server** instead of localStorage, allowing users to resume their discovery session from any device, even after page refresh or browser crashes.

## Problem Solved

**Before:**
- Wizard state was lost on page refresh
- React errors would crash the entire wizard with no recovery
- Users had to start over if they switched devices
- No way to resume an in-progress discovery job

**After:**
- Wizard automatically restores in-progress jobs from the server
- Works across devices (state stored on backend, not browser)
- Error boundaries catch React errors and allow recovery
- Users can "Start Fresh" to cancel current job and begin again

## Implementation

### 1. Server-Side State Persistence

The wizard now fetches in-progress jobs from the backend when opened:

```typescript
// On wizard open, check for existing jobs
GET /api/discovery-jobs/projects/:projectId

// Returns array of jobs, wizard finds most recent non-completed job
const activeJob = jobs.find(
    job => job.status !== 'completed' && job.status !== 'failed'
);
```

**Job Status → Wizard Step Mapping:**
- `pending`, `analyzing_documents`, `extracting_types`, `refining_types` → Step 2 (Analyzing)
- `completed` with types/relationships → Step 3 (Review Types)
- No active job → Step 1 (Configure)

### 2. Error Recovery

#### React Error Boundary (Step 3)
Added error boundary to catch rendering errors (like the object-as-React-child error):

```tsx
<ErrorBoundary onError={setRenderError}>
    {/* Step 3 content */}
</ErrorBoundary>
```

When error occurs:
- Shows friendly error message instead of crashing
- Displays "Try Again" button to re-render
- Error details shown in alert at top of step
- Wizard state preserved (user doesn't lose progress)

#### Example Instance Rendering Fix
Fixed the original error where LLM returned objects instead of strings:

```tsx
{type.example_instances.map((example, exIdx) => (
    <li key={exIdx}>
        {typeof example === 'string' 
            ? example 
            : JSON.stringify(example, null, 2)
        }
    </li>
))}
```

Now handles both:
- String examples: `"Maciej Kucharz"`
- Object examples: `{ "full_name": "Maciej Kucharz" }` → formatted as JSON

### 3. User Experience Improvements

#### Automatic Job Restoration
When wizard opens:
1. Shows "Checking for in-progress discovery jobs..." spinner
2. Fetches jobs from server
3. If active job found, restores to appropriate step
4. Shows info banner: "Your previous discovery session was restored"

#### Start Fresh Button
Users can cancel current job and start over:
- Shows in info banner when job is restored
- Calls `DELETE /api/discovery-jobs/:jobId` to cancel backend job
- Resets wizard to Step 1

#### Error States
- Error banner shows at top with dismiss button
- Errors don't close the wizard
- User can continue or go back to previous steps

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/discovery-jobs/projects/:projectId` | GET | List all jobs for project |
| `/api/discovery-jobs/:jobId` | GET | Get job status and results |
| `/api/discovery-jobs/:jobId` | DELETE | Cancel job |
| `/api/discovery-jobs/projects/:projectId/start` | POST | Start new discovery job |

## Testing Scenarios

### Cross-Device Resume
1. User starts discovery on laptop
2. Job is running (Step 2)
3. User opens wizard on phone
4. ✅ Wizard restores to Step 2, shows same job progress

### Page Refresh During Review
1. User is reviewing types (Step 3)
2. Accidentally refreshes page
3. Opens wizard again
4. ✅ Wizard fetches completed job and shows Step 3 with types

### React Error Recovery
1. LLM returns malformed data causing render error
2. Error boundary catches it
3. ✅ Shows error message with "Try Again" button
4. ✅ User can dismiss error and continue with valid data

### Multiple Active Jobs
1. User has one running job, one completed
2. Wizard opens
3. ✅ Restores the running job (ignores completed)
4. User can start fresh to create new job

## Future Enhancements

1. **Edit Persistence**: Save edited types/relationships back to server
   - Currently edits are only in React state
   - Backend should store user edits for true multi-device support

2. **Multiple Job Management**: 
   - Show list of recent jobs
   - Let user choose which to resume

3. **Auto-polling**: 
   - Automatically fetch job updates in background
   - Show toast notifications when job completes

4. **Conflict Resolution**:
   - Detect if job was edited on another device
   - Show merge UI or "latest wins" strategy

## Related Files

- `/apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx` - Main wizard with server state loading
- `/apps/admin/src/components/organisms/DiscoveryWizard/Step3_ReviewTypes.tsx` - Error boundary implementation
- `/apps/server/src/modules/discovery-jobs/discovery-job.controller.ts` - API endpoints
- `/apps/server/src/modules/discovery-jobs/discovery-llm.provider.ts` - Updated `maxOutputTokens` to 65536

## Key Takeaways

✅ **Server-side state** is more reliable than localStorage
✅ **Error boundaries** prevent total UI crashes
✅ **Graceful degradation** - errors don't block continued use
✅ **Cross-device support** - works from any browser, any device
