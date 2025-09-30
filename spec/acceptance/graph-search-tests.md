# Graph Search Acceptance Test Manifest

Mapping of acceptance test identifiers to spec sections for traceability.

| ID | Section | Description |
|----|---------|-------------|
| AT-SEC-RLS-1 | 28.10 | Cross-org object never appears |
| AT-SEC-RLS-2 | 28.10 | Neighbor expansion blocks cross-project without scope |
| AT-SEC-RLS-3 | 28.10 | Cross-project allowed with admin scope |
| AT-SEC-RED-1 | 28.10 | Sensitive field redacted & listed |
| AT-SEC-RED-2 | 28.10 | Citation referencing sensitive span omitted |
| AT-SEC-DBG-1 | 28.10 | Debug request without scope -> 403 |
| AT-SEC-DBG-2 | 28.10 | Debug scope returns normalization stats |
| AT-SEC-RATE-1 | 28.10 | Soft rate limit adds warning |
| AT-SEC-RATE-2 | 28.10 | Hard rate limit returns 429 |
| AT-SEC-CAP-1 | 28.10 | Expansion truncated warning |
| AT-SEC-TOKEN-1 | 28.10 | Over-max token budget handled |
| AT-PERF-ADAPT-1 | 29.10 | High rerank latency disables rerank |
| AT-PERF-ADAPT-2 | 29.10 | Large neighbor size trims expansion |
| AT-PERF-TOKEN-1 | 29.10 | Neighbor pruning before primary truncation |
| AT-PERF-MEM-1 | 29.10 | Memory prune triggers shrink |
| AT-ROLLOUT-PHASE-TRANSITION | 30.5 | Phase promotion gated by metric |
| AT-ROLLOUT-FLAG-DOCUMENTED | 30.5 | All active flags in registry |
| AT-ROLLOUT-ROLLBACK | 30.5 | Rerank failure flips flag & reflects meta |
| AT-ROLLOUT-DUAL-WRITE | 30.5 | Dual write records both versions |
| AT-EMB-VERS-1 | 25 | Coverage metrics computed for v2 |
| AT-RERANK-1 | 25 | Rerank metadata present when applied |
| AT-SEARCH-CIT-1 | 25 | Citations included when enabled & scoped |
| AT-DET-NORM-1 | 26 | Same input => unchanged normalization stats |
| AT-META-WARN-1 | 25 | Warning appears when rerank disabled |

_Note: Additional quality evaluation (success@K, NDCG) tracked outside deterministic acceptance tests._
