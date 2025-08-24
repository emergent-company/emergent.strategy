# Evaluation and Quality

## Retrieval Quality
- Offline eval sets: queries mapped to gold citations from a seed project.
- Metrics: nDCG@k, Recall@k, MRR; per-source breakdown.
- A/B rerankers (RRF vs graph-aware) with shadow tests.

## Ingestion Quality
- Extraction coverage per MIME type; fallback OCR success.
- Chunk integrity: token distribution, section preservation.
- Embedding health: cosine self-similarity sanity checks.

## MCP Usability
- Contract stability, error clarity, performance budgets.
- Agent harness to validate end-to-end tasks: “write spec for feature X with citations”.

## Acceptance Criteria (v1)
- Ingest: PDF, DOCX, MD, HTML, Jira, GitHub Issues/PRs; Slack export.
- Search: hybrid top-10 with at least 80% recall on eval set.
- MCP: search and fetch with citations and provenance.
