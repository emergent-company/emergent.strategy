#!/bin/bash

# Verification script for MCP Dev Manager
# Run this to verify everything is set up correctly

echo "🔍 MCP Dev Manager - Setup Verification"
echo "========================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this from mcp-dev-manager directory."
    exit 1
fi

echo "✅ In correct directory: $(pwd)"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "❌ node_modules not found. Running npm install..."
    npm install
else
    echo "✅ Dependencies installed"
fi
echo ""

# Check if project is built
if [ ! -f "dist/index.js" ]; then
    echo "❌ dist/index.js not found. Running npm run build..."
    npm run build
else
    echo "✅ Project built successfully"
fi
echo ""

# Check if dist/index.js is executable
if [ -x "dist/index.js" ]; then
    echo "✅ dist/index.js is executable"
else
    echo "⚠️  Making dist/index.js executable..."
    chmod +x dist/index.js
    echo "✅ dist/index.js is now executable"
fi
echo ""

# Check git status
echo "📦 Git Status:"
git log --oneline -1 2>/dev/null || echo "⚠️  Not a git repository"
echo ""

# Check PROJECT_ROOT environment variable
if [ -z "$PROJECT_ROOT" ]; then
    echo "⚠️  PROJECT_ROOT environment variable not set"
    echo "   This is normal - it will be set by Claude Desktop"
else
    echo "✅ PROJECT_ROOT is set to: $PROJECT_ROOT"
fi
echo ""

# Show file structure
echo "📁 File Structure:"
echo ""
find . -type f -not -path './node_modules/*' -not -path './dist/*' -not -path './.git/*' | sort | sed 's|^\./|  |'
echo ""

# Show next steps
echo "✨ Setup Complete!"
echo ""
echo "Next Steps:"
echo "1. Configure Claude Desktop:"
echo "   File: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo ""
echo "2. Add this configuration:"
echo "   {"
echo "     \"mcpServers\": {"
echo "       \"dev-manager\": {"
echo "         \"command\": \"node\","
echo "         \"args\": [\"$(pwd)/dist/index.js\"],"
echo "         \"env\": {"
echo "           \"PROJECT_ROOT\": \"$(dirname $(pwd))\""
echo "         }"
echo "       }"
echo "     }"
echo "   }"
echo ""
echo "3. Restart Claude Desktop completely"
echo ""
echo "4. Test in Claude:"
echo "   - 'Check the status of all development services'"
echo "   - 'List all available log files'"
echo "   - 'Run the playwright tests'"
echo ""
echo "📚 Documentation:"
echo "   - README.md          : Main documentation"
echo "   - SETUP.md           : Detailed setup instructions"
echo "   - EXAMPLES.md        : Usage examples"
echo "   - PROJECT_SUMMARY.md : Complete project overview"
echo ""
