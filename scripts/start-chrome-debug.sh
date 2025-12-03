#!/bin/bash
set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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
    echo "Usage: $0 [URL|OPTION]"
    echo ""
    echo "Options:"
    echo "  URL                    - Start local Chrome with this URL (default: http://localhost:\${ADMIN_PORT:-5176})"
    echo "  --status               - Check if Chrome debug is connected (local or remote)"
    echo "  --remote               - Wait for remote Chrome connection via SSH tunnel"
    echo "  --remote-instructions  - Show instructions for connecting remote Chrome"
    echo "  --trigger [URL]        - Start Chrome on remote machine via listener"
    echo "  --stop-remote          - Stop Chrome on remote machine via listener"
    echo ""
    echo "Environment Variables:"
    echo "  ADMIN_PORT           - Admin app port for default URL (default: 5176)"
    echo "  CHROME_DEBUG_PORT    - Remote debugging port (default: 9222)"
    echo "  CHROME_LISTENER_PORT - Listener port for --trigger (default: 9221)"
    echo ""
    echo "Examples:"
    echo "  $0                               # Start local Chrome"
    echo "  $0 http://localhost:5176         # Start local Chrome with URL"
    echo "  $0 --status                      # Check connection status"
    echo "  $0 --remote                      # Wait for remote Chrome"
    echo "  $0 --trigger                     # Start Chrome on local machine (via listener)"
    echo "  $0 --trigger http://myapp:3000   # Start Chrome with specific URL"
    echo "  $0 --stop-remote                 # Stop Chrome on local machine"
    echo ""
    echo "For remote development (OpenCode on server, Chrome on your PC):"
    echo "  1. Run chrome-debug-listener.sh on your LOCAL machine"
    echo "  2. SSH with tunnels: ssh -R 9222:localhost:9222 -R 9221:localhost:9221 user@server"
    echo "  3. On server: $0 --trigger"
    echo ""
    echo "The MCP server connects to Chrome on port ${DEBUG_PORT}"
    exit 0
fi

# Show remote instructions
if [ "$APP_URL" = "--remote-instructions" ]; then
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}      Remote Chrome/Chromium Debugging Setup Instructions${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}STEP 1: Start Chrome/Chromium on your LOCAL machine${NC}"
    echo ""
    echo -e "${CYAN}macOS (Chromium - recommended):${NC}"
    echo -e "  /Applications/Chromium.app/Contents/MacOS/Chromium \\"
    echo -e "    --remote-debugging-port=${DEBUG_PORT} \\"
    echo -e "    --user-data-dir=/tmp/chrome-debug"
    echo ""
    echo -e "${CYAN}macOS (Chrome):${NC}"
    echo -e "  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\"
    echo -e "    --remote-debugging-port=${DEBUG_PORT} \\"
    echo -e "    --user-data-dir=/tmp/chrome-debug"
    echo ""
    echo -e "${CYAN}Linux:${NC}"
    echo -e "  chromium --remote-debugging-port=${DEBUG_PORT} --user-data-dir=/tmp/chrome-debug"
    echo -e "  # or: google-chrome --remote-debugging-port=${DEBUG_PORT} --user-data-dir=/tmp/chrome-debug"
    echo ""
    echo -e "${CYAN}Windows (PowerShell):${NC}"
    echo -e "  & \"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\" \`"
    echo -e "    --remote-debugging-port=${DEBUG_PORT} \`"
    echo -e "    --user-data-dir=\$env:TEMP\\chrome-debug"
    echo ""
    echo -e "${YELLOW}STEP 2: Create SSH reverse tunnel from LOCAL to REMOTE${NC}"
    echo ""
    echo -e "  ssh -R ${DEBUG_PORT}:localhost:${DEBUG_PORT} user@remote-server"
    echo ""
    echo -e "  This forwards the remote server's port ${DEBUG_PORT} to your local Chrome."
    echo ""
    echo -e "${YELLOW}STEP 3: (Optional) Forward app port from REMOTE to LOCAL${NC}"
    echo ""
    echo -e "  If your app runs on the remote server, also forward the app port:"
    echo -e "  ssh -L 5176:localhost:5176 -R ${DEBUG_PORT}:localhost:${DEBUG_PORT} user@remote-server"
    echo ""
    echo -e "  Then open http://localhost:5176 in your local Chrome."
    echo ""
    echo -e "${YELLOW}STEP 4: Verify connection on REMOTE server${NC}"
    echo ""
    echo -e "  $0 --remote"
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}ALTERNATIVE: Use the Listener (auto-start Chrome from server)${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}On your LOCAL machine:${NC}"
    echo -e "  ./scripts/chrome-debug-listener.sh"
    echo ""
    echo -e "${YELLOW}SSH with both tunnels:${NC}"
    echo -e "  ssh -L 5176:localhost:5176 -R ${DEBUG_PORT}:localhost:${DEBUG_PORT} -R 9221:localhost:9221 user@remote"
    echo ""
    echo -e "${YELLOW}On REMOTE server (trigger Chrome to start):${NC}"
    echo -e "  $0 --trigger"
    echo -e "  $0 --trigger http://localhost:5176"
    echo -e "  $0 --stop-remote"
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}VS Code Remote SSH users:${NC}"
    echo -e "  1. Open Ports panel (View → Ports)"
    echo -e "  2. Add ports: ${DEBUG_PORT} and 9221 (if using listener)"
    echo -e "  3. Set direction to 'Remote → Local' (reverse forward)"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    exit 0
fi

# Remote mode - wait for connection via SSH tunnel
if [ "$APP_URL" = "--remote" ]; then
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}           Waiting for Remote Chrome Connection${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Expecting Chrome debug connection on port ${DEBUG_PORT}${NC}"
    echo ""
    echo -e "Make sure you have:"
    echo -e "  1. Started Chrome with --remote-debugging-port=${DEBUG_PORT} on your local machine"
    echo -e "  2. Created SSH reverse tunnel: ssh -R ${DEBUG_PORT}:localhost:${DEBUG_PORT} user@this-server"
    echo ""
    echo -e "Run ${CYAN}$0 --remote-instructions${NC} for detailed setup steps."
    echo ""
    echo -e "${YELLOW}Checking connection...${NC}"
    echo ""
    
    # Try to connect to Chrome debug endpoint
    MAX_ATTEMPTS=30
    ATTEMPT=0
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        ATTEMPT=$((ATTEMPT + 1))
        
        # Try to get Chrome version info
        RESPONSE=$(curl -s --connect-timeout 2 "http://127.0.0.1:${DEBUG_PORT}/json/version" 2>/dev/null || echo "")
        
        if [ -n "$RESPONSE" ]; then
            echo -e "${GREEN}✓ Remote Chrome connected!${NC}"
            echo ""
            
            # Parse and display Chrome info
            BROWSER=$(echo "$RESPONSE" | grep -o '"Browser":"[^"]*"' | cut -d'"' -f4 || echo "Unknown")
            PROTOCOL=$(echo "$RESPONSE" | grep -o '"Protocol-Version":"[^"]*"' | cut -d'"' -f4 || echo "Unknown")
            WEBSOCKET=$(echo "$RESPONSE" | grep -o '"webSocketDebuggerUrl":"[^"]*"' | cut -d'"' -f4 || echo "Unknown")
            
            echo -e "${CYAN}Browser:${NC} $BROWSER"
            echo -e "${CYAN}Protocol:${NC} $PROTOCOL"
            echo -e "${CYAN}Debug URL:${NC} http://127.0.0.1:${DEBUG_PORT}"
            echo ""
            
            # List open pages
            echo -e "${YELLOW}Open pages:${NC}"
            PAGES=$(curl -s "http://127.0.0.1:${DEBUG_PORT}/json/list" 2>/dev/null || echo "[]")
            echo "$PAGES" | grep -o '"title":"[^"]*"' | cut -d'"' -f4 | head -5 | while read -r title; do
                echo -e "  • $title"
            done
            echo ""
            
            echo -e "${GREEN}DevTools MCP is ready to use!${NC}"
            echo -e "AI assistants can now inspect this browser instance."
            echo ""
            echo -e "${YELLOW}Press Ctrl+C to exit (Chrome will keep running on your local machine)${NC}"
            
            # Keep checking connection is alive
            while true; do
                sleep 5
                if ! curl -s --connect-timeout 2 "http://127.0.0.1:${DEBUG_PORT}/json/version" > /dev/null 2>&1; then
                    echo ""
                    echo -e "${RED}✗ Connection lost to remote Chrome${NC}"
                    echo -e "  Check that Chrome is still running and SSH tunnel is active"
                    exit 1
                fi
            done
        fi
        
        # Show waiting indicator
        if [ $((ATTEMPT % 5)) -eq 0 ]; then
            echo -e "  Still waiting... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
        fi
        
        sleep 1
    done
    
    echo -e "${RED}✗ Timeout waiting for remote Chrome connection${NC}"
    echo ""
    echo -e "Troubleshooting:"
    echo -e "  1. Verify Chrome is running with: ${CYAN}--remote-debugging-port=${DEBUG_PORT}${NC}"
    echo -e "  2. Verify SSH tunnel is active: ${CYAN}ssh -R ${DEBUG_PORT}:localhost:${DEBUG_PORT} ...${NC}"
    echo -e "  3. Check if port is listening locally: ${CYAN}curl http://localhost:${DEBUG_PORT}/json/version${NC}"
    echo ""
    echo -e "Run ${CYAN}$0 --remote-instructions${NC} for detailed setup steps."
    exit 1
fi

# Trigger remote Chrome via listener
if [ "$APP_URL" = "--trigger" ] || [ "$APP_URL" = "--start-remote" ]; then
    LISTENER_PORT="${CHROME_LISTENER_PORT:-9221}"
    TRIGGER_URL="${2:-http://localhost:${DEFAULT_ADMIN_PORT}}"
    
    echo -e "${BLUE}Triggering remote Chrome via listener...${NC}"
    echo -e "Listener port: ${YELLOW}${LISTENER_PORT}${NC}"
    echo -e "URL to open: ${YELLOW}${TRIGGER_URL}${NC}"
    echo ""
    
    # Check if listener is reachable
    if ! nc -z 127.0.0.1 "$LISTENER_PORT" 2>/dev/null; then
        echo -e "${RED}✗ Cannot connect to listener on port ${LISTENER_PORT}${NC}"
        echo ""
        echo -e "Make sure:"
        echo -e "  1. ${CYAN}chrome-debug-listener.sh${NC} is running on your local machine"
        echo -e "  2. SSH tunnel includes: ${CYAN}-R ${LISTENER_PORT}:localhost:${LISTENER_PORT}${NC}"
        echo ""
        echo -e "Or run ${CYAN}$0 --remote-instructions${NC} for full setup."
        exit 1
    fi
    
    # Send START command
    echo -e "${GREEN}Sending START command...${NC}"
    RESPONSE=$(echo "START ${TRIGGER_URL}" | nc -w 5 127.0.0.1 "$LISTENER_PORT" 2>/dev/null || echo "ERROR:Timeout")
    
    if [[ "$RESPONSE" == OK* ]]; then
        echo -e "${GREEN}✓ Chrome started on local machine${NC}"
        echo -e "  Response: ${CYAN}${RESPONSE}${NC}"
        echo ""
        
        # Wait for debug connection
        echo -e "${YELLOW}Waiting for debug connection...${NC}"
        sleep 2
        
        if curl -s --connect-timeout 2 "http://127.0.0.1:${DEBUG_PORT}/json/version" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ DevTools MCP is ready!${NC}"
            $0 --status
        else
            echo -e "${YELLOW}⚠ Chrome started but debug port not yet accessible${NC}"
            echo -e "  Make sure SSH tunnel includes: ${CYAN}-R ${DEBUG_PORT}:localhost:${DEBUG_PORT}${NC}"
        fi
    else
        echo -e "${RED}✗ Failed to start Chrome${NC}"
        echo -e "  Response: ${RESPONSE}"
        exit 1
    fi
    exit 0
fi

# Stop remote Chrome via listener
if [ "$APP_URL" = "--stop-remote" ]; then
    LISTENER_PORT="${CHROME_LISTENER_PORT:-9221}"
    
    echo -e "${BLUE}Stopping remote Chrome via listener...${NC}"
    
    if ! nc -z 127.0.0.1 "$LISTENER_PORT" 2>/dev/null; then
        echo -e "${RED}✗ Cannot connect to listener on port ${LISTENER_PORT}${NC}"
        exit 1
    fi
    
    RESPONSE=$(echo "STOP" | nc -w 5 127.0.0.1 "$LISTENER_PORT" 2>/dev/null || echo "ERROR:Timeout")
    
    if [[ "$RESPONSE" == OK* ]]; then
        echo -e "${GREEN}✓ Chrome stopped${NC}"
    else
        echo -e "${RED}✗ Failed to stop Chrome: ${RESPONSE}${NC}"
        exit 1
    fi
    exit 0
fi

# Check status if requested
if [ "$APP_URL" = "--status" ]; then
    echo -e "${BLUE}Checking Chrome debug status...${NC}"
    echo ""
    
    # First, try to connect to Chrome debug endpoint (works for both local and remote)
    RESPONSE=$(curl -s --connect-timeout 2 "http://127.0.0.1:${DEBUG_PORT}/json/version" 2>/dev/null || echo "")
    
    if [ -n "$RESPONSE" ]; then
        # Parse Chrome info
        BROWSER=$(echo "$RESPONSE" | grep -o '"Browser":"[^"]*"' | cut -d'"' -f4 || echo "Unknown")
        
        echo -e "${GREEN}✓ Chrome debug is connected${NC}"
        echo -e "  Browser: ${YELLOW}${BROWSER}${NC}"
        echo -e "  Port: ${YELLOW}${DEBUG_PORT}${NC}"
        echo -e "  Debug URL: ${YELLOW}http://127.0.0.1:${DEBUG_PORT}${NC}"
        
        # Check if it's local or remote
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if ps -p "$PID" > /dev/null 2>&1; then
                echo -e "  Mode: ${CYAN}Local${NC} (PID: ${PID})"
            else
                echo -e "  Mode: ${CYAN}Remote${NC} (via SSH tunnel)"
                rm -f "$PID_FILE"
            fi
        elif lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            PORT_PID=$(lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t | head -n 1)
            PROC_NAME=$(ps -p "$PORT_PID" -o comm= 2>/dev/null || echo "unknown")
            if [[ "$PROC_NAME" == *"ssh"* ]]; then
                echo -e "  Mode: ${CYAN}Remote${NC} (via SSH tunnel, PID: ${PORT_PID})"
            else
                echo -e "  Mode: ${CYAN}Local${NC} (external process, PID: ${PORT_PID})"
            fi
        else
            echo -e "  Mode: ${CYAN}Remote${NC} (via SSH tunnel)"
        fi
        
        # List open pages
        echo ""
        echo -e "${YELLOW}Open pages:${NC}"
        PAGES=$(curl -s "http://127.0.0.1:${DEBUG_PORT}/json/list" 2>/dev/null || echo "[]")
        PAGE_COUNT=$(echo "$PAGES" | grep -c '"title"' || echo "0")
        echo "$PAGES" | grep -o '"title":"[^"]*"' | cut -d'"' -f4 | head -5 | while read -r title; do
            echo -e "  • $title"
        done
        if [ "$PAGE_COUNT" -gt 5 ]; then
            echo -e "  ... and $((PAGE_COUNT - 5)) more"
        fi
        
        exit 0
    fi
    
    # No connection - check for local processes
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠ Local Chrome process exists but not responding${NC}"
            echo -e "  PID: ${YELLOW}${PID}${NC}"
            echo -e "  Try restarting Chrome"
            exit 1
        else
            echo -e "${YELLOW}⚠ PID file exists but process is not running${NC}"
            echo -e "  Removing stale PID file..."
            rm -f "$PID_FILE"
        fi
    fi
    
    # Check if port is in use by another process (e.g., SSH tunnel waiting)
    if lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        PORT_PID=$(lsof -Pi :"${DEBUG_PORT}" -sTCP:LISTEN -t | head -n 1)
        PROC_NAME=$(ps -p "$PORT_PID" -o comm= 2>/dev/null || echo "unknown")
        echo -e "${YELLOW}⚠ Port ${DEBUG_PORT} is bound but Chrome not responding${NC}"
        echo -e "  Process: ${YELLOW}${PROC_NAME}${NC} (PID: ${PORT_PID})"
        if [[ "$PROC_NAME" == *"ssh"* ]]; then
            echo -e "  This appears to be an SSH tunnel waiting for Chrome on the other end"
            echo -e ""
            echo -e "  Make sure Chrome is started on your local machine with:"
            echo -e "  ${CYAN}--remote-debugging-port=${DEBUG_PORT}${NC}"
        fi
        exit 1
    else
        echo -e "${RED}✗ Chrome debug is not running${NC}"
        echo -e "  Port ${DEBUG_PORT} is available"
        echo ""
        echo -e "Options:"
        echo -e "  • Start local Chrome: ${CYAN}$0${NC}"
        echo -e "  • Wait for remote:    ${CYAN}$0 --remote${NC}"
        echo -e "  • Setup instructions: ${CYAN}$0 --remote-instructions${NC}"
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
