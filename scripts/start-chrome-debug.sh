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

# Default URL - use ADMIN_PORT from environment, fallback to 5176
DEFAULT_ADMIN_PORT="${ADMIN_PORT:-5176}"
APP_URL="${1:-http://localhost:${DEFAULT_ADMIN_PORT}}"

# Show help if requested
if [ "$APP_URL" = "--help" ] || [ "$APP_URL" = "-h" ]; then
    echo -e "${BLUE}Chrome Remote Debugging Launcher${NC}"
    echo ""
    echo "Usage: $0 [URL]"
    echo ""
    echo "Arguments:"
    echo "  URL              - URL to open in Chrome (default: http://localhost:\${ADMIN_PORT:-5176})"
    echo ""
    echo "Environment Variables:"
    echo "  ADMIN_PORT        - Admin app port for default URL (default: 5176)"
    echo "  CHROME_DEBUG_PORT - Remote debugging port (default: 9222)"
    echo ""
    echo "Example:"
    echo "  $0 http://localhost:5176"
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

echo -e "${BLUE}Starting Chrome with remote debugging enabled...${NC}"
echo -e "Debug port: ${YELLOW}${DEBUG_PORT}${NC}"
echo -e "Opening URL: ${YELLOW}${APP_URL}${NC}"
echo ""

# Determine Chrome executable path based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if [ ! -f "$CHROME_PATH" ]; then
        echo -e "${RED}Error: Chrome not found at $CHROME_PATH${NC}"
        echo -e "Please install Google Chrome or set CHROME_PATH environment variable"
        exit 1
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    CHROME_PATH=$(which google-chrome || which google-chrome-stable || which chromium || which chromium-browser || echo "")
    if [ -z "$CHROME_PATH" ]; then
        echo -e "${RED}Error: Chrome not found${NC}"
        echo -e "Please install Google Chrome or Chromium"
        exit 1
    fi
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash/Cygwin)
    CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
    if [ ! -f "$CHROME_PATH" ]; then
        CHROME_PATH="/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
        if [ ! -f "$CHROME_PATH" ]; then
            echo -e "${RED}Error: Chrome not found${NC}"
            echo -e "Please install Google Chrome"
            exit 1
        fi
    fi
else
    echo -e "${RED}Error: Unsupported OS: $OSTYPE${NC}"
    exit 1
fi

# Check if port is already in use
if lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}Warning: Port ${DEBUG_PORT} is already in use${NC}"
    echo -e "Chrome with remote debugging may already be running."
    echo -e "If not, kill the process using port ${DEBUG_PORT} and try again:"
    echo -e "  lsof -ti:${DEBUG_PORT} | xargs kill -9"
    echo ""
fi

echo -e "${GREEN}Launching Chrome...${NC}"
echo ""
echo -e "${BLUE}Remote debugging enabled on: http://127.0.0.1:${DEBUG_PORT}${NC}"
echo -e "${BLUE}AI assistants can now inspect this Chrome instance via MCP${NC}"
echo ""
echo -e "${YELLOW}Usage:${NC}"
echo -e "  1. Test your app manually in this Chrome window"
echo -e "  2. When you encounter issues, ask your AI assistant to inspect browser state"
echo -e "  3. AI can access console logs, network requests, DOM, and performance data"
echo ""
echo -e "${YELLOW}Press Ctrl+C to close Chrome and stop remote debugging${NC}"
echo ""

# Launch Chrome with remote debugging enabled
# Use a temporary user data directory to avoid conflicts with regular Chrome usage
USER_DATA_DIR=$(mktemp -d -t chrome-debug-XXXXXX)

# Cleanup function to remove temp directory on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up temporary Chrome profile...${NC}"
    rm -rf "$USER_DATA_DIR"
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT

"$CHROME_PATH" \
    --remote-debugging-port="${DEBUG_PORT}" \
    --user-data-dir="$USER_DATA_DIR" \
    --no-first-run \
    --no-default-browser-check \
    "$APP_URL" \
    2>/dev/null || true
