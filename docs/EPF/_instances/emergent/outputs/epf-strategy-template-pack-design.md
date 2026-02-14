# EPF Strategy Template Pack Design

> **Design document for modeling EPF's relationship system in Emergent's knowledge graph**

## Overview

This template pack enables storing EPF strategic artifacts as graph entities, representing all EPF relationship types as graph relationships, and enabling semantic search and graph traversal across strategy content.

### Goals

1. **Full relationship fidelity** - Capture all EPF relationship types (contributes_to, requires, enables, delivers, etc.)
2. **Semantic search** - Find strategy content by meaning, not just keywords
3. **Graph traversal** - Navigate from any artifact to related context
4. **Bidirectional traceability** - Connect strategy to implementation and back

---

## Entity Types

### 1. NorthStar

The enduring vision, mission, and values that guide all strategy.

| Property  | Type     | Description                                |
| --------- | -------- | ------------------------------------------ |
| `epf_id`  | string   | Unique EPF identifier (e.g., `north_star`) |
| `vision`  | string   | The aspirational future state              |
| `mission` | string   | How we achieve the vision                  |
| `purpose` | string   | Why we exist                               |
| `values`  | string[] | Core principles that guide decisions       |
| `beliefs` | string[] | Fundamental assumptions about the world    |
| `version` | string   | Semantic version                           |

---

### 2. Persona

Target user archetype with detailed characteristics.

| Property                | Type     | Description                                  |
| ----------------------- | -------- | -------------------------------------------- |
| `epf_id`                | string   | Unique identifier (e.g., `research-analyst`) |
| `name`                  | string   | Display name                                 |
| `role`                  | string   | Job title/role                               |
| `description`           | string   | Brief description                            |
| `goals`                 | string[] | What they want to achieve                    |
| `pain_points`           | string[] | Current frustrations                         |
| `technical_proficiency` | string   | basic/intermediate/advanced/expert           |
| `current_situation`     | string   | Narrative of current state                   |
| `transformation_moment` | string   | The "aha" moment with our product            |
| `emotional_resolution`  | string   | How they feel after transformation           |

---

### 3. ValueModelTrack

L1: Top-level tracks (Product, Strategy, OrgOps, Commercial)

| Property         | Type   | Description                         |
| ---------------- | ------ | ----------------------------------- |
| `epf_id`         | string | Track identifier (e.g., `Product`)  |
| `name`           | string | Display name                        |
| `description`    | string | What value this track delivers      |
| `maturity_stage` | string | hypothetical/emerging/proven/scaled |
| `version`        | string | Semantic version                    |

---

### 4. ValueModelLayer

L2: Major thematic groupings within a track (5-10 per track)

| Property         | Type   | Description                                              |
| ---------------- | ------ | -------------------------------------------------------- |
| `epf_id`         | string | Layer identifier (e.g., `Product.CoreKnowledgePlatform`) |
| `name`           | string | Display name                                             |
| `description`    | string | Purpose and scope                                        |
| `maturity_stage` | string | hypothetical/emerging/proven/scaled                      |

---

### 5. ValueModelComponent

L3: Functional groupings of related capabilities (3-8 per layer)

| Property         | Type   | Description                                                                       |
| ---------------- | ------ | --------------------------------------------------------------------------------- |
| `epf_id`         | string | Component identifier (e.g., `Product.CoreKnowledgePlatform.DocumentIntelligence`) |
| `name`           | string | Display name                                                                      |
| `description`    | string | What this component does                                                          |
| `maturity_stage` | string | hypothetical/emerging/proven/scaled                                               |

---

### 6. ValueModelSubComponent

L4: Granular, shippable units of value (features, capabilities)

| Property             | Type    | Description                                                          |
| -------------------- | ------- | -------------------------------------------------------------------- |
| `epf_id`             | string  | Sub-component identifier                                             |
| `name`               | string  | Display name                                                         |
| `uvp`                | string  | Unique value proposition                                             |
| `active`             | boolean | Currently available?                                                 |
| `premium`            | boolean | Paid/gated capability?                                               |
| `maturity_stage`     | string  | hypothetical/emerging/proven/scaled                                  |
| `milestone_achieved` | string  | none/problem_approach_fit/value_recipient_fit/sustainable_domain_fit |

---

### 7. FeatureDefinition

Strategic capability target that guides iterative development.

| Property               | Type   | Description                         |
| ---------------------- | ------ | ----------------------------------- |
| `epf_id`               | string | Feature ID (e.g., `fd-001`)         |
| `name`                 | string | Feature name                        |
| `slug`                 | string | URL-friendly identifier             |
| `status`               | string | draft/ready/in-progress/delivered   |
| `job_to_be_done`       | string | What user need this solves          |
| `solution_approach`    | string | How we solve it                     |
| `overall_maturity`     | string | hypothetical/emerging/proven/scaled |
| `last_assessment_date` | date   | When maturity was last assessed     |

---

### 8. Capability

Discrete functional unit within a Feature Definition.

| Property         | Type   | Description                            |
| ---------------- | ------ | -------------------------------------- |
| `epf_id`         | string | Capability ID (e.g., `fd-001.cap-001`) |
| `name`           | string | Capability name                        |
| `description`    | string | What this capability does              |
| `maturity_stage` | string | hypothetical/emerging/proven/scaled    |
| `evidence`       | string | Evidence supporting maturity claim     |

---

### 9. OKR (Objective and Key Results)

Track-level objective for a roadmap cycle.

| Property    | Type   | Description                          |
| ----------- | ------ | ------------------------------------ |
| `epf_id`    | string | OKR ID (e.g., `okr-product-2025-q1`) |
| `track`     | string | product/strategy/org_ops/commercial  |
| `objective` | string | The outcome we want                  |
| `cycle`     | string | Time period (e.g., `2025-Q1`)        |
| `trl_stage` | string | Technology Readiness Level           |

---

### 10. KeyResult

Measurable outcome that advances capabilities.

| Property      | Type   | Description                           |
| ------------- | ------ | ------------------------------------- |
| `epf_id`      | string | KR ID (e.g., `kr-p-001`)              |
| `description` | string | What we will achieve                  |
| `metric`      | string | How we measure success                |
| `target`      | string | Target value                          |
| `status`      | string | planned/in-progress/completed/blocked |

---

### 11. Assumption

Testable hypothesis that underlies strategy.

| Property            | Type   | Description                            |
| ------------------- | ------ | -------------------------------------- |
| `epf_id`            | string | Assumption ID (e.g., `asm-p-001`)      |
| `statement`         | string | The assumption statement               |
| `track`             | string | Which track this belongs to            |
| `validation_status` | string | untested/testing/validated/invalidated |
| `evidence`          | string | Evidence for/against                   |
| `risk_if_wrong`     | string | Impact if assumption is false          |

---

### 12. StrategyFormula

Competitive positioning and business model.

| Property                | Type   | Description                 |
| ----------------------- | ------ | --------------------------- |
| `epf_id`                | string | Strategy formula identifier |
| `positioning_statement` | string | How we position in market   |
| `competitive_moat`      | string | Our sustainable advantage   |
| `business_model`        | string | How we create/capture value |
| `version`               | string | Semantic version            |

---

### 13. Insight

Research finding that informs strategy.

| Property       | Type     | Description                  |
| -------------- | -------- | ---------------------------- |
| `epf_id`       | string   | Insight identifier           |
| `title`        | string   | Brief insight title          |
| `finding`      | string   | What we learned              |
| `source`       | string   | Where this came from         |
| `confidence`   | string   | low/medium/high              |
| `implications` | string[] | What this means for strategy |

---

### 14. ImplementationReference

Link to code, specs, or other implementation artifacts.

| Property   | Type   | Description                           |
| ---------- | ------ | ------------------------------------- |
| `epf_id`   | string | Reference identifier                  |
| `title`    | string | Reference title                       |
| `url`      | string | URL to the artifact                   |
| `ref_type` | string | spec/issue/pr/code/documentation/test |
| `status`   | string | current/deprecated/superseded         |

---

## Relationship Types

### Strategic Hierarchy

| Relationship       | Source              | Target                 | Description                       |
| ------------------ | ------------------- | ---------------------- | --------------------------------- |
| `HAS_LAYER`        | ValueModelTrack     | ValueModelLayer        | Track contains layers             |
| `HAS_COMPONENT`    | ValueModelLayer     | ValueModelComponent    | Layer contains components         |
| `HAS_SUBCOMPONENT` | ValueModelComponent | ValueModelSubComponent | Component contains sub-components |

### Feature Relationships

| Relationship     | Source            | Target              | Description                         |
| ---------------- | ----------------- | ------------------- | ----------------------------------- |
| `CONTRIBUTES_TO` | FeatureDefinition | ValueModelComponent | Feature delivers value to component |
| `HAS_CAPABILITY` | FeatureDefinition | Capability          | Feature contains capabilities       |
| `REQUIRES`       | FeatureDefinition | FeatureDefinition   | Feature depends on another          |
| `ENABLES`        | FeatureDefinition | FeatureDefinition   | Feature unlocks another             |
| `SERVES_PERSONA` | FeatureDefinition | Persona             | Feature is for this persona         |

### Roadmap Relationships

| Relationship       | Source            | Target              | Description                   |
| ------------------ | ----------------- | ------------------- | ----------------------------- |
| `HAS_KEY_RESULT`   | OKR               | KeyResult           | OKR contains KRs              |
| `TARGETS`          | KeyResult         | ValueModelComponent | KR advances this value path   |
| `DELIVERS`         | KeyResult         | Capability          | KR implements this capability |
| `TESTS_ASSUMPTION` | FeatureDefinition | Assumption          | Feature validates assumption  |
| `LINKED_TO_KR`     | Assumption        | KeyResult           | Assumption is tested by KR    |

### Maturity Tracking

| Relationship   | Source            | Target    | Description                     |
| -------------- | ----------------- | --------- | ------------------------------- |
| `DELIVERED_BY` | Capability        | KeyResult | Capability was delivered by KR  |
| `ADVANCED_BY`  | FeatureDefinition | KeyResult | Feature maturity advanced by KR |

### Implementation Traceability

| Relationship     | Source                 | Target                  | Description                     |
| ---------------- | ---------------------- | ----------------------- | ------------------------------- |
| `IMPLEMENTED_BY` | Capability             | ImplementationReference | Capability is implemented here  |
| `REFERENCES`     | FeatureDefinition      | ImplementationReference | Feature has implementation refs |
| `MAPS_TO`        | ValueModelSubComponent | ImplementationReference | Sub-component implemented here  |

### Strategic Context

| Relationship       | Source          | Target          | Description                  |
| ------------------ | --------------- | --------------- | ---------------------------- |
| `INFORMED_BY`      | StrategyFormula | Insight         | Strategy informed by insight |
| `INFORMS`          | NorthStar       | StrategyFormula | Vision informs strategy      |
| `BELONGS_TO_TRACK` | OKR             | ValueModelTrack | OKR is for this track        |

---

## Example Queries

### 1. "What capabilities does this KR deliver?"

```
MATCH (kr:KeyResult {epf_id: 'kr-p-001'})-[:DELIVERS]->(cap:Capability)
RETURN cap.name, cap.maturity_stage
```

### 2. "What value model paths does this feature contribute to?"

```
MATCH (fd:FeatureDefinition {epf_id: 'fd-001'})-[:CONTRIBUTES_TO]->(comp:ValueModelComponent)
RETURN comp.epf_id, comp.name
```

### 3. "What features require this feature?"

```
MATCH (other:FeatureDefinition)-[:REQUIRES]->(fd:FeatureDefinition {epf_id: 'fd-001'})
RETURN other.name, other.status
```

### 4. "What's the strategic context for a feature?"

```
MATCH (fd:FeatureDefinition {epf_id: 'fd-001'})
OPTIONAL MATCH (fd)-[:CONTRIBUTES_TO]->(vm:ValueModelComponent)
OPTIONAL MATCH (fd)-[:SERVES_PERSONA]->(p:Persona)
OPTIONAL MATCH (fd)-[:REQUIRES]->(req:FeatureDefinition)
OPTIONAL MATCH (fd)-[:TESTS_ASSUMPTION]->(asm:Assumption)
RETURN fd, collect(DISTINCT vm), collect(DISTINCT p), collect(DISTINCT req), collect(DISTINCT asm)
```

### 5. "What's the coverage gap in the value model?"

```
MATCH (vm:ValueModelComponent)
WHERE NOT EXISTS { MATCH (fd:FeatureDefinition)-[:CONTRIBUTES_TO]->(vm) }
RETURN vm.epf_id, vm.name
```

### 6. "What assumptions need validation?"

```
MATCH (asm:Assumption {validation_status: 'untested'})
OPTIONAL MATCH (fd:FeatureDefinition)-[:TESTS_ASSUMPTION]->(asm)
RETURN asm.statement, asm.risk_if_wrong, collect(fd.name) as testing_features
```

---

## Sync Strategy

### EPF YAML → Emergent Graph

1. **Parse EPF YAML files** in READY/FIRE/AIM directories
2. **Create/update entities** for each artifact
3. **Create relationships** based on:
   - `contributes_to` → CONTRIBUTES_TO relationships
   - `dependencies.requires` → REQUIRES relationships
   - `dependencies.enables` → ENABLES relationships
   - `personas` → SERVES_PERSONA relationships
   - `assumptions_tested` → TESTS_ASSUMPTION relationships
   - Key Results → DELIVERS, TARGETS relationships
   - Value Model hierarchy → HAS_LAYER, HAS_COMPONENT, HAS_SUBCOMPONENT

### Emergent Graph → EPF YAML (Future)

Allow editing strategy in graph UI, export back to YAML for version control.

---

## Benefits

1. **Semantic Search**: Find "what features help enterprise customers" by meaning
2. **Impact Analysis**: "If we deprecate fd-001, what breaks?"
3. **Coverage Gaps**: Visually see which value model paths have no features
4. **Relationship Discovery**: "What else is related to this?" suggestions
5. **Strategic Queries**: Complex queries across the strategy corpus
6. **Visual Navigation**: Click through relationships in graph UI

---

## Implementation Notes

### Phase 1: Core Entity Types

- NorthStar, Persona, FeatureDefinition, Capability
- ValueModelTrack, ValueModelLayer, ValueModelComponent

### Phase 2: Roadmap Integration

- OKR, KeyResult, Assumption
- DELIVERS, TARGETS, TESTS_ASSUMPTION relationships

### Phase 3: Full Traceability

- ImplementationReference, ValueModelSubComponent
- IMPLEMENTED_BY, MAPS_TO relationships
- Sync from EPF YAML files

---

## Template Pack JSON Structure

```json
{
  "name": "EPF Strategy",
  "description": "Emergent Product Framework strategic planning artifacts",
  "version": "1.0.0",
  "entity_types": [
    {
      "name": "NorthStar",
      "description": "Vision, mission, and values",
      "properties": {
        "epf_id": { "type": "string", "required": true },
        "vision": { "type": "string", "required": true },
        "mission": { "type": "string" },
        "purpose": { "type": "string" },
        "values": { "type": "array" },
        "version": { "type": "string" }
      }
    }
    // ... other entity types
  ],
  "relationship_types": [
    {
      "name": "CONTRIBUTES_TO",
      "source_types": ["FeatureDefinition"],
      "target_types": ["ValueModelComponent", "ValueModelSubComponent"],
      "description": "Feature delivers value to this component"
    }
    // ... other relationship types
  ]
}
```

---

## Implementation Status

### Completed

#### Template Pack Installation

- **Pack ID**: `b962506a-0db7-4696-b371-bd3984f3feb5`
- **Assignment ID**: `88320376-7f93-4473-be46-9b8850a898c3`
- **Entity Types**: 13 created (NorthStar, Persona, ValueModelTrack, ValueModelLayer, ValueModelComponent, FeatureDefinition, Capability, OKR, KeyResult, Assumption, StrategyFormula, Insight, ImplementationReference)
- **Relationship Types**: 18 created (CONTRIBUTES_TO, REQUIRES, ENABLES, SERVES_PERSONA, HAS_CAPABILITY, DELIVERS, TARGETS, HAS_LAYER, HAS_COMPONENT, HAS_KEY_RESULT, BELONGS_TO_TRACK, TESTS_ASSUMPTION, IMPLEMENTED_BY, REFERENCES, DELIVERED_BY, ADVANCED_BY, INFORMED_BY, INFORMS)

#### Entity Creation (84 entities total)

| Entity Type         | Count | Status     |
| ------------------- | ----- | ---------- |
| NorthStar           | 1     | ✅ Created |
| StrategyFormula     | 1     | ✅ Created |
| Persona             | 4     | ✅ Created |
| ValueModelTrack     | 4     | ✅ Created |
| ValueModelLayer     | 21    | ✅ Created |
| ValueModelComponent | 21    | ✅ Created |
| OKR                 | 7     | ✅ Created |
| KeyResult           | 22    | ✅ Created |
| Assumption          | 9     | ✅ Created |

### Blocked - Relationship Creation

**Blocker**: Bug in Emergent MCP server relationship creation

**Error**: `database_error: Database operation failed (ERROR: column gr.embedding_updated_at does not exist (SQLSTATE 42703))`

**Analysis**:

- The `embedding_updated_at` column only exists on `kb.graph_objects` table
- It does NOT exist on `kb.graph_relationships` table
- The Emergent MCP server code appears to reference `gr.embedding_updated_at` incorrectly
- This is not in the application codebase - the error originates from the external MCP server

**Affected Operations**:

- `emergent_batch_create_relationships` - All calls fail
- `emergent_create_relationship` - Presumed to fail (same error pattern)

### Pending Relationships (not yet created)

| Relationship Type | Count | From            | To              |
| ----------------- | ----- | --------------- | --------------- |
| HAS_LAYER         | 21    | ValueModelTrack | ValueModelLayer |
| BELONGS_TO_TRACK  | 7     | OKR             | ValueModelTrack |
| HAS_KEY_RESULT    | 22    | OKR             | KeyResult       |
| INFORMS           | 1     | NorthStar       | StrategyFormula |
| TESTS_ASSUMPTION  | 15    | KeyResult       | Assumption      |

### Entity ID Reference

<details>
<summary>Click to expand entity IDs</summary>

**Core Entities**

```
NorthStar (ns-emergent-001): 079a7556-e36a-4921-86cd-55fd8ce0e7d4
StrategyFormula (strat-001): 5ad62f4c-8069-4660-9cde-0a0b385b5ae6
```

**Personas**

```
research-analyst: 7ea1b8e1-ca6b-4938-b4d6-2d3a372c0a57
knowledge-curator: 52550d8c-f7b3-49a8-9ea9-1c2163bf7ef9
ai-developer: ae07eb9b-32f2-422d-a5bb-889fcb8631c9
product-leader: b85b696d-1bd5-46c3-9bc0-23fa2975b24c
```

**ValueModelTracks**

```
track-product: 036363a3-7474-484b-bdbc-e89360bdf4a6
track-strategy: 0e866a5b-8795-4220-bfa8-08f5a1e0e4e9
track-orgops: 04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39
track-commercial: 8c39383f-d279-494b-b460-581635f60418
```

**OKRs**

```
okr-p-001: 568d15c7-d982-4ceb-8b53-8cdb8880c973
okr-p-002: 46b65c33-0df5-4018-afcc-721d21889ad3
okr-p-003: ee2331ee-e6a6-49aa-82ef-0756d47a0fcc
okr-p-004: 6d36b0b3-68a3-4a27-92aa-cecb59a7bbb0
okr-p-005: 77fbbbfc-4015-484d-a512-61fda499f97e
okr-s-001: 0360f6ff-60e3-43d5-baad-e509687c9b54
okr-o-001: 763098b7-ff40-4811-b7a4-14a5c0a78d92
```

**KeyResults**

```
kr-p-001: 6669bbee-d1e3-4520-9072-94ef00345f89
kr-p-002: cb5a5d2d-91ac-4000-8ad4-f465fb1d59a6
kr-p-003: ad303db4-7bbb-418e-a866-0c86be40c73e
kr-p-004: 4f9023b9-6d46-439e-af95-d7a9ab0e6aa3
kr-p-005: 73f7000e-8ff8-46a0-9c51-b0d00f811f9d
kr-p-006: f06161ba-1790-4890-b2d0-66c7ee3370e4
kr-p-007: 1389d26c-f0e2-4cbe-8b62-9894a66842b9
kr-p-008: 2837c9a9-ded4-4ab0-8e56-ec99edbb7e4e
kr-p-009: 9a125a16-4220-4497-9b00-a291cb7c1c8b
kr-p-010: ca91ce14-461d-4df3-9774-84a4fe6520b4
kr-p-011: 29871932-07c4-4fa5-8f57-fdc7cda6b6be
kr-p-012: b1ba3ad2-6833-4260-b425-056a8fc5ed09
kr-p-013: 81a729aa-aefb-4785-a0ba-11e4574dc5e6
kr-p-014: e17a961d-3f17-426f-b1bc-e1bb0712b26f
kr-p-015: 6264acf5-0274-400f-bd76-c02caf55c6f6
kr-p-016: 8b488df2-10b4-4126-8760-304638397eab
kr-s-001: 1f38fc71-ae72-4cc1-8eb4-7e023110feca
kr-s-002: b042d0bd-e2ee-4038-83b5-9a6ea7ac7627
kr-s-003: be6b4d87-9edc-4dc2-b434-eaefb3c565c7
kr-o-001: 3695787e-89e6-42cb-8667-12889c05340c
kr-o-002: 9c039573-706a-4fbd-9372-8dbb4dc64040
kr-o-003: 099270f7-8310-46e9-a69c-72377c5ad474
```

**Assumptions**

```
asm-p-001: e9daf1c3-ab97-4b1a-88ce-5afb91b8a55b
asm-p-002: f4a65139-1d8e-4a7a-ab68-2af2e222bfe8
asm-p-003: 8261a4dd-deb9-4ca5-8b31-ed4183f4ceab
asm-p-004: ea6d2059-538b-4a18-b3dd-d036112e52e3
asm-p-005: 555ed5ea-2614-49cf-91ea-70a15c533f9a
asm-s-001: 417a0cdb-97da-42a7-aacf-73f67718add3
asm-s-002: b34af782-1682-4747-9f55-67886d286962
asm-o-001: 2969341f-83d7-4e74-9ee3-83bd59bb3fb2
asm-o-002: 18f00d06-f409-4a21-b44b-79c1a55abfdc
```

**ValueModelLayers (21 total)**

```
Product Layers:
- layer-product-core-knowledge-platform: 9615cbb1-69a1-4d9c-a643-4a09d40dd8e1
- layer-product-local-tools: a444971b-5a1e-4bbd-8797-1de4d7f76769
- layer-product-workflow-engine: 8a3adee1-e114-41a3-a900-4714d57dcbcb
- layer-product-platform-services: ef487669-c316-4e5b-9baa-2d414d93ca47
- layer-product-web-interface: b11cc220-a587-4021-86b0-54525f810ce1
- layer-product-integration-tools: de3afb49-a617-45ab-9501-29321061bf5f

Strategy Layers:
- layer-strategy-context: 1a70dbe8-d750-41c2-9c65-74f4f4c84002
- layer-strategy-strategic-roadmap: 30b93f97-7f4f-47f3-9b44-8dec00c652f2
- layer-strategy-tactical-roadmap: 5e07878c-5b82-4a1d-a1ff-5303dcdb85a2
- layer-strategy-communications: 0af65011-e52c-409e-bddd-74c50359c44a

Commercial Layers:
- layer-commercial-bizdev: 0b89606e-0328-4a94-87c1-a49e8cd42772
- layer-commercial-financing: 59c6d435-a263-48b5-8b9b-54c746c9360e
- layer-commercial-sales-marketing: f449abfe-c638-40bb-845d-b21f50d9e5dd
- layer-commercial-brand: 0ddbed20-5b0a-4078-950e-2171accdfd5a

OrgOps Layers:
- layer-orgops-staffing: ec720fe4-adc3-4468-b00a-4a662c7211ca
- layer-orgops-talent-mgmt: 03baaa96-56b1-403b-ba35-984dd31856e6
- layer-orgops-culture: 5ce58329-4e38-48c2-b5a4-25b4fa6b18bc
- layer-orgops-financial-legal: a434c7e1-1b70-48ba-bf95-ecef6fb418f6
- layer-orgops-facilities-it: 366eac91-c6be-406a-ba09-72424f1b8b70
- layer-orgops-governance: 8df22dc9-6564-4713-b1d5-6ef695b9e933
- layer-orgops-operational-structure: 7152b1c8-5ff7-4550-bf30-deb566236da1
```

</details>

---

## Next Steps

1. [x] ~~Review this design with stakeholder~~ ✅
2. [ ] **Fix relationship creation bug** in Emergent MCP server
   - Issue: Query references `gr.embedding_updated_at` on graph_relationships table
   - This column only exists on graph_objects
   - Need to fix the SELECT query in the relationship creation code
3. [x] ~~Create template pack via MCP~~ ✅ Pack installed
4. [x] ~~Import Emergent EPF instance data~~ ✅ 84 entities created
5. [ ] **Create relationships** (blocked by #2)
6. [ ] Import Feature Definitions (13 files in FIRE/feature_definitions/)
7. [ ] Build sync utility for EPF YAML → Emergent

---

## Resumption Instructions

When the relationship bug is fixed, use these batches to create the pending relationships:

### Batch 1: HAS_LAYER (Track → Layer)

```json
[
  {
    "source_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "target_id": "9615cbb1-69a1-4d9c-a643-4a09d40dd8e1",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "target_id": "a444971b-5a1e-4bbd-8797-1de4d7f76769",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "target_id": "8a3adee1-e114-41a3-a900-4714d57dcbcb",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "target_id": "ef487669-c316-4e5b-9baa-2d414d93ca47",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "target_id": "b11cc220-a587-4021-86b0-54525f810ce1",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "target_id": "de3afb49-a617-45ab-9501-29321061bf5f",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "0e866a5b-8795-4220-bfa8-08f5a1e0e4e9",
    "target_id": "1a70dbe8-d750-41c2-9c65-74f4f4c84002",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "0e866a5b-8795-4220-bfa8-08f5a1e0e4e9",
    "target_id": "30b93f97-7f4f-47f3-9b44-8dec00c652f2",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "0e866a5b-8795-4220-bfa8-08f5a1e0e4e9",
    "target_id": "5e07878c-5b82-4a1d-a1ff-5303dcdb85a2",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "0e866a5b-8795-4220-bfa8-08f5a1e0e4e9",
    "target_id": "0af65011-e52c-409e-bddd-74c50359c44a",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "8c39383f-d279-494b-b460-581635f60418",
    "target_id": "0b89606e-0328-4a94-87c1-a49e8cd42772",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "8c39383f-d279-494b-b460-581635f60418",
    "target_id": "59c6d435-a263-48b5-8b9b-54c746c9360e",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "8c39383f-d279-494b-b460-581635f60418",
    "target_id": "f449abfe-c638-40bb-845d-b21f50d9e5dd",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "8c39383f-d279-494b-b460-581635f60418",
    "target_id": "0ddbed20-5b0a-4078-950e-2171accdfd5a",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39",
    "target_id": "ec720fe4-adc3-4468-b00a-4a662c7211ca",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39",
    "target_id": "03baaa96-56b1-403b-ba35-984dd31856e6",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39",
    "target_id": "5ce58329-4e38-48c2-b5a4-25b4fa6b18bc",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39",
    "target_id": "a434c7e1-1b70-48ba-bf95-ecef6fb418f6",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39",
    "target_id": "366eac91-c6be-406a-ba09-72424f1b8b70",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39",
    "target_id": "8df22dc9-6564-4713-b1d5-6ef695b9e933",
    "type": "HAS_LAYER"
  },
  {
    "source_id": "04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39",
    "target_id": "7152b1c8-5ff7-4550-bf30-deb566236da1",
    "type": "HAS_LAYER"
  }
]
```

### Batch 2: BELONGS_TO_TRACK (OKR → Track)

```json
[
  {
    "source_id": "568d15c7-d982-4ceb-8b53-8cdb8880c973",
    "target_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "type": "BELONGS_TO_TRACK"
  },
  {
    "source_id": "46b65c33-0df5-4018-afcc-721d21889ad3",
    "target_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "type": "BELONGS_TO_TRACK"
  },
  {
    "source_id": "ee2331ee-e6a6-49aa-82ef-0756d47a0fcc",
    "target_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "type": "BELONGS_TO_TRACK"
  },
  {
    "source_id": "6d36b0b3-68a3-4a27-92aa-cecb59a7bbb0",
    "target_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "type": "BELONGS_TO_TRACK"
  },
  {
    "source_id": "77fbbbfc-4015-484d-a512-61fda499f97e",
    "target_id": "036363a3-7474-484b-bdbc-e89360bdf4a6",
    "type": "BELONGS_TO_TRACK"
  },
  {
    "source_id": "0360f6ff-60e3-43d5-baad-e509687c9b54",
    "target_id": "0e866a5b-8795-4220-bfa8-08f5a1e0e4e9",
    "type": "BELONGS_TO_TRACK"
  },
  {
    "source_id": "763098b7-ff40-4811-b7a4-14a5c0a78d92",
    "target_id": "04e0e33e-c4dd-444e-b0fd-01fd0b3aeb39",
    "type": "BELONGS_TO_TRACK"
  }
]
```

### Batch 3: HAS_KEY_RESULT (OKR → KeyResult)

```json
[
  {
    "source_id": "568d15c7-d982-4ceb-8b53-8cdb8880c973",
    "target_id": "6669bbee-d1e3-4520-9072-94ef00345f89",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "568d15c7-d982-4ceb-8b53-8cdb8880c973",
    "target_id": "cb5a5d2d-91ac-4000-8ad4-f465fb1d59a6",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "568d15c7-d982-4ceb-8b53-8cdb8880c973",
    "target_id": "ad303db4-7bbb-418e-a866-0c86be40c73e",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "46b65c33-0df5-4018-afcc-721d21889ad3",
    "target_id": "4f9023b9-6d46-439e-af95-d7a9ab0e6aa3",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "46b65c33-0df5-4018-afcc-721d21889ad3",
    "target_id": "73f7000e-8ff8-46a0-9c51-b0d00f811f9d",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "ee2331ee-e6a6-49aa-82ef-0756d47a0fcc",
    "target_id": "f06161ba-1790-4890-b2d0-66c7ee3370e4",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "ee2331ee-e6a6-49aa-82ef-0756d47a0fcc",
    "target_id": "1389d26c-f0e2-4cbe-8b62-9894a66842b9",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "ee2331ee-e6a6-49aa-82ef-0756d47a0fcc",
    "target_id": "2837c9a9-ded4-4ab0-8e56-ec99edbb7e4e",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "ee2331ee-e6a6-49aa-82ef-0756d47a0fcc",
    "target_id": "9a125a16-4220-4497-9b00-a291cb7c1c8b",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "6d36b0b3-68a3-4a27-92aa-cecb59a7bbb0",
    "target_id": "ca91ce14-461d-4df3-9774-84a4fe6520b4",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "6d36b0b3-68a3-4a27-92aa-cecb59a7bbb0",
    "target_id": "29871932-07c4-4fa5-8f57-fdc7cda6b6be",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "6d36b0b3-68a3-4a27-92aa-cecb59a7bbb0",
    "target_id": "b1ba3ad2-6833-4260-b425-056a8fc5ed09",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "77fbbbfc-4015-484d-a512-61fda499f97e",
    "target_id": "81a729aa-aefb-4785-a0ba-11e4574dc5e6",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "77fbbbfc-4015-484d-a512-61fda499f97e",
    "target_id": "e17a961d-3f17-426f-b1bc-e1bb0712b26f",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "77fbbbfc-4015-484d-a512-61fda499f97e",
    "target_id": "6264acf5-0274-400f-bd76-c02caf55c6f6",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "77fbbbfc-4015-484d-a512-61fda499f97e",
    "target_id": "8b488df2-10b4-4126-8760-304638397eab",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "0360f6ff-60e3-43d5-baad-e509687c9b54",
    "target_id": "1f38fc71-ae72-4cc1-8eb4-7e023110feca",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "0360f6ff-60e3-43d5-baad-e509687c9b54",
    "target_id": "b042d0bd-e2ee-4038-83b5-9a6ea7ac7627",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "0360f6ff-60e3-43d5-baad-e509687c9b54",
    "target_id": "be6b4d87-9edc-4dc2-b434-eaefb3c565c7",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "763098b7-ff40-4811-b7a4-14a5c0a78d92",
    "target_id": "3695787e-89e6-42cb-8667-12889c05340c",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "763098b7-ff40-4811-b7a4-14a5c0a78d92",
    "target_id": "9c039573-706a-4fbd-9372-8dbb4dc64040",
    "type": "HAS_KEY_RESULT"
  },
  {
    "source_id": "763098b7-ff40-4811-b7a4-14a5c0a78d92",
    "target_id": "099270f7-8310-46e9-a69c-72377c5ad474",
    "type": "HAS_KEY_RESULT"
  }
]
```

### Batch 4: INFORMS (NorthStar → StrategyFormula)

```json
[
  {
    "source_id": "079a7556-e36a-4921-86cd-55fd8ce0e7d4",
    "target_id": "5ad62f4c-8069-4660-9cde-0a0b385b5ae6",
    "type": "INFORMS"
  }
]
```

### Batch 5: TESTS_ASSUMPTION (KeyResult → Assumption)

```json
[
  {
    "source_id": "6669bbee-d1e3-4520-9072-94ef00345f89",
    "target_id": "e9daf1c3-ab97-4b1a-88ce-5afb91b8a55b",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "ad303db4-7bbb-418e-a866-0c86be40c73e",
    "target_id": "e9daf1c3-ab97-4b1a-88ce-5afb91b8a55b",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "cb5a5d2d-91ac-4000-8ad4-f465fb1d59a6",
    "target_id": "f4a65139-1d8e-4a7a-ab68-2af2e222bfe8",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "f06161ba-1790-4890-b2d0-66c7ee3370e4",
    "target_id": "8261a4dd-deb9-4ca5-8b31-ed4183f4ceab",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "9a125a16-4220-4497-9b00-a291cb7c1c8b",
    "target_id": "8261a4dd-deb9-4ca5-8b31-ed4183f4ceab",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "f06161ba-1790-4890-b2d0-66c7ee3370e4",
    "target_id": "ea6d2059-538b-4a18-b3dd-d036112e52e3",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "1389d26c-f0e2-4cbe-8b62-9894a66842b9",
    "target_id": "ea6d2059-538b-4a18-b3dd-d036112e52e3",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "6264acf5-0274-400f-bd76-c02caf55c6f6",
    "target_id": "555ed5ea-2614-49cf-91ea-70a15c533f9a",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "1f38fc71-ae72-4cc1-8eb4-7e023110feca",
    "target_id": "417a0cdb-97da-42a7-aacf-73f67718add3",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "b042d0bd-e2ee-4038-83b5-9a6ea7ac7627",
    "target_id": "b34af782-1682-4747-9f55-67886d286962",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "3695787e-89e6-42cb-8667-12889c05340c",
    "target_id": "2969341f-83d7-4e74-9ee3-83bd59bb3fb2",
    "type": "TESTS_ASSUMPTION"
  },
  {
    "source_id": "9c039573-706a-4fbd-9372-8dbb4dc64040",
    "target_id": "18f00d06-f409-4a21-b44b-79c1a55abfdc",
    "type": "TESTS_ASSUMPTION"
  }
]
```
