#!/bin/bash
set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default remote debugging port
DEBUG_PORT="${CHROME_DEBUG_PORT:-9222}"

# PID file location
PID_FILE="/tmp/chrome-debug-${DEBUG_PORT}.pid"

# Default URL - use ADMIN_PORT from environment, fallback to 5176
DEFAULT_ADMIN_PORT="${ADMIN_PORT:-5176}"
APP_URL="${1:-http://localhost:${DEFAULT_ADMIN_PORT}}"

# Show help if requested
if [ "$APP_URL" = "--help" ] || [ "$APP_URL" = "-h" ]; then
    echo -e "${BLUE}Chrome Remote Debugging Launcher${NC}"
    echo ""
    echo "Usage: $0 [URL|--status]"
    echo ""
    echo "Arguments:"
    echo "  URL              - URL to open in Chrome (default: http://localhost:\${ADMIN_PORT:-5176})"
    echo "  --status         - Check if Chrome debug is currently running"
    echo ""
    echo "Environment Variables:"
    echo "  ADMIN_PORT        - Admin app port for default URL (default: 5176)"
    echo "  CHROME_DEBUG_PORT - Remote debugging port (default: 9222)"
    echo ""
    echo "Example:"
    echo "  $0 http://localhost:5176"
    echo "  $0 --status"
    echo "  ADMIN_PORT=5175 $0"
    echo "  CHROME_DEBUG_PORT=9223 $0 http://localhost:4200"
    echo ""
    echo "Once Chrome is running with remote debugging enabled:"
    echo "  1. Test your app manually in the Chrome window"
    echo "  2. When you encounter an issue, ask AI assistants to inspect:"
    echo "     - Console logs and errors"
    echo "     - Network requests/responses"
    echo "     - DOM state and elements"
    echo "     - Performance metrics"
    echo ""
    echo "The MCP server connects to Chrome on port ${DEBUG_PORT}"
    exit 0
fi

# Check status if requested
if [ "$APP_URL" = "--status" ]; then
    echo -e "${BLUE}Checking Chrome debug status...${NC}"
    echo ""
    
    # Check if PID file exists
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Chrome debug is running${NC}"
            echo -e "  PID: ${YELLOW}${PID}${NC}"
            echo -e "  Port: ${YELLOW}${DEBUG_PORT}${NC}"
            echo -e "  Debug URL: ${YELLOW}http://127.0.0.1:${DEBUG_PORT}${NC}"
            
            # Try to get Chrome version/info
            if lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN >/dev/null 2>&1 ; then
                echo -e "  Status: ${GREEN}Port ${DEBUG_PORT} is listening${NC}"
            fi
            exit 0
        else
            echo -e "${YELLOW}⚠ PID file exists but process is not running${NC}"
            echo -e "  Removing stale PID file..."
            rm -f "$PID_FILE"
        fi
    fi
    
    # Check if port is in use by another process
    if lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        PORT_PID=$(lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t | head -n 1)
        echo -e "${YELLOW}⚠ Port ${DEBUG_PORT} is in use by another process${NC}"
        echo -e "  PID: ${YELLOW}${PORT_PID}${NC}"
        echo -e "  This may be Chrome debug started outside this script"
        echo -e ""
        echo -e "To kill it: ${YELLOW}kill ${PORT_PID}${NC}"
        exit 1
    else
        echo -e "${RED}✗ Chrome debug is not running${NC}"
        echo -e "  Port ${DEBUG_PORT} is available"
        exit 1
    fi
fi

echo -e "${BLUE}Starting Chrome with remote debugging enabled...${NC}"
echo -e "Debug port: ${YELLOW}${DEBUG_PORT}${NC}"
echo -e "Opening URL: ${YELLOW}${APP_URL}${NC}"
echo ""

# Determine Chrome executable path based on OS
# Prioritize Chromium to avoid conflicts with regular Chrome usage
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - check for Chromium first, then Chrome
    if [ -f "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
        CHROME_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium"
        BROWSER_NAME="Chromium"
    elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
        CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        BROWSER_NAME="Chrome"
    else
        echo -e "${RED}Error: Neither Chromium nor Chrome found${NC}"
        echo -e "Please install Chromium (recommended) or Google Chrome"
        echo -e ""
        echo -e "Install Chromium with Homebrew: ${YELLOW}brew install --cask chromium${NC}"
        exit 1
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - prioritize Chromium
    CHROME_PATH=$(which chromium || which chromium-browser || which google-chrome || which google-chrome-stable || echo "")
    if [ -z "$CHROME_PATH" ]; then
        echo -e "${RED}Error: No browser found${NC}"
        echo -e "Please install Chromium (recommended) or Google Chrome"
        exit 1
    fi
    BROWSER_NAME=$(basename "$CHROME_PATH")
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash/Cygwin)
    CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
    if [ ! -f "$CHROME_PATH" ]; then
        CHROME_PATH="/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
        if [ ! -f "$CHROME_PATH" ]; then
            echo -e "${RED}Error: Chrome not found${NC}"
            echo -e "Please install Google Chrome or Chromium"
            exit 1
        fi
    fi
    BROWSER_NAME="Chrome"
else
    echo -e "${RED}Error: Unsupported OS: $OSTYPE${NC}"
    exit 1
fi

# Check if Chrome debug is already running via our PID file
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}Chrome debug is already running!${NC}"
        echo -e "  PID: ${YELLOW}${OLD_PID}${NC}"
        echo -e "  Port: ${YELLOW}${DEBUG_PORT}${NC}"
        echo -e "  Debug URL: ${YELLOW}http://127.0.0.1:${DEBUG_PORT}${NC}"
        echo ""
        echo -e "${RED}Please close the existing Chrome debug window to start a new session.${NC}"
        echo ""
        echo -e "To check status: ${YELLOW}$0 --status${NC}"
        echo -e "To stop it, kill the Chrome process or close the Chrome window"
        exit 1
    else
        # PID file exists but process is dead, clean it up
        echo -e "${YELLOW}Removing stale PID file...${NC}"
        rm -f "$PID_FILE"
    fi
fi

# Check if port is already in use by another process
if lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    PORT_PID=$(lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t | head -n 1)
    echo -e "${RED}Error: Port ${DEBUG_PORT} is already in use by another process${NC}"
    echo -e "  PID: ${YELLOW}${PORT_PID}${NC}"
    echo ""
    echo -e "This may be Chrome debug started outside this script, or another service."
    echo -e ""
    echo -e "Options:"
    echo -e "  1. Kill the process: ${YELLOW}kill ${PORT_PID}${NC}"
    echo -e "  2. Use a different port: ${YELLOW}CHROME_DEBUG_PORT=9223 $0${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}Launching ${BROWSER_NAME}...${NC}"
echo ""
echo -e "${BLUE}Remote debugging enabled on: http://127.0.0.1:${DEBUG_PORT}${NC}"
echo -e "${BLUE}AI assistants can now inspect this browser instance via MCP${NC}"
echo ""
echo -e "${YELLOW}Usage:${NC}"
echo -e "  1. Test your app manually in this ${BROWSER_NAME} window"
echo -e "  2. When you encounter issues, ask your AI assistant to inspect browser state"
echo -e "  3. AI can access console logs, network requests, DOM, and performance data"
echo ""
echo -e "${YELLOW}Press Ctrl+C to close ${BROWSER_NAME} and stop remote debugging${NC}"
echo ""

# Launch Chrome/Chromium with remote debugging enabled
# Use a temporary user data directory to avoid conflicts with regular browser usage
USER_DATA_DIR=$(mktemp -d -t chrome-debug-XXXXXX)

# Cleanup function to remove temp directory and PID file on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    
    # Remove PID file
    if [ -f "$PID_FILE" ]; then
        rm -f "$PID_FILE"
        echo -e "  ✓ Removed PID file"
    fi
    
    # Remove temp directory
    rm -rf "$USER_DATA_DIR"
    echo -e "  ✓ Removed temporary browser profile"
    
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT

# Start browser in background to capture PID
# Comprehensive flags to disable ALL caching for testing
"$CHROME_PATH" \
    --remote-debugging-port="${DEBUG_PORT}" \
    --user-data-dir="$USER_DATA_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --disable-application-cache \
    --disable-cache \
    --disable-offline-load-stale-cache \
    --disk-cache-size=0 \
    --media-cache-size=0 \
    --disable-gpu-shader-disk-cache \
    --disable-background-networking \
    --disable-sync \
    --disable-extensions \
    --disable-plugins-discovery \
    --aggressive-cache-discard \
    --incognito \
    --disable-features=InfiniteSessionRestore \
    --disable-infobars \
    --test-type \
    "$APP_URL" \
    2>/dev/null &

CHROME_PID=$!

# Save PID to file
echo "$CHROME_PID" > "$PID_FILE"

echo -e "${GREEN}✓ ${BROWSER_NAME} started with PID: ${CHROME_PID}${NC}"
echo -e "${GREEN}✓ PID saved to: ${PID_FILE}${NC}"
echo ""
echo -e "Check status anytime with: ${YELLOW}$0 --status${NC}"
echo ""

# Wait for browser process
wait "$CHROME_PID"
