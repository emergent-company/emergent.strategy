# Open Questions

- Embedding provider: local vs hosted; model families and costs?
- Vector DB: pgvector vs Qdrant (or Milvus) for >5M chunks?
- Graph DB necessity in v1: can we defer to Postgres tables/edges?
- PII handling defaults and tenant controls?
- How to map source ACLs to tenant scopes reliably?
- Provenance depth: do we store all intermediate steps or summaries only?
- Eval set creation: who curates the gold citations and how often refresh?
- MCP pagination and streaming: do we need server push for long results?
- Multi-language support requirements and translation strategy?
