# EPF Context Sheet Template

> **This is a framework template.** Do not edit directly. Use the `context_sheet_generator.wizard.md` to generate product-specific context sheets.

---

<!-- 
  TEMPLATE METADATA
  This template is used by the Context Sheet Generator wizard to create
  product-specific AI context sheets for external AI assistants.
  
  Source: docs/EPF/wizards/context_sheet_template.md
  Generator: docs/EPF/wizards/context_sheet_generator.wizard.md
  Output: docs/EPF/_instances/{product}/outputs/context-sheets/{product}_context_sheet.md
-->

# {PRODUCT_NAME} - AI Context Sheet

<!-- 
  AUTO-GENERATED CONTEXT SHEET
  Generated: {GENERATION_DATE}
  EPF Version: {EPF_VERSION}
  Instance: {PRODUCT_NAME}
  
  Source files:
    - 00_north_star.yaml
    - 04_strategy_formula.yaml
    - 05_roadmap_recipe.yaml
    - product.value_model.yaml
  
  To regenerate: Ask AI assistant to "regenerate context sheet for {PRODUCT_NAME}"
-->

**Generated from EPF v{EPF_VERSION} | {GENERATION_DATE}**

Use this document to give AI assistants complete context about {PRODUCT_NAME}. Copy everything from `## CONTEXT START` to `## CONTEXT END` and paste at the start of your conversation.

---

## CONTEXT START

You are helping create content for **{PRODUCT_NAME}**. Below is everything you need to know about this product to create accurate, on-brand content.

### COMPANY IDENTITY

<!-- Source: 00_north_star.yaml → north_star.purpose/vision/mission -->

**Purpose (Why We Exist):**
{PURPOSE_STATEMENT}

**Vision (Where We're Going):**
{VISION_STATEMENT}

**Mission (What We Do):**
{MISSION_STATEMENT}

### TARGET CUSTOMER

<!-- Source: 04_strategy_formula.yaml → strategy.positioning.target_customer_profile -->

**Primary Customer Profile:**
{TARGET_CUSTOMER_PRIMARY}

**Secondary Customer Profile:**
{TARGET_CUSTOMER_SECONDARY}

**Key Pain Points We Solve:**
<!-- Source: product.value_model.yaml → high_level_model.needs_addressed -->
{PAIN_POINTS}

### VALUE PROPOSITION

<!-- Source: 04_strategy_formula.yaml → strategy.positioning -->

**Unique Value Proposition:**
{UNIQUE_VALUE_PROPOSITION}

**Category/Positioning:**
{CATEGORY_POSITIONING}

**Key Differentiators:**
<!-- Source: 04_strategy_formula.yaml → strategy.competitive_moat.advantages -->
{DIFFERENTIATORS}

### PRODUCT CAPABILITIES

<!-- Source: product.value_model.yaml → high_level_model + layers -->

**Product Mission:**
{PRODUCT_MISSION}

**Core Capabilities (What We Actually Do):**

<!-- 
  Extract from product.value_model.yaml:
  - layers[].name for category headers
  - layers[].components[].name for capability groups
  - layers[].components[].subs[] where active: true for specific features
-->

{CORE_CAPABILITIES_DETAILED}

**Premium/Enterprise Features:**
<!-- Source: product.value_model.yaml → subs where premium: true -->
{PREMIUM_FEATURES}

**What We DON'T Do (Out of Scope):**
<!-- Important: Be explicit to prevent AI hallucinations -->
{OUT_OF_SCOPE}

---

### JOBS TO BE DONE (User Problems We Solve)

<!-- Source: product.value_model.yaml → layers[].jtbd -->

**For {USER_TYPE_1}:**
> "{JTBD_STATEMENT_1}"

- {SPECIFIC_NEED_1}
- {SPECIFIC_NEED_2}

**For {USER_TYPE_2}:**
> "{JTBD_STATEMENT_2}"

- {SPECIFIC_NEED_1}
- {SPECIFIC_NEED_2}

**For {USER_TYPE_3}:**
> "{JTBD_STATEMENT_3}"

- {SPECIFIC_NEED_1}
- {SPECIFIC_NEED_2}

---

### VALUE PROPOSITIONS BY USER TYPE

<!-- Source: product.value_model.yaml → layers[].uvp, adapted for specific user roles -->

**For {USER_TYPE_1}:**
"{UVP_FOR_USER_TYPE_1}"

**For {USER_TYPE_2}:**
"{UVP_FOR_USER_TYPE_2}"

**For {USER_TYPE_3}:**
"{UVP_FOR_USER_TYPE_3}"

**For {USER_TYPE_4}:**
"{UVP_FOR_USER_TYPE_4}"

### COMPETITIVE LANDSCAPE

<!-- Source: 04_strategy_formula.yaml → strategy.competitive_moat -->

**Main Competitors:**
{COMPETITORS}

**Our Advantages Over Competitors:**
{COMPETITIVE_ADVANTAGES}

### BRAND VOICE & VALUES

<!-- Source: 00_north_star.yaml → north_star.values -->

**Our Values:**
{VALUES_LIST}

**Tone of Voice:**
{TONE_OF_VOICE}

**Words/Phrases We Use:**
{PREFERRED_LANGUAGE}

**Words/Phrases We Avoid:**
{AVOIDED_LANGUAGE}

### CURRENT FOCUS

<!-- Source: 05_roadmap_recipe.yaml → current milestone -->

**Current Cycle/Quarter Focus:**
{CURRENT_FOCUS}

**Key Initiatives This Cycle:**
{KEY_INITIATIVES}

### GUARDRAILS

When creating content for {PRODUCT_NAME}, follow these rules:

1. **Accuracy**: Only claim capabilities that exist. Don't promise features we don't have.
2. **Target Audience**: Write for {PRIMARY_AUDIENCE_ROLE}, not generic business readers.
3. **Differentiation**: Emphasize {KEY_DIFFERENTIATOR} - this is our main competitive edge.
4. **Tone**: Be {TONE_DESCRIPTORS}. Avoid {TONE_AVOID}.
5. **Compliance**: {COMPLIANCE_NOTES}
6. **Sensitive Topics**: Don't discuss {SENSITIVE_TOPICS}.

### FACTS & FIGURES (Use Only If Verified)

<!-- Only include facts that are publicly shareable and verified -->
- Market focus: {MARKET_FOCUS}
- Product type: {PRODUCT_TYPE}
- Key integration: {KEY_INTEGRATION}
- Headquarters: {HEADQUARTERS}

## CONTEXT END

---

**Now give your specific request.** Examples:

- "Write a LinkedIn post announcing our new {FEATURE} feature"
- "Create email copy for a nurture sequence targeting {TARGET_ROLE}s"
- "Draft a one-page product overview for a sales meeting"
- "Write talking points explaining why we're better than {COMPETITOR}"
- "Create a blog post about {INDUSTRY_CHALLENGE}"

## Related Resources

- **Generator**: [context_sheet_generator.wizard.md](./context_sheet_generator.wizard.md) - Wizard for generating product-specific context sheets from EPF instances
- **Schema**: [north_star_schema.json](../schemas/north_star_schema.json) - Structure for purpose, vision, mission used in context sheets
- **Schema**: [strategy_foundations_schema.json](../schemas/strategy_foundations_schema.json) - Structure for positioning and target customer information
