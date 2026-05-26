# Feature Definition Granularity Guide

**Version:** 1.0.0  
**EPF Schema Version:** 2.1.0  
**Last Updated:** 2025-01-19  
**Status:** Complete

---

## Table of Contents

1. [Introduction](#introduction)
2. [The Granularity Challenge](#the-granularity-challenge)
3. [Core Principles](#core-principles)
4. [The Right-Sizing Test](#the-right-sizing-test)
5. [When to Split Features](#when-to-split-features)
6. [When NOT to Split Features](#when-not-to-split-features)
7. [Feature-to-KR Relationships](#feature-to-kr-relationships)
8. [Anti-Patterns](#anti-patterns)
9. [Examples from the EPF Corpus](#examples-from-the-epf-corpus)
10. [Decision Flowchart](#decision-flowchart)
11. [Related Documentation](#related-documentation)

---

## 1. Introduction

This guide addresses one of the most common questions when creating Feature Definitions (FDs): **How big should a feature be?**

Feature Definition granularity is the art of scoping features at the right level—not so broad that they become unmanageable, and not so narrow that they fragment naturally cohesive functionality.

**What you'll learn:**
- How to determine if something is one feature or multiple features
- Signals that a feature needs splitting
- Signals that features are over-fragmented
- How features relate to KRs and Value Model components
- Common anti-patterns and how to avoid them

**Prerequisites:**
- Familiarity with EPF Feature Definitions (see [FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md](FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md))
- Understanding of Value Models (see [VALUE_MODEL_MATURITY_GUIDE.md](VALUE_MODEL_MATURITY_GUIDE.md))
- Understanding of Roadmap Recipes and KRs

---

## 2. The Granularity Challenge

### Why Granularity Matters

**Too Coarse (features too large):**
- Features become hard to track and prioritize
- Different parts may be at different maturity stages
- KRs can't precisely target specific capabilities
- Difficult to assign ownership
- "Feature delivered" becomes meaningless when only part is done

**Too Granular (features too small):**
- Overhead of managing many feature definitions
- Artificial boundaries between naturally cohesive functionality
- Users don't recognize isolated pieces as valuable
- Dependencies become complex (everything depends on everything)
- Roadmap becomes cluttered with hundreds of tiny items

### The EPF Perspective

EPF defines features at **Level 2 (L2)** of the WHY-HOW-WHAT hierarchy:

| Level | What It Contains | Granularity Guidance |
|-------|------------------|---------------------|
| **L1: Value Model** | WHY (purpose, outcomes) + HOW (value flows) | 3-7 L2 themes per pillar |
| **L2: Feature Definition** | HOW (user outcomes) + WHAT (strategic capabilities) | 2-15 capabilities per feature |
| **L3: Implementation Spec** | HOW (technical approach) + WHAT (components) | Engineering-owned |
| **L4: Code** | The actual WHAT | Engineering-owned |

The existing guidance tells you how many **capabilities** a feature should have (2-15), but not how to determine the **feature boundary** itself.

---

## 3. Core Principles

### Principle 1: The Job-to-Be-Done Test

**A Feature Definition should represent a coherent job-to-be-done that users recognize as a complete capability.**

Ask: "Would a user describe this as one thing they can accomplish?"

✅ **Good:** "I can manage documents and track versions" → Document Management & Version Control  
❌ **Bad:** "I can click an upload button" → Too granular (that's a UI element)  
❌ **Bad:** "I can do everything with the platform" → Too coarse (that's a product)

### Principle 2: The One-Sentence Test

**You should be able to describe the feature's purpose in one sentence without using "and" to connect unrelated functions.**

✅ **Good:** "Enable teams to collaborate on documents with inline comments and threaded discussions"  
(The "and" connects related functions within collaboration)

❌ **Bad:** "Enable document collaboration AND manage user authentication AND generate reports"  
(The "and" connects unrelated jobs—these should be separate features)

### Principle 3: Capability Containers

**Features are "capability containers"—capabilities are the right decomposition level within features.**

If you find yourself wanting to split a feature, first ask: "Should this be two features, or should one of my existing capabilities become more prominent?"

The schema allows 2-15 capabilities per feature specifically to accommodate varying complexity within a single coherent job-to-be-done.

### Principle 4: Maturity Alignment

**All capabilities within a feature should reasonably mature together.**

If some capabilities are "proven" while others are still "hypothetical," and they're progressing on different timelines, this is often a signal to split.

---

## 4. The Right-Sizing Test

Use this checklist to evaluate whether your feature is properly scoped:

### Size Indicators

| Metric | Too Granular | Right Size | Too Coarse |
|--------|--------------|------------|------------|
| **Capabilities** | 1 | 2-15 | >15 |
| **Personas Needed** | 1-2 (same persona) | 2-4 (diverse but related) | >4 distinct personas |
| **Scenarios** | 1-2 | 3-8 | >10 unrelated scenarios |
| **Value Model Paths** | Contributes to 1 narrow path | Contributes to 1-3 related paths | Contributes to >5 unrelated paths |
| **Dependencies** | Depends on nothing, nothing depends on it | Clear upstream/downstream relationships | Everything depends on it |
| **Maturity Span** | N/A | Capabilities mature within 1-2 stages of each other | Capabilities span hypothetical to scaled |

### Quick Questions

Answer these about your proposed feature:

1. **User Recognition:** Would a typical user describe this as "one thing"?
2. **Standalone Value:** Does this provide value even if other features don't exist?
3. **Capability Coherence:** Do all capabilities serve the same job-to-be-done?
4. **Reasonable Ownership:** Can one team own all capabilities?
5. **Maturity Alignment:** Will capabilities mature on similar timelines?

**Scoring:**
- 5 "yes" answers: Feature is well-scoped
- 3-4 "yes" answers: Consider refining scope
- 0-2 "yes" answers: Strong signal to split or combine

---

## 5. When to Split Features

### Split Signal 1: Persona Explosion

**Indicator:** You need more than 4 distinct personas to cover all use cases.

The schema requires exactly 4 personas. If you're struggling to pick just 4 because the feature serves too many distinct user types, it's likely doing too much.

**Example:**
- Feature: "Enterprise Platform Administration"
- Personas needed: IT Admin, Security Officer, Compliance Manager, Finance Controller, HR Director, Operations Manager
- **Action:** Split into "Security & Access Control" (IT Admin, Security Officer), "Compliance Management" (Compliance Manager), "Resource Administration" (Finance, HR, Ops)

### Split Signal 2: Unrelated Scenarios

**Indicator:** Your scenarios don't share a common job-to-be-done.

If scenario A is about "uploading documents" and scenario B is about "generating compliance reports," these might be different jobs.

**Test:** Can you complete scenario A without knowing scenario B exists? If they're completely independent, consider separate features.

### Split Signal 3: Divergent Maturity Timelines

**Indicator:** Some capabilities are production-ready while others are still being designed.

Use the `feature_maturity` section to check:

```yaml
# This feature might need splitting
feature_maturity:
  overall_stage: "hypothetical"  # Limited by least-mature capability
  capability_maturity:
    - capability_id: "cap-001"
      stage: "scaled"  # ← Fully mature
    - capability_id: "cap-002"
      stage: "proven"  # ← Validated
    - capability_id: "cap-003"
      stage: "hypothetical"  # ← Not started - dragging feature maturity down
```

If cap-003 is on a 12-month horizon while cap-001/002 are already deployed, cap-003 might belong in a future feature.

### Split Signal 4: Different Strategic Purposes

**Indicator:** Capabilities contribute to completely different Value Model paths.

```yaml
# Suspicious - capabilities serving unrelated value paths
strategic_context:
  contributes_to:
    - Product.Operate.Monitoring      # ← Observability value
    - Commercial.Acquire.Discovery    # ← Sales value  
    - OrgOps.Coordinate.Compliance    # ← Internal ops value
```

While cross-cutting features exist, if your capabilities cleanly partition into different value paths, consider whether they're actually separate features.

### Split Signal 5: Organizational Ownership Conflict

**Indicator:** Different teams would naturally own different capabilities.

If your "Reporting & Analytics" feature has:
- Capabilities 1-3: Owned by Data Engineering
- Capabilities 4-5: Owned by Frontend Team
- Capabilities 6-7: Owned by Compliance Team

Consider splitting along ownership lines to enable parallel work and clear accountability.

---

## 6. When NOT to Split Features

### Don't Split Signal 1: Pieces Would Be Meaningless Alone

**Indicator:** Extracted functionality wouldn't deliver standalone user value.

❌ "Upload Button" is not a feature—it's a UI element  
❌ "Entity Extraction Algorithm" is not a feature—it's an implementation detail  
❌ "Database Schema for Documents" is not a feature—it's technical infrastructure

These belong as capabilities within a larger feature like "Document Management."

### Don't Split Signal 2: Would Create Artificial Handoffs

**Indicator:** Users would need to "complete" one feature to start another, but they perceive it as one workflow.

If you split "Search" from "Search Results Display," users don't think of these as separate jobs—they think of "finding information" as one job. Keep them together.

### Don't Split Signal 3: Single Job-to-Be-Done with Multiple Capabilities

**Indicator:** The feature has 8-12 capabilities, but they all serve the same user goal.

More capabilities doesn't automatically mean you need multiple features. The schema supports 2-15 capabilities per feature.

**Example:** "Knowledge Graph Engine" (fd-002) has 5 capabilities:
1. Automated Graph Construction
2. Visual Graph Explorer
3. Natural Language Graph Query
4. Relationship Provenance
5. Semantic Relationship Inference

These all serve "understanding relationships between entities"—one job-to-be-done, properly scoped.

### Don't Split Signal 4: Over-Engineering for "Clean Architecture"

**Indicator:** You're splitting because "separation of concerns" or "microservices" or "modularity."

Feature Definitions are strategic artifacts, not technical architecture. Don't mirror your service boundaries—features should mirror user mental models.

---

## 7. Feature-to-KR Relationships

### How Features and KRs Interact

Features and Key Results (KRs) from the Roadmap Recipe have an N:M relationship:

- **One KR can advance multiple features** (e.g., "Ship authentication system" advances both "Security Architecture" and "User Management")
- **Multiple KRs can advance one feature** (e.g., "Document Management" might be advanced by KR-P-001 in Q1 and KR-P-007 in Q3)
- **KRs target capabilities, not features** (via `value_model_target` pointing to L3 sub-components)

### KR Scope vs Feature Scope

| KR Scope | Feature Scope | Relationship |
|----------|---------------|--------------|
| Narrow (1-2 capabilities) | Normal feature | Multiple KRs advance feature over time |
| Broad (cross-feature) | Multiple features | One KR advances several features |
| Platform/Infrastructure | Many features | Enabling KR unlocks multiple features |

### Tracking Feature Maturity via KRs

Use the `feature_maturity` section to track how KRs advance your feature:

```yaml
feature_maturity:
  overall_stage: "emerging"
  capability_maturity:
    - capability_id: "cap-001"
      stage: "proven"
      delivered_by_kr: "kr-p-003"  # ← This KR delivered this capability
      evidence: "Validated with 847 customers, 99.2% success rate"
    - capability_id: "cap-002"
      stage: "emerging"
      delivered_by_kr: "kr-p-005"
      evidence: "Beta testing with 12 pilot customers"
    - capability_id: "cap-003"
      stage: "hypothetical"
      evidence: "Design complete, awaiting implementation"
  last_advanced_by_kr: "kr-p-005"
  last_assessment_date: "2025-01-18"
```

### Granularity Implication

If a KR frequently spans 5+ features, your features might be too granular.

If a KR can only address 20% of a feature's capabilities, your feature might be too coarse.

**Sweet spot:** A typical KR advances 1-3 features, touching 2-5 capabilities total.

---

## 8. Anti-Patterns

### Anti-Pattern 1: The UI Component Feature

❌ **Bad:** "Upload Button", "Navigation Menu", "Settings Panel"

These are UI components, not features. Features are defined by **user outcomes**, not **interface elements**.

✅ **Good:** "Document Management" (which includes upload functionality)

### Anti-Pattern 2: The Technical Layer Feature

❌ **Bad:** "Database Layer", "API Gateway", "Caching System"

These are technical infrastructure. Features should be **user-facing capabilities**, not architecture components.

✅ **Good:** "High-Performance Search" (which is enabled by caching)

### Anti-Pattern 3: The Kitchen Sink Feature

❌ **Bad:** "Enterprise Platform" with 25 capabilities covering authentication, documents, search, reporting, collaboration, compliance, analytics...

This is a product, not a feature. No user thinks "I want to use the Enterprise Platform feature."

✅ **Good:** Split into 8-12 focused features, each with 2-8 capabilities

### Anti-Pattern 4: The One-Capability Feature

❌ **Bad:** "Export to PDF" as a standalone feature with one capability

This lacks sufficient scope to justify a full Feature Definition. It's likely a capability within a larger feature.

✅ **Good:** "Data Export & Integration" with capabilities for PDF, Excel, CSV, API export

### Anti-Pattern 5: The Duplicate-in-Disguise Feature

❌ **Bad:** "User Search" and "Document Search" as separate features when they share 80% of their implementation

If two features would have nearly identical capabilities with slight variations, consider whether they're really one feature with context-specific behavior.

✅ **Good:** "Semantic Search & Query Interface" handling search across all content types

### Anti-Pattern 6: The Future-Feature-Creep

❌ **Bad:** Including capabilities that won't be built for 18+ months alongside capabilities shipping next quarter

This conflates planning horizons and makes maturity tracking meaningless.

✅ **Good:** Define the current feature scope; create a new Feature Definition when future capabilities are ready for the roadmap

---

## 9. Examples from the EPF Corpus

### Well-Scoped Features

**fd-002: Knowledge Graph Engine**
- Job-to-be-done: Understand relationships between entities
- Capabilities: 5 (Graph Construction, Visual Explorer, NL Query, Provenance, Inference)
- Why it works: All capabilities serve relationship discovery; clear ownership; mature together

**fd-009: Team Collaboration & Communication**
- Job-to-be-done: Discuss work artifacts with context preservation
- Capabilities: 5 (Inline Comments, Threading, @Mentions, Resolution, Activity Feed)
- Why it works: All about contextual collaboration; 4 clear personas; cohesive scenarios

**fd-016: Security Architecture & Authentication**
- Job-to-be-done: Secure access to the platform
- Capabilities: Multiple security-related capabilities (SSO, RBAC, Audit, etc.)
- Why it works: Security is a coherent domain; one team owns it; matures together

### Granularity Lessons

| Feature | Capability Count | Why This Works |
|---------|------------------|----------------|
| fd-002 Knowledge Graph | 5 | Complex domain, all capabilities serve graph exploration |
| fd-007 Organization & Workspace | 6 | Multi-tenant context, all about workspace structure |
| fd-009 Collaboration | 5 | Communication domain, all about discussions |
| fd-016 Security | 7 | Security domain, all about access control |
| fd-017 Performance & Caching | 4 | Cross-cutting optimization, single technical concern |

---

## 10. Decision Flowchart

Use this flowchart when deciding feature boundaries:

```
START: You have functionality to define
           │
           ▼
┌──────────────────────────────────────┐
│ Can you describe it in one sentence  │
│ without "and" connecting unrelated   │
│ functions?                           │
└──────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
    YES          NO
     │           │
     ▼           ▼
┌─────────┐  ┌─────────────────────────┐
│ Good!   │  │ SPLIT: Each unrelated   │
│ Continue│  │ function → separate FD  │
└─────────┘  └─────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Would a user recognize this as       │
│ "one thing they can accomplish"?     │
└──────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
    YES          NO
     │           │
     ▼           ▼
┌─────────┐  ┌─────────────────────────┐
│ Good!   │  │ TOO GRANULAR: Combine   │
│ Continue│  │ with related feature    │
└─────────┘  └─────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Do you need more than 4 distinct     │
│ personas to cover use cases?         │
└──────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
    NO          YES
     │           │
     ▼           ▼
┌─────────┐  ┌─────────────────────────┐
│ Good!   │  │ SPLIT: Group personas   │
│ Continue│  │ into separate features  │
└─────────┘  └─────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Will all capabilities mature within  │
│ 1-2 stages of each other?            │
└──────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
    YES          NO
     │           │
     ▼           ▼
┌─────────┐  ┌─────────────────────────┐
│ Good!   │  │ CONSIDER SPLIT: Future  │
│ Continue│  │ caps → future feature   │
└─────────┘  └─────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Is capability count between 2-15?    │
└──────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
    YES          NO
     │           │
     ▼           ▼
┌─────────┐  ┌─────────────────────────┐
│ ✅ DONE │  │ <2: Combine features    │
│ Feature │  │ >15: Split by job       │
│ is well │  └─────────────────────────┘
│ scoped  │
└─────────┘
```

---

## 11. Related Documentation

| Document | Relevance to Granularity |
|----------|-------------------------|
| [FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md](FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md) | How to write FDs once scope is determined |
| [VALUE_MODEL_MATURITY_GUIDE.md](VALUE_MODEL_MATURITY_GUIDE.md) | How feature maturity connects to Value Model |
| [feature_definition_schema.json](../../schemas/feature_definition_schema.json) | Schema constraints (2-15 capabilities, 4 personas) |
| [feature_definition.wizard.md](../../wizards/feature_definition.wizard.md) | Step-by-step FD creation with granularity checkpoint |
| [roadmap_recipe_schema.json](../../schemas/roadmap_recipe_schema.json) | How KRs connect to features |

---

## Summary

**Feature Definition Granularity in 5 Rules:**

1. **One Sentence Test:** Describe without "and" connecting unrelated functions
2. **User Recognition:** Users should recognize it as "one thing"
3. **4-Persona Limit:** If you need more personas, split the feature
4. **Capability Range:** 2-15 capabilities per feature
5. **Maturity Alignment:** Capabilities should mature together

**When in Doubt:**
- Err toward slightly larger features (easier to split later than combine)
- Check the EPF corpus for similar scoping patterns
- Use the decision flowchart
- Validate with the 4-persona test

---

## Document Complete

This guide has covered:
✅ Core granularity principles  
✅ Right-sizing tests and metrics  
✅ When to split vs. keep together  
✅ Feature-to-KR relationships  
✅ Anti-patterns to avoid  
✅ Examples from EPF corpus  
✅ Decision flowchart  

**Next steps:**
1. Use the Right-Sizing Test on your proposed feature
2. Apply the Decision Flowchart
3. Validate with [FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md](FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md)

