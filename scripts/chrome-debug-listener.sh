#!/bin/bash
#
# Chrome Debug Listener
# 
# Automatically starts Chromium with remote debugging when SSH connects.
# Chromium is killed when the SSH connection terminates.
#
# Used via SSH ProxyCommand - runs in background during SSH session.
#

# Configuration
DEBUG_PORT="${CHROME_DEBUG_PORT:-9222}"

# Track Chrome PID
CHROME_PID=""
USER_DATA_DIR=""

# PID file to track this instance
PID_FILE="/tmp/chrome-debug-listener.pid"

# Cleanup on exit - kills Chrome when SSH disconnects
cleanup() {
    if [ -n "$CHROME_PID" ] && ps -p "$CHROME_PID" > /dev/null 2>&1; then
        kill "$CHROME_PID" 2>/dev/null || true
    fi
    if [ -n "$USER_DATA_DIR" ] && [ -d "$USER_DATA_DIR" ]; then
        rm -rf "$USER_DATA_DIR" 2>/dev/null || true
    fi
    rm -f "$PID_FILE" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

# Detect Chromium path (Chromium only - no Chrome fallback)
detect_browser() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if [ -f "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
            echo "/Applications/Chromium.app/Contents/MacOS/Chromium"
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        which chromium || which chromium-browser || echo ""
    fi
}

start_chrome() {
    # Check if Chrome is already running on debug port
    if curl -s --connect-timeout 1 "http://localhost:${DEBUG_PORT}/json/version" > /dev/null 2>&1; then
        return 0
    fi
    
    CHROME_PATH=$(detect_browser)
    if [ -z "$CHROME_PATH" ]; then
        return 1
    fi
    
    USER_DATA_DIR=$(mktemp -d -t chrome-debug-XXXXXX)
    
    "$CHROME_PATH" \
        --remote-debugging-port="${DEBUG_PORT}" \
        --user-data-dir="$USER_DATA_DIR" \
        --no-first-run \
        --no-default-browser-check \
        --disable-extensions \
        "about:blank" \
        >/dev/null 2>&1 &
    
    CHROME_PID=$!
    echo "$CHROME_PID" > "$PID_FILE"
    
    # Wait for Chrome to be ready
    for i in {1..10}; do
        if curl -s --connect-timeout 1 "http://localhost:${DEBUG_PORT}/json/version" > /dev/null 2>&1; then
            return 0
        fi
        sleep 0.5
    done
    return 1
}

# Start Chrome immediately
start_chrome

# Execute netcat to complete SSH connection
# When SSH disconnects, nc exits, this script exits, and cleanup kills Chrome
exec nc "$@"
