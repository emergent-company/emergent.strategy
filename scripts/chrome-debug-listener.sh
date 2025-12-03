#!/bin/bash
#
# Chrome Debug Listener
# 
# Run this on your LOCAL machine. It listens for commands from the remote server
# to start/stop Chrome with remote debugging.
#
# Usage:
#   LOCAL:  ./chrome-debug-listener.sh
#   REMOTE: ./start-chrome-debug.sh --trigger
#
# The listener uses a simple TCP socket to receive commands.
#

set -e

# Configuration
LISTEN_PORT="${CHROME_LISTENER_PORT:-9221}"
DEBUG_PORT="${CHROME_DEBUG_PORT:-9222}"

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Track Chrome PID
CHROME_PID=""
USER_DATA_DIR=""

# Cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down listener...${NC}"
    if [ -n "$CHROME_PID" ] && ps -p "$CHROME_PID" > /dev/null 2>&1; then
        echo -e "  Stopping Chrome (PID: $CHROME_PID)..."
        kill "$CHROME_PID" 2>/dev/null || true
    fi
    if [ -n "$USER_DATA_DIR" ] && [ -d "$USER_DATA_DIR" ]; then
        rm -rf "$USER_DATA_DIR"
        echo -e "  Cleaned up temp profile"
    fi
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT

# Detect Chrome/Chromium path
detect_browser() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if [ -f "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
            echo "/Applications/Chromium.app/Contents/MacOS/Chromium"
        elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
            echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        which chromium || which chromium-browser || which google-chrome || which google-chrome-stable || echo ""
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        if [ -f "/c/Program Files/Google/Chrome/Application/chrome.exe" ]; then
            echo "/c/Program Files/Google/Chrome/Application/chrome.exe"
        fi
    fi
}

start_chrome() {
    local url="${1:-about:blank}"
    
    if [ -n "$CHROME_PID" ] && ps -p "$CHROME_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}Chrome already running (PID: $CHROME_PID)${NC}"
        return 0
    fi
    
    CHROME_PATH=$(detect_browser)
    if [ -z "$CHROME_PATH" ]; then
        echo -e "${RED}No Chrome/Chromium found${NC}"
        return 1
    fi
    
    USER_DATA_DIR=$(mktemp -d -t chrome-debug-XXXXXX)
    
    echo -e "${GREEN}Starting $(basename "$CHROME_PATH")...${NC}"
    "$CHROME_PATH" \
        --remote-debugging-port="${DEBUG_PORT}" \
        --user-data-dir="$USER_DATA_DIR" \
        --no-first-run \
        --no-default-browser-check \
        --disable-extensions \
        "$url" \
        2>/dev/null &
    
    CHROME_PID=$!
    sleep 1
    
    if ps -p "$CHROME_PID" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Chrome started (PID: $CHROME_PID)${NC}"
        echo "OK:$CHROME_PID"
        return 0
    else
        echo -e "${RED}✗ Chrome failed to start${NC}"
        echo "ERROR:Failed to start"
        return 1
    fi
}

stop_chrome() {
    if [ -n "$CHROME_PID" ] && ps -p "$CHROME_PID" > /dev/null 2>&1; then
        kill "$CHROME_PID" 2>/dev/null
        echo -e "${GREEN}✓ Chrome stopped${NC}"
        CHROME_PID=""
        echo "OK:Stopped"
    else
        echo -e "${YELLOW}Chrome not running${NC}"
        echo "OK:NotRunning"
    fi
}

get_status() {
    if [ -n "$CHROME_PID" ] && ps -p "$CHROME_PID" > /dev/null 2>&1; then
        echo "RUNNING:$CHROME_PID"
    else
        echo "STOPPED"
    fi
}

# Show banner
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}              Chrome Debug Listener${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Listening on port:${NC} ${LISTEN_PORT}"
echo -e "${CYAN}Chrome debug port:${NC} ${DEBUG_PORT}"
echo ""
echo -e "${YELLOW}Setup SSH tunnel from remote server:${NC}"
echo -e "  ssh -R ${DEBUG_PORT}:localhost:${DEBUG_PORT} -R ${LISTEN_PORT}:localhost:${LISTEN_PORT} user@remote"
echo ""
echo -e "${YELLOW}Or use VS Code port forwarding (reverse):${NC}"
echo -e "  Forward ports ${DEBUG_PORT} and ${LISTEN_PORT} as Remote → Local"
echo ""
echo -e "${GREEN}Waiting for commands...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Check for nc (netcat)
if ! command -v nc &> /dev/null; then
    echo -e "${RED}Error: 'nc' (netcat) is required but not installed${NC}"
    echo -e "Install with: brew install netcat (macOS) or apt install netcat (Linux)"
    exit 1
fi

# Main listener loop
while true; do
    # Listen for a single command (nc -l exits after one connection)
    # Using timeout to allow for periodic status checks
    COMMAND=$(nc -l "$LISTEN_PORT" 2>/dev/null | head -1 || echo "")
    
    if [ -z "$COMMAND" ]; then
        continue
    fi
    
    echo -e "${CYAN}Received:${NC} $COMMAND"
    
    case "$COMMAND" in
        START*)
            URL=$(echo "$COMMAND" | sed 's/^START//' | xargs)
            start_chrome "$URL"
            ;;
        STOP)
            stop_chrome
            ;;
        STATUS)
            get_status
            ;;
        PING)
            echo "PONG"
            ;;
        *)
            echo -e "${YELLOW}Unknown command: $COMMAND${NC}"
            echo "ERROR:Unknown command"
            ;;
    esac
done
