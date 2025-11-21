#!/usr/bin/env bash

# Test script for new PID-based process management
# This script will test start, status, stop commands

set -e

echo "========================================"
echo "Testing PID-based Process Management"
echo "========================================"
echo ""

# Ensure we're in the repo root
cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  echo "Please create .env from .env.example"
  exit 1
fi

# Source .env to check required variables
set -a
source .env
set +a

echo "✓ .env file loaded"
echo ""

# Test 1: Check environment variables
echo "Test 1: Validating required environment variables..."
REQUIRED_VARS=(
  "ADMIN_PORT"
  "SERVER_PORT"
  "POSTGRES_HOST"
  "POSTGRES_PORT"
  "POSTGRES_USER"
  "POSTGRES_PASSWORD"
  "POSTGRES_DB"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "  ❌ Missing: $var"
    exit 1
  else
    echo "  ✓ $var=${!var}"
  fi
done
echo ""

# Test 2: Check status (should show all services stopped)
echo "Test 2: Checking initial status..."
nx run workspace-cli:workspace:status
echo ""

# Test 3: Try to start admin only
echo "Test 3: Starting admin service..."
nx run workspace-cli:workspace:start --service admin
echo ""

# Wait a bit for process to start
sleep 2

# Test 4: Check status again
echo "Test 4: Checking status after start..."
nx run workspace-cli:workspace:status
echo ""

# Test 5: Check PID file exists
echo "Test 5: Verifying PID file..."
if [ -f "apps/pids/admin.pid" ]; then
  PID=$(cat apps/pids/admin.pid)
  echo "  ✓ PID file exists: apps/pids/admin.pid"
  echo "  ✓ PID: $PID"
  
  # Check if process is running
  if ps -p $PID > /dev/null; then
    echo "  ✓ Process is running"
  else
    echo "  ❌ Process is not running"
    exit 1
  fi
else
  echo "  ❌ PID file not found"
  exit 1
fi
echo ""

# Test 6: Check metadata file
echo "Test 6: Verifying metadata file..."
if [ -f "apps/pids/admin.json" ]; then
  echo "  ✓ Metadata file exists: apps/pids/admin.json"
  cat apps/pids/admin.json | head -10
else
  echo "  ❌ Metadata file not found"
  exit 1
fi
echo ""

# Test 7: Check log files
echo "Test 7: Verifying log files..."
if [ -f "logs/admin.out.log" ]; then
  echo "  ✓ Output log exists: logs/admin.out.log"
  echo "  Last 5 lines:"
  tail -5 logs/admin.out.log
else
  echo "  ⚠️  Output log not found yet (might still be starting)"
fi
echo ""

# Test 8: Stop the service
echo "Test 8: Stopping admin service..."
nx run workspace-cli:workspace:stop --service admin
echo ""

# Wait a bit
sleep 2

# Test 9: Verify process stopped
echo "Test 9: Verifying process stopped..."
if [ -f "apps/pids/admin.pid" ]; then
  echo "  ❌ PID file still exists"
  exit 1
else
  echo "  ✓ PID file removed"
fi

if ps -p $PID > /dev/null 2>&1; then
  echo "  ❌ Process still running"
  exit 1
else
  echo "  ✓ Process terminated"
fi
echo ""

# Test 10: Final status check
echo "Test 10: Final status check..."
nx run workspace-cli:workspace:status
echo ""

echo "========================================"
echo "✅ All tests passed!"
echo "========================================"
