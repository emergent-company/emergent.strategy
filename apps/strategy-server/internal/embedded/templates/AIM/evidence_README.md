# AIM/evidence/ — Unstructured Reference Library

This directory holds unstructured reference documents that provide context for AIM assessments, Strategic Reality Checks, and calibration decisions. These documents supplement the formal EPF artifacts but are **not authoritative** — they don't participate in schema validation.

## Categories

Organize files into subdirectories by category:

| Directory | Purpose | Examples |
|-----------|---------|----------|
| `competitive/` | Market comparisons, competitor analyses, landscape surveys | `Competitor_Comparison.md`, `Market_Landscape_2025.md` |
| `partner/` | Partner engagement artifacts, briefings, proposals, meeting notes | `Partner_FollowUp.md`, `Strategic_Alliance_Brief.md` |
| `technical/` | Engineering specs, test reports, lab data, certification pathways | `Performance_Test_Report.md`, `Certification_Pathway.md` |
| `market/` | Market research, policy analysis, economic models, regulations | `Market_Sizing_Analysis.md`, `Regulatory_Impact.md` |
| `narrative/` | Strategy overviews, vision documents, positioning stories | `Strategy_Overview.md`, `Investor_Narrative.md` |
| `product-specs/` | Individual product deep-dives, white papers, technical summaries | `Product_Whitepaper.md`, `Technical_Summary.md` |
| `internal/` | EPF process artifacts, reviews, gap analyses, roadmap exports | `Strategy_Gap_Analysis.md`, `Quarterly_Review.md` |

Custom categories are allowed — create additional subdirectories as needed.

## File Formats

- `.md` — primary format (supports chunking and embedding)
- `.pdf` — uploaded as-is
- `.docx` — uploaded as-is

## Naming Convention

Use descriptive names. Optionally prefix with date for chronological ordering:

```
2025-03-15_Competitor_Analysis.md
Market_Sizing_Q1.md
```

## Memory Integration

When `EPF_MEMORY_URL` is configured, `epf-cli ingest` and `epf-cli sync` will:
1. Scan `AIM/evidence/` for documents
2. Create `ReferenceDocument` graph nodes (with category, path, content hash)
3. Upload file content to Memory for semantic search
4. Documents become queryable alongside the strategy graph

## Relationship to Formal Artifacts

- Evidence documents are **not validated** by `epf-cli validate`
- Evidence documents are **not decomposed** into EPF YAML types
- Evidence documents **supplement** formal artifacts for AIM assessments
- Evidence documents **are indexed** in Memory for semantic search
