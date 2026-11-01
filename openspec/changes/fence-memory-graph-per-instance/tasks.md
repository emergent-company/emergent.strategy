# Tasks: Fence the Memory graph per instance

Deadline: merged to `main` and deployable by **Wednesday 28 October**, so the
pilot can upgrade before Thursday 29 October.

Record the baseline first: `cd apps/strategy-server && go test ./...` with
Postgres up (`task dev-deps`). Expected: all packages pass.

Write each test in section 9 **before** the code it covers, and see it fail.
Tests run against the mocked Memory server already used by `phase2d_test.go`;
extend the mock where it cannot express labels, properties or deletes.

Tracks A–D can run in parallel after section 1. Section 5 depends on 2 and 3.

### Delivery slices

Writing prefixed keys and reading with scope must ship together; triggers,
purge and scenario ownership work under today's keys. Three PRs, each leaving
`main` consistent:

1. **Triggers, lifecycle, scenario ownership:** 1.1, 1.2 (re-check), 1.4, 1.5,
   2.7, 4.1–4.7, tests 9.3, 9.8, 9.9, 9.19–9.23. Migration 045 ships whole; the
   manifest table is unused until slice 2. Safe to deploy alone.
2. **The cutover (atomic):** 1.3, 2.1b–2.6, section 3 (including 3.6b), the
   remaining section 9 tests, 8.1–8.5. Needs the upgrade runbook.
3. **Sweep, contract, docs:** sections 5, 6, 7 (Tier 2).

Do not deploy production between slices 1 and 2 without reading the runbook.

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
- [x] 1.3 `domain/ingest`: `ScopedKey(instanceID uuid.UUID, key string) string`
      (8-character prefix, as today for decomposed keys), `UnscopedKey` and
      `RelationshipKey`; the only place Memory keys are built. Test that every
      key the decomposer produces for `docs/EPF/_instances/emergent` stays
      within Memory's 128-character key limit and unique. It did not: the
      longest was 141, so keys that would exceed 128 are shortened with a hash
      (design Decision 1, "Key length"). Track A (2.3) stores `source_key` on
      those objects.
- [ ] 1.4 Instance creation: retry with a new UUID on a prefix unique-index
      violation.
- [x] 1.5 `internal/memory`: add `Labels []string` to `SearchRequest` and
      `Labels` to `ListObjectsOptions` if missing. (`SearchRequest.Labels` came
      with slice 1; `ListObjectsOptions` has a single `Label`, which is all the
      instance-scoped list needs.)

## 2. Track A: write side (ingest)

- [x] 2.1 (analysis) Minimum emergent.memory version: v0.85.0 (design risk 1).
- [x] 2.1b Log the Memory version at startup (`HealthDetailed` already returns
      it) and warn when it is below v0.85.0 (`memory.Client.CheckVersion`, called
      from `setupSemantic`). The minimum is in the runbook (DEPLOYMENT.md 7.1).
- [x] 2.2 (re-checked in slice 2; tests 9.24 pass unchanged) Per-instance advisory lock helper (`pg_advisory_lock` on a dedicated
      `db.Conn`, key derived from the instance UUID), with `TryLock` for the
      sweep. Unlock explicitly; on unlock failure discard the connection instead
      of returning it to the pool (design Decision 2, step 1). Test that a
      second helper call for the same instance blocks until the first releases,
      and that a failed unlock does not leak the lock.
- [x] 2.3 Rewrite `ReingestInstance` + `ReingestInstanceDecomposed` as one
      manifest ingest (design Decision 2, steps 1–7): compute the manifest from
      the export, write both layers stamped per Decision 1, abort without
      touching the manifest on any write failure, replace manifest + generation
      + conditional dirty clear in one transaction, then GC (manifest diff, then
      label safety net). Write nothing per-ingest onto objects.
      Keep the integrity stamp on the artifact layer (`integrityMetadata`) and
      add it to decomposed objects, taking the class of the source artifact
      (design Decision 1, "Integrity stamp"; tests 9.28 and 9.29).
      Objects whose key `ingest.IsShortened` store the original key in property
      `source_key`.
- [x] 2.4 Relationships: stamp `instance_id`; resolve endpoints through scoped
      keys only; remove the `objectKeyIndex` prefix heuristics that assumed
      unscoped keys. GC resolves a removed relationship's Memory ID through
      `ObjectEdges` on the source object and deletes with the existing
      `DeleteRelationship` (design risk 3, decided).
- [x] 2.5 (removals and coalescing were done in slice 1; slice 2 adds the manifest
      check: a clean, hash-matching instance without a manifest is still ingested) Remove `ingestBatch`, `upsertGraphObject`, `deleteGraphObject` and
      `EnqueueBatch`. Replace with `InstanceChanged(ctx, instanceID)` plus
      per-instance coalescing (one in flight, one "dirty again" bit). After
      taking the advisory lock, skip the ingest if the instance is clean and
      already ingested (design Decision 2, step 1).
- [x] 2.6 `cmd_import.go`: delete `ingestDecomposed`; wire the exporter
      (`SetExporter`, as `cmd_serve.go:122`) and call the fenced ingest. Move any
      logic left in `cmd_import.go` into `domain/` (no business logic in
      commands).
- [x] 2.7 Fix `delete_reason` → `reason` in `internal/memory/objects.go:78`.

## 3. Track B: read side (semantic)

- [x] 3.1 `ManifestSource` interface in `domain/semantic` (`HasManifest`,
      `Visible(keys)` and `VisibleRelationships(tuples)`, each one `key = ANY(?)` query), implemented in
      `domain/ingest`; wire in `cmd_serve.go`.
- [x] 3.2 (`domain/semantic/scope.go`; not-ready is `semantic.ErrGraphNotReady`, which the MCP tools answer
      as an empty result with `graph_not_ready` and a hint, and `search_strategy` in auto mode answers
      with keyword search) Private scope helper: visibility rule (label `instance:<X>`,
      `instance_id == X`, key in manifest; relationships by endpoints and tuple),
      debug count of dropped items, `graph_not_ready` without a manifest.
- [x] 3.3 `SearchStrategy`: send exactly one label `instance:<X>`; over-fetch
      (`limit × 2`, cap 100), filter, trim. Add `instance_id`, `layer`,
      `source_artifact` to `SearchResult`. Keep dropping hits with a framework
      `integrity_class` and keep reporting the count (`ExcludedFramework` today);
      the label filter cannot exclude, so this stays a server-side filter after
      the over-fetch (design Decision 3; test 9.30).
- [x] 3.4 `GetNeighbors`: scope the caller key, not-found for invisible root,
      filter expansion.
- [x] 3.5 `DetectContradictions`: list by `instance:<uuid>` + `layer:artifact`,
      filter.
- [x] 3.6 Move lifecycle `enrichWithSemantics` (`internal/mcpserver/lifecycle.go:154`)
      into a semantic-service method using the scope helper. Its North Star
      lookup uses the key `Artifact:READY/00_north_star.yaml`, which ingest has
      never written, so "vision connected" is probably always false today.
      Resolve the real key instead: `epfimport.ArtifactKey` normalises to
      `north_star`, while an artifact imported by path may be
      `READY/00_north_star`. Look up by artifact type `north_star` within the
      instance rather than by a guessed key. Add a test with a scaffolded and an
      imported instance.
- [x] 3.6b Ripple (design Decision 3, "Ripple is a reader too"): add
      `semantic.ScopedGraph(instanceID)`; make `domain/ripple`
      (`SemanticAnalyzer`, `AnalyzeStructuralRipple`, tension, vertical)
      depend on its interface instead of `*memory.Client`; update the callers
      in `internal/pipeline/postcommit.go`, `register_ripple_tools.go` and
      `convergence.go`.
- [x] 3.7 Settings page: per-instance counts from the instance row; drop the
      project-wide `CountArtifactObjects` display.
- [x] 3.8 (`domain/semantic/architecture_test.go`; the sweep is in `domain/ingest`, already on the
      allow-list, and runs from `cmd_memory.go`; `cmd_*.go` is allowed because commands wire the clients) Architecture test: only `domain/semantic`, `domain/ingest` and the
      sweep may call `internal/memory` read methods (no exemptions; ripple goes
      through 3.6b), and every `Search` call sets exactly one `instance:` label.

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

- [x] 5.1 Domain function `SweepOrphans(ctx, apply bool)` in `domain/ingest/sweep.go`:
      page all objects, classify `no_owner` / `unknown_owner` / `not_in_manifest` /
      `legacy_key`, skip locked instances and instances without a manifest, delete
      sequentially when `apply`. A failed delete is counted and the sweep goes on;
      a second run retries what is left.
- [x] 5.2 CLI `strategy-server memory sweep [--apply]` (`cmd_memory.go`). **No MCP
      tool, by decision of the supervisor:** the sweep reads the whole Memory
      project across every organisation and the server has only org-level admin
      checks, so an MCP tool would let any one tenant's `org_admin` run a
      project-wide delete and see other tenants' instance ids and object keys. The
      CLI runs on the server's host like `token --mint`, so the operator is whoever
      controls the deployment. Nothing to regenerate in `self-model.json`.
- [x] 5.3 Upgrade runbook in `apps/strategy-server/docs/DEPLOYMENT.md` section 7
      (design Decision 5).

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
- [x] 8.3 Measure a full ingest of the largest local instance (time, object
      and relationship counts, manifest replace time) and a second ingest with
      no changes (must create no new Memory versions). Record in design.md.
      Also check that a dropped job converges: stop the server mid-ingest, restart,
      and confirm the instance is re-ingested within two heartbeat intervals.
- [ ] 8.4 Independent review by a separate agent that has not seen the
      implementation: check the code against the invariants I1–I7 and the
      scenarios in the spec delta.
- [ ] 8.5 `openspec validate fence-memory-graph-per-instance --strict`.

## 9. Tests (written first; map to #99 acceptance criteria)

- [x] 9.1 Two instances with shared canonical keys: no read for A returns or
      counts B's objects (AC1). Search, neighbours, contradictions, lifecycle.
- [x] 9.2 Objects without `instance_id` are never returned (AC2).
- [ ] 9.3 Import removing an artifact: none of its objects visible after the
      triggered ingest, no restart (AC3).
- [ ] 9.4 Import changing an artifact: new content visible, old not (AC4).
- [ ] 9.5 `restore_version`: reads reflect the restored version only (AC5).
- [ ] 9.6 `commit_batch` changing a North Star value updates decomposed
      `Belief` objects (AC6).
- [x] 9.7 Ingest of A never modifies or hides B's object with the same
      artifact key (AC7).
- [ ] 9.8 Delete instance: objects, relationships, branches gone; restart does
      not bring them back (AC8).
- [ ] 9.9 Dropped job: instance stays dirty; heartbeat converges it (AC9).
- [x] 9.10 Failed ingest: manifest unchanged, instance still dirty, objects
      added only by the failed attempt invisible.
- [x] 9.11 Two concurrent `InstanceChanged` for one instance: serialised,
      generation strictly increasing.
- [x] 9.12 Lifecycle mode of A independent of B (AC10).
- [x] 9.13 `search_strategy` returns `instance_id`, `layer`, `source_artifact`
      (AC11); `limit` filled when foreign hits dominate.
- [x] 9.14 `graph_not_ready` for an instance without a manifest.
- [x] 9.15 Sweep: dry run deletes nothing and reports per class; apply deletes
      them and skips a locked instance and an instance without a manifest.
- [x] 9.16 CLI import writes stamped objects only.
- [x] 9.17 Re-ingest with no artifact change sends no property or label change
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
- [x] 9.24 Advisory lock helper: second caller blocks until release; a failed
      unlock does not return a locked connection to the pool.
- [x] 9.25 Second replica: an ingest that finds the instance clean and already
      ingested does no Memory writes.
- [x] 9.26 Ripple classification after keys are prefixed: the semantic analyser
      still finds the changed artifact in its own search results, and never sees
      another instance's objects.
- [x] 9.27 Lifecycle "vision connected" is true for a scaffolded instance and for
      an imported one, and false when only another instance has a North Star.
- [x] 9.28 Decomposed objects of an unmodified template carry `integrity_class`
      and `integrity:<class>`, equal to their artifact's; objects of an authored
      artifact carry neither.
- [x] 9.29 A template edited into authored content, then re-ingested: no object
      of it carries a marking, and search returns it.
- [x] 9.30 Search over authored and framework objects (artifact and decomposed
      layers): framework hits are dropped and counted, authored hits are
      returned, and the over-fetch still fills the page.
- [x] 9.31 Architecture check: the scoped search path applies the framework
      filter (a mock Memory returning a flagged hit must not surface it).
