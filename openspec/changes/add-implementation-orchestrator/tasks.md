# Tasks: Implementation Orchestrator — Wave Planner and Strategic Scorecard

## 1. Standalone module scaffold (DONE)

- [x] 1.1 Create `apps/orchestrator/` as its own Go module (`go.mod`, Go 1.26.1)
- [x] 1.2 Add `./apps/orchestrator` to `go.work`
- [x] 1.3 Establish package layout: `internal/openspec`, `internal/plan`, `cmd/planner`
- [x] 1.4 Confirm module builds and `go vet` is clean
- [x] 1.5 Confirm existing modules (epf-cli) still build under the workspace

## 2. OpenSpec change parser (DONE)

- [x] 2.1 Discover active changes under `openspec/changes/`, skipping `archive` and dotfiles
- [x] 2.2 Extract footprints from `specs/*/` subdirectories (sorted, zero-footprint tolerated)
- [x] 2.3 Parse `tasks.md` checkbox counts (open vs completed; tolerate `*`/`+`/`-` markers, `[x]`/`[X]`)
- [x] 2.4 Parse title from first H1 of `proposal.md` (strip `Change:` prefix; tolerate missing file)
- [x] 2.5 `Change.Done()` true only when there is at least one task and all are complete
- [x] 2.6 Detect cross-change references in `tasks.md` against known change IDs (no self-ref)
- [x] 2.7 Tests: footprint extraction, task counting, archive/dotfile skip, zero-footprint, cross-ref, Done semantics, task-line classification

## 3. Deterministic wave scheduler (DONE)

- [x] 3.1 Build footprint collision graph (footprint → changes touching it, >1 only)
- [x] 3.2 Greedy graph-coloring placement: most-constrained changes first, lowest free wave
- [x] 3.3 Footprint-less changes never collide; complete changes skipped (unless opted in)
- [x] 3.4 Emit waves, collision map, reconciliation list, skip list — deterministic ordering
- [x] 3.5 Tests: disjoint parallelism, collision separation, footprint-less, chained collisions, completed skip, reconciliation flag, determinism

## 4. Planner CLI + reporting (DONE)

- [x] 4.1 `cmd/planner` with flags: `--changes`, `--include-completed`, `--mcp-endpoint` (reserved)
- [x] 4.2 Render waves with per-change task badge + footprints
- [x] 4.3 Render reconciliation-required section, collision hot-spots (sorted by contention), skip list
- [x] 4.4 Run against the real `openspec/changes/` backlog and verify correctness (GitHub changes correctly separated by shared `epf-strategy-server` footprint)

## 5. OpenSpec documentation (DONE)

- [x] 5.1 Create this change (`add-implementation-orchestrator`) with proposal, spec delta, tasks
- [x] 5.2 Introduce `strategy-orchestration` spec capability
- [x] 5.3 `openspec validate add-implementation-orchestrator --strict` passes

## 6. MCP client (DONE)

- [x] 6.1 `internal/mcp/` — endpoint-as-config MCP client of strategy-server (streamable HTTP `/mcp`, JSON + SSE)
- [x] 6.2 Tool discovery: auto-enable scorecard categories via `set_tool_filter`, list resulting tools
- [x] 6.3 Graceful degradation when the endpoint is unreachable (deterministic plan still emitted; scorecard marked unavailable)
- [x] 6.4 Tests: client against an in-process stub MCP server (JSON + SSE), auth header, filter fallback, degradation path

## 7. Strategic scorecard (DONE)

- [x] 7.1 `internal/score/` — five-dimension scorecard (traceability, contradiction, maturity, scope/adjacency, sequencing)
- [x] 7.2 Traceability: footprints → value paths via semantic_search (Strong/Mixed/Weak, fail-soft)
- [x] 7.3 Contradiction: conflicts via contradictions tool (Strong=clear / Weak=conflicts)
- [x] 7.4 Maturity: flag hypothetical/unvalidated capability via list_artifacts
- [x] 7.5 Scope/adjacency: neighbors reported as Signal (evidence, not faked-precision grade)
- [x] 7.6 Sequencing: roadmap/KR window via get_roadmap_summary
- [x] 7.7 Each dimension carries cited evidence; Card has NO single verdict field
- [x] 7.8 Tests: per-dimension scoring + per-dimension Unavailable degradation against stubbed MCP responses

## 8. Posture weighting + tension flags (DONE)

- [x] 8.1 Posture config: per-dimension weights with presets (balanced, venture-early, scaling); `--posture` flag
- [x] 8.2 Weighted attention ranking (inverse-confidence ordering only — never a build/skip decision)
- [x] 8.3 Tension detection: named tensions with evidence (trace×maturity, trace×contradiction, scope×traceability)
- [x] 8.4 Tests: posture changes ordering; tension raises attention; aligned card ranks last; determinism

## 9. Machine-readable output (DONE)

- [x] 9.1 `--json` emits the full report (plan + ranked scorecards) — the future work-order payload
- [x] 9.2 Stable JSON schema (report + scorecardBlock + score.Ranked)
- [x] 9.3 Verified JSON output shape end-to-end (deterministic + live-stub scorecard)

## 9b. Live tool-surface alignment (DONE)

- [x] 9b.1 Discover real strategy-server MCP tool names from `internal/mcpserver/server.go`
- [x] 9b.2 Replace guessed names: `search_strategy`, `get_neighbors`, `detect_contradictions`, `get_roadmap`, `list_features`
- [x] 9b.3 Thread mandatory `instance_id` through every scorer call; add `--instance-id` flag
- [x] 9b.4 Correct result shapes (bare arrays; maturity at `payload.feature_maturity.overall_stage`; raw roadmap_recipe)
- [x] 9b.5 Correct scorecard categories to enable: `semantic`, `features`, `strategy`
- [x] 9b.6 Update tests for new names/shapes/signature; all green

## 10. Verification (DONE for current layers)

- [x] 10.1 `go test ./...` green for the orchestrator module
- [x] 10.2 `go vet ./...` clean for the orchestrator module
- [x] 10.3 Full orchestrator test suite green after layers 6–9
- [x] 10.4 End-to-end verified: deterministic plan, graceful degradation, live-stub scorecard, JSON output
- [x] 10.5 `openspec validate add-implementation-orchestrator --strict` passes after task updates

## 11. Live validation against real strategy-server (DONE)

- [x] 11.1 Stand up strategy-server (Docker + Postgres + full Memory stack + server on :8090)
- [x] 11.2 Confirm tools resolve and `set_tool_filter` enables semantic/features/strategy
- [x] 11.3 Run planner Tiers 1-2 against a real instance; verify scorecard mechanics on real data
- [x] 11.4 Unblocks Tier 3 (`add-strategic-review-agent` section 0 gate)

## 12. Live-validation findings + fixes (DONE)

- [x] 12.1 MCP session handshake required (initialize → Mcp-Session-Id → notifications/initialized); client fixed + tested
- [x] 12.2 Query by semantic content (title+summary), not footprint slug; parser extracts Why-summary; verified `search_strategy` returns real hits (e.g. "knowledge graph" → fd-001 @ 0.44)
- [x] 12.3 Scope anchors on real artifact keys from search hits before `get_neighbors` (slugs are not node keys)
- [x] 12.4 Same-product requirement confirmed: imported `docs/EPF/_instances/emergent` (175 artifacts, 3013 graph rels) and scored the real backlog against it
- [x] 12.5 Filed platform bug: `detect_contradictions` fails on >50 graph nodes (root_ids cap) — emergent.strategy#45; degrades gracefully to Unavailable
- [x] 12.6 Confirmed weak traceability for infra changes is a TRUE signal (dev/infra work is not first-class in the product strategy graph), not a defect
