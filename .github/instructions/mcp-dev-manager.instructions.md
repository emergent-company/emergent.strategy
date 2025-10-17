---
applyTo: "**"
---

# Archived: MCP Dev Manager Instructions

The MCP automation layer referenced in earlier revisions has been removed. GitHub Copilot and other assistants should exclusively use the Workspace CLI npm scripts and Nx targets documented in:

- `docs/DEV_PROCESS_MANAGER.md`
- `.github/instructions/admin.instructions.md`
- `.github/instructions/testing.instructions.md`

Any references to `mcp_dev-manager_*` commands are obsolete and should be replaced with the Workspace CLI equivalents (`npm run workspace:*`, `nx run <project>:<target>`, or direct package-level scripts).
