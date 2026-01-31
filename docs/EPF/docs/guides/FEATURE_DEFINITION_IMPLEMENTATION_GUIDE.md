# Feature Definition Implementation Reference Guide

**Version:** 1.0.0  
**EPF Schema Version:** 2.0.0  
**Last Updated:** 2025-12-28  
**Status:** Complete

---

## Table of Contents

1. [Introduction](#introduction)
2. [Target Audience](#target-audience)
3. [Prerequisites](#prerequisites)
4. [Quick Start Summary](#quick-start-summary)
5. [Complete Walkthrough: Creating Your First Feature Definition](#complete-walkthrough)
   - 5.1. [Setup: Copy Template](#setup-copy-template)
   - 5.2. [Section 1: Basic Metadata](#section-1-basic-metadata)
   - 5.3. [Section 2: Strategic Context](#section-2-strategic-context)
   - 5.4. [Section 3: Value Propositions (4 Personas)](#section-3-value-propositions)
   - 5.5. [Section 4: Capabilities](#section-4-capabilities)
   - 5.6. [Section 5: Scenarios (Top-Level)](#section-5-scenarios)
   - 5.7. [Section 6: Contexts](#section-6-contexts)
   - 5.8. [Section 7: Dependencies](#section-7-dependencies)
6. [Validation Workflow](#validation-workflow)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Quality Checklist](#quality-checklist)
9. [Real Example Analysis](#real-example-analysis)
10. [Additional Resources](#additional-resources)

---

## 1. Introduction

This guide walks you through creating a **schema-compliant, validation-passing feature definition** from start to finish. You will learn:

- **How to use the template** (`feature_definition_template.yaml`)
- **What each section requires** and why
- **How to write rich persona narratives** (200+ characters required)
- **How to structure scenarios correctly** (top-level, not nested)
- **How to validate and fix errors** until you achieve **0 errors**
- **Common mistakes** and how to avoid them

By the end of this guide, you will have created a feature definition that passes all validation checks and demonstrates quality patterns used across the EPF Feature Corpus (21 validated examples).

---

## 2. Target Audience

This guide is for:

- **Product managers** defining features for implementation
- **Solution architects** designing system capabilities
- **Developers** creating first feature definitions in product instances
- **AI agents** generating feature definitions (follow schema-first principles)

**Expected knowledge:**
- Basic YAML syntax (indentation, lists, strings)
- Understanding of product features and user personas
- Familiarity with command line (for running validation script)

**Not required:**
- Deep technical implementation knowledge
- Prior experience with EPF framework
- Schema design expertise

---

## 3. Prerequisites

**Before starting, ensure you have:**

### Conceptual Prerequisites

**⭐ CRITICAL: Value Model Comes First**

Feature definitions **implement** your product's value model. Before creating features, you should have:

1. **Product value model defined** (`product.{line}.value_model.yaml`)
   - WHY: Purpose, value drivers (outcomes users care about)
   - HOW: Value flows, capabilities (logical structure that delivers outcomes)
   - WHAT: High-level components (minimal)
   - Common vocabulary established

2. **Strategic context established** (READY phase complete)
   - North Star defining overall vision
   - Strategy foundations with evidence
   - Roadmap with prioritized initiatives

**Why this matters:** EPF is outcome-oriented. EPF uses Simon Sinek's WHY-HOW-WHAT framework with overlapping layers:

- **Value Model (Level 1):** WHY we exist + HOW value flows (strategic foundation)
- **Feature Definition (Level 2):** Inherits WHY + HOW users achieve outcomes + WHAT value delivered (strategic, not technical)
- **Implementation Spec (Level 3 - outside EPF):** HOW to build technically + WHAT technologies (engineering's responsibility)
- **Code (Level 4 - outside EPF):** The actual running WHAT (software)

**The WHAT from one level becomes context for the next level's HOW.** This tight coupling ensures emergence.

**Feature definitions contain strategic WHAT** (contexts, scenarios, outcomes, acceptance criteria), NOT technical WHAT (APIs, schemas, architecture). Example:
- Feature Definition WHAT: "Alert within 30 seconds of threshold breach" ✅
- Implementation Spec WHAT: "WebSocket endpoint `/ws/alerts` using Kafka" ❌ (that's Level 3)

If you jump straight to features without a value model, you're building without strategic foundation.

**Quick check:**
```bash
# Do you have a value model?
ls FIRE/value_models/product.*.value_model.yaml

# If not, create value model FIRST using value model template
# Then return to feature definitions
```

### Environment Setup
```bash
# 1. Verify yq is installed (required for validation)
yq --version
# If not installed: brew install yq

# 2. Verify you're in correct location (product instance, not canonical EPF)
pwd
# Should be: /path/to/{product-name}/docs/EPF/
# NOT: /path/to/epf/ (canonical repo)

# 3. Ensure validation script is executable
chmod +x scripts/validate-feature-quality.sh
```

### Required Files/Resources
- [ ] Template: `definitions/product/_template/feature_definition_template.yaml`
- [ ] Wizard: `wizards/feature_definition.wizard.md` (keep open for reference)
- [ ] Schema: `schemas/feature_definition_schema.json` (for structure reference)
- [ ] Examples: `definitions/product/` directory (21 validated examples for patterns)
- [ ] Validator: `scripts/validate-feature-quality.sh` (validation enforcement)

### Preparation Checklist
- [ ] Identified **exactly 4 distinct personas** with character names
- [ ] Prepared biographical details for each persona (role, organization, metrics)
- [ ] Identified 3-5 key scenarios showing feature usage
- [ ] Listed dependencies on other features (if any)
- [ ] Reviewed at least 2-3 example feature definitions from `definitions/product/`

---

## 4. Quick Start Summary

**The 7-Step Process:**

1. **Copy template** → `definitions/product/_template/feature_definition_template.yaml`
2. **Rename file** → `fd-{number}-{slug}.yaml` (e.g., `fd-025-document-management.yaml`)
3. **Fill metadata** → id, name, slug, status (5 minutes)
4. **Write strategy** → problem_statement, market_context, value model (15 minutes)
5. **Create personas** → 4 personas with 200+ char narratives each (30 minutes)
6. **Define structure** → capabilities, scenarios, contexts, dependencies (30 minutes)
7. **Validate & fix** → Run validator, fix errors, re-validate until 0 errors (10-20 minutes)

**Total time:** 90-120 minutes for first feature definition  
**Subsequent features:** 45-60 minutes (once familiar with patterns)

**Critical Success Factors:**
- ✅ **Read schema sections BEFORE writing** (not after validation fails)
- ✅ **Use validated examples as templates** (copy patterns, adapt content)
- ✅ **Validate early and often** (after each major section)
- ✅ **Write 200+ character narratives** (schema requirement, quality indicator)
- ✅ **Keep scenarios at top level** (not nested in contexts)
- ✅ **Explain dependencies with WHY** (30+ characters minimum)

---

## 5. Complete Walkthrough: Creating Your First Feature Definition

We'll create a feature definition for **"Document Management & Version Control"** as our example. This demonstrates all required sections and quality patterns.

### 5.1. Setup: Copy Template

```bash
# Navigate to your instance directory
cd docs/EPF/_instances/{your-product}/FIRE/feature_definitions/

# Copy template
cp ../../../../definitions/product/_template/feature_definition_template.yaml fd-025-document-management.yaml

# Open in your editor
code fd-025-document-management.yaml
```

**What you'll see:** A 219-line template with placeholders (`{...}`) and instructional comments. Keep the template structure intact - only replace placeholders.

---

### 5.2. Section 1: Basic Metadata

**What to fill:**
```yaml
id: fd-025  # Sequential number in your instance
name: "Document Management & Version Control"  # Human-readable feature name
slug: "document-management-version-control"  # URL-friendly identifier
status: draft  # Options: draft | ready | in-progress | delivered
```

**Rules:**
- **id:** Must match filename prefix (`fd-025-*.yaml` → `id: fd-025`)
- **name:** 3-8 words describing feature clearly
- **slug:** Lowercase, hyphen-separated, matches filename
- **status:** Always start with `draft`, update as feature progresses

**Common mistakes:**
- ❌ ID mismatch: `fd-025-document-management.yaml` with `id: fd-26`
- ❌ Name too long: "Enterprise Document Management with Advanced Version Control and Collaboration Features"
- ❌ Slug with underscores: `document_management` (use hyphens: `document-management`)

**Validation check:**
```bash
# Quick check: Does filename match id and slug?
# fd-025-document-management.yaml
#    ^^^  ^^^^^^^^^^^^^^^^^^^
#    id        slug
```

---

### 5.3. Section 2: Strategic Context

**What to fill:**
```yaml
strategic_context:
  problem_statement: |
    {3-4 sentences: Who experiences this problem? What pain does it cause? 
    What is the business impact if not solved?}
    
  market_context: |
    {3-4 sentences: What solutions exist? What are their limitations? 
    What opportunity does this create?}
    
  contributes_to:
    - {ValueModel.Layer.Component}  # Example: Product.Decide.Analysis
    
  tracks:
    - {track_name}  # Example: product_operations
    
  success_metrics:
    - metric: {Metric name}
      target: {Specific measurable target}
      measurement: {How you'll measure it}
```

**Example (Document Management):**
```yaml
strategic_context:
  problem_statement: |
    Legal teams managing 500-2000 documents per case struggle with version tracking, 
    losing 2-3 hours per week searching for "the latest version" across email attachments, 
    shared drives, and chat apps. Junior associates waste billable time reconciling conflicting 
    edits when multiple people work on documents simultaneously. Version confusion causes 
    compliance risks (submitting outdated contracts to courts) and client trust issues 
    (sending wrong document versions). Without automated version control, teams resort to 
    manual file naming schemes (contract_v1_final_FINAL_revised.docx) that break down at scale.
    
  market_context: |
    Document management has evolved from simple file storage (Dropbox, Google Drive) to 
    version-aware collaboration platforms (Confluence, Notion, SharePoint). The legal tech 
    market specifically demands audit trails (who changed what, when), conflict resolution 
    (merging simultaneous edits), and retention policies (archiving after case closure). 
    Enterprise buyers expect Git-like version control adapted for non-technical users, 
    with visual diff tools showing markup changes between versions. Products without robust 
    versioning lose deals to competitors like Clio, NetDocuments, and iManage which emphasize 
    version integrity and audit compliance.
    
  contributes_to:
    - Product.Operate.Knowledge  # Document storage and retrieval
    - OrgOps.Coordinate.Compliance  # Audit trails and retention
    
  tracks:
    - product_operations
    - compliance
    
  success_metrics:
    - metric: Time spent searching for latest document version
      target: Reduce from 2-3 hours/week to <15 minutes/week per user
      measurement: User time tracking studies + system analytics (search queries, version retrievals)
      
    - metric: Version-related errors submitted to external parties
      target: Decrease from 5-8 incidents per quarter to <1 incident per quarter
      measurement: Incident reports + customer support tickets tagged "wrong version"
      
    - metric: Document collaboration efficiency
      target: Increase simultaneous editors per document from 1-2 to 4-6 without conflicts
      measurement: System logs tracking concurrent edit sessions + conflict resolution events
```

**Writing tips:**
- **Be specific:** Use numbers (hours, percentages, counts)
- **Name personas:** "Legal teams", "Junior associates" (preview of Section 3)
- **Show consequences:** "Compliance risks", "Client trust issues" (why it matters)
- **Reference competitors:** Shows market awareness
- **Quantify targets:** "2-3 hours" → "<15 minutes" (measurable improvement)

**Common mistakes:**
- ❌ Too vague: "Users need better document management"
- ❌ Too technical: "Implement conflict-free replicated data types for distributed document editing"
- ❌ No metrics: Success metrics missing or unmeasurable
- ❌ Wrong layer: `contributes_to: Backend.Storage` (too implementation-focused)

---


### 5.4. Section 3: Value Propositions (4 Personas)

**THE MOST IMPORTANT SECTION** - This is where validation failures most commonly occur.

**Schema requirements (MUST follow):**
- **Exactly 4 personas** (minItems: 4, maxItems: 4, no flexibility)
- **Each persona requires 3 narratives:**
  - `current_situation`: ≥200 characters
  - `transformation_moment`: ≥200 characters
  - `emotional_resolution`: ≥200 characters
- **Specific character names** (not "User", "Admin", "Manager")
- **Real organizational context** (company names, team sizes, metrics)

**Structure:**
```yaml
value_propositions:
  - persona: "{Full Name}, {Role} at {Organization}"
    current_situation: |
      {200+ characters describing their current pain in detail. Include:
      - Specific time costs (hours per week/month)
      - Team size and coordination challenges
      - Tools they currently use (and why they fail)
      - Metrics showing the problem scale
      - Emotional impact (frustration, stress, risk)}
      
    transformation_moment: |
      {200+ characters describing how the feature changes their workflow. Include:
      - Specific feature interactions (click this, see that)
      - Time savings (from X hours to Y minutes)
      - Automation replacing manual work
      - New capabilities they couldn't do before
      - Immediate feedback and results}
      
    emotional_resolution: |
      {200+ characters describing the emotional and professional outcome. Include:
      - Confidence and peace of mind
      - Improved relationships with colleagues/clients
      - Career advancement or professional growth
      - Strategic value vs tactical firefighting
      - Long-term impact on their role}
```

**Example Persona 1 (Document Management):**
```yaml
value_propositions:
  - persona: "Jessica Thompson, Senior Associate at Morrison & Fletcher LLP"
    current_situation: |
      Jessica manages document coordination for 8-12 active litigation cases, tracking 200-400 
      documents per case across depositions, motions, and discovery. She spends 3-4 hours per week 
      hunting for "the latest version" of critical documents because her team of 6 attorneys edit 
      files simultaneously using email attachments and Dropbox folders. Last month, she submitted 
      an outdated motion to court (version 7 instead of version 11) because a partner's edits were 
      in a separate email thread. The error required emergency filing corrections, embarrassed the 
      firm, and cost Jessica a weekend rewriting the motion. She maintains manual version tracking 
      spreadsheets but can't keep up when cases move quickly. Her billable time suffers because 
      version hunting is non-billable administrative work.
      
    transformation_moment: |
      With automated version control, Jessica opens a case workspace and sees all documents with 
      clear version indicators ("v11 - latest, 2 hours ago by Sarah Miller"). When a partner edits 
      a motion, Jessica receives a real-time notification showing exactly what changed (visual diff 
      highlighting added/removed text). She clicks "Compare versions" to see markup between v7 and 
      v11, confirming all partner feedback was incorporated. When she needs to submit to court, she 
      clicks "Export latest version" with confidence that it's truly the most current. The system 
      prevents her from accidentally accessing outdated versions, showing prominent warnings if she 
      opens anything except the latest. Version tracking that consumed 3-4 hours weekly now happens 
      automatically in the background.
      
    emotional_resolution: |
      Jessica feels confident submitting documents to courts because the system guarantees she's 
      using the latest version with complete edit history for audit purposes. She's shifted from 
      defensive anxiety ("Did I miss someone's edits?") to proactive confidence ("I can prove this 
      is the authoritative version"). Her relationship with partners has improved because she 
      catches their edits immediately instead of discovering them days later when deadlines loom. 
      She's reclaimed 3-4 hours per week for actual legal work, improving her billable hours and 
      reducing weekend catch-up work. Partners now see her as a reliable case coordinator rather 
      than a bottleneck who slows document turnaround. She's positioned for promotion to senior 
      associate because her case management skills have become a competitive advantage for the firm.
```

**Example Persona 2 (Different role, different pain):**
```yaml
  - persona: "Michael Chen, Compliance Director at TechFlow Industries"
    current_situation: |
      Michael oversees regulatory compliance for 150-person engineering organization producing 
      medical devices under FDA regulations. He must maintain document retention policies requiring 
      7-year archival of design specifications, test reports, and approval certificates. His team 
      of 4 compliance specialists manually audits document repositories quarterly, checking that 
      engineers follow version control procedures and that critical documents aren't accidentally 
      deleted. Last audit revealed 47 instances where engineers had overwritten design specs without 
      preserving prior versions, creating regulatory gaps that could block FDA approval. Michael 
      spent 40 hours reconstructing lost versions from email backups and engineer workstations. The 
      manual audit process consumes 120 hours per quarter ($15,000 in labor costs) and still misses 
      violations until quarterly review.
      
    transformation_moment: |
      With automated version retention policies, Michael configures rules at the document type level 
      ("Design specifications: retain all versions for 7 years, prevent deletion"). The system 
      enforces these policies automatically - when an engineer tries to overwrite a design spec, the 
      system preserves the prior version and creates an audit log entry. Michael's quarterly audit 
      dashboard shows compliance metrics in real-time: 100% version retention for regulated 
      documents, 0 unauthorized deletions, complete audit trails for all changes. Instead of 
      manually reviewing 2,000 documents, he reviews 20 flagged exceptions (documents approaching 
      retention expiry, unusual edit patterns). His team's audit workload drops from 120 hours to 
      15 hours per quarter, focusing on strategic risk assessment rather than tactical version 
      checking.
      
    emotional_resolution: |
      Michael sleeps better knowing that regulatory compliance is enforced by system rules, not 
      human diligence. He's shifted from reactive firefighting (discovering version violations 
      months later) to proactive governance (preventing violations at creation time). His 
      relationship with engineering leadership has improved because the system guides engineers 
      toward compliance rather than catching their mistakes in retrospect. In the next FDA audit, 
      he can demonstrate automated controls proving version integrity, reducing audit preparation 
      time from 3 weeks to 3 days. His executive team now sees compliance as a technology enabler 
      rather than a cost center. He's positioned to expand compliance automation to other regulatory 
      domains (ISO 13485, EU MDR) using the same version control foundation.
```

**Writing tips for remaining 2 personas:**
- **Choose different roles:** Administrator (IT/system perspective), Executive (business value perspective)
- **Different pain points:** Persona 1 = operational efficiency, Persona 2 = compliance risk, Persona 3 = cost/scale, Persona 4 = strategic advantage
- **Different metrics:** Time savings, error reduction, cost avoidance, revenue enablement
- **Different emotional outcomes:** Confidence, relationship improvement, career growth, strategic positioning

**Common mistakes:**
- ❌ Only 3 personas (schema requires EXACTLY 4)
- ❌ Short narratives: "Jessica needs better version control" (45 chars, need 200+)
- ❌ Generic names: "User", "Admin", "Manager" (need "Jessica Thompson", "Michael Chen")
- ❌ No metrics: "spends lots of time" (need "3-4 hours per week")
- ❌ Implementation details: "Using Redux store" (focus on user outcomes, not tech)

**Character count check:**
```bash
# After writing, check your narrative lengths:
yq eval '.value_propositions[0].current_situation' fd-025-document-management.yaml | wc -c
# Should show: 800-1200 (way above 200 minimum)
```

---

### 5.5. Section 4: Capabilities

**What capabilities are:** Discrete technical/functional building blocks that deliver the feature.

**Structure:**
```yaml
capabilities:
  - id: cap-001
    name: "{Capability Name}"
    description: |
      {2-3 paragraphs describing what this capability does, how users interact with it,
      and what technical requirements it has. Include specific user actions and system responses.}
```

**Example (Document Management):**
```yaml
capabilities:
  - id: cap-001
    name: Automated Version Tracking
    description: |
      System automatically creates new version whenever a document is saved, preserving complete 
      edit history without user intervention. Each version captures: timestamp, author identity, 
      file content snapshot, and metadata changes. Users see version timeline in document properties 
      showing "v1 by Jessica (Jan 15, 10:30am) → v2 by Michael (Jan 15, 2:45pm) → v3 by Jessica 
      (Jan 16, 9:00am)". System prevents accidental overwrites by storing versions immutably in 
      content-addressable storage.
      
      Version retention policies enforce regulatory requirements automatically. Administrators 
      configure rules at document type or workspace level: "Design specifications: retain all 
      versions for 7 years". System prevents deletion of regulated documents and archives versions 
      to cold storage after retention period. Audit dashboard shows compliance status across all 
      document types with drill-down to specific violations.

  - id: cap-002
    name: Visual Diff and Comparison
    description: |
      Users can compare any two versions of a document to see exactly what changed. System 
      displays side-by-side comparison with color coding: green highlights for additions, red 
      strikethrough for deletions, yellow for modifications. For text documents (Word, PDF), 
      system renders visual markup showing paragraph-level changes. For structured documents 
      (Excel, CSV), system shows cell-by-cell comparison highlighting changed values.
      
      Comparison view includes "Accept changes" workflow where reviewers can approve/reject 
      individual edits before merging to master version. System tracks review decisions in 
      audit log for compliance purposes. Export functionality generates comparison reports 
      in PDF format suitable for court submissions or regulatory audits.

  - id: cap-003
    name: Conflict Resolution and Merging
    description: |
      When multiple users edit the same document simultaneously, system detects conflicting 
      changes and guides users through resolution. Conflict detection happens at paragraph 
      level for text documents, cell level for spreadsheets, and field level for structured 
      data. System presents conflicting versions side-by-side with options: "Keep mine", 
      "Use theirs", "Merge manually".
      
      For common scenarios (non-overlapping edits in different sections), system auto-merges 
      changes without user intervention. Users receive notifications when auto-merge succeeds 
      or manual resolution required. Merge history is captured in version timeline showing 
      which versions were combined and how conflicts were resolved.
```

**Writing tips:**
- **2-4 capabilities per feature** (don't over-segment)
- **Focus on WHAT and HOW**, not implementation details
- **Include user actions** ("Users can compare...", "System displays...")
- **Mention technical constraints** (storage, retention, audit)

---

### 5.6. Section 5: Scenarios (Top-Level)

**CRITICAL: Scenarios MUST be at top level** (`definition.scenarios`), NOT nested in contexts.

**Schema v2.0 scenario structure:**
```yaml
scenarios:
  - id: scn-001
    name: "{Scenario Name}"
    actor: "{Full Name}, {Role}"  # Use persona from value_propositions
    context: "{Where/when this happens}"
    trigger: "{What prompts the action}"
    action: "{Step-by-step user actions}"
    outcome: "{System response and results}"
    acceptance_criteria:
      - "{Specific testable criterion}"
      - "{Specific testable criterion}"
      - "{Specific testable criterion}"
```

**Example (Document Management):**
```yaml
scenarios:
  - id: scn-001
    name: Compare Document Versions Before Court Submission
    actor: "Jessica Thompson, Senior Associate"
    context: "Jessica is preparing final motion for court filing, needs to verify all partner feedback was incorporated"
    trigger: "Partner emails Jessica saying 'Make sure you have my edits from yesterday'"
    action: "Jessica opens motion document in case workspace, clicks 'Version History' showing v1-v11 timeline, selects v7 (before partner edits) and v11 (current), clicks 'Compare Versions' button, reviews side-by-side diff highlighting partner's 8 changes in green, confirms all edits present, clicks 'Export Latest Version' to download v11 for court filing"
    outcome: "System generates PDF with v11 content, includes version metadata footer ('Version 11, exported Jan 16 by Jessica Thompson'), Jessica submits to court confident she has authoritative version with complete edit history available for audit"
    acceptance_criteria:
      - "Version comparison shows all text changes with color-coded highlights (green=added, red=deleted)"
      - "Export includes version metadata footer identifying version number and export timestamp"
      - "System prevents export of outdated versions (v1-v10) with warning dialog requiring explicit confirmation"

  - id: scn-002
    name: Resolve Simultaneous Edit Conflicts
    actor: "Michael Chen, Compliance Director"
    context: "Two engineers editing same compliance document simultaneously during design review meeting"
    trigger: "Engineer A saves document while Engineer B has unsaved changes in same section"
    action: "System detects conflict, presents merge dialog showing Engineer A's changes (paragraph 3 updated) vs Engineer B's changes (paragraph 3 different update), Michael reviews both versions side-by-side, selects 'Merge manually', combines key points from both edits into new paragraph, clicks 'Save as v12', system creates new version preserving both prior versions (v11a, v11b) for audit trail"
    outcome: "Merged version v12 contains combined edits, both engineers receive notification that conflict was resolved by Michael with link to v12, audit log records manual merge decision for compliance review"
    acceptance_criteria:
      - "Conflict detection triggers within 5 seconds of save attempt"
      - "Merge dialog shows line-by-line comparison of conflicting sections"
      - "Audit log captures merge decision with timestamp and resolver identity"
      - "Prior versions (v11a, v11b) remain accessible for historical review"
```

**Writing tips:**
- **3-5 scenarios per feature** (cover major use cases)
- **Use persona names** from value_propositions section
- **Be specific:** "clicks 'Version History'" not "accesses versions"
- **Show outcomes:** What the user sees/gets as a result
- **Testable criteria:** Each criterion can be verified by QA

**Common mistakes:**
- ❌ Scenarios nested in contexts: `contexts[0].scenarios` (WRONG - must be top-level)
- ❌ Generic actors: "User compares versions" (need "Jessica Thompson")
- ❌ Missing context: Jumps straight to action without setting scene
- ❌ Vague acceptance criteria: "Works correctly" (need "Conflict detection triggers within 5 seconds")

---

### 5.7. Section 6: Contexts

**What contexts are:** UI screens/locations where capabilities are used.

**Schema requirements:**
- `key_interactions`: array with ≥1 item (cannot be empty)
- `data_displayed`: array with ≥1 item (cannot be empty)

**Structure:**
```yaml
contexts:
  - id: ctx-001
    name: "{Context Name}"
    description: |
      {2-3 paragraphs describing this UI context, what it shows, who accesses it, when/why}
    ui_location: "{Navigation path to reach this context}"
    access_control: "{Who can see this context}"
    user_journey: "{When users access this in their workflow}"
    information_architecture: "{How information is organized/structured}"
    key_interactions:
      - "{Specific user action 1}"
      - "{Specific user action 2}"
      - "{Specific user action 3}"
    data_displayed:
      - "{Data element 1 shown to user}"
      - "{Data element 2 shown to user}"
      - "{Data element 3 shown to user}"
```

**Example (Document Management):**
```yaml
contexts:
  - id: ctx-001
    name: Document Version History Panel
    description: |
      Dedicated panel showing complete version timeline for selected document. Accessed from 
      any document view via "Version History" button in toolbar. Panel displays as slide-out 
      overlay preserving document content visibility. Shows chronological list of all versions 
      with metadata (version number, timestamp, author, file size delta, change summary).
      
      Users can click any version to preview content in read-only mode, compare two selected 
      versions side-by-side, or restore prior version as new current version (creating new 
      version number, preserving rollback in audit trail). Panel includes search/filter options: 
      by author, by date range, by file size, by change magnitude.
      
      Version retention indicator shows compliance status: green checkmark for versions within 
      retention policy, yellow warning for versions approaching expiry, red alert for versions 
      that cannot be deleted due to regulatory hold. Administrators see additional controls for 
      retention policy configuration.
    ui_location: "Document view → Toolbar → 'Version History' button → Slide-out panel (right side)"
    access_control: "All users with document read permission; retention policy controls visible only to administrators"
    user_journey: "Accessed when users need to review change history, compare versions, or restore prior version"
    information_architecture: "Chronological timeline (newest first) with expandable version details, comparison tools in floating toolbar, retention status in version metadata badges"
    key_interactions:
      - "Click version row to preview that version in read-only mode"
      - "Select two versions (checkbox) then click 'Compare' to open diff view"
      - "Click 'Restore' on prior version to create new version with that content"
      - "Filter versions by author using dropdown selector"
      - "Search versions by change summary keywords"
    data_displayed:
      - "Version number (v1, v2, v3...) with visual indicator for current version"
      - "Timestamp (formatted as 'Jan 15, 2025 10:30 AM EST')"
      - "Author name with avatar image"
      - "File size delta ('+2.3 KB', '-150 bytes')"
      - "Change summary (auto-generated or author-provided description)"
      - "Retention status badge (green checkmark, yellow warning, red alert)"

  - id: ctx-002
    name: Version Comparison Diff View
    description: |
      Full-screen comparison interface showing two document versions side-by-side. Accessed from 
      Version History Panel after selecting two versions for comparison. Left pane shows "before" 
      version, right pane shows "after" version, synchronized scrolling maintains alignment. 
      Color-coded highlights show changes: green background for additions, red strikethrough for 
      deletions, yellow for modifications.
      
      Toolbar provides navigation controls: "Next change", "Previous change", "Jump to change #N". 
      Change counter shows "8 changes found" with current position "3 of 8". Users can toggle 
      between unified diff view (inline changes) and side-by-side view based on document complexity. 
      Export button generates PDF comparison report preserving color coding for external sharing.
    ui_location: "Version History Panel → Select two versions → Click 'Compare' → Full-screen diff view"
    access_control: "Same access control as source document (read permission required)"
    user_journey: "Accessed when users need detailed change analysis before approving edits or submitting externally"
    information_architecture: "Two-column layout (before/after) with synchronized scrolling, floating toolbar for navigation, change counter in top-right, export options in top-left"
    key_interactions:
      - "Click 'Next change' button to jump to next highlighted diff section"
      - "Toggle between side-by-side view and unified view using view selector"
      - "Export comparison as PDF with 'Export Report' button"
      - "Close diff view and return to Version History Panel using 'X' button"
    data_displayed:
      - "Version metadata header (v7 vs v11, timestamps, authors)"
      - "Color-coded change highlights (green=added, red=deleted, yellow=modified)"
      - "Change counter ('3 of 8 changes')"
      - "Synchronized document content in both panes"
      - "Navigation breadcrumb showing current section/page location"
```

**Writing tips:**
- **2-4 contexts per feature** (major UI touchpoints)
- **Rich descriptions:** Help implementers understand UX intent
- **Specific interactions:** Button names, gestures, navigation paths
- **Specific data:** Not just "document info" but "Version number (v1, v2, v3...)"

**Validation check:**
```bash
# Check that arrays aren't empty:
yq eval '.definition.contexts[0].key_interactions | length' fd-025-document-management.yaml
# Should show: 3-5 (not 0)

yq eval '.definition.contexts[0].data_displayed | length' fd-025-document-management.yaml
# Should show: 4-8 (not 0)
```

---

### 5.8. Section 7: Dependencies

**What dependencies show:** Relationships between features (requires, enables, complements).

**Schema requirement:** Each dependency needs `reason` field with ≥30 characters explaining WHY.

**Structure:**
```yaml
dependencies:
  requires:
    - id: fd-{number}
      name: "{Feature Name}"
      reason: "{30+ characters explaining WHY this dependency exists}"
  enables:
    - id: fd-{number}
      name: "{Feature Name}"
      reason: "{30+ characters explaining HOW this feature enables the other}"
  complements:
    - id: fd-{number}
      name: "{Feature Name}"
      reason: "{30+ characters explaining WHAT value the combination creates}"
```

**Example (Document Management):**
```yaml
dependencies:
  requires:
    - id: fd-002
      name: Knowledge Graph Engine
      reason: "Version metadata (author, timestamp, relationships) stored in knowledge graph for cross-document lineage tracking and compliance reporting. Without graph storage, version relationships cannot be queried efficiently for audit purposes."
      
    - id: fd-016
      name: Security Architecture & Authentication
      reason: "Version access control inherits from document permissions model. User identity required for version authorship attribution and audit trail integrity. SSO integration ensures version authors are traceable to corporate identity providers."
      
  enables:
    - id: fd-019
      name: Data Privacy & GDPR Compliance
      reason: "Version history with immutable audit trails provides proof of data lineage for GDPR Article 30 (records of processing activities). Right to erasure requests can preserve deletion evidence in version history while removing actual content."
      
    - id: fd-010
      name: Knowledge Base & Content Management
      reason: "Version control foundation allows knowledge base articles to track editorial changes, author contributions, and content evolution over time. Enables 'view history' and 'revert to prior revision' workflows for wiki-style collaboration."
      
  complements:
    - id: fd-009
      name: Team Collaboration & Communication
      reason: "Version notifications integrate with team communication channels (Slack, Teams) alerting collaborators when documents change. Comments on specific versions create threaded discussions tied to document evolution timeline."
```

**Writing tips:**
- **Be specific about WHY:** Not just "uses authentication" but "User identity required for version authorship attribution"
- **Show technical relationship:** How components interact at system level
- **Explain value of combination:** What becomes possible when features work together
- **30+ characters minimum:** Force yourself to explain, not just name the dependency

**Common mistakes:**
- ❌ Simple strings: `requires: ["fd-002"]` (need object with id/name/reason)
- ❌ Short reason: "Needs auth" (15 chars, need 30+)
- ❌ Vague reason: "Uses the graph" (lacks technical specifics)
- ❌ Wrong direction: Listing what this feature requires vs what requires this feature

**Validation check:**
```bash
# Check dependency reason lengths:
yq eval '.dependencies.requires[0].reason | length' fd-025-document-management.yaml
# Should show: 150-300 (way above 30 minimum)
```

---

### 5.9. Section 8: Feature Maturity (Optional)

**NEW in EPF v2.8.0 (Schema v2.1.0)** - Track capability-level maturity within features.

**What feature maturity is:** An optional section that tracks the maturity stage of each capability within a feature, using the same 4-stage vocabulary as Value Model Maturity (VMM).

**Why it matters:**
- See which capabilities are proven vs hypothetical at a glance
- Track which KR execution advanced each capability
- Make informed decisions about scaling vs continued validation
- Provide practitioner-friendly visibility without duplicating VMM

**Schema structure:**
```yaml
feature_maturity:
  overall_stage: "hypothetical"  # hypothetical | emerging | proven | scaled
  capability_maturity:
    - capability_id: "{cap-id from capabilities section}"
      stage: "hypothetical"  # Same 4 stages as VMM
      delivered_by_kr: "{kr-id}"  # Optional: which KR advanced this
      evidence: "{Description of evidence supporting this stage}"
  last_advanced_by_kr: "{kr-id}"  # Most recent KR that changed maturity
  last_assessment_date: "YYYY-MM-DD"  # When maturity was last assessed
```

**Stage definitions (same as VMM):**
- **hypothetical**: Design/concept phase, no implementation evidence
- **emerging**: Initial implementation, early validation signals
- **proven**: Validated with real users, consistent evidence of value
- **scaled**: Deployed at scale, operationalized for growth

**Example (Document Management):**
```yaml
feature_maturity:
  overall_stage: "emerging"
  capability_maturity:
    - capability_id: "cap-001"  # Automated Version Tracking
      stage: "proven"
      delivered_by_kr: "kr-p-003"
      evidence: "Version tracking validated with 847 customers, 99.2% success rate for 3 consecutive months"
    - capability_id: "cap-002"  # Visual Diff and Comparison
      stage: "emerging"
      delivered_by_kr: "kr-p-005"
      evidence: "Diff view released to beta users, 78% report 'very helpful' in feedback survey"
    - capability_id: "cap-003"  # Conflict Resolution and Merging
      stage: "hypothetical"
      evidence: "Design complete, awaiting implementation in Q2 sprint"
  last_advanced_by_kr: "kr-p-005"
  last_assessment_date: "2025-01-18"
```

**The minimum rule:** A feature's `overall_stage` equals its **least mature capability**:
- In the example above: one capability is "hypothetical" → feature is "hypothetical"
- This ensures honest assessment: features can't claim maturity their capabilities don't support

**When to use feature_maturity:**
- ✅ Features in active development (track progress across roadmap cycles)
- ✅ Features being considered for scaling (verify all capabilities are ready)
- ✅ Features with capabilities at different maturity levels (mixed portfolio)
- ⚠️ Optional for new features (start with all "hypothetical")
- ⚠️ Can be omitted for well-established features where all capabilities are clearly "scaled"

**When to update:**
1. **After KR completion**: KR advances a capability → update `delivered_by_kr` and `stage`
2. **During calibration**: AIM phase reveals evidence → adjust stage claims
3. **Before scaling decisions**: Verify all capabilities meet target maturity
4. **Periodic assessment**: Update `last_assessment_date` during reviews

**Relationship to Value Model Maturity:**
- Feature Maturity **does not replace** VMM (VMM remains authoritative)
- Features `contributes_to` Value Model paths via `strategic_context`
- Feature Maturity shows progress on those contributions at capability level
- Both use same 4-stage vocabulary for consistency

**Writing tips:**
- **Match capability_id to capabilities section**: Use exact IDs from `definition.capabilities`
- **Be honest about stages**: "hypothetical" is a valid starting point
- **Include specific evidence**: Not just "users like it" but "78% report 'very helpful'"
- **Link to KRs**: Show how roadmap execution advances maturity

**Validation note:** Feature maturity is **optional** and not validated by schema. However, if present:
- `overall_stage` must be one of: hypothetical, emerging, proven, scaled
- `capability_maturity` array should reference valid capability IDs from the feature
- `last_assessment_date` should be ISO 8601 format (YYYY-MM-DD)

**See also:**
- [VALUE_MODEL_MATURITY_GUIDE.md](VALUE_MODEL_MATURITY_GUIDE.md) - Full VMM documentation and how feature maturity relates
- [fd-002-knowledge-graph-engine.yaml](../../definitions/product/01-technical/fd-002-knowledge-graph-engine.yaml) - Example with feature_maturity populated

---

## 6. Validation Workflow

**After completing all sections, run validation:**

```bash
# Validate your feature definition
./scripts/validate-feature-quality.sh fd-025-document-management.yaml
```

**What the validator checks:**

1. **Persona Count:** Exactly 4 personas (no more, no less)
2. **Narrative Richness:** All 12 narratives ≥200 characters (3 per persona × 4 personas)
3. **Scenario Placement:** Scenarios at top level (`definition.scenarios`), not nested
4. **Scenario Structure:** All 8 required fields present (id, name, actor, context, trigger, action, outcome, acceptance_criteria)
5. **Context Arrays:** `key_interactions` and `data_displayed` arrays not empty
6. **Dependency Richness:** All dependency reasons ≥30 characters

**Success output:**
```
============================================================
  EPF Feature Definition Quality Validator v2.0
============================================================

Validating: fd-025-document-management.yaml

✓ Persona count: Found 4 personas (exactly 4 required)
✓ Narrative richness: Jessica Thompson.current_situation has 847 chars (≥200)
✓ Narrative richness: Jessica Thompson.transformation_moment has 692 chars (≥200)
✓ Narrative richness: Jessica Thompson.emotional_resolution has 731 chars (≥200)
✓ Narrative richness: Michael Chen.current_situation has 823 chars (≥200)
... (12 narrative checks total)
✓ Scenario placement: Top-level structure (correct)
✓ Scenario structure: scn-001 has all required fields
✓ Scenario structure: scn-002 has all required fields
✓ Context required fields: ctx-001 has key_interactions array (5 items)
✓ Context required fields: ctx-001 has data_displayed array (6 items)
✓ Context required fields: ctx-002 has key_interactions array (4 items)
✓ Context required fields: ctx-002 has data_displayed array (5 items)
✓ Dependency richness: fd-002 (requires): Reason has 234 chars (≥30)
✓ Dependency richness: fd-016 (requires): Reason has 187 chars (≥30)
✓ Dependency richness: fd-019 (enables): Reason has 243 chars (≥30)

============================================================
  Validation Result: PASSED (24 checks, 0 errors)
============================================================
```

**Failure output (example):**
```
✗ Narrative richness: Jessica Thompson.current_situation has only 87 chars (need ≥200)
   Add more specific details: metrics, team size, workflows, time costs
   Schema v2.0 requires 200+ character narratives for quality

✗ Scenario placement: Scenarios nested in contexts (wrong)
   Scenarios must be top-level: definition.scenarios (not contexts[X].scenarios)
   Link scenarios to contexts using 'context' field in each scenario

✗ Dependency richness: fd-002 (requires): Reason has only 18 chars (need ≥30)
   Explain WHY dependency exists, not just WHAT it is
   Good: 'User identity required for version authorship attribution'
   Bad: 'Uses authentication'

============================================================
  Validation Result: FAILED (3 errors found)
============================================================
```

**Iterative validation workflow:**

1. **Run validation:** `./scripts/validate-feature-quality.sh fd-025-document-management.yaml`
2. **Read errors carefully:** Each error includes fix guidance
3. **Fix one category at a time:** Start with narrative richness (most common)
4. **Re-validate:** Run script again after fixes
5. **Repeat until 0 errors:** Don't commit until passing

---

## 7. Troubleshooting Guide

### Error: "Persona count: Found 3 personas, expected exactly 4"

**Cause:** You have fewer or more than 4 personas in `value_propositions` array.

**Fix:**
```yaml
# WRONG: Only 3 personas
value_propositions:
  - persona: "Jessica Thompson..."
  - persona: "Michael Chen..."
  - persona: "Admin User..."  # Generic, not rich

# CORRECT: Exactly 4 personas with distinct roles
value_propositions:
  - persona: "Jessica Thompson, Senior Associate..."  # Operational user
  - persona: "Michael Chen, Compliance Director..."  # Compliance perspective
  - persona: "Rachel Garcia, IT Administrator..."     # System admin perspective
  - persona: "David Park, Managing Partner..."        # Executive/business perspective
```

**Why 4?** Schema v2.0 requires exactly 4 to ensure feature value is examined from multiple stakeholder perspectives (operational, compliance, administrative, strategic).

---

### Error: "Narrative richness: {persona}.{field} has only 87 chars (need ≥200)"

**Cause:** Your persona narrative is too brief - lacks specific details.

**Fix - Add these elements:**
- **Time metrics:** "spends 3-4 hours per week" not "spends time"
- **Team context:** "coordinates with 6 attorneys" not "works with team"
- **Specific tools:** "email attachments and Dropbox folders" not "various tools"
- **Failure consequences:** "cost Jessica a weekend rewriting" not "caused problems"
- **Emotional impact:** "billable time suffers" not "is frustrated"

**Before (87 chars):**
```yaml
current_situation: |
  Jessica tracks documents manually and sometimes submits wrong versions causing problems.
```

**After (847 chars):**
```yaml
current_situation: |
  Jessica manages document coordination for 8-12 active litigation cases, tracking 200-400 
  documents per case across depositions, motions, and discovery. She spends 3-4 hours per week 
  hunting for "the latest version" of critical documents because her team of 6 attorneys edit 
  files simultaneously using email attachments and Dropbox folders. Last month, she submitted 
  an outdated motion to court (version 7 instead of version 11) because a partner's edits were 
  in a separate email thread. The error required emergency filing corrections, embarrassed the 
  firm, and cost Jessica a weekend rewriting the motion. She maintains manual version tracking 
  spreadsheets but can't keep up when cases move quickly. Her billable time suffers because 
  version hunting is non-billable administrative work.
```

---

### Error: "Scenario placement: Scenarios nested in contexts (wrong)"

**Cause:** You put scenarios inside contexts array (v1.x pattern) instead of top-level (v2.0 requirement).

**Fix:**
```yaml
# WRONG: Scenarios nested in contexts
definition:
  contexts:
    - id: ctx-001
      name: "Dashboard"
      scenarios:  # ← WRONG LOCATION
        - actor: "User"
          action: "Does something"

# CORRECT: Scenarios at top level
definition:
  scenarios:  # ← TOP LEVEL (same level as contexts, capabilities)
    - id: scn-001
      name: "Scenario Name"
      actor: "Jessica Thompson, Senior Associate"
      context: "Dashboard context description"  # ← Link to context via description
      trigger: "User needs to..."
      action: "User clicks..."
      outcome: "System responds..."
      acceptance_criteria:
        - "Criterion 1"
        - "Criterion 2"
  contexts:
    - id: ctx-001
      name: "Dashboard"
      # NO scenarios array here
```

**Why top-level?** v2.0 separates scenario (user journey) from context (UI location) to support scenarios spanning multiple contexts.

---

### Error: "Context ctx-001: Missing or empty key_interactions array"

**Cause:** Your context is missing `key_interactions` field or the array is empty.

**Fix:**
```yaml
# WRONG: Missing key_interactions
contexts:
  - id: ctx-001
    name: "Dashboard"
    description: "User dashboard showing documents"
    # key_interactions missing

# WRONG: Empty key_interactions
contexts:
  - id: ctx-001
    name: "Dashboard"
    key_interactions: []  # Empty array

# CORRECT: At least 1 interaction
contexts:
  - id: ctx-001
    name: "Dashboard"
    key_interactions:
      - "Click 'Version History' button to open version panel"
      - "Select document to view details"
      - "Filter documents by date range"
```

**Same applies to `data_displayed` array** - must have at least 1 item.

---

### Error: "Dependency fd-002 (requires): Reason has only 18 chars (need ≥30)"

**Cause:** Your dependency reason is too vague - doesn't explain WHY.

**Fix:**
```yaml
# WRONG: Too brief (18 chars)
dependencies:
  requires:
    - id: fd-002
      name: "Knowledge Graph"
      reason: "Uses the graph"  # ← Only 18 chars, no explanation

# CORRECT: Explains WHY (234 chars)
dependencies:
  requires:
    - id: fd-002
      name: "Knowledge Graph Engine"
      reason: "Version metadata (author, timestamp, relationships) stored in knowledge graph for cross-document lineage tracking and compliance reporting. Without graph storage, version relationships cannot be queried efficiently for audit purposes."
```

**Pattern:** "{WHAT is stored/used} → {WHY it's necessary} → {CONSEQUENCE if missing}"

---

### Common YAML Syntax Errors

**Error: Parsing fails with "unexpected indent"**

**Cause:** Mixed spaces/tabs or inconsistent indentation.

**Fix:**
- Use spaces only (never tabs)
- Consistent 2-space indentation
- Align list items (`-`) at same level

```yaml
# WRONG: Inconsistent indentation
scenarios:
  - id: scn-001
  name: "Wrong"  # Should be indented 2 more spaces

# CORRECT: Consistent 2-space indent
scenarios:
  - id: scn-001
    name: "Correct"
    actor: "Jessica Thompson"
```

---

**Error: String value contains special characters**

**Cause:** YAML interprets `:`, `{`, `}`, `[`, `]` as syntax unless quoted.

**Fix:**
```yaml
# WRONG: Unquoted colon
name: Status: Active  # Fails to parse

# CORRECT: Quoted when contains special chars
name: "Status: Active"

# CORRECT: Or use pipe for multi-line
description: |
  This description can contain: colons, {braces}, and [brackets]
  without issues because pipe syntax treats it as literal string.
```

---

## 8. Quality Checklist

**Before committing, verify:**

### Schema Compliance
- [ ] **Exactly 4 personas** (not 3, not 5)
- [ ] **All 12 narratives ≥200 characters** (3 per persona × 4 personas)
- [ ] **Scenarios at top level** (`definition.scenarios`, not nested)
- [ ] **Scenarios have all 8 fields** (id, name, actor, context, trigger, action, outcome, acceptance_criteria)
- [ ] **Contexts have non-empty arrays** (key_interactions ≥1 item, data_displayed ≥1 item)
- [ ] **Dependencies have reasons ≥30 chars** (explain WHY, not just WHAT)

### Content Quality
- [ ] **Specific persona names** ("Jessica Thompson" not "User")
- [ ] **Quantified metrics** ("3-4 hours per week" not "lots of time")
- [ ] **Real organizational context** (company names, team sizes, tools used)
- [ ] **Testable acceptance criteria** (specific, measurable conditions)
- [ ] **Technical specificity** (button names, UI paths, data formats)

### Validation Passing
- [ ] **Run validation script:** `./scripts/validate-feature-quality.sh {your-file}.yaml`
- [ ] **0 errors reported** (24+ checks passed)
- [ ] **No warnings about brief content** (all narratives well above minimums)

### Ready for Commit
- [ ] **File naming correct:** `fd-{number}-{slug}.yaml` matches id and slug in file
- [ ] **Status appropriate:** `draft` for new features, `ready` after review
- [ ] **Cross-references valid:** Dependency IDs exist in feature corpus
- [ ] **YAML syntax clean:** No tabs, consistent indentation, proper quoting

---

## 9. Real Example Analysis

**Let's analyze fd-007 (Organization & Workspace Management) from EPF corpus:**

**What makes it pass validation:**

1. **Exactly 4 personas:**
   - IT Administrator (system management perspective)
   - Team Lead (coordination perspective)
   - Compliance Officer (governance perspective)
   - Executive Sponsor (business value perspective)

2. **Rich narratives (all 200+ chars):**
   - Current situation: 300-400 chars with specific metrics
   - Transformation moment: 350-500 chars showing detailed workflow
   - Emotional resolution: 300-400 chars describing long-term impact

3. **Top-level scenarios:**
   - Located at `definition.scenarios` (not nested)
   - All 8 required fields present (id, name, actor, context, trigger, action, outcome, acceptance_criteria)
   - Specific acceptance criteria (testable, measurable)

4. **Complete contexts:**
   - `key_interactions`: 5-7 items per context (well above minimum 1)
   - `data_displayed`: 6-10 items per context (well above minimum 1)
   - Specific UI elements ("click 'Create Team' button")

5. **Rich dependencies:**
   - Reason fields: 150-250 chars (5-8× the 30-char minimum)
   - Explains technical relationships and value creation
   - Shows WHY dependency exists, not just WHAT it is

**Key pattern to copy:** fd-007 uses consistent structure:
- Problem → Solution → Outcome flow in personas
- Specific names and metrics throughout
- UI specificity (button names, navigation paths)
- Testable criteria (measurable conditions)

---

## 10. Additional Resources

**Core Documentation:**
- **Template:** `definitions/product/_template/feature_definition_template.yaml`
- **Schema:** `schemas/feature_definition_schema.json` (861 lines, authoritative source)
- **Wizard:** `wizards/feature_definition.wizard.md` (step-by-step guidance)
- **Examples:** `definitions/product/` directory (21 validated examples)
- **Validator:** `scripts/validate-feature-quality.sh` (quality enforcement)

**Workflow:**
1. Read schema section before writing each section
2. Use validated examples as templates
3. Validate early and often (after each major section)
4. Fix errors systematically (one category at a time)
5. Commit only after achieving 0 errors

**Why this matters:** Feature definitions are the source of truth for implementation. High-quality definitions reduce:
- Ambiguity (developers know what to build)
- Rework (fewer clarification questions)
- Testing gaps (acceptance criteria guide QA)
- Documentation debt (feature definition serves as spec)

**Time investment vs return:**
- First feature: 90-120 minutes
- Subsequent features: 45-60 minutes (pattern familiarity)
- Time saved in implementation: 5-10 hours per feature (fewer clarifications)
- Quality improvement: Measurable via validation metrics

---

## Document Complete

This guide has covered:
✅ Complete walkthrough (metadata → strategy → personas → capabilities → scenarios → contexts → dependencies)  
✅ Validation workflow (run validator, fix errors, achieve 0 errors)  
✅ Troubleshooting guide (common errors with specific fixes)  
✅ Quality checklist (pre-commit verification)  
✅ Real example analysis (patterns from validated features)  

**Next steps:**
1. Copy template to your instance
2. Follow sections 5.2-5.8 step-by-step
3. Validate after each major section
4. Commit after achieving 0 validation errors

**Questions or issues?** Refer to:
- Schema: `schemas/feature_definition_schema.json` (structure reference)
- Examples: `definitions/product/02-business/fd-007-organization-workspace-management.yaml` (quality patterns)
- Wizard: `wizards/feature_definition.wizard.md` (creation guidance)

