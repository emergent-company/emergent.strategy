# Proposal: EPF Value Model Semantic Guardrails

> **Target repo:** `emergent-strategy` (epf-cli + canonical-epf)
> **Problem discovered in:** `huma-strategy` (Huma Group EPF instance)
> **Severity:** High — undermines core EPF value proposition

## Problem Statement

An AI agent (Claude) created 5 hardware value models for Huma's thermal energy platform that were **structurally valid but semantically wrong**. Every file passed schema validation, health checks, relationship validation, and content readiness — yet the value models were organized as **product catalogs** instead of **value-generation-stage models**.

This is the most dangerous class of EPF defect: it looks correct, passes all checks, but fundamentally misrepresents the product's value architecture. If left uncaught, it would propagate into roadmap KRs, feature definitions, coverage analysis, and investor-facing outputs — all built on a flawed foundation.

## What Happened

### The Incorrect Structure (what was created)

```
product.thermal_core.value_model.yaml
  L1: Io Core Battery          ← product name as layer
    L2: IoCoreBattery           ← product as component
    L2: CaloraSystem            ← product as component
    L2: PivotPowerGeneration    ← product as component

product.ceramics.value_model.yaml
  L1: Spiralis Heat Exchange    ← product name as layer
    L2: SpiralisHeatExchange    ← product as component
  L1: FluxIt Joining            ← product name as layer
    L2: FluxItJoining           ← product as component

product.carbon_fuel.value_model.yaml
  L1: Arx Refinery              ← product name as layer
    L2: ArxRefinery             ← product as component
  L1: Kiln Pyrolysis            ← product name as layer
    L2: KilnPyrolysis           ← product as component
```

Each value model was a **product directory** — layers named after products, components named after products, organized by "which product does this belong to?" This is a product catalog, not a value model.

### The Correct Structure (what replaced it)

```
product.hardware.value_model.yaml (unified)
  L1: Energy Transformation       ← value-generation stage
    L2: thermal-charging           ← functional class
    L2: thermochemical-processing  ← functional class
    L2: fuel-synthesis             ← functional class
    L2: heat-to-power              ← functional class
    L2: heat-to-motion             ← functional class
    L2: steam-generation           ← functional class
    L2: thermal-cooling            ← functional class
  L1: Thermal Energy Storage       ← value-generation stage
    L2: lmc-battery-core           ← functional class
    L2: modular-storage-architecture
    L2: charge-discharge-management
  L1: Heat Exchange & Circulation  ← value-generation stage
    ...
  L1: Connection & Assembly        ← value-generation stage
    ...
  L1: Service Delivery & Ops       ← value-generation stage
    ...
```

Products (Io, Pivot, Arx, etc.) appear as **L3 sub-components** within the functional classes they serve — because products are *implementations that deliver value*, not the value structure itself.

### How the Error Was Caught

The user (product owner) reviewed the value models and recognized the anti-pattern. They articulated the key insight: "Energy capture, energy conversion, and chemical synthesis all belong to the same class of problems: converting energy between forms. Thermal energy is always an important factor." This is domain expertise that no current EPF tool can replicate.

## Root Cause Analysis

### 1. The Design Document Planned It Wrong (Primary Cause)

The openspec `design.md` for the EPF strategy upgrade explicitly designed value models organized by product domain:

```markdown
### Value Model Restructuring
**Proposed:** Value models organized by technology domain:
├── product.thermal_core.value_model.yaml   ← Io, Calora, Pivot, Atmos
├── product.ceramics.value_model.yaml       ← Spiralis, Monolith, FluxIt
├── product.carbon_fuel.value_model.yaml    ← Arx, Kiln, Carbox, Caera, Carbio
├── product.mechanical.value_model.yaml     ← Impello, STC, Fimbul
└── product.ocean_cdr.value_model.yaml      ← Reki, Nautilus
```

The AI agent followed this plan faithfully. The plan itself confused "product portfolio organization" (which domains contain which products) with "value model organization" (how value flows through the system).

### 2. The AI Agent Defaulted to Taxonomic Thinking (Contributing Cause)

When given ~20 products to model, the AI's instinct was to **classify** — group products by type/domain. This is the natural taxonomic bias of language models. Classification produces neat hierarchies. Value-stage modeling requires understanding *how value flows*, which is a much harder reasoning task.

The AI had access to the product portfolio (which IS correctly organized by domain) and essentially duplicated that structure into the value model, adding EPF-flavored labels.

### 3. EPF Provides Zero Semantic Guidance Against This Anti-Pattern (Systemic Cause)

The entire EPF validation stack checks structural correctness:

| What's Checked | Tool | Status |
|---|---|---|
| YAML syntax | Schema validation | Works |
| Required fields, types, enums | JSON Schema | Works |
| String length constraints | JSON Schema | Works |
| Layer/component count balance | `validate-value-model-structure.sh` | Works |
| `contributes_to` path resolution | `validate-value-model-references.sh` | Works |
| Business language (no technical jargon) | Guides + human review | Works |
| Content readiness (no TODOs/TBDs) | `check_content_readiness` | Works |

| What's NOT Checked | Why It Matters |
|---|---|
| Layers organized by value-generation stages vs products | **This is the core purpose of a value model** |
| Layer names matching product/brand names | Direct signal of product-catalog anti-pattern |
| Cross-layer value flow coherence | Value models should describe a delivery chain |
| Component names that are just product names | Products are implementations, not value stages |
| Multiple value models for a single track that overlap | Suggests product-based splitting |

### 4. The Canonical Guides Are Language-Focused, Not Structure-Focused

EPF has three dedicated value model guides:
- `VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md` — Excellent at preventing technical jargon
- `VALUE_MODEL_ANTI_PATTERNS_REFERENCE.md` — Only covers language anti-patterns (FIX→ExchangeConnectivity)
- `VALUE_MODEL_MATURITY_GUIDE.md` — Covers VMM stages and evidence

**None of them address the product-catalog anti-pattern.** The most fundamental structural error a value model can have — being organized around products instead of value generation — is completely undocumented.

### 5. The Product Architect Wizard Doesn't Warn Against It

The `product_architect.agent_prompt.md` wizard tells agents to "Model Product Value" and "Define Value Proposition Hierarchy" but doesn't explain what makes a good hierarchy vs a bad one. It provides interaction examples where components go into a "Manage" layer (correct!) but never explicitly warns against naming layers after products.

### 6. The Schema Can't Prevent It

JSON Schema validates structure (types, patterns, lengths) — it cannot evaluate whether `layer.name: "Io Core Battery"` is a product name being misused as a value stage. This is a semantic problem beyond schema's reach.

## Why This Matters for EPF

Value models are the **foundational artifact** in EPF's information architecture. Everything downstream depends on them:

```
Value Model (defines the value space)
    ↓
Feature Definitions (contributes_to value model paths)
    ↓
Roadmap KRs (target value model components)
    ↓
Coverage Analysis (finds gaps in the value model)
    ↓
Assessment Reports (measure progress against value model)
    ↓
Generated Outputs (investor memos, context sheets reference value model)
```

A structurally-correct-but-semantically-wrong value model poisons the entire chain. Coverage analysis shows "100% covered" when it's really just "all products have a feature definition." KRs target product names instead of value stages. Investor outputs describe a product catalog instead of a value architecture.

**The EPF value model is not a product registry. It's a value-generation map.** If AI agents routinely create product catalogs and label them "value models," EPF loses its core differentiator.

## Proposed Solution Approach

This is a semantic reasoning problem — harder than structural validation. The solution needs multiple layers:

### Layer 1: Documentation & Agent Guidance (Low effort, High impact)

**1a. New anti-pattern guide: `VALUE_MODEL_STRUCTURAL_ANTI_PATTERNS.md`**

Document the product-catalog anti-pattern explicitly with before/after examples. Include:
- "Product names as layer names" pattern with detection heuristic
- "One layer per product" pattern
- "Taxonomy vs value flow" distinction with examples
- The litmus test: "If you removed a product from the portfolio, would the layer name still make sense?"

**1b. Update `product_architect.agent_prompt.md` wizard**

Add explicit guardrails:
- "L1 layers must be named after value-generation stages (Energy Transformation, Data Processing, Service Delivery) — NEVER after products or brands"
- "If your layer names match product/brand names from the portfolio, you've created a product catalog, not a value model. Stop and restructure."
- "The test: could multiple products contribute to the same L2 component? If each L2 maps to exactly one product, the model is wrong."

**1c. Update AGENTS.md and copilot-instructions.md**

Add value model quality rules to agent instructions that are loaded on every session.

### Layer 2: Heuristic Validation (Medium effort, High impact)

**2a. Product-name collision detection**

Cross-reference value model layer/component names against:
- `product_portfolio.yaml` product names and brand names
- Feature definition names
- Known product name patterns

If >50% of L1 layer names or L2 component names match product/brand names, flag as "possible product-catalog anti-pattern."

This is implementable as a new validation script or epf-cli check. It doesn't need AI — just string matching between artifacts.

**2b. One-to-one mapping detection**

If each L2 component has exactly one feature contributing to it, and each feature contributes to exactly one L2 component, this suggests a product-catalog structure. Real value models have many-to-many relationships (multiple products contribute to the same value stage).

**2c. Layer name pattern analysis**

Value-generation-stage names tend to follow patterns:
- Action/process nouns: "Transformation", "Processing", "Delivery", "Management", "Exchange"
- Compound functional descriptions: "Heat Exchange & Circulation", "Connection & Assembly"

Product-catalog names tend to be:
- Proper nouns / brand names: "Io Core Battery", "Spiralis Heat Exchange"
- Technology-specific: "Fischer-Tropsch Refinery", "Pyrolysis System"

A simple heuristic: if a layer name contains a proper noun (capitalized word that isn't a standard English word), flag for review.

### Layer 3: Structural Quality Scoring (Medium effort, Medium impact)

**3a. Value model quality score**

Add a quality assessment similar to feature definition quality scoring, checking:
- Layer name quality (value-stage vs product-name heuristic)
- Many-to-many relationship ratio (features → components)
- Cross-layer coherence (do layers form a logical value chain?)
- L2 component diversity within each L1 (multiple functional areas, not just one product's capabilities)
- L3 sub-component distribution (even spread, not concentrated in one L2)

**3b. Integrate into health check**

Report value model quality score alongside content readiness and feature quality.

### Layer 4: LLM-Assisted Semantic Review (High effort, Experimental)

**4a. Value model review prompt**

Create a specialized prompt/wizard that reviews an existing value model and asks:
- "Does each L1 layer represent a stage in value generation?"
- "Could you remove any single product and still have meaningful layers?"
- "Do multiple products contribute to the same L2 components?"
- "Does the model describe HOW value flows, or WHAT products exist?"

This could be a "value model review" wizard that agents run after creating/modifying a value model. It wouldn't be automated validation — it would be a guided self-check.

**4b. Pre-commit semantic check**

Before writing a value model, require the agent to answer these questions in a structured format. This is a process guardrail, not a technical one.

## Scope & Boundaries

### In Scope (for this change)
- Root cause documentation (this proposal)
- Layer 1: Documentation updates to canonical-epf
- Layer 2: Heuristic validation in epf-cli
- Layer 3: Quality scoring in epf-cli
- Design decisions for Layer 4

### Out of Scope
- Implementing LLM-assisted review (Layer 4) — requires design exploration
- Retroactive fixing of other EPF instances (each instance owner's responsibility)
- Changes to JSON Schema specification (this problem is beyond schema's capability)

## Success Criteria

1. An AI agent creating value models for a new multi-product company should produce value-generation-stage models, not product catalogs
2. If a product-catalog model IS created, at least one validation check flags it with a clear warning
3. The product-catalog anti-pattern is documented with the same rigor as the business-language anti-patterns
4. The health check reports a value model quality score

## References

- **The bad commit:** `huma-strategy@3557f76` — created 5 product-catalog value models
- **The fix commit:** `huma-strategy@b96362d` — replaced with 2 value-stage models
- **Canonical value model guides:** `canonical-epf/docs/guides/VALUE_MODEL_*.md`
- **Product architect wizard:** `canonical-epf/wizards/product_architect.agent_prompt.md`
- **Value model schema:** `canonical-epf/schemas/value_model_schema.json`
- **epf-cli value model code:** `emergent-strategy/apps/epf-cli/internal/valuemodel/`
