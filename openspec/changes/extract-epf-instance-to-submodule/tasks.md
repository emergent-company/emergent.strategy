## Phase 1: Create `emergent-epf` repo

- [ ] 1.1 Create `emergent-company/emergent-epf` repo on GitHub (private)
- [ ] 1.2 Copy instance files from `emergent-strategy/docs/EPF/_instances/emergent/` to repo root
- [ ] 1.3 Write `README.md` — purpose, submodule usage instructions, common git commands
- [ ] 1.4 Write `AGENTS.md` — AI agent instructions for consuming strategy context
- [ ] 1.5 Verify instance structure: `_epf.yaml`, `READY/`, `FIRE/`, `AIM/` at repo root
- [ ] 1.6 Push to main and confirm repo is accessible

## Phase 2: Update `emergent-strategy` (this repo)

- [ ] 2.1 Remove `docs/EPF/_instances/emergent/` directory from git
- [ ] 2.2 Add submodule: `git submodule add https://github.com/emergent-company/emergent-epf.git docs/EPF/_instances/emergent`
- [ ] 2.3 Verify submodule mounts correctly and EPF instance files appear
- [ ] 2.4 Update `AGENTS.md` — document the submodule and `git submodule update --init`
- [ ] 2.5 Update `.opencode/instructions.md` — note submodule dependency
- [ ] 2.6 Update `docs/EPF/README.md` — reflect new structure
- [ ] 2.7 Update `docs/EPF/AGENTS.md` — reflect new structure
- [ ] 2.8 Verify EPF CLI MCP tools work with the submodule path
- [ ] 2.9 Commit and push

## Phase 3: Update `emergent-company/emergent`

- [ ] 3.1 Remove ~401 framework residue files from `docs/EPF/` (schemas, definitions, templates, wizards)
- [ ] 3.2 Remove stale instance copy from `docs/EPF/_instances/emergent/`
- [ ] 3.3 Create `docs/EPF/` directory structure if needed for the submodule mount
- [ ] 3.4 Add submodule: `git submodule add https://github.com/emergent-company/emergent-epf.git docs/EPF/_instances/emergent`
- [ ] 3.5 Update `AGENTS.md` — document submodule, remove references to framework files
- [ ] 3.6 Update AI agent configuration (`.opencode/instructions.md` or equivalent)
- [ ] 3.7 Verify AI agent workflows see the strategy instance
- [ ] 3.8 Commit and push

## Phase 4: Documentation and onboarding pattern

- [ ] 4.1 Document the standard submodule pattern in `emergent-epf/README.md` for new repos
- [ ] 4.2 Add a section to org-level docs explaining how to add strategy context to a new repo
- [ ] 4.3 Consider adding lightweight CI check for submodule initialization
