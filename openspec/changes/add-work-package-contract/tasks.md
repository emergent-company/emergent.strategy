# Tasks: Work Package Contract — Tool-Agnostic, Four-Track SOW

> This change is primarily a design specification and coordination record. The
> implementing work lands in canonical-epf (#21) and strategy-server (#47).
> Orchestrator adaptation tasks are sequenced after those dependencies land.

## 1. Upstream contract definition (external — canonical-epf#21)

- [ ] 1.1 `work_package` artifact type defined in canonical-epf (`emergent-company/epf-canonical#21`)
- [ ] 1.2 Schema models `targets` as three many-to-many reference sets: `value_model_paths[]`, `definition_ids[]`, `kr_ids[]`
- [ ] 1.3 Schema includes `track`, `risk_class`, `status` (incl. `cancelled`), `source`, `lifecycle`; tasks deliberately excluded
- [ ] 1.4 Template, wizard, and relationship-validation rules added (targets resolve to existing nodes)

## 2. Strategy-server adoption (external — emergent.strategy#47)

- [ ] 2.1 Sync `work_package` schema from canonical-epf via `task sync-embedded`; decompose WP → graph object + edges
- [ ] 2.2 Footprint derived server-side = union(`value_model_paths`, `definition_ids`)
- [ ] 2.3 Status state-machine enforced: `proposed → approved → scheduled → executing → done` (+ `cancelled`)
- [ ] 2.4 Each status transition emitted to the journal as a subscribable event
- [ ] 2.5 Subscription hook for connected systems (orchestrator, 21st, sequence) — augments, not replaces, AIM heartbeat
- [ ] 2.6 MCP tools: `list_work_packages`, `get_work_package`, `create/approve/transition_work_package`, `get_work_package_footprint`

## 3. Orchestrator authoring adapters — Stage 1 (this repo, after deps)

- [ ] 3.1 Rename `internal/openspec.Change` to a neutral `WorkPackage` type carrying the contract shape
- [ ] 3.2 Introduce an authoring-adapter interface (tool → WorkPackage)
- [ ] 3.3 OpenSpec adapter: map an OpenSpec change → WorkPackage (Track 1, file-based)
- [ ] 3.4 Strategy-graph adapter: hydrate WorkPackages from strategy-server (Track 2)
- [ ] 3.5 Footprint comes from the WorkPackage (derived server-side), not re-derived in the orchestrator
- [ ] 3.6 Tests: OpenSpec adapter parity with current behavior; many-to-many targets; cancelled excluded from scheduling

## 4. Orchestrator trigger — Stage 1→2 (this repo, after deps)

- [ ] 4.1 Subscribe to `work_package` status `approved` (journal event) to wake the planner
- [ ] 4.2 On-demand run remains available (pull); subscription augments it
- [ ] 4.3 Test: an approved WorkPackage triggers a planning run; non-approved does not

## 5. Orchestrator execution router — Stage 4 (this repo, future change)

- [ ] 5.1 Define one `Execute(WorkPackage) → Result` driver interface
- [ ] 5.2 Route by `track`/`substrate`: product, strategy, org_ops (21st), commercial (sequence)
- [ ] 5.3 Async drivers (21st, sequence) report status/evidence back via the WP state-machine
- [ ] 5.4 Merge/approval gate remains human (consistent with Tier-3 design)

## 6. Verification

- [ ] 6.1 Deterministic wave scheduler is unchanged (regression test still green)
- [ ] 6.2 Strategic scorecard is unchanged (regression test still green)
- [ ] 6.3 `openspec validate add-work-package-contract --strict` passes
- [ ] 6.4 Confirm clean cut preserved: orchestrator never imports strategy-server internals
