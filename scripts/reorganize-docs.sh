#!/bin/bash
# Documentation Reorganization Script
# Organizes 273+ docs from docs/ root into logical subdirectories

set -e

BASE="/Users/mcj/code/spec-server-2/docs"
ROOT="/Users/mcj/code/spec-server-2"

cd "$BASE"

echo "🗂️  Documentation Reorganization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Current state:"
echo "   Files in docs root: $(ls -1 *.md 2>/dev/null | wc -l)"
echo ""

# Confirm action
read -p "🤔 Reorganize documentation? This will move ~250+ files. (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Reorganization cancelled"
    exit 0
fi

echo ""
echo "📁 Creating directory structure..."

# Create all new directories
mkdir -p plans
mkdir -p fixes/{schema,performance,ui,integration,config}
mkdir -p testing/{e2e,coverage,guides}
mkdir -p integrations/{clickup,mcp}
mkdir -p ui-ux/{components,wizards,design}
mkdir -p deployment/infrastructure
mkdir -p features/{auth,chat,discovery,extraction,monitoring,graph}
mkdir -p technical/{database,config}
mkdir -p guides/{development,operations}
mkdir -p archive/{sessions,deprecated}

echo "✅ Directories created"
echo ""

# Move PLANS
echo "📋 Moving plans & roadmaps..."
mv DEPLOYMENT_PLAN.md plans/ 2>/dev/null || true
mv langfuse_integration_plan.md plans/langfuse-integration.md 2>/dev/null || true
mv MONITORING_PHASE2_PLAN.md plans/monitoring-phase2.md 2>/dev/null || true
mv AUTO_DISCOVERY_TESTING_PLAN.md plans/auto-discovery-testing.md 2>/dev/null || true
mv ORG_IDENTIFIER_CLEANUP_PLAN.md plans/org-identifier-cleanup.md 2>/dev/null || true
mv CLICKUP_IMPORT_REFACTOR_PLAN.md plans/clickup-import-refactor.md 2>/dev/null || true
mv *_PLAN.md plans/ 2>/dev/null || true
mv *_ROADMAP.md plans/ 2>/dev/null || true

# Move from root
# (No longer using Coolify, so skip this migration)

echo "✅ Plans moved"
echo ""

# Move INTEGRATIONS
echo "🔌 Moving integrations..."
mv CLICKUP_*.md integrations/clickup/ 2>/dev/null || true
mv MCP_CHAT_DATA*.md integrations/mcp/ 2>/dev/null || true
mv MCP_CHAT_DIAGRAMS.md integrations/mcp/ 2>/dev/null || true
mv MCP_CHAT_INTEGRATION*.md integrations/mcp/ 2>/dev/null || true
mv MCP_COPILOT*.md integrations/mcp/ 2>/dev/null || true
mv MCP_INSPECTOR*.md integrations/mcp/ 2>/dev/null || true
mv MCP_LLM*.md integrations/mcp/ 2>/dev/null || true

echo "✅ Integrations moved"
echo ""

# Move FEATURES (with subdirectories)
echo "✨ Moving features..."
mv AUTH_*.md features/auth/ 2>/dev/null || true
mv AUTO_DISCOVERY_*.md features/discovery/ 2>/dev/null || true
mv DISCOVERY_*.md features/discovery/ 2>/dev/null || true
mv AUTO_EXTRACTION_*.md features/extraction/ 2>/dev/null || true
mv EXTRACTION_*.md features/extraction/ 2>/dev/null || true
mv CITATION_*.md features/extraction/ 2>/dev/null || true
mv MONITORING_*.md features/monitoring/ 2>/dev/null || true
mv COST_*.md features/monitoring/ 2>/dev/null || true
mv SYSTEM_MONITORING*.md features/monitoring/ 2>/dev/null || true
mv GRAPH_*.md features/graph/ 2>/dev/null || true
mv TAGGING_*.md features/graph/ 2>/dev/null || true
mv CHAT_*.md features/chat/ 2>/dev/null || true

echo "✅ Features moved"
echo ""

# Move TESTING
echo "🧪 Moving testing docs..."
mv E2E_*.md testing/e2e/ 2>/dev/null || true
mv *_E2E*.md testing/e2e/ 2>/dev/null || true
mv TEST_COVERAGE*.md testing/coverage/ 2>/dev/null || true
mv *_TESTING_GUIDE.md testing/guides/ 2>/dev/null || true
mv *_TEST_GUIDE.md testing/guides/ 2>/dev/null || true
mv TEST_*.md testing/ 2>/dev/null || true
mv ADMIN_*.md testing/ 2>/dev/null || true

echo "✅ Testing docs moved"
echo ""

# Move FIXES (with subdirectories)
echo "🔧 Moving fixes..."
mv SCHEMA_*FIX*.md fixes/schema/ 2>/dev/null || true
mv SCHEMA_COMPARISON*.md fixes/schema/ 2>/dev/null || true
mv SCHEMA_CONSISTENCY*.md fixes/schema/ 2>/dev/null || true
mv CRITICAL_SCHEMA*.md fixes/schema/ 2>/dev/null || true
mv *_HANG_FIX.md fixes/performance/ 2>/dev/null || true
mv *HANG*.md fixes/performance/ 2>/dev/null || true
mv BULK_UPDATE*.md fixes/performance/ 2>/dev/null || true
mv DATATABLE_*FIX*.md fixes/ui/ 2>/dev/null || true
mv DROPDOWN_*FIX*.md fixes/ui/ 2>/dev/null || true
mv VITE_*.md fixes/ui/ 2>/dev/null || true
mv ENV_*.md fixes/config/ 2>/dev/null || true
mv *_FIX.md fixes/ 2>/dev/null || true
mv *_ISSUE.md fixes/ 2>/dev/null || true
mv *_RESOLUTION.md fixes/ 2>/dev/null || true

echo "✅ Fixes moved"
echo ""

# Move UI/UX (with subdirectories)
echo "🎨 Moving UI/UX docs..."
mv DATATABLE_*.md ui-ux/components/ 2>/dev/null || true
mv TEMPLATE_PACK*.md ui-ux/components/ 2>/dev/null || true
mv *_UX.md ui-ux/design/ 2>/dev/null || true
mv *_VISUAL*.md ui-ux/design/ 2>/dev/null || true
mv SSE_PROGRESS*.md ui-ux/design/ 2>/dev/null || true
mv DOCUMENT_UPLOAD*.md ui-ux/design/ 2>/dev/null || true

echo "✅ UI/UX docs moved"
echo ""

# Move DEPLOYMENT
echo "🚀 Moving deployment docs..."
mv PORTS.md deployment/infrastructure/ 2>/dev/null || true
mv PM2_*.md deployment/infrastructure/ 2>/dev/null || true

echo "✅ Deployment docs moved"
echo ""

# Move TECHNICAL
echo "🔬 Moving technical docs..."
mv DATABASE_*.md technical/database/ 2>/dev/null || true
mv RLS_*.md technical/database/ 2>/dev/null || true
mv ORG*_STANDARDIZATION*.md technical/config/ 2>/dev/null || true

echo "✅ Technical docs moved"
echo ""

# Move GUIDES
echo "📖 Moving guides..."
mv BUILD_*.md guides/development/ 2>/dev/null || true
mv DEBUG_*.md guides/development/ 2>/dev/null || true
mv *_CHECKLIST.md guides/development/ 2>/dev/null || true
mv *_GUIDE.md guides/operations/ 2>/dev/null || true

echo "✅ Guides moved"
echo ""

# Archive old session docs
echo "📦 Archiving session docs..."
mv *_SESSION_*.md archive/sessions/ 2>/dev/null || true

echo "✅ Sessions archived"
echo ""

# Create README files
echo "📝 Creating README files..."

cat > plans/README.md << 'README_EOF'
# Implementation Plans

Implementation plans, roadmaps, and future feature planning.

## Documents
- Plans are organized by feature/initiative
- Completed plans remain here for reference
- Active plans are updated regularly
README_EOF

cat > integrations/README.md << 'INT_README_EOF'
# Third-Party Integrations

Documentation for all third-party service integrations.

## Integrations
- **clickup/** - ClickUp project management integration
- **mcp/** - Model Context Protocol integration
- **langfuse/** - Langfuse observability (planned)
INT_README_EOF

cat > testing/README.md << 'TEST_README_EOF'
# Testing Documentation

All test-related documentation including E2E tests, coverage reports, and testing guides.

## Structure
- **e2e/** - End-to-end test documentation
- **coverage/** - Test coverage reports
- **guides/** - Testing guides and best practices
TEST_README_EOF

cat > fixes/README.md << 'FIXES_README_EOF'
# Bug Fixes & Issue Resolutions

Documentation for resolved bugs and issues, organized by category.

## Categories
- **schema/** - Database schema fixes
- **performance/** - Performance issue fixes
- **ui/** - User interface fixes
- **integration/** - Integration fixes
- **config/** - Configuration fixes
FIXES_README_EOF

cat > ui-ux/README.md << 'UX_README_EOF'
# UI/UX Documentation

Frontend, user interface, and user experience documentation.

## Structure
- **components/** - Component-specific documentation
- **wizards/** - Wizard flows and interactions
- **design/** - Visual design and UX patterns
UX_README_EOF

cat > deployment/README.md << 'DEPLOY_README_EOF'
# Deployment Documentation

Deployment, infrastructure, and operations documentation.

## Structure
- **infrastructure/** - Infrastructure docs (ports, PM2, Docker)
DEPLOY_README_EOF

echo "✅ README files created"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Documentation Reorganization Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Statistics:"
echo "   Plans:        $(find plans -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Features:     $(find features -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Integrations: $(find integrations -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Testing:      $(find testing -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Fixes:        $(find fixes -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   UI/UX:        $(find ui-ux -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Deployment:   $(find deployment -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Technical:    $(find technical -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Guides:       $(find guides -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Remaining:    $(ls -1 *.md 2>/dev/null | wc -l) files in docs root"
echo ""
echo "✨ All documentation organized!"
