## ADDED Requirements

### Requirement: Canonical EPF Evidence Schema

The canonical EPF framework SHALL define an `evidence_item_schema.json` for
structured evidence intake. The schema SHALL use freeform tags instead of fixed
type enums, enabling organic vocabulary growth as diverse evidence sources connect.

The evidence schema SHALL require: `source` (object with `name` and `type` as
freeform strings), `collected_at` (ISO timestamp), and `content` (freeform object
for the actual evidence data).

The evidence schema SHALL optionally support: `tags` (string array for open
classification), `summary` (human or LLM-generated abstract), and
`linked_artifacts` (array of artifact keys this evidence relates to).

#### Scenario: Evidence with diverse tags validates

- **WHEN** an evidence item has tags `["sales", "lost-deal", "competitor:acme"]`
- **AND** all required fields (source, collected_at, content) are present
- **THEN** the evidence passes schema validation
- **AND** no tag vocabulary is enforced by the schema

#### Scenario: Evidence without tags validates

- **WHEN** an evidence item has no tags field
- **AND** all required fields are present
- **THEN** the evidence passes schema validation
- **AND** classification can be added later via update

#### Scenario: Evidence with arbitrary content validates

- **WHEN** an evidence item has content `{"funnel_stage": "onboarding", "drop_rate": 0.42, "cohort": "q1-2026"}`
- **THEN** the content field passes validation (freeform object, no inner schema)

### Requirement: Evidence Ingestion Pipeline

The system SHALL support ingestion of external evidence into the strategy graph as
first-class artifacts stored in `strategy_artifacts` with `artifact_type='evidence'`,
participating in the mutation ledger, version snapshots, Memory graph, and ripple
engine.

Evidence SHALL follow a three-stage pipeline: intake (schema-validated storage),
classification & linking (relationship creation to strategy artifacts), and
consumption (inclusion in AIM assessments with processing state tracking).

#### Scenario: Ingest evidence via MCP

- **WHEN** an agent calls `ingest_evidence` with a valid evidence payload
- **THEN** the evidence is schema-validated against `evidence_item_schema.json`
- **AND** stored as a `strategy_artifact` with `artifact_type='evidence'` and
  `status='active'`
- **AND** enqueued for Memory ingestion
- **AND** the response includes the evidence artifact key

#### Scenario: Invalid evidence rejected

- **WHEN** an agent calls `ingest_evidence` with an invalid payload (missing
  required fields: source, collected_at, or content)
- **THEN** the system returns a 422 validation error with schema violation details

#### Scenario: Link evidence to strategy artifact

- **WHEN** an agent calls `link_evidence` with an evidence key, a target artifact
  key (e.g., an assumption ID or OKR ID), and a relationship type
- **THEN** a `strategy_relationship` edge is created linking the evidence to the
  target artifact
- **AND** the linked artifact is available for grouped evidence retrieval

#### Scenario: Update evidence classification post-intake

- **WHEN** an agent calls `update_evidence` to add tags or a summary to an
  existing evidence item
- **THEN** the evidence artifact is updated via a staged mutation
- **AND** the tags are available for filtering in `list_evidence`

#### Scenario: List evidence with filters

- **WHEN** an agent calls `list_evidence` with optional filters (tags, source name,
  processing status, date range, linked artifact key)
- **THEN** the system returns matching evidence items in reverse chronological order

#### Scenario: Evidence appears in semantic search

- **WHEN** evidence has been ingested and Memory ingestion completes
- **AND** an agent calls `search_strategy` with a query related to the evidence
  content
- **THEN** the evidence appears in search results alongside other strategy artifacts

### Requirement: Evidence-Based Trigger Evaluation

The system SHALL support an `evidence_threshold` trigger type that fires when the
count of unprocessed evidence items exceeds a configurable threshold, with optional
tag-based filtering.

#### Scenario: Evidence threshold trigger fires

- **WHEN** an instance has 15 unprocessed evidence items
- **AND** the evidence threshold is configured at 10 with no tag filter
- **THEN** the trigger evaluates as fired with reason "evidence" and a message
  indicating the count and threshold

#### Scenario: Tag-filtered evidence threshold

- **WHEN** an instance has 12 unprocessed evidence items tagged "competitor" and
  8 tagged "user_feedback"
- **AND** the evidence threshold is configured at 10 with tag filter `["competitor"]`
- **THEN** the trigger fires because the competitor-tagged count (12) exceeds the
  threshold
- **AND** the user_feedback items are not counted toward this trigger

#### Scenario: Evidence threshold not reached

- **WHEN** an instance has 5 unprocessed evidence items
- **AND** the evidence threshold is configured at 10
- **THEN** the trigger does not fire for the evidence reason
- **AND** other trigger types (time, signals) are still evaluated independently

### Requirement: Evidence Consumption in AIM Assessment

The system SHALL include unprocessed evidence in AIM assessment drafting, grouping
evidence by linked artifact for contextual relevance. Consumed evidence SHALL be
marked as processed when the assessment batch is committed.

The `assessment_report_schema.json` SHALL be extended with an optional
`evidence_summary` section that references consumed evidence items with their
source, tags, and summaries.

#### Scenario: Assessment includes linked evidence

- **WHEN** `draft_aim_assessment` runs for an instance with unprocessed evidence
- **AND** some evidence items are linked to specific OKRs via relationships
- **THEN** each OKR assessment in the draft includes the evidence linked to that
  OKR as contextual input for the LLM
- **AND** the assessment draft includes an `evidence_summary` section referencing
  all consumed evidence

#### Scenario: Assessment includes unlinked evidence

- **WHEN** `draft_aim_assessment` runs for an instance with unprocessed evidence
  that is not linked to any specific artifact
- **THEN** the unlinked evidence is included as general strategic context in the
  LLM prompt alongside ripple signals and LRA narrative

#### Scenario: Evidence marked processed on commit

- **WHEN** an assessment draft batch is committed
- **THEN** all evidence items referenced in the assessment's `evidence_summary`
  are marked with `status='processed'`
- **AND** the processed evidence remains searchable but does not re-trigger
  evidence threshold evaluation

#### Scenario: Assessment without evidence (backward compatible)

- **WHEN** `draft_aim_assessment` runs for an instance with no evidence items
- **THEN** the assessment draft is produced using only roadmap OKRs, prior
  assessments, LRA evolution log, and ripple signals (existing behavior unchanged)
- **AND** no `evidence_summary` section is included in the draft

### Requirement: Cycle Proposal Auto-Generation

The system SHALL auto-generate cycle proposals when the heartbeat detects a fired
trigger, provided no active AIM cycle and no pending proposal exist for the instance.

A cycle proposal SHALL contain: trigger reason, evidence summary (count by type),
signal summary (count by severity), time since last assessment, and recommended
action.

Proposals SHALL have lifecycle statuses: pending, approved, deferred, expired.

#### Scenario: Heartbeat creates cycle proposal

- **WHEN** the heartbeat detects a time-based trigger fired for an instance
- **AND** no AIM cycle is currently active for that instance
- **AND** no pending cycle proposal exists for that instance
- **THEN** a cycle proposal is created with status "pending" containing the trigger
  context

#### Scenario: Approve proposal starts cycle

- **WHEN** a user or agent calls `approve_cycle_proposal` for a pending proposal
- **THEN** the proposal status is set to "approved"
- **AND** an AIM cycle is automatically started for the instance via the orchestration
  engine

#### Scenario: Defer proposal with snooze

- **WHEN** a user or agent calls `defer_cycle_proposal` with a snooze period
- **THEN** the proposal status is set to "deferred" with a snooze_until timestamp
- **AND** the heartbeat does not create new proposals for that instance until the
  snooze period expires

#### Scenario: No duplicate proposals

- **WHEN** a heartbeat trigger fires for an instance that already has a pending proposal
- **THEN** no new proposal is created

### Requirement: Enriched Calibration Feedback

The system SHALL generate substantive READY artifact amendments during
`apply_aim_calibration`, using evidence data and structured LLM output to produce
concrete changes rather than structural flags only.

Enriched amendments SHALL include: roadmap KR target adjustments, LRA evolution log
entries, new assumption hypotheses, and feature priority suggestions.

All amendments SHALL be staged as a single batch for human review.

#### Scenario: Enriched persevere calibration

- **WHEN** `apply_aim_calibration` runs for a committed calibration with decision
  "persevere"
- **AND** evidence data exists for the instance
- **THEN** the staged batch includes: roadmap cycle_status=completed, LRA evolution
  log entry with cycle summary, and any KR target adjustments based on evidence

#### Scenario: Enriched pivot calibration

- **WHEN** `apply_aim_calibration` runs for a committed calibration with decision
  "pivot"
- **THEN** the staged batch includes: strategy_formula updates with specific strategic
  bet modifications (not just review flags), new assumptions derived from invalidated
  ones, and feature priority adjustments based on value path coverage analysis

#### Scenario: Amendments pass schema validation

- **WHEN** enriched calibration generates READY artifact amendments
- **THEN** every amended artifact payload passes its EPF JSON Schema validation
