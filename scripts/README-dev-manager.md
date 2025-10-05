# Development Process Manager

A robust process manager for running development servers with automatic cleanup.

## Features

- ✅ **PID file tracking** - Stores process IDs in `.dev-pids/` directory
- ✅ **Port conflict detection** - Finds and kills processes on required ports
- ✅ **Graceful shutdown** - Tries SIGTERM first, falls back to SIGKILL
- ✅ **Status checking** - View which services are running
- ✅ **Auto-cleanup** - Stops existing processes before starting new ones
- ✅ **Color-coded output** - Easy to distinguish between services

## Usage

### Start all services
```bash
npm run dev
# or directly:
node scripts/dev-manager.mjs start
```

### Stop all services
```bash
npm run dev:stop
# or directly:
node scripts/dev-manager.mjs stop
```

### Restart all services
```bash
npm run dev:restart
# or directly:
node scripts/dev-manager.mjs restart
```

### Check status
```bash
npm run dev:status
# or directly:
node scripts/dev-manager.mjs status
```

## Services

The manager controls these services:

- **Backend API** (`api`) - NestJS server on port 3001
- **Admin Frontend** (`admin`) - Vite dev server on port 5175

## How it works

1. **Before starting**: Checks for existing processes by:
   - Reading PID files from `.dev-pids/`
   - Checking if those processes are still running
   - Finding any processes using the required ports (3001, 5175)
   - Stopping all found processes gracefully

2. **During startup**: 
   - Spawns each service as a child process
   - Saves PID to `.dev-pids/{service}.pid`
   - Prefixes all output with colored service name
   - Monitors process health

3. **On shutdown** (Ctrl+C or SIGTERM):
   - Catches signals gracefully
   - Stops all services in order
   - Cleans up PID files
   - Exits cleanly

## Port Conflicts

If you see warnings about ports being in use, the manager will automatically:
1. Find the process(es) using the port
2. Attempt graceful shutdown (SIGTERM)
3. Wait up to 5 seconds
4. Force kill if needed (SIGKILL)

## PID Files

PID files are stored in `.dev-pids/` (gitignored):
- `api.pid` - Backend server process ID
- `admin.pid` - Frontend server process ID

These files are automatically created on start and removed on stop.

## Troubleshooting

### Services won't start
```bash
# Check what's running
npm run dev:status

# Force stop everything
npm run dev:stop

# Try starting again
npm run dev
```

### Port already in use
The manager automatically handles this, but if you need to manually check:
```bash
# Find what's on port 3001
lsof -ti:3001

# Kill it manually
kill -9 $(lsof -ti:3001)
```

### Orphaned processes
If processes survive after stopping:
```bash
# Check status
npm run dev:status

# This will show any orphaned port usage
# Then restart to clean them up
npm run dev:restart
```

## Legacy Mode

If you need the old behavior without process management:
```bash
npm run dev:legacy
```

This runs `concurrently` directly without PID tracking or cleanup.
