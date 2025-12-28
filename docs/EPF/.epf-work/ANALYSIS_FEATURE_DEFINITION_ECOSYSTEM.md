# Feature Definition Ecosystem Analysis & Rationalization

**Date**: 2025-12-28  
**EPF Version**: 2.0.0  
**Purpose**: Analyze and rationalize the feature_definition ecosystem (6 components)  
**Scope**: Location, naming, format consistency, relationships

---

## Executive Summary

**CRITICAL FINDING**: Major format inconsistency between documentation and implementation:
- **Documentation says**: Feature definitions should be Markdown (.md files)
- **Reality is**: All 21 feature definitions are YAML (.yaml files)
- **Impact**: Confusing ecosystem with contradictory guidance

### Key Issues Identified

1. **🚨 FORMAT INCONSISTENCY** - Documentation vs implementation mismatch (Markdown vs YAML)
2. **🔀 NAMING CONFUSION** - /features vs feature_definitions (which is correct?)
3. **📍 LOCATION AMBIGUITY** - Where do examples belong vs where do instances belong?
4. **🔗 CONNECTION GAPS** - Weak linkage between wizard → schema → validation
5. **⚠️ CANONICAL PURITY RISK** - /features contains 21 complete feature YAMLs (borderline instance data)

---

## The 6-Component Ecosystem

### Component Inventory

| # | Component | Location | Lines | Format | Purpose | Status |
|---|-----------|----------|-------|--------|---------|--------|
| 1 | **Examples** | `/features/` | 21 files | YAML | Reference implementations | ⚠️ Canonical purity risk |
| 2 | **Template** | `/templates/FIRE/feature_definitions/` | 1 README | README only | Practical guidance | ✅ Good (after Priority 2) |
| 3 | **Wizard** | `/wizards/feature_definition.wizard.md` | 507 lines | Markdown | Human-readable guide | ⚠️ Format mismatch |
| 4 | **AI Agent** | `/wizards/product_architect.agent_prompt.md` | 387 lines | Markdown | AI-specific guidance | ⚠️ Format mismatch |
| 5 | **Schema** | `/schemas/feature_definition_schema.json` | 861 lines | JSON Schema | Validation rules | ✅ Authoritative |
| 6 | **Validator** | `/scripts/validate-feature-quality.sh` | 378 lines | Bash | Automated checking | ✅ Works correctly |

**Total**: 2,133 lines of guidance + 21 YAML example files (~12,000 lines)

---

## Issue 1: FORMAT INCONSISTENCY 🚨 CRITICAL

### The Problem

**Documentation Claims (Multiple Sources)**:

1. **`.ai-agent-instructions.md` (line 269)**:
   ```markdown
   - Are all feature definitions in Markdown format (.md), NOT YAML (.yaml)?
   ```

2. **`.ai-agent-instructions.md` (line 270)**:
   ```markdown
   - Do feature definitions follow naming convention: `feature_definition_{feature_slug}.md`?
   ```

3. **`.ai-agent-instructions.md` (line 282)**:
   ```markdown
   - Action: Convert any YAML feature definitions to Markdown format
   ```

4. **`wizards/product_architect.agent_prompt.md` (line 84)**:
   ```markdown
   **Before creating any feature definition YAML file**, validate...
   ```
   (This one actually says YAML - inconsistent with .ai-agent-instructions.md)

**Reality Check**:

```bash
$ find /Users/nikolai/Code/epf/features -name "*.md" | wc -l
       1  # (just README.md)

$ find /Users/nikolai/Code/epf/features -name "*.yaml" | wc -l
      21  # ALL features are YAML!
```

**Feature Files Found**:
- `/features/01-technical/fd-002-knowledge-graph-engine.yaml` (526 lines)
- `/features/01-technical/fd-003-semantic-search-query-interface.yaml` 
- `/features/01-technical/fd-004-llm-processing-pipeline.yaml` (790 lines)
- ... 18 more YAML files

**Schema Reality**:
- `feature_definition_schema.json` (861 lines) - **Validates YAML structure**
- `validate-feature-quality.sh` - **Validates YAML files** using `yq` and `ajv-cli`

### Root Cause Analysis

**Timeline reconstruction**:
1. **Early EPF (v1.9.x?)**: Feature definitions may have been Markdown-based
2. **EPF v1.12.0 (Dec 2024)**: Schema v2.0 introduced with JSON Schema → validates YAML
3. **Current (v2.0.0)**: All implementations use YAML, but legacy Markdown references remain

**Evidence of format evolution**:
- `.ai-agent-instructions.md` contains Markdown enforcement rules (outdated)
- `feature_definition_schema.json` is JSON Schema (validates YAML structure)
- `validate-feature-quality.sh` uses `yq` (YAML parser) and `ajv-cli` (JSON Schema validator)
- All 21 example features are YAML with complex nested structures

### Decision Required

**Option A: YAML is correct** (RECOMMENDED)
- ✅ Schema validates YAML structure
- ✅ Validator script parses YAML
- ✅ All 21 examples are YAML
- ✅ Complex nested data (personas, scenarios, dependencies) better suited to YAML
- ❌ Must update documentation to remove Markdown references

**Option B: Markdown is correct**
- ❌ Would require complete schema redesign
- ❌ Would require validator rewrite
- ❌ Would require converting 21 YAML files to Markdown
- ❌ Loss of structured validation
- ❌ ~12,000+ lines of rework

**RECOMMENDATION**: **Option A - Formalize YAML as standard format**
- Update `.ai-agent-instructions.md` to remove Markdown enforcement
- Update documentation to clarify YAML is correct format
- Add explicit "Why YAML?" explanation in docs

---

## Issue 2: NAMING CONFUSION 🔀

### The Problem

**Two names in use**:
1. **`/features/`** directory - Contains 21 feature definition examples
2. **`feature_definitions/`** naming - Used in:
   - `/templates/FIRE/feature_definitions/` (template location)
   - `/_instances/{product}/FIRE/feature_definitions/` (instance location pattern)
   - Documentation references
   - Wizard guidance

**Question**: Why `/features/` in canonical but `feature_definitions/` everywhere else?

### Analysis

**Historical naming**:
- Canonical directory: `/features/` (shorter, cleaner)
- Instance directory: `FIRE/feature_definitions/` (explicit, unambiguous)

**Current usage**:
- Root README: Uses "feature definitions" (space-separated, not directory name)
- Template README: Uses `feature_definitions/` (underscore)
- Features README: Uses `/features/` (slash, singular)

**Confusion points**:
1. Is `/features/` a "feature corpus" or "feature definitions"?
2. Should instances use `feature_definitions/` or `features/`?
3. Is the canonical `/features/` directory the right name?

### Recommendation

**Option A: Keep both** (RECOMMENDED)
- Canonical: `/features/` (concise, historical precedent)
- Instances: `/FIRE/feature_definitions/` (explicit, mirrors template structure)
- Rationale: Different contexts, different audiences

**Option B: Rename canonical to `/feature_definitions/`**
- ✅ Consistency with instance naming
- ❌ Longer directory name
- ❌ Git history shows /features established name
- ❌ Breaking change for any external references

**RECOMMENDATION**: **Option A - Document the distinction**

Add to `/features/README.md`:
```markdown
## Why "features" not "feature_definitions"?

This canonical directory uses the shorter name `/features/` for convenience and
historical precedent. Product instances use the explicit name `feature_definitions/`
to clarify purpose within the FIRE phase structure.

Both refer to the same artifact type: EPF-compliant feature specifications.
```

---

## Issue 3: LOCATION & CANONICAL PURITY ⚠️

### The Problem

**Question**: Should `/features/` contain 21 complete, validated feature definitions in the canonical EPF repository?

**Canonical Purity Rules** state:
- ❌ NO product names
- ❌ NO instance-specific data
- ✅ ONLY generic framework

**Current `/features/` content**:
- 21 fully-realized feature definitions
- Complete persona narratives (200+ chars each)
- Specific scenarios with actors, contexts, triggers
- Rich dependency explanations
- Validated against schema (0 errors)

**These are NOT minimal templates.** They are complete, production-quality examples.

### Analysis

**Is this a violation?**

**Arguments FOR canonical inclusion**:
- ✅ Generic examples (no product names like "twentyfirst", "huma")
- ✅ Demonstrate quality standards (schema v2.0 compliance)
- ✅ Serve as learning resources for framework adoption
- ✅ Provide validation test cases for schema development
- ✅ Show patterns (4 personas, rich narratives, structured scenarios)

**Arguments AGAINST canonical inclusion**:
- ⚠️ Very detailed (526-790 lines per feature) - beyond "template" level
- ⚠️ Could be seen as "reference instance" data
- ⚠️ Some features reference specific technical implementations
- ⚠️ Borderline between "framework guidance" and "instance example"

### Comparison to Other EPF Components

| Artifact | Canonical Template | Example Instances | Verdict |
|----------|-------------------|-------------------|---------|
| North Star | `00_north_star.yaml` (50 lines, placeholders) | None in canonical | ✅ Template only |
| Roadmap | `05_roadmap_recipe.yaml` (200 lines, placeholders) | None in canonical | ✅ Template only |
| **Feature Definitions** | **None (!!)** | **21 complete features (12k+ lines)** | ⚠️ **NO TEMPLATE** |

**KEY FINDING**: `/templates/FIRE/feature_definitions/` contains ONLY README, NO TEMPLATE YAML!

### The Real Problem

**Missing component**: There is NO minimal template YAML file showing structure.

**What exists**:
- ❌ No `feature_definition_template.yaml` in `/templates/FIRE/feature_definitions/`
- ✅ README with YAML structure embedded (but not extractable)
- ✅ 21 complete examples in `/features/`
- ✅ Schema defining structure
- ✅ Wizard explaining structure

**Users must**:
1. Read wizard/README to understand structure
2. Copy one of 21 examples from `/features/`
3. Heavily edit to remove example content

**vs. other artifacts where users**:
1. Copy template from `/templates/READY/`
2. Fill in placeholders
3. Validate

### Recommendation

**Create `/templates/FIRE/feature_definitions/feature_definition_template.yaml`**

This template should:
- Show complete YAML structure
- Include 4 placeholder personas (showing format)
- Include 2-3 placeholder scenarios (showing format)
- Include placeholder capabilities, contexts, dependencies
- Have instructional comments explaining each field
- Be 150-200 lines (not 500+ like examples)

**Then clarify `/features/` purpose**:
- "Reference implementations demonstrating quality standards"
- "Use these to learn patterns, not as starting templates"
- "For starting template, see `/templates/FIRE/feature_definitions/feature_definition_template.yaml`"

---

## Issue 4: CONNECTION GAPS 🔗

### Ecosystem Flow Analysis

**Intended workflow**:
```
User wants to create feature definition
    ↓
Reads wizard guidance (507 lines) → Understands concept
    ↓
Reads product_architect prompt (387 lines) → AI assistance pattern
    ↓
Uses template (MISSING!) → Copies structure
    ↓
Fills in content → Creates feature YAML
    ↓
Runs validation script (378 lines) → Validates against schema (861 lines)
    ↓
Reviews examples in /features/ (21 files) → Learns patterns
    ↓
Iterates to quality
```

**Actual workflow** (due to missing template):
```
User wants to create feature definition
    ↓
Reads wizard guidance → Overwhelmed (507 lines!)
    ↓
Searches for template → Finds only README
    ↓
Goes to /features/ → Picks an example
    ↓
Copies 500+ line YAML → Spends 2-3 hours editing
    ↓
Runs validation → Finds errors
    ↓
Reads schema → Fixes errors
    ↓
Re-runs validation → Pass
```

### Cross-Reference Analysis

**Current cross-references**:

| From | To | Strength | Missing Links |
|------|----|----|---------------|
| Wizard → Schema | ❌ None | Weak | "Validate against `schemas/feature_definition_schema.json`" |
| Wizard → Validator | ❌ None | Weak | "Run `scripts/validate-feature-quality.sh`" |
| Wizard → Examples | ✅ Line 255 | Good | Already links to features/ |
| Wizard → Template | ❌ None | Missing | No template to link! |
| Product Architect → Schema | ✅ Line 84 | Good | Mentions schema v2.0 constraints |
| Product Architect → Examples | ✅ Lines 253-257 | Good | Links specific examples |
| Template README → Wizard | ✅ Strong | Good | Links both wizards |
| Template README → Schema | ✅ Strong | Good | Links schema |
| Template README → Validator | ✅ Strong | Good | Links validation script |
| Template README → Examples | ✅ Strong | Good | Links features/ directory |
| Features README → Wizard | ✅ Strong | Good | Links wizard |
| Features README → Schema | ✅ Strong | Good | Links schema |
| Features README → Validator | ✅ Strong | Good | Includes validation command |

**Missing in wizards**:
1. Direct link to schema location
2. Direct command for validation
3. Link to template (doesn't exist yet)

### Recommendation

**After creating template**, update wizard guidance:

```markdown
## Resources

Before creating feature definition:

1. **Read schema requirements**: `schemas/feature_definition_schema.json` (v2.0.0)
2. **Copy template**: `templates/FIRE/feature_definitions/feature_definition_template.yaml`
3. **Review examples**: `features/` directory (21 validated examples)
4. **Validate your work**: `./scripts/validate-feature-quality.sh {your-file}.yaml`

**Validation is mandatory.** Do not commit feature definitions without passing validation.
```

---

## Issue 5: WIZARD REDUNDANCY

### Analysis

**Two wizards covering feature definitions**:

1. **`feature_definition.wizard.md`** (507 lines)
   - Purpose: Human-readable step-by-step guide
   - Audience: Product teams creating features
   - Content: 7 creation steps, common mistakes, examples

2. **`product_architect.agent_prompt.md`** (387 lines)
   - Purpose: AI agent prompt for FIRE phase
   - Audience: AI assistants (Claude, ChatGPT, etc.)
   - Content: AI-specific guidance, business language rules, validation constraints

**Overlap analysis**:
- ~150 lines of duplicate guidance (quality constraints, example patterns)
- Both explain schema v2.0 requirements
- Both show persona narrative examples
- Both reference `/features/` examples

**Difference analysis**:
- Wizard is step-by-step (1-7 process)
- Agent prompt is role-based (directives, examples, dialogue patterns)
- Wizard focuses on avoiding mistakes
- Agent prompt focuses on AI-specific guardrails

### Recommendation

**KEEP BOTH** - they serve different audiences:
- Wizard = humans learning to create features
- Agent prompt = AI assistants helping humans

**But strengthen separation**:
- Move shared examples to a separate `examples.md` document
- Both wizards link to `examples.md`
- Reduces duplication by ~100 lines
- Single source of truth for examples

---

## Recommendations Summary

### Priority 1: Fix Format Inconsistency (CRITICAL)

**Action**: Formalize YAML as standard format

1. **Update `.ai-agent-instructions.md`**:
   - Remove Markdown format enforcement rules (lines 269-271, 282, 335-337)
   - Add YAML format validation rules
   - Update naming convention to `fd-{number}-{slug}.yaml`

2. **Add "Why YAML?" section to docs**:
   - Structured data with complex nesting
   - Schema validation with JSON Schema
   - Automated validation with yq + ajv-cli
   - Better tool consumption (parseable by any YAML parser)

3. **Update wizard guidance**:
   - Clarify YAML is expected format
   - Remove any Markdown references

**Estimated effort**: 2-3 hours  
**Impact**: Eliminates confusion, aligns docs with reality

---

### Priority 2: Create Missing Template (HIGH)

**Action**: Create `feature_definition_template.yaml` in `/templates/FIRE/feature_definitions/`

**Template structure** (150-200 lines):
```yaml
# Feature Definition Template
# EPF v2.0.0 - Schema-compliant YAML template
# 
# Instructions:
# 1. Copy this template to your instance: _instances/{product}/FIRE/feature_definitions/
# 2. Rename to: fd-{number}-{slug}.yaml
# 3. Fill in all placeholder fields (marked with {})
# 4. Review examples in /features/ for quality patterns
# 5. Validate: ./scripts/validate-feature-quality.sh {your-file}.yaml

id: fd-{number}  # Example: fd-007
name: "{Feature Name}"  # Example: "Organization Workspace Management"
slug: "{feature-slug}"  # Example: "organization-workspace-management"
status: draft  # Options: draft | ready | in-progress | delivered

strategic_context:
  problem_statement: |
    {3-4 sentences describing the problem this feature solves.
    Who experiences this problem? What pain does it cause?
    What is the business impact if not solved?}
  
  market_context: |
    {3-4 sentences about market landscape.
    What solutions exist? What are their limitations?
    What opportunity does this create for us?}
  
  contributes_to:
    - {ValueModel.Layer.Component}  # Example: Product.Decide.Analysis
    - {ValueModel.Layer.Component}  # Example: Product.Operate.Knowledge
  
  tracks:
    - {track-name}  # Options: product | strategy | org_ops | commercial
  
  success_metrics:
    - metric: "{Metric name}"
      baseline: "{Current state}"
      target: "{Desired state}"
      measurement: "{How to measure}"

# Value Propositions - Exactly 4 personas required
value_propositions:
  - persona: "{Character Name, Role at Organization}"  # Example: "Sarah Martinez, Compliance Officer at TechFlow Inc."
    metrics:
      pain: "{Specific pain metric}"  # Example: "Spends 15-20 hours per quarter on manual tracking"
      benefit: "{Specific benefit}"  # Example: "Reduces to 2-3 hours of strategic review"
      roi: "{ROI statement}"  # Example: "87% time savings, catches issues weeks earlier"
    
    # Each narrative paragraph must be 200+ characters
    current_situation: |
      {200+ character paragraph describing current pain.
      Be specific: What tasks? How long? What friction?
      What manual processes? What tools used?
      What coordination required? What goes wrong?}
    
    transformation_moment: |
      {200+ character paragraph describing solution experience.
      How does this feature change their workflow?
      What becomes easier? What becomes possible?
      What confidence/clarity/speed do they gain?}
    
    emotional_resolution: |
      {200+ character paragraph describing emotional outcome.
      How do they feel now? What relationships improved?
      What strategic shift occurred? What anxiety reduced?}

  # Repeat for 3 more personas (exactly 4 total required)
  - persona: "{Persona 2}"
    # ... same structure

# Capabilities - What this feature provides
capabilities:
  - id: cap-001
    name: "{Capability Name}"
    description: "{What users can do with this capability}"
    user_value: "{Why this matters to users}"
  
  # Add 3-5 capabilities typically

# Scenarios - Top-level structured scenarios
scenarios:
  - id: scn-001
    name: "{Scenario Name}"  # Example: "Upload and Process Compliance Document"
    actor: "{Specific persona from value_propositions}"
    context: "{Where are they? What are they doing?}"
    trigger: "{What prompts this action?}"
    action: "{What specific steps do they take?}"
    outcome: "{What happens? What changes?}"
    acceptance_criteria:
      - "{Criterion 1}"
      - "{Criterion 2}"
      - "{Criterion 3}"
  
  # Add 4-6 scenarios typically

# Contexts - UI/API/Email/Notification contexts
contexts:
  - id: ctx-001
    type: ui  # Options: ui | api | email | notification | report
    name: "{Context Name}"  # Example: "Compliance Dashboard"
    description: "{What this context provides}"
    key_interactions:
      - "{User action 1}"  # Minimum 1 required
    data_displayed:
      - "{Data element 1}"  # Minimum 1 required
  
  # Add contexts as needed

# Dependencies - Rich dependency objects (30+ char explanations required)
dependencies:
  requires:
    - id: fd-{number}
      name: "{Feature Name}"
      reason: "{30+ character explanation of WHY this dependency exists. What capability/infrastructure does the dependent feature provide that this feature needs?}"
  
  enables:
    - id: fd-{number}
      name: "{Feature Name}"
      reason: "{30+ character explanation of how this feature enables the dependent feature.}"

# Technical Notes (optional)
technical_notes: |
  {Any implementation notes, constraints, or technical context.
  NOT required, but helpful for handoff to implementation team.}
```

**Then**:
- Update `/templates/FIRE/feature_definitions/README.md` to reference template
- Update wizard to reference template
- Update features/README.md to clarify template vs examples

**Estimated effort**: 4-5 hours  
**Impact**: Users have starting point, don't need to copy 500+ line examples

---

### Priority 3: Clarify /features/ Purpose (MEDIUM)

**Action**: Update `/features/README.md` to clarify relationship to template

Add section:
```markdown
## Template vs Examples

**Need a starting point?** Use the template:
- **Location**: `templates/FIRE/feature_definitions/feature_definition_template.yaml`
- **Size**: ~200 lines with placeholders
- **Purpose**: Starting structure for your feature

**Need to learn patterns?** Review these examples:
- **Location**: `features/` (this directory)
- **Size**: 21 complete features (350-790 lines each)
- **Purpose**: Demonstrate quality standards and patterns

**Workflow**:
1. Copy template to your instance
2. Fill in basic structure
3. Review examples for quality patterns
4. Validate with schema
5. Iterate to completion
```

**Estimated effort**: 1 hour  
**Impact**: Clarifies purpose, improves UX

---

### Priority 4: Strengthen Cross-References (LOW)

**Action**: Update wizard files with direct resource links

Add to `/wizards/feature_definition.wizard.md` (after line 80):

```markdown
---

## Quick Reference Resources

**Before starting**:
- [ ] Read schema: `schemas/feature_definition_schema.json` (861 lines, v2.0.0)
- [ ] Copy template: `templates/FIRE/feature_definitions/feature_definition_template.yaml`
- [ ] Review examples: `features/` directory (21 validated examples)

**While creating**:
- Keep wizard open for guidance
- Reference schema for structure requirements
- Check examples for pattern inspiration

**After creating**:
- Validate: `./scripts/validate-feature-quality.sh {your-file}.yaml`
- Fix errors, re-validate
- Commit only after passing validation (0 errors)

---
```

**Estimated effort**: 30 minutes  
**Impact**: Better navigation, clearer workflow

---

## Implementation Plan

### Phase 1: Critical Fixes (Do First)

1. **Formalize YAML format** (Priority 1)
   - Update `.ai-agent-instructions.md` - remove Markdown rules
   - Add "Why YAML?" documentation
   - Update wizard references

2. **Create template** (Priority 2)
   - Draft `feature_definition_template.yaml` (150-200 lines)
   - Add instructional comments
   - Validate template against schema
   - Update READMEs to reference template

**Time**: 6-8 hours  
**Outcome**: Clear format, usable template

### Phase 2: Documentation Clarity (Do Second)

3. **Clarify /features/ purpose** (Priority 3)
   - Update features/README.md with template vs examples
   - Add workflow guidance
   - Clarify naming distinction (/features vs feature_definitions)

4. **Strengthen cross-references** (Priority 4)
   - Add resource links to wizards
   - Add quick reference sections
   - Ensure bidirectional links

**Time**: 2-3 hours  
**Outcome**: Clear documentation, better UX

### Phase 3: Git & Validation (Do Last)

5. **Test workflow end-to-end**
   - Copy template to test instance
   - Fill in test feature
   - Run validation
   - Verify passes

6. **Git commit with comprehensive message**
   - Document all changes
   - Explain rationale
   - Note breaking changes (if any)

**Time**: 1-2 hours  
**Outcome**: Tested, committed, validated

---

## Success Metrics

**After implementation**:
- ✅ Zero format confusion (YAML formalized)
- ✅ Users can copy minimal template (not 500+ line examples)
- ✅ Clear distinction between template vs examples
- ✅ Direct links from wizard to all resources
- ✅ Ecosystem documentation aligned with reality
- ✅ Feature definition creation time reduced (3 hours → 1 hour estimated)

---

## Related Files

- `.ai-agent-instructions.md` - Contains outdated Markdown enforcement rules
- `wizards/feature_definition.wizard.md` - Human-readable guidance
- `wizards/product_architect.agent_prompt.md` - AI agent guidance
- `schemas/feature_definition_schema.json` - Validation rules (v2.0.0)
- `scripts/validate-feature-quality.sh` - Validation script
- `features/README.md` - Examples directory
- `templates/FIRE/feature_definitions/README.md` - Template guidance
- `.epf-work/ANALYSIS_README_AUDIT.md` - Previous audit findings
- `CANONICAL_PURITY_RULES.md` - Repository standards
