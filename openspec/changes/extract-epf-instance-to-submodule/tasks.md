## Phase 1: Create `emergent-epf` repo

- [x] 1.1 Create `emergent-company/emergent-epf` repo on GitHub (private)
- [x] 1.2 Copy instance files from `emergent-strategy/docs/EPF/_instances/emergent/` to repo root
- [x] 1.3 Write `README.md` — purpose, submodule usage instructions, common git commands
- [x] 1.4 Write `AGENTS.md` — AI agent instructions for consuming strategy context
- [x] 1.5 Verify instance structure: `_epf.yaml`, `READY/`, `FIRE/`, `AIM/` at repo root
- [x] 1.6 Push to main and confirm repo is accessible

## Phase 2: Update `emergent-strategy` (this repo)

- [x] 2.1 Remove `docs/EPF/_instances/emergent/` directory from git
- [x] 2.2 Add submodule: `git submodule add https://github.com/emergent-company/emergent-epf.git docs/EPF/_instances/emergent`
- [x] 2.3 Verify submodule mounts correctly and EPF instance files appear
- [x] 2.4 Update `AGENTS.md` — document the submodule and `git submodule update --init`
- [x] 2.5 Update `.opencode/instructions.md` — note submodule dependency
- [x] 2.6 Update `docs/EPF/README.md` — reflect new structure
- [x] 2.7 Update `docs/EPF/AGENTS.md` — reflect new structure
- [x] 2.8 Verify EPF CLI MCP tools work with the submodule path
- [x] 2.9 Commit and push

## Phase 3: Update `emergent-company/emergent`

- [x] 3.1 Remove entire `docs/EPF/` directory (406 files: 343 framework + 62 stale instance + 1 README)
- [x] 3.2 Add submodule: `git submodule add https://github.com/emergent-company/emergent-epf.git docs/EPF/_instances/emergent`
- [x] 3.3 Update `AGENTS.md` — added EPF Strategy Context section with submodule instructions
- [x] 3.4 Update `.opencode/instructions.md` — added EPF Strategy Context section
- [x] 3.5 Verify AI agent workflows see the strategy instance (EPF CLI health check passes 13/15)
- [x] 3.6 Commit `69b890f` on main
- [ ] 3.7 Push to remote (blocked: `nikf2001` lacks SSH push access to `emergent-company/emergent`)

Note: MCP server configuration for epf-cli in `emergent` repo deferred — binary is not in PATH and has no portable distribution mechanism yet.

## Phase 4: Documentation and onboarding pattern

- [x] 4.1 Document the standard submodule pattern in `emergent-epf/README.md` for new repos — added "Onboarding a New Repo" checklist
- [x] 4.2 Add a section to org-level docs explaining how to add strategy context to a new repo — covered in same README section + consumer repo table
- [x] 4.3 Add lightweight CI check pattern for submodule initialization — documented GitHub Actions and shell script examples in README
