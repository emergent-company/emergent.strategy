# OpenCode Configuration Plan for spec-server Project

## Executive Summary

Based on documentation research and analysis of your existing Copilot setup, here's a comprehensive plan to configure OpenCode for optimal developer experience and accuracy in this Nx monorepo.

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
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest", "--timeout-action=10000"]
    },
    "postgres": {
      "type": "local",
      "command": [
        "npx", "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://spec:spec@localhost:5432/spec"
      ]
    },
    "context7": {
      "type": "local",
      "command": [
        "npx", "-y", "@upstash/context7-mcp",
        "--api-key", "ctx7sk-77ad3f0a-32a5-4b23-8b82-1431d078b1c6"
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
          "nx run server-nest:migrate": "allow",
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
      "template": "Review pending database migrations:\n!`nx run server-nest:migrate -- --list`\n\nApply migrations if safe.",
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
    // Enable all MCP tools by default
    "playwright*": true,
    "postgres*": true,
    "context7*": true,
    "gh_grep*": true,
    "react-daisyui*": true
  }
}
```

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

- **Backend**: NestJS (apps/server-nest)
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
                   Vite Proxy (/api/*)
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
- Use `nx run server-nest:migrate` (never manual psql)
- Migrations tracked in `kb.schema_migrations` table
- See `docs/DATABASE_MIGRATIONS.md`

### Hot Reload (Already Working)
- Admin: Vite HMR (instant updates)
- Server: ts-node-dev with --respawn (2-5s restart)
- No configuration needed - enabled by default

## When to Use MCP Tools

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
!`nx run server-nest:migrate -- --list`

2. Use postgres MCP to verify schema exists

3. Check for missing columns referenced in code

4. Suggest migration if needed
```

---

## 4. Agents (Create `.opencode/agent/` directory)

### 4.1 `.opencode/agent/nx-specialist.md`
```markdown
---
description: Nx monorepo operations and optimization
mode: subagent
temperature: 0.1
---

You are an Nx specialist. Always use Nx commands over direct tool invocation:

- Build: `nx run <project>:build`
- Test: `nx run <project>:test`
- Affected: `nx affected:test`

Never run npm/yarn directly in workspace packages - use Nx targets.

Before answering Nx questions, use the nx_workspace and nx_docs MCP tools.
```

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
```

---

## 5. Migration Strategy

### Phase 1: Initial Setup (Day 1)
1. ✅ Project config already exists (`opencode.jsonc`)
2. Enhance `AGENTS.md` with project patterns
3. Create `.opencode/` directory structure
4. Add custom commands (3 files)
5. Add specialized agents (2 files)
6. Run `/init` in OpenCode to analyze project

### Phase 2: Team Adoption (Week 1)
1. Document OpenCode usage in `QUICK_START_DEV.md`
2. Share configuration via Git
3. Train team on Plan vs Build agents
4. Create project-specific commands for common tasks

### Phase 3: Optimization (Week 2-4)
1. Monitor which MCP tools are most used
2. Disable unused tools to reduce context
3. Refine agent prompts based on usage
4. Add more custom commands for repetitive tasks

---

## 6. Key Differences from Copilot

| Feature | GitHub Copilot | OpenCode |
|---------|---------------|----------|
| **Instructions** | `.github/copilot-instructions.md` + `.github/instructions/*.md` | `AGENTS.md` + `instructions` in config |
| **Context** | Automatic from workspace | Explicit via MCP servers + instructions |
| **Agents** | Single assistant | Multiple specialized agents (Plan, Build, Test, DB) |
| **Commands** | Limited custom commands | Full custom command system with templates |
| **Permissions** | Always allowed | Granular per-tool and per-bash-command |
| **State** | Stateful across workspace | Per-session with subagent isolation |

---

## 7. Recommended Next Steps

1. **Create `.opencode/` directory structure**:
   ```bash
   mkdir -p .opencode/{agent,command}
   ```

2. **Enhance `opencode.jsonc`** with full configuration above

3. **Update `AGENTS.md`** with project-specific patterns

4. **Create 5 custom files**:
   - `.opencode/command/speckit-plan.md`
   - `.opencode/command/fix-tests.md`
   - `.opencode/command/db-check.md`
   - `.opencode/agent/nx-specialist.md`
   - `.opencode/agent/integration-specialist.md`

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

| Copilot | OpenCode |
|---------|----------|
| `.github/copilot-instructions.md` | Add to `instructions` in config |
| `.github/instructions/*.md` | Add glob pattern to `instructions` |
| `.github/prompts/*.md` | Convert to custom commands in `.opencode/command/` |

**No file deletion needed** - OpenCode can reference your existing instruction files directly via the `instructions` config option.

---

## 9. Accuracy & Context Optimization

### High Context Usage Warning
Your current setup has **5 MCP servers** enabled. Each adds context:

- `playwright`: ~2-5K tokens (methods + snapshots)
- `postgres`: ~1-3K tokens (schema + queries)
- `context7`: ~1-2K tokens (search results)
- `gh_grep`: ~1-2K tokens (code examples)
- `react-daisyui`: ~1-2K tokens (component docs)

**Total**: ~10-15K tokens just from MCP tools before any code context.

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
    
    // Always available
    "postgres*": true
  },
  
  "agent": {
    "test": {
      "tools": {
        "playwright*": true  // Enable only for test agent
      }
    },
    "docs": {
      "tools": {
        "context7*": true,  // Enable only for docs agent
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

- **postgres**: "use postgres to check schema"
- **playwright**: "use playwright to test this"
- **context7**: "use context7 to search React docs"

Don't load all tools automatically.
```

---

## 10. Testing the Configuration

After setup, test each agent:

```bash
# Start OpenCode
opencode

# Test Plan agent (Tab to switch)
<Tab>
"Analyze the authentication flow in @apps/server-nest/src/modules/auth/"

# Test custom command
"/test server-nest"

# Test subagent
"@db check if kb_purpose column exists in projects table"

# Test MCP tools
"use postgres to show all tables in kb schema"
```

---

## Summary

**Recommended Configuration Priority**:
1. ✅ **MCP servers** (already configured)
2. 🔥 **Enhanced AGENTS.md** (critical for accuracy)
3. 🔥 **instructions glob pattern** (leverage existing .github/ files)
4. ⚡ **Specialized agents** (plan, test, db)
5. ⚡ **Custom commands** (speckit-plan, fix-tests, db-check)
6. ✨ **Permissions** (safety for destructive commands)
7. ✨ **Tool optimization** (reduce context usage)

This configuration provides:
- **Accuracy**: Comprehensive context from existing instruction files
- **Safety**: Granular permissions for destructive operations
- **Efficiency**: Specialized agents reduce context pollution
- **Team Consistency**: Shared configuration via Git
- **Developer Experience**: Custom commands for common workflows
