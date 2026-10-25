# Tasks: Fence the Memory graph per instance

Deadline: merged to `main` and deployable by **Wednesday 28 October**, so the
pilot can upgrade before Thursday 29 October.

Record the baseline first: `cd apps/strategy-server && go test ./...` with
Postgres up (`task dev-deps`). Expected: all packages pass.

Write each test in section 9 **before** the code it covers, and see it fail.
Tests run against the mocked Memory server already used by `phase2d_test.go`;
extend the mock where it cannot express labels, properties or deletes.

Tracks A–D can run in parallel after section 1. Section 5 depends on 2 and 3.

## 1. Groundwork (blocking)

- [ ] 1.1 Migration `043_memory_projection.sql`: add
      `strategy_instances.memory_generation BIGINT NOT NULL DEFAULT 0` and
      `memory_dirty_since TIMESTAMPTZ NULL`; create `memory_projection`
      (design Decision 2); unique index on `left(id::text, 8)` over
      `strategy_instances`; set `memory_content_hash = NULL` for active
      instances. Update `internal/domain` structs and the migration table in
      `apps/strategy-server/AGENTS.md`.
- [ ] 1.2 Trace every path that writes `strategy_artifacts` outside
      `strategy.CommitBatch` / `CommitAuto`. Known: `instance.ReimportArtifacts`,
      `instance.ImportInstance`, `version.Restore`, `evidence.Ingest`. Still to
      check: canonical-definition install (`internal/handler/handler_fire_definitions.go`),
      `scaffold_instance`, `pack.InstallPack`, `app.InstallApp`. Record the
      list in design.md Decision 4.
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

- [ ] 2.1 Determine the minimum emergent.memory version with `labels` on
      `/api/graph/search` and the content-hash no-op on upsert (design risk 1);
      compare with the version in `docker-compose.yml`. Write it into design.md
      and the runbook.
- [ ] 2.2 Per-instance advisory lock helper (`pg_advisory_lock` on a dedicated
      connection, key derived from the instance UUID), with
      `TryLock` for the sweep.
- [ ] 2.3 Rewrite `ReingestInstance` + `ReingestInstanceDecomposed` as one
      manifest ingest (design Decision 2, steps 1–7): compute the manifest from
      the export, write both layers stamped per Decision 1, abort without
      touching the manifest on any write failure, replace manifest + generation
      + conditional dirty clear in one transaction, then GC (manifest diff, then
      label safety net). Write nothing per-ingest onto objects.
- [ ] 2.4 Relationships: stamp `instance_id`; resolve endpoints through scoped
      keys only; remove the `objectKeyIndex` prefix heuristics that assumed
      unscoped keys. Decide how GC resolves a removed relationship's Memory ID
      (design risk 3).
- [ ] 2.5 Remove `ingestBatch`, `upsertGraphObject`, `deleteGraphObject` and
      `EnqueueBatch`. Replace with `InstanceChanged(ctx, instanceID)` plus
      per-instance coalescing (one in flight, one "dirty again" bit).
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

- [ ] 4.1 `ingest.Notifier` interface; domain services from 1.2 set
      `memory_dirty_since = COALESCE(memory_dirty_since, now())` inside their
      transaction and call `InstanceChanged` after commit.
- [ ] 4.2 Remove caller-side `EnqueueBatch` calls (`internal/mcpserver/server.go:1244`,
      `internal/pipeline/postcommit.go`, `domain/ripple/convergence.go:293`,
      `domain/evidence/service.go:176`, `internal/mcpserver/introspection.go:120`).
- [ ] 4.3 Give the sync service the notifier (`cmd_serve.go:650`) so GitHub
      import triggers ingest (#96 G1).
- [ ] 4.4 `RepairMemoryDrift` and the startup sweep: re-enqueue active
      instances that are dirty, have a NULL content hash, or have no manifest;
      add `deleted_at IS NULL` to their raw queries (#87 F2).
- [ ] 4.5 `DeleteInstance`: enqueue purge (objects with label `instance:<uuid>`
      and in the manifest, branches `scenario-<uuid>-*`, then manifest rows)
      under the instance lock; record the outcome; correct the
      `delete_instance` tool text (#87 F1).
- [ ] 4.6 Scenarios: route branch reads through the scope helper; verify
      whether `CommitScenario` can merge foreign objects into main. If it can,
      gate `commit_scenario` with a clear error and open a follow-up issue.

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
