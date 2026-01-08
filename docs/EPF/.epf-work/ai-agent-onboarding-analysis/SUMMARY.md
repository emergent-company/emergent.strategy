# AI Agent Onboarding Analysis - Summary

**Date**: 2026-01-08  
**Context**: Analysis of how AI agents (GitHub Copilot, Claude, etc.) discover and adopt EPF when added to product repositories

---

## Key Findings

### Current State ✅

EPF has **excellent documentation** for AI agents who know where to look:
- Comprehensive README with AI agent section
- `.github/copilot-instructions.md` for quick reference
- Wizard system (lean_start, specialists)
- Adoption guide with 4 escalation levels
- Schema-first validation system

### Critical Gap ⚠️

**No automatic discovery mechanism** for AI agents encountering EPF for the first time:
- Agents must "know to look" for `.github/copilot-instructions.md`
- No standard "AI agent start here" file in EPF root
- No user intent routing ("user says X → use wizard Y")
- No "first time in product repo" workflow

### Common Agent Mistakes

Based on `.github/instructions/self-learning.instructions.md`:

1. **Generating from memory** instead of reading schema (~25 min wasted per artifact)
2. **Creating instance files in canonical repo** (purity violation)
3. **Skipping validation** after artifact creation
4. **Not consulting wizards** (reinventing guidance)

---

## Solution Implemented

### Created: `.ai-agent-first-contact.md`

**Location**: `/docs/EPF/.ai-agent-first-contact.md` (EPF root, highly discoverable)

**Purpose**: Single entry point for AI agents encountering EPF for first time

**Key Features**:
1. **Location check** - "Where am I?" (canonical vs product repo)
2. **User intent routing** - "User says X → do Y" decision tree
3. **Standard onboarding workflow** - 4-step process for new instances
4. **Anti-pattern warnings** - Pre-generation checklist (schema-first mandate)
5. **Wizard selection guide** - Task-based wizard mapping
6. **Quick commands** - Copy-paste commands for common tasks
7. **Essential reading** - Prioritized documentation based on context

**Expected Impact**:
- ✅ Agents discover EPF guidance automatically
- ✅ Schema-first generation becomes default behavior
- ✅ Wizard usage increases (agents know which to use)
- ✅ Validation becomes standard (before committing)
- ✅ User experience improves (fewer rework cycles)

---

## Supporting Analysis

### Detailed Analysis Document

**Location**: `.epf-work/ai-agent-onboarding-analysis/AI_AGENT_FIRST_CONTACT_ANALYSIS.md`

**Contents**:
- **Problem Analysis**: Fresh repo vs mature repo scenarios
- **Current Documentation Audit**: Strengths and gaps
- **5 Proposed Solutions**: With effort estimates and priorities
- **Implementation Roadmap**: 3 phases (immediate, near-term, long-term)
- **Success Metrics**: Qualitative and quantitative
- **Risk Analysis**: 4 risks with mitigations

---

## Next Steps (Recommended)

### Phase 1: Immediate (5-6 hours total)

1. ✅ **DONE**: Created `.ai-agent-first-contact.md`
2. **TODO**: Test with real AI agents
   - Add EPF to test product repo
   - Ask Copilot/Claude: "Help me get started with EPF"
   - Observe: Does agent find and follow first-contact file?
   - Refine based on behavior
3. **TODO**: Enhance `.github/copilot-instructions.md`
   - Add "First Time Here? AI Agent Onboarding" section at top
   - Reference `.ai-agent-first-contact.md`
4. **TODO**: Create `scripts/epf-status.sh`
   - Single-command dashboard showing instance status
   - Helps agents orient quickly

### Phase 2: Near-Term (11-15 hours)

5. Create `wizards/WIZARD_SELECTOR.md` - User intent → wizard mapping
6. Add AI agent guidance to schema description fields
7. Comprehensive testing with multiple AI agents

### Phase 3: Long-Term (36-48 hours)

8. Create "Migrate Existing Product" workflow guide
9. AI agent testing suite (automated validation)
10. Interactive wizard selector CLI

---

## Questions for Consideration

### 1. File Naming Convention

**Current**: `.ai-agent-first-contact.md`

**Alternatives**:
- `.copilot-welcome.md` (more specific to GitHub Copilot)
- `.ai-agent-welcome.md` (shorter, friendlier)
- `AI_AGENT_QUICKSTART.md` (no hidden file, more discoverable in file trees)

**Recommendation**: Keep `.ai-agent-first-contact.md` (clear purpose, standard pattern)

### 2. Should This Be in Canonical EPF?

**Yes, because**:
- ✅ It's framework guidance (applies to all products)
- ✅ Generic content (no product-specific examples)
- ✅ Needs to be in sync across all product repos
- ✅ Part of EPF's "first contact" experience

**Syncs to product repos via**: `./scripts/sync-repos.sh pull`

### 3. Integration with Existing Docs

**Strategy**: Keep first-contact file as **router**, not **duplicator**:
- Don't duplicate content from ADOPTION_GUIDE.md
- Link extensively to existing docs
- Provide quick decisions, not detailed explanations
- Think: "triage nurse" not "comprehensive medical reference"

---

## User Testing Scenarios

### Test 1: Fresh Repo, Solo Founder

**Setup**: Empty product repo with EPF added via subtree  
**User says**: "Help me get started with EPF"  
**Expected agent behavior**:
1. Finds `.ai-agent-first-contact.md` (via semantic search or explicit read)
2. Runs location check (confirms product repo)
3. Routes to "User Intent Routing" → "get started"
4. Asks team size → 1 person
5. Opens `wizards/lean_start.agent_prompt.md` (Level 0)
6. Follows wizard to create North Star
7. Validates before committing

### Test 2: Mature Repo, Feature Definition Request

**Setup**: Product repo with existing codebase, EPF just added  
**User says**: "Create feature definitions for our login system"  
**Expected agent behavior**:
1. Finds `.ai-agent-first-contact.md`
2. Routes to "create feature definitions"
3. Checks schema-first checklist
4. Reads `schemas/feature_definition_schema.json`
5. Reads example: `features/01-technical/fd-002-*.yaml`
6. Generates feature using schema as template
7. Validates with `validate-feature-quality.sh`

### Test 3: Canonical Repo, Accidental Instance Creation

**Setup**: Agent is in canonical EPF repo (`/path/to/epf`)  
**User says**: "Create a roadmap for my product XYZ"  
**Expected agent behavior**:
1. Finds `.ai-agent-first-contact.md`
2. Runs location check: `pwd` → `/path/to/epf`
3. Sees: "❌ CANONICAL EPF REPO - STOP!"
4. Responds: "I can't create product-specific artifacts here. This is the canonical EPF framework. You need to be in a product repository. Would you like me to help you add EPF to your product repo first?"

---

## Version Management

**Current EPF version**: v2.3.3

**Question**: Does adding `.ai-agent-first-contact.md` warrant version bump?

**Analysis**:
- Change type: Documentation improvement (new file)
- Breaking? NO (doesn't change existing behavior)
- New feature? YES (new discovery mechanism for agents)
- Docs/fixes? YES (addresses agent onboarding gap)

**Recommendation**: **MINOR version bump** (2.3.3 → 2.4.0)
- Rationale: New capability (agent discovery system), backward-compatible
- Alternative: **PATCH** (2.3.3 → 2.3.4) if treating as "documentation improvement"

**User's decision needed**: MINOR (new feature) or PATCH (docs improvement)?

---

## Files Created

1. **`.ai-agent-first-contact.md`** (EPF root)
   - 400+ lines
   - Complete AI agent onboarding guide
   - Ready for testing

2. **`.epf-work/ai-agent-onboarding-analysis/AI_AGENT_FIRST_CONTACT_ANALYSIS.md`**
   - 1000+ lines
   - Detailed analysis, problem definition, solutions, implementation roadmap
   - Reference for future work

3. **This summary** (`.epf-work/ai-agent-onboarding-analysis/SUMMARY.md`)
   - Executive summary for quick reference

---

## Open Questions

1. Should we create `scripts/epf-status.sh` now (Phase 1) or wait for testing feedback?
2. Is file naming convention (`.ai-agent-first-contact.md`) optimal for agent discovery?
3. Should this trigger MINOR or PATCH version bump?
4. Do we want to add inline schema guidance (Phase 2) immediately or wait?
5. Should we create PR with these changes or commit directly to main?

---

## Conclusion

**Problem identified**: AI agents lack automatic discovery mechanism when encountering EPF in product repos, leading to schema violations, wizard misuse, and validation skips.

**Solution implemented**: Created `.ai-agent-first-contact.md` as explicit entry point with location checks, intent routing, anti-pattern warnings, and standard workflows.

**Next critical step**: **Test with real AI agents** to validate solution works as expected and refine based on observed behavior.

**Expected outcome**: AI agents become consistent EPF collaborators, following framework guidelines naturally, reducing user frustration and rework time by ~25 minutes per artifact.
