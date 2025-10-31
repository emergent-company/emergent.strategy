# Cost Analytics Routing Implementation

## Overview
Implemented dedicated URL routing for the Cost Analytics feature to make it bookmarkable and refresh-safe, addressing the issue where analytics was embedded in the dashboard with tab switching that lost state on refresh.

## Changes Made

### 1. Created New Analytics Page
**File**: `apps/admin/src/pages/admin/monitoring/analytics/index.tsx`

- Dedicated page component for Cost Analytics
- Loads up to 1000 extraction jobs (vs 20 paginated in dashboard)
- Uses `monitoringClient.listExtractionJobs()` API
- Renders the `CostVisualization` component
- Includes error handling and loading states

**Key Code**:
```tsx
const response = await monitoringClient.listExtractionJobs({
    limit: 1000,
    sort_by: 'started_at',
    sort_order: 'desc',
});
```

### 2. Added Route Registration
**File**: `apps/admin/src/router/register.tsx`

Added new route to the `dashboardRoutes` array:
```tsx
{ 
    path: "/admin/monitoring/analytics", 
    element: cw(lazy(() => import("@/pages/admin/monitoring/analytics"))) 
}
```

**Location**: Line 41, right after the monitoring dashboard route

### 3. Updated Dashboard UI
**File**: `apps/admin/src/pages/admin/monitoring/dashboard/index.tsx`

**Removed**:
- `viewMode` state and tab switching logic
- Embedded `CostVisualization` component
- Tab navigation UI (Job List / Cost Analytics tabs)

**Added**:
- Import for `Link` from `react-router`
- "View Cost Analytics" button linking to `/admin/monitoring/analytics`

**New UI Code**:
```tsx
<Link 
    to="/admin/monitoring/analytics" 
    className="btn btn-primary"
>
    <Icon icon="lucide--bar-chart-3" className="w-4 h-4" />
    View Cost Analytics
</Link>
```

### 4. CostVisualization Component
**File**: `apps/admin/src/pages/admin/monitoring/dashboard/CostVisualization.tsx`

- **Status**: No changes (remains reusable component)
- Used by both dashboard (previously) and analytics page (currently)
- Contains 3 ApexCharts visualizations + 3 stat cards
- Includes date validation fixes from previous session

## User Flow

### Before
1. Navigate to `/admin/monitoring/dashboard`
2. Click "Cost Analytics" tab
3. View switches to analytics (no URL change)
4. **Problem**: Refresh page → back to dashboard job list

### After
1. Navigate to `/admin/monitoring/dashboard`
2. Click "View Cost Analytics" button
3. Navigate to `/admin/monitoring/analytics` (dedicated URL)
4. **Solution**: Refresh page → stays on analytics view

## Benefits

1. **URL Persistence**: Analytics has dedicated URL that persists on refresh
2. **Bookmarkable**: Users can bookmark `/admin/monitoring/analytics` directly
3. **Shareable**: Can share analytics URL with team members
4. **Navigation**: Browser back/forward buttons work correctly
5. **Separation of Concerns**: Dashboard focuses on job list, analytics has dedicated page
6. **Data Loading**: Analytics page loads more data (1000 jobs vs 20) for comprehensive analysis

## Testing

### Manual Testing Steps
1. Start dev server: `npm run workspace:start`
2. Navigate to: http://localhost:5175/admin/monitoring/dashboard
3. Click "View Cost Analytics" button
4. Verify URL changes to: http://localhost:5175/admin/monitoring/analytics
5. Verify charts render with job data
6. Refresh page (Cmd+R / Ctrl+R)
7. **Expected**: Should stay on analytics page, not redirect to dashboard
8. Click browser back button
9. **Expected**: Should return to dashboard job list

### API Integration
- **Endpoint**: `GET /api/extraction-jobs`
- **Query Params**: `limit=1000`, `sort_by=started_at`, `sort_order=desc`
- **Response**: `ExtractionJobListResponse { items, total, page, page_size, has_more }`
- **Context**: Uses `X-Org-ID` and `X-Project-ID` headers from `use-api` hook

## File Structure

```
apps/admin/src/
├── pages/admin/monitoring/
│   ├── dashboard/
│   │   ├── index.tsx              # Job list dashboard (updated)
│   │   ├── CostVisualization.tsx  # Reusable chart component
│   │   └── JobDetailModal.tsx
│   └── analytics/
│       └── index.tsx               # NEW: Dedicated analytics page
└── router/
    └── register.tsx                # Updated: Added analytics route
```

## Related Issues

### Previous Session Fixes
- **Date Validation Bug**: Fixed "RangeError: Invalid time value" in CostVisualization
- **API Integration**: Corrected method name from `listJobs()` to `listExtractionJobs()`
- **Response Structure**: Fixed `response.jobs` to `response.items`

### Original Request
User: "it should be available under it's own url, so when refreshing it is not taking me back to dashboard"

**Solution**: Created dedicated route and page, removed tab-based navigation

## Next Steps (Optional Enhancements)

1. **Breadcrumb Navigation**: Add breadcrumbs showing `Dashboard > Analytics`
2. **Date Range Filtering**: Add date pickers to filter analytics by time period
3. **Export Functionality**: Add CSV/PDF export for cost reports
4. **Cost Breakdown**: Add more detailed cost breakdowns by source type, model, etc.
5. **Trend Analysis**: Add week-over-week or month-over-month comparisons

## TypeScript Compilation

All files compile successfully with no errors:
- ✅ `apps/admin/src/pages/admin/monitoring/analytics/index.tsx`
- ✅ `apps/admin/src/pages/admin/monitoring/dashboard/index.tsx`
- ✅ `apps/admin/src/router/register.tsx`

## Hot Reload

Vite HMR is enabled and will automatically reload the pages when changes are saved. No manual restart required for testing.
