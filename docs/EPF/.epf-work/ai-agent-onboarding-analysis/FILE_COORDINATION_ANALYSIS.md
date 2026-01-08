# EPF AI Agent File Coordination Analysis

**Date**: 2026-01-08  
**Context**: Analysis of three AI agent guidance files and their coordination

---

## Current State: Three Files

### 1. `.ai-agent-instructions.md` (EPF root, 582 lines)

**Primary Purpose**: Repository consistency guardian protocol  
**Audience**: AI agents making changes to EPF framework  
**Focus**: Maintenance workflows, consistency checks, breaking changes

**Key Content**:
- ✅ Schema-first enrichment workflow (CRITICAL for artifact generation)
- ✅ Breaking change detection protocol (STEP 0)
- ✅ Consistency check procedures (STEP 1-5)
- ✅ Version management (when to bump, how to bump)
- ✅ Location checks (canonical vs product repo)
- ✅ Traceability validation
- ✅ Health check integration

**When to use**: Agent is **modifying EPF framework** or **enriching instance artifacts**

---

### 2. `.github/copilot-instructions.md` (745 lines)

**Primary Purpose**: Quick reference for product repo operations  
**Audience**: AI agents working in product repos (emergent, twentyfirst, etc.)  
**Focus**: Commands, product repo locations, sync procedures

**Key Content**:
- ✅ Quick command reference (sync, validate, version bump)
- ✅ Product repo list (4 repos with paths and branches)
- ✅ Pre-flight checklist (location check)
- ✅ Pre-commit checklist (classify changes, version bump)
- ✅ Links to comprehensive docs (`.ai-agent-instructions.md`)
- ✅ Sync procedures for "all product repos"
- ✅ Maintenance checklists

**When to use**: Agent is **working in product repo** or needs **quick command reference**

---

### 3. `.ai-agent-first-contact.md` (NEW, 400+ lines)

**Primary Purpose**: First-time discovery and intent routing  
**Audience**: AI agents encountering EPF for the first time  
**Focus**: Onboarding, wizard selection, getting started workflows

**Key Content**:
- ✅ Location check (am I in canonical or product repo?)
- ✅ User intent routing ("user says X → do Y")
- ✅ Standard onboarding workflow (create instance → adopt level → use wizard)
- ✅ Pre-generation checklist (schema-first mandate)
- ✅ Wizard selection guide (task → wizard mapping)
- ✅ Anti-pattern warnings (common mistakes)
- ✅ Quick commands for common tasks
- ✅ Essential reading prioritization

**When to use**: Agent is **helping user adopt EPF for first time** or **user asks "how do I start?"**

---

## Coordination Analysis

### ✅ GOOD: Clear Role Separation

Each file has a **distinct primary purpose**:

| File | Role | Trigger |
|------|------|---------|
| `.ai-agent-first-contact.md` | **Discovery & Onboarding** | User says "get started", "help me use EPF" |
| `.github/copilot-instructions.md` | **Quick Reference** | Agent needs command, product repo info, sync procedure |
| `.ai-agent-instructions.md` | **Maintenance Protocol** | Agent is modifying framework or enriching artifacts |

**This is GOOD** - different use cases, minimal overlap in primary purpose.

---

### ⚠️ CONCERN: Content Overlap

#### Overlap 1: Location Check (All 3 Files)

**`.ai-agent-first-contact.md` (lines 8-28)**:
```markdown
## 🚨 CRITICAL: Where Are You Right Now?
pwd  # Check current directory
- Canonical EPF repo → STOP! Read CANONICAL_PURITY_RULES.md
- Product repo → Continue
```

**`.github/copilot-instructions.md` (lines 95-112)**:
```markdown
### Question 1: Where am I right now?
pwd  # Check your current working directory
- /Users/*/Code/epf (canonical) → STOP! Read CANONICAL_PURITY_RULES.md
- /Users/*/Code/{product-name} (product repo) → Proceed
```

**`.ai-agent-instructions.md` (lines 8-26)**:
```markdown
## ⚠️ FIRST: Check If You're in Canonical EPF
pwd  # Check current directory
1. If in `/Users/*/Code/epf` (canonical):
   - CAN: Modify templates, schemas, scripts
   - CANNOT: Create instances
2. If in `/Users/*/Code/{product-name}` (product):
   - CAN: Create instances
   - CANNOT: Modify framework
```

**Analysis**: Same concept, slight variations in wording. **Acceptable redundancy** - critical safety check should be in all files.

---

#### Overlap 2: Schema-First Workflow (2 Files)

**`.ai-agent-first-contact.md` (lines 172-184)**:
```markdown
### Checklist: Pre-Generation (MANDATORY)
- [ ] Schema-first: Have I read schemas/{artifact-type}_schema.json?
- [ ] Example check: Have I read a validated example?
- [ ] Memory ban: Am I generating from schema (NOT training data)?
```

**`.ai-agent-instructions.md` (lines 44-92)**:
```markdown
## 🔧 CRITICAL: How to Enrich EPF Instances (Schema-First Workflow)
STEP 1: Read Schema FIRST (Non-negotiable)
STEP 2: Write Content Matching Schema Exactly
STEP 3: Validate Immediately
STEP 4: If Schema is Unclear
```

**Analysis**: `.ai-agent-first-contact.md` has **brief checklist**, `.ai-agent-instructions.md` has **detailed procedure**. This is **appropriate** - first-contact gives overview, instructions give deep dive.

---

#### Overlap 3: Version Bump Procedures (2 Files)

**`.github/copilot-instructions.md` (lines 114-200)**:
```markdown
## Pre-Commit Checklist for Framework Changes
Step 1: Classify Your Change Type
Step 2: Version Bump Decision
Step 3: Determine Version Type
Step 4: Use Automated Version Bump
```

**`.ai-agent-instructions.md` (lines 130-188)**:
```markdown
### STEP 0: Pre-Flight Decision Gate
Breaking Change Detection
Version Impact Assessment
Proposal Protocol
```

**Analysis**: **Significant overlap** (both explain when to bump versions, both show MAJOR/MINOR/PATCH rules). `.github/copilot-instructions.md` is more procedural (steps), `.ai-agent-instructions.md` is more conceptual (breaking changes first).

**Concern**: Duplication risk - if version rules change, must update both files.

---

#### Overlap 4: Wizard Selection (2 Files)

**`.ai-agent-first-contact.md` (lines 223-238)**:
```markdown
## 🧙 Wizard Selection Guide
| User Wants To Create | Use This Wizard |
| North Star | lean_start Step 1 (2 hours) |
| Market trends | 01_trend_scout (30-45 min) |
| Roadmap | lean_start Step 3 (1-2 hours) |
```

**`.github/copilot-instructions.md`**:
- No wizard selection guide (links to `wizards/README.md`)

**`.ai-agent-instructions.md`**:
- No wizard selection guide

**Analysis**: **Good** - only in first-contact file (onboarding context). Other files link to `wizards/README.md`.

---

### ⚠️ CONCERN: Navigation Complexity

**From user's perspective**: "Which file should AI read first?"

**Current references**:

- **README.md** (AI Agent Quick Start):
  - Step 1: `.github/copilot-instructions.md` (Pre-Flight)
  - Step 2: `CANONICAL_PURITY_RULES.md` (Purity Rules)
  - Step 3: `README.md` itself (Framework Overview)

- **`.github/copilot-instructions.md`**:
  - "All comprehensive guidelines → `.ai-agent-instructions.md`"
  - "Read `.ai-agent-instructions.md` before doing ANY EPF work"

- **`.ai-agent-first-contact.md`**:
  - Links to `.github/copilot-instructions.md`, `docs/guides/ADOPTION_GUIDE.md`, `wizards/`, etc.
  - Does NOT mention `.ai-agent-instructions.md`

**Problem**: No clear entry point. Agent might read:
1. README → copilot-instructions → ai-agent-instructions (3 files)
2. Or: first-contact → adoption guide → wizard (different path)
3. Or: Just copilot-instructions and miss first-contact entirely

---

## Recommendations

### Option A: Keep All Three, Improve Coordination ⭐ RECOMMENDED

**Rationale**: Each file serves a distinct use case. The overlap is mostly acceptable (location checks, schema-first reminders).

**Changes needed**:

1. **Create Clear Navigation Hierarchy**

   Update README.md "AI Agent Quick Start" section:
   ```markdown
   ## 🤖 AI Agent Quick Start
   
   **Choose your entry point based on context:**
   
   | Your Situation | Read This First |
   |----------------|-----------------|
   | **First time seeing EPF** | `.ai-agent-first-contact.md` → Routes to appropriate guide |
   | **Working in product repo** | `.github/copilot-instructions.md` → Quick commands |
   | **Modifying EPF framework** | `.ai-agent-instructions.md` → Consistency protocol |
   | **User asks "get started"** | `.ai-agent-first-contact.md` → Onboarding workflow |
   | **User asks "validate work"** | `.github/copilot-instructions.md` → Validation commands |
   | **Enriching instance artifacts** | `.ai-agent-instructions.md` → Schema-first workflow |
   ```

2. **Add Cross-References**

   In `.ai-agent-first-contact.md`, add at top:
   ```markdown
   **For ongoing operations after onboarding:**
   - Quick commands → `.github/copilot-instructions.md`
   - Framework maintenance → `.ai-agent-instructions.md`
   - Consistency protocols → `MAINTENANCE.md`
   ```

   In `.github/copilot-instructions.md`, add:
   ```markdown
   **If user is NEW to EPF (first time):**
   - Start with `.ai-agent-first-contact.md` for onboarding workflow
   - Then return here for daily operations
   ```

   In `.ai-agent-instructions.md`, add:
   ```markdown
   **If user is adopting EPF for first time:**
   - See `.ai-agent-first-contact.md` for onboarding workflow
   - Return here when ready to enrich artifacts or modify framework
   ```

3. **Deduplicate Version Bump Procedures**

   **Keep detailed version bump in**: `.ai-agent-instructions.md` (canonical source)
   
   **In `.github/copilot-instructions.md`**, simplify to:
   ```markdown
   ### Version Bump Quick Reference
   
   **Automated (recommended)**:
   ```bash
   ./scripts/classify-changes.sh  # Check if bump needed
   ./scripts/bump-framework-version.sh "X.Y.Z" "Description"
   ```
   
   **For detailed version bump protocol, see:** `.ai-agent-instructions.md` STEP 0
   ```

4. **Add File Purpose Header to Each**

   Update all three files with clear purpose statement at top.

---

### Option B: Merge `.ai-agent-first-contact.md` into `.github/copilot-instructions.md`

**Rationale**: Reduce file count, consolidate agent guidance into one place.

**Pros**:
- ✅ Single entry point for agents
- ✅ Less navigation complexity

**Cons**:
- ❌ `.github/copilot-instructions.md` becomes very long (745 + 400 = 1145 lines)
- ❌ Loses clear "onboarding vs operations" separation
- ❌ Mixes product repo focus with first-time adoption

**Verdict**: **NOT RECOMMENDED** - would create single monolithic file that's harder to navigate.

---

### Option C: Merge `.ai-agent-instructions.md` and `.github/copilot-instructions.md`

**Rationale**: Both are operational guidance, could be combined.

**Pros**:
- ✅ Reduces duplication (version bump procedures, location checks)
- ✅ Single source for "ongoing operations"

**Cons**:
- ❌ Loses separation between "framework maintenance" and "product repo operations"
- ❌ `.ai-agent-instructions.md` is more technical/protocol-focused
- ❌ `.github/copilot-instructions.md` is product-repo-specific (4 repos list)

**Verdict**: **NOT RECOMMENDED** - different audiences (maintainers vs product teams).

---

### Option D: Create Navigation Index File

**New file**: `.ai-agent-navigation.md` (very short, <50 lines)

**Content**:
```markdown
# AI Agent Navigation: Which File to Read?

## Quick Decision Tree

**User says:**
- "Help me get started with EPF" → `.ai-agent-first-contact.md`
- "Create a roadmap" (first time) → `.ai-agent-first-contact.md`
- "Validate our work" → `.github/copilot-instructions.md`
- "Enrich this artifact" → `.ai-agent-instructions.md`
- "Modify this schema" → `.ai-agent-instructions.md`

**You are in:**
- Canonical EPF repo → `.ai-agent-instructions.md` (framework changes)
- Product repo, daily work → `.github/copilot-instructions.md` (commands)
- Product repo, first time → `.ai-agent-first-contact.md` (onboarding)

**File Purposes:**
1. **`.ai-agent-first-contact.md`** - Onboarding & wizard selection
2. **`.github/copilot-instructions.md`** - Quick commands & product repos
3. **`.ai-agent-instructions.md`** - Framework maintenance & consistency
```

**Pros**:
- ✅ Clear entry point
- ✅ Explicit routing
- ✅ Very short (low maintenance burden)

**Cons**:
- ❌ Adds 4th file
- ❌ Agents must discover THIS file first (same discovery problem)

**Verdict**: **MAYBE** - could help, but doesn't solve root discovery issue.

---

## Recommendation Summary

### ✅ KEEP ALL THREE FILES with improvements:

1. **Add clear purpose headers** to all three files
2. **Add cross-references** between files
3. **Update README.md** with situation-based routing table
4. **Deduplicate version bump** procedures (canonical in `.ai-agent-instructions.md`)
5. **Add "when to use" guidance** at top of each file

### File Roles (After Improvements):

```
┌─────────────────────────────────────────────────────────────────┐
│  .ai-agent-first-contact.md                                     │
│  ROLE: Discovery & Onboarding                                   │
│  WHEN: User adopting EPF for first time                        │
│  LINKS TO: Wizards, adoption guide, copilot-instructions       │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  .github/copilot-instructions.md                                │
│  ROLE: Quick Reference & Daily Operations                       │
│  WHEN: Agent working in product repo, needs commands            │
│  LINKS TO: ai-agent-instructions (for maintenance)              │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  .ai-agent-instructions.md                                      │
│  ROLE: Framework Maintenance & Consistency Protocol             │
│  WHEN: Agent modifying EPF framework or enriching artifacts     │
│  LINKS TO: MAINTENANCE.md, schemas, validation scripts          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Checklist

- [ ] Add "File Purpose" header to `.ai-agent-first-contact.md`
- [ ] Add "File Purpose" header to `.github/copilot-instructions.md`
- [ ] Add "File Purpose" header to `.ai-agent-instructions.md`
- [ ] Add cross-references to all three files
- [ ] Update README.md "AI Agent Quick Start" with routing table
- [ ] Deduplicate version bump procedures (simplify copilot-instructions, keep detailed in ai-agent-instructions)
- [ ] Test navigation flow: Have AI agent simulate "first time user" scenario

---

## Conclusion

**Current state**: Three files with clear but overlapping purposes. Some acceptable redundancy (location checks, schema-first reminders), some problematic duplication (version bump procedures).

**Recommendation**: **Keep all three**, improve coordination with:
1. Clear purpose headers
2. Cross-references
3. Situation-based routing table in README
4. Deduplication where appropriate

**Rationale**: Each file serves distinct use case. The "discovery problem" is solved by `.ai-agent-first-contact.md` being named with standard `.ai-*` prefix. Navigation complexity is solved by explicit routing guidance in each file and README.

**Risk**: Still depends on agents discovering the right file. Mitigate by:
- Adding references in README (primary entry point)
- Using standard naming convention (`.ai-*`)
- Cross-referencing between files
