# Example: Extraction from test_data/meeting_1.md

This example uses the transcript at `docs/spec/test_data/meeting_1.md` to produce structured objects (Meeting, Decisions, Requirements, ActionItems, Questions, Risks) with evidence links to chunks.

## Meeting Metadata
```json
{
  "title": "21st + LegalPlant product packages & prioritization — 2025/08/18 11:00 CEST",
  "type": "Meeting",
  "provider": "transcript-file",
  "uri": "docs/spec/test_data/meeting_1.md",
  "started_at": "2025-08-18T09:00:00Z",
  "ended_at": "2025-08-18T09:57:02Z",
  "participants": [
    {"name":"Maciej Kucharz"},
    {"name":"Nikolai Fasting"},
    {"name":"Robert Kopaczewski"}
  ],
  "agenda": [
    "AI-assisted specification and knowledge base",
    "Spec repo + PR workflow",
    "Priorities for ECIT and 21st",
    "Compliance calendar refactor",
    "Document types scope (agenda, protocol)",
    "Directory listing and person graph classification",
    "LegalPlant roadmap and partnerships"
  ],
  "summary": "Team discussed building an AI-assisted spec and knowledge base. Agreed to keep spec as Markdown in a repo and use workflows to propose PRs. Prioritized ECIT items and the compliance calendar refactor; short-term scope: agenda and protocol. Considered directory/person graph improvements and LegalPlant partnerships, with resource split across initiatives."
}
```

## Chunks (derived from transcript sections)
```json
[
  {
    "id": "m1_chunk_1",
    "document_id": "meeting_1",
    "section_path": ["Transcript","Spec via AI"],
    "timecodes": {"start": "00:00:00","end": "00:12:00"},
    "text": "…translate product model into technical specifications with AI… keep spec in repo, human QC…"
  },
  {
    "id": "m1_chunk_2",
    "document_id": "meeting_1",
    "section_path": ["Transcript","Spec repo + PR workflow"],
    "timecodes": {"start": "00:12:00","end": "00:22:00"},
  "text": "…spec as Markdown in a repository… workflow (LangChain service) drops info and produces a pull request to the spec… maintain history in git…"
  },
  {
    "id": "m1_chunk_3",
    "document_id": "meeting_1",
    "section_path": ["Transcript","ECIT priorities & scope"],
    "timecodes": {"start": "00:25:00","end": "00:35:00"},
    "text": "…limit document types to agenda and protocol for now… compliance calendar is high priority… directory listing and person graph classification… support non‑Norwegian orgs… exports…"
  },
  {
    "id": "m1_chunk_4",
    "document_id": "meeting_1",
    "section_path": ["Transcript","LegalPlant partnerships"],
    "timecodes": {"start": "00:45:00","end": "00:55:00"},
    "text": "…LegalPlant sales via partnerships (Saga)… share frameworks with 21st… allocate ~20% resources… seek 5–10 pilot customers…"
  }
]
```

## Extracted Objects

### Decisions (ADR)
```json
[
  {
    "title": "Keep canonical spec as Markdown repo with PR-based updates",
    "type": "Decision",
    "status": "accepted",
    "context": "Desire for supervised, versioned, auditable spec with AI assistance",
    "options": ["Markdown repo + PRs","Database-only","Wikis"],
    "chosen_option": "Markdown repo + PRs",
    "consequences": "Git history for changes; easy PR reviews; enables LLM reviewer",
    "evidence": [{"chunk_id":"m1_chunk_2","role":"rationale","confidence":0.88}],
    "adm_phase": "A",
    "architecture_domain": "business"
  },
  {
    "title": "Prioritize ECIT needs and compliance calendar refactor",
    "type": "Decision",
    "status": "accepted",
    "context": "Enterprise onboarding and governance features drive roadmap",
    "options": ["Focus ECIT","Split with long-tail"],
    "chosen_option": "Focus ECIT",
    "consequences": "Faster value for ECIT; defers long-tail features",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"source","confidence":0.8}],
    "adm_phase": "E",
    "architecture_domain": "business"
  },
  {
    "title": "Limit auto-handled document types to agenda and protocol (short term)",
    "type": "Decision",
    "status": "accepted",
    "context": "Reduce scope to deliver quicker for ECIT",
    "options": ["Only agenda+protocol","Many document types"],
    "chosen_option": "Only agenda+protocol",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"source","confidence":0.77}],
    "adm_phase": "E",
    "architecture_domain": "application"
  },
  {
    "title": "Treat 21st and LegalPlant as sister solutions with shared framework",
    "type": "Decision",
    "status": "accepted",
    "context": "Cross-pollination of AI/governance features",
    "options": ["Separate stacks","Shared framework"],
    "chosen_option": "Shared framework",
    "evidence": [{"chunk_id":"m1_chunk_4","role":"source","confidence":0.76}],
    "adm_phase": "E",
    "architecture_domain": "application"
  },
  {
    "title": "Allocate ~20% resources to LegalPlant initiatives",
    "type": "Decision",
    "status": "accepted",
    "context": "Parallel progress with shared benefits",
    "options": ["0%","~20%",">50%"],
    "chosen_option": "~20%",
    "evidence": [{"chunk_id":"m1_chunk_4","role":"source","confidence":0.73}],
    "adm_phase": "E",
    "architecture_domain": "business"
  }
]
```

### Requirement Candidates (FR/NFR/Constraint)
```json
[
  {
    "title": "Spec updates proposed via workflow-generated PRs",
    "type": "Requirement",
    "category": "FR",
    "status": "proposed",
    "rationale": "Ensure supervised edits and auditability",
    "fit_criterion": "PRs created for 95% of automated updates; reviewers can accept/reject",
    "evidence": [{"chunk_id":"m1_chunk_2","role":"source","confidence":0.83}],
    "adm_phase": "B",
    "architecture_domain": "application"
  },
  {
    "title": "Knowledge base maintains versioned history of spec changes",
    "type": "Requirement",
    "category": "FR",
    "status": "proposed",
    "rationale": "History of changes is itself useful context",
    "fit_criterion": "Every change references prior version and rationale",
    "evidence": [{"chunk_id":"m1_chunk_2","role":"rationale","confidence":0.8}],
    "adm_phase": "A",
    "architecture_domain": "application"
  },
  {
    "title": "Compliance calendar as a first-class data object",
    "type": "Requirement",
    "category": "FR",
    "status": "proposed",
    "rationale": "Many features depend on it; knowledge source",
    "fit_criterion": "CRUD APIs, templates, and customization at group level",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"source","confidence":0.82}],
    "adm_phase": "B",
    "architecture_domain": "business"
  },
  {
    "title": "Support governance for non-Norwegian organizations",
    "type": "Requirement",
    "category": "FR",
    "status": "proposed",
    "rationale": "ECIT manages foreign subsidiaries",
    "fit_criterion": "Create board workflows without Norwegian registry integrations",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"source","confidence":0.72}],
    "adm_phase": "B",
    "architecture_domain": "business"
  },
  {
    "title": "Directory listing improvements with person graph classification",
    "type": "Requirement",
    "category": "FR",
    "status": "proposed",
    "fit_criterion": "Navigate by classification; people directory available",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"source","confidence":0.74}],
    "adm_phase": "B",
    "architecture_domain": "application"
  }
]
```

### Action Items
```json
[
  {
    "title": "Prototype LangChain workflow to create PRs to spec repo from meeting inputs",
    "type": "ActionItem",
    "owner": "Maciej Kucharz",
    "status": "open",
    "evidence": [{"chunk_id":"m1_chunk_2","role":"context","confidence":0.7}]
  },
  {
    "title": "Follow up with legal AI company (Saga/partner) on integration",
    "type": "ActionItem",
    "owner": "Nikolai Fasting",
    "status": "open",
    "evidence": [{"chunk_id":"m1_chunk_4","role":"source","confidence":0.71}]
  },
  {
    "title": "Start person graph classification mechanism",
    "type": "ActionItem",
    "owner": "Robert Kopaczewski",
    "status": "open",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"source","confidence":0.78}]
  },
  {
    "title": "Define and commit spec template; have model generate v1 spec",
    "type": "ActionItem",
    "owner": "Nikolai Fasting",
    "status": "open",
    "evidence": [{"chunk_id":"m1_chunk_1","role":"context","confidence":0.69}]
  }
]
```

### Questions
```json
[
  {
    "title": "Which document types should be auto-processed beyond agenda and protocol?",
    "type": "Question",
    "status": "open",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"source","confidence":0.7}]
  },
  {
    "title": "Balance enterprise (ECIT) focus vs long-tail acquisition?",
    "type": "Question",
    "status": "open",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"context","confidence":0.65}]
  },
  {
    "title": "What is the first concrete usage of LangChain pipeline to launch?",
    "type": "Question",
    "status": "open",
    "evidence": [{"chunk_id":"m1_chunk_2","role":"context","confidence":0.64}]
  }
]
```

### Risks
```json
[
  {
    "title": "Dependence on ECIT collaboration to realize roadmap",
    "type": "Risk",
    "likelihood": 3,
    "impact": 4,
    "mitigation": "Maintain minimal viable scope (agenda/protocol); frequent checkpoints",
    "evidence": [{"chunk_id":"m1_chunk_3","role":"rationale","confidence":0.62}]
  },
  {
    "title": "Resource split across 21st and LegalPlant reduces velocity",
    "type": "Risk",
    "likelihood": 3,
    "impact": 3,
    "mitigation": "Share frameworks; timebox LegalPlant to ~20%",
    "evidence": [{"chunk_id":"m1_chunk_4","role":"source","confidence":0.6}]
  },
  {
    "title": "Partnership reliance for LegalPlant sales may delay traction",
    "type": "Risk",
    "likelihood": 3,
    "impact": 3,
    "mitigation": "Pursue pilots (5–10), parallel drip marketing",
    "evidence": [{"chunk_id":"m1_chunk_4","role":"source","confidence":0.61}]
  }
]
```

## Relationship Examples
- satisfy(Feature "Spec PR workflow" -> Requirement "Spec updates proposed via workflow-generated PRs")
- trace_to(Requirement "Compliance calendar as data object" -> Goal "Enterprise governance readiness")
- address(Risk "Dependence on ECIT" -> WorkPackage "ECIT onboarding tranche 1")
- own(ActionItem -> Stakeholder)

Notes
- These objects should be persisted with evidence links to `m1_chunk_*` and tied to the `Meeting` via context labels or relationships.
- Tag with `adm_phase` (A/B/E) and `architecture_domain` (business/application) as appropriate.

---

## LangChain LLM Extraction (prompt + chain sketch)

Prompt (system)
"""
You are an information extraction service. Extract structured objects from a meeting transcript according to the provided JSON Schemas. Only output valid JSON matching this top-level shape:
{
  "meeting": Meeting,
  "decisions": Decision[],
  "requirements": Requirement[],
  "action_items": ActionItem[],
  "questions": Question[],
  "risks": Risk[]
}
Ensure every object includes evidence entries referencing provided chunk_ids. Be conservative; prefer fewer, higher-confidence items.
"""

Prompt (user)
"""
Context:
- Schemas: URLs or embed contents of schemas/*.schema.json
- Chunked transcript: an array of {chunk_id, text, timecodes, section_path}

Task: Produce JSON per schemas. Include adm_phase and architecture_domain where clear.
"""

Example LangChain Chain Flow
- Function: prepare chunks (split transcript into chunks with ids)
- LLM (Chat) Node: system+user prompts above; inputs: chunks text and schema definitions
- IF Node: validate JSON (use Code/Function to run AJV against schemas)
- HTTP Request or DB Nodes: upsert Meeting, Decisions, Requirements, ActionItems, Questions, Risks; insert Evidence links and Relationships
- On Error: log and dead-letter the transcript for manual review

Validation Snippet (pseudo-code)
```js
const Ajv = new Ajv({allErrors: true});
const validateDecision = ajv.compile(decisionSchema);
items.decisions.forEach(d => { if (!validateDecision(d)) throw new Error(JSON.stringify(validateDecision.errors)); });
```

Schema references
- docs/spec/schemas/meeting.schema.json
- docs/spec/schemas/decision.schema.json
- docs/spec/schemas/requirement.schema.json
- docs/spec/schemas/actionItem.schema.json
- docs/spec/schemas/question.schema.json
- docs/spec/schemas/risk.schema.json
