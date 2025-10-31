# Development Process Manager (Legacy Notice)

The custom process manager previously documented here has been fully retired. The repository now standardizes on the Workspace CLI (`workspace:*` scripts) that orchestrates services via PM2 and Nx targets.

## Current Workflow

- Use `workspace:start`, `workspace:stop`, `workspace:status`, and related scripts for local development lifecycle management.
- See `QUICK_START_DEV.md`, `SETUP.md`, and `.github/instructions/admin.instructions.md` for the active automation workflow.

## Why This Page Remains

This document is kept only as historical reference. The implementation details described in earlier revisions are obsolete and should not be revived.

If you encounter references to `scripts/dev-manager.mjs` or `npm run dev:*` commands, replace them with the corresponding Workspace CLI scripts.
