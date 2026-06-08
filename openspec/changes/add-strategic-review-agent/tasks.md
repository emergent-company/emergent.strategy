# Tasks: Strategic Review Agent (Tier 3)

> STATUS: QUEUED. Do not implement until the blocking gate in section 0 is met.

## 0. Blocking gate (must pass before any implementation)

- [x] 0.1 Tier 2 scorecard validated against a live strategy-server (emergent instance, 175 artifacts)
- [x] 0.2 Real read-only MCP tool surface confirmed (names + argument shapes; MCP session handshake)
- [x] 0.3 `internal/score/mcp_scorer.go` tool constants aligned to the real server

> GATE CLEARED. Tier 3 implementation may proceed when prioritized. Note for the
> read-only allowlist (section 1): verified read tools are `search_strategy`,
> `get_neighbors`, `detect_contradictions`, `get_roadmap`, `list_features`,
> `list_artifacts`, `get_coverage_analysis`, `get_strategy_context`, `get_feature`.
> Avoid `detect_contradictions` until emergent.strategy#45 is fixed (>50-node bug).

## 1. Read-only tool allowlist

- [ ] 1.1 Define the read-only tool allowlist (search, neighbors, contradictions, roadmap, artifact reads)
- [ ] 1.2 Construct the agent toolset from the allowlist only; write tools excluded by construction
- [ ] 1.3 Test: agent toolset contains no mutating tool

## 2. LLM provider seam

- [ ] 2.1 Pluggable model interface (orchestrator-side; preserves the clean cut)
- [ ] 2.2 Config: model selection, API endpoint/key (endpoint-as-config style)
- [ ] 2.3 Test: stub model implementation for deterministic agent tests

## 3. Dialogue agent (`internal/review/agent.go`)

- [ ] 3.1 Turn-bounded reasoning loop: change + Tier 2 scorecard → questions → answers → judgment
- [ ] 3.2 Each turn may call a read-only tool; next question may depend on prior answer
- [ ] 3.3 Structured `Judgment`: recommendation (proceed | proceed-with-changes | hold | re-scope), reasoning chain, cited evidence, confidence, residual risk
- [ ] 3.4 Stop on judgment reached OR turn budget exhausted (return best judgment)
- [ ] 3.5 Tests: multi-turn loop against stub model + stub MCP; turn-budget enforcement; structured output shape

## 4. Triage integration

- [ ] 4.1 Run Tier 3 only on changes above a configurable attention threshold (from Tier 2 ranking)
- [ ] 4.2 Aligned/low-attention changes skip the dialogue
- [ ] 4.3 Tests: contested change triggers dialogue; aligned change does not

## 5. Policy layer (`internal/review/policy.go`)

- [ ] 5.1 Strict mode: judgment → recommendation → human gate
- [ ] 5.2 Auto mode guardrails: confidence ≥ threshold AND low residual risk AND proceed/proceed-with-changes AND no hard-stop tension AND permitted risk class
- [ ] 5.3 Auto escalation: any failed guardrail → fall back to strict
- [ ] 5.4 High-risk change classes always strict (configurable risk-class set)
- [ ] 5.5 Tests: auto-decide when safe; escalate on each guardrail failure; high-risk always strict

## 6. Human gate (`internal/review/gate.go`)

- [ ] 6.1 Render judgment as a recommendation (reasoning + evidence + confidence + residual risk)
- [ ] 6.2 Capture approve / modify / reject
- [ ] 6.3 Tests: gate rendering + decision capture

## 7. Provenance and audit

- [ ] 7.1 Auto decisions record the same judgment artifact a strict recommendation would
- [ ] 7.2 Mark `auto-decided` with full reasoning chain; reviewable after the fact
- [ ] 7.3 Tests: auto decision produces a complete, reviewable record

## 8. Reversibility backstop

- [ ] 8.1 Auto-decided changes dispatch to execution but the merge gate remains human
- [ ] 8.2 Document the reversibility boundary (worst case = unnecessary PR, never unreviewed main)

## 9. CLI surface

- [ ] 9.1 `--review` (enable Tier 3), `--mode strict|auto`, `--auto-confidence`, `--attention-threshold`, `--auto-risk-classes`
- [ ] 9.2 Tier 3 output integrated into both terminal and JSON reports
- [ ] 9.3 Tests: flag parsing; report integration

## 10. Verification

- [ ] 10.1 `go test ./...` green for the orchestrator module
- [ ] 10.2 `go vet ./...` clean
- [ ] 10.3 Confirm Tier 3 does not change the deterministic wave plan (scheduling-independence test)
- [ ] 10.4 `openspec validate add-strategic-review-agent --strict` passes
