# Change: Rename product-factory-os to emergent-strategy across the codebase

## Why

The repository has been migrated from `eyedea-io/emergent` to `emergent-company/emergent.strategy` and the Go module path has already been updated to use `emergent-strategy`. However, ~81 references to the old name "product-factory-os" / "ProductFactoryOS" remain scattered across documentation, EPF artifacts, CLI descriptions, openspec proposals, and two directories (`apps/product-factory-os/` and `docs/product-factory-os/`). This creates confusion about the project's identity and breaks the consistency between the repo name and internal references.

## What Changes

### Category 1: Repo/path references (~23 matches, 14 files)

- Update old GitHub URLs pointing to `eyedea-io/emergent` → `emergent-company/emergent.strategy`
- Update filesystem paths like `docs/product-factory-os/MASTER_PLAN.md` → `docs/emergent-strategy/MASTER_PLAN.md`
- Update Go module path in `apps/product-factory-os/go.mod` (the separate PFoS Go app, not epf-cli)

### Category 2: Product/concept references (~52 matches, 16 files)

- Replace "ProductFactoryOS" / "product-factory-os" as a product name with "Emergent Strategy" / "emergent-strategy" in:
  - EPF feature definitions, value models, persona narratives
  - MASTER_PLAN.md
  - CLI command descriptions (root.go, tui.go, server.go, version.go)
  - AGENTS.md files (both standalone and embedded in epf-cli)
  - openspec proposals that reference the old name
- Where renaming in documentation/narrative content, add "(formerly ProductFactoryOS)" parenthetical to maintain historical continuity

### Category 3: Directory renames (~13 path matches)

- **BREAKING**: Rename `apps/product-factory-os/` → `apps/emergent-strategy/`
- Rename `docs/product-factory-os/` → `docs/emergent-strategy/`
- Update all cross-references to these paths

### Post-rename

- Rebuild epf-cli binary (the embedded `AGENTS.md` is compiled into the Go binary)

## Impact

- Affected specs: None (this is a naming/identity change, not a behavior change)
- Affected code:
  - `apps/product-factory-os/` — entire Go app directory (will be renamed)
  - `apps/epf-cli/AGENTS.md` and `apps/epf-cli/internal/embedded/AGENTS.md`
  - `docs/product-factory-os/MASTER_PLAN.md` (directory rename)
  - `docs/EPF/_instances/emergent/FIRE/` — multiple feature definitions, value models, mappings
  - `docs/EPF/_instances/emergent/product_portfolio.yaml`
  - `openspec/changes/*/proposal.md` — historical references in existing proposals
- Breaking changes: Directory renames (`apps/product-factory-os/` and `docs/product-factory-os/`) will break any external scripts or bookmarks pointing to old paths
- Risk: Low — all changes are string replacements in content/paths, no logic changes
