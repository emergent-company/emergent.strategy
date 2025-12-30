# Multi-Product Line Architecture Analysis
**Date:** 2025-12-30  
**Context:** Designing general approach for managing multiple product lines with EPF  
**Examples Analyzed:** Huma (3 product lines), Emergent (3+ product lines), EPF Runtime (proposed)

---

## Executive Summary

After analyzing both Huma and Emergent portfolios, EPF already has a **mature, schema-driven architecture** for managing multi-product portfolios. The key insight: **product lines are defined at the portfolio level, not the instance level**.

### Critical Discovery

Both Huma and Emergent use the **same pattern**:
1. **Single umbrella North Star** (`00_north_star.yaml`) - defines portfolio vision
2. **Separate `product_portfolio.yaml`** - defines all product lines, relationships, brands, offerings
3. **Multiple value models** in `FIRE/value_models/` - one per product line (prefixed: `product.{line}.value_model.yaml`)
4. **Shared READY artifacts** - strategy applies to entire portfolio
5. **Shared FIRE artifacts** - features can reference any product line's value model

### Key Patterns Found

| Aspect | Huma Pattern | Emergent Pattern | Recommended Standard |
|--------|--------------|------------------|---------------------|
| **North Star** | Single, portfolio-level | Single, portfolio-level with `product_lines` section | ✅ Single North Star per portfolio |
| **Product Lines** | Defined in `product_portfolio.yaml` | Defined in both North Star AND `product_portfolio.yaml` | ✅ Canonical in `product_portfolio.yaml`, summary in North Star |
| **Value Models** | Prefixed: `product.{line}.value_model.yaml` | Prefixed: `product.{line}.value_model.yaml` | ✅ Consistent naming: `product.{line_slug}.value_model.yaml` |
| **Relationships** | Explicit `product_line_relationships` array | Not present | ✅ Always define relationships explicitly |
| **Brands** | Full brand architecture with master/product/sub | Not present | ✅ Include if selling under multiple brands |
| **Offerings** | Detailed SKUs and bundles | Not present | ✅ Include if B2C or complex B2B with SKUs |

---

## Architectural Principles for Multi-Product Portfolios

### Principle 1: One Instance, Multiple Product Lines ✅

**CORE EPF PRINCIPLE:** Product lines share North Star and operational structure. If they don't share these, they are **different products entirely** and should have separate instances.

**The fundamental test:**
- **Same North Star?** → Product lines within one instance
- **Different North Star?** → Separate products, separate instances

**Why this matters:**
- Product lines share strategic vision, values, and beliefs
- Product lines share operational cadence (same READY/FIRE/AIM cycles)
- Product lines enable coordination, oversight, and transparency
- Product lines can have cross-line features and cross-line KRs in roadmap
- **Fragmentation into sub-instances makes coordination impossible**

**Pattern:**
```
_instances/{portfolio-name}/
├── READY/
│   ├── 00_north_star.yaml           # SHARED by all product lines
│   ├── 01_insight_analyses.yaml     # SHARED portfolio-level insights
│   ├── 02_strategy_foundations.yaml # SHARED portfolio-level strategy
│   ├── 03_insight_opportunity.yaml  # SHARED portfolio-level opportunity
│   ├── 04_strategy_formula.yaml     # SHARED portfolio-level formula
│   └── 05_roadmap_recipe.yaml       # SHARED with line-specific + cross-line KRs
├── FIRE/
│   ├── value_models/
│   │   ├── product.line_1.value_model.yaml   # Product line 1 ONLY
│   │   ├── product.line_2.value_model.yaml   # Product line 2 ONLY
│   │   ├── product.line_3.value_model.yaml   # Product line 3 ONLY
│   │   ├── strategy.value_model.yaml         # SHARED (portfolio)
│   │   ├── org_ops.value_model.yaml          # SHARED (portfolio)
│   │   └── commercial.value_model.yaml       # SHARED (portfolio)
│   ├── mappings.yaml                # Maps features to product lines
│   └── feature_definitions/         # ALL features (single-line + cross-line)
│       ├── fd-001_line1_feature.yaml       # Single product line
│       ├── fd-002_line2_feature.yaml       # Single product line
│       ├── fd-003_cross_line_feature.yaml  # Multiple product lines
│       └── ...
├── product_portfolio.yaml           # ⭐ CANONICAL PRODUCT LINES DEFINITION
└── _meta.yaml
```

**Rationale:**
- One portfolio = one strategic vision = one North Star
- Product lines share strategy, org, commercial tracks (same operational context)
- Each product line gets its own Product track value model (differentiation point)
- Features can reference one OR multiple product lines via mappings
- Roadmap coordinates across product lines with dedicated + cross-line KRs
- **NEVER fragment into sub-instances** - breaks coordination and transparency

---

### Principle 2: `product_portfolio.yaml` is the Product Line Registry ✅

**Why:** Canonical source of truth for:
- All product lines (IDs, names, types, status, target markets)
- Product line relationships and dependencies
- Integration points between lines
- Brand architecture
- Specific offerings (SKUs, bundles)

**Schema:** `schemas/product_portfolio_schema.json` (EPF v1.13.0+)

**Example from Huma:**
```yaml
portfolio:
  id: "portfolio-huma"
  name: "Huma Thermal Energy Storage Portfolio"
  
  product_lines:
    - id: "pl-software"              # Humatopia Software Platform
      value_model_ref: "product.software.value_model.yaml"
      status: "development"
      
    - id: "pl-hardware"              # LMC Hardware Systems
      value_model_ref: "product.hardware.value_model.yaml"
      status: "development"
      
    - id: "pl-power-trading"         # Huma Power Trading
      value_model_ref: "product.power_trading.value_model.yaml"
      status: "concept"
  
  product_line_relationships:
    - from_product_line: "pl-software"
      to_product_line: "pl-hardware"
      relationship_type: "controls"
      integration_points: [...]
```

---

### Principle 3: North Star Provides Portfolio Context ✅

**What goes in North Star:**

1. **Portfolio-level purpose/vision/mission** - applies to all product lines
2. **Portfolio-level values** - shared across organization
3. **Core beliefs** - foundational assumptions for entire portfolio
4. **Product architecture section** (optional) - high-level summary of product lines

**Example from Huma:**
```yaml
north_star:
  purpose:
    statement: "Accelerate global transition away from fossil fuels"
  
  # ... (values, beliefs, etc.)
  
  product_architecture:  # ⭐ Summary, not canonical definition
    description: "Dual product architecture: Hardware + Software"
    platforms:
      - id: "huma-hardware"
        value_model: "product.hardware.value_model.yaml"
      - id: "humatopia"
        value_model: "product.software.value_model.yaml"
```

**Example from Emergent:**
```yaml
north_star:
  product_portfolio:  # ⭐ Embedded summary
    description: "Layered ecosystem where each product enables next level"
    product_lines:
      - id: "emergent-core"
        name: "Emergent Core"
        tagline: "AI-powered knowledge engine"
      - id: "emergent-frameworks"
        name: "Emergent Frameworks"
        tagline: "Structured approaches"
      - id: "emergent-tools"
        name: "Emergent Tools"
        status: "planned"
```

**Recommendation:** Include summary in North Star for readability, but **`product_portfolio.yaml` is canonical**.

---

### Principle 4: Value Model Naming Convention ✅

**Pattern:** `product.{line_slug}.value_model.yaml`

**Examples:**
- Huma: `product.software.value_model.yaml`, `product.hardware.value_model.yaml`, `product.power_trading.value_model.yaml`
- Emergent: `product.core.value_model.yaml`, `product.epf.value_model.yaml` (proposed)

**Why this pattern works:**
- Clearly identifies Product track value models vs other tracks
- Slug maps to product line ID (`pl-{slug}`)
- Avoids confusion with strategy/org_ops/commercial value models

**Schema requirement:** Each product line's `value_model_ref` must point to its Product value model file.

---

### Principle 5: Feature Definitions Can Be Single-Line or Cross-Line ✅

**CRITICAL INSIGHT:** Features live in a single `feature_definitions/` folder because:
1. Some features serve a single product line
2. Some features span multiple product lines (integration features)
3. Cross-line features enable strategic coordination
4. Splitting features into separate folders per line breaks traceability

**How it works:**

1. **All features** live in `FIRE/feature_definitions/` (no sub-folders per product line)
2. **`mappings.yaml`** connects features to one OR multiple value models
3. **Single-line features** map to one product line's value model
4. **Cross-line features** map to multiple product lines' value models

**Example from Huma mappings.yaml:**

**Single product line feature:**
```yaml
feature_to_value_model:
  - feature_id: "fd-001_physical_digital_twin"
    track: "product"
    value_model_file: "product.hardware.value_model.yaml"  # Hardware only
    layer_id: "CoreTechnology"
    component_id: "LMC_Chemistry"
```

**Cross product line feature:**
```yaml
  - feature_id: "fd-006_platform_foundation"
    track: "product"
    value_model_files:  # ⭐ Note plural: maps to MULTIPLE lines
      - file: "product.software.value_model.yaml"
        layer_id: "PlatformEngine"
      - file: "product.hardware.value_model.yaml"
        layer_id: "IOInterfaces"
    description: "Platform foundation enables software to control hardware"
```

**Result:** Features can belong to single OR multiple product lines, all tracked in one instance with clear traceability.

---

### Principle 6: Explicit Product Line Relationships ✅

**Critical for multi-product portfolios:** Define how product lines interact.

**Huma example:**
```yaml
product_line_relationships:
  - id: "plr-software-controls-hardware"
    from_product_line: "pl-software"
    to_product_line: "pl-hardware"
    relationship_type: "controls"
    description: "Humatopia provides operational control for hardware systems"
    integration_points:
      - from_component: "OperateApp"
        to_component: "CoreTechnology"
        integration_type: "control_signal"
    bidirectional: true
  
  - id: "plr-power-optimizes-humatopia"
    from_product_line: "pl-power-trading"
    to_product_line: "pl-software"
    relationship_type: "optimizes"
    integration_points: [...]
```

**Relationship types (from schema):**
- `controls` - One product line provides orchestration/control
- `enables` - One product line provides foundation for another
- `complements` - Product lines enhance each other's value
- `integrates` - Product lines share data/functionality
- `consumes` - One product line uses another's output/APIs
- `optional` - Integration is possible but not required

**Why explicit relationships matter:**
- Documents dependencies for development planning
- Enables change impact analysis (if we change Line A, what affects Line B?)
- Helps with versioning and compatibility management
- Makes integration architecture visible

---

### Principle 7: Roadmap Coordinates Across Product Lines ✅

**CRITICAL FOR MULTI-PRODUCT PORTFOLIOS:** Roadmap (`05_roadmap_recipe.yaml`) enables strategic coordination through:

1. **Product-line-specific KRs** - Target one product line only
2. **Cross-product-line KRs** - Target multiple product lines (integration, dependencies)
3. **Mixed roadmaps** - Combination of both types for coordinated execution

**Pattern in roadmap:**

```yaml
roadmap:
  objectives:
    - id: "obj-product-line-1"
      track: "Product"
      objective: "Deliver Hardware Platform MVP"
      key_results:
        - id: "kr-hardware-001"
          product_line: "pl-hardware"  # ⭐ Single product line
          key_result: "Validate TRL 6 performance"
          target: "Third-party validation complete"
          
    - id: "obj-integration"
      track: "Product"
      objective: "Enable Software-Hardware Integration"
      key_results:
        - id: "kr-integration-001"
          product_lines: ["pl-software", "pl-hardware"]  # ⭐ Cross-line KR
          key_result: "Software can control hardware via API"
          target: "100% of control signals working"
          dependencies:
            - kr_id: "kr-hardware-001"  # Depends on hardware KR
              reason: "Need hardware API first"
```

**Benefits of roadmap coordination:**
1. **Visibility** - Leadership sees how product lines work together
2. **Dependencies** - Cross-line KRs explicitly show integration points
3. **Sequencing** - Dependencies between lines visible in roadmap
4. **Resource allocation** - Can balance work across product lines
5. **Risk management** - Can see if one line blocks another

**Real-world example from Huma:**
- **Hardware KR:** "Validate LMC chemistry at TRL 6" (Hardware product line only)
- **Software KR:** "Build simulation engine" (Software product line only)
- **Cross-line KR:** "Software can simulate hardware performance" (Both lines, depends on both KRs above)
- `optional` - Integration is possible but not required

**Why explicit relationships matter:**
- Documents dependencies for development planning
- Enables change impact analysis (if we change Line A, what affects Line B?)
- Helps with versioning and compatibility management
- Makes integration architecture visible

---

### Principle 6: Explicit Product Line Relationships ✅

### Huma (More Structured)

**Strengths:**
- ✅ Complete `product_portfolio.yaml` with all product lines, relationships, brands, offerings
- ✅ Explicit integration points between product lines
- ✅ Full brand architecture (master brand, product brands, sub-brands)
- ✅ Detailed offerings (SKUs, bundles, pricing models)
- ✅ North Star references product lines but doesn't duplicate registry

**Use case fit:**
- B2B/B2C companies selling multiple products
- Hardware + Software combinations
- Complex brand strategies
- Multiple SKUs/offerings per product line

### Emergent (Leaner)

**Strengths:**
- ✅ Product lines defined in both North Star AND `product_portfolio.yaml`
- ✅ Layered ecosystem philosophy clearly articulated
- ✅ Simpler structure (no brands/offerings sections yet)

**Weaknesses:**
- ⚠️ No explicit `product_line_relationships` (dependencies only described in text)
- ⚠️ Duplication between North Star and `product_portfolio.yaml`

**Use case fit:**
- Early-stage portfolios
- Internal tools/platforms (no complex brand strategy needed)
- Developer-focused products (simpler go-to-market)

---

## Recommended Standard: Best of Both

### For All Multi-Product Portfolios

**1. North Star (`00_north_star.yaml`):**
- Portfolio-level purpose, vision, mission, values, beliefs
- Optional `product_architecture` section with **summary** of product lines
- **Do NOT duplicate** full product line definitions (keep canonical in `product_portfolio.yaml`)

**2. Product Portfolio (`product_portfolio.yaml`):**
- **Canonical registry** of all product lines (IDs, names, types, status, target markets)
- **Always include `product_line_relationships`** (even for independent lines, explicitly mark as `[]`)
- Include `brands` section if selling under multiple brands
- Include `offerings` section if you have SKUs or need to map components to market offerings

**3. Value Models (`FIRE/value_models/`):**
- One Product value model per product line: `product.{line_slug}.value_model.yaml`
- Shared tracks: `strategy.value_model.yaml`, `org_ops.value_model.yaml`, `commercial.value_model.yaml`

**4. Mappings (`FIRE/mappings.yaml`):**
- Connect features to value models
- Specify which `value_model_file` each feature belongs to
- Enables traceability across product lines

---

## When to Use Multiple Product Lines vs Single

### Multiple Product Lines When:

✅ **Different value propositions:**
- Hardware device vs software platform
- Core product vs complementary service
- B2B product vs B2C product

✅ **Different target markets:**
- Enterprise product line vs SMB product line
- Industry-specific variants (e.g., healthcare vs manufacturing)

✅ **Different development lifecycles:**
- Hardware (slow, expensive iterations) vs software (fast, continuous delivery)
- Mature product (maintenance) vs new product (rapid development)

✅ **Different business models:**
- One-time purchase vs subscription
- Direct sales vs marketplace/channel sales

✅ **Could be sold independently:**
- Customer can buy Product Line A without Product Line B
- Lines have separate P&Ls or revenue tracking

### Single Product Line When:

❌ **Just different features/modules:**
- All features target same customer segment
- Features are deployed together
- Single unified value proposition

❌ **Just different editions/tiers:**
- Same core product with Basic/Pro/Enterprise tiers
- Use `offerings` with different feature sets, not separate product lines

❌ **Just different deployment options:**
- Same product, cloud vs on-premise
- Use configuration in value model, not separate lines

---

## Applying This to EPF Runtime

### Decision: Should EPF Runtime be a separate product line?

**Analysis:**

| Criterion | EPF Framework | EPF Runtime | Separate? |
|-----------|---------------|-------------|-----------|
| Value proposition | "Product methodology" | "Product operating system" | ✅ Different |
| Target market | Product managers (manual) | Dev teams (automated) | ✅ Different |
| Development lifecycle | Methodology evolution | Engineering capabilities | ✅ Different |
| Can be sold independently? | Yes (use framework without runtime) | Yes (runtime without Core) | ✅ Yes |
| Different technology stack? | N/A (artifacts) | TypeScript/Node.js | ✅ Yes |

**Recommendation: YES - EPF Runtime should be a separate product line**

---

## Recommended Architecture for Emergent Portfolio

### Current State (Emergent)

```
emergent/docs/EPF/_instances/
└── emergent/
    ├── READY/00_north_star.yaml            # ✅ Portfolio umbrella
    ├── FIRE/
    │   ├── value_models/
    │   │   ├── product.value_model.yaml    # ⚠️ Monolithic (covers Core + Frameworks)
    │   │   ├── strategy.value_model.yaml
    │   │   ├── org_ops.value_model.yaml
    │   │   └── commercial.value_model.yaml
    │   └── feature_definitions/            # ✅ 9 features
    └── product_portfolio.yaml              # ✅ Exists, defines 3 lines
```

### Proposed Target State

```
emergent/docs/EPF/_instances/
└── emergent/
    ├── READY/00_north_star.yaml            # ✅ Keep portfolio umbrella
    ├── FIRE/
    │   ├── value_models/
    │   │   ├── product.core.value_model.yaml        # NEW: Split from monolithic
    │   │   ├── product.frameworks.value_model.yaml  # NEW: EPF + OpenSpec
    │   │   ├── product.runtime.value_model.yaml     # NEW: EPF Runtime
    │   │   ├── product.tools.value_model.yaml       # NEW: CLI, MCP servers
    │   │   ├── strategy.value_model.yaml            # ✅ Keep shared
    │   │   ├── org_ops.value_model.yaml             # ✅ Keep shared
    │   │   └── commercial.value_model.yaml          # ✅ Keep shared
    │   ├── mappings.yaml                    # UPDATE: Map features to new value models
    │   └── feature_definitions/            # ✅ Keep all features, update mappings
    └── product_portfolio.yaml              # UPDATE: Add 4th product line (EPF Runtime)
```

### Migration Steps

**Step 1: Split monolithic `product.value_model.yaml`**
- Extract Emergent Core layers → `product.core.value_model.yaml`
- Extract EPF/OpenSpec layers → `product.frameworks.value_model.yaml`
- Keep existing features mapped to correct new files

**Step 2: Add EPF Runtime product line**
- Create `product.runtime.value_model.yaml` with 5 stages as layers
- Add `pl-epf-runtime` to `product_portfolio.yaml`
- Define relationships:
  * Runtime **consumes** Frameworks (reads YAML + schemas)
  * Runtime **optionally integrates** with Core (stores artifacts in graph)

**Step 3: Update `product_portfolio.yaml`**
- Add explicit `product_line_relationships` section
- Document integration points between all 4 lines
- Add brands section if planning to market EPF Runtime separately

**Step 4: Update North Star**
- Keep portfolio-level vision
- Update `product_portfolio` summary section to mention 4 lines
- Explicitly reference `product_portfolio.yaml` as canonical source

---

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Creating Separate Instances Per Product Line

**NEVER DO THIS:**
```
_instances/
├── emergent-core/           # ❌ Separate instance
├── epf-framework/           # ❌ Separate instance
└── epf-runtime/             # ❌ Separate instance
```

**Why this is fundamentally wrong:**
- **Destroys strategic coherence** - No shared North Star means no unified vision
- **Breaks coordination** - Teams can't see how their work relates to other lines
- **Kills transparency** - Leadership loses portfolio-level oversight
- **Fragments operational cadence** - Different READY/FIRE/AIM cycles create chaos
- **Makes cross-line features impossible** - Can't reference features across instances
- **Duplicates strategy work** - Each instance needs separate analyses, foundations, roadmaps
- **Prevents roadmap coordination** - Can't have KRs that span product lines

**EPF CORE PRINCIPLE:** If you're tempted to create separate instances, ask yourself:
- Do these products share the same North Star? **If NO → They are separate products, not product lines**
- Do these products share the same operational structure? **If NO → They are separate products**
- Do these products need strategic coordination? **If NO → They are separate products**

**The ONLY valid reason for separate instances:**
- **Completely different businesses** (different company/division)
- **Completely different strategic visions** (different North Stars)
- **Completely different operational cadences** (different planning cycles)
- **No need for coordination** (independent P&Ls, no integration)

**If you need coordination, oversight, or integration → ONE INSTANCE, MULTIPLE PRODUCT LINES**

### ❌ Anti-Pattern 2: Duplicating Product Line Definitions

**Wrong:**
```yaml
# 00_north_star.yaml
product_portfolio:
  product_lines:
    - id: "emergent-core"
      name: "Emergent Core"
      description: "..." # ❌ Full definition

# product_portfolio.yaml
product_lines:
  - id: "emergent-core"
    name: "Emergent Core"
    description: "..." # ❌ Duplicate full definition
```

**Right:**
```yaml
# 00_north_star.yaml
product_portfolio:
  description: "Layered ecosystem"
  product_lines:
    - id: "emergent-core"
      tagline: "AI-powered knowledge engine"  # ✅ Summary only

# product_portfolio.yaml (canonical)
product_lines:
  - id: "pl-emergent-core"
    name: "Emergent Core"
    description: "..."  # ✅ Full definition here
    value_model_ref: "product.core.value_model.yaml"
    target_market: {...}
    key_components: [...]
```

### ❌ Anti-Pattern 3: Implicit Dependencies

**Wrong:**
```yaml
# No product_line_relationships section at all
# Dependencies only described in text descriptions
```

**Right:**
```yaml
product_line_relationships:
  - id: "plr-runtime-consumes-frameworks"
    from_product_line: "pl-epf-runtime"
    to_product_line: "pl-epf-frameworks"
    relationship_type: "consumes"
    description: "Runtime executes artifacts defined by Framework"
    integration_points:
      - from_component: "ArtifactLoader"
        to_component: "YAMLSchemas"
        integration_type: "data_flow"
    bidirectional: false
```

### ❌ Anti-Pattern 4: Monolithic Product Value Model

**Wrong:**
```yaml
# product.value_model.yaml covering ALL product lines
layers:
  - id: "CoreLayers"      # ❌ Product Line 1
  - id: "FrameworkLayers" # ❌ Product Line 2
  - id: "RuntimeLayers"   # ❌ Product Line 3
```

**Why wrong:**
- Loses traceability (which features belong to which product line?)
- Can't track separate roadmaps or lifecycles
- Can't reference specific product line in mappings
- Becomes unmaintainable as portfolio grows

**Right:**
```yaml
# product.core.value_model.yaml (Product Line 1)
layers:
  - id: "DocumentIngestion"
  - id: "KnowledgeGraph"

# product.frameworks.value_model.yaml (Product Line 2)
layers:
  - id: "READYTemplates"
  - id: "FIRESchemas"

# product.runtime.value_model.yaml (Product Line 3)
layers:
  - id: "EPFCore"
  - id: "EventSystem"
```

### ❌ Anti-Pattern 5: Splitting Feature Definitions by Product Line

**Wrong:**
```
FIRE/
└── feature_definitions/
    ├── line1/           # ❌ Separate folder per line
    │   ├── fd-001.yaml
    │   └── fd-002.yaml
    ├── line2/           # ❌ Separate folder per line
    │   ├── fd-003.yaml
    │   └── fd-004.yaml
    └── cross_line/      # ❌ Where do cross-line features go?
        └── fd-005.yaml
```

**Why wrong:**
- **Breaks traceability** - Can't see all features in one place
- **Cross-line features don't fit** - Where does integration feature live?
- **Roadmap coordination fails** - KRs can't reference cross-line features cleanly
- **Makes oversight impossible** - Leadership can't see complete feature portfolio
- **Artificial structure** - Features naturally span product lines in real products

**Right:**
```
FIRE/
└── feature_definitions/
    ├── fd-001_line1_feature.yaml       # Single line (hardware)
    ├── fd-002_line1_feature.yaml       # Single line (hardware)
    ├── fd-003_line2_feature.yaml       # Single line (software)
    ├── fd-004_cross_line.yaml          # Multiple lines (integration)
    └── fd-005_cross_line.yaml          # Multiple lines (integration)
```

**Use mappings to associate features with product lines, not folder structure.**

---

## Validation Checklist

When setting up or auditing a multi-product portfolio in EPF:

### Portfolio Level
- [ ] Single `00_north_star.yaml` with portfolio-level purpose/vision/mission/values
- [ ] Single `product_portfolio.yaml` defining all product lines (canonical registry)
- [ ] North Star references portfolio summary, but doesn't duplicate `product_portfolio.yaml`

### Product Lines
- [ ] Each product line has unique ID pattern: `pl-{slug}`
- [ ] Each product line has separate Product value model: `product.{slug}.value_model.yaml`
- [ ] Each product line has clear status (concept/development/active/mature/sunset)
- [ ] Each product line has defined target market (segments/verticals/geographies)
- [ ] Product line IDs in North Star summary match `product_portfolio.yaml` (if both present)

### Relationships
- [ ] `product_line_relationships` section exists (even if empty: `[]`)
- [ ] All dependencies between product lines explicitly documented
- [ ] Integration points specify components and integration types
- [ ] Bidirectional flag set correctly for each relationship

### Value Models
- [ ] No monolithic `product.value_model.yaml` covering multiple product lines
- [ ] Each Product value model referenced by exactly one product line
- [ ] Shared tracks (strategy/org_ops/commercial) kept separate from Product track

### Mappings & Features
- [ ] `mappings.yaml` maps features to specific `value_model_file` references
- [ ] Features can be traced to their owning product line via mappings
- [ ] No features hardcode product line IDs (use mappings instead)

### Optional (B2B/B2C)
- [ ] `brands` section defined if selling under multiple brand names
- [ ] `offerings` section defined if you have SKUs or need component-to-offering mapping
- [ ] Offerings reference product line components via `component_ref`

---

## Summary: EPF Multi-Product Line Pattern

**The EPF Way:**

1. **One instance per portfolio** (not per product line)
2. **`product_portfolio.yaml` is the canonical product line registry**
3. **North Star provides portfolio context**, optionally summarizes product lines
4. **One Product value model per product line**: `product.{line_slug}.value_model.yaml`
5. **Shared tracks** (strategy/org_ops/commercial) apply to entire portfolio
6. **Explicit relationships** defined in `product_line_relationships`
7. **Mappings connect features to product lines** via value model references
8. **No separate instances per line** (breaks strategic coherence)

**This pattern scales from 2 product lines to 10+ without structural changes.**

---

## EPF's Information Architecture Hierarchy

**Critical principle:** EPF is **outcome-oriented**. The value model comes first, features follow.

**WHY-HOW-WHAT continuum:** EPF uses Simon Sinek's framework. Each level contains overlapping WHY-HOW-WHAT elements. The WHAT from one level becomes context for the next level's HOW decisions. This tight coupling ensures emergence—"In a well-functioning organism, the parts cannot be too loosely coupled."

### The Hierarchy

```
1. VALUE MODEL (Foundation) - EPF CORE
   ↓ WHY: "Why do we exist?" (purpose, value drivers)
   ↓ HOW: "How does value flow?" (capabilities, logical structure)
   ↓ WHAT: High-level components (minimal)
   ↓ Common vocabulary for entire organization
   ↓ Persistent, changes infrequently (annually)
   ↓ Artifact: product.value_model.yaml
   ↓
2. FEATURE DEFINITION (Strategic Specification) - EPF CORE
   ↓ WHY: Inherited from value model (via contributes_to)
   ↓ HOW: "How do users achieve outcomes?" (scenarios, workflows)
   ↓ WHAT: "What value is delivered?" (contexts, outcomes, criteria - strategic, non-implementation)
   ↓ Personas, scenarios, acceptance criteria, value mapping
   ↓ Changes as product evolves (quarterly or less)
   ↓ Artifact: feature_definition_*.yaml (~1000 lines YAML)
   ↓ ▼▼▼ HANDOFF POINT ▼▼▼
   ↓ The WHAT from Level 2 becomes the WHY for Level 3
   ↓
3. FEATURE IMPLEMENTATION SPEC (Technical Specification) - OUTSIDE EPF
   ↓ WHY: Inherited acceptance criteria become requirements
   ↓ HOW: "How to technically build it?" (architecture, APIs, algorithms)
   ↓ WHAT: "What technologies to use?" (endpoints, schemas, tech stack)
   ↓ Technical design, contracts, schemas, diagrams
   ↓ Changes as technology evolves (monthly)
   ↓ Artifact: PRD, tech specs, API docs, architecture diagrams
   ↓
4. IMPLEMENTED FEATURE (Code) - OUTSIDE EPF
   ↓ WHY: Inherited requirements (minimal)
   ↓ HOW: Algorithms, functions
   ↓ WHAT: "The actual running software" (dominant)
   ↓ Source code, tests, deployment
   ↓ Changes continuously (daily/weekly)
   ↓ Artifact: Code repos, CI/CD, production systems
```

### Why This Order Matters

**Level 1 - Value model defines "WHY we exist + HOW value flows":**
- **WHY (Purpose):** Value drivers - Outcomes users care about
- **HOW (Capabilities):** Value layers - Capabilities that deliver those outcomes
- **WHAT (Components):** High-level components (minimal)
- Common vocabulary - Terms everyone understands
- **EPF responsibility:** ✅ Define and maintain

**Level 2 - Feature definition specifies "HOW users achieve outcomes + WHAT value delivered (strategic)":**
- **WHY:** Inherited from value model (explicit `contributes_to` mapping)
- **HOW (dominant):** Personas interact through scenarios and workflows
- **WHAT (strategic, non-implementation):** Contexts, jobs-to-be-done, acceptance criteria
  - Example WHAT: "Alert within 30 seconds" (outcome) ✅
  - NOT: "WebSocket `/ws/alerts`" (technical) ❌
- **EPF responsibility:** ✅ Define and maintain
- **Critical distinction:** Contains strategic WHAT (outcomes, experiences, criteria), NOT technical WHAT (APIs, schemas, architecture)

**Level 3 - Feature implementation spec defines "HOW to build technically + WHAT technologies":**
- **WHY:** Inherited from feature definition (acceptance criteria become requirements)
- **HOW (dominant):** API contracts, database schemas, architecture diagrams
- **WHAT (technical):** Specific technologies (WebSocket, Kafka, PostgreSQL), endpoints, performance targets
- **EPF responsibility:** ❌ NONE - outside EPF scope

**Level 4 - Implemented feature is "the actual WHAT (running software)":**
- **WHAT (dominant):** Source code, tests, deployment
- **HOW:** Algorithms, functions
- **WHY:** Inherited requirements (minimal)
- **EPF responsibility:** ❌ NONE - standard engineering

### Organizational Communication

| Audience | Depth | Uses | EPF Artifacts | WHY-HOW-WHAT |
|----------|-------|------|---------------|--------------|
| **Everyone** (execs, product, eng, sales) | Value model | Strategic discussions, roadmap | ✅ Value models | WHY + HOW (strategic) |
| **Product people** | Value model + feature definitions | Persona development, scenario design | ✅ Value models + Feature definitions | WHY + HOW + WHAT (strategic) |
| **Product designers** | Value model + feature definitions | UX flows based on scenarios | ✅ Feature definitions | HOW + WHAT (strategic) |
| **Engineering leads** | Feature definitions + implementation specs | Translate to technical architecture | ✅ Feature definitions → ❌ Tech specs | HOW + WHAT (technical) |
| **Engineers** | Implementation specs + code | Build according to specs | ❌ Tech specs + code | WHAT (concrete) |

**The value model is the cross-organizational language.** Everyone should know the value drivers (WHY) and use consistent terminology.

### Persistence vs Flexibility

| Artifact | WHY-HOW-WHAT Emphasis | Change Frequency | Reason | EPF Scope |
|----------|-----------------------|------------------|--------|-----------|
| **Value model** | WHY + HOW (strategic) | Infrequently (annually or less) | Core value proposition should be stable | ✅ YES |
| **Feature definitions** | HOW + WHAT (tactical/strategic) | Quarterly or less | Personas, scenarios evolve with product | ✅ YES |
| **Implementation specs** | HOW + WHAT (technical) | Monthly | Technology and architecture evolve | ❌ NO |
| **Code** | WHAT (concrete) | Continuously (daily) | Engineering iteration | ❌ NO |

**When value model changes (rarely):**
- Pivot to new market segment (value drivers change)
- Discover new core value (add layers)
- Sunset a capability (deprecate layers)

**When features change (frequently):**
- Better UX for existing capability
- New technology for same value driver
- Iteration based on usage data
- Competitive feature parity

### Product Lines and Value Models

For multi-product portfolios:
- **Each product line has ONE Product value model** (`product.{line}.value_model.yaml`)
- **Value model defines what differentiates that product line**
- **Features can implement single or multiple product line value models**
- **Cross-line features map to multiple value models via mappings.yaml**

**Example:**
- Hardware product line: `product.hardware.value_model.yaml` defines thermal storage capabilities
- Software product line: `product.software.value_model.yaml` defines optimization/control capabilities
- Integration feature: Maps to both value models (software controls hardware)

---

## Recommendations for EPF Runtime

### Immediate Actions

**1. Update Emergent `product_portfolio.yaml`:**
```yaml
product_lines:
  # ... existing 3 lines ...
  
  - id: "pl-epf-runtime"
    name: "EPF Runtime"
    codename: "Runtime"
    type: "platform"
    description: "Executable product operating system that boots EPF artifacts"
    value_model_ref: "product.runtime.value_model.yaml"
    status: "concept"
    dependencies:
      requires_product_lines: []
      optional_integration:
        - product_line: "pl-epf-frameworks"
          description: "Consumes EPF artifacts (YAML + schemas)"
        - product_line: "pl-emergent-core"
          description: "Can store artifacts in Core's knowledge graph"

product_line_relationships:
  - id: "plr-runtime-consumes-frameworks"
    from_product_line: "pl-epf-runtime"
    to_product_line: "pl-epf-frameworks"
    relationship_type: "consumes"
    integration_points:
      - from_component: "ArtifactLoader"
        to_component: "YAMLTemplates"
        integration_type: "data_flow"
  
  - id: "plr-runtime-integrates-core"
    from_product_line: "pl-epf-runtime"
    to_product_line: "pl-emergent-core"
    relationship_type: "integrates"
    integration_points:
      - from_component: "StateManager"
        to_component: "KnowledgeGraph"
        integration_type: "api_call"
```

**2. Create `product.runtime.value_model.yaml`:**
- 5 layers matching 5 implementation stages
- Each layer has components (Artifact Loader, State Machine, Trigger Engine, etc.)
- Cross-reference EPF Runtime architecture proposal from 2025-12-29

**3. Split existing monolithic `product.value_model.yaml` (if exists):**
- Extract Core layers → `product.core.value_model.yaml`
- Extract Framework layers → `product.frameworks.value_model.yaml`
- Update mappings to point to new files

**4. Update North Star product_portfolio section:**
- Mention 4 product lines (Core, Frameworks, Runtime, Tools)
- Reference `product_portfolio.yaml` as canonical source
- Keep descriptions brief (taglines only)

---

## Conclusion

EPF's multi-product architecture is **mature, schema-driven, and battle-tested**. The pattern used by Huma (3 product lines: Software, Hardware, Power Trading) and Emergent (3+ product lines: Core, Frameworks, Tools) is the same:

✅ **One instance = one portfolio = one strategic vision**  
✅ **`product_portfolio.yaml` = canonical product line registry**  
✅ **One Product value model per line**  
✅ **Explicit relationships between lines**  
✅ **Shared strategy/org/commercial tracks**  

For EPF Runtime: **It should absolutely be a separate product line**, following the exact pattern Huma and Emergent already use. No new conventions needed - just apply the existing, proven architecture.

The key to avoiding mess: **Be structured, consistent, and explicit about relationships**. EPF provides all the tools - use them.
