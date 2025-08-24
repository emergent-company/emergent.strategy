# Roadmap

## v0 (Prototype)
- Minimal stack: Postgres+pgvector, LangChain ingestion service, object storage, MCP server skeleton.
- Ingest: file-drop HTTP, GitHub Issues, PDFs/MD/DOCX via Unstructured.
- Hybrid search: vector + FTS; simple weighted fusion.
- MCP: facts.search, facts.fetch; bearer auth.

## v1
- Sources: Jira, PRs/reviews, Slack export, Confluence/Notion.
- Graph: basic entities (Feature, Ticket, Decision) and edges; expand tool.
- Observability: metrics, traces; admin dashboard.
- Security: SSO, RLS; audit log.

## v1.1
- Meetings: transcript ingestion; summarization; speakers.
- Propose_spec tool with templated outputs and citations.
- Cost controls & background re-embedding.

## v2
- Managed deployment patterns; scale to 5M+ chunks.
- Advanced graph extraction and cross-doc lineage.
- UI for curation and conflict resolution.
