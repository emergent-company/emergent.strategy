# Tasks: EPF Value Model Semantic Guardrails

> Execution plan for preventing product-catalog value models in EPF.
> See `proposal.md` for root cause analysis, `design.md` for technical decisions.
> **Target repo:** `emergent-strategy` (epf-cli embedded files + Go code)

## Phase 1: Documentation & Agent Guidance

Highest-impact, lowest-effort changes. These go into `apps/epf-cli/internal/embedded/` and directly affect AI agent behavior.

### Task 1.1: Create Structural Anti-Patterns Guide
**File:** `apps/epf-cli/internal/embedded/guides/VALUE_MODEL_STRUCTURAL_ANTI_PATTERNS.md` (new)
**Status:** done
**Priority:** P0
**Description:**
Document the product-catalog anti-pattern with the same rigor as the existing business-language guide:
- **Anti-pattern: Product Catalog Masquerading as Value Model**
  - What it looks like (layers named after products, 1:1 product-to-component mapping)
  - Why it happens (taxonomic instinct, copying portfolio structure)
  - Real-world example: Huma's 5 domain value models (before/after from proposal.md)
  - The litmus tests:
    1. "Remove any product — does the layer name still make sense?"
    2. "Can multiple products contribute to the same L2?"
    3. "Does the model describe categories of value delivery or product inventory?"
  - How to restructure: identify value delivery categories, group by function not product
- **Anti-pattern: One File Per Product Domain**
  - Splitting what should be one value model into per-domain files
  - Symptom: multiple `product.*.value_model.yaml` files where layers overlap in purpose
- **Anti-pattern: L1 = Product, L2 = Product Features**
  - When L1 layers are just product names and L2 components are that product's features
  - Correct: L1 = value delivery category, L2 = functional class, L3 = implementations (which may map to products)
- **Terminology note:** Valid organizing principles include sequential flow (Strategy track), functional decomposition (OrgOps, Commercial tracks), and domain-specific patterns (Product track). The common rule: layers are categories of value delivery, never products/brands/offerings.

### Task 1.2: Update Product Architect Wizard
**File:** `apps/epf-cli/internal/embedded/wizards/product_architect.agent_prompt.md`
**Status:** done
**Priority:** P0
**Description:**
Add explicit guardrails to the value model creation section:
- Add a "Value Model Structure Rules" section before the creation workflow:
  - "L1 layers MUST be named after categories of value delivery, NOT products or brands"
  - "L2 components MUST be functional classes, NOT individual products"
  - "Products appear at L3 as implementations that deliver value through the L2 class"
  - "If your layer names match entries in `product_portfolio.yaml`, STOP and restructure"
- Add a mandatory self-check step after drafting a value model:
  - "Before writing the file, verify: (1) no L1/L2 names match product/brand names, (2) multiple features could contribute to each L2, (3) removing any single product wouldn't invalidate the layer structure"
- Add the Huma case as a cautionary example
- Add guidance on when to use one vs multiple value model files for Product track:
  - "Use separate files when the value delivery domains are truly independent (e.g., hardware vs software vs ocean CDR)"
  - "Do NOT split by product line or brand — that creates product catalogs"

### Task 1.3: Update Agent Instructions
**File:** `apps/epf-cli/internal/embedded/AGENTS.md`
**Status:** done
**Priority:** P0
**Description:**
Add value model quality rules to the instructions that AI agents see on every session:
- "Value models describe categories of value delivery, not product catalogs"
- "Never name L1 layers after products or brands"
- "After creating a value model, cross-check layer names against product_portfolio.yaml — zero matches expected"
- Reference the new structural anti-patterns guide

### Task 1.4: Update Value Model Template Comments
**File:** `apps/epf-cli/internal/embedded/templates/FIRE/value_models/product.value_model.yaml`
**Status:** done
**Priority:** P1
**Description:**
Add inline comments to the template that warn against product-catalog structure:
- At the `layers:` key: "# Layers represent CATEGORIES OF VALUE DELIVERY, not products. Example: 'Energy Transformation', not 'Io Core Battery'"
- At the `components:` key: "# Components are FUNCTIONAL CLASSES within the value delivery category. Multiple products may contribute to one component."
- At `sub_components:`: "# Sub-components are concrete capabilities. Products appear here as implementations."

---

## Phase 2: Heuristic Validation

Automated checks that can detect the product-catalog anti-pattern without AI reasoning. All heuristics go into `apps/epf-cli/internal/valuemodel/quality.go` (see design.md Decision 3).

### Task 2.1: Product-Name Collision Detector
**File:** `apps/epf-cli/internal/valuemodel/quality.go` (new)
**Status:** done
**Priority:** P0
**Description:**
Create the product-name collision check:
1. Extract all product names, brand names, and offering names from `product_portfolio.yaml`
2. Extract all L1 layer names, L2 component names from value model files
3. Fuzzy-match (case-insensitive, partial match) layer/component names against product/brand names
4. If >30% of L1 names or >40% of L2 names match product/brand names, emit WARNING:
   "Value model may be organized as a product catalog. L1 layers should be categories of value delivery, not products."
5. List the matching names with suggestions

**Implementation notes:**
- Build on `internal/valuemodel/` types (loader.go) per design.md Decision 2
- Must handle the case where `product_portfolio.yaml` doesn't exist (skip check gracefully with INFO message)
- Export a `QualityReport` struct that all checks contribute to

### Task 2.2: One-to-One Mapping Detector
**File:** `apps/epf-cli/internal/valuemodel/quality.go`
**Status:** done
**Priority:** P1
**Description:**
Check the cardinality of feature->value_model_component relationships:
1. For each L2 component, count how many features have `contributes_to` pointing at it
2. For each feature, count how many L2 components it contributes to
3. If the mapping is predominantly 1:1 (>70% of components have exactly 1 feature, >70% of features point to exactly 1 component), emit WARNING:
   "Value model has predominantly 1:1 feature mapping. This may indicate a product-catalog structure. Value delivery models typically have many-to-many relationships."

**Implementation notes:**
- Requires loading both value models AND feature definitions — accept paths/loaded data as parameters
- Part of the `QualityReport` struct from Task 2.1

### Task 2.3: Layer Name Heuristic Analysis
**File:** `apps/epf-cli/internal/valuemodel/quality.go`
**Status:** done
**Priority:** P1
**Description:**
Apply heuristic patterns to layer/component names:
- **Flag:** Names containing proper nouns not found in a standard dictionary (likely brand/product names)
- **Flag:** Names that are very specific (e.g., "Fischer-Tropsch Refinery") vs abstract (e.g., "Fuel Synthesis")
- **Positive signal:** Names with process/action words ("Transformation", "Processing", "Delivery", "Management", "Exchange", "Integration", "Operations")
- **Positive signal:** Names describing functional classes ("Heat Exchange", "Energy Storage", "Service Delivery")
- Emit INFO-level messages for flagged names, not errors — this is guidance, not enforcement

### Task 2.4: Multi-File Overlap Detection
**File:** `apps/epf-cli/internal/valuemodel/quality.go`
**Status:** done
**Priority:** P2
**Description:**
When multiple `product.*.value_model.yaml` files exist for the Product track:
1. Check if L1 layer names or descriptions overlap in purpose across files
2. Check if the same products appear in multiple value models
3. If significant overlap detected, emit WARNING:
   "Multiple Product value models have overlapping value domains. Consider consolidating into fewer files organized by independent value delivery chains."

---

## Phase 3: Quality Scoring & Health Check Integration

### Task 3.1: Value Model Quality Score
**File:** `apps/epf-cli/internal/valuemodel/quality.go`
**Status:** done
**Priority:** P1
**Description:**
Create a quality scoring system that aggregates all heuristic checks:

| Check | Weight | Score Range |
|---|---|---|
| No product-name collisions (Task 2.1) | 30% | 0-100 |
| Many-to-many relationship ratio (Task 2.2) | 20% | 0-100 |
| Layer name quality heuristic (Task 2.3) | 20% | 0-100 |
| L2 component diversity per L1 | 15% | 0-100 |
| L3 distribution evenness | 15% | 0-100 |

Overall quality score = weighted average. Thresholds:
- 80+: Good — value delivery category organization
- 60-79: Warning — possible structural issues
- <60: Alert — likely product-catalog anti-pattern

Export as part of the `QualityReport` struct.

### Task 3.2: Integrate into Health Check
**File:** `apps/epf-cli/cmd/health.go` (modified)
**Status:** done
**Priority:** P1
**Description:**
Add a new health check file following the pattern of existing checks (`features.go`, `relationships.go`, `coverage.go`):
- Call `internal/valuemodel/quality.go` functions
- Format results into the health check report structure
- Add a "Value Model Quality" section to the report:
```
## Value Model Quality
- Models analyzed: 4
- Average quality score: 85/100
- Warnings: 0
- Alerts: 0
```
- Only show section when value models exist

### Task 3.3: Add to MCP Tool Output
**File:** `apps/epf-cli/internal/mcp/server.go` (existing health check handler)
**Status:** done
**Priority:** P2
**Description:**
Ensure the `epf_health_check` MCP tool response includes value model quality data so AI agents see it during routine health checks. Wire the `internal/checks/valuemodel_quality.go` check into the existing health check flow.

---

## Phase 4: Design Exploration (Future)

### Task 4.1: Design Value Model Review Wizard
**File:** Design document (not implementation)
**Status:** done
**Priority:** P2
**Description:**
Design a "value model review" wizard that agents run after creating/modifying a value model:
- Takes the value model + product portfolio as input
- Asks structured questions about the model's organization
- Produces a review report with specific recommendations
- Could be a post-creation step in the product_architect wizard

Questions to explore:
- Should this be a separate wizard or an extension of product_architect?
- Should it be mandatory (always run) or optional (agent judgment)?
- Can it be effective without LLM reasoning (pure heuristics + templates)?

### Task 4.2: Explore Schema Extensions
**Status:** done
**Priority:** P3
**Description:**
Research whether JSON Schema 2020-12 or custom keywords could express constraints like:
- "layer.name must not match any entry in an external file"
- "components should have cardinality > 1 in relationship mapping"

Likely conclusion: this is beyond JSON Schema's capability and must stay in validation code. But worth documenting the boundary clearly.

---

## Phase 5: Value Model Review Wizard Implementation

Based on Decision 9 in design.md. Creates a standalone review wizard for value model quality, registers it in the wizard system, and wires advisory nudges so agents discover it.

### Task 5.1: Create Value Model Review Wizard
**File:** `apps/epf-cli/internal/embedded/wizards/value_model_review.agent_prompt.md` (new)
**Status:** done
**Priority:** P1
**Description:**
Write the wizard following the 5-step structure from Decision 9:
1. **Load Context** — Read value model files, product_portfolio.yaml, run AssessQuality() via MCP
2. **Present Quality Report** — Overall score, per-check results, specific warnings
3. **Guided Review** — For each warning: explain, ask litmus-test questions, propose restructuring
4. **Domain Validation** — Walk through L1 layers and L1→L2 relationships with targeted questions
5. **Produce Review Report** — Summary with score, litmus test pass/fail, restructuring recommendations

Must follow existing wizard conventions:
- Agent prompt persona definition at top (like product_architect, balance_checker)
- Include trigger phrases in metadata for recommender matching
- Reference `AssessQuality` MCP tool data (the wizard interprets heuristic results, not re-implements them)
- Include the three litmus tests from the anti-patterns guide
- Business language — no technical jargon in wizard output

### Task 5.2: Register Wizard in Type System
**File:** `apps/epf-cli/internal/wizard/types.go` (modified)
**Status:** done
**Priority:** P1
**Description:**
Add the new wizard to both registration maps:
- Add `"value_model_review": schema.PhaseFIRE` to `PhaseForWizard` map
- Add keyword mappings to `KeywordMappings`:
  - `"review value model"`: `{"value_model_review"}`
  - `"value model review"`: `{"value_model_review"}`
  - `"value model quality"`: `{"value_model_review"}`
  - `"anti-pattern"`: `{"value_model_review"}`
  - Update existing `"value model"` entry to include `value_model_review` after `product_architect`
  - Update existing `"review"` entry to include `value_model_review` after `synthesizer`

### Task 5.3: Wire Advisory Nudges
**Files:** `apps/epf-cli/internal/embedded/wizards/product_architect.agent_prompt.md` (modified), `apps/epf-cli/cmd/health.go` (modified), `apps/epf-cli/internal/mcp/server.go` (modified)
**Status:** done
**Priority:** P2
**Description:**
Add cross-references so agents discover the review wizard:
- **product_architect**: In the "mandatory self-check after drafting" section, add: "For comprehensive structural analysis, run the value model review wizard after writing the file."
- **health.go**: In `printValueModelQualitySummary()`, when score is warning/alert level, add suggestion: "Consider running the value_model_review wizard for guided remediation."
- **server.go**: In the `handleHealthCheck()` value model quality section, when alerts/warnings exist, add the same suggestion to the markdown output.

### Task 5.4: Build and Test
**Status:** done
**Priority:** P1
**Description:**
- Run `go build ./...` — verify clean compilation
- Run `go test ./...` — verify all tests pass (wizard loader should auto-discover the new file)
- Verify the new wizard appears in `epf_list_wizards` output (FIRE phase)
- Verify `epf_get_wizard_for_task` recommends it for "review my value model" and "check value model quality"

---

## Execution Order

```
Phase 1 (Documentation) --> Phase 2 (Heuristic Validation) --> Phase 3 (Scoring)
    | immediate impact           | automated detection           | integrated reporting
    via agent instructions       via quality.go                  via health check

Phase 4 (Design) --> Phase 5 (Wizard Implementation)
    | design decisions       | wizard + registration + nudges
    via design.md            via embedded wizard + types.go
```

Phase 1 is the highest-priority work because it directly affects AI agent behavior on every value model creation. Phase 2 creates the heuristic functions. Phase 3 wires them into the standard workflow. Phase 4 explores design decisions. Phase 5 implements the review wizard designed in Phase 4.

## Estimated Effort

| Phase | Tasks | Effort | Impact |
|---|---|---|---|
| Phase 1: Documentation | 4 tasks | 1-2 sessions | High (prevents new occurrences) |
| Phase 2: Heuristics | 4 tasks | 2-3 sessions | High (detects existing problems) |
| Phase 3: Scoring | 3 tasks | 2-3 sessions | Medium (integrated reporting) |
| Phase 4: Design | 2 tasks | 1 session | Low (future foundation) |
| Phase 5: Wizard | 4 tasks | 1-2 sessions | Medium (guided remediation) |
| **Total** | **17 tasks** | **7-11 sessions** | |
