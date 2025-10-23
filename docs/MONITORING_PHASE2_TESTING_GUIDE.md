# Chat Sessions Monitoring - Manual Testing Guide

**Date**: October 23, 2025  
**Feature**: Phase 2 Chat Session & MCP Tool Monitoring  
**Status**: Ready for Testing

## Prerequisites

1. **Development Environment Running**:
   ```bash
   npm run workspace:start
   ```
   This starts:
   - PostgreSQL (port 5432)
   - Zitadel (port 8080)
   - API server (port 3001)
   - Admin UI (port 5175)

2. **Authentication**: 
   - Login to admin UI at `http://localhost:5175`
   - Ensure you have an active organization and project

3. **Test Data**: 
   - You need at least one chat session to test
   - Create test data by using the chat feature first

## Test Scenarios

### Scenario 1: Navigation (5 minutes) ✅ CRITICAL

**Goal**: Verify users can access the chat sessions page

1. **Access via Sidebar**:
   - Open admin UI: `http://localhost:5175/admin`
   - Look for "System Monitoring" section in left sidebar
   - Click "Chat Sessions" menu item
   - ✅ **Expected**: Page loads at `/admin/monitoring/chat-sessions`
   - ✅ **Expected**: Sidebar highlights "Chat Sessions" as active

2. **Direct URL Access**:
   - Navigate directly to: `http://localhost:5175/admin/monitoring/chat-sessions`
   - ✅ **Expected**: Page loads successfully
   - ✅ **Expected**: No 404 error

3. **Icon Display**:
   - ✅ **Expected**: Menu item shows message-square (chat bubble) icon

### Scenario 2: Empty State (5 minutes)

**Goal**: Verify graceful handling when no sessions exist

1. **Fresh Project** (if no sessions exist):
   - Navigate to chat sessions page
   - ✅ **Expected**: Shows "No chat sessions found" message
   - ✅ **Expected**: Pagination controls hidden
   - ✅ **Expected**: No errors in console

2. **Date Filter with No Results**:
   - Set date range to future dates (e.g., 2026-01-01 to 2026-01-31)
   - Click outside date picker or press Enter
   - ✅ **Expected**: Shows "No chat sessions found"
   - ✅ **Expected**: Table empty but no error

### Scenario 3: Create Test Session (10 minutes)

**Goal**: Generate test data for full feature testing

1. **Start Chat Session**:
   - Navigate to `/admin/apps/chat`
   - Start new conversation
   - Send message: "What is the capital of France?"
   - Wait for assistant response
   - ✅ **Expected**: Session created in database

2. **Verify Logging** (Optional - Database Check):
   ```sql
   -- Check session was logged
   SELECT * FROM kb.system_process_logs 
   WHERE process_type = 'chat_session' 
   ORDER BY timestamp DESC LIMIT 1;
   
   -- Check turn logs exist
   SELECT * FROM kb.system_process_logs 
   WHERE process_type = 'chat_turn' 
   ORDER BY timestamp DESC LIMIT 5;
   ```

3. **Return to Monitoring**:
   - Navigate back to `/admin/monitoring/chat-sessions`
   - ✅ **Expected**: New session appears in list

### Scenario 4: Session List Display (10 minutes) ✅ CRITICAL

**Goal**: Verify list page displays sessions correctly

1. **Table Structure**:
   - ✅ **Expected**: Table has 6 columns:
     - Session ID (truncated to 8 chars)
     - Started (timestamp)
     - Duration (calculated)
     - Turns (count)
     - Cost (USD with 4 decimals)
     - Status (Active/Completed badge)

2. **Data Accuracy**:
   - Check session ID matches (hover for full ID)
   - Check started timestamp is correct
   - Check duration calculation (if completed)
   - Check turn count matches actual turns
   - Check cost calculation (if any LLM calls)
   - ✅ **Expected**: All data matches API response

3. **Loading State**:
   - Refresh page
   - ✅ **Expected**: Shows loading spinner briefly
   - ✅ **Expected**: Then displays data

4. **Error Handling** (Network Disconnect):
   - Open browser DevTools → Network tab
   - Set offline mode
   - Refresh page
   - ✅ **Expected**: Shows error message
   - ✅ **Expected**: No crash, graceful degradation

### Scenario 5: Pagination (10 minutes)

**Goal**: Verify pagination controls work correctly

**Prerequisites**: Need > 20 sessions for proper testing

1. **Initial Page**:
   - ✅ **Expected**: Shows first 20 sessions
   - ✅ **Expected**: "Previous" button disabled
   - ✅ **Expected**: Shows "Page 1 of X"

2. **Next Page**:
   - Click "Next" button
   - ✅ **Expected**: Loads next 20 sessions
   - ✅ **Expected**: URL updates with offset parameter
   - ✅ **Expected**: "Previous" button now enabled
   - ✅ **Expected**: Shows "Page 2 of X"

3. **Previous Page**:
   - Click "Previous" button
   - ✅ **Expected**: Returns to first page
   - ✅ **Expected**: "Previous" button disabled again

4. **Last Page**:
   - Click "Next" until last page
   - ✅ **Expected**: "Next" button disabled on last page
   - ✅ **Expected**: Shows correct page count

### Scenario 6: Date Filtering (10 minutes)

**Goal**: Verify date range filters work correctly

1. **Set Start Date**:
   - Click start date input
   - Select today's date
   - ✅ **Expected**: List refreshes
   - ✅ **Expected**: Only shows sessions from today onwards

2. **Set End Date**:
   - Click end date input
   - Select yesterday's date (before start date)
   - ✅ **Expected**: No results (invalid range)
   - ✅ **Expected**: Shows empty state message

3. **Valid Range**:
   - Set start date: 7 days ago
   - Set end date: today
   - ✅ **Expected**: Shows sessions within that range
   - ✅ **Expected**: Pagination resets to page 1

4. **Clear Filters**:
   - Clear both date inputs
   - ✅ **Expected**: Shows all sessions again
   - ✅ **Expected**: Pagination resets

5. **Refresh Button**:
   - Make note of current data
   - Click refresh button (🔄 icon)
   - ✅ **Expected**: Reloads data from API
   - ✅ **Expected**: Shows loading state briefly

### Scenario 7: Session Detail Modal - Opening (5 minutes) ✅ CRITICAL

**Goal**: Verify modal opens correctly when clicking session row

1. **Click Session Row**:
   - Click anywhere on a session row in the table
   - ✅ **Expected**: Modal opens immediately
   - ✅ **Expected**: Modal has backdrop (darkened background)
   - ✅ **Expected**: Modal shows loading state initially

2. **Modal Header**:
   - ✅ **Expected**: Shows "Chat Session Detail" title
   - ✅ **Expected**: Has close button (X) in top-right

3. **Tab Bar**:
   - ✅ **Expected**: Shows 5 tabs:
     - Summary
     - Transcript
     - MCP Tools
     - LLM Calls
     - Logs
   - ✅ **Expected**: Summary tab is active by default

### Scenario 8: Modal - Summary Tab (10 minutes) ✅ CRITICAL

**Goal**: Verify summary tab displays all session metadata

1. **Session Info Cards**:
   - ✅ **Expected**: 3 cards in first row:
     - Session ID (full UUID)
     - Conversation ID (UUID)
     - User ID (email or UUID)
   - ✅ **Expected**: All values are readable and not truncated

2. **Timing Cards**:
   - ✅ **Expected**: 3 cards in second row:
     - Started (formatted timestamp)
     - Completed (formatted timestamp or "In Progress")
     - Duration (e.g., "2m 34s" or "-" if in progress)
   - ✅ **Expected**: Duration calculation is correct

3. **Metrics Cards**:
   - ✅ **Expected**: 4 cards in third row:
     - Total Turns (count)
     - Total Cost (e.g., "$0.0234")
     - Total Tokens (comma-separated number)
     - Errors (count of error-level logs)
   - ✅ **Expected**: All metrics match actual data

4. **Card Styling**:
   - ✅ **Expected**: Cards use DaisyUI styling
   - ✅ **Expected**: Metrics are visually distinct
   - ✅ **Expected**: Cards have consistent padding/spacing

### Scenario 9: Modal - Transcript Tab (10 minutes) ✅ CRITICAL

**Goal**: Verify transcript displays chat conversation correctly

1. **Timeline View**:
   - Switch to "Transcript" tab
   - ✅ **Expected**: Shows chronological list of messages
   - ✅ **Expected**: Each message has turn number

2. **User Messages**:
   - ✅ **Expected**: Right-aligned
   - ✅ **Expected**: Blue badge with "User" label
   - ✅ **Expected**: Shows timestamp
   - ✅ **Expected**: Shows full message content

3. **Assistant Messages**:
   - ✅ **Expected**: Left-aligned
   - ✅ **Expected**: Green badge with "Assistant" label
   - ✅ **Expected**: Shows timestamp
   - ✅ **Expected**: Shows full response content

4. **Empty State**:
   - Test with session that has no chat_turn logs
   - ✅ **Expected**: Shows "No transcript available" message

5. **Long Messages**:
   - Test with long message (> 500 chars)
   - ✅ **Expected**: Full content displays without truncation
   - ✅ **Expected**: Scrollable if needed

### Scenario 10: Modal - MCP Tools Tab (15 minutes) ✅ CRITICAL

**Goal**: Verify tool call tracking displays correctly

**Prerequisites**: Need session with MCP tool calls

1. **Table Structure**:
   - Switch to "MCP Tools" tab
   - ✅ **Expected**: Table has 5 columns:
     - Turn # (number)
     - Tool Name (string)
     - Status (badge: Success/Error)
     - Execution Time (ms)
     - Timestamp (formatted)

2. **Successful Tool Call**:
   - Find row with "success" status
   - ✅ **Expected**: Green badge
   - ✅ **Expected**: Execution time > 0
   - ✅ **Expected**: Valid timestamp

3. **Expandable Rows**:
   - Click row to expand
   - ✅ **Expected**: Shows "Parameters" section
   - ✅ **Expected**: Shows "Results" section
   - ✅ **Expected**: Both display JSON with proper formatting

4. **JSON Display**:
   - ✅ **Expected**: JSON is syntax-highlighted (if using code component)
   - ✅ **Expected**: JSON is indented and readable
   - ✅ **Expected**: Can copy JSON text

5. **Failed Tool Call**:
   - Find row with "error" status (if exists)
   - ✅ **Expected**: Red badge
   - ✅ **Expected**: Shows error message
   - ✅ **Expected**: Still displays parameters

6. **Empty State**:
   - Test with session that has no tool calls
   - ✅ **Expected**: Shows "No tool calls" message

### Scenario 11: Modal - LLM Calls Tab (10 minutes)

**Goal**: Verify LLM API call tracking displays correctly

1. **Table Structure**:
   - Switch to "LLM Calls" tab
   - ✅ **Expected**: Table has 7 columns:
     - Model (e.g., "gpt-4")
     - Tokens (In/Out/Total)
     - Cost (USD)
     - Status (badge)
     - Duration (ms)
     - Timestamp (formatted)

2. **Token Display**:
   - ✅ **Expected**: Shows "In: 123 / Out: 456 / Total: 579"
   - ✅ **Expected**: Numbers are comma-separated for readability

3. **Cost Display**:
   - ✅ **Expected**: Shows "$0.0234" format (4 decimal places)
   - ✅ **Expected**: Aligns properly in column

4. **Status Badge**:
   - Success call: ✅ **Expected**: Green badge
   - Error call: ✅ **Expected**: Red badge
   - Timeout call: ✅ **Expected**: Yellow/orange badge

5. **Duration**:
   - ✅ **Expected**: Shows milliseconds
   - ✅ **Expected**: Reasonable values (> 0, < 60000)

6. **Empty State**:
   - Test with session that has no LLM calls
   - ✅ **Expected**: Shows "No LLM calls" message

### Scenario 12: Modal - Logs Tab (10 minutes)

**Goal**: Verify full process log timeline displays correctly

1. **Table Structure**:
   - Switch to "Logs" tab
   - ✅ **Expected**: Table has 4 columns:
     - Level (badge: Error/Warn/Info/Debug)
     - Type (process type)
     - Message (log message)
     - Timestamp (formatted)

2. **Level Badges**:
   - Error: ✅ **Expected**: Red badge
   - Warn: ✅ **Expected**: Yellow badge
   - Info: ✅ **Expected**: Blue badge
   - Debug: ✅ **Expected**: Gray badge

3. **Log Ordering**:
   - ✅ **Expected**: Logs are chronological (newest first or oldest first)
   - ✅ **Expected**: Consistent ordering

4. **Message Content**:
   - ✅ **Expected**: Full message displays
   - ✅ **Expected**: Long messages wrap or truncate gracefully

5. **Process Type**:
   - ✅ **Expected**: Shows type like "chat_session", "chat_turn", "mcp_tool_call"
   - ✅ **Expected**: Styled as code snippet

6. **Error Logs**:
   - Find error-level log (if exists)
   - ✅ **Expected**: Red badge makes it stand out
   - ✅ **Expected**: Error message is readable

7. **Timestamp Format**:
   - ✅ **Expected**: Uses consistent format throughout
   - ✅ **Expected**: Shows date and time (e.g., "2025-10-23 14:32:15")

### Scenario 13: Modal - Closing (5 minutes)

**Goal**: Verify modal closes correctly

1. **Close Button**:
   - Click X button in top-right
   - ✅ **Expected**: Modal closes
   - ✅ **Expected**: Returns to session list

2. **Backdrop Click**:
   - Open modal again
   - Click on darkened background (outside modal)
   - ✅ **Expected**: Modal closes
   - ✅ **Expected**: Returns to session list

3. **ESC Key** (if implemented):
   - Open modal
   - Press ESC key
   - ✅ **Expected**: Modal closes

4. **State Clearing**:
   - Open same session again
   - ✅ **Expected**: Modal loads fresh data
   - ✅ **Expected**: No stale data from previous view

### Scenario 14: Responsive Layout (10 minutes)

**Goal**: Verify UI works on different screen sizes

1. **Desktop (> 1280px)**:
   - ✅ **Expected**: Full table visible without horizontal scroll
   - ✅ **Expected**: Modal is centered and appropriately sized
   - ✅ **Expected**: All columns visible

2. **Tablet (768px - 1280px)**:
   - Resize browser window
   - ✅ **Expected**: Table still usable
   - ✅ **Expected**: Horizontal scroll if needed
   - ✅ **Expected**: Modal adapts to screen width

3. **Mobile (< 768px)**:
   - Resize to mobile size
   - ✅ **Expected**: Table becomes scrollable
   - ✅ **Expected**: Modal takes full screen width
   - ✅ **Expected**: All controls remain accessible

### Scenario 15: Performance (5 minutes)

**Goal**: Verify acceptable performance

1. **Page Load**:
   - Open Network tab in DevTools
   - Navigate to chat sessions page
   - ✅ **Expected**: API response < 1 second
   - ✅ **Expected**: Page renders < 2 seconds

2. **Modal Load**:
   - Click session row
   - ✅ **Expected**: Modal opens immediately
   - ✅ **Expected**: Data loads < 2 seconds

3. **Pagination**:
   - Click next page
   - ✅ **Expected**: New data loads < 1 second
   - ✅ **Expected**: No full page reload

4. **Tab Switching**:
   - Switch between tabs in modal
   - ✅ **Expected**: Instant tab changes
   - ✅ **Expected**: No loading delay (data already fetched)

## Bug Tracking Template

If you find issues, document them using this format:

```markdown
### Bug: [Brief Description]

**Severity**: Critical / High / Medium / Low

**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happens]

**Screenshots/Videos**:
[If applicable]

**Console Errors**:
```
[Copy any console errors here]
```

**Environment**:
- Browser: Chrome 119
- OS: macOS Sonoma 14.1
- Date: 2025-10-23
```

## Test Results Summary

After completing all scenarios, fill out this summary:

```markdown
# Chat Sessions Monitoring - Test Results

**Date**: YYYY-MM-DD  
**Tester**: [Your Name]  
**Duration**: [Total testing time]

## Summary

- Total Scenarios: 15
- Passed: [X]
- Failed: [X]
- Blocked: [X]

## Critical Issues

[List any critical bugs that block feature launch]

## High Priority Issues

[List high-priority bugs that should be fixed before launch]

## Medium/Low Priority Issues

[List nice-to-have fixes or polish items]

## Recommendation

- [ ] Ready for Production
- [ ] Needs Bug Fixes (see issues above)
- [ ] Needs Design Review
- [ ] Needs Performance Optimization
```

## Next Steps After Testing

1. **No Issues Found**: 
   - Mark Phase 2 as 100% complete
   - Update documentation
   - Consider optional unit tests

2. **Issues Found**:
   - Document all bugs using template above
   - Prioritize by severity
   - Fix critical/high priority bugs first
   - Re-test after fixes

3. **Optional Enhancements**:
   - Write unit tests
   - Add advanced filtering
   - Implement real-time updates
   - Add export functionality

## Useful Commands

```bash
# Start dev environment
npm run workspace:start

# Check logs
npm run workspace:logs

# Check API directly
curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Project-ID: $PROJECT" \
     -H "X-Org-ID: $ORG" \
     http://localhost:3001/api/monitoring/chat-sessions

# Check database directly (if needed)
npm run workspace:db:psql
```

## Contact

If you encounter issues during testing:
1. Check console for JavaScript errors
2. Check Network tab for failed API calls
3. Check `docs/MONITORING_PHASE2_*.md` documentation
4. Review API endpoint documentation
5. Ask for help if stuck

Good luck with testing! 🚀
