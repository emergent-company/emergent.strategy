# JSON Schemas (first draft)

These schemas validate objects produced by the LLM extraction workflows. Keep them minimal and evolve as needed. Draft: 2020-12.

Included
- meeting.schema.json
- decision.schema.json
- requirement.schema.json
- actionItem.schema.json
- question.schema.json
- risk.schema.json
- evidence.schema.json (shared sub-schema)

Notes
- All objects share an informal envelope: id (string, optional), type (enum), title, description?, labels?, owner?, status?, architecture_domain?, adm_phase?, evidence?[]
- Evidence links objects back to chunks by ID with role and confidence.
- You can enforce stricter enums later; start forgiving to allow model outputs.
