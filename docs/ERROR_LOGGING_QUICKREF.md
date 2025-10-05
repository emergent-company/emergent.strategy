# Error Logging Quick Reference

## 🔍 View Browser Errors (Console)

```javascript
// Print table of errors
window.__errorLogs.printLogs()

// Get raw data
window.__errorLogs.getLogs()

// Download as JSON
window.__errorLogs.downloadLogs()

// Clear all
window.__errorLogs.clearLogs()
```

## 📝 View Server Errors (Terminal)

```bash
# Last 20 errors
tail -20 logs/errors.log | jq '.'

# Follow live
tail -f logs/errors.log | jq '.'

# Today's errors
grep "$(date +%Y-%m-%d)" logs/errors.log | jq '.'

# Last error with full stack
tail -1 logs/errors.log | jq -r '.stack'

# Errors for specific endpoint
cat logs/errors.log | jq 'select(.path | contains("/template-packs"))'
```

## 🐛 Debugging Workflow

1. **Browser**: `window.__errorLogs.printLogs()` → See API call details
2. **Server**: `tail -1 logs/errors.log | jq '.'` → See stack trace  
3. **Download**: `window.__errorLogs.downloadLogs()` → Share with team

## ⚙️ Configuration

```javascript
// Enable browser logging
window.__errorLogs.enable()

// Disable browser logging
window.__errorLogs.disable()
```

## 📍 Log Locations

- **Server**: `logs/errors.log` (JSON lines, one per error)
- **Browser**: `localStorage` → key starts with `app_error_logs`

## 🎯 What Gets Logged

### Browser
- ✅ console.error()
- ✅ Unhandled errors
- ✅ Promise rejections
- ✅ API errors (4xx, 5xx)
- ✅ Network failures

### Server  
- ✅ All 5xx errors
- ✅ Full stack traces
- ✅ Request context (user, org, project)
- ✅ Request/response details
