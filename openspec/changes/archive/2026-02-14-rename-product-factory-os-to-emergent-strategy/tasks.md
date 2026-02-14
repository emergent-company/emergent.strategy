# Implementation Tasks

## 1. Category 1 — Repo/Path References

### 1.1 AGENTS.md path references

- [x] 1.1.1 Update `apps/epf-cli/AGENTS.md` lines 13, 20: `docs/product-factory-os/MASTER_PLAN.md` → `docs/emergent-strategy/MASTER_PLAN.md`
- [x] 1.1.2 Update `apps/epf-cli/internal/embedded/AGENTS.md` lines 13, 20: same change (embedded copy)

### 1.2 EPF mappings — old GitHub URLs

- [x] 1.2.1 Update `docs/EPF/_instances/emergent/FIRE/mappings.yaml` lines 225, 255: `eyedea-io/emergent` → `emergent-company/emergent.strategy`

### 1.3 Openspec proposals — old paths

- [x] 1.3.1 Update `openspec/changes/add-epf-cli-wizard-support/proposal.md` line 545: old repo path reference
- [x] 1.3.2 Update `openspec/changes/archive/add-epf-cli-output-generator-support/proposal.md` line 662: old repo path reference

### 1.4 EPF artifacts — old paths

- [x] 1.4.1 Update `docs/EPF/_instances/emergent/FIRE/value_models/product.epf-runtime.value_model.yaml` line 787: old GitHub URL
- [x] 1.4.2 Update `docs/EPF/_instances/emergent/FIRE/feature_definitions/fd-013_product_factory_os_developer_console.yaml` line 437: old path reference

## 2. Category 2 — Product/Concept Name References

Note: In documentation/narrative content, use "Emergent Strategy (formerly ProductFactoryOS)" for first mention, then "Emergent Strategy" thereafter.

### 2.1 MASTER_PLAN.md

- [x] 2.1.1 Update `docs/emergent-strategy/MASTER_PLAN.md`: rename ~7 "ProductFactoryOS" references to "Emergent Strategy (formerly ProductFactoryOS)"

### 2.2 PFoS Go app CLI descriptions

- [x] 2.2.1 Update `apps/emergent-strategy/cmd/root.go`: CLI description strings
- [x] 2.2.2 Update `apps/emergent-strategy/cmd/tui.go`: TUI header/descriptions
- [x] 2.2.3 Update `apps/emergent-strategy/cmd/server.go`: server description
- [x] 2.2.4 Update `apps/emergent-strategy/cmd/version.go`: version output
- [x] 2.2.5 Update `apps/emergent-strategy/README.md`: title and descriptions

### 2.3 EPF CLI references

- [x] 2.3.1 Update `apps/epf-cli/cmd/root.go` line 17: "ProductFactoryOS" reference
- [x] 2.3.2 Update `apps/epf-cli/README.md` lines 3, 207: "product-factory-os" references

### 2.4 EPF feature definitions

- [x] 2.4.1 Update `docs/EPF/_instances/emergent/FIRE/feature_definitions/fd-013_product_factory_os_developer_console.yaml`: ~12 "ProductFactoryOS" references (rename feature concept to "Emergent Strategy Developer Console")
- [x] 2.4.2 Update `docs/EPF/_instances/emergent/FIRE/feature_definitions/fd-012_cli_local_workflow_testing.yaml` line 690: "ProductFactoryOS" reference
- [x] 2.4.3 Update `docs/EPF/_instances/emergent/FIRE/feature_definitions/fd-006_integration_framework.yaml` lines 491, 523: "ProductFactoryOS" references

### 2.5 EPF value model

- [x] 2.5.1 Update `docs/EPF/_instances/emergent/FIRE/value_models/product.epf-runtime.value_model.yaml`: ~15 "ProductFactoryOS" references

### 2.6 EPF mappings (concept references)

- [x] 2.6.1 Update `docs/EPF/_instances/emergent/FIRE/mappings.yaml` lines 220, 226, 256: "ProductFactoryOS" product name references

### 2.7 EPF product portfolio

- [x] 2.7.1 Update `docs/EPF/_instances/emergent/product_portfolio.yaml` line 221: "ProductFactoryOS" reference

### 2.8 Openspec proposals (concept references)

- [x] 2.8.1 Scan all `openspec/changes/*/proposal.md` and `design.md` files for "ProductFactoryOS" / "product-factory-os" mentions and update them

## 3. Category 3 — Directory Renames

### 3.1 Rename apps directory

- [x] 3.1.1 `git mv apps/product-factory-os apps/emergent-strategy`
- [x] 3.1.2 Update `apps/emergent-strategy/go.mod` module path from `product-factory-os` → `emergent-strategy`
- [x] 3.1.3 Update all import paths within `apps/emergent-strategy/` Go files
- [x] 3.1.4 Update Makefile / build references if any point to old directory name

### 3.2 Rename docs directory

- [x] 3.2.1 `git mv docs/product-factory-os docs/emergent-strategy`
- [x] 3.2.2 Update all references to `docs/product-factory-os/` across the repo (AGENTS.md files, etc.)

## 4. Post-Rename Tasks

- [x] 4.1 Rebuild epf-cli binary (`make build` in `apps/epf-cli/`) — embedded AGENTS.md needs recompilation
- [x] 4.2 Run Go tests for epf-cli: `go test ./...` in `apps/epf-cli/`
- [x] 4.3 Run Go tests for emergent-strategy app: `go test ./...` in `apps/emergent-strategy/`
- [x] 4.4 Verify no remaining `product-factory-os` or `ProductFactoryOS` references: `rg -i "product.factory.os" --glob '!.git'`
- [x] 4.5 Commit and push

## Dependencies

- Category 3 (directory renames) should happen first, since Categories 1 and 2 reference files within those directories
- Task 4.1 (rebuild) must happen after all content changes are complete
- Task 4.4 (verification) is the final check before committing

## Notes

- The local directory `/Users/nikolaifasting/code/product-factory-os/` will NOT be renamed (it's just a local clone path)
- References to `eyedea-io/epf-canonical-definition.git` should be left as-is (that repo has not moved)
- The epf-cli Go module path was already updated in a prior commit (`ea63897a`) — this proposal covers the remaining non-Go references

## Completion

All tasks completed on 2026-02-14. Verified with `rg -i "product.?factory.?os"` - no remaining references found.
