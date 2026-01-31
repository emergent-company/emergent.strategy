# AI Agent First Contact Analysis: EPF Onboarding & Consistency

> **Date**: 2026-01-08  
> **Purpose**: Analyze how general AI agents (like GitHub Copilot) discover and adopt EPF when added to product repos, and identify mechanisms to ensure agent consistency with EPF guidelines  
> **Context**: EPF is typically added to repos that are either fresh (minimal code) or mature (existing implementation)

---

## Executive Summary

**Current State**: EPF has excellent documentation for AI agents who know where to look, but lacks explicit "first contact" guidance for agents encountering EPF for the first time in a product repo.

**Key Gap**: No automated discovery mechanism (like `.ai-agent-welcome.md` or `.copilot-onboarding.md`) that AI agents naturally encounter when exploring a repo with EPF.

**Recommendation**: Create a **".ai-agent-first-contact.md"** file in the EPF root that serves as the entry point for AI agents discovering EPF, with clear routing to wizards, guides, and scripts based on user intent.

---

## Problem Analysis

### Scenario 1: Fresh Repo (Minimal Code)

**User adds EPF via:**
```bash
git subtree add --prefix=docs/EPF epf main --squash
```

**User then asks Copilot:**
- "Help me set up my product strategy"
- "I want to start documenting my product"
- "How do I use EPF?"
- "Create a roadmap for my product"

**What happens today:**
1. ✅ Agent sees `docs/EPF/` directory structure
2. ✅ Agent may read `README.md` if searching for context
3. ⚠️ Agent may generate artifacts from memory instead of reading schemas
4. ⚠️ Agent may not consult wizards (doesn't know they exist)
5. ⚠️ Agent may create instance files in wrong location (canonical vs product)

**Why this happens:**
- No explicit "start here" signal for AI agents
- README.md is comprehensive but buried in generic navigation
- Wizards are in `wizards/` directory (not obvious discovery path)
- `.github/copilot-instructions.md` exists but requires agent to know to look there

### Scenario 2: Mature Repo (Existing Product)

**User adds EPF to existing codebase:**
```bash
git subtree add --prefix=docs/EPF epf main --squash
```

**User then asks Copilot:**
- "Document our current product strategy using EPF"
- "Migrate our product docs to EPF format"
- "Create feature definitions for our existing features"

**What happens today:**
1. ✅ Agent sees existing code, existing docs, new `docs/EPF/` directory
2. ⚠️ Agent may try to "convert" existing docs to EPF format without understanding schema-first approach
3. ⚠️ Agent may create EPF artifacts that describe implementation (technical WHAT) instead of strategic WHY/HOW
4. ⚠️ Agent may miss the READY → FIRE → AIM cycle philosophy
5. ⚠️ Agent may not run validation scripts (doesn't know they exist)

**Why this happens:**
- Agent sees EPF as "another documentation framework" not "product operating system"
- Existing product docs (if any) may be in different format (Notion, Confluence, etc.)
- Agent doesn't understand EPF's "strategic layer" vs "technical layer" distinction
- No guidance on "migrating existing product to EPF" workflow

---

## Current EPF Documentation for AI Agents

### Strengths ✅

1. **Comprehensive AI Agent Section in README.md**
   - Lines 34-61: Clear reading order (Pre-Flight → Purity Rules → Framework Overview)
   - Daily operations routing (wizards, outputs, validation, guides)
   - Maintenance protocol links

2. **`.github/copilot-instructions.md` Exists**
   - Quick command reference
   - Product repo locations
   - Sync instructions
   - Pre-flight checklist

3. **Excellent Wizard System**
   - `lean_start.agent_prompt.md` for solo founders (Level 0-1)
   - Specialized wizards (trend scout, market mapper, problem detective)
   - Clear time estimates and deliverables

4. **ADOPTION_GUIDE.md**
   - 4 escalation levels (0-3) based on team size
   - Clear "start simple, scale organically" philosophy
   - Time breakdowns and growth triggers

5. **Schema-First Validation**
   - Scripts exist (`validate-schemas.sh`, `check-content-readiness.sh`)
   - Health check system (`epf-health-check.sh`)

### Gaps ⚠️

1. **No Automatic Discovery Mechanism**
   - Agent must know to look for `.github/copilot-instructions.md`
   - No standard "AI agent start here" file in EPF root
   - README.md has AI section buried after critical rules

2. **No User Intent Routing**
   - Agent doesn't know: "User said X → Use wizard Y"
   - Example: User says "create roadmap" → Should trigger `lean_start.agent_prompt.md` or full roadmap wizard?
   - No decision tree: Fresh repo → Level 0 | Mature repo → Different approach

3. **No "First Time in Product Repo" Workflow**
   - Agent doesn't know: "I'm in a product repo (not canonical), what should I do first?"
   - No checklist: Create instance structure → Use wizard → Validate → Commit

4. **No Anti-Pattern Warning System**
   - Agent can still generate artifacts from memory (Mistake documented in self-learning.instructions.md)
   - No inline reminders: "STOP: Read schema before generating"
   - No pre-commit hook for agents to run validation

5. **Wizard Discovery is Hidden**
   - Wizards are in `wizards/` directory (obvious for humans exploring, less so for agents)
   - No wizard index by user intent ("I want to..." → wizard mapping)
   - No wizard recommendation at key decision points

---

## Proposed Solutions

### Solution 1: Create `.ai-agent-first-contact.md` (PRIMARY RECOMMENDATION) ⭐

**Location**: `/docs/EPF/.ai-agent-first-contact.md` (EPF root, highly discoverable)

**Purpose**: Single entry point for AI agents encountering EPF for first time

**Structure**:
```markdown
# Welcome, AI Agent! You've Discovered EPF 🤖

This file is specifically for you - an AI assistant helping a user adopt the Emergent Product Framework.

## 🚨 CRITICAL: Where Are You?

**FIRST: Determine your location**
```bash
pwd  # Check current working directory
```

- In `/path/to/epf` (canonical) → Read CANONICAL_PURITY_RULES.md NOW
- In `/path/to/product/docs/EPF` (instance) → Continue below ✅

## 🎯 User Intent Routing

**Match user's request to the right workflow:**

| User Says... | What They Want | Route Them To |
|--------------|----------------|---------------|
| "Help me get started with EPF" | Initial adoption | → `wizards/lean_start.agent_prompt.md` |
| "Create a roadmap" | Strategic planning | → Check team size → Level 0/1 wizard |
| "Document our strategy" | Capture existing strategy | → `guides/ADOPTION_GUIDE.md` (mature repo) |
| "Create feature definitions" | Feature documentation | → `wizards/product_architect.agent_prompt.md` |
| "Validate our EPF artifacts" | Quality check | → `scripts/epf-health-check.sh` |

## 📋 Standard Onboarding Workflow

**For NEW EPF instances (first time in product repo):**

1. **Create Instance Structure** (2 min)
   ```bash
   ./docs/EPF/scripts/create-instance-structure.sh {product-name}
   ```

2. **Determine Adoption Level** (1 min)
   - Ask user: "How many people on your team?"
   - 1-2: Level 0 (North Star only)
   - 3-5: Level 1 (Evidence + Roadmap)
   - 6-15: Level 2 (Full value models)
   - 15+: Level 3 (Validation + governance)

3. **Use Appropriate Wizard** (2-6 hours)
   - Level 0-1: `wizards/lean_start.agent_prompt.md`
   - Level 2-3: Full Pathfinder wizard

4. **Validate Before Committing** (5 min)
   ```bash
   ./docs/EPF/scripts/epf-health-check.sh
   ./docs/EPF/scripts/validate-instance.sh _instances/{product-name}
   ```

## ⚠️ CRITICAL REMINDERS (Anti-Patterns)

**BEFORE generating ANY EPF artifact:**

- [ ] ❌ NEVER generate from memory - ALWAYS read schema first
- [ ] ❌ NEVER create instance files in canonical EPF repo
- [ ] ❌ NEVER skip validation after artifact creation
- [ ] ✅ ALWAYS read schema → read example → generate → validate

**Why this matters**: See `.github/instructions/self-learning.instructions.md` for costly mistakes to avoid.

## 🧙 Wizard Selection Guide

**Choose wizard based on what user is creating:**

- **Strategic Foundation** (North Star, Strategy) → `lean_start.agent_prompt.md`
- **Evidence Gathering** (Market, trends, problems) → Specialist wizards (01-04)
- **Roadmap Planning** (OKRs, assumptions) → `lean_start.agent_prompt.md` or Pathfinder
- **Feature Definitions** → `product_architect.agent_prompt.md`
- **Retrospective** → `synthesizer.agent_prompt.md`

**See `wizards/README.md` for complete wizard catalog.**

## 📖 Essential Reading (Read BEFORE Acting)

**If user is starting fresh:**
1. `docs/guides/ADOPTION_GUIDE.md` (10 min) - Choose level, understand philosophy
2. Appropriate wizard (2-6 hours) - Create artifacts
3. `scripts/README.md` (5 min) - Validation tools

**If helping with existing instance:**
1. `.github/copilot-instructions.md` (5 min) - Quick reference
2. `docs/guides/INSTANTIATION_GUIDE.md` (15 min) - Detailed workflows
3. Validation scripts - Check instance health

## 🚀 Quick Start Commands

**Create new instance:**
```bash
./docs/EPF/scripts/create-instance-structure.sh {product-name}
```

**Health check:**
```bash
./docs/EPF/scripts/epf-health-check.sh
```

**Validate instance:**
```bash
./docs/EPF/scripts/validate-instance.sh _instances/{product-name}
```

**Check content quality:**
```bash
./docs/EPF/scripts/check-content-readiness.sh _instances/{product-name}/READY
```

---

**Next Steps**: Ask user "What would you like to do?" and route them to appropriate workflow above.
```

**Benefits**:
- ✅ Automatic discovery (agents search for `.ai-*` files)
- ✅ Clear intent routing (user says X → do Y)
- ✅ Anti-pattern reminders inline
- ✅ Standard workflow prevents mistakes
- ✅ Quick reference for common tasks

---

### Solution 2: Enhance `.github/copilot-instructions.md`

**Add section at top:**

```markdown
## 🤖 First Time Here? AI Agent Onboarding

**If you're helping a user adopt EPF for the first time, read this section first.**

### Step 1: Determine Context
- Fresh repo (minimal code) → Use `wizards/lean_start.agent_prompt.md`
- Mature repo (existing product) → Use adoption guide + migration approach
- Canonical EPF repo → STOP! Read `CANONICAL_PURITY_RULES.md`

### Step 2: User Intent Recognition
| User Says | Intent | Action |
|-----------|--------|--------|
| "help me start" | Onboarding | → Ask team size → Route to Level 0-3 |
| "create [artifact]" | Generation | → Read schema FIRST → Use wizard → Validate |
| "validate" | Quality check | → Run health check + validation scripts |
| "migrate docs" | Conversion | → Special workflow (existing → EPF) |

### Step 3: Schema-First Mandate
**BEFORE generating any artifact:**
1. Read schema: `schemas/{artifact_type}_schema.json`
2. Read example: `features/` or validated instances
3. Read wizard: `wizards/{appropriate_wizard}.agent_prompt.md`
4. Generate using schema as template
5. Validate: `./scripts/validate-schemas.sh`

**See `.github/instructions/self-learning.instructions.md` for why this matters (25+ min wasted per violation).**
```

---

### Solution 3: Create Wizard Index by Intent

**New file**: `/docs/EPF/wizards/WIZARD_SELECTOR.md`

```markdown
# EPF Wizard Selector: Match User Intent to Wizard

## User Intent → Wizard Mapping

### "I want to get started with EPF"
- **Team size 1-5**: `lean_start.agent_prompt.md` (2-6 hours)
- **Team size 6+**: Full Pathfinder (coming soon)

### "I want to create a roadmap"
- **First time**: `lean_start.agent_prompt.md` → Step 3 (roadmap)
- **Have North Star**: Start at roadmap section
- **Quarterly update**: Update existing `05_roadmap_recipe.yaml`

### "I want to document market trends"
- **Wizard**: `01_trend_scout.agent_prompt.md`
- **Output**: `01_insight_analyses.yaml` (trends section)
- **Time**: 30-45 min

### "I want to define features"
- **MVP features (2-5)**: `lean_start.agent_prompt.md` → Step 5
- **Full features (6+)**: `product_architect.agent_prompt.md`
- **Enrichment**: `feature_enrichment.wizard.md`

### "I want to validate our work"
- **Framework**: `./scripts/epf-health-check.sh`
- **Instance**: `./scripts/validate-instance.sh`
- **Content quality**: `./scripts/check-content-readiness.sh`

[... continue for all common intents ...]
```

**Reference this from `.ai-agent-first-contact.md`**

---

### Solution 4: Add Pre-Generation Checklists to Schemas

**Enhance schema files with AI agent guidance:**

Example: `schemas/feature_definition_schema.json`

Add at top of description fields:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://github.com/eyedea-io/epf-canonical-definition/schemas/feature_definition_schema.json",
  "title": "Feature Definition Schema",
  "description": "CRITICAL FOR AI AGENTS: Before generating a feature definition, you MUST:\n1. Read this entire schema (all required fields, types, constraints)\n2. Read a validated example: features/01-technical/fd-002-knowledge-graph-engine.yaml\n3. Read the wizard: wizards/product_architect.agent_prompt.md or lean_start.agent_prompt.md\n4. Generate using schema as template (NOT from memory)\n5. Validate: ./scripts/validate-feature-quality.sh\n\nSee .github/instructions/self-learning.instructions.md (2025-12-27 entry) for why this matters (25+ min wasted if you generate from memory).\n\n---\n\nDefines the structure for feature definitions in the EPF framework...",
  "version": "2.0.0",
  ...
}
```

**Benefits**:
- ✅ Guidance visible when agent reads schema
- ✅ Links to wizard and examples
- ✅ References time cost of violations
- ✅ No additional files needed

---

### Solution 5: Create "EPF Health Score" Dashboard

**New script**: `scripts/epf-status.sh`

**Purpose**: Single command that shows EPF adoption status in product repo

```bash
#!/bin/bash
# EPF Instance Status Dashboard
# Shows: Instance exists? Level adopted? Artifacts created? Validation status?

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              EPF Instance Status Dashboard                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Detect instance
INSTANCE_DIR=$(find docs/EPF/_instances -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)

if [ -z "$INSTANCE_DIR" ]; then
  echo "⚠️  No EPF instance found"
  echo ""
  echo "🚀 Get started: ./docs/EPF/scripts/create-instance-structure.sh {product-name}"
  echo "📖 Read: docs/EPF/docs/guides/ADOPTION_GUIDE.md"
  exit 0
fi

INSTANCE_NAME=$(basename "$INSTANCE_DIR")
echo "✅ Instance detected: $INSTANCE_NAME"
echo ""

# Detect adoption level
READY_FILES=$(ls "$INSTANCE_DIR/READY/"*.yaml 2>/dev/null | wc -l)
FIRE_FILES=$(find "$INSTANCE_DIR/FIRE" -name "*.yaml" 2>/dev/null | wc -l)

if [ -f "$INSTANCE_DIR/READY/00_north_star.yaml" ]; then
  echo "📍 Adoption Level: 0 (North Star created)"
fi

if [ -f "$INSTANCE_DIR/READY/05_roadmap_recipe.yaml" ]; then
  echo "📍 Adoption Level: 1+ (Roadmap created)"
fi

if [ $FIRE_FILES -gt 0 ]; then
  echo "📍 Adoption Level: 2+ (FIRE phase artifacts exist)"
fi

echo ""
echo "━━━ Artifact Inventory ━━━"
echo "READY artifacts: $READY_FILES"
echo "FIRE artifacts: $FIRE_FILES"

# Run health check
echo ""
echo "━━━ Validation Status ━━━"
./docs/EPF/scripts/epf-health-check.sh --summary 2>/dev/null

echo ""
echo "🔍 Full health check: ./docs/EPF/scripts/epf-health-check.sh"
echo "📊 Content quality: ./docs/EPF/scripts/check-content-readiness.sh $INSTANCE_DIR/READY"
```

**Usage**:
```bash
./docs/EPF/scripts/epf-status.sh
```

**Benefits**:
- ✅ Shows "where am I?" at a glance
- ✅ Suggests next steps based on level
- ✅ Quick validation summary
- ✅ Helps agents orient themselves

---

## Implementation Recommendations

### Phase 1: Immediate (High Impact, Low Effort)

1. **Create `.ai-agent-first-contact.md`** (Solution 1)
   - Location: `/docs/EPF/.ai-agent-first-contact.md`
   - Time: 2 hours to write, test with Copilot
   - Impact: Solves discovery problem immediately

2. **Enhance `.github/copilot-instructions.md`** (Solution 2)
   - Add "First Time Here?" section at top
   - Time: 1 hour
   - Impact: Improves guidance for agents who find this file

3. **Create `scripts/epf-status.sh`** (Solution 5)
   - Single-command status dashboard
   - Time: 2-3 hours
   - Impact: Helps agents orient quickly

**Total time**: ~5-6 hours  
**Expected outcome**: AI agents can discover EPF guidance and orient themselves effectively

---

### Phase 2: Near-Term (High Impact, Medium Effort)

4. **Create `wizards/WIZARD_SELECTOR.md`** (Solution 3)
   - User intent → wizard mapping
   - Time: 3-4 hours (catalog all intents)
   - Impact: Reduces "which wizard?" confusion

5. **Add AI Agent Guidance to Schemas** (Solution 4)
   - Enhance schema description fields
   - Time: 4-5 hours (all schemas)
   - Impact: Prevents "generate from memory" mistakes

6. **Test with Real AI Agents**
   - Add EPF to test repo, ask Copilot/Claude to help
   - Observe behavior, refine guidance
   - Time: 4-6 hours
   - Impact: Validates solutions work in practice

**Total time**: ~11-15 hours  
**Expected outcome**: AI agents consistently follow schema-first approach, use wizards correctly

---

### Phase 3: Long-Term (Medium Impact, High Effort)

7. **Create "Migrate Existing Product" Workflow**
   - Specific guide for mature repos with existing docs
   - Time: 8-12 hours
   - Impact: Helps teams convert existing docs to EPF

8. **AI Agent Testing Suite**
   - Automated tests: "Agent sees repo → follows correct path?"
   - Time: 16-20 hours
   - Impact: Prevents regression in agent guidance

9. **Interactive Wizard Selector (CLI)**
   - `./scripts/select-wizard.sh` → asks questions → launches wizard
   - Time: 12-16 hours
   - Impact: User-friendly alternative to reading docs

**Total time**: ~36-48 hours  
**Expected outcome**: Complete onboarding system for both AI agents and human users

---

## Success Metrics

### AI Agent Behavior (Qualitative)

**Before improvements:**
- ❌ Generates artifacts from memory (schema violations)
- ❌ Creates files in wrong location (canonical pollution)
- ❌ Doesn't consult wizards (reinvents guidance)
- ❌ Skips validation (commits invalid artifacts)

**After improvements:**
- ✅ Reads schema before generating
- ✅ Uses wizards appropriately
- ✅ Validates before committing
- ✅ Follows EPF workflows consistently

### User Experience (Qualitative)

**Before improvements:**
- User: "Help me use EPF"
- Agent: *generates artifacts from memory*
- Result: Schema validation errors, user frustration, 25+ min rework

**After improvements:**
- User: "Help me use EPF"
- Agent: *reads `.ai-agent-first-contact.md`* → "I see you're in a fresh repo with 3 people. I'll use the Level 1 wizard..."
- Result: Valid artifacts on first try, user confidence

### Adoption Metrics (Quantitative)

Track in product repos with EPF:
- Time to first valid artifact (target: <3 hours for Level 0)
- Validation error rate on first generation (target: <10%)
- User rework cycles (target: ≤1 per artifact)
- Agent consulted wizard? (target: 90%+ of sessions)

---

## Risk Analysis

### Risk 1: Agents Don't Discover `.ai-agent-first-contact.md`

**Mitigation**:
- Add explicit instructions to README.md "AI Agent Quick Start" section
- Add note to `.github/copilot-instructions.md` referencing it
- Use standard naming convention (`.ai-*` files are common pattern)

### Risk 2: Too Much Guidance = Analysis Paralysis

**Mitigation**:
- Keep first-contact file concise (≤150 lines)
- Use routing table ("If user says X → do Y")
- Don't duplicate content (link to existing docs)

### Risk 3: Guidance Becomes Outdated

**Mitigation**:
- Include version number in first-contact file
- Add to maintenance protocol (update when wizards change)
- Test periodically with fresh AI agent sessions

### Risk 4: Human Users Confused by AI-Specific Files

**Mitigation**:
- Clear naming: `.ai-agent-first-contact.md` (not "getting-started.md")
- Add note: "This file is for AI assistants. Humans: see ADOPTION_GUIDE.md"
- Keep human docs separate and primary

---

## Conclusion

**Current state**: EPF has excellent documentation, but AI agents must "know where to look" - there's no automatic discovery mechanism.

**Core problem**: Gap between "user adds EPF to repo" and "agent helps user effectively" - agents may generate from memory, skip wizards, miss validation.

**Solution**: Create explicit "first contact" guidance for AI agents with:
1. Automatic discovery (`.ai-agent-first-contact.md`)
2. Intent routing ("user says X → use Y")
3. Anti-pattern warnings (schema-first mandate)
4. Standard workflows (create → validate → commit)

**Expected outcome**: AI agents become consistent EPF collaborators, following framework guidelines naturally, reducing user frustration and rework time.

**Next steps**: Implement Phase 1 solutions (5-6 hours), test with real agents, iterate based on observed behavior.
