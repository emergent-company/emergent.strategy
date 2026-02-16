# Value Model Structural Anti-Patterns Guide

> **Purpose:** Prevent the most damaging class of EPF defect -- value models organized as product catalogs instead of value-delivery models.
>
> A bad value model poisons every downstream artifact: features, roadmaps, KRs, coverage analysis, and generated outputs are all built on a flawed foundation.

## Anti-Pattern 1: Product Catalog Masquerading as Value Model

### What It Looks Like

L1 layers are named after products, brands, or offerings. L2 components are that product's features. The "value model" is actually a product directory.

```yaml
# BAD: Product catalog disguised as a value model
layers:
  - layer_name: "Io Core Battery"          # <-- product name
    components:
      - component_name: IoCoreBattery       # <-- product as component
      - component_name: CaloraSystem        # <-- product as component

  - layer_name: "Spiralis Heat Exchange"    # <-- product name
    components:
      - component_name: SpiralisHeatExchange  # <-- product as component

  - layer_name: "Arx Refinery"             # <-- product name
    components:
      - component_name: ArxRefinery         # <-- product as component
```

### Why It Happens

1. **Taxonomic instinct.** When given many products to model, the natural impulse is to classify -- group products by type/domain. Classification produces neat hierarchies. Value-stage modeling requires understanding *how value flows*, which is harder.

2. **Copying portfolio structure.** The product portfolio (`product_portfolio.yaml`) IS correctly organized by product domain. It's tempting to duplicate that structure into the value model with EPF-flavored labels.

3. **Design documents plan it wrong.** If the design document says "create value models organized by product domain," the AI agent will faithfully follow that plan. The plan itself confuses product organization with value organization.

### The Correct Structure

Products appear at L3 as implementations that deliver value through the L2 functional class:

```yaml
# GOOD: Organized by value delivery categories
layers:
  - layer_name: "Energy Transformation"       # <-- value delivery category
    components:
      - component_name: thermal-charging       # <-- functional class
      - component_name: thermochemical-processing
      - component_name: fuel-synthesis
      - component_name: heat-to-power

  - layer_name: "Thermal Energy Storage"      # <-- value delivery category
    components:
      - component_name: lmc-battery-core       # <-- functional class
      - component_name: modular-storage-architecture
      - component_name: charge-discharge-management

  - layer_name: "Heat Exchange & Circulation" # <-- value delivery category
    components:
      - component_name: ceramic-heat-exchange
      - component_name: thermal-fluid-circulation
```

Products like Io, Pivot, Arx, Spiralis appear as **L3 sub-components** within the functional classes they serve.

### Litmus Tests

Apply these three tests to any value model. If any test fails, the model likely has this anti-pattern:

1. **"Remove any product -- does the layer name still make sense?"**
   If you discontinued the "Spiralis" product, would a layer called "Spiralis Heat Exchange" still be valid? No. But "Heat Exchange & Circulation" would survive any product change.

2. **"Can multiple products contribute to the same L2?"**
   In a proper value model, multiple products deliver value through the same L2 component. If each L2 maps to exactly one product, you have a product catalog.

3. **"Does the model describe categories of value delivery or product inventory?"**
   Value models answer "how does value flow?" not "what products do we sell?"

### How to Restructure

1. **Identify value delivery categories.** Ask: "What types of value does our platform deliver?" Think in terms of processes, transformations, and capabilities -- not products.

2. **Group by function, not product.** Multiple products may contribute to the same value delivery category. For example, both "Io Core Battery" and "Calora System" contribute to "Thermal Energy Storage."

3. **Push products to L3.** Products are *implementations* of value delivery. They belong at L3 as concrete sub-components, not at L1/L2 as organizing principles.

---

## Anti-Pattern 2: One File Per Product Domain

### What It Looks Like

Multiple `product.*.value_model.yaml` files where each file represents a product domain rather than an independent value delivery chain:

```
# BAD: Per-domain product catalogs
product.thermal_core.value_model.yaml    # Io, Calora, Pivot
product.ceramics.value_model.yaml        # Spiralis, FluxIt
product.carbon_fuel.value_model.yaml     # Arx, Kiln, Carbox
product.mechanical.value_model.yaml      # Impello, STC
product.ocean_cdr.value_model.yaml       # Reki, Nautilus
```

### Why It's Wrong

When you split value models by product domain, each file becomes a product catalog for that domain. The layers within each file inevitably map to individual products.

### When Multiple Files ARE Correct

Use separate value model files only when the value delivery domains are **truly independent**:

- Hardware vs. Software (different value chains)
- Physical products vs. SaaS platform (different delivery mechanisms)
- Unrelated business units with no shared value flow

### When to Consolidate

If products in different files contribute to similar value delivery categories (e.g., both "thermal core" and "ceramics" products involve heat management), they should be in the same value model, organized by value delivery category.

---

## Anti-Pattern 3: L1 = Product, L2 = Product Features

### What It Looks Like

L1 layers are product names and L2 components are that product's feature list:

```yaml
# BAD: Product feature list
layers:
  - layer_name: "Io Core Battery"
    components:
      - component_name: ChargingModule
      - component_name: DischargeController
      - component_name: ThermalManagement
      - component_name: BatteryMonitoring
```

### The Correct Approach

- **L1** = Value delivery category (e.g., "Energy Storage")
- **L2** = Functional class within that category (e.g., "charge-discharge-management")
- **L3** = Concrete capabilities/implementations (where products appear)

---

## Terminology: Categories of Value Delivery

Value model layers represent **categories of value delivery**. This is the unifying principle across all valid EPF value models. The specific organizing pattern varies by track:

| Track | Organizing Pattern | Example |
|---|---|---|
| **Strategy** | Sequential flow | CONTEXT -> STRATEGIC ROADMAP -> TACTICAL ROADMAP -> COMMUNICATIONS |
| **OrgOps** | Functional decomposition | 7 parallel departmental domains |
| **Commercial** | Functional decomposition | 4 parallel market-facing domains |
| **Product** | Domain-specific | Deployment tiers, maturity stages, architectural separation |

The common rule: **layers are categories of value delivery, never products, brands, or offerings.**

---

## Quick Reference: Red Flags

| Signal | Severity | What to Do |
|---|---|---|
| Layer names match entries in `product_portfolio.yaml` | High | Restructure: rename layers to value delivery categories |
| Each L2 component maps to exactly one product | High | Restructure: group by functional class, push products to L3 |
| Multiple `product.*.value_model.yaml` files with overlapping purposes | Medium | Consider consolidating into fewer files by value chain |
| L1 layer names contain brand names or trademarks | High | Replace with process/capability descriptions |
| Removing a single product would invalidate a layer name | High | Layer names must be product-independent |

## Quick Reference: Green Flags

| Signal | Meaning |
|---|---|
| Layer names use process/action words (Transformation, Processing, Delivery) | Value-stage thinking |
| Multiple products contribute to the same L2 component | Many-to-many relationships (correct) |
| L3 sub-components reference specific products as implementations | Products in the right place |
| Layer names describe functional classes (Heat Exchange, Energy Storage) | Capability-oriented structure |
| Removing any single product doesn't invalidate the layer structure | Product-independent organization |
