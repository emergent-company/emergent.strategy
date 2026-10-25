# Tasks: Fence the Memory graph per instance

Deadline: merged to `main` and deployable by **Wednesday 28 October**, so the
pilot can upgrade before Thursday 29 October.

Record the baseline first: `cd apps/strategy-server && go test ./...` with
Postgres up (`task dev-deps`). Expected: all packages pass.

Write each test in section 9 **before** the code it covers, and see it fail.
Tests run against the mocked Memory server already used by `phase2d_test.go`;
extend the mock where it cannot express labels, properties or deletes.

Tracks A–D can run in parallel after section 1. Section 5 depends on 2 and 3.

### Cut line

If time runs short, ship **Tier 1** by 28 October and **Tier 2** before the
3 November pilot start (or right after). Reads fail closed, so legacy debris is
already invisible without the sweep; the sweep is cleanup, not protection.

- **Tier 1 (blocks the pilot upgrade):** sections 1–4 (including the scenario
  ownership check in 4.6), 6.1, 8.1–8.5, and every test in section 9 except 9.15.
- **Tier 2 (follows):** section 5 (sweep tool, CLI and runbook entry for it;
  9.15), 6.2, section 7.

Tier 1 deliberately includes the provenance fields (3.3), since they are cheap
and the pilot hit the confusion they prevent.

## 1. Groundwork (blocking)

- [ ] 1.1 Migration `045_memory_projection.sql` (044 is the latest on `main`;
      re-check before merging): add
      `strategy_instances.memory_generation BIGINT NOT NULL DEFAULT 0`,
      `memory_dirty_since TIMESTAMPTZ NULL` and
      `memory_change_seq BIGINT NOT NULL DEFAULT 0`; create `memory_projection`
      (design Decision 2); unique index on `left(id::text, 8)` over
      `strategy_instances`; set `memory_content_hash = NULL` for active
      instances. Update `internal/domain` structs and the migration table in
      `apps/strategy-server/AGENTS.md`.
- [x] 1.2 Trace every path that writes `strategy_artifacts` outside
      `strategy.CommitBatch` / `CommitAuto`. Done; the result is the table in
      design.md Decision 4. Re-run `grep -rn "strategy_artifacts\|strategy_relationships"`
      over non-test Go code before merging, in case a writer was added.
- [ ] 1.3 `domain/ingest`: `ScopedKey(instanceID uuid.UUID, key string) string`
      (8-character prefix, as today for decomposed keys) and `UnscopedKey`; the
      only place Memory keys are built. Test that the longest key the
      decomposer produces for `docs/EPF/_instances/emergent` stays within
      Memory's 128-character key limit.
- [ ] 1.4 Instance creation: retry with a new UUID on a prefix unique-index
      violation.
- [ ] 1.5 `internal/memory`: add `Labels []string` to `SearchRequest` and
      `Labels` to `ListObjectsOptions` if missing.

## 2. Track A: write side (ingest)

- [x] 2.1 (analysis) Minimum emergent.memory version: v0.85.0 (design risk 1).
- [ ] 2.1b Log the Memory version at startup (`HealthDetailed` already returns
      it) and warn when it is below v0.85.0. Put the minimum in the runbook.
- [ ] 2.2 Per-instance advisory lock helper (`pg_advisory_lock` on a dedicated
      `db.Conn`, key derived from the instance UUID), with `TryLock` for the
      sweep. Unlock explicitly; on unlock failure discard the connection instead
      of returning it to the pool (design Decision 2, step 1). Test that a
      second helper call for the same instance blocks until the first releases,
      and that a failed unlock does not leak the lock.
- [ ] 2.3 Rewrite `ReingestInstance` + `ReingestInstanceDecomposed` as one
      manifest ingest (design Decision 2, steps 1–7): compute the manifest from
      the export, write both layers stamped per Decision 1, abort without
      touching the manifest on any write failure, replace manifest + generation
      + conditional dirty clear in one transaction, then GC (manifest diff, then
      label safety net). Write nothing per-ingest onto objects.
- [ ] 2.4 Relationships: stamp `instance_id`; resolve endpoints through scoped
      keys only; remove the `objectKeyIndex` prefix heuristics that assumed
      unscoped keys. GC resolves a removed relationship's Memory ID through
      `ObjectEdges` on the source object and deletes with the existing
      `DeleteRelationship` (design risk 3, decided).
- [ ] 2.5 Remove `ingestBatch`, `upsertGraphObject`, `deleteGraphObject` and
      `EnqueueBatch`. Replace with `InstanceChanged(ctx, instanceID)` plus
      per-instance coalescing (one in flight, one "dirty again" bit). After
      taking the advisory lock, skip the ingest if the instance is clean and
      already ingested (design Decision 2, step 1).
- [ ] 2.6 `cmd_import.go`: delete `ingestDecomposed`; wire the exporter
      (`SetExporter`, as `cmd_serve.go:122`) and call the fenced ingest. Move any
      logic left in `cmd_import.go` into `domain/` (no business logic in
      commands).
- [ ] 2.7 Fix `delete_reason` → `reason` in `internal/memory/objects.go:78`.

## 3. Track B: read side (semantic)

- [ ] 3.1 `ManifestSource` interface in `domain/semantic` (`HasManifest`,
      `Visible(keys)` as one `key = ANY(?)` query), implemented in
      `domain/ingest`; wire in `cmd_serve.go`.
- [ ] 3.2 Private scope helper: visibility rule (label `instance:<X>`,
      `instance_id == X`, key in manifest; relationships by endpoints and tuple),
      debug count of dropped items, `graph_not_ready` without a manifest.
- [ ] 3.3 `SearchStrategy`: send exactly one label `instance:<X>`; over-fetch
      (`limit × 2`, cap 100), filter, trim. Add `instance_id`, `layer`,
      `source_artifact` to `SearchResult`.
- [ ] 3.4 `GetNeighbors`: scope the caller key, not-found for invisible root,
      filter expansion.
- [ ] 3.5 `DetectContradictions`: list by `instance:<uuid>` + `layer:artifact`,
      filter.
- [ ] 3.6 Move lifecycle `enrichWithSemantics` (`internal/mcpserver/lifecycle.go:154`)
      into a semantic-service method using the scope helper and the scoped
      North Star key.
- [ ] 3.7 Settings page: per-instance counts from the instance row; drop the
      project-wide `CountArtifactObjects` display.
- [ ] 3.8 Architecture test: only `domain/semantic`, `domain/ingest` and the
      sweep may call `internal/memory` read methods, and every `Search` call
      sets exactly one `instance:` label.

## 4. Track C: triggers, durability, lifecycle

- [ ] 4.1 `ingest.Notifier` interface and one `markChanged` helper (design
      Decision 4: sets `memory_dirty_since`, increments `memory_change_seq`).
      Call it after the write in `CommitBatch`, `CommitAuto`, `BackfillIndex`,
      `commitAlignedValueModel`, `evidence.Ingest/Update/MarkProcessed/Link`;
      inside the existing transaction in `ReimportArtifacts` and
      `version.Restore`. Call `InstanceChanged` after commit. `CommitBatch` and
      `CommitAuto` are not wrapped in a transaction by this change.
- [ ] 4.1b `scaffold_instance` calls `BackfillIndex` after `ImportInstance`
      (design Decision 4, first gap).
- [ ] 4.2 Remove caller-side `EnqueueBatch` calls (`internal/mcpserver/server.go:1244`,
      `internal/pipeline/postcommit.go`, `domain/ripple/convergence.go:293`,
      `domain/evidence/service.go:176`, `internal/mcpserver/introspection.go:120`).
- [ ] 4.3 Give the sync service the notifier (`cmd_serve.go:650`) so GitHub
      import triggers ingest (#96 G1).
- [ ] 4.4 `RepairMemoryDrift` and the startup sweep: re-enqueue active
      instances that are dirty, have a NULL content hash, or have no manifest;
      add `deleted_at IS NULL` to their raw queries (#87 F2).
- [ ] 4.5 `DeleteInstance` and `workspace.DeleteWorkspace`: enqueue a purge per
      instance (objects with label `instance:<uuid>` and in the manifest,
      branches `scenario-<uuid>-*`, then manifest rows) under the instance
      lock; record the outcome; correct the `delete_instance` tool text (#87 F1).
- [ ] 4.6 Scenarios (design risk 4): `evaluate_scenario`, `commit_scenario` and
      `discard_scenario` look the branch up with `GetBranch` and require its
      name to start with `scenario-<instanceUUID>-`; otherwise respond as for a
      non-existent scenario. Route branch reads through the scope helper
      (label and `instance_id` only; the manifest describes `main`). Add a
      test that `commit_scenario` never sends `execute: true`. Open a follow-up
      issue: a real commit must merge only the instance's own objects.
- [ ] 4.7 `internal/handler/handler_aim_agent.go:314`: decide whether the
      `strategySvc == nil` commit fallback is reachable; remove it if not, or
      route it through `CommitBatch`.

## 5. Track D: sweep and operations (after 2 and 3)

- [ ] 5.1 Domain function `SweepOrphans(ctx, apply bool)`: page all objects,
      classify `no_owner` / `unknown_owner` / `not_in_manifest` / `legacy_key`,
      skip locked instances and instances without a manifest, delete
      sequentially with retry when `apply`.
- [ ] 5.2 MCP tool `sweep_memory_orphans(apply=false)` in the `admin`
      category, write-gated; CLI `strategy-server memory sweep [--apply]`.
      Regenerate `self-model.json` (`task selfmodel:generate`).
- [ ] 5.3 Upgrade runbook in `docs/DEPLOYMENT.md` (design Decision 5).

## 6. Content contract

- [ ] 6.1 Tool descriptions for `search_strategy` and `get_template`
      (design Decision 6). Regenerate `self-model.json`.
- [ ] 6.2 Knowledge base topic in `internal/agent/knowledge.go`: structured
      reads are authoritative; no template fallback.

## 7. Documentation

- [ ] 7.1 `apps/strategy-server/AGENTS.md`: Memory isolation model, key format,
      projection manifest, the one read path, the sweep.
- [ ] 7.2 Root `AGENTS.md`, Semantic Strategy Engine section: `epf ingest` /
      `epf sync` must never target a strategy-server Memory project.

## 8. Verification

- [ ] 8.1 `go test ./...` and `task lint` clean; compare with the baseline.
- [ ] 8.2 `task dev-up-full` against a real Memory container: scaffold instance
      A, import a real instance B, import B again with an artifact removed,
      restore a version, delete A, run the sweep dry-run and apply. Check every
      #99 acceptance criterion by hand and record the result in the PR.
- [ ] 8.3 Measure a full ingest of the largest local instance (time, object
      and relationship counts, manifest replace time) and a second ingest with
      no changes (must create no new Memory versions). Record in design.md.
- [ ] 8.4 Independent review by a separate agent that has not seen the
      implementation: check the code against the invariants I1–I7 and the
      scenarios in the spec delta.
- [ ] 8.5 `openspec validate fence-memory-graph-per-instance --strict`.

## 9. Tests (written first; map to #99 acceptance criteria)

- [ ] 9.1 Two instances with shared canonical keys: no read for A returns or
      counts B's objects (AC1). Search, neighbours, contradictions, lifecycle.
- [ ] 9.2 Objects without `instance_id` are never returned (AC2).
- [ ] 9.3 Import removing an artifact: none of its objects visible after the
      triggered ingest, no restart (AC3).
- [ ] 9.4 Import changing an artifact: new content visible, old not (AC4).
- [ ] 9.5 `restore_version`: reads reflect the restored version only (AC5).
- [ ] 9.6 `commit_batch` changing a North Star value updates decomposed
      `Belief` objects (AC6).
- [ ] 9.7 Ingest of A never modifies or hides B's object with the same
      artifact key (AC7).
- [ ] 9.8 Delete instance: objects, relationships, branches gone; restart does
      not bring them back (AC8).
- [ ] 9.9 Dropped job: instance stays dirty; heartbeat converges it (AC9).
- [ ] 9.10 Failed ingest: manifest unchanged, instance still dirty, objects
      added only by the failed attempt invisible.
- [ ] 9.11 Two concurrent `InstanceChanged` for one instance: serialised,
      generation strictly increasing.
- [ ] 9.12 Lifecycle mode of A independent of B (AC10).
- [ ] 9.13 `search_strategy` returns `instance_id`, `layer`, `source_artifact`
      (AC11); `limit` filled when foreign hits dominate.
- [ ] 9.14 `graph_not_ready` for an instance without a manifest.
- [ ] 9.15 Sweep: dry run deletes nothing and reports per class; apply deletes
      them and skips a locked instance and an instance without a manifest.
- [ ] 9.16 CLI import writes stamped objects only.
- [ ] 9.17 Re-ingest with no artifact change sends no property or label change
      to Memory (mock asserts every upsert payload equals the previous one).
- [ ] 9.18 Instance creation with a colliding key prefix gets a new UUID.
- [ ] 9.19 Change arriving during an ingest: the instance is still dirty after
      the ingest completes and a further ingest runs (`memory_change_seq`).
- [ ] 9.20 `scaffold_instance` yields `strategy_artifacts` rows and a triggered
      ingest.
- [ ] 9.21 Scenario of instance B used through instance A (`evaluate`, `commit`,
      `discard`): responds as not found; branch untouched.
- [ ] 9.22 `commit_scenario` sends no `execute: true` to Memory.
- [ ] 9.23 `DeleteWorkspace` purges the graph data of each of its instances.
- [ ] 9.24 Advisory lock helper: second caller blocks until release; a failed
      unlock does not return a locked connection to the pool.
- [ ] 9.25 Second replica: an ingest that finds the instance clean and already
      ingested does no Memory writes.
