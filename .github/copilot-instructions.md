# GitHub Copilot Instructions

## Self-Learning Protocol

Whenever you make a mistake, encounter an issue, or learn something important during a conversation:

1. **Identify the Lesson**: Clearly articulate what went wrong and why
2. **Document It**: Add an entry to `.github/instructions/self-learning.instructions.md`
3. **Format**: Use the structured format defined in that file
4. **Context**: Include enough context so future sessions can understand the lesson

## When to Document

- When user corrects you about project conventions or patterns
- When you misunderstand a requirement or instruction
- When a tool fails due to incorrect usage
- When you discover an anti-pattern in existing code
- When you violate documented conventions
- When you make an assumption that turns out wrong
- When user points out a critical oversight

## How to Document

Add a new entry to `.github/instructions/self-learning.instructions.md` following this structure:

```markdown
### [Date] - [Brief Title]

**Context**: What task/feature were you working on?

**Mistake**: What did you do wrong?

**Why It Was Wrong**: Root cause analysis

**Correct Approach**: What should have been done

**Prevention**: How to avoid this in the future

**Related Files/Conventions**: Links to relevant docs or code
```

## Priority

This is a **high-priority meta-task**. Before ending a conversation where you learned something significant, ensure it's documented in the self-learning file.

## Development Environment

### Hot Reload (Auto-Restart on File Changes)

**Hot reload is ENABLED BY DEFAULT** when running services via workspace CLI:

- **Admin (Frontend)**: Vite dev server with HMR (Hot Module Replacement)
  - Command: `npm run workspace:start` → launches `npm run dev` → `vite`
  - Updates: **Instant** (< 100ms) - no page reload needed
  - Watches: `apps/admin/src/**/*`, `apps/admin/index.html`
  - Browser console shows: `[vite] connected.` and `[vite] hmr update ...`

- **Server (Backend)**: ts-node-dev with auto-restart
  - Command: `npm run workspace:start` → launches `npm run start:dev` → `ts-node-dev --respawn`
  - Updates: **2-5 seconds** (recompile + restart)
  - Watches: `apps/server-nest/src/**/*.ts` (excludes node_modules)
  - Terminal logs show: `[ts-node-dev] restarting due to changes...`

**When users ask about hot reload or watch mode:**
- Inform them it's already working by default
- No configuration changes needed
- Point them to `docs/HOT_RELOAD.md` for troubleshooting
- Only production builds (`npm run build` + `npm run start`) disable hot reload

**PM2 Configuration:**
- Located: `tools/workspace-cli/pm2/ecosystem.apps.cjs`
- Admin uses: `args: ['run', 'dev']` (Vite HMR)
- Server uses: `args: ['run', 'start:dev']` (ts-node-dev watch)
- Both have `autorestart: true` for crash recovery
