# Feature Definition Creation Wizard

**Schema Version:** 2.0.0  
**Purpose:** Step-by-step guidance for creating EPF-compliant feature definitions that avoid common mistakes

---

## Pre-Creation Checklist

Before starting, ensure you have:

- [ ] Identified **exactly 4 distinct personas** with character names and specific metrics
- [ ] Prepared 3-paragraph narratives for each persona (200+ chars per paragraph)
- [ ] Identified scenarios at **top-level** (not embedded in contexts)
- [ ] Prepared dependency explanations with **WHY they exist** (30+ chars)
- [ ] Reviewed existing feature definitions for patterns and consistency
- [ ] Avoided technical implementation details (focus on WHY/HOW/WHAT)

---

## Common Mistakes to Avoid

### ❌ WRONG: Generic, Brief Narratives
```yaml
value_propositions:
  - persona: "User"
    current_pain: "Things are hard"
    value_delivered: "We make it easier"
```

### ✅ CORRECT: Rich, Specific Narratives
```yaml
value_propositions:
  - persona: "Sarah Martinez, Compliance Officer at TechFlow Inc."
    current_situation: "Sarah spends 15-20 hours per quarter manually tracking document compliance across 47 active projects. She maintains spreadsheets correlating each document to regulatory requirements, performs spot-checks on file metadata, and coordinates with 12 project managers to ensure completeness. Her process involves downloading documents, checking properties, cross-referencing with compliance matrices, and sending follow-up emails when gaps are found."
    transformation_moment: "With automated compliance tracking, Sarah reviews a real-time dashboard showing document coverage across all projects. The system flags missing documents, expiring certifications, and metadata inconsistencies automatically. When she spots a compliance gap, she clicks to see which projects are affected and sends targeted notifications. What took 15-20 hours now takes 2-3 hours of strategic review, and she catches issues weeks earlier."
    emotional_resolution: "Sarah feels confident presenting compliance status to auditors because the system provides audit-ready reports. She's shifted from reactive firefighting to proactive compliance management. Her relationship with project managers has improved because she provides early warnings instead of last-minute urgencies. She's become a strategic partner in project planning rather than just a gatekeeper."
```

### ❌ WRONG: Scenarios Embedded in Contexts
```yaml
contexts:
  - id: ctx-001
    name: "Dashboard View"
    scenarios:  # ← WRONG PLACEMENT
      - actor: "User"
        action: "Upload document"
```

### ✅ CORRECT: Scenarios at Top Level
```yaml
scenarios:  # ← TOP LEVEL
  - id: scn-001
    name: "Upload and Process Compliance Document"
    actor: "Sarah Martinez, Compliance Officer"
    context: "Sarah is at her desk reviewing project compliance status in the dashboard"
    trigger: "Sarah notices Project Alpha is missing a required ISO 27001 certificate"
    action: "Sarah clicks 'Upload Document', selects the certificate PDF from her Downloads folder, and assigns it to Project Alpha with compliance tags"
    outcome: "System processes the document, extracts metadata, validates against compliance requirements, and updates the dashboard showing Project Alpha's compliance status improved from 89% to 94%"
    acceptance_criteria:
      - "Document uploads successfully without errors"
      - "System extracts metadata automatically (document type, date, expiry)"
      - "Compliance status updates in real-time on dashboard"
```

---

## Quick Reference Resources

**BEFORE starting feature definition creation:**

- [ ] **Read schema requirements**: [`schemas/feature_definition_schema.json`](../schemas/feature_definition_schema.json) (861 lines, v2.0.0)
- [ ] **Copy template**: [`definitions/product/_template/feature_definition_template.yaml`](../definitions/product/_template/feature_definition_template.yaml)
- [ ] **Review examples**: [`definitions/product/`](../definitions/product/) directory (21 validated examples demonstrating quality patterns)

**WHILE creating your feature definition:**

- Keep this wizard open for guidance on avoiding common mistakes
- Reference schema for structure requirements and validation rules
- Check examples for pattern inspiration (persona narratives, scenario structure, dependency explanations)

**AFTER creating your feature definition:**

- **Validate**: `./scripts/validate-feature-quality.sh {your-file}.yaml`
- Fix any errors reported by validation script
- Re-validate until you achieve **0 errors**
- **Commit only after passing validation** (0 errors required)

**Why YAML format?** Feature definitions use structured YAML because:
- Complex nested data (personas, scenarios, dependencies) requires structure
- JSON Schema validation ensures quality and consistency  
- Automated validation with `yq` and `ajv-cli` tools
- Easy consumption by implementation tools (parseable by any YAML parser)

---

### ❌ WRONG: Simple String Dependencies
```yaml
dependencies:
  requires:
    - fd-001
    - fd-002
```

### ✅ CORRECT: Rich Dependency Objects
```yaml
dependencies:
  requires:
    - id: fd-001
      name: "Knowledge Graph Engine"
      reason: "Document relationships and entity extraction require the graph infrastructure to store and query semantic connections between uploaded files and their metadata"
    - id: fd-002
      name: "LLM Document Ingestion"
      reason: "Automated metadata extraction and content classification depends on LLM processing pipeline to analyze document content and extract structured information"
```

---

## Step-by-Step Creation Process

### Step 1: Strategic Context (5-10 minutes)

**Define the Problem Space**

```yaml
strategic_context:
  problem_statement: |
    [3-5 sentences describing the core problem this feature solves.
     Focus on user pain, business impact, and market opportunity.
     Reference metrics if available.]
  
  market_context: |
    [2-3 sentences about competitive landscape, market trends,
     or regulatory drivers creating demand for this feature.]
  
  success_metrics:
    - metric: "[Specific, measurable outcome]"
      target: "[Quantified goal with timeframe]"
      measurement: "[How this will be tracked]"
```

**Good Example:**
```yaml
strategic_context:
  problem_statement: |
    Compliance officers at mid-to-large enterprises (500+ employees) spend 40-60% of their time on manual document tracking and verification. They maintain complex spreadsheets correlating documents to regulatory requirements, perform manual metadata checks, and coordinate with multiple teams to ensure completeness. This reactive approach leads to audit findings, regulatory penalties, and stressed teams. The market for compliance automation is growing at 23% CAGR as regulations become more complex.
  
  market_context: |
    Existing document management systems focus on storage and retrieval but lack compliance-aware features. Competitors like Compliance.ai and LogicGate offer workflow automation but don't integrate deeply with knowledge work platforms. Our opportunity is to embed compliance intelligence directly into the document workflow where knowledge work happens.
  
  success_metrics:
    - metric: "Compliance officer time spent on manual tracking"
      target: "Reduce from 15-20 hours/quarter to 2-3 hours/quarter (85% reduction)"
      measurement: "User interviews and time-tracking data collected monthly"
    - metric: "Compliance gap detection time"
      target: "Identify missing documents within 24 hours vs current 2-4 weeks"
      measurement: "System logs tracking time from requirement change to notification"
```

### Step 2: Value Propositions - WHY (20-30 minutes)

**Create Exactly 4 Persona Narratives**

Each persona gets a 3-paragraph story:
1. **current_situation** (200+ chars): Rich detail about their current struggle
2. **transformation_moment** (200+ chars): How the feature changes their workflow
3. **emotional_resolution** (200+ chars): The deeper human impact

**Persona Selection Criteria:**
- Choose personas representing different user types (power user, occasional user, admin, stakeholder)
- Use character names with specific roles and companies
- Include concrete metrics in their stories (hours spent, items tracked, team size)
- Show progression: current → transformation → emotional

**Template:**
```yaml
value_propositions:
  - persona: "[Character Name], [Role] at [Company/Context]"
    current_situation: |
      [Name] spends [time/effort metrics] doing [current manual process].
      [Describe their workflow with specific details: tools used, steps taken, pain points encountered].
      [Include scale/scope: number of items, frequency, coordination complexity].
      [End with the emotional/business impact of current state].
    
    transformation_moment: |
      With [feature capability], [Name] now [new workflow with automation].
      [Describe specific UI interactions or system behaviors].
      [Quantify the improvement: time saved, errors reduced, etc.].
      [Show the "aha moment" - what clicks for them].
    
    emotional_resolution: |
      [Name] feels [emotional state] because [deeper reason].
      [Describe relationship changes: with team, stakeholders, customers].
      [Show identity shift: from reactive to proactive, from tactical to strategic].
      [End with new possibilities unlocked or aspirations enabled].
```

**Quality Checklist for Each Persona:**
- [ ] Character name + specific role + company context
- [ ] current_situation ≥200 chars with concrete metrics
- [ ] transformation_moment ≥200 chars with workflow details
- [ ] emotional_resolution ≥200 chars with human impact
- [ ] Story flows logically: problem → solution → transformation
- [ ] Avoids generic platitudes ("save time", "increase efficiency")
- [ ] Includes specific numbers (hours, items, percentages)

### Step 3: Scenarios - HOW (30-40 minutes)

**Create Top-Level User Scenarios**

Scenarios demonstrate HOW the feature works in practice. They are:
- **Top-level** in the YAML structure (NOT nested in contexts)
- **Concrete** with specific actors, triggers, and steps
- **Testable** with clear acceptance criteria

**Scenario Anatomy:**
```yaml
scenarios:
  - id: scn-001
    name: "[Action-Oriented Title]"
    jtbd_category: "[Job-to-be-Done this supports]"
    actor: "[Character Name from persona] OR [Role]"
    context: "[Where/when this happens - situational setup]"
    trigger: "[What initiates this flow - event or user action]"
    action: |
      [Step-by-step description of what the actor does.
       Be specific about UI interactions, decisions made, data entered.
       Show the happy path with realistic details.]
    outcome: |
      [Expected result with specific state changes.
       What does the system show? What data changed?
       How does the actor know they succeeded?]
    acceptance_criteria:
      - "[Testable condition 1]"
      - "[Testable condition 2]"
      - "[Testable condition 3]"
```

**Good Scenario Example:**
```yaml
scenarios:
  - id: scn-001
    name: "Upload and Tag Compliance Document"
    jtbd_category: "Maintain regulatory compliance"
    actor: "Sarah Martinez, Compliance Officer"
    context: "Sarah is reviewing the compliance dashboard and notices Project Alpha is missing a required ISO 27001 certificate. She has the PDF downloaded from the certification authority."
    trigger: "Sarah clicks the 'Upload Document' button next to Project Alpha's compliance card"
    action: |
      1. Sarah selects the certificate PDF from her Downloads folder
      2. She assigns it to "Project Alpha" using the project dropdown
      3. She adds compliance tags: "ISO 27001", "Security", "Annual Review"
      4. She sets the expiry date to one year from issue date
      5. She clicks "Process and Upload"
      6. System shows a progress indicator while extracting metadata
    outcome: |
      Document uploads successfully. System displays extracted metadata (certificate authority, issue date, scope). Compliance dashboard updates showing Project Alpha's status improved from 89% to 94%. Sarah receives a confirmation notification and sees the document listed in the project's compliance folder.
    acceptance_criteria:
      - "Document uploads without errors and appears in project compliance folder within 5 seconds"
      - "System automatically extracts: document type, issuer, issue date, expiry date, scope"
      - "Compliance percentage updates in real-time on dashboard"
      - "Sarah receives confirmation notification with document details"
      - "Document is searchable by tags and metadata immediately"
```

**Scenario Quality Checklist:**
- [ ] Clear, action-oriented name (not generic "Use Feature")
- [ ] Linked to JTBD category from strategic context
- [ ] Specific actor (persona name or role)
- [ ] Context sets up the situation (where/when/why)
- [ ] Trigger is concrete (not vague "user wants to")
- [ ] Action has step-by-step detail (UI interactions visible)
- [ ] Outcome is measurable (state changes, data updates, notifications)
- [ ] 3-5 testable acceptance criteria
- [ ] Avoids implementation speculation ("system uses AI to...")

### Step 4: Contexts - WHERE (20-30 minutes)

**Define User Interface Contexts**

Contexts are WHERE the feature appears in the UI. They describe:
- UI locations (screens, panels, modals)
- Key user interactions (buttons, forms, filters)
- Data displayed (lists, metrics, status indicators)

**Context Template:**
```yaml
contexts:
  - id: ctx-001
    type: "[screen|panel|modal|workflow|integration]"
    name: "[UI Location Name]"
    description: |
      [2-3 sentences describing this UI context.
       Where does it appear in the navigation?
       What's the primary purpose of this screen/panel?]
    
    key_interactions:  # REQUIRED, min 1
      - "[Button/action user can take]"
      - "[Form field or input control]"
      - "[Navigation or filtering action]"
    
    data_displayed:  # REQUIRED, min 1
      - "[List or table of items shown]"
      - "[Metric or status indicator]"
      - "[Visualization or chart]"
```

**Good Context Example:**
```yaml
contexts:
  - id: ctx-001
    type: "screen"
    name: "Compliance Dashboard"
    description: |
      Primary landing page for compliance officers showing real-time status across all projects. Accessible from main navigation under "Compliance". Displays project health cards with compliance percentages, recent activity feed, and upcoming certification expiries.
    
    key_interactions:
      - "Filter projects by compliance status (Complete, At Risk, Critical)"
      - "Sort by compliance percentage, last updated, or next review date"
      - "Click project card to view detailed compliance breakdown"
      - "Upload new compliance document via action button"
      - "Export compliance report for audit purposes"
    
    data_displayed:
      - "Project compliance cards with percentage, status badge, and document count"
      - "Recent activity feed showing uploads, status changes, and notifications"
      - "Upcoming expiries list with days remaining and severity indicators"
      - "Overall compliance score with trend indicator (improving/declining)"
      - "Missing documents alert banner with count and affected projects"
```

**Context Quality Checklist:**
- [ ] Clear type (screen/panel/modal/workflow/integration)
- [ ] Descriptive name indicating UI location
- [ ] Description explains where it appears and primary purpose
- [ ] key_interactions has ≥1 item (user actions)
- [ ] data_displayed has ≥1 item (information shown)
- [ ] Avoids implementation details ("uses React component")
- [ ] Focuses on WHAT users see and do, not HOW it's built

### Step 5: Dependencies (10-15 minutes)

**Define Feature Relationships**

Dependencies explain:
- **requires**: What must exist before this feature can work
- **enables**: What becomes possible after this feature exists

**Dependency Template:**
```yaml
dependencies:
  requires:
    - id: fd-XXX
      name: "[Feature Name]"
      reason: |
        [30+ character explanation of WHY this dependency exists.
         Be specific about what capability from the other feature is needed.
         Avoid generic "depends on" - explain the actual technical or UX dependency.]
  
  enables:
    - id: fd-YYY
      name: "[Feature Name]"
      reason: |
        [30+ character explanation of HOW this feature enables the other.
         What capability does this provide that the other feature builds upon?]
```

**Good Dependencies Example:**
```yaml
dependencies:
  requires:
    - id: fd-001
      name: "Knowledge Graph Engine"
      reason: "Document relationships and entity extraction require the graph infrastructure to store and query semantic connections between uploaded files, their metadata, compliance tags, and project relationships. Without the graph, we cannot track document dependencies or suggest related compliance materials."
    
    - id: fd-007
      name: "Authentication & Multi-Tenancy"
      reason: "Compliance document access must be scoped to organization and project boundaries. Users should only see documents from their authorized projects. The auth system provides the tenant isolation and permission checking needed for secure document management."
  
  enables:
    - id: fd-006
      name: "Integration Framework"
      reason: "Once documents are processed and stored with structured metadata, external integrations can pull compliance data for reporting to regulatory systems, sync with audit platforms, or trigger workflows in project management tools. The standardized document metadata this feature creates is the foundation for integration APIs."
```

**Dependency Quality Checklist:**
- [ ] Each dependency has id, name, AND reason
- [ ] Reason field is ≥30 characters
- [ ] Explains WHAT capability is needed (not just "depends on")
- [ ] Avoids circular dependencies
- [ ] Reflects actual technical or UX coupling
- [ ] Uses present tense ("requires", not "will require")

### Step 6: Boundaries (10-15 minutes)

**Define What This Feature Does NOT Do**

Boundaries prevent scope creep and set clear expectations.

```yaml
boundaries:
  non_goals:
    - "[Specific capability explicitly out of scope]"
    - "[Adjacent feature area someone might assume is included]"
    - "[Future enhancement deferred to later phase]"
  
  constraints:
    - "[Technical limitation or requirement]"
    - "[Business or regulatory constraint]"
    - "[Performance or scale constraint]"
```

**Good Boundaries Example:**
```yaml
boundaries:
  non_goals:
    - "Document editing or version control (users upload finalized documents only)"
    - "Automated document generation from templates (separate feature fd-012)"
    - "OCR for scanned documents (Phase 2 - starts with digital PDFs only)"
    - "Email notifications about compliance status (covered by fd-009 Admin Tools)"
    - "Mobile app support (web interface only in v1)"
  
  constraints:
    - "Maximum document size: 50MB per file"
    - "Supported formats: PDF, DOCX, XLSX (no images or presentations)"
    - "Compliance tags must match predefined taxonomy (no free-form tags)"
    - "Document processing SLA: 95% complete within 30 seconds"
    - "Retention: Documents stored for 7 years per regulatory requirements"
```

### Step 7: Review and Validate (10-15 minutes)

**Final Quality Checks**

- [ ] File follows naming convention: `fd-XXX_feature_name.yaml`
- [ ] ID sequence is correct (fd-001, fd-002, etc.)
- [ ] All required sections present: strategic_context, value_propositions, scenarios, contexts, dependencies, boundaries
- [ ] Exactly 4 personas in value_propositions
- [ ] Each persona narrative ≥200 chars per paragraph
- [ ] Scenarios are top-level (not nested in contexts)
- [ ] Each scenario has name, context, trigger fields
- [ ] Contexts have required key_interactions and data_displayed arrays
- [ ] Dependencies use rich objects with id/name/reason
- [ ] Dependency reasons are ≥30 characters
- [ ] No technical implementation details in any section
- [ ] Consistent terminology with other feature definitions
- [ ] File validates against EPF schema v2.0

**Validation Commands:**
```bash
# Validate YAML structure against schema
cd /path/to/EPF
./scripts/validate-schemas.sh /path/to/instance

# Run enhanced quality checks
./scripts/validate-feature-quality.sh /path/to/feature-definition.yaml
```

### Step 8: Feature Maturity (Optional, 5-10 minutes)

**NEW in EPF v2.8.0** - Track capability-level maturity within your feature.

**When to add feature_maturity:**
- Features in active development (tracking progress across cycles)
- Features with capabilities at different maturity levels
- Before scaling decisions (verify all capabilities are ready)

**When to skip:**
- New features (all capabilities start at "hypothetical" by default)
- Features where all capabilities are clearly at same maturity level
- Quick drafts that will be enriched later

**Feature Maturity Template:**
```yaml
feature_maturity:
  overall_stage: "hypothetical"  # hypothetical | emerging | proven | scaled
  capability_maturity:
    - capability_id: "cap-001"
      stage: "hypothetical"
      # delivered_by_kr: "kr-p-001"  # Add when KR advances this
      evidence: "Design phase - awaiting implementation"
    - capability_id: "cap-002"
      stage: "hypothetical"
      evidence: "Concept validated in user interviews"
  # last_advanced_by_kr: "kr-p-001"  # Add when maturity changes
  last_assessment_date: "2025-01-18"
```

**Stage Definitions (same as Value Model Maturity):**
- **hypothetical**: Design/concept phase, no implementation evidence
- **emerging**: Initial implementation, early validation signals
- **proven**: Validated with real users, consistent evidence of value
- **scaled**: Deployed at scale, operationalized for growth

**The Minimum Rule:**
Feature's `overall_stage` equals its **least mature capability**:
- 4 capabilities "proven" + 1 capability "hypothetical" = feature is "hypothetical"
- Ensures honest assessment of feature readiness

**Good Feature Maturity Example:**
```yaml
feature_maturity:
  overall_stage: "emerging"
  capability_maturity:
    - capability_id: "cap-001"
      stage: "proven"
      delivered_by_kr: "kr-p-003"
      evidence: "Document upload validated with 847 customers, 99.2% success rate, 3 consecutive months"
    - capability_id: "cap-002"
      stage: "emerging"
      delivered_by_kr: "kr-p-005"
      evidence: "Compliance tagging released to beta, 78% report 'very helpful' in survey (n=45)"
    - capability_id: "cap-003"
      stage: "hypothetical"
      evidence: "Dashboard design complete, awaiting Q2 implementation"
  last_advanced_by_kr: "kr-p-005"
  last_assessment_date: "2025-01-18"
```

**Feature Maturity Quality Checklist:**
- [ ] `capability_id` matches IDs from your `definition.capabilities` section
- [ ] `overall_stage` reflects minimum of all capability stages
- [ ] Evidence is specific (metrics, dates, sources)
- [ ] `delivered_by_kr` links to actual KR IDs from roadmap
- [ ] `last_assessment_date` is recent and accurate

**See also:**
- [VALUE_MODEL_MATURITY_GUIDE.md](../docs/guides/VALUE_MODEL_MATURITY_GUIDE.md) - Full maturity model documentation
- [fd-002-knowledge-graph-engine.yaml](../definitions/product/01-technical/fd-002-knowledge-graph-engine.yaml) - Example with feature_maturity

---

## Common Anti-Patterns to Avoid

### 1. Generic Personas
❌ "User", "Admin", "Manager"  
✅ "Sarah Martinez, Compliance Officer at TechFlow Inc."

### 2. Brief Narratives
❌ "Users want faster compliance"  
✅ 200+ character rich narrative with metrics and workflow detail

### 3. Vague Scenarios
❌ "User uploads document"  
✅ Step-by-step flow with context, trigger, detailed action, measurable outcome

### 4. Missing Required Fields
❌ Scenarios without name/context/trigger  
✅ All required fields present with substantial content

### 5. Technical Implementation
❌ "System uses PostgreSQL to store..."  
✅ "System displays compliance status with..."

### 6. Weak Dependencies
❌ `requires: ["fd-001"]`  
✅ `requires: [{id: "fd-001", name: "...", reason: "..."}]`

### 7. Embedded Scenarios
❌ Scenarios nested inside contexts  
✅ Scenarios at top level of YAML

---

## Reference Examples

For validated examples following all these guidelines, see:
- `/Users/nikolaifasting/code/emergent/feature_definitions/fd-001_knowledge_graph_engine.yaml`
- `/Users/nikolaifasting/code/emergent/feature_definitions/fd-003_ai_native_chat.yaml`
- `/Users/nikolaifasting/code/emergent/feature_definitions/fd-007_authentication_multi_tenancy.yaml`

These files demonstrate the correct structure, narrative depth, and EPF schema v2.0 compliance.

---

## What Comes Next: The Handoff to Engineering

**IMPORTANT: Feature definitions are the handoff point between product and engineering teams.**

### EPF's Scope: Levels 1-2 Only (WHY + HOW Strategic)

EPF uses Simon Sinek's WHY-HOW-WHAT framework. Each level contains overlapping WHY-HOW-WHAT elements. The WHAT from one level becomes context for the next level's HOW decisions. This tight coupling ensures emergence.

Your feature definition (Level 2) describes **HOW** users achieve outcomes (scenarios, workflows) and **WHAT** value is delivered (contexts, outcomes, criteria - strategic, not technical). It does NOT describe **HOW** to build it technically or **WHAT** technologies to use. That's engineering's responsibility.

| Level | Artifact | WHY-HOW-WHAT | Your Responsibility | Engineering's Responsibility |
|-------|----------|--------------|---------------------|------------------------------|
| **1** | Value Model | WHY + HOW (strategic) | ✅ Create/maintain | Read for context |
| **2** | Feature Definition | HOW + WHAT (tactical/strategic) | ✅ Create/maintain | Read and consume |
| **3** | Implementation Spec | HOW + WHAT (technical) | ❌ Not your domain | ✅ Create (APIs, schemas, architecture) |
| **4** | Code | WHAT (concrete) | ❌ Not your domain | ✅ Create (source code, tests, deployments) |

**Critical Distinction - Strategic WHAT vs Technical WHAT:**
- Level 2 WHAT: "Alert within 30 seconds of threshold breach" ✅ (outcome, acceptance criteria)
- Level 3 WHAT: "WebSocket endpoint `/ws/alerts` using Kafka" ❌ (technical, specific)

### After You Create a Feature Definition

Engineering teams take your feature definition and create:

1. **Feature Implementation Specification** (Level 3 - HOW technical + WHAT technologies)
   - **WHY:** Your acceptance criteria become their requirements
   - **HOW (dominant):** Technical PRD, API contracts, database schemas, architecture
   - **WHAT (technical):** Specific technologies, endpoints, performance targets
   - Example: "WebSocket endpoint `/ws/risk-alerts` + Kafka event stream + Redis cache + PostgreSQL alerts table"

2. **Implemented Feature/Code** (Level 4 - WHAT concrete)
   - **WHAT (dominant):** Source code, tests, deployment configs, CI/CD pipelines
   - **HOW:** Algorithms, functions
   - **WHY:** Inherited requirements (minimal)
   - Example: `RiskAlertService.ts`, Jest tests, Kubernetes deployments

### What Feature Definitions Should Include

✅ **DO include (HOW users + strategic WHAT):**
- **WHY:** Inherited from value model (via `contributes_to`)
- **HOW (dominant):** Personas with rich narratives, scenarios describing workflows
- **WHAT (strategic):** Contexts showing where interactions occur, outcomes delivered, acceptance criteria, jobs-to-be-done
- Value model mappings (which capabilities this supports)
- Dependencies on other features (with rationale)

❌ **DO NOT include (technical HOW/WHAT):**
- **Technical HOW:** API endpoint URLs, request/response formats, architecture diagrams, algorithms
- **Technical WHAT:** Database tables/columns, technology choices (React, Node.js, PostgreSQL), infrastructure patterns

### Example: Feature Definition vs Implementation Spec

**Feature Definition (Your Work - Level 2: HOW users + strategic WHAT):**
```yaml
scenarios:
  - id: scn-001
    name: "Upload and Process Compliance Document"
    actor: "Sarah Martinez, Compliance Officer"
    context: "Project missing required certificate"
    trigger: "Sarah notices compliance gap"
    action: "Sarah uploads certificate PDF and assigns to project"
    outcome: "System processes document, validates compliance, updates dashboard"
    acceptance_criteria:
      - "Document uploaded within 5 seconds" ✅ Strategic WHAT (outcome)
      - "Compliance status updates in real-time" ✅ Strategic WHAT (experience)
      - "User receives confirmation notification" ✅ Strategic WHAT (criteria)
```

**Feature Implementation Spec (Engineering's Work - Level 3: HOW technical + WHAT technologies):**
```markdown
# Technical Implementation Specification

## API Endpoints (HOW + WHAT technical)
- POST /api/documents/upload (multipart/form-data) ← Technical WHAT
- GET /api/projects/{id}/compliance-status ← Technical WHAT
- WebSocket /ws/compliance-updates ← Technical WHAT

## Database Schema (HOW + WHAT technical)
- documents table (id, project_id, file_path, uploaded_at, metadata_json)
- compliance_rules table (id, rule_type, requirement_text)
- compliance_status table (project_id, rule_id, status, last_checked)

## Architecture (HOW technical)
- Upload service (Node.js, S3 storage) ← Technology choices
- Processing pipeline (AWS Lambda, OCR with Textract) ← Specific tech
- Real-time notifications (WebSocket server, Redis pub/sub) ← Implementation details
```

**Notice the handoff:** Your strategic WHAT ("within 5 seconds", "real-time updates") becomes their WHY (requirements). They then define technical HOW (architecture, APIs) and technical WHAT (specific technologies).**See the difference?** Your feature definition is outcome-oriented and business-focused. Engineering's implementation spec is technically prescriptive.

---

## Need Help?

**Before creating a feature definition:**
1. Review this wizard completely
2. Study 2-3 reference examples
3. Complete the pre-creation checklist
4. Draft in sections (don't try to do it all at once)

**While creating:**
1. Use the templates provided for each section
2. Refer to good/bad examples for guidance
3. Check quality checklists after each section
4. Validate incrementally (don't wait until the end)

**After creating:**
1. Run schema validation: `./scripts/validate-schemas.sh`
2. Run quality validation: `./scripts/validate-feature-quality.sh`
3. Review against anti-patterns list
4. Compare with reference examples for tone and depth

**Common creation time:**
- First feature definition: 2-3 hours
- Subsequent definitions: 1-1.5 hours
- With practice and templates: 45-60 minutes

The time investment pays off in implementation clarity and reduced rework!

---

## Related Resources

- **Feature Definition Schema (v2.0)**: [../schemas/feature_definition_schema.json](../schemas/feature_definition_schema.json)
- **Value Model Business Language Guide**: [../docs/guides/VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md](../docs/guides/VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md)
- **Schema Enhancement Recommendations**: [../docs/guides/technical/schema_enhancement_recommendations.md](../docs/guides/technical/schema_enhancement_recommendations.md)
- **Product Architect Wizard**: [./product_architect.agent_prompt.md](./product_architect.agent_prompt.md)
- **Roadmap Recipe Template**: [../templates/READY/05_roadmap_recipe.yaml](../templates/READY/05_roadmap_recipe.yaml)
