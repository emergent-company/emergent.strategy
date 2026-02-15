# Change: Extract EPF strategy instance to dedicated repo with submodules

## Why

The EPF strategy instance (`docs/EPF/_instances/emergent/`) contains the company-wide strategy for all repos in `emergent-company`. Currently it lives in `emergent-strategy`, but that repo is for **tools that build strategy** (EPF CLI), not the strategy itself. Meanwhile, `emergent` has a stale/diverged copy of the same instance plus ~401 files of framework residue from an older EPF version.

All repos in the org use OpenCode AI agents for coding and OpenSpec for planning. These agents must always have access to the EPF strategy instance to inform decisions. The current setup fails this requirement: agents in `emergent` see stale data, and agents in any new repo see nothing.

## What Changes

### 1. Create new repo `emergent-company/emergent-epf`

- Contains the canonical EPF strategy instance (~66 YAML files)
- Structure: `_epf.yaml`, READY/, FIRE/, AIM/ at repo root
- Includes `AGENTS.md` with instructions for AI agents consuming strategy context
- Includes `README.md` explaining the repo's purpose and submodule usage

### 2. Update `emergent-strategy` (this repo)

- **REMOVE** `docs/EPF/_instances/emergent/` (the actual instance files)
- **ADD** git submodule at `docs/EPF/_instances/emergent/` pointing to `emergent-company/emergent-epf`
- **UPDATE** `AGENTS.md`, `.opencode/instructions.md` to document the submodule
- **UPDATE** `docs/EPF/AGENTS.md` and `docs/EPF/README.md` to reflect the new structure

### 3. Update `emergent-company/emergent` (remote repo)

- **REMOVE** ~401 framework residue files from `docs/EPF/` (schemas, definitions, templates, wizards)
- **REMOVE** stale instance copy from `docs/EPF/_instances/emergent/`
- **ADD** git submodule at `docs/EPF/_instances/emergent/` pointing to `emergent-company/emergent-epf`
- **UPDATE** AGENTS.md and AI agent configuration to reference the submodule path

### 4. Establish pattern for future repos

- Document the standard: any `emergent-company` repo that needs strategy context adds the submodule at `docs/EPF/_instances/emergent/`
- AI agents see files natively in the working tree — no special MCP configuration needed
- The `docs/EPF/_instances/emergent/` path convention stays identical across all repos

## Dependencies

- **Requires**: `fix-epf-cli-submodule-discovery` must be completed first so the EPF CLI works in consumer repos without local `schemas/` directory.

## Impact

- Affected repos: `emergent-strategy`, `emergent-company/emergent`, new `emergent-company/emergent-epf`
- Affected specs: `epf-instance-management` (NEW: shared instance, single source of truth, onboarding)
- **No code changes** — all CLI upgrades are in `fix-epf-cli-submodule-discovery`
- **No breaking changes** — submodule mounting preserves the `docs/EPF/_instances/emergent/` path
- **Risk**: Developers must run `git submodule update --init` after cloning. Mitigated by documentation and CI checks.
