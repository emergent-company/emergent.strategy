# Quick Start - Development Process Manager

## TL;DR

```bash
# Start everything (auto-cleans old processes)
npm run dev

# Stop everything
npm run dev:stop

# Check what's running
npm run dev:status

# Full restart
npm run dev:restart
```

## What Changed?

**Before:**
```bash
npm run dev
# Error: Port 3001 already in use
# Manual fix: lsof -ti:3001 | xargs kill -9
```

**Now:**
```bash
npm run dev
# ✓ Automatically detects and stops old processes
# ✓ Starts fresh
# ✓ Tracks PIDs in .dev-pids/
# ✓ Graceful shutdown with Ctrl+C
```

## Visual Guide

### Starting Services
```
$ npm run dev

Starting development servers...

▶  Starting Backend API...
[api] [Nest] Starting Nest application...
▶  Starting Admin Frontend...
[admin] VITE v7.1.5  ready in 322 ms

✓ All services started
Press Ctrl+C to stop all services
```

### Checking Status
```
$ npm run dev:status

Development Services Status:

● Backend API          running (PID: 7396)
● Admin Frontend       running (PID: 7519)
```

### Stopping Services
```
$ npm run dev:stop

Stopping all services...

⏹  Stopping Backend API (PID: 7396)...
✓ Backend API stopped gracefully

✓ All services stopped
```

### Handling Port Conflicts
```
$ npm run dev:status

○ Backend API          stopped (port 3001 in use by PID: 776)
○ Admin Frontend       stopped

$ npm run dev:stop
✓ All services stopped  ← Automatically cleans up

$ npm run dev
✓ All services started  ← Now works!
```

## Common Scenarios

### Daily Development
```bash
# Morning: Start work
npm run dev

# During day: Check if running
npm run dev:status

# Evening: Stop work
npm run dev:stop
```

### After Crash/Hang
```bash
# Services not responding?
npm run dev:restart

# Or manually:
npm run dev:stop
npm run dev
```

### Troubleshooting
```bash
# Something wrong? Check first:
npm run dev:status

# Then restart:
npm run dev:restart
```

## Under the Hood

### PID Files
```
.dev-pids/
├── api.pid    ← Backend process ID
└── admin.pid  ← Frontend process ID
```

These files:
- Auto-created on start
- Auto-deleted on stop
- Used to track processes
- Gitignored

### Port Detection
The manager checks:
1. Do PID files exist?
2. Are those processes still running?
3. Is something else on the ports (3001, 5175)?
4. If yes → stop it gracefully

### Graceful Shutdown
1. **SIGTERM** sent (polite "please stop")
2. Wait up to 5 seconds
3. **SIGKILL** if needed (force stop)
4. Clean up PID files

## Benefits

✅ **No more manual killing** - Automatic cleanup
✅ **Port conflicts solved** - Detects and resolves
✅ **Clean logs** - Color-coded by service
✅ **Safe restarts** - Handles crashes gracefully
✅ **Status visibility** - Know what's running

## Need Help?

See full docs: `scripts/README-dev-manager.md`

## Old Behavior

If you need the old `concurrently` approach:
```bash
npm run dev:legacy
```
