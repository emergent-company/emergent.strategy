# AGENTS.md - EPF Instance Content Guidelines

> **For AI agents creating/editing EPF artifacts in this instance**

---

## 🎯 FOUNDATIONAL PRINCIPLE: Feature Definition Granularity

> **READ THIS FIRST** - Understanding FD granularity is essential before creating any feature definitions.

### The Core Insight

**Feature Definitions are NOT implementation checklists.** They are **strategic capability targets** that guide iterative development over multiple releases.

```
❌ WRONG Mental Model:
   FD = List of things to build in one sprint/release

✅ CORRECT Mental Model:
   FD = Stable capability category that KRs progressively deliver over time
```

### The Hierarchy

| Level  | Artifact           | Granularity                 | Stability               |
| ------ | ------------------ | --------------------------- | ----------------------- |
| **L1** | Value Model        | WHY (business outcomes)     | Very stable (years)     |
| **L2** | Feature Definition | WHAT capability category    | Stable (quarters/years) |
| **L3** | Key Results (KRs)  | HOW we advance capabilities | Changes each cycle      |
| **L4** | Implementation     | Technical details           | Changes frequently      |

**Key Relationship:**

- **FDs define the destination** (target capability state)
- **KRs are the stepping stones** (incremental progress toward FD capabilities)
- Multiple KRs over multiple cycles deliver a single FD to maturity

### The Right-Sizing Test

Before creating an FD, ask:

| Question                                                                          | If "No" → FD is Wrong Size         |
| --------------------------------------------------------------------------------- | ---------------------------------- |
| Would a user describe this as "one thing" they can accomplish?                    | Too granular or fragmented         |
| Can you describe it in one sentence without "and" connecting unrelated functions? | Too broad—should split             |
| Do all capabilities serve the same job-to-be-done?                                | Too broad—should split             |
| Will capabilities mature on similar timelines?                                    | Misaligned—consider splitting      |
| Does it have 2-15 capabilities?                                                   | <2 = too granular, >15 = too broad |

### Example: Right vs Wrong Granularity

**❌ WRONG (Too Granular):**

```yaml
# These should NOT be separate FDs:
- fd-001: Upload Button Component
- fd-002: File Type Validation
- fd-003: Progress Indicator
- fd-004: Error Message Display
```

_Problem: These are implementation details, not user-recognizable capabilities._

**✅ CORRECT (Right Level):**

```yaml
# This is ONE FD with multiple capabilities:
- fd-001: Document Management & Processing
  capabilities:
    - cap-001: Document Upload (drag-drop, multi-file)
    - cap-002: Format Validation (PDF, Word, images)
    - cap-003: Processing Pipeline (OCR, extraction)
    - cap-004: Version Control (history, rollback)
    - cap-005: Search & Discovery (full-text, metadata)
```

_The FD is a stable capability category; capabilities are delivered incrementally via KRs._

**❌ WRONG (Too Broad):**

```yaml
# This should be MULTIPLE FDs:
- fd-001: Complete Platform
  capabilities:
    - cap-001: Document Management
    - cap-002: User Authentication
    - cap-003: Team Collaboration
    - cap-004: Reporting & Analytics
    - cap-005: API Platform
    - cap-006: Admin Console
    ... (20+ capabilities covering unrelated jobs)
```

_Problem: These serve different jobs-to-be-done and will mature at different rates._

### How KRs Relate to FDs

```yaml
# In roadmap_recipe.yaml:
key_results:
  - id: kr-p-001
    description: 'Deliver basic document upload with PDF support'
    target_capabilities:
      - fd-001.cap-001 # Partial delivery of Document Upload
      - fd-001.cap-002 # Partial delivery of Format Validation

  - id: kr-p-002 # Next cycle
    description: 'Add OCR processing and full-text search'
    target_capabilities:
      - fd-001.cap-003 # Partial delivery of Processing Pipeline
      - fd-001.cap-005 # Partial delivery of Search
```

**The pattern:**

1. FD defines the full capability vision (all 5 capabilities)
2. KR-001 delivers cap-001 and cap-002 partially (MVP)
3. KR-002 delivers cap-003 and cap-005 partially
4. KR-003 enhances cap-001/002 to "proven" maturity
5. Eventually all capabilities reach "scaled" maturity

### When to Create a NEW FD vs Add to Existing

| Situation                                         | Action                               |
| ------------------------------------------------- | ------------------------------------ |
| New capability fits existing FD's job-to-be-done  | Add capability to existing FD        |
| Capability serves a different user job            | Create new FD                        |
| Existing FD has >15 capabilities                  | Consider splitting by job-to-be-done |
| Capability will mature on very different timeline | Consider separate FD                 |

### Reference

For comprehensive guidance, see:

- `canonical-epf/docs/guides/FEATURE_DEFINITION_GRANULARITY_GUIDE.md`
- `canonical-epf/wizards/feature_definition.wizard.md`

---

## 🚨 MANDATORY: Pre-Flight Checklist

Before creating or editing ANY EPF artifact (feature definitions, roadmaps, etc.), you MUST:

### 1. Check Schema Constraints

```bash
# Get schema for your artifact type
epf-cli schemas show feature_definition

# Or via MCP:
epf_get_schema { "artifact_type": "feature_definition" }
```

### 2. Validate After Writing

```bash
# Validate your changes
epf-cli validate path/to/your/file.yaml

# Or run full health check
epf-cli health docs/EPF/_instances/emergent
```

---

## Quick Reference: Common Enum Values

These cause the most validation errors. **Memorize or reference before writing.**

### Feature Definition (`fd-*.yaml`)

| Field                            | Valid Values                                                  |
| -------------------------------- | ------------------------------------------------------------- |
| `status`                         | `draft`, `ready`, `in-progress`, `delivered`                  |
| `context.type`                   | `ui`, `email`, `notification`, `api`, `report`, `integration` |
| `technical_proficiency`          | `basic`, `intermediate`, `advanced`, `expert`                 |
| `tracks[]`                       | `product`, `strategy`, `org_ops`, `commercial`                |
| `feature_maturity.overall_stage` | `hypothetical`, `emerging`, `proven`, `scaled`                |

### ID Patterns

| Field         | Pattern                     | Example                  |
| ------------- | --------------------------- | ------------------------ |
| Feature ID    | `^fd-[0-9]+$`               | `fd-001`, `fd-013`       |
| Capability ID | `^cap-[0-9]+$`              | `cap-001`, `cap-065`     |
| Context ID    | `^ctx-[0-9]+$`              | `ctx-001`, `ctx-033`     |
| Scenario ID   | `^scn-[0-9]+$`              | `scn-001`, `scn-044`     |
| Assumption ID | `^asm-(p\|s\|o\|c)-[0-9]+$` | `asm-p-001`, `asm-c-023` |
| KR ID         | `^kr-[psoc]-[0-9]+$`        | `kr-p-001`, `kr-s-002`   |

### Strategic Context Paths

```yaml
contributes_to:
  # Pattern: ^(Product|Commercial|Strategy|OrgOps)\.[A-Za-z]+\.[A-Za-z]+
  - 'Product.Core.Search' # ✅ Correct
  - 'Commercial.Acquire.Discovery' # ✅ Correct
  - 'Core.Search' # ❌ Missing L1 prefix
```

---

## Constraints That Trip Up AI Agents

| Constraint          | Limit          | Notes                                                                |
| ------------------- | -------------- | -------------------------------------------------------------------- |
| Personas            | **Exactly 4**  | `minItems: 4, maxItems: 4`                                           |
| Persona narratives  | **200+ chars** | `current_situation`, `transformation_moment`, `emotional_resolution` |
| Context description | **30+ chars**  | `minLength: 30`                                                      |
| Capabilities        | **At least 1** | `minItems: 1`                                                        |

---

## Common Mistakes

| ❌ Wrong                | ✅ Correct              | Why                                |
| ----------------------- | ----------------------- | ---------------------------------- |
| `status: 'development'` | `status: 'in-progress'` | Invalid enum                       |
| `status: 'active'`      | `status: 'delivered'`   | Invalid enum                       |
| `type: 'tui'`           | `type: 'ui'`            | Use 'ui' for all visual interfaces |
| `type: 'web'`           | `type: 'ui'`            | Use 'ui' for browser interfaces    |
| `type: 'cli'`           | `type: 'api'`           | CLI is API interaction             |
| 5 personas              | 4 personas              | Schema max is 4                    |
| 3 personas              | 4 personas              | Schema min is 4                    |

---

## This Instance Structure

```
docs/EPF/_instances/emergent/
├── READY/                    # Strategy phase
│   ├── 00_north_star.yaml
│   ├── 01_insight_analyses.yaml
│   ├── 02_strategy_foundations.yaml
│   ├── 03_insight_opportunity.yaml
│   ├── 04_strategy_formula.yaml
│   └── 05_roadmap_recipe.yaml
├── FIRE/                     # Execution phase
│   ├── feature_definitions/  # fd-*.yaml files go here
│   ├── value_models/
│   └── workflows/
├── AIM/                      # Assessment phase
├── product_portfolio.yaml
└── _meta.yaml
```

---

## Validation Commands

```bash
# Validate single file
epf-cli validate FIRE/feature_definitions/fd-013.yaml

# Full health check (recommended after changes)
# NOTE: Health check now includes 9 checks:
#   1. Instance Structure
#   2. Schema Validation
#   3. Feature Quality
#   4. Cross-References
#   5. Relationships (contributes_to paths, KR targets, coverage)
#   6. Content Readiness
#   7. Field Coverage
#   8. Version Alignment
#   9. Migration Status
epf-cli health docs/EPF/_instances/emergent

# Check feature quality specifically
epf-cli health docs/EPF/_instances/emergent --verbose 2>&1 | grep -A 20 "Feature Quality"
```

**The health check now validates relationships automatically**, so you don't need to run `epf-cli relationships validate` separately for basic checks. The relationships check verifies:

- All `contributes_to` paths point to valid value model components
- All KR `value_model_target` paths are valid
- Coverage of value model by features
- Identifies orphan features (no `contributes_to`) and strategic gaps

For detailed relationship analysis, use:

```bash
# Detailed relationship validation with suggestions
epf-cli relationships validate --verbose

# Coverage analysis
epf-cli relationships coverage
```

---

## MCP Tools for Content Work

| Task              | Tool                        | Parameters                    |
| ----------------- | --------------------------- | ----------------------------- |
| Get schema        | `epf_get_schema`            | `artifact_type`               |
| Get template      | `epf_get_template`          | `artifact_type`               |
| Validate file     | `epf_validate_file`         | `path`                        |
| Health check      | `epf_health_check`          | `instance_path`               |
| Feature quality   | `epf_check_feature_quality` | `instance_path`               |
| Strategic context | `epf_get_strategic_context` | `feature_id`, `instance_path` |

---

## Workflow: Creating a New Feature Definition

1. **Get the template**: `epf_get_template { "artifact_type": "feature_definition" }`
2. **Get the schema**: `epf_get_schema { "artifact_type": "feature_definition" }` (check constraints)
3. **Write the artifact** using valid enum values and patterns
4. **Validate**: `epf_validate_file { "path": "..." }`
5. **Health check**: `epf_health_check { "instance_path": "docs/EPF/_instances/emergent" }`

**If validation fails**: Read the error message, fix the constraint violation, re-validate.

---

## 🔗 CRITICAL: EPF Relationship Maintenance

> **AI agents MUST proactively maintain EPF relationships** - this is a key value driver of the framework.

EPF's power comes from **bidirectional traceability** between strategy and implementation. Relationships that become stale or broken undermine the entire framework's value.

### The EPF Relationship Web

```
    NORTH STAR (Vision)
          │
          ▼
    VALUE MODEL (L1→L2→L3)
          │
    ┌─────┼─────┐
    ▼     ▼     ▼
   FDs   KRs  Tracks
    │     │     │
    └──┬──┘     │
       │        │
       ▼        │
  Capabilities ◄┘
       │
       ▼
  Implementation
  (code, specs, docs)
```

### Relationship Types to Maintain

| Relationship           | Location                              | AI Agent Responsibility                       |
| ---------------------- | ------------------------------------- | --------------------------------------------- |
| **FD → Value Model**   | `contributes_to`                      | Validate paths exist; add when creating FDs   |
| **FD → FD**            | `dependencies.requires/enables`       | Update when features become interdependent    |
| **FD → Assumptions**   | `assumptions_tested`                  | Link FDs to roadmap assumptions they validate |
| **KR → Value Model**   | `target` in roadmap                   | Ensure KRs target valid value model paths     |
| **KR → Capabilities**  | `delivers` in roadmap                 | Track which capabilities each KR advances     |
| **Capability → KR**    | `delivered_by_kr` in feature_maturity | Update when KR completes                      |
| **FD → Code**          | `implementation_references`           | Add references when implementing              |
| **Value Model → Code** | `mappings.yaml`                       | Maintain mappings for traceability            |

### When to Update Relationships

**ALWAYS update relationships when:**

| Trigger Event           | Relationship Updates Required                                         |
| ----------------------- | --------------------------------------------------------------------- |
| Creating new FD         | Set `contributes_to`, `dependencies`, `assumptions_tested`            |
| Implementing capability | Add to `implementation_references`, update `feature_maturity`         |
| Completing a KR         | Update `capability_maturity[].delivered_by_kr`, `last_advanced_by_kr` |
| Adding new code         | Update `mappings.yaml` if code serves a value model path              |
| Refactoring code        | Check if `mappings.yaml` URLs need updating                           |
| Changing FD scope       | Verify `dependencies` still accurate                                  |
| Changing Value Model    | Run `epf_validate_relationships` to find broken references            |

### Relationship Validation Commands

```bash
# Validate all relationships (contributes_to, dependencies, etc.)
epf-cli relationships validate docs/EPF/_instances/emergent

# Check coverage - find value model paths with no features
epf-cli coverage docs/EPF/_instances/emergent

# Get strategic context for a feature (shows all relationships)
epf-cli context fd-001

# Via MCP:
epf_validate_relationships { "instance_path": "docs/EPF/_instances/emergent" }
epf_analyze_coverage { "instance_path": "docs/EPF/_instances/emergent" }
epf_get_strategic_context { "feature_id": "fd-001", "instance_path": "docs/EPF/_instances/emergent" }
```

### Internal EPF Relationships (Strategy ↔ Strategy)

#### 1. Feature Definition → Value Model

```yaml
# In fd-*.yaml
strategic_context:
  contributes_to:
    - 'Product.Core.KnowledgeGraph' # Must exist in value_model.yaml
    - 'Product.Discovery.SemanticSearch' # Multiple paths OK
```

**Validation:** `epf_validate_relationships` checks these paths exist.

**AI Agent Rule:** NEVER create an FD without `contributes_to`. If unsure which path, use `epf_explain_value_path` to explore.

#### 2. Feature Definition → Feature Definition

```yaml
# In fd-*.yaml
dependencies:
  requires:
    - id: 'fd-001'
      name: 'Knowledge Graph Engine'
      reason: 'Semantic search indexes graph data structures' # 30+ chars
  enables:
    - id: 'fd-008'
      name: 'AI Chat Interface'
      reason: 'Chat uses search for retrieval-augmented generation'
```

**AI Agent Rule:** When creating FD that uses another FD's capabilities, add `requires`. When creating FD that others will build on, add `enables`.

#### 3. Key Results → Capabilities

```yaml
# In roadmap_recipe.yaml
key_results:
  - id: kr-p-001
    description: 'Deliver entity extraction for documents'
    target: 'Product.Core.EntityExtraction' # Value model path
    delivers: # Which FD capabilities
      - feature_id: fd-001
        capabilities: [cap-001, cap-002]
        advancement: 'hypothetical→emerging'
```

**AI Agent Rule:** KRs should target specific capabilities, not entire FDs.

#### 4. Capability Maturity Tracking

```yaml
# In fd-*.yaml
feature_maturity:
  overall_stage: emerging
  capability_maturity:
    - capability_id: cap-001
      stage: proven
      delivered_by_kr: kr-p-001 # Which KR delivered this
      evidence: 'Deployed to production, 150 DAU'
    - capability_id: cap-002
      stage: emerging
      delivered_by_kr: kr-p-002
  last_advanced_by_kr: kr-p-002
  last_assessment_date: '2025-02-04'
```

**AI Agent Rule:** After completing work on a capability, update its maturity stage and `delivered_by_kr`.

### External References (Strategy ↔ Implementation)

#### 5. Feature → Implementation Specs

```yaml
# In fd-*.yaml (implementation_references field)
implementation:
  implementation_references:
    tool_name: 'openspec' # or linear, cursor-composer, etc.
    specs:
      - id: 'SPEC-001'
        path: 'openspec/features/knowledge-graph/entity-extraction.md'
        capability_coverage: [cap-001, cap-002]
        scenario_coverage: [scn-001, scn-002]
        status: 'implemented' # planned, in-progress, implemented, tested
      - id: 'LIN-1234'
        url: 'https://linear.app/emergent/issue/LIN-1234'
        capability_coverage: [cap-003]
        status: 'in-progress'
    last_sync: '2025-02-04T10:30:00Z'
    coverage_summary:
      capabilities_covered: 3
      capabilities_total: 5
```

**AI Agent Rule:** When implementing a capability, add an entry to `implementation_references`.

#### 6. Value Model → Codebase (mappings.yaml)

```yaml
# In FIRE/mappings.yaml
product:
  - sub_component_id: 'Product.Core.KnowledgeGraph'
    artifacts:
      - type: code
        url: 'https://github.com/org/repo/tree/main/apps/server/src/modules/graph'
        description: 'NestJS graph module with entity and relationship services'
      - type: test
        url: 'https://github.com/org/repo/tree/main/apps/server/tests/graph'
        description: 'Integration tests for graph operations'
      - type: documentation
        url: 'https://github.com/org/repo/blob/main/docs/architecture/knowledge-graph.md'
        description: 'Architecture decision record for graph design'
```

**AI Agent Rule:** When adding significant code that serves a value model path, add mapping entry.

### Relationship Maintenance Checklist

Use this checklist after completing work:

```markdown
## Post-Work Relationship Checklist

### If you created/modified a Feature Definition:

- [ ] `contributes_to` paths are valid (run epf_validate_relationships)
- [ ] `dependencies.requires` lists FDs this feature needs
- [ ] `dependencies.enables` lists FDs that will need this feature
- [ ] `assumptions_tested` links to relevant roadmap assumptions

### If you implemented code for a capability:

- [ ] Added entry to `implementation_references.specs`
- [ ] Updated `feature_maturity.capability_maturity[].stage`
- [ ] Set `delivered_by_kr` if completing a KR
- [ ] Updated `mappings.yaml` if new code location

### If you completed a Key Result:

- [ ] Updated capability maturity for affected features
- [ ] Set `last_advanced_by_kr` on affected features
- [ ] Updated `last_assessment_date`
- [ ] Verified KR's `delivers` field matches actual work

### If you modified the Value Model:

- [ ] Run `epf_validate_relationships` to find broken references
- [ ] Update affected FDs' `contributes_to` paths
- [ ] Update `mappings.yaml` if paths changed
```

### Relationship Maintenance MCP Tools (v0.10.0)

These MCP tools enable AI agents to maintain relationships programmatically:

| Tool                               | Purpose                            | Example Use                            |
| ---------------------------------- | ---------------------------------- | -------------------------------------- |
| `epf_add_implementation_reference` | Link FD to spec/PR/code            | After merging PR #123, link to fd-012  |
| `epf_update_capability_maturity`   | Update capability stage            | Advance cap-003 from emerging → proven |
| `epf_add_mapping_artifact`         | Add to mappings.yaml               | Register new code module path          |
| `epf_suggest_relationships`        | AI-assisted relationship discovery | Analyze a PR to find related features  |

**Typical workflow after implementing code:**

```
1. Merge PR implementing feature capability
2. Call epf_suggest_relationships to analyze what was changed
3. Call epf_add_implementation_reference to link PR to feature
4. Call epf_update_capability_maturity if maturity changed
5. Call epf_add_mapping_artifact for new code paths
```

**Example MCP calls:**

```json
// Link PR to feature
epf_add_implementation_reference {
  "feature_id": "fd-012",
  "instance_path": "docs/EPF/_instances/emergent",
  "ref_type": "pr",
  "title": "Add entity extraction pipeline",
  "url": "https://github.com/org/repo/pull/123"
}

// Update capability maturity
epf_update_capability_maturity {
  "feature_id": "fd-012",
  "instance_path": "docs/EPF/_instances/emergent",
  "capability_id": "cap-003",
  "maturity": "proven",
  "evidence": "Deployed to production, 150 DAU, <200ms response time",
  "delivered_by_kr": "kr-p-005"
}

// Add code mapping
epf_add_mapping_artifact {
  "instance_path": "docs/EPF/_instances/emergent",
  "sub_component_id": "Product.Core.EntityExtraction",
  "artifact_type": "code",
  "url": "https://github.com/org/repo/tree/main/apps/server/src/modules/extraction",
  "description": "Entity extraction NestJS module"
}
```

---

### Detecting Relationship Drift

Run these checks periodically:

```bash
# Find broken relationships
epf-cli relationships validate docs/EPF/_instances/emergent

# Find value model paths with no features
epf-cli coverage docs/EPF/_instances/emergent

# Find features with no implementation references (if far along)
# (Manual check - look for delivered features without implementation_references)
```

**Signs of relationship drift:**

- FD marked "delivered" but no `implementation_references`
- KR completed but no `capability_maturity` updates
- Code exists but not in `mappings.yaml`
- `last_assessment_date` > 90 days old

---

## 🔗 The EPF Artifact Relationship Model

Understanding how Value Models, Feature Definitions, and Key Results work together is essential for creating coherent EPF content.

### The Triangle Relationship

```
                    VALUE MODEL
                   (WHY: Outcomes)
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼                       ▼
    FEATURE DEFINITIONS      ROADMAP RECIPE
    (WHAT: Capabilities)     (WHEN: Execution)
            │                       │
            └───────────┬───────────┘
                        │
                   KEY RESULTS
              (HOW: Incremental delivery)
```

### How They Connect

| Artifact            | Points To            | Meaning                                            |
| ------------------- | -------------------- | -------------------------------------------------- |
| FD.contributes_to   | Value Model paths    | "This capability delivers value to these outcomes" |
| FD.capabilities     | Implementation units | "These are the discrete things this feature does"  |
| KR.target           | Value Model paths    | "This work advances these business outcomes"       |
| KR.delivers         | FD capabilities      | "This work implements these specific capabilities" |
| FD.feature_maturity | Capability stages    | "Current delivery state per capability"            |

### Practical Implications

**When creating a Feature Definition:**

1. First identify which Value Model path(s) it serves
2. Define capabilities that collectively deliver value to those paths
3. Don't worry about implementation order—that's for KRs

**When creating Key Results:**

1. KRs should target specific FD capabilities (not whole FDs)
2. A single KR typically advances 1-3 capabilities partially
3. Multiple KRs over time bring capabilities from "hypothetical" → "scaled"

**When updating feature_maturity:**

1. Update capability maturity as KRs complete
2. overall_stage = minimum maturity across core capabilities
3. Use delivered_by_kr to track which KR advanced each capability

### Anti-Patterns to Avoid

| Anti-Pattern                | Problem                                          | Solution                                          |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| FD = Sprint backlog         | FDs change every cycle, lose strategic stability | FDs are stable targets; KRs are the changing work |
| KR = "Deliver FD-001"       | Too coarse; can't track incremental progress     | KR targets specific capabilities within FD        |
| FD without Value Model link | Orphaned capability with unclear purpose         | Always set contributes_to paths                   |
| One KR delivers entire FD   | FDs should take multiple cycles to mature        | Split into capability-targeted KRs                |

### Example: Complete Flow

```yaml
# value_model.yaml (L1 - stable)
Product.Core.DocumentManagement:
  description: 'Enable users to manage documents effectively'
  maturity: emerging

# feature_definition fd-001.yaml (L2 - stable target)
id: fd-001
name: Document Management & Processing
contributes_to:
  - Product.Core.DocumentManagement
capabilities:
  - id: cap-001
    name: Document Upload
  - id: cap-002
    name: Processing Pipeline
  - id: cap-003
    name: Search & Discovery
feature_maturity:
  overall_stage: emerging
  capability_maturity:
    - capability_id: cap-001
      stage: proven
      delivered_by_kr: kr-p-001
    - capability_id: cap-002
      stage: emerging
      delivered_by_kr: kr-p-002
    - capability_id: cap-003
      stage: hypothetical

# roadmap_recipe.yaml (L3 - changes each cycle)
key_results:
  - id: kr-p-001 # Completed
    description: 'Basic upload with drag-drop'
    delivers:
      - fd-001.cap-001

  - id: kr-p-002 # In progress
    description: 'OCR processing pipeline'
    delivers:
      - fd-001.cap-002

  - id: kr-p-003 # Planned
    description: 'Full-text search integration'
    delivers:
      - fd-001.cap-003
```

**Reading this example:**

- FD-001 is 33% delivered (1 of 3 capabilities at "proven")
- KR-001 has completed, advancing cap-001 to proven
- KR-002 is advancing cap-002 toward proven
- KR-003 will start cap-003's journey from hypothetical
- The FD remains stable; only maturity tracking changes
