# Example: Meeting Transcript Processing

This example illustrates inputs/outputs for the meeting transcript workflow.

## Input
- Source: Zoom webhook (recording.completed)
- Files: audio/video + auto-generated transcript (VTT/SRT), metadata (participants)

## Normalized Transcript (utterances)
```json
[
  {"speaker":"Alice","start":1.2,"end":8.3,"text":"We need SSO in v1 to meet enterprise needs."},
  {"speaker":"Bob","start":9.0,"end":15.4,"text":"Performance SLAs should be under 300ms P95 for search."},
  {"speaker":"Carol","start":16.1,"end":22.0,"text":"Let's adopt OIDC with PKCE; we can defer SCIM to v1.1."}
]
```

## Chunks
```json
[
  {
    "document_id":"doc_meeting_123",
    "ordinal":1,
    "text":"Security & Auth discussion: SSO OIDC with PKCE; SCIM deferred to v1.1",
    "section_path":["Meeting","Auth"],
    "timecodes":{"start":1.2,"end":22.0}
  }
]
```

## Extracted Objects (JSON)
```json
{
  "meeting": {
    "title": "Roadmap sync 2025-08-20",
    "provider": "zoom",
    "uri": "https://zoom.us/rec/...",
    "started_at": "2025-08-20T10:00:00Z",
    "ended_at": "2025-08-20T11:00:00Z",
    "participants": [{"name":"Alice"},{"name":"Bob"},{"name":"Carol"}],
    "agenda": ["Roadmap review","Auth decisions","Performance"],
    "summary": "Team decided to adopt OIDC with PKCE for SSO in v1; SCIM deferred to v1.1; search P95 target 300ms."
  },
  "decisions": [
    {
      "title": "Adopt OIDC with PKCE for SSO",
      "type": "Decision",
      "status": "accepted",
      "context": "Enterprise auth needs; compatibility with IdPs",
      "options": ["OIDC+PKCE","SAML","Custom"],
      "chosen_option": "OIDC+PKCE",
      "consequences": "Aligns with standards; requires token management",
      "evidence": [{"chunk_id":"chunk_1","role":"rationale","confidence":0.86}]
    }
  ],
  "requirements": [
    {
      "title": "SSO using OIDC with PKCE",
      "type": "Requirement",
      "category": "FR",
      "status": "proposed",
      "rationale": "Agreed in roadmap sync",
      "fit_criterion": "User can sign in via enterprise IdP using OIDC; conformance tests pass",
      "evidence": [{"chunk_id":"chunk_1","role":"source","confidence":0.78}]
    },
    {
      "title": "Search P95 under 300ms",
      "type": "Requirement",
      "category": "NFR",
      "status": "proposed",
      "fit_criterion": "95th-percentile latency < 300ms for /search under 100 rps",
      "evidence": [{"chunk_id":"chunk_1","role":"source","confidence":0.72}]
    }
  ],
  "action_items": [
    {
      "title": "Draft OIDC configuration guide",
      "type": "ActionItem",
      "owner": "Carol",
      "due_date": "2025-08-25",
      "status": "open",
      "evidence": [{"chunk_id":"chunk_1","role":"context","confidence":0.65}]
    }
  ],
  "questions": [
    {
      "title": "Do we need SCIM in v1?",
      "type": "Question",
      "status": "open",
      "evidence": [{"chunk_id":"chunk_1","role":"source","confidence":0.71}]
    }
  ],
  "risks": [
    {
      "title": "Auth complexity increases",
      "type": "Risk",
      "likelihood": 3,
      "impact": 3,
      "mitigation": "Provide reference implementation",
      "evidence": [{"chunk_id":"chunk_1","role":"rationale","confidence":0.58}]
    }
  ]
}
```

## Relationship Examples
- satisfy(Feature "SSO" -> Requirement "SSO using OIDC with PKCE")
- trace_to(Requirement "SSO using OIDC with PKCE" -> Principle "Standards-based Auth")
- address(Risk "Auth complexity" -> WorkPackage "Reference OIDC Guide")
- own(ActionItem -> Stakeholder)

## Notes
- Persist all extracted objects with evidence links to the original chunks.
- Add adm_phase="A" or "B" and architecture_domain as applicable.
