# Testing the Monitoring Dashboard - Quick Guide

## Quick Start

1. **Open Browser**: Navigate to http://localhost:5175
2. **Login**: Use your existing credentials
3. **Navigate**: Sidebar → Monitoring → Dashboard
4. **View Jobs**: See list of extraction jobs

## Testing the Job Detail Modal

### 1. Opening the Modal ✅
**Action**: Click any row in the jobs table  
**Expected**: Modal opens with loading spinner, then shows job details

### 2. Overview Tab ✅
**Sections to verify**:
- **Job Information Card**:
  - Job ID (8-char truncated)
  - Source type and ID
  - Start/completion dates
  - Duration (e.g., "2m 34s")
  - Error message (if failed)

- **Metrics Card** (4 stat tiles):
  - Objects Created (number)
  - LLM Calls (number)
  - Total Tokens (number)
  - Total Cost (e.g., "$0.0234")

- **Recent Logs Preview** (if logs exist):
  - Shows last 5 log entries
  - Each has: level badge, timestamp, message
  - "View All" button visible

### 3. Logs Tab ✅
**Action**: Click "Process Logs" tab  
**Expected**:
- Loading spinner briefly
- Logs list appears
- Filter dropdown at top (debug/info/warn/error/fatal/all)

**Test filters**:
- Select "error" → Should show only error logs
- Select "all" → Should show all logs again

**Test expandable metadata**:
- Click "View Metadata" on any log entry
- Should expand to show JSON formatted metadata
- Click again to collapse

### 4. LLM Calls Tab ✅
**Action**: Click "LLM Calls" tab  
**Expected**:
- Loading spinner briefly
- List of LLM call cards appears

**Each card should show**:
- Model name (top left)
- Timestamp (below model)
- Cost (top right, large, in primary color)
- Duration in ms (below cost)
- 3 token stat tiles (input, output, total)
- Expandable request payload
- Expandable response payload

**Test expandable payloads**:
- Click "Request Payload" → Expands to show JSON
- Click "Response Payload" → Expands to show JSON
- Click again to collapse

### 5. Closing the Modal ✅
**Two ways to close**:
1. Click the "✕" button (top right)
2. Click outside the modal (on the dark backdrop)

**Expected**: Modal smoothly closes, returns to job list

## Edge Cases to Test

### Empty States
1. **Job with no logs**:
   - Logs tab should show: "No logs found for this level"

2. **Job with no LLM calls**:
   - LLM Calls tab should show: "No LLM calls recorded for this job"

### Error Handling
1. **Invalid job ID**: Try clicking a job that doesn't exist
   - Should show error alert: "Failed to load job details"

### Loading States
1. **Slow network**: Throttle your network in DevTools
   - Should see loading spinners during async operations
   - Modal should remain usable

## Visual Checks

### Status Badges (Overview Tab)
- Pending: Yellow/warning badge
- In Progress: Blue/info badge
- Completed: Green/success badge
- Failed: Red/error badge

### Log Level Badges (Logs Tab)
- Debug: Gray/neutral badge
- Info: Blue/info badge
- Warn: Yellow/warning badge
- Error: Red/error badge
- Fatal: Red/error badge (same as error)

### Cost Display
- Should show 4 decimal places: "$0.0234"
- Should be in monospace font
- Should be prominent (larger text on LLM cards)

## Browser DevTools Checks

### Console (F12)
**Expected**: No errors (unless testing error states)  
**Acceptable**: Minor warnings from third-party libraries

### Network Tab (F12 → Network)
**When opening modal**, should see 3 requests:
1. `GET /api/monitoring/extraction-jobs/{id}` (job detail)
2. `GET /api/monitoring/extraction-jobs/{id}/logs` (when clicking Logs tab)
3. `GET /api/monitoring/extraction-jobs/{id}/llm-calls` (when clicking LLM Calls tab)

**Check response status**: All should be 200 OK

### React DevTools (if installed)
- Component: `JobDetailModal`
- Props: `jobId`, `isOpen`, `onClose`
- State: `loading`, `error`, `activeTab`, `jobDetail`, etc.

## Performance Checks

### Lazy Loading ✅
1. Open modal → Only job detail request fires
2. Click "Logs" tab → Logs request fires (first time only)
3. Click "Overview" tab → No new request (data cached)
4. Click "Logs" tab again → No new request (data cached)
5. Change log filter → New logs request (with filter param)

### HMR (Hot Module Replacement) ✅
1. Open modal in browser
2. Edit `JobDetailModal.tsx` (add a console.log)
3. Save file
4. **Expected**: Modal updates WITHOUT page reload (in <100ms)

## Accessibility Checks

### Keyboard Navigation
- **Tab**: Should cycle through interactive elements (tabs, close button, filters, expandable sections)
- **Enter/Space**: Should activate buttons and toggle details/summary
- **Escape**: Should close modal (if browser supports)

### Screen Reader
- Status badges should announce status text
- Tabs should announce active/inactive state
- Loading spinners should announce "loading"

## Common Issues & Solutions

### Modal doesn't open
**Check**:
- Browser console for errors
- Network tab for failed API requests
- React DevTools for `isOpen` prop (should be `true`)

**Solution**: Refresh page, check PM2 logs

### Tabs don't load data
**Check**:
- Network tab for 404/500 errors
- Browser console for fetch errors
- Backend logs: `npx pm2 logs spec-server-server`

**Solution**: Verify backend endpoints are working

### Filters don't work
**Check**:
- Network tab (should see new request with `?level=<level>` param)
- Console for errors

**Solution**: Clear browser cache, refresh

### HMR not working
**Check**:
- PM2 logs: `npx pm2 logs spec-server-admin | grep HMR`
- Should see: `[vite] hmr update /src/pages/.../JobDetailModal.tsx`

**Solution**: Restart admin service: `npm run workspace:restart admin`

## Quick Smoke Test (2 minutes)

1. ✅ Open dashboard
2. ✅ Click a job row → Modal opens
3. ✅ Overview tab shows metrics
4. ✅ Click "Process Logs" tab → Logs appear
5. ✅ Click log level filter → Logs re-filter
6. ✅ Click "LLM Calls" tab → Calls appear
7. ✅ Expand a request payload → JSON shows
8. ✅ Click close button → Modal closes

**If all 8 steps pass**: Feature is working correctly! 🎉

## Detailed Test Checklist

### Modal Behavior
- [ ] Modal opens on job row click
- [ ] Modal shows loading spinner initially
- [ ] Modal displays job details after loading
- [ ] Modal header shows job status badge
- [ ] Modal close button (✕) works
- [ ] Clicking backdrop closes modal
- [ ] Modal content is scrollable if too long
- [ ] Modal header/footer stay visible when scrolling

### Overview Tab
- [ ] Job info card shows all fields
- [ ] Dates formatted correctly (locale string)
- [ ] Duration formatted as "Xm Ys"
- [ ] Cost formatted as "$X.XXXX"
- [ ] Metrics cards show correct numbers
- [ ] Recent logs preview shows (if logs exist)
- [ ] "View All" button switches to logs tab

### Logs Tab
- [ ] Logs load on first tab click
- [ ] Log level filter dropdown visible
- [ ] Filter by "error" shows only errors
- [ ] Filter by "all" shows all logs
- [ ] Log entries show level badge + timestamp + message
- [ ] "View Metadata" expands to JSON
- [ ] Empty state shows when no logs match filter

### LLM Calls Tab
- [ ] LLM calls load on first tab click
- [ ] Each card shows model, timestamp, cost, duration
- [ ] Token stats (input/output/total) display correctly
- [ ] Request payload expandable
- [ ] Response payload expandable
- [ ] Payloads formatted as JSON
- [ ] Empty state shows when no LLM calls

### Error Handling
- [ ] Error alert shows if job detail fails
- [ ] Console errors logged for secondary failures
- [ ] "N/A" shows for missing data fields
- [ ] Empty states display appropriately

### Performance
- [ ] Tabs lazy load (no unnecessary requests)
- [ ] Data cached (switching tabs doesn't re-fetch)
- [ ] Filter changes trigger new logs request
- [ ] Modal opens/closes smoothly (no lag)

---

**Total Test Time**: ~5-10 minutes for full test  
**Quick Smoke Test**: ~2 minutes  
**Recommended Browsers**: Chrome, Firefox, Safari, Edge
