# Product Portfolio: Product Lines and Brands

> **Last updated**: EPF v1.13.0 | **Status**: Current

## Overview

EPF v1.10.1 introduces the **Product Portfolio** concept to support product organizations that develop multiple distinct product lines under various brand identities. This enables EPF to track:

- **Multiple Product Lines**: Distinct products with their own value models (e.g., software platform + hardware systems)
- **Product Line Relationships**: How product lines interact (e.g., software controls hardware)
- **Brand Architecture**: Flexible brand identities that can apply at various granularities — from entire product lines (broad) to specific components (narrow/ingredient) to assemblies (grouped components) to specific implementations (offerings)
- **Offerings (Implementations)**: Specific commercial products representing concrete implementations of the abstract product model — what customers actually purchase

## ⭐ Core EPF Principle: One Instance, Multiple Product Lines

**The Fundamental Rule:**

Product lines that share a **North Star** and **operational structure** belong in the **same EPF instance**. If they don't share these, they are separate products entirely and should have separate instances.

### The Test

Ask yourself:
- **Do these products share the same North Star (purpose, vision, mission, values)?**
- **Do these products operate on the same cadence (same READY/FIRE/AIM cycles)?**
- **Do these products need strategic coordination?**

**If YES to all three** → **Multiple product lines in ONE instance**  
**If NO to any** → **Separate products, separate instances**

### Why This Matters

**✅ Benefits of one instance with multiple product lines:**
- **Strategic coherence** - Unified vision drives all product lines
- **Coordination** - Teams see how their work relates across lines
- **Transparency** - Leadership has portfolio-level oversight
- **Cross-line features** - Integration features can span multiple lines
- **Roadmap coordination** - KRs can target single or multiple product lines
- **Operational efficiency** - Shared READY artifacts (strategy, analyses, roadmap)

**❌ Dangers of fragmenting into separate instances:**
- Destroys strategic coherence (no shared North Star)
- Breaks coordination (teams work in silos)
- Kills transparency (no portfolio view)
- Makes cross-line features impossible
- Duplicates strategy work
- Prevents roadmap coordination

### Product Lines vs Separate Products

| Criterion | Product Lines (Same Instance) | Separate Products (Different Instances) |
|-----------|------------------------------|----------------------------------------|
| North Star | ✅ Shared | ❌ Different |
| Operational cadence | ✅ Same READY/FIRE/AIM cycles | ❌ Different cycles |
| Strategic coordination | ✅ Required | ❌ Independent |
| Teams | Same organization | Different organizations/divisions |
| Integration | Cross-line features common | Rare or formal APIs only |
| Roadmap | Coordinated with cross-line KRs | Independent roadmaps |

**Example of product lines (same instance):**
- Huma: Hardware platform + Software platform + Power trading (shared North Star: "decarbonize industrial heat")
- Emergent: Core platform + EPF framework + Runtime + Tools (shared North Star: "emergent understanding")

**Example of separate products (different instances):**
- Slack + Salesforce (acquired company with different vision)
- Google Search + Gmail (completely different purposes, could be separate companies)

## Key Concepts

| Layer | Description | Examples |
|-------|-------------|----------|
| **Product Model** | Abstract value model (canonical information architecture) | Capabilities, components, features |
| **Implementation** | Concrete realization with versions, assemblies | Offerings with SKUs, version constraints |
| **Brand** | Commercial identity (marketing layer) | Can apply at any granularity |

## Why Product Portfolio Matters

### The Problem

Many product organizations develop more than one product. These products often:

1. **Have distinct value models** - A software platform and hardware system serve different user needs
2. **Target different markets** - Enterprise SaaS vs. industrial equipment buyers
3. **Follow different development cycles** - Continuous deployment vs. on-demand hardware releases
4. **Are interconnected** - Software might control hardware, or products might share data
5. **Are sold under different brands** - Sub-brands for specific product lines, editions, or market segments

EPF's original single `product.value_model.yaml` couldn't capture this complexity.

### The Solution

The Product Portfolio provides a structured way to:

- Define **multiple product lines**, each with its own value model
- Map **relationships** between product lines (controls, enables, integrates with)
- Track **brands** that evolve over time
- Define **offerings** that combine components from different product lines

## Schema Structure

### Portfolio
The root object containing all product lines, brands, and their relationships.

```yaml
portfolio:
  id: "portfolio-{org}"
  name: "Human-readable name"
  product_lines: [...]
  product_line_relationships: [...]
  brands: [...]
  offerings: [...]
```

### Product Line
A distinct product with its own value model and development lifecycle.

```yaml
product_lines:
  - id: "pl-software"
    name: "Software Platform"
    codename: "Internal Codename"
    type: "software|hardware|service|platform|data|hybrid|other"
    value_model_ref: "product.software.value_model.yaml"
    status: "concept|development|active|mature|sunset|deprecated"
    target_market:
      segments: [...]
      verticals: [...]
    key_components:
      - component_ref: "ComponentFromValueModel"
        role: "core|supporting|optional"
```

### Product Line Relationship
How two product lines interact with each other.

```yaml
product_line_relationships:
  - id: "plr-software-controls-hardware"
    from_product_line: "pl-software"
    to_product_line: "pl-hardware"
    relationship_type: "controls|monitors|integrates_with|depends_on|enables|complements|bundles_with"
    integration_points:
      - from_component: "OperateApp"
        to_component: "CoreTechnology"
        integration_type: "api|data_flow|control_signal|physical|business_process"
```

### Brand
A brand identity under which products are marketed and sold. Brands are flexible and can apply at different granularities:

| Granularity | `applies_to` field | Use Case |
|-------------|-------------------|----------|
| **Broad** | `product_lines: [...]` | Master brand covering entire product lines |
| **Narrow** | `components: ["SingleComponent"]` | Ingredient brand for a specific component |
| **Assembly** | `components: ["A", "B", "C"]` | Brand for a grouping of components |
| **Implementation** | `offerings: [...]` | Brand for specific configurations/products sold |

```yaml
brands:
  - id: "brand-main"
    name: "Brand Name"
    type: "master|product|sub|endorsed|ingredient"
    status: "planned|active|transitioning|deprecated|retired"
    applies_to:
      # Broad: entire product lines
      product_lines: ["pl-software", "pl-hardware"]
      # Narrow: single component, or Assembly: multiple components
      components: ["ComponentA", "ComponentB"]  
      # Implementation: specific products sold to customers
      offerings: ["offering-xyz"]
    history:
      - date: "2024-01-01"
        event: "created|renamed|repositioned|merged|split|deprecated|retired"
        description: "What happened"
```

### Offering (Implementation Layer)
An offering is a **concrete implementation** — a specific configuration of components from product lines, sold under a brand. Offerings represent what customers actually purchase: specific versions, bundles, and configurations with defined pricing.

| Concept | Description |
|---------|-------------|
| **Product Model** | Abstract value model defining capabilities (in Product Track) |
| **Offering** | Concrete implementation with versions, pricing, SKU (in Commercial Track) |

```yaml
offerings:
  - id: "offering-complete-solution"
    name: "Complete Solution"
    brand_id: "brand-main"
    type: "product|bundle|edition|tier|add-on|service"
    status: "planned|preview|active|end-of-sale|end-of-life"
    components:
      - product_line_id: "pl-software"
        component_ref: "InsightApp"
        version_constraint: ">=1.0.0"
      - product_line_id: "pl-hardware"
        component_ref: "CoreModule"
    pricing_model:
      type: "one-time|subscription|usage-based|hybrid|custom"
```

## Example: Hardware + Software Portfolio

> **Note:** This example uses Huma (a thermal energy storage company) to illustrate the pattern. Your product may have different product lines, but the structural concepts apply universally.

Huma demonstrates a classic pattern: **hardware + software product lines** that work together.

### Product Lines

| Product Line | Type | Value Model | Status |
|--------------|------|-------------|--------|
| Humatopia (Software) | Platform | `product.software.value_model.yaml` | Development |
| LMC Systems (Hardware) | Hardware | `product.hardware.value_model.yaml` | Development |

### Relationships

```
┌─────────────────┐     controls      ┌─────────────────┐
│    Humatopia    │─────────────────▶│   LMC Systems   │
│    (Software)   │◀─────────────────│   (Hardware)    │
└─────────────────┘     enables       └─────────────────┘
```

- **Software controls Hardware**: OperateApp sends control signals, reads sensor data
- **Hardware enables Software**: Physical systems provide the asset to manage

### Brands

| Brand | Type | Applies To |
|-------|------|------------|
| Huma | Master | Both product lines |
| Humatopia | Product | Software platform |
| Calora | Product | MVP hardware unit |

### Offerings

| Offering | Brand | Components |
|----------|-------|------------|
| Humatopia Design | Humatopia | DesignApp + PlatformEngine |
| Humatopia Operate | Humatopia | OperateApp + InsightApp |
| Calora MVP | Calora | Core hardware (entry level) |
| Huma Complete | Huma | Full hardware + software bundle |

## Common Patterns

### Pattern 1: Independent Product Lines
Product lines that share an organization but have no technical dependencies.

```yaml
product_line_relationships: []  # No relationships
```

**Example**: A company sells both project management software and unrelated analytics tools.

### Pattern 2: Enabling Relationship
One product line creates value that another consumes.

```yaml
- relationship_type: "enables"
  description: "Data platform enables analytics products"
```

**Example**: Data infrastructure team provides APIs that product teams build on.

### Pattern 3: Control Relationship
Software controls physical systems.

```yaml
- relationship_type: "controls"
  bidirectional: true  # Also receives data
```

**Example**: Industrial control software managing factory equipment.

### Pattern 4: Integration Relationship
Products work better together but function independently.

```yaml
- relationship_type: "integrates_with"
```

**Example**: CRM integrating with email marketing platform.

## Brand Evolution

Brands change over time. The portfolio tracks brand history:

```yaml
history:
  - date: "2020-01-01"
    event: "created"
    description: "Original brand launch"
  - date: "2023-06-01"
    event: "renamed"
    previous_name: "OldName"
    description: "Rebranding to reflect expanded scope"
  - date: "2024-01-01"
    event: "repositioned"
    description: "Shifted from SMB to Enterprise focus"
```

This history enables EPF to understand:
- Why older documents might reference different brand names
- When strategic shifts occurred
- How to communicate during transition periods

## Integration with EPF Artifacts

### Value Models
Each product line references its own value model:
- `product.software.value_model.yaml`
- `product.hardware.value_model.yaml`

### Feature Definitions
Feature definitions can reference:
- Which product line they belong to
- Which offering(s) they're included in
- Cross-product-line features

### Roadmap
The roadmap can organize work by product line while tracking cross-product-line dependencies.

### Commercial Value Model
The `commercial.value_model.yaml` can reference the portfolio's offerings and pricing models.

## Feature Definitions: Single-Line and Cross-Line

**Critical architectural decision:** All feature definitions live in a **single folder** (`FIRE/feature_definitions/`), not split by product line.

### Why No Separate Folders Per Product Line?

**❌ Don't do this:**
```
FIRE/
└── feature_definitions/
    ├── line1/           # ❌ Separate folder per line
    ├── line2/           # ❌ Separate folder per line
    └── cross_line/      # ❌ Where do integration features go?
```

**Problems:**
- Breaks traceability (can't see all features in one place)
- Cross-line features don't fit cleanly
- Roadmap coordination becomes complex
- Leadership loses complete feature portfolio view
- Artificial structure that doesn't match reality

**✅ Do this:**
```
FIRE/
└── feature_definitions/
    ├── fd-001_hardware_core.yaml       # Single line
    ├── fd-002_software_ui.yaml         # Single line
    ├── fd-003_integration.yaml         # Cross-line
    └── ...
```

### How Features Map to Product Lines

Use `mappings.yaml` to associate features with product lines:

**Single product line feature:**
```yaml
feature_to_value_model:
  - feature_id: "fd-001_hardware_core"
    track: "product"
    value_model_file: "product.hardware.value_model.yaml"
    layer_id: "CoreTechnology"
```

**Cross product line feature:**
```yaml
  - feature_id: "fd-003_integration"
    track: "product"
    value_model_files:  # Note plural
      - file: "product.software.value_model.yaml"
        layer_id: "OperateApp"
      - file: "product.hardware.value_model.yaml"
        layer_id: "IOInterfaces"
    description: "Software controls hardware via API"
```

### Benefits

- **Traceability**: All features visible in one location
- **Cross-line features**: Integration features naturally span multiple lines
- **Roadmap clarity**: KRs can reference any feature, regardless of product line
- **Oversight**: Leadership sees complete feature portfolio

## Roadmap Coordination Across Product Lines

The roadmap (`05_roadmap_recipe.yaml`) enables strategic coordination through:

1. **Product-line-specific KRs** - Target one product line
2. **Cross-product-line KRs** - Target multiple product lines (integration)
3. **Mixed roadmaps** - Combination of both for coordinated execution

### Pattern for Product-Line-Specific KRs

```yaml
roadmap:
  objectives:
    - id: "obj-hardware"
      track: "Product"
      objective: "Deliver Hardware Platform MVP"
      key_results:
        - id: "kr-hardware-001"
          product_line: "pl-hardware"  # ⭐ Single product line
          key_result: "Validate TRL 6 performance"
          target: "Third-party validation complete"
```

### Pattern for Cross-Product-Line KRs

```yaml
    - id: "obj-integration"
      track: "Product"
      objective: "Enable Software-Hardware Integration"
      key_results:
        - id: "kr-integration-001"
          product_lines: ["pl-software", "pl-hardware"]  # ⭐ Multiple lines
          key_result: "Software can control hardware via API"
          target: "100% of control signals working"
          dependencies:
            - kr_id: "kr-hardware-001"
              reason: "Need hardware API first"
```

### Benefits of Roadmap Coordination

| Benefit | Description |
|---------|-------------|
| **Visibility** | Leadership sees how product lines work together |
| **Dependencies** | Cross-line KRs explicitly show integration points |
| **Sequencing** | Dependencies between lines visible in roadmap |
| **Resource allocation** | Can balance work across product lines |
| **Risk management** | Can see if one line blocks another |

### Real-World Example

**Huma roadmap coordination:**

1. **Hardware KR** (pl-hardware only):
   - "Validate LMC chemistry at TRL 6"
   
2. **Software KR** (pl-software only):
   - "Build thermal simulation engine"
   
3. **Cross-line KR** (both pl-software + pl-hardware):
   - "Software can accurately simulate hardware performance"
   - Depends on: Both KRs above
   - Integration point: Simulation engine uses hardware specs API

This coordination ensures:
- Hardware team knows simulation needs their API
- Software team waits for hardware specs before finalizing simulation
- Leadership sees the dependency and can sequence work appropriately

## File Location

```
_instances/{product}/
├── product_portfolio.yaml          # Portfolio definition
├── FIRE/
│   └── value_models/
│       ├── product.software.value_model.yaml
│       ├── product.hardware.value_model.yaml
│       ├── strategy.value_model.yaml
│       └── commercial.value_model.yaml
└── ...
```

## When to Use Product Portfolio

### Use Multiple Product Lines (Same Instance) When:

✅ **Different value propositions** - Hardware device vs software platform, but share North Star  
✅ **Different target markets** - Enterprise vs SMB, but serve same company vision  
✅ **Different development lifecycles** - Hardware (slow) vs software (fast), but coordinate  
✅ **Different business models** - One-time vs subscription, but part of portfolio  
✅ **Can be sold independently** - Customer can buy Product Line A without B  
✅ **Need coordination** - Integration features, cross-line roadmap dependencies  

**Examples:**
- Huma: Hardware storage + Software platform + Power trading (shared North Star: decarbonize heat)
- Apple: Hardware devices + Software OS + Services (shared North Star: user experience)
- Emergent: Core platform + EPF framework + Runtime + Tools (shared North Star: emergent understanding)

### Use Separate Instances When:

❌ **Completely different North Stars** - Different company purposes/visions  
❌ **No operational coordination** - Teams don't collaborate, different cycles  
❌ **Independent businesses** - Separate P&Ls, could be separate companies  
❌ **No integration needed** - Products never interact or depend on each other  

**Examples:**
- Alphabet: Google + Verily + Waymo (separate companies under holding company)
- Meta: Facebook + Oculus (acquired company, initially separate visions)

### Don't Use Product Portfolio When:

**Single product cases:**
- ❌ You have just different **features/modules** of same product (use single value model)
- ❌ You have just different **editions/tiers** (Basic/Pro/Enterprise - use offerings, not product lines)
- ❌ You have just different **deployment options** (cloud vs on-premise - use configuration)

**Rule of thumb:** If it's just "the same product with different options," it's not a product line.

## Migration from Single Product Model

If you started with a single `product.value_model.yaml` and now need multiple product lines:

1. Create `product_portfolio.yaml` with your product lines
2. Rename existing value model to reflect its scope (e.g., `product.software.value_model.yaml`)
3. Create additional value models for new product lines
4. Update `_meta.yaml` to reflect the portfolio structure
5. Review feature definitions for product line associations

## Related Resources

- **Template**: [06_product_portfolio.yaml](../../templates/READY/06_product_portfolio.yaml) - Template for documenting multi-product portfolios
- **Schema**: [product_portfolio_schema.json](../../schemas/product_portfolio_schema.json) - Validation schema for product portfolio structure
- **Schema**: [value_model_schema.json](../../schemas/value_model_schema.json) - Schema for individual product line value models
- **Guide**: [VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md](./VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md) - Guidelines for documenting value models with business-focused language
