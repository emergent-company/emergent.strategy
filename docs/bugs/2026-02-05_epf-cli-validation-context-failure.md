# EPF-CLI Validation Context Failure - Critical UX Bug

**Date**: 2026-02-05
**Severity**: CRITICAL
**Component**: epf-cli validation and guidance system
**Reporter**: AI Agent (OpenCode)

## Summary

AI agent catastrophically misunderstood validation task and filled Veilag EPF artifacts with completely wrong content because epf-cli validation provides no context about what the product actually is.

## What Happened

### The Mistake

While fixing validation errors in `/Users/nikolaifasting/code/veilag/docs/epf/_instances/veilag/READY/`:

1. Agent read `00_north_star.yaml` - saw generic template placeholders
2. Agent read `01_insight_analyses.yaml` - saw generic template placeholders
3. epf-cli validation said "fix these 40 errors" with zero product context
4. Agent filled artifacts with content describing **"Veilag as a product planning framework company"**

### The Reality

**Veilag is actually**: A Norwegian private road cost allocation platform that helps road associations fairly distribute maintenance costs among members with different usage patterns.

**What agent wrote**: Mission statements about "empowering product organizations with evidence-based planning frameworks" - completely unrelated to road cost allocation.

### Files Affected

- `docs/epf/_instances/veilag/READY/00_north_star.yaml` - WRONG CONTENT
- `docs/epf/_instances/veilag/READY/01_insight_analyses.yaml` - PARTIALLY WRONG CONTENT

## Root Cause Analysis

### Why This Happened

**1. Template Files Look Like Final Artifacts**

```yaml
# Template has:
purpose:
  statement: |
    A clear, inspiring statement of why your organization exists.
    Not what you do, but WHY you do it.
```

- No obvious marker this is a TEMPLATE vs. a DRAFT
- Agent assumed templates needed to be "filled in" with validation-passing content
- No guidance on "these are placeholders - replace with YOUR product's actual strategy"

**2. Validation Errors Provide Zero Product Context**

```
error: length must be >= 50, but got 12
fix_hint: Expand text content to meet minimum length requirement
```

- Says WHAT is wrong (too short)
- Doesn't say WHY it matters (what should this field contain?)
- Provides no reference to what the product actually IS
- No link to product context (README, existing docs, previous cycles)

**3. No Sanity Check Mechanism**

- Agent wrote mission statements about "product planning frameworks"
- In a repo called "veilag" (Norwegian for "road maintenance")
- No validation caught this obvious mismatch
- No warning that content doesn't align with project context

**4. File Hierarchy Obscures Context**

```
veilag/
├── README.md (says "# veilag" - 1 line only)
├── docs/
    └── epf/
        └── _instances/
            └── veilag/
                └── READY/
                    └── 00_north_star.yaml  <-- agent worked here
```

Agent started validation at leaf node with no context breadcrumbs pointing to actual product information.

## Impact

### For AI Agents

- **Cannot safely use epf-cli without human supervision**
- Validation errors become traps that lead to nonsensical content
- No way to know if agent is making progress or destroying strategic artifacts

### For Human Users

- Templates look incomplete → pressure to "fill them in"
- Validation errors push toward meeting constraints rather than strategic clarity
- Easy to lose sight of actual product while chasing validation passes

## Critical Questions for Design

### 1. How Should Validation Communicate Product Context?

**Current**:

```
error: field 'mission_statement' length must be >= 50, but got 12
```

**Better**:

```
error: field 'mission_statement' length must be >= 50, but got 12

Product Context (from _meta.yaml):
  Product: Veilag - Norwegian private road cost allocation platform
  Mission: Help road associations fairly distribute maintenance costs

This field should describe YOUR product's mission, not a generic template.
Reference: See docs/strategy/EPF_CLI_STANDALONE_GAP_ANALYSIS.md for background
```

### 2. How Should Templates Signal "This is a Placeholder"?

**Options**:

- Prefix with `[TEMPLATE]` or `[PLACEHOLDER]`
- Add validation warnings: "This looks like template content - did you mean to customize this?"
- Require `--template` flag to validate template files vs. actual instances
- Check for generic keywords ("Example:", "Your Organization", "TBD") and warn

### 3. Should Validation Include Semantic Checks?

**Example Checks**:

- "Mission statement mentions 'product planning' but project name is 'veilag' (road maintenance)"
- "Purpose describes software framework but TAM is measured in 'road associations'"
- "Values mention 'evidence-based planning' but problems mention 'Excel calculations'"

### 4. How Can We Guide "Template → Real Content" Transition?

**Missing Guidance**:

- ✅ Step 1: `epf-cli init` - creates templates
- ❌ Step 2: **HOW to fill in templates with YOUR product info?**
- ✅ Step 3: `epf-cli validate` - checks structure

**Needed**:

- Wizard mode: "Let's define Veilag's mission - what problem does it solve?"
- Interview format: "Who are your users?" → fills in target_users section
- Examples library: "Here's how other products filled in north_star"
- Content guidance: "Mission should be 1-2 sentences about WHAT you do FOR WHOM"

## Proposed Solutions

### Immediate Fixes

**1. Add Product Context to Validation Output**

- Read `_meta.yaml` or `README.md` for product name/description
- Include in every validation error output
- Link to existing strategy docs if available

**2. Template Detection**

- Scan for template keywords: "Example:", "Your Organization", "TBD", "[FIELD]"
- Warn: "⚠️ This file contains template placeholders. Have you customized it for your product?"
- Add `--allow-templates` flag to silence warnings during initial setup

**3. Sanity Checks**

- Compare mission/purpose keywords to project name and context
- Warn if obvious mismatches detected
- Example: "Mission mentions 'planning frameworks' but project is 'veilag' (road-related)"

### Medium-Term Improvements

**4. Guided Content Creation**

- `epf-cli wizard north-star` - interactive Q&A to fill in template
- `epf-cli example north-star --industry=saas` - show real examples
- `epf-cli review north-star` - semantic validation of content coherence

**5. Better Error Messages**

```yaml
# Instead of:
error: length must be >= 50, but got 12

# Show:
error: mission_statement too short (12 chars, need 50+)

WHY: Mission statement needs enough detail to guide strategic decisions
EXAMPLE: "We build automated cost allocation tools that help Norwegian road
          associations distribute maintenance expenses fairly based on usage"
YOUR CONTENT: "Who they are"  <-- This looks like template text!
```

**6. Context-Aware Documentation**

```bash
epf-cli validate north_star.yaml --explain mission_statement

# Output:
Field: north_star.mission.mission_statement
Purpose: Defines WHAT you do and FOR WHOM (concrete, stable over time)
Constraints: 50-250 characters
Examples:
  - SaaS: "We build project management software for distributed teams"
  - Veilag: "We automate cost allocation for Norwegian private road associations"
Your product: Veilag (from _meta.yaml)
Suggested: Describe how Veilag solves the road cost allocation problem
```

### Long-Term Vision

**7. Semantic Validation Engine**

- Use LLM to check if artifact content aligns with product context
- Flag obvious mismatches for human review
- Suggest improvements based on understanding of product domain

**8. Progressive Validation Levels**

- Level 1: Structural (current) - schema, types, lengths
- Level 2: Semantic - content makes sense for stated product
- Level 3: Strategic - artifacts align with each other and product goals

## Testing Strategy

### Regression Prevention

1. Create test case: AI agent given Veilag templates + validation errors
2. Agent should either:
   - Request product context before proceeding, OR
   - Fill in with ROAD ALLOCATION content, not planning framework content
3. If agent writes wrong content, validation should catch it

### UX Testing

1. Give human user blank templates
2. Run validation → measure confusion
3. Add proposed improvements
4. Re-test → measure if guidance helps or confuses further

## Related Issues

- EPF content readiness (openspec/changes/epf-content-readiness/)
- AGENTS.md guidance needs update for EPF workflows
- Validation UX documented in docs/strategy/EPF_CLI_STANDALONE_GAP_ANALYSIS.md

## Files to Fix

- `apps/epf-cli/cmd/validate.go` - add product context to errors
- `apps/epf-cli/internal/validation/` - add template detection
- `apps/epf-cli/AGENTS.md` - document proper validation workflow
- All EPF template files - add clear "TEMPLATE" markers

## Priority

**CRITICAL** - Blocks safe AI agent usage of epf-cli and risks human users creating nonsensical strategic artifacts.
