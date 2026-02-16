# Tasks: EPF Value Model Semantic Guardrails

> Execution plan for preventing product-catalog value models in EPF.
> See `proposal.md` for root cause analysis and solution design.
> **Target repo:** `emergent-strategy` (canonical-epf + epf-cli)

## Phase 1: Documentation & Agent Guidance

Highest-impact, lowest-effort changes. These go into canonical-epf and propagate to epf-cli via embedded copies.

### Task 1.1: Create Structural Anti-Patterns Guide
**File:** `canonical-epf/docs/guides/VALUE_MODEL_STRUCTURAL_ANTI_PATTERNS.md` (new)
**Status:** pending
**Priority:** P0
**Description:**
Document the product-catalog anti-pattern with the same rigor as the existing business-language guide:
- **Anti-pattern: Product Catalog Masquerading as Value Model**
  - What it looks like (layers named after products, 1:1 product-to-component mapping)
  - Why it happens (taxonomic instinct, copying portfolio structure)
  - Real-world example: Huma's 5 domain value models (before/after)
  - The litmus tests:
    1. "Remove any product — does the layer name still make sense?"
    2. "Can multiple products contribute to the same L2?"
    3. "Does the model describe value flow or product inventory?"
  - How to restructure: identify value-generation stages, group by function not product
- **Anti-pattern: One File Per Product Domain**
  - Splitting what should be one value model into per-domain files
  - Symptom: multiple `product.*.value_model.yaml` files where layers overlap in purpose
- **Anti-pattern: L1 = Product, L2 = Product Features**
  - When L1 layers are just product names and L2 components are that product's features
  - Correct: L1 = value stage, L2 = functional class, L3 = implementations (which may map to products)

### Task 1.2: Update Product Architect Wizard
**File:** `canonical-epf/wizards/product_architect.agent_prompt.md`
**Status:** pending
**Priority:** P0
**Description:**
Add explicit guardrails to the value model creation section:
- Add a "Value Model Structure Rules" section before the creation workflow:
  - "L1 layers MUST be named after value-generation stages, NOT products or brands"
  - "L2 components MUST be functional classes, NOT individual products"
  - "Products appear at L3 as implementations that deliver value through the L2 class"
  - "If your layer names match entries in `product_portfolio.yaml`, STOP and restructure"
- Add a mandatory self-check step after drafting a value model:
  - "Before writing the file, verify: (1) no L1/L2 names match product/brand names, (2) multiple features could contribute to each L2, (3) removing any single product wouldn't invalidate the layer structure"
- Add the Huma case as a cautionary example (anonymized if needed)
- Add guidance on when to use one vs multiple value model files for Product track:
  - "Use separate files when the value-generation domains are truly independent (e.g., hardware vs software vs ocean CDR)"
  - "Do NOT split by product line or brand — that creates product catalogs"

### Task 1.3: Update Agent Instructions
**Files:** `canonical-epf/AGENTS.md`, agent instruction files served by epf-cli
**Status:** pending
**Priority:** P0
**Description:**
Add value model quality rules to the instructions that AI agents see on every session:
- "Value models describe value-generation stages, not product catalogs"
- "Never name L1 layers after products or brands"
- "After creating a value model, cross-check layer names against product_portfolio.yaml — zero matches expected"
- Reference the new structural anti-patterns guide

### Task 1.4: Update Value Model Template Comments
**File:** `canonical-epf/templates/FIRE/value_models/product.value_model.yaml`
**Status:** pending
**Priority:** P1
**Description:**
Add inline comments to the template that warn against product-catalog structure:
- At the `layers:` key: "# Layers represent VALUE-GENERATION STAGES, not products. Example: 'Energy Transformation', not 'Product X'"
- At the `components:` key: "# Components are FUNCTIONAL CLASSES within the value stage. Multiple products may contribute to one component."
- At `sub_components:`: "# Sub-components are concrete capabilities. Products appear here as implementations."

---

## Phase 2: Heuristic Validation

Automated checks that can detect the product-catalog anti-pattern without AI reasoning.

### Task 2.1: Product-Name Collision Detector
**File:** `canonical-epf/scripts/validate-value-model-semantics.sh` (new) + epf-cli Go equivalent
**Status:** pending
**Priority:** P0
**Description:**
Create a validation script that cross-references value model names against the product portfolio:
1. Extract all product names, brand names, and offering names from `product_portfolio.yaml`
2. Extract all L1 layer names, L2 component names from value model files
3. Fuzzy-match (case-insensitive, partial match) layer/component names against product/brand names
4. If >30% of L1 names or >40% of L2 names match product/brand names, emit WARNING:
   "Value model may be organized as a product catalog. L1 layers should be value-generation stages, not products."
5. List the matching names with suggestions

**Implementation notes:**
- Bash version: use `yq` to extract names, simple string matching
- Go version (epf-cli): add to `internal/valuemodel/` package, integrate with health check
- Must handle the case where `product_portfolio.yaml` doesn't exist (skip check gracefully)

### Task 2.2: One-to-One Mapping Detector
**File:** Same script/module as 2.1
**Status:** pending
**Priority:** P1
**Description:**
Check the cardinality of feature→value_model_component relationships:
1. For each L2 component, count how many features have `contributes_to` pointing at it
2. For each feature, count how many L2 components it contributes to
3. If the mapping is predominantly 1:1 (>70% of components have exactly 1 feature, >70% of features point to exactly 1 component), emit WARNING:
   "Value model has predominantly 1:1 feature mapping. This may indicate a product-catalog structure. Value-stage models typically have many-to-many relationships."

### Task 2.3: Layer Name Heuristic Analysis
**File:** Same script/module as 2.1
**Status:** pending
**Priority:** P1
**Description:**
Apply heuristic patterns to layer/component names:
- **Flag:** Names containing proper nouns not found in a standard dictionary (likely brand/product names)
- **Flag:** Names that are very specific (e.g., "Fischer-Tropsch Refinery") vs abstract (e.g., "Fuel Synthesis")
- **Positive signal:** Names with process/action words ("Transformation", "Processing", "Delivery", "Management", "Exchange", "Integration", "Operations")
- **Positive signal:** Names describing functional classes ("Heat Exchange", "Energy Storage", "Service Delivery")
- Emit INFO-level messages for flagged names, not errors — this is guidance, not enforcement

### Task 2.4: Multi-File Overlap Detection
**File:** Same script/module as 2.1
**Status:** pending
**Priority:** P2
**Description:**
When multiple `product.*.value_model.yaml` files exist for the Product track:
1. Check if L1 layer names or descriptions overlap in purpose across files
2. Check if the same products appear in multiple value models
3. If significant overlap detected, emit WARNING:
   "Multiple Product value models have overlapping value domains. Consider consolidating into fewer files organized by independent value-generation chains."

---

## Phase 3: Quality Scoring & Health Check Integration

### Task 3.1: Value Model Quality Score
**File:** `emergent-strategy/apps/epf-cli/internal/valuemodel/quality.go` (new)
**Status:** pending
**Priority:** P1
**Description:**
Create a quality scoring system for value models (similar to feature definition quality scoring):

| Check | Weight | Score Range |
|---|---|---|
| No product-name collisions (Task 2.1) | 30% | 0-100 |
| Many-to-many relationship ratio (Task 2.2) | 20% | 0-100 |
| Layer name quality heuristic (Task 2.3) | 20% | 0-100 |
| L2 component diversity per L1 | 15% | 0-100 |
| L3 distribution evenness | 15% | 0-100 |

Overall quality score = weighted average. Report as part of health check output.

Thresholds:
- 80+: Good — value-stage organization
- 60-79: Warning — possible structural issues
- <60: Alert — likely product-catalog anti-pattern

### Task 3.2: Integrate into Health Check
**File:** `emergent-strategy/apps/epf-cli/internal/health/` (existing)
**Status:** pending
**Priority:** P1
**Description:**
Add value model quality score to the health check report alongside:
- Content readiness (existing)
- Feature quality (existing)
- **Value model quality (new)**

Report format:
```
## Value Model Quality
- Models analyzed: 4
- Average quality score: 85/100
- Warnings: 0
- Alerts: 0
```

### Task 3.3: Add to MCP Tool Output
**File:** epf-cli MCP tool handlers
**Status:** pending
**Priority:** P2
**Description:**
Ensure the `epf_health_check` MCP tool response includes value model quality data so AI agents see it during routine health checks.

---

## Phase 4: Design Exploration (Future)

### Task 4.1: Design Value Model Review Wizard
**File:** Design document (not implementation yet)
**Status:** pending
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
**Status:** pending
**Priority:** P3
**Description:**
Research whether JSON Schema 2020-12 or custom keywords could express constraints like:
- "layer.name must not match any entry in an external file"
- "components should have cardinality > 1 in relationship mapping"

Likely conclusion: this is beyond JSON Schema's capability and must stay in validation scripts. But worth documenting the boundary clearly.

---

## Execution Order

```
Phase 1 (Documentation) ──→ Phase 2 (Heuristic Validation) ──→ Phase 3 (Scoring)
    ↓ immediate impact              ↓ automated detection            ↓ integrated reporting
    via agent instructions          via new scripts                  via health check

Phase 4 (Future Design) ← informed by Phase 2-3 results
```

Phase 1 is the highest-priority work because it directly affects AI agent behavior on every value model creation. Phase 2 provides automated safety nets. Phase 3 integrates everything into the standard workflow.

## Estimated Effort

| Phase | Tasks | Effort | Impact |
|---|---|---|---|
| Phase 1: Documentation | 4 tasks | 1-2 sessions | High (prevents new occurrences) |
| Phase 2: Heuristics | 4 tasks | 2-3 sessions | High (detects existing problems) |
| Phase 3: Scoring | 3 tasks | 2-3 sessions | Medium (integrated reporting) |
| Phase 4: Design | 2 tasks | 1 session | Low (future foundation) |
| **Total** | **13 tasks** | **6-9 sessions** | |
