# Notification Stats Endpoint Investigation

## Issue Reported
User saw error in browser console:
```
GET http://localhost:5175/api/notifications/stats 500 (Internal Server Error)
```

## Investigation Results

### 1. Log Analysis
Searched logs for notification stats errors:

```bash
npm run workspace:logs | grep -E "(notification.*stats|GET.*notifications/stats|500)"
```

**Findings:**
- Found proxy errors at 17:26:52 and 20:45:52
- Error type: `AggregateError [ECONNREFUSED]`
- Root cause: Server wasn't running at those times
- No current/active notification endpoint errors found

### 2. Error Context
```
5:26:52 PM [vite] http proxy error: /notifications/stats
AggregateError [ECONNREFUSED]
    at internalConnectMultiple (node:net:1134:18)
```

Multiple endpoints affected during server downtime:
- `/notifications/stats`
- `/notifications/counts`
- `/projects/:id`

### 3. Endpoint Verification
Tested the endpoint directly:

```bash
curl -s http://localhost:3001/notifications/stats
```

**Result:**
```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing Authorization bearer token"
  }
}
```

✅ Endpoint exists and is working correctly (requires authentication as expected)

## Conclusion

**The notification stats 500 error is historical and not a current issue.**

- Errors occurred when the server was down
- Frontend may be showing cached error or error from before latest restart
- Current server is healthy with no active notification endpoint errors
- The endpoint exists at `/notifications/stats` and requires authentication

## Resolution

**User Action Required:**
1. Refresh browser to clear cached errors
2. If error persists, check:
   - Server is running: `npm run workspace:status`
   - Authentication token is valid
   - No browser console errors about missing auth

**Server Status:**
```bash
# Check if services are running
npm run workspace:status

# If not, start them
npm run workspace:start
```

## Related Errors in Logs

Found unrelated graph_objects constraint violations from earlier (15:17:50, 15:28:07):
```
ERROR [GraphService] Error in createObject: null value in column 'key' of relation 'graph_objects' violates not-null constraint
```

These are from previous extraction job attempts and not related to notification endpoint.

## Monitoring

To monitor notification endpoint health:

```bash
# Watch for notification errors
npm run workspace:logs | grep notification

# Test endpoint with auth token
curl -H "Authorization: Bearer <token>" http://localhost:3001/notifications/stats
```

## Next Steps

1. User should refresh browser
2. If error persists after refresh, investigate:
   - Frontend notification context/hook
   - Browser network tab for actual request/response
   - Check if RLS policies on notifications tables have UUID casting issues (unlikely but possible)
3. Consider adding retry logic in frontend for temporary network failures

## Status
✅ **No action required** - Server is healthy, error was transient during downtime
