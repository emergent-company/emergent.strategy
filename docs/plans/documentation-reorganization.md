# Documentation Reorganization Plan

**Current State**: 273+ markdown files in `/docs` root  
**Problem**: Difficult to navigate and find relevant documentation  
**Goal**: Organize into logical, browsable subdirectories  
**Date**: October 31, 2025

---

## Current Structure Analysis

### Existing Directories (Keep & Enhance)
```
docs/
├── architecture/      ✅ System architecture diagrams
├── archive/           ✅ Historical/outdated docs  
├── extraction/        ✅ Extraction-specific docs
├── features/          ✅ Feature documentation (need sub-organization)
├── fixes/             ✅ Bug fixes and resolutions
├── guides/            ✅ How-to guides
├── internal/          ✅ Internal documentation
├── migrations/        ✅ Database migration files
├── orchestration/     ✅ Workspace/PM2 docs
├── plans/             ✅ Implementation plans (just created!)
├── setup/             ✅ Setup and configuration guides
├── spec/              ✅ Technical specifications
├── technical/         ✅ Technical deep dives
└── wireframes/        ✅ Design wireframes
```

### Documents in Root (273 files to organize)

**Category Breakdown**:
- Chat/MCP: 44 files
- ClickUp: 19 files
- Extraction: 37 files
- Testing: 47 files
- Monitoring: 20 files
- Discovery: 14 files
- Auth: 12 files
- Database/Schema: 27 files
- Fixes/Bugs: 69 files
- UI/UX: 42 files

---

## Proposed New Structure

```
docs/
├── plans/                          ← Implementation plans & roadmaps
│   ├── vertex-ai-cleanup.md        ✅ Already here
│   ├── coolify-deployment.md       ← Move from docs/
│   ├── langfuse-integration.md     ← Move from docs/
│   └── *.PLAN.md, *.ROADMAP.md     ← Move all plans
│
├── features/                       ← Feature documentation (sub-organized)
│   ├── auth/                       ← Authentication & authorization
│   ├── chat/                       ← Chat system docs
│   ├── discovery/                  ← Auto-discovery feature
│   ├── extraction/                 ← Extraction features
│   ├── monitoring/                 ← System monitoring
│   └── *.COMPLETE.md               ← Feature completion docs
│
├── integrations/                   ← Third-party integrations
│   ├── clickup/                    ← ClickUp integration (19 files)
│   ├── mcp/                        ← Model Context Protocol (16 files)
│   └── langfuse/                   ← Future: Langfuse integration
│
├── testing/                        ← Test documentation
│   ├── e2e/                        ← E2E test docs
│   ├── coverage/                   ← Test coverage reports
│   └── *.TEST*.md                  ← All test-related docs
│
├── fixes/                          ← Bug fixes & issue resolutions
│   ├── schema/                     ← Database schema fixes
│   ├── performance/                ← Performance issue fixes
│   └── *.FIX.md, *.ISSUE.md        ← All fix documentation
│
├── ui-ux/                          ← Frontend & UX documentation
│   ├── components/                 ← Component-specific docs
│   ├── wizards/                    ← Wizard flows
│   └── *.UX.md, DATATABLE_*.md     ← UI/UX docs
│
├── deployment/                     ← Deployment & infrastructure
│   ├── coolify/                    ← Coolify-specific docs
│   ├── docker/                     ← Docker configuration docs
│   └── PORTS.md, PM2_*.md          ← Infrastructure docs
│
├── technical/                      ← Technical architecture (enhance)
│   ├── database/                   ← Database architecture
│   ├── migrations/                 ← Migration documentation
│   └── MCP_CHAT_ARCHITECTURE.md    ← Keep here
│
├── guides/                         ← How-to guides (enhance)
│   ├── development/                ← Development guides
│   ├── operations/                 ← Operational guides
│   └── BUILD_*.md, *_CHECKLIST.md  ← Move checklists here
│
├── setup/                          ✅ Keep as-is
├── spec/                           ✅ Keep as-is
├── orchestration/                  ✅ Keep as-is
├── extraction/                     ✅ Keep as-is
├── architecture/                   ✅ Keep as-is
├── archive/                        ✅ Expand with old docs
└── wireframes/                     ✅ Keep as-is
```

---

## Detailed Reorganization Plan

### Step 1: Create New Directories

```bash
mkdir -p docs/plans
mkdir -p docs/fixes/{schema,performance,ui,integration}
mkdir -p docs/testing/{e2e,coverage,unit}
mkdir -p docs/integrations/{clickup,mcp,langfuse}
mkdir -p docs/ui-ux/{components,wizards,design}
mkdir -p docs/deployment/{coolify,docker}
mkdir -p docs/features/{auth,chat,discovery,extraction,monitoring,graph}
mkdir -p docs/technical/{database,migrations,config}
mkdir -p docs/guides/{development,operations}
```

### Step 2: Move Plans & Roadmaps

**Target**: `docs/plans/`

```bash
# Already there:
- vertex-ai-cleanup.md

# Move from docs/:
mv docs/COOLIFY_DEPLOYMENT_PLAN.md docs/plans/coolify-deployment.md
mv docs/langfuse_integration_plan.md docs/plans/langfuse-integration.md
mv docs/MONITORING_PHASE2_PLAN.md docs/plans/monitoring-phase2.md
mv docs/AUTO_DISCOVERY_TESTING_PLAN.md docs/plans/auto-discovery-testing.md
mv docs/ORG_IDENTIFIER_CLEANUP_PLAN.md docs/plans/org-identifier-cleanup.md
mv docs/CLICKUP_IMPORT_REFACTOR_PLAN.md docs/plans/clickup-import-refactor.md

# Move from root:
mv COOLIFY_DEPLOYMENT_READY.md docs/deployment/coolify/deployment-ready.md
```

### Step 3: Move Feature Documentation

**Target**: `docs/features/` with subdirectories

```bash
# Auth
mkdir -p docs/features/auth
mv docs/AUTH_*.md docs/features/auth/

# Chat
mkdir -p docs/features/chat
mv docs/CHAT_OBJECT_CARDS_INTEGRATION_COMPLETE.md docs/features/chat/
mv docs/CHAT_PROMPT_*.md docs/features/chat/
mv docs/CHAT_GRAPH_SEARCH_*.md docs/features/chat/

# Discovery
mkdir -p docs/features/discovery
mv docs/AUTO_DISCOVERY_*.md docs/features/discovery/
mv docs/DISCOVERY_*.md docs/features/discovery/

# Extraction
mkdir -p docs/features/extraction
mv docs/EXTRACTION_*.md docs/features/extraction/
mv docs/AUTO_EXTRACTION_*.md docs/features/extraction/
mv docs/CITATION_*.md docs/features/extraction/

# Monitoring
mkdir -p docs/features/monitoring
mv docs/MONITORING_*.md docs/features/monitoring/
mv docs/COST_*.md docs/features/monitoring/
mv docs/SYSTEM_MONITORING_*.md docs/features/monitoring/

# Graph
mkdir -p docs/features/graph
mv docs/GRAPH_*.md docs/features/graph/
mv docs/TAGGING_SYSTEM_*.md docs/features/graph/
```

### Step 4: Move Integration Documentation

**Target**: `docs/integrations/`

```bash
# ClickUp (19 files)
mkdir -p docs/integrations/clickup
mv docs/CLICKUP_*.md docs/integrations/clickup/

# MCP (non-architecture)
mkdir -p docs/integrations/mcp
mv docs/MCP_CHAT_DATA_QUERIES*.md docs/integrations/mcp/
mv docs/MCP_CHAT_DIAGRAMS.md docs/integrations/mcp/
mv docs/MCP_CHAT_INTEGRATION*.md docs/integrations/mcp/
mv docs/MCP_COPILOT*.md docs/integrations/mcp/
mv docs/MCP_INSPECTOR*.md docs/integrations/mcp/
mv docs/MCP_LLM*.md docs/integrations/mcp/

# Keep in technical/:
# - MCP_CHAT_ARCHITECTURE.md (technical architecture)
# - mcp-schema-caching-and-changes.md (technical)
# - mcp-server-implementation.md (technical)
```

### Step 5: Move Testing Documentation

**Target**: `docs/testing/`

```bash
mkdir -p docs/testing/{e2e,coverage,guides}

# E2E tests
mv docs/E2E_*.md docs/testing/e2e/
mv docs/*_E2E*.md docs/testing/e2e/

# Test organization
mv docs/TEST_ORGANIZATION*.md docs/testing/
mv docs/TEST_CLEANUP*.md docs/testing/
mv docs/TEST_COVERAGE*.md docs/testing/coverage/
mv docs/TEST_FIXING*.md docs/testing/

# Testing guides
mv docs/*_TESTING_GUIDE.md docs/testing/guides/
mv docs/*_TESTING_PLAN.md docs/testing/guides/
mv docs/*_TESTING_STATUS.md docs/testing/

# Test comparison
mv docs/ADMIN_VS_API_TEST_COMPARISON.md docs/testing/
mv docs/ADMIN_COMPONENT_TESTING*.md docs/testing/

# Remaining TEST_* files
mv docs/TEST_*.md docs/testing/
mv docs/REMAINING_TEST*.md docs/testing/
mv docs/SERVER_TEST*.md docs/testing/
```

### Step 6: Move Fix Documentation

**Target**: `docs/fixes/`

```bash
mkdir -p docs/fixes/{schema,performance,ui,integration,config}

# Schema fixes
mv docs/SCHEMA_*_FIX*.md docs/fixes/schema/
mv docs/SCHEMA_COMPARISON*.md docs/fixes/schema/
mv docs/SCHEMA_CONSISTENCY*.md docs/fixes/schema/
mv docs/CRITICAL_SCHEMA*.md docs/fixes/schema/

# Performance fixes
mv docs/*_HANG_FIX.md docs/fixes/performance/
mv docs/BULK_UPDATE*.md docs/fixes/performance/

# UI fixes
mv docs/DATATABLE_*_FIX*.md docs/fixes/ui/
mv docs/DROPDOWN_*_FIX*.md docs/fixes/ui/
mv docs/CHAT_MARKDOWN_*_FIX*.md docs/fixes/ui/
mv docs/VITE_CACHE*.md docs/fixes/ui/

# Integration fixes
mv docs/CLICKUP_*_FIX*.md docs/fixes/integration/
mv docs/CLICKUP_*_BUG*.md docs/fixes/integration/

# Config fixes
mv docs/ENV_FALLBACK*.md docs/fixes/config/
mv docs/CONFIG_*.md docs/fixes/config/

# All other fixes
mv docs/*_FIX.md docs/fixes/
mv docs/*_ISSUE.md docs/fixes/
mv docs/*_RESOLUTION.md docs/fixes/
```

### Step 7: Move UI/UX Documentation

**Target**: `docs/ui-ux/`

```bash
mkdir -p docs/ui-ux/{components,wizards,design}

# Wizards
mv docs/DISCOVERY_WIZARD_*.md docs/ui-ux/wizards/

# Components
mv docs/DATATABLE_*.md docs/ui-ux/components/
mv docs/TEMPLATE_PACK*.md docs/ui-ux/components/

# UX/Design
mv docs/*_UX.md docs/ui-ux/design/
mv docs/*_VISUAL*.md docs/ui-ux/design/
mv docs/CHAT_MARKDOWN_RENDERING.md docs/ui-ux/design/
mv docs/DOCUMENT_UPLOAD_UX*.md docs/ui-ux/design/
mv docs/EXTRACTION_STATUS_INDICATOR.md docs/ui-ux/design/
mv docs/SSE_PROGRESS*.md docs/ui-ux/design/
```

### Step 8: Move Deployment Documentation

**Target**: `docs/deployment/`

```bash
mkdir -p docs/deployment/{coolify,docker,infrastructure}

# Coolify
mv ../COOLIFY_DEPLOYMENT_READY.md docs/deployment/coolify/
mv docs/COOLIFY_*.md docs/deployment/coolify/

# Infrastructure
mv docs/PORTS.md docs/deployment/infrastructure/
mv docs/PM2_*.md docs/deployment/infrastructure/
```

### Step 9: Move Technical Documentation

**Target**: `docs/technical/`

```bash
mkdir -p docs/technical/{database,config}

# Database
mv docs/DATABASE_*.md docs/technical/database/
mv docs/SCHEMA_*.md docs/technical/database/
mv docs/RLS_*.md docs/technical/database/

# Config
mv docs/ENV_*.md docs/technical/config/
mv docs/ORG*_STANDARDIZATION*.md docs/technical/config/
```

### Step 10: Move Guides

**Target**: `docs/guides/`

```bash
mkdir -p docs/guides/{development,operations}

# Development guides
mv docs/BUILD_*.md docs/guides/development/
mv docs/*_CHECKLIST.md docs/guides/development/
mv docs/DEBUG_*.md docs/guides/development/

# Operational guides  
mv docs/*_GUIDE.md docs/guides/operations/
mv docs/MCP_INSPECTOR_QUICKSTART.md docs/guides/operations/
```

---

## Final Structure

```
docs/
├── plans/                                    [~10 files]
│   ├── vertex-ai-cleanup.md
│   ├── coolify-deployment.md
│   ├── langfuse-integration.md
│   ├── monitoring-phase2.md
│   └── ...implementation plans
│
├── features/                                 [~100 files, organized]
│   ├── auth/                                 [~5 files]
│   │   ├── AUTH_IMPLEMENTATION_SUMMARY.md
│   │   └── AUTH_ENHANCEMENT_ROADMAP.md
│   ├── chat/                                 [~25 files]
│   │   ├── CHAT_OBJECT_CARDS_*.md
│   │   ├── CHAT_PROMPT_*.md
│   │   └── CHAT_GRAPH_SEARCH_*.md
│   ├── discovery/                            [~10 files]
│   │   ├── AUTO_DISCOVERY_*.md
│   │   └── DISCOVERY_*.md
│   ├── extraction/                           [~15 files]
│   │   ├── EXTRACTION_*.md
│   │   └── AUTO_EXTRACTION_*.md
│   ├── monitoring/                           [~15 files]
│   │   ├── MONITORING_*.md
│   │   └── COST_*.md
│   └── graph/                                [~5 files]
│       ├── GRAPH_*.md
│       └── TAGGING_SYSTEM_*.md
│
├── integrations/                             [~35 files]
│   ├── clickup/                              [~19 files]
│   │   ├── CLICKUP_INTEGRATION_COMPLETE.md
│   │   ├── CLICKUP_DOCS_IMPLEMENTATION.md
│   │   ├── CLICKUP_E2E_TESTS.md
│   │   └── ...all CLICKUP_*.md
│   ├── mcp/                                  [~16 files]
│   │   ├── MCP_CHAT_INTEGRATION*.md
│   │   ├── MCP_COPILOT_INTEGRATION.md
│   │   ├── MCP_INSPECTOR_QUICKSTART.md
│   │   └── ...all MCP_*.md (non-architecture)
│   └── README.md                             ← Overview of integrations
│
├── testing/                                  [~47 files]
│   ├── e2e/                                  [~10 files]
│   │   ├── E2E_*.md
│   │   └── *_E2E*.md
│   ├── coverage/                             [~3 files]
│   │   └── TEST_COVERAGE_*.md
│   ├── guides/                               [~5 files]
│   │   └── *_TESTING_GUIDE.md
│   ├── TEST_ORGANIZATION*.md
│   ├── TEST_CLEANUP*.md
│   └── ...all TEST_*.md
│
├── fixes/                                    [~69 files, organized]
│   ├── schema/                               [~15 files]
│   │   ├── SCHEMA_*_FIX*.md
│   │   ├── SCHEMA_CONSISTENCY*.md
│   │   └── CRITICAL_SCHEMA*.md
│   ├── performance/                          [~10 files]
│   │   ├── *_HANG_FIX.md
│   │   └── BULK_UPDATE*.md
│   ├── ui/                                   [~15 files]
│   │   ├── DATATABLE_*_FIX*.md
│   │   ├── DROPDOWN_*_FIX*.md
│   │   └── VITE_CACHE*.md
│   ├── integration/                          [~10 files]
│   │   ├── CLICKUP_*_FIX*.md
│   │   └── CLICKUP_*_BUG*.md
│   ├── config/                               [~5 files]
│   │   ├── ENV_FALLBACK*.md
│   │   └── CONFIG_*.md
│   └── ...other *_FIX.md
│
├── ui-ux/                                    [~42 files]
│   ├── components/                           [~20 files]
│   │   ├── DATATABLE_*.md
│   │   ├── TEMPLATE_PACK*.md
│   │   └── component docs
│   ├── wizards/                              [~8 files]
│   │   ├── DISCOVERY_WIZARD_*.md
│   │   └── wizard flows
│   ├── design/                               [~14 files]
│   │   ├── *_UX.md
│   │   ├── *_VISUAL*.md
│   │   └── design docs
│   └── README.md                             ← UI/UX overview
│
├── deployment/                               [~10 files]
│   ├── coolify/                              [~5 files]
│   │   ├── deployment-ready.md               ← From root COOLIFY_DEPLOYMENT_READY.md
│   │   └── COOLIFY_*.md
│   ├── infrastructure/                       [~5 files]
│   │   ├── PORTS.md
│   │   └── PM2_*.md
│   └── README.md                             ← Deployment overview
│
├── technical/                                [enhance existing]
│   ├── database/                             [~15 files]
│   │   ├── DATABASE_*.md
│   │   ├── RLS_*.md
│   │   └── migration docs
│   ├── config/                               [~8 files]
│   │   ├── ENV_*.md
│   │   └── ORG*_STANDARDIZATION*.md
│   └── MCP_CHAT_ARCHITECTURE.md              ← Keep here
│
├── guides/                                   [enhance existing]
│   ├── development/                          [~5 files]
│   │   ├── BUILD_AND_LINT_CHECKLIST.md
│   │   └── DEBUG_*.md
│   └── operations/                           [~3 files]
│       └── operational guides
│
└── archive/                                  [expand with old docs]
    ├── sessions/                             ← OLD session summaries
    │   ├── TEST_CLEANUP_SESSION*.md
    │   ├── SCHEMA_FIX_SESSION*.md
    │   └── ...SESSION_*.md
    └── deprecated/                           ← Deprecated features
        └── old feature docs
```

---

## Implementation Script

```bash
#!/bin/bash
# Documentation reorganization script
# Run from repository root

set -e

BASE="/Users/mcj/code/spec-server-2/docs"
cd "$BASE"

echo "🗂️  Reorganizing documentation..."
echo ""

# Create all new directories
echo "📁 Creating directories..."
mkdir -p plans
mkdir -p fixes/{schema,performance,ui,integration,config}
mkdir -p testing/{e2e,coverage,unit,guides}
mkdir -p integrations/{clickup,mcp}
mkdir -p ui-ux/{components,wizards,design}
mkdir -p deployment/{coolify,infrastructure}
mkdir -p features/{auth,chat,discovery,extraction,monitoring,graph}
mkdir -p technical/{database,config}
mkdir -p guides/{development,operations}
mkdir -p archive/{sessions,deprecated}

echo "✅ Directories created"
echo ""

# Move PLANS
echo "📋 Moving plans..."
mv COOLIFY_DEPLOYMENT_PLAN.md plans/coolify-deployment.md 2>/dev/null
mv langfuse_integration_plan.md plans/langfuse-integration.md 2>/dev/null
mv MONITORING_PHASE2_PLAN.md plans/monitoring-phase2.md 2>/dev/null
mv AUTO_DISCOVERY_TESTING_PLAN.md plans/auto-discovery-testing.md 2>/dev/null
mv ORG_IDENTIFIER_CLEANUP_PLAN.md plans/org-identifier-cleanup.md 2>/dev/null
mv CLICKUP_IMPORT_REFACTOR_PLAN.md plans/clickup-import-refactor.md 2>/dev/null
mv *_PLAN.md plans/ 2>/dev/null
mv *_ROADMAP.md plans/ 2>/dev/null

# Move from root
mv ../COOLIFY_DEPLOYMENT_READY.md deployment/coolify/deployment-ready.md 2>/dev/null

echo "✅ Plans moved"
echo ""

# Move INTEGRATIONS
echo "🔌 Moving integrations..."
mv CLICKUP_*.md integrations/clickup/ 2>/dev/null
mv MCP_CHAT_DATA*.md integrations/mcp/ 2>/dev/null
mv MCP_CHAT_DIAGRAMS.md integrations/mcp/ 2>/dev/null
mv MCP_CHAT_INTEGRATION*.md integrations/mcp/ 2>/dev/null
mv MCP_COPILOT*.md integrations/mcp/ 2>/dev/null
mv MCP_INSPECTOR*.md integrations/mcp/ 2>/dev/null
mv MCP_LLM*.md integrations/mcp/ 2>/dev/null

echo "✅ Integrations moved"
echo ""

# Move FEATURES
echo "✨ Moving features..."
mv AUTH_*.md features/auth/ 2>/dev/null
mv AUTO_DISCOVERY_*.md features/discovery/ 2>/dev/null
mv AUTO_EXTRACTION_*.md features/extraction/ 2>/dev/null
mv EXTRACTION_*.md features/extraction/ 2>/dev/null
mv CITATION_*.md features/extraction/ 2>/dev/null
mv MONITORING_*.md features/monitoring/ 2>/dev/null
mv COST_*.md features/monitoring/ 2>/dev/null
mv SYSTEM_MONITORING*.md features/monitoring/ 2>/dev/null
mv GRAPH_*.md features/graph/ 2>/dev/null
mv TAGGING_*.md features/graph/ 2>/dev/null
mv CHAT_OBJECT_CARDS*.md features/chat/ 2>/dev/null
mv CHAT_PROMPT*.md features/chat/ 2>/dev/null
mv CHAT_GRAPH_SEARCH*.md features/chat/ 2>/dev/null
mv DISCOVERY_*.md features/discovery/ 2>/dev/null

echo "✅ Features moved"
echo ""

# Move TESTING
echo "🧪 Moving testing docs..."
mv E2E_*.md testing/e2e/ 2>/dev/null
mv *_E2E*.md testing/e2e/ 2>/dev/null
mv TEST_COVERAGE*.md testing/coverage/ 2>/dev/null
mv *_TESTING_GUIDE.md testing/guides/ 2>/dev/null
mv *_TESTING_PLAN.md testing/guides/ 2>/dev/null
mv *_TESTING_STATUS.md testing/ 2>/dev/null
mv TEST_*.md testing/ 2>/dev/null
mv ADMIN_COMPONENT_TESTING*.md testing/ 2>/dev/null
mv ADMIN_VS_API_TEST*.md testing/ 2>/dev/null
mv REMAINING_TEST*.md testing/ 2>/dev/null
mv SERVER_TEST*.md testing/ 2>/dev/null

echo "✅ Testing docs moved"
echo ""

# Move FIXES
echo "🔧 Moving fixes..."
mv SCHEMA_*_FIX*.md fixes/schema/ 2>/dev/null
mv SCHEMA_COMPARISON*.md fixes/schema/ 2>/dev/null
mv SCHEMA_CONSISTENCY*.md fixes/schema/ 2>/dev/null
mv CRITICAL_SCHEMA*.md fixes/schema/ 2>/dev/null
mv *_HANG_FIX.md fixes/performance/ 2>/dev/null
mv BULK_UPDATE*.md fixes/performance/ 2>/dev/null
mv DATATABLE_*FIX*.md fixes/ui/ 2>/dev/null
mv DROPDOWN_*FIX*.md fixes/ui/ 2>/dev/null
mv CHAT_MARKDOWN_*FIX*.md fixes/ui/ 2>/dev/null
mv VITE_CACHE*.md fixes/ui/ 2>/dev/null
mv ENV_FALLBACK*.md fixes/config/ 2>/dev/null
mv *_FIX.md fixes/ 2>/dev/null
mv *_ISSUE.md fixes/ 2>/dev/null
mv *_RESOLUTION.md fixes/ 2>/dev/null

echo "✅ Fixes moved"
echo ""

# Move UI/UX
echo "🎨 Moving UI/UX docs..."
mv DISCOVERY_WIZARD_*.md ui-ux/wizards/ 2>/dev/null
mv DATATABLE_*.md ui-ux/components/ 2>/dev/null
mv TEMPLATE_PACK*.md ui-ux/components/ 2>/dev/null
mv *_UX.md ui-ux/design/ 2>/dev/null
mv *_VISUAL*.md ui-ux/design/ 2>/dev/null
mv CHAT_MARKDOWN_RENDERING.md ui-ux/design/ 2>/dev/null
mv DOCUMENT_UPLOAD_UX*.md ui-ux/design/ 2>/dev/null
mv EXTRACTION_STATUS_INDICATOR.md ui-ux/design/ 2>/dev/null
mv SSE_PROGRESS*.md ui-ux/design/ 2>/dev/null
mv MONITORING_DASHBOARD*.md ui-ux/components/ 2>/dev/null

echo "✅ UI/UX docs moved"
echo ""

# Move DEPLOYMENT
echo "🚀 Moving deployment docs..."
mv PORTS.md deployment/infrastructure/ 2>/dev/null
mv PM2_*.md deployment/infrastructure/ 2>/dev/null

echo "✅ Deployment docs moved"
echo ""

# Move TECHNICAL
echo "🔬 Moving technical docs..."
mv DATABASE_*.md technical/database/ 2>/dev/null
mv RLS_*.md technical/database/ 2>/dev/null
mv ORG*_STANDARDIZATION*.md technical/config/ 2>/dev/null

echo "✅ Technical docs moved"
echo ""

# Move GUIDES
echo "📖 Moving guides..."
mv BUILD_*.md guides/development/ 2>/dev/null
mv DEBUG_*.md guides/development/ 2>/dev/null
mv *_CHECKLIST.md guides/development/ 2>/dev/null

echo "✅ Guides moved"
echo ""

# Move old session docs to archive
echo "📦 Archiving old session docs..."
mv *_SESSION_*.md archive/sessions/ 2>/dev/null
mv SCHEMA_FIX_SESSION*.md archive/sessions/ 2>/dev/null

echo "✅ Session docs archived"
echo ""

# Create README files for new directories
echo "📝 Creating README files..."

cat > plans/README.md << 'PLANS_EOF'
# Implementation Plans

This directory contains implementation plans, roadmaps, and future feature planning documents.

## Active Plans
- See individual plan documents for status and implementation details

## Completed Plans
- Completed plans are moved to archive/ when implementation is done
PLANS_EOF

cat > integrations/README.md << 'INT_EOF'
# Third-Party Integrations

This directory contains documentation for all third-party service integrations.

## Available Integrations
- **clickup/** - ClickUp project management integration
- **mcp/** - Model Context Protocol integration
- **langfuse/** - Langfuse observability (planned)
INT_EOF

cat > testing/README.md << 'TEST_EOF'
# Testing Documentation

This directory contains all test-related documentation.

## Structure
- **e2e/** - End-to-end test documentation
- **coverage/** - Test coverage reports
- **guides/** - Testing guides and best practices
- **TEST_*.md** - Test organization and strategy docs
TEST_EOF

cat > fixes/README.md << 'FIXES_EOF'
# Bug Fixes & Issue Resolutions

This directory contains documentation for bug fixes and issue resolutions.

## Categories
- **schema/** - Database schema fixes
- **performance/** - Performance issue fixes
- **ui/** - User interface fixes
- **integration/** - Integration fixes
- **config/** - Configuration fixes
FIXES_EOF

cat > ui-ux/README.md << 'UX_EOF'
# UI/UX Documentation

This directory contains frontend, user interface, and user experience documentation.

## Structure
- **components/** - Component-specific documentation
- **wizards/** - Wizard flows and interactions
- **design/** - Visual design and UX patterns
UX_EOF

cat > deployment/README.md << 'DEPLOY_EOF'
# Deployment Documentation

This directory contains deployment, infrastructure, and operations documentation.

## Structure
- **coolify/** - Coolify deployment documentation
- **infrastructure/** - Infrastructure configuration (ports, PM2, etc.)
DEPLOY_EOF

echo "✅ README files created"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Documentation Reorganization Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Statistics:"
echo "   Plans:        $(find plans -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Features:     $(find features -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Integrations: $(find integrations -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Testing:      $(find testing -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Fixes:        $(find fixes -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   UI/UX:        $(find ui-ux -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Deployment:   $(find deployment -name "*.md" -type f 2>/dev/null | wc -l) files"
echo "   Remaining:    $(ls -1 *.md 2>/dev/null | wc -l) files in root"
echo ""
echo "✨ All documentation organized!"
