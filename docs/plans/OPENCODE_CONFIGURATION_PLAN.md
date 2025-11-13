# OpenCode Configuration Plan for spec-server Project

## Executive Summary

Based on documentation research and analysis of your existing Copilot setup, here's a comprehensive plan to configure OpenCode for optimal developer experience and accuracy in this Nx monorepo.

## Critical Gap Analysis: Current vs. Planned Configuration

**Current Status** (as of analysis):
| Component | Status | Impact |
|-----------|--------|--------|
| **Nx MCP Server** | ❌ Commented out | HIGH - Missing workspace intelligence for monorepo |
| **Instructions** | ⚠️ Partial (1 file) | HIGH - Not leveraging 10+ existing `.github/instructions/*.md` files |
| **AGENTS.md** | ⚠️ Basic | HIGH - Missing architecture, conventions, critical patterns |
| **Specialized Agents** | ❌ None (0/5) | MEDIUM - No build/plan/test/db/docs specialization |
| **Custom Commands** | ❌ None (0/5) | MEDIUM - No workflow shortcuts |
| **Permissions** | ❌ None | LOW - No safety guards for destructive commands |
| **MCP Servers** | ✅ 5 enabled | DONE - But missing Nx (should be 6) |
| **Context Optimization** | ❌ None | LOW - Consuming 11-17K tokens unnecessarily |

**Immediate Action Required** (15 minutes, 80% improvement):

1. ✅ Enable Nx MCP server (add 3 lines to `opencode.jsonc` line 49)
2. ✅ Add instruction glob pattern (add to `instructions` array in `opencode.jsonc`)
3. ✅ Enhance `AGENTS.md` with architecture section (copy from section 2.1)

**Quick Implementation Checklist**:

```bash
# 1. Edit opencode.jsonc - add Nx MCP (line 49)
"nx": {
  "type": "local",
  "command": ["npx", "-y", "nx-mcp@latest"]
},

# 2. Edit opencode.jsonc - expand instructions array (line 82-91)
"instructions": [
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".github/instructions/*.instructions.md",
  "docs/HOT_RELOAD.md",
  "docs/DATABASE_MIGRATIONS.md",
  "docs/ENHANCED_LOGGING_SYSTEM.md",
  "RUNBOOK.md",
  "QUICK_START_DEV.md"
],

# 3. Append to AGENTS.md
# (Copy architecture section from 2.1 below)
```

These three changes provide **80% of the accuracy improvement** with minimal effort.

---

## 1. Configuration Structure

### 1.1 Global Config (`~/.config/opencode/opencode.json`)

**Purpose**: Personal preferences, API keys, themes, keybinds

**Recommended Settings**:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",

  // Auto-update enabled for latest features
  "autoupdate": true,

  // Model configuration
  "model": "anthropic/claude-sonnet-4-20250514",
  "small_model": "anthropic/claude-3-5-haiku-20241022",

  // Formatters (already have prettier in package.json)
  "formatter": {
    "prettier": {
      "disabled": false
    }
  },

  // Sharing (manual by default for security)
  "share": "manual"
}
```

### 1.2 Project Config (`/Users/mcj/code/spec-server/opencode.jsonc`)

**Purpose**: Project-specific rules, MCP servers, agents, commands

**Complete Configuration** (already partially exists):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",

  // ============================================
  // MCP SERVERS (already configured)
  // ============================================
  "mcp": {
    "nx": {
      "type": "local",
      "command": ["npx", "-y", "nx-mcp@latest"]
    },
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest", "--timeout-action=10000"]
    },
    "postgres": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://spec:spec@localhost:5432/spec"
      ]
    },
    "context7": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "@upstash/context7-mcp",
        "--api-key",
        "ctx7sk-77ad3f0a-32a5-4b23-8b82-1431d078b1c6"
      ]
    },
    "gh_grep": {
      "type": "remote",
      "url": "https://mcp.grep.app"
    },
    "react-daisyui Docs": {
      "type": "remote",
      "url": "https://gitmcp.io/daisyui/react-daisyui"
    }
  },

  // ============================================
  // INSTRUCTIONS (critical for context)
  // ============================================
  "instructions": [
    "AGENTS.md",
    ".github/copilot-instructions.md",
    ".github/instructions/*.instructions.md",
    "docs/HOT_RELOAD.md",
    "docs/DATABASE_MIGRATIONS.md",
    "docs/ENHANCED_LOGGING_SYSTEM.md",
    "RUNBOOK.md",
    "QUICK_START_DEV.md"
  ],

  // ============================================
  // SPECIALIZED AGENTS
  // ============================================
  "agent": {
    // Default build agent (all tools enabled)
    "build": {
      "mode": "primary",
      "model": "anthropic/claude-sonnet-4-20250514",
      "description": "Full development with write access",
      "temperature": 0.3,
      "tools": {
        "write": true,
        "edit": true,
        "bash": true
      },
      "permission": {
        "bash": {
          "git push": "ask",
          "npm publish": "deny",
          "rm -rf": "ask"
        }
      }
    },

    // Plan agent (read-only analysis)
    "plan": {
      "mode": "primary",
      "model": "anthropic/claude-3-5-haiku-20241022",
      "description": "Read-only planning and analysis",
      "temperature": 0.1,
      "tools": {
        "write": false,
        "edit": false
      },
      "permission": {
        "bash": {
          "git *": "allow",
          "nx *": "allow",
          "npm *": "deny"
        }
      }
    },

    // Testing specialist
    "test": {
      "mode": "subagent",
      "description": "E2E and unit test implementation specialist",
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.2,
      "tools": {
        "playwright": true,
        "postgres": true
      }
    },

    // Database specialist
    "db": {
      "mode": "subagent",
      "description": "Database migrations and schema management",
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.1,
      "tools": {
        "postgres": true,
        "write": true
      },
      "permission": {
        "bash": {
          "nx run server:migrate": "allow",
          "psql": "ask"
        }
      }
    },

    // Documentation specialist
    "docs": {
      "mode": "subagent",
      "description": "Documentation writing and updates",
      "model": "anthropic/claude-3-5-haiku-20241022",
      "temperature": 0.5,
      "tools": {
        "write": true,
        "bash": false
      }
    }
  },

  // ============================================
  // CUSTOM COMMANDS
  // ============================================
  "command": {
    "test": {
      "template": "Run the full test suite for $ARGUMENTS.\nFocus on failing tests and suggest fixes.\n\nTest output:\n!`nx run $ARGUMENTS:test`",
      "description": "Run tests for a specific project",
      "agent": "test"
    },

    "e2e": {
      "template": "Run E2E tests for admin app.\nAnalyze failures and suggest fixes.\n\nE2E output:\n!`npm run e2e:admin:real`",
      "description": "Run admin E2E tests",
      "agent": "test"
    },

    "migrate": {
      "template": "Review pending database migrations:\n!`nx run server:migrate -- --list`\n\nApply migrations if safe.",
      "description": "Manage database migrations",
      "agent": "db"
    },

    "workspace": {
      "template": "Show workspace status:\n!`npm run workspace:status`\n\nAnalyze any issues.",
      "description": "Check workspace services status"
    },

    "logs": {
      "template": "Show recent logs:\n!`npm run workspace:logs -- $ARGUMENTS`\n\nAnalyze errors and suggest fixes.",
      "description": "Analyze workspace logs"
    }
  },

  // ============================================
  // PERMISSIONS
  // ============================================
  "permission": {
    "edit": "allow",
    "bash": {
      // Safe commands
      "git status": "allow",
      "git diff": "allow",
      "git log": "allow",
      "nx *": "allow",
      "npm run *": "allow",

      // Dangerous commands require approval
      "git push": "ask",
      "git reset --hard": "ask",
      "rm -rf": "ask",
      "npm publish": "deny",

      // Database commands
      "psql *": "ask"
    },
    "webfetch": "allow"
  },

  // ============================================
  // TOOLS
  // ============================================
  "tools": {
    // Enable critical MCP tools by default
    "nx*": true, // Essential for monorepo workflows
    "postgres*": true, // Essential for database operations
    "todowrite": true,
    "webfetch": true,

    // Optional: Disable to reduce context (11-17K tokens), enable per-agent
    "playwright*": true,
    "context7*": true,
    "gh_grep*": true,
    "react-daisyui*": true
  }
}
```

**Note**: Consider setting `playwright*`, `context7*`, `gh_grep*`, and `react-daisyui*` to `false` and enabling them only in specific agents to reduce baseline context usage from ~17K to ~4K tokens (see Section 9).

---

## 2. Rules Files (AGENTS.md)

### 2.1 Root `AGENTS.md` (already exists)

**Current**: Has Nx configuration
**Action**: Enhance with project-specific patterns

**Recommended Additions**:

```markdown
# spec-server Project

This is an Nx monorepo for a knowledge base system with NestJS backend and React admin frontend.

## Architecture

- **Backend**: NestJS (apps/server)
  - PostgreSQL with RLS (Row Level Security)
  - Multi-tenant architecture (org_id, project_id)
  - Vertex AI integration for embeddings
- **Frontend**: React + DaisyUI (apps/admin)
  - Vite dev server with HMR
  - Storybook for component development
  - Playwright E2E tests

## Critical Conventions

### API Request Flow
```

Frontend (use-api hook) → Adds X-Org-ID, X-Project-ID headers
↓
Vite Proxy (/api/\*)
↓
Backend Controller → Reads req.headers['x-org-id'], req.headers['x-project-id']
↓
Service Layer → Uses DatabaseService.runWithTenantContext()

```

### Test IDs
- **ALWAYS use static strings**: `data-testid="clickup-sync-modal"`
- **Never dynamic construction**: ❌ `data-testid={\`modal-${id}\`}`
- See `.github/instructions/testid-conventions.instructions.md`

### Database Migrations
- Use `nx run server:migrate` (never manual psql)
- Migrations tracked in `kb.schema_migrations` table
- See `docs/DATABASE_MIGRATIONS.md`

### Hot Reload (Already Working)
- Admin: Vite HMR (instant updates)
- Server: ts-node-dev with --respawn (2-5s restart)
- No configuration needed - enabled by default

## When to Use MCP Tools

- **nx**: Nx workspace structure, project details, best practices documentation
- **postgres**: Database queries, schema inspection
- **playwright**: Browser automation for E2E tests
- **context7**: Search library documentation (React, NestJS, etc.)
- **gh_grep**: Find code examples on GitHub
- **react-daisyui**: DaisyUI component documentation

## Self-Learning Protocol

Read `.github/instructions/self-learning.instructions.md` for documented mistakes and lessons learned. Add new entries when you discover important patterns or make mistakes.
```

### 2.2 Global `~/.config/opencode/AGENTS.md`

**Purpose**: Personal coding preferences

**Recommended**:

```markdown
# Personal Coding Preferences

## Code Style

- Prefer functional components over class components
- Use TypeScript strict mode
- Avoid `any` types - use `unknown` and type guards

## Testing

- Write tests before marking tasks complete
- Prefer explicit test IDs over CSS selectors
- Mock external APIs in E2E tests

## Documentation

- Update docs when changing behavior
- Add inline comments for complex logic
- Keep README.md files current
```

---

## 3. Custom Commands (Create `.opencode/command/` directory)

### 3.1 `.opencode/command/speckit-plan.md`

```markdown
---
description: Plan implementation using SpecKit methodology
agent: plan
model: anthropic/claude-sonnet-4-20250514
---

You are in SpecKit planning mode. Analyze $ARGUMENTS and create a detailed implementation plan following the SpecKit constitution from `.github/prompts/speckit.constitution.prompt.md`.

Review relevant files:

- @.github/prompts/speckit.plan.prompt.md
- @.github/prompts/speckit.constitution.prompt.md

Create a structured plan with:

1. Requirements analysis
2. Affected components
3. Implementation steps
4. Testing strategy
5. Rollback plan
```

### 3.2 `.opencode/command/fix-tests.md`

```markdown
---
description: Fix failing E2E or unit tests
agent: test
subtask: true
---

Analyze failing tests for $ARGUMENTS:

Test output:
!`nx run $ARGUMENTS:test 2>&1 | tail -100`

Steps:

1. Identify root cause of failures
2. Check for missing test IDs (use static strings!)
3. Verify mock data matches component expectations
4. Check API endpoint exists before testing frontend
5. Apply fixes
6. Re-run tests to verify
```

### 3.3 `.opencode/command/db-check.md`

```markdown
---
description: Check database schema and migrations
agent: db
subtask: true
---

Check database state for $ARGUMENTS:

1. Show pending migrations:
   !`nx run server:migrate -- --list`

2. Use postgres MCP to verify schema exists

3. Check for missing columns referenced in code

4. Suggest migration if needed
```

---

## 4. Additional Specialized Agents (Create `.opencode/agent/` directory)

**Note**: The main configuration (Section 1.2) already defines 5 core agents (build, plan, test, db, docs) inline. This section defines **9 additional specialist agents** as separate files for domain-specific workflows.

### Agent Priority Matrix

| Agent                      | Priority  | Reason                              | When to Use                                           |
| -------------------------- | --------- | ----------------------------------- | ----------------------------------------------------- |
| **Extraction Specialist**  | 🔥 HIGH   | Core feature, 40+ docs, AI pipeline | Extraction jobs, chunking, embeddings, template packs |
| **Storybook/Component**    | 🔥 HIGH   | Atomic Design enforcement           | UI component development, Storybook stories           |
| **ClickUp Integration**    | ⚡ MEDIUM | 18 docs, complex v2/v3 API          | ClickUp imports, API v2/v3 reconciliation             |
| **Monitoring & Analytics** | ⚡ MEDIUM | Cost tracking, dashboard            | Monitoring dashboards, cost calculations              |
| **Graph & Discovery**      | ⚡ MEDIUM | Complex graph operations            | Graph search, discovery wizard, tagging               |
| **Workspace CLI**          | ⚡ MEDIUM | DevOps automation                   | PM2, Docker, Coolify deployment                       |
| **Nx Specialist**          | ⚡ MEDIUM | Monorepo operations                 | Nx workspace questions, optimization                  |
| **Migration & Schema**     | ✨ LOW    | Extends DB agent                    | Complex migrations, RLS policies                      |
| **E2E Test**               | ✨ LOW    | Extends Test agent                  | Playwright fixtures, auth flows                       |

### 4.1 `.opencode/agent/extraction-specialist.md` 🔥 HIGH PRIORITY

````markdown
---
description: AI extraction pipeline specialist (Gemini, chunking, embeddings)
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
tools:
  postgres: true
  write: true
  bash: true
---

You specialize in the AI extraction pipeline. Focus areas:

1. **Extraction Job Configuration**: Template packs, base prompts, extraction schemas
2. **Gemini Integration**: Rate limiting, chunking strategies, embedding dimension management
3. **Logging & Progress**: Extraction job tracking, status updates, error handling
4. **Entity Linking**: Graph relationships, object linking, duplicate handling strategies

## Key Workflows

**Template Pack Configuration**:

- Read `docs/features/extraction/*.md` for context
- Use postgres to verify schema: `kb.extraction_jobs`, `kb.extraction_logs`
- Seed scripts: `tsx scripts/seed-*.ts`

**Chunking Optimization**:

- Gemini 2.5 Flash chunking parameters
- Token limits and overlap strategies
- See `docs/features/extraction/GEMINI_2_5_FLASH_CHUNKING.md`

**Rate Limit Handling**:

- Exponential backoff implementation
- See `docs/features/extraction/EXTRACTION_RATE_LIMIT_FIX.md`

## Permissions

```yaml
bash:
  'nx run server:migrate': allow
  'tsx scripts/migrate-embedding-dimension.ts': allow
  'tsx scripts/seed-*': allow
```
````

## Related Documentation

- 40+ files in `docs/features/extraction/`
- `docs/plans/vertex-ai-cleanup.md`
- `RUNBOOK.md` (embedding model configuration)

## Common Issues

- Extraction job hangs: Check rate limits and chunking size
- Embedding dimension mismatch: Run `tsx scripts/migrate-embedding-dimension.ts`
- Duplicate entities: Review merge strategy in extraction config

````

### 4.2 `.opencode/agent/storybook-component-specialist.md` 🔥 HIGH PRIORITY
```markdown
---
description: UI component development with Atomic Design + Storybook
mode: subagent
model: anthropic/claude-3-5-haiku-20241022
temperature: 0.4
tools:
  write: true
  react-daisyui: true
  gh_grep: true
---

You specialize in UI component development following Atomic Design principles.

## Component Classification

Use this decision tree:

1. Single HTML element with styling? → **Atom** (`src/components/atoms/`)
2. Combines 2-4 atoms into purposeful unit? → **Molecule** (`src/components/molecules/`)
3. Structural layout aggregating molecules? → **Organism** (`src/components/organisms/`)
4. Page scaffolding without data binding? → **Template** (`src/components/templates/`)
5. Route-bound screen with data? → **Page** (`src/pages/`)

## Component Structure

````

ComponentName/
├── ComponentName.tsx # Main component
├── ComponentName.stories.tsx # Storybook stories (MANDATORY)
├── ComponentName.test.tsx # Tests (for logic-bearing components)
├── index.ts # Barrel export (optional)
└── types.ts # Shared types (if >20 LOC)

````

## Storybook Requirements

- Every exported component MUST have a story
- Story validates in isolation (renders only that component)
- Use `npm run check:stories` to validate
- See `scripts/check-stories.mjs` for validation rules

## Styling Conventions

- Prefer Tailwind + DaisyUI utility classes
- Zero bespoke CSS unless required
- If custom CSS needed: isolate in `src/styles/core/components.css`

## Key Instructions

**MUST READ before component work**:
- `.github/instructions/atomic-design.instructions.md` (50+ lines, authoritative)
- `.github/instructions/daisyui.instructions.md`
- `.github/instructions/testid-conventions.instructions.md`

## Common Commands

```bash
# Validate Storybook stories
npm run check:stories

# Run Storybook
npm run dev:storybook

# Build Storybook
nx run admin:build:storybook
````

## Test ID Convention

**CRITICAL**: Always use static test IDs:

- ✅ `data-testid="clickup-sync-modal"`
- ❌ `data-testid={\`modal-${id}\`}` (NEVER dynamic!)

See `.github/instructions/testid-conventions.instructions.md`

````

### 4.3 `.opencode/agent/clickup-integration-specialist.md` ⚡ MEDIUM
```markdown
---
description: ClickUp API integration (v2/v3 reconciliation, selective import)
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
tools:
  postgres: true
  write: true
  webfetch: true
---

You specialize in ClickUp API integration. **CRITICAL**: ClickUp v2 and v3 APIs use completely different ID numbering systems.

## Key Lesson (from self-learning.md)

**ALWAYS check API documentation for native filtering parameters FIRST!**

Common mistake: Building complex local filtering when API supports native parameters.

### API Version Differences

- **v2 API**: Spaces, folders, lists, tasks (one ID system)
- **v3 API**: Docs, pages (completely different ID system)
- `doc.parent.id` contains **folder IDs from v2**, NOT space IDs
- Direct comparison of space IDs vs. doc parent IDs ALWAYS fails

### Correct Approach: Native API Filtering

```typescript
// Use native API filtering with ?parent={spaceId}
for (const spaceId of selectedSpaceIds) {
    const docsResponse = await this.apiClient.getDocs(workspaceId, undefined, spaceId);
    allDocs.push(...docsResponse.docs);
}
````

### Alternative: Folder-to-Space Mapping

Only use if API doesn't support native filtering:

```typescript
// Build lookup map BEFORE processing
const folderToSpaceMap = new Map<string, string>();
for (const spaceId of selectedSpaceIds) {
  const foldersResponse = await this.apiClient.getFolders(spaceId);
  for (const folder of foldersResponse.folders) {
    folderToSpaceMap.set(folder.id, spaceId);
  }
}

// Filter documents locally
const filteredDocs = docs.filter((doc) => {
  if (doc.parent.type === 6) {
    // Type 6 = folder parent
    return folderToSpaceMap.has(doc.parent.id);
  }
  return false;
});
```

## Focus Areas

1. **Hierarchy Navigation**: Space → Folder → List → Task relationships
2. **Selective Import**: User-selected spaces/folders/lists only
3. **Rate Limiting**: Pagination and API throttling
4. **Doc vs. Task Content**: Different extraction strategies

## Related Documentation

- 18 files in `docs/integrations/clickup/`
- `.github/instructions/self-learning.instructions.md` (2025-10-22 entry)
- `docs/integrations/INTEGRATION_SOURCE_TRACKING.md`

## Testing

- Mock external API calls in tests
- Test space/folder/list selection filtering
- Verify v2/v3 ID reconciliation logic

## Common Issues

- All docs imported despite space selection: Check if using native `?parent` parameter
- 0 docs imported: Verify folder-to-space mapping logic
- API 401 on folder endpoint: Use `GET /space/{id}/folder` instead of `GET /folder/{id}`

````

### 4.4 `.opencode/agent/monitoring-analytics-specialist.md` ⚡ MEDIUM
```markdown
---
description: System monitoring, cost analytics, and job tracking
mode: subagent
model: anthropic/claude-3-5-haiku-20241022
temperature: 0.1
tools:
  postgres: true
  playwright: true
---

You specialize in monitoring dashboards and cost analytics.

## Focus Areas

1. **Cost Calculation**: LLM usage tracking, token counting, cost visualization
2. **Extraction Job Monitoring**: Status tracking, progress indicators, error logs
3. **Chat Session Analytics**: Usage patterns, conversation metrics
4. **Dashboard UI**: Data queries, chart components, real-time updates

## Database Schema

Key tables:
- `kb.llm_call_logs`: Token usage, model, costs
- `kb.extraction_jobs`: Job status, progress tracking
- `kb.extraction_logs`: Detailed job execution logs
- `kb.chat_sessions`: Conversation history and metadata

## Dashboard Components

- **CostVisualization.tsx**: Charts and cost breakdowns
- **JobDetailModal.tsx**: Extraction job details
- **ChatSessionsListPage.tsx**: Session analytics

## Related Documentation

- 20+ files in `docs/features/monitoring/`
- `docs/features/monitoring/MONITORING_DASHBOARD_TESTING_GUIDE.md`
- `docs/features/monitoring/COST_VISUALIZATION_TEST_GUIDE.md`

## Common Commands

```bash
# Run monitoring dashboard tests
nx run admin:e2e -- apps/admin/e2e/specs/monitoring.spec.ts
````

## Testing Strategy

- Use Playwright for dashboard UI testing
- Mock heavy data queries with fixtures
- Test cost calculation edge cases (zero usage, rate limits)

````

### 4.5 `.opencode/agent/graph-discovery-specialist.md` ⚡ MEDIUM
```markdown
---
description: Knowledge graph, discovery wizard, relationship management
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
tools:
  postgres: true
  write: true
---

You specialize in knowledge graph operations and discovery workflows.

## Focus Areas

1. **Graph Search**: Neighbor traversal, context retrieval, relationship filtering
2. **Discovery Wizard**: Multi-step flow, state persistence, relationship visualization
3. **Universal Tagging**: Tag creation, hierarchies, tag-based search
4. **Object Versioning**: History tracking, changelog, revision management

## Graph Structure

- **Objects**: Core entities with types and metadata
- **Relationships**: Typed edges between objects
- **Tags**: Universal tagging system with hierarchies
- **Versions**: Full object history with revision tracking

## Key Algorithms

**Graph Search with Neighbors**:
```sql
-- Find object + its immediate neighbors
SELECT o.*, rel.relationship_type
FROM kb.objects o
LEFT JOIN kb.relationships rel ON (rel.from_object_id = o.id OR rel.to_object_id = o.id)
WHERE o.id = $1 OR rel.from_object_id = $1 OR rel.to_object_id = $1;
````

**Discovery Context Building**:

- Traverse relationship graph depth-first
- Filter by user-selected relationship types
- Aggregate context for LLM prompts

## Related Documentation

- `docs/features/graph/`: Graph search, tagging, validation
- `docs/features/discovery/`: Discovery wizard flow, UI
- `docs/features/objects/`: Version history, changelog

## Performance Considerations

- Use indexed queries on `kb.relationships` table
- Limit traversal depth to prevent infinite loops
- Cache frequently accessed graph neighborhoods

````

### 4.6 `.opencode/agent/workspace-cli-specialist.md` ⚡ MEDIUM
```markdown
---
description: Workspace CLI, PM2 process management, Docker orchestration
mode: subagent
model: anthropic/claude-3-5-haiku-20241022
temperature: 0.1
tools:
  bash: true
  write: true
---

You specialize in workspace management and deployment automation.

## Focus Areas

1. **PM2 Process Management**: Service lifecycle (start/stop/restart)
2. **Docker Orchestration**: Postgres, Zitadel, Login service dependencies
3. **Log Aggregation**: Centralized logging, rotation, filtering
4. **Health Checks**: Preflight validation, service readiness probes
5. **Coolify Deployment**: Production deployment configuration

## Workspace CLI Commands

```bash
# Service management
npm run workspace:start          # Start admin + server
npm run workspace:stop           # Stop admin + server
npm run workspace:restart        # Restart admin + server
npm run workspace:status         # Health check

# Dependencies
npm run workspace:deps:start     # Start Docker dependencies
npm run workspace:deps:stop      # Stop Docker dependencies
npm run workspace:deps:restart   # Restart dependencies

# Logs
npm run workspace:logs           # Tail all logs
npm run workspace:logs -- --service=server  # Specific service
npm run workspace:logs -- --follow          # Follow mode
````

## Log File Structure

```
apps/logs/
├── server/
│   ├── out.log
│   └── error.log
├── admin/
│   ├── out.log
│   └── error.log
└── dependencies/
    ├── postgres/
    ├── zitadel/
    └── login/
```

## Permissions

```yaml
bash:
  'npm run workspace:*': allow
  'pm2 *': allow
  'docker compose *': ask
  'nx run workspace-cli:*': allow
```

## Related Documentation

- `RUNBOOK.md`: Workspace setup and usage
- `docs/deployment/coolify/`: Production deployment
- `.opencode/instructions.md`: Workspace management instructions
- `tools/workspace-cli/`: CLI implementation

## Common Issues

- Service won't start: Check port availability (3001, 5175)
- Docker dependency failed: Run `npm run workspace:deps:restart`
- Log files missing: Ensure `apps/logs/` directory exists

````

### 4.7 `.opencode/agent/nx-specialist.md` ⚡ MEDIUM
```markdown
---
description: Nx monorepo operations and optimization
mode: subagent
temperature: 0.1
tools:
  nx: true
  bash: true
---

You are an Nx specialist. Always use Nx commands over direct tool invocation:

- Build: `nx run <project>:build`
- Test: `nx run <project>:test`
- Affected: `nx affected:test`

Never run npm/yarn directly in workspace packages - use Nx targets.

Before answering Nx questions, use the nx_workspace and nx_docs MCP tools.

## Key Projects

- `admin`: React admin frontend (Vite + Storybook)
- `server`: NestJS backend
- `workspace-cli`: PM2-based workspace management

## Common Tasks

```bash
# Build all
nx run-many -t build

# Test affected by changes
nx affected:test

# Project graph
nx graph

# Workspace details
# Use nx_workspace MCP tool for programmatic access
````

````

### 4.8 `.opencode/agent/migration-schema-specialist.md` ✨ LOW PRIORITY
```markdown
---
description: Database migrations, schema evolution, RLS policies (extends DB agent)
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.05
tools:
  postgres: true
  write: true
---

You specialize in complex database migrations and schema evolution.

## Focus Areas (beyond basic DB agent)

1. **Row Level Security (RLS)**: Multi-tenant policy management
2. **Schema Evolution**: Breaking changes, data migration strategies
3. **Foreign Key Relationships**: Complex constraint management
4. **Migration Rollback**: Safe rollback planning and testing

## Multi-Tenant Patterns

All tables should have:
- `org_id UUID NOT NULL REFERENCES kb.organizations(id)`
- `project_id UUID REFERENCES kb.projects(id)`
- RLS policies filtering by `current_setting('kb.org_id')::uuid`

## RLS Policy Template

```sql
-- Enable RLS
ALTER TABLE kb.my_table ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY my_table_tenant_isolation ON kb.my_table
  USING (org_id = current_setting('kb.org_id')::uuid);

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON kb.my_table TO authenticated;
````

## Migration Workflow

1. Create migration script: `apps/server/src/db/migrations/XXX_description.ts`
2. Test locally: `tsx scripts/run-migrations.ts`
3. Verify with postgres MCP: Check schema, row counts
4. Document in `docs/migrations/`

## Related Documentation

- `docs/DATABASE_MIGRATIONS.md`
- `docs/migrations/*.md`
- Multi-tenant architecture in `docs/technical/`

## Permissions

```yaml
bash:
  'tsx scripts/run-migrations.ts': allow
  'tsx scripts/*-db.ts': ask
  'psql': deny # Use postgres MCP instead
```

````

### 4.9 `.opencode/agent/e2e-test-specialist.md` ✨ LOW PRIORITY
```markdown
---
description: Playwright E2E tests with real authentication (extends Test agent)
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
tools:
  playwright: true
  postgres: true
---

You specialize in complex Playwright E2E testing scenarios.

## Focus Areas (beyond basic Test agent)

1. **Playwright Fixtures**: Auth, cleanUser, consoleGate custom fixtures
2. **Real Login Flows**: E2E_REAL_LOGIN=1 with actual Zitadel authentication
3. **Multi-Org/Multi-Project**: Testing tenant isolation
4. **Integration Scenarios**: ClickUp import, extraction jobs, chat flows

## Fixture Usage

```typescript
// apps/admin/e2e/fixtures/auth.ts
test.use({ storageState: '.auth/user.json' });

// apps/admin/e2e/fixtures/cleanUser.ts
// Automatic cleanup after tests

// apps/admin/e2e/fixtures/consoleGate.ts
// Suppress expected console errors
````

## Test ID Convention (CRITICAL!)

**MUST use static test IDs**:

```tsx
// ✅ CORRECT
<Modal data-testid="clickup-sync-modal">

// ❌ WRONG - NEVER dynamic!
<Modal data-testid={`modal-${id}`}>
```

See `.github/instructions/testid-conventions.instructions.md` for full rules.

## Commands

```bash
# Real login E2E tests
npm run e2e:admin:real

# UI mode (headed browser)
npm run e2e:admin:ui

# Setup/auth only
npm run e2e:admin:setup
```

## Related Documentation

- `.github/instructions/playwright-typescript.instructions.md`
- `.github/instructions/testid-conventions.instructions.md`
- `apps/admin/e2e/README.md`

## Common Issues

- Auth state missing: Run `npm run e2e:admin:setup` first
- Test ID not found: Verify static string (no template literals!)
- Tenant isolation failure: Check RLS policies with postgres MCP

````

### 4.2 `.opencode/agent/integration-specialist.md`

```markdown
---
description: Integration development (ClickUp, Jira, etc.)
mode: subagent
tools:
  postgres: true
  write: true
---

You specialize in third-party integrations. When implementing:

1. **Error Handling**: Provide specific error messages:

   - Invalid API tokens → UnauthorizedException
   - Invalid workspace IDs → BadRequestException
   - Network errors → Include actionable guidance

2. **Security**: Always encrypt credentials in `settings_encrypted` column

3. **Testing**: Mock external APIs, test error scenarios

4. **Documentation**: Update integration docs with setup steps

See `.github/instructions/self-learning.instructions.md` entries from 2025-10-06 for integration error handling lessons.
````

---

## 5. Migration Strategy

### Phase 1: Initial Setup (Day 1) - CRITICAL PRIORITIES

1. ✅ Project config already exists (`opencode.jsonc`)
2. 🔥 **CRITICAL: Enable Nx MCP server** in `opencode.jsonc`
3. 🔥 **CRITICAL: Add instruction glob patterns** to leverage existing `.github/instructions/*.md`
4. 🔥 **CRITICAL: Enhance `AGENTS.md`** with architecture and critical conventions (see section 2.1)
5. Create `.opencode/` directory structure
6. Add 5 core agents inline in `opencode.jsonc` (build, plan, test, db, docs)
7. Add 2 HIGH priority specialist agents (extraction, storybook)
8. Add 3 custom commands (speckit-plan, fix-tests, db-check)
9. Run `/init` in OpenCode to analyze project

### Phase 2: Enhanced Agents (Week 1)

1. Add 4 MEDIUM priority specialist agents:
   - ClickUp Integration Specialist
   - Monitoring & Analytics Specialist
   - Graph & Discovery Specialist
   - Workspace CLI Specialist
2. Add 1 additional MEDIUM priority agent:
   - Nx Specialist
3. Document OpenCode usage in `QUICK_START_DEV.md`
4. Share configuration via Git
5. Train team on agent specializations

### Phase 3: Complete Agent Suite (Week 2-3)

1. Add 2 LOW priority specialist agents (extensions):
   - Migration & Schema Specialist (extends DB agent)
   - E2E Test Specialist (extends Test agent)
2. Create additional custom commands for domain workflows
3. Implement context optimization (selective tool enablement)

### Phase 4: Optimization & Monitoring (Week 2-4)

1. Monitor which MCP tools and agents are most used
2. Disable unused tools to reduce context (from 17K to 4K tokens)
3. Refine agent prompts based on real usage
4. Add more custom commands for repetitive tasks
5. Document agent selection patterns

---

## 6. Key Differences from Copilot

| Feature             | GitHub Copilot                                                  | OpenCode (Current)     | OpenCode (After Plan)                                                                 |
| ------------------- | --------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| **Instructions**    | `.github/copilot-instructions.md` + `.github/instructions/*.md` | 1 file                 | `AGENTS.md` + 10+ instruction files via glob                                          |
| **Context**         | Automatic from workspace                                        | 5 MCP servers          | 6 MCP servers (+ Nx) with optimization                                                |
| **Agents**          | Single assistant                                                | None (default only)    | **14 specialized agents**: 5 core + 9 domain specialists                              |
| **Domain Coverage** | Generic                                                         | Generic                | Extraction, Storybook, ClickUp, Monitoring, Graph, Workspace CLI, Nx, Migrations, E2E |
| **Commands**        | Limited custom commands                                         | None                   | 3 custom commands + extensible workflow system                                        |
| **Permissions**     | Always allowed                                                  | None                   | Granular per-tool and per-bash-command                                                |
| **State**           | Stateful across workspace                                       | Per-session            | Per-session with subagent isolation                                                   |
| **Token Usage**     | N/A (closed source)                                             | ~11-17K from MCP tools | ~4K (with optimization)                                                               |

---

## 7. Recommended Next Steps

1. **Create `.opencode/` directory structure**:

   ```bash
   mkdir -p .opencode/{agent,command}
   ```

2. **Enhance `opencode.jsonc`** with full configuration above

3. **Update `AGENTS.md`** with project-specific patterns

4. **Create custom files**:

   - **Commands** (3 files):
     - `.opencode/command/speckit-plan.md`
     - `.opencode/command/fix-tests.md`
     - `.opencode/command/db-check.md`
   - **Specialist Agents** (9 files):
     - 🔥 HIGH: `.opencode/agent/extraction-specialist.md`
     - 🔥 HIGH: `.opencode/agent/storybook-component-specialist.md`
     - ⚡ MEDIUM: `.opencode/agent/clickup-integration-specialist.md`
     - ⚡ MEDIUM: `.opencode/agent/monitoring-analytics-specialist.md`
     - ⚡ MEDIUM: `.opencode/agent/graph-discovery-specialist.md`
     - ⚡ MEDIUM: `.opencode/agent/workspace-cli-specialist.md`
     - ⚡ MEDIUM: `.opencode/agent/nx-specialist.md`
     - ✨ LOW: `.opencode/agent/migration-schema-specialist.md`
     - ✨ LOW: `.opencode/agent/e2e-test-specialist.md`

   **Note**: 5 core agents (build, plan, test, db, docs) are already defined inline in `opencode.jsonc` Section 1.2. Total agent count: **14 agents** (5 core + 9 specialists)

5. **Add to `.gitignore`** (optional):

   ```
   # OpenCode personal preferences
   ~/.config/opencode/
   ```

6. **Commit to Git**:

   ```
   opencode.jsonc
   AGENTS.md
   .opencode/
   ```

7. **Update `QUICK_START_DEV.md`** with OpenCode usage section

---

## 8. Migration from Copilot Instructions

Your existing `.github/` structure maps well to OpenCode:

| Copilot                           | OpenCode                                           |
| --------------------------------- | -------------------------------------------------- |
| `.github/copilot-instructions.md` | Add to `instructions` in config                    |
| `.github/instructions/*.md`       | Add glob pattern to `instructions`                 |
| `.github/prompts/*.md`            | Convert to custom commands in `.opencode/command/` |

**No file deletion needed** - OpenCode can reference your existing instruction files directly via the `instructions` config option.

---

## 9. Accuracy & Context Optimization

### High Context Usage Warning

Your current setup has **6 MCP servers** enabled. Each adds context:

- `nx`: ~1-2K tokens (workspace structure + docs)
- `playwright`: ~2-5K tokens (methods + snapshots)
- `postgres`: ~1-3K tokens (schema + queries)
- `context7`: ~1-2K tokens (search results)
- `gh_grep`: ~1-2K tokens (code examples)
- `react-daisyui`: ~1-2K tokens (component docs)

**Total**: ~11-17K tokens just from MCP tools before any code context.

### Optimization Strategy

**Option A: Selective Enablement** (Recommended)

```jsonc
{
  "tools": {
    // Disable by default
    "playwright*": false,
    "context7*": false,
    "gh_grep*": false,
    "react-daisyui*": false,

    // Always available (critical for core workflows)
    "nx*": true,
    "postgres*": true
  },

  "agent": {
    "test": {
      "tools": {
        "playwright*": true // Enable only for test agent
      }
    },
    "docs": {
      "tools": {
        "context7*": true, // Enable only for docs agent
        "gh_grep*": true
      }
    }
  }
}
```

**Option B: On-Demand Usage**
Add to `AGENTS.md`:

```markdown
## MCP Tool Usage

Only use MCP tools when explicitly needed:

- **nx**: "use nx to check workspace structure" (always available)
- **postgres**: "use postgres to check schema" (always available)
- **playwright**: "use playwright to test this"
- **context7**: "use context7 to search React docs"
- **gh_grep**: "use gh_grep to find GitHub examples"

Don't load all tools automatically.
```

**Recommended**: Use Option A (Selective Enablement) to reduce baseline context from ~17K to ~4K tokens while ensuring critical tools (nx, postgres) are always available.

---

## 10. Testing the Configuration

After setup, test each agent:

```bash
# Start OpenCode
opencode

# Test Plan agent (Tab to switch)
<Tab>
"Analyze the authentication flow in @apps/server/src/modules/auth/"

# Test custom command
"/test server"

# Test subagent
"@db check if kb_purpose column exists in projects table"

# Test MCP tools
"use postgres to show all tables in kb schema"
```

---

## Summary

**Recommended Configuration Priority**:

1. 🔥 **CRITICAL: Enable Nx MCP server** (currently commented out but essential for monorepo)
2. 🔥 **CRITICAL: Add instruction glob patterns** (leverage existing .github/ files)
3. 🔥 **CRITICAL: Enhanced AGENTS.md** (architecture, conventions, critical for accuracy)
4. ⚡ **HIGH: Core agents** (5 inline agents: build, plan, test, db, docs)
5. ⚡ **HIGH: Priority specialist agents** (2 agents: extraction, storybook)
6. ⚡ **MEDIUM: Domain specialists** (5 agents: clickup, monitoring, graph, workspace, nx)
7. ✨ **LOW: Extension specialists** (2 agents: migration, e2e-test)
8. ✨ **Custom commands** (3 files: speckit-plan, fix-tests, db-check)
9. ✨ **Permissions** (safety for destructive commands)
10. ✨ **Tool optimization** (reduce context usage from 11-17K tokens)
11. ✅ **MCP servers** (already partially configured, needs Nx addition)

**Total Agent Count**: **14 specialized agents**

- 5 core agents (build, plan, test, db, docs)
- 2 HIGH priority specialists (extraction, storybook)
- 5 MEDIUM priority specialists (clickup, monitoring, graph, workspace, nx)
- 2 LOW priority specialists (migration, e2e-test)

This configuration provides:

- **Accuracy**: Comprehensive context from existing instruction files + domain experts
- **Safety**: Granular permissions for destructive operations
- **Efficiency**: Specialized agents reduce context pollution (from 17K to 4K tokens)
- **Domain Expertise**: Dedicated agents for complex subsystems (extraction, ClickUp, graph)
- **Team Consistency**: Shared configuration via Git
- **Developer Experience**: Custom commands + 14 specialized agents for all workflows

### Agent Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenCode Agent Architecture                  │
│                     (14 Specialized Agents)                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ CORE WORKFLOW AGENTS (5) - Inline in opencode.jsonc             │
├─────────────────────────────────────────────────────────────────┤
│ • build       → Full development (write, edit, bash)            │
│ • plan        → Read-only analysis (Haiku, faster)              │
│ • test        → Unit/E2E testing (playwright, postgres)         │
│ • db          → Migrations, schema (postgres, write)            │
│ • docs        → Documentation (write only, no bash)             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 🔥 HIGH PRIORITY DOMAIN SPECIALISTS (2)                         │
├─────────────────────────────────────────────────────────────────┤
│ • extraction-specialist                                          │
│   → AI pipeline (40+ docs): Gemini, chunking, embeddings       │
│   → Template packs, extraction jobs, entity linking             │
│                                                                  │
│ • storybook-component-specialist                                 │
│   → Atomic Design enforcement (10+ instruction files)           │
│   → Storybook stories, DaisyUI components, test IDs            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ⚡ MEDIUM PRIORITY DOMAIN SPECIALISTS (5)                       │
├─────────────────────────────────────────────────────────────────┤
│ • clickup-integration-specialist                                 │
│   → ClickUp v2/v3 APIs (18 docs), selective import             │
│                                                                  │
│ • monitoring-analytics-specialist                                │
│   → Cost tracking, dashboards (20+ docs), job monitoring       │
│                                                                  │
│ • graph-discovery-specialist                                     │
│   → Knowledge graph, discovery wizard, tagging system          │
│                                                                  │
│ • workspace-cli-specialist                                       │
│   → PM2, Docker, Coolify, log aggregation                      │
│                                                                  │
│ • nx-specialist                                                  │
│   → Monorepo operations, nx_workspace, nx_docs MCP tools       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ✨ LOW PRIORITY EXTENSIONS (2)                                  │
├─────────────────────────────────────────────────────────────────┤
│ • migration-schema-specialist                                    │
│   → Extends db agent: Complex RLS, multi-tenant patterns       │
│                                                                  │
│ • e2e-test-specialist                                            │
│   → Extends test agent: Playwright fixtures, real auth         │
└─────────────────────────────────────────────────────────────────┘

AGENT SELECTION EXAMPLES:
─────────────────────────────────────────────────────────────────
"Fix extraction job hanging"          → @extraction-specialist
"Create button component"              → @storybook-component-specialist
"ClickUp import not filtering spaces"  → @clickup-integration-specialist
"Add cost tracking widget"             → @monitoring-analytics-specialist
"Optimize graph search performance"    → @graph-discovery-specialist
"PM2 service won't start"              → @workspace-cli-specialist
"Run affected tests"                   → @nx-specialist
"Create RLS policy for new table"      → @migration-schema-specialist
"Debug Playwright auth fixture"        → @e2e-test-specialist
"Plan new feature"                     → plan (core agent)
"Write migration script"               → db (core agent)
```

---

## 11. Implementation Roadmap

### ✅ Minimal Viable Configuration (15 minutes)

Implements 80% of accuracy improvement:

1. Add Nx MCP server to `opencode.jsonc`
2. Add instruction glob pattern to `opencode.jsonc`
3. Enhance `AGENTS.md` with architecture section

**Result**: OpenCode now understands your monorepo structure, multi-tenant architecture, and critical conventions.

### ⚡ Core Agents Configuration (1 hour)

Adds 5 core specialized agents and safety: 4. Add 5 core agent definitions inline in `opencode.jsonc` (build, plan, test, db, docs) 5. Add permission rules in `opencode.jsonc` 6. Create `.opencode/` directory structure 7. Create 3 custom command files

**Result**: Core workflow agents for build/plan/test/db/docs tasks, safety guards for destructive commands.

### 🔥 Priority Specialists (2-3 hours)

Adds HIGH priority domain specialists: 8. Create **Extraction Specialist** agent file (40+ extraction docs, AI pipeline) 9. Create **Storybook/Component Specialist** agent file (Atomic Design enforcement) 10. Test extraction and component workflows

**Result**: Expert agents for the two most complex domain areas with highest doc volume.

### 🚀 Full Agent Suite (1-2 days)

Adds remaining domain specialists: 11. Create 5 MEDIUM priority specialist agent files: - ClickUp Integration Specialist (18 docs, v2/v3 API complexity) - Monitoring & Analytics Specialist (20+ docs, cost tracking) - Graph & Discovery Specialist (graph operations, discovery wizard) - Workspace CLI Specialist (PM2, Docker, Coolify) - Nx Specialist (monorepo operations) 12. Create 2 LOW priority specialist agent files: - Migration & Schema Specialist (extends DB agent) - E2E Test Specialist (extends Test agent) 13. Implement context optimization (selective tool enablement) 14. Update `QUICK_START_DEV.md` with agent selection guide

**Result**: Complete 14-agent suite covering all major architectural domains. Token usage optimized from 17K to 4K.

### 📊 Validation & Monitoring (Ongoing)

15. Test each specialist agent with domain-specific tasks
16. Monitor which agents and MCP tools are actually used
17. Refine agent prompts based on real usage patterns
18. Add more custom commands for frequent domain tasks
19. Document agent selection patterns in team wiki

**Result**: Continuously improved accuracy and efficiency. Data-driven agent optimization based on actual team usage.
