## Context

The EPF strategy instance is the company-wide source of truth for product strategy, used by AI agents (OpenCode + OpenSpec) across all `emergent-company` repos. It currently exists in two places:

1. **`emergent-strategy`** — `docs/EPF/_instances/emergent/` (~66 files, canonical)
2. **`emergent-company/emergent`** — `docs/EPF/_instances/emergent/` (~80 files, stale/diverged copy)

The `emergent` repo also has ~401 files of EPF framework residue (schemas, definitions, templates, wizards) that belong in `canonical-epf` and are already embedded in the EPF CLI.

**Stakeholders**: All AI agents across the org, the EPF CLI, any developer working in emergent-company repos.

**Constraints**:
- AI agents must see strategy files natively in the working tree (no external API calls)
- EPF CLI discovers instances at `docs/EPF/_instances/<product>/` — this convention must stay
- The strategy instance changes infrequently (~66 files, mostly YAML)
- Must work for existing repos and be easy to adopt for new repos

**Dependencies**: This change requires `fix-epf-cli-submodule-discovery` to be completed first so the EPF CLI discovers instances in repos without a local `schemas/` directory.

## Goals / Non-Goals

**Goals:**
- Single source of truth for the EPF strategy instance
- Every repo in `emergent-company` can access the strategy instance at a consistent path
- AI agents see the files in the working tree without special configuration
- EPF CLI path discovery works unchanged
- Clear documentation for onboarding new repos

**Non-Goals:**
- Creating a package manager or dependency system (submodules are sufficient)
- Automating submodule updates across repos (manual `git submodule update` is fine for ~66 files)
- Moving the EPF CLI or framework code (only the instance moves)
- EPF CLI code changes (handled in `fix-epf-cli-submodule-discovery`)

## Decisions

### Decision 1: Git submodules over sibling clone

**Choice**: Git submodule mounted at `docs/EPF/_instances/emergent/` in each consumer repo.

**Why**: Files appear in the working tree automatically after `git submodule update --init`. AI agents and the EPF CLI see them at the standard path. No MCP configuration changes needed. Developers get the files on clone.

**Alternatives considered**:
- **Sibling clone**: Requires each developer/CI to know about and clone a sibling repo. MCP tools must be configured per-repo to point to the sibling path. Poor discoverability.
- **Git subtree**: Merges files into the repo's history. Harder to update from upstream. Not a true shared reference.
- **npm/Go module**: Overkill for ~66 YAML files. Adds build-time dependency management.
- **Symlinks**: Don't work well across platforms. Git doesn't track symlink targets.

### Decision 2: Repo structure — instance at repo root

```
emergent-company/emergent-epf/
├── _epf.yaml                     # Anchor file
├── README.md                     # Purpose, usage, submodule instructions
├── AGENTS.md                     # AI agent instructions for strategy context
├── READY/                        # North star, personas, strategy formula
├── FIRE/                         # Features, roadmap, value model
└── AIM/                          # Assessments, LRA
```

**Why**: The repo root IS the instance directory. When mounted as a submodule at `docs/EPF/_instances/emergent/`, the READY/FIRE/AIM directories appear directly at that path. No nesting issue.

### Decision 3: Consumer repo mounting pattern

Each consumer repo adds:

```bash
git submodule add https://github.com/emergent-company/emergent-epf.git docs/EPF/_instances/emergent
```

This creates a `.gitmodules` entry and a gitlink at the mount point. After cloning, run:

```bash
git submodule update --init
```

### Decision 4: AI agent configuration

Consumer repos should include in their `AGENTS.md` or `.opencode/instructions.md`:

```markdown
## EPF Strategy Context

The company-wide EPF strategy instance is available at `docs/EPF/_instances/emergent/`.
This is a git submodule — run `git submodule update --init` if the directory is empty.

Use EPF CLI MCP tools with `instance_path` pointing to this directory for:
- Strategic context lookups
- Value model analysis
- Feature-strategy alignment
```

No MCP configuration changes are needed — the EPF CLI tools accept `instance_path` as a parameter, and the path convention is unchanged.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Developers forget `git submodule update --init` | Empty directory, AI agents have no strategy context | Document in README, AGENTS.md. Add CI check that verifies submodule is initialized. |
| Submodule ref gets stale in consumer repos | Agents see outdated strategy | Strategy changes infrequently. When it does change, update submodule refs in consumer repos. |
| Submodule adds git complexity | Developers unfamiliar with submodules may struggle | ~66 files that change rarely. Document common commands. |
| GitHub permissions | Private repo submodules need auth | Use HTTPS URLs. GitHub grants access to org members automatically. |

## Migration Plan

### Phase 1: Create `emergent-epf` repo (no disruption)

1. Create empty repo `emergent-company/emergent-epf`
2. Copy instance files from `emergent-strategy/docs/EPF/_instances/emergent/`
3. Add `README.md` and `AGENTS.md`
4. Push to main

### Phase 2: Update `emergent-strategy` (this repo)

1. Remove `docs/EPF/_instances/emergent/` directory
2. Add git submodule pointing to `emergent-company/emergent-epf` at same path
3. Update documentation (AGENTS.md, .opencode/instructions.md, docs/EPF/README.md)
4. Verify EPF CLI tools still work with the submodule path

### Phase 3: Update `emergent-company/emergent`

1. Remove ~401 framework residue files from `docs/EPF/`
2. Remove stale instance copy from `docs/EPF/_instances/emergent/`
3. Add git submodule at `docs/EPF/_instances/emergent/`
4. Update AGENTS.md and documentation
5. Verify AI agent workflows

### Phase 4: Documentation and onboarding

1. Document the standard submodule pattern in `emergent-epf/README.md`
2. Add section to org-level docs for adding strategy context to new repos
3. Consider lightweight CI check for submodule initialization

### Rollback

Each phase is independent. If any phase fails:
- Phase 1: Delete the repo
- Phase 2: Remove submodule, restore files from git history
- Phase 3: Revert the commit
- Phase 4: Revert documentation changes

## Open Questions

1. **Repo visibility**: Should `emergent-epf` be public or private? Strategy data may be sensitive. Recommend: **private** (can always make public later).
2. **CI integration**: Should consumer repos have CI that checks submodule is initialized? Recommend: yes, lightweight check.
3. **Submodule branch**: Should the submodule track `main` or a specific tag? Recommend: track `main` (strategy evolves continuously, not versioned).
