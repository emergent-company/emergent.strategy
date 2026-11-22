# Tasks: Fix real-instance findings

Baseline: `cd apps/strategy-server && go test ./...` with Postgres up via
`task dev-deps`. Record what passes. Write each test before the code it covers
and see it fail.

Order: WP-001 (relationship fix) and WP-002 (OKR visibility) are independent
and can land in any order. WP-003 (sync integrity) depends partly on WP-002
(the `future_okrs_*` reader fix affects `AlignPortfolio`'s dormant marking,
which in turn affects what `sync_to_github` writes). WP-004 (schema/read gaps)
and WP-005 (operational visibility) are independent of everything else.

## 1. Relationship validation and `add_relationship` (WP-001)

- [x] 1.1 `validate_relationships`: resolve feature targets by id prefix match
      (e.g. `fd-014` resolves to `fd-014_business_directory`), not only by exact
      artifact key. Add test with both short and full keys.
- [x] 1.2 `validate_relationships`: resolve `key_result` and `assumption` target
      types against the roadmap recipe payload (they live inside
      `tracks.*.<okr group>[].key_results[]` and `tracks.*.riskiest_assumptions[]`,
      not as standalone artifacts). Add test.
- [x] 1.3 `validate_relationships`: remove `track` from `checkableTypes` (tracks
      are never stored as artifacts; this produces 51 false positives on the
      real instance).
- [x] 1.4 `add_relationship`: add a `"relationship"` case to
      `ExtractRelationships` in `internal/index/extract.go` so that committing a
      relationship mutation inserts a row into `strategy_relationships`. Test
      end-to-end: stage via `add_relationship`, commit, verify the relationship
      appears in `ListRelationships`. The edge is stored on its real source,
      marked `origin: explicit` with the relationship artifact's key, so
      re-committing the source keeps it and re-committing or archiving the
      relationship artifact removes exactly it. Version snapshots carry the
      metadata so a restore keeps it. `add_relationship` resolves a short source
      id and rejects an unknown or ambiguous one.
- [x] 1.5 `add_relationship`: verify that `validate_relationships` sees the new
      relationship after commit.

## 2. OKR and Key Result visibility (WP-002)

- [x] 2.1 `domain/strategyread/roadmap.go`: extend `Objectives()` to walk
      `future_okrs_*` groups alongside `okrs`. Return a marker or group label
      so the caller knows which group each objective came from.
- [x] 2.2 `domain/strategyread/roadmap.go`: extend `KeyResult()` to find Key
      Results in `future_okrs_*` groups.
- [x] 2.3 `domain/strategy/views.go`: verify `objectivesView` and
      `keyResultView` pick up the extended readers. Add test with a roadmap
      payload containing both `okrs` and `future_okrs_q3_2026`.
- [x] 2.4 `domain/strategy/align.go`: extend `extractKRTargets` to walk
      `future_okrs_*` groups. Add test: a component targeted only by a
      `future_okrs_*` Key Result stays `active: true`.
- [x] 2.5 Decide: should `get_roadmap` and the Roadmap web page report how many
      Key Results were found and in which groups? If yes, add the counts.
      Decided: `AlignPortfolioResult` reports `KRsFound` and `KRsByGroup`, and
      every objective and key result in `get_view` carries its `group`. The
      Roadmap web page and `get_roadmap` counts belong with the web handlers
      that still read only `okrs` (`handler_roadmap.go`, `handler_execution.go`,
      `queries_phases.go`), which are covered by `fix-ui-schema-rendering-gaps`.
- [x] 2.6 `domain/strategyread/fit.go` and any other KR consumer: audit for
      `okrs`-only reads and extend. `fit.go` has no KR logic. Fixed: `align.go`,
      `internal/index/extract.go` (also read assumptions where the schema keeps
      them, on the track), and the `validate_relationships` resolver. Left for
      `fix-ui-schema-rendering-gaps`: the three web handler files above.
- [x] 2.7 Add a KR-target fitness check as the tool `validate_kr_target_fitness`
      (verdict envelope; analysis in `domain/strategy/fitness.go`):
      `kr.no_component_path` (warning), `kr.path_not_in_value_model` (error),
      `kr.reached_only_by_parent` (warning), `kr.reached_by_nothing` (warning),
      `feature.reaches_no_kr` (severity by
      the feature's status: `in-progress` error, `draft`/`ready` warning,
      `delivered` info). A Key Result target and a `contributes_to` path each
      resolve to a value model node (layer, component, sub-component); two
      nodes are related when one is the other or its ancestor. A Key Result is
      "reached only by parent" when contributors exist only at ancestors of its
      target. Key Results in `future_okrs_*` groups are included. A Key Result
      that nothing serves at all, neither at its target nor above or below it, is
      `kr.reached_by_nothing`, a fifth rule added with the maintainer's agreement
      after the first four shipped (#169). It is reported only for a Key Result
      whose target resolved: the others already have `kr.no_component_path` or
      `kr.path_not_in_value_model`, and a Key Result gets one of
      `reached_by_nothing` and `reached_only_by_parent`, never both.

## 3. Sync and import integrity (WP-003)

- [x] 3.1 `domain/sync/import.go`: exclude `source = 'import'` from the
      `committedAfterSync` count in `determineSyncState`. Test: import an
      instance, link it to a repo, verify `get_sync_state` returns `in_sync` or
      `github_ahead`, not `server_ahead`. Done: `import` and `system` are both
      excluded. Tests in `domain/sync/sync_state_import_test.go` use the real import
      path (`ImportInstance` with initial payloads under an import context) and
      fail without the change (`server_ahead`, local changes true); the authored
      sources `mcp`, `web` and `mcp_token` still read as local work. Note that
      `CommitAuto` always stamps `ripple_auto`, so it cannot stand in for an import
      in a test.
- [x] 3.2 `cmd_import.go`: add `--dry-run` flag. When set, parse and diff
      against existing artifacts, print added/removed/changed keys, and exit
      without writing. Refuse re-import without `--force` when the server holds
      non-import mutations the source does not. Done: `--dry-run` creates nothing,
      not even the org or the workspace, and says so when the instance is new.
      The diff is `instance.Service.PreviewReimport`. The guard follows what a
      re-import really does (it wipes every artifact and every mutation, staged ones
      included): it refuses when a changed or removed artifact's latest mutation did
      not come from an import, or when staged mutations exist. Content that an
      earlier import wrote is the source's own, so a source that moved on never
      needs `--force`. Tests drive the real flow against a test database
      (`cmd_import_test.go`) and fail when the guard or the dry-run return is
      removed. `runImport` is now `importInstance(ctx, db, cfg, out)` so it can be
      tested.
- [x] 3.3 `domain/sync/service.go` / `SyncToGithub`: change to write only
      artifacts that changed since the last import or sync. Use the mutations
      table to identify changed artifact keys; export only those; pass unchanged
      files through from the existing tree. Done in `domain/sync/changed.go`, for
      `SyncToGithub` and the AIM auto-push alike. An artifact is changed when the
      latest mutation applied to it (`strategy_artifacts.mutation_id`, not a
      timestamp: `CommitBatch` does not touch `created_at`, so a batch staged before
      a sync and committed after would be missed) is not an import, and the artifact
      was updated after the last merged export sync started. A sync whose PR is open
      or closed does not move the baseline, so the result is a superset, never a
      miss. Unchanged files are untouched because `CommitFiles` builds its tree on the
      branch's tree. A sync that changes nothing writes nothing and returns status
      `no_changes`. `full=true` (tool argument, `SyncParams.Full`) writes everything.
      A never-imported instance has no import mutations, so its first push writes
      everything. The safety PR before a diverged import stays a full export.
- [x] 3.4 `SyncToGithub`: build the publish PR body from batch descriptions
      (the `describe_batch` summaries stored on each batch). List changed
      artifacts and their descriptions. Done: changes are grouped by batch, each
      batch shown with its description and artifact keys (capped at 30 batches and
      20 keys, with a count of the rest), batches without a description listed as
      such. The AIM auto-push PR uses the same section.
- [x] 3.5 `SyncToGithub` / `CommitFiles`: verify that files under the base path
      which the server has no artifact for (e.g. `_meta.yaml`) are not deleted.
      Add a test with a mock repo containing an extra file. Verified: `CommitFiles`
      sends `base_tree` (the branch's current tree) and only the files it is given,
      so GitHub keeps every other file. `TestCommitFiles_KeepsFilesItIsNotGiven`
      pins the request (base tree set, exactly the given entries, no null sha) and
      fails when `base_tree` is dropped. The server also never deletes files for
      archived artifacts; the tool description now says so.
- [x] 3.6 `AlignPortfolio` write-back: document or add a way to disable
      automatic dormant marking per instance, so a re-import followed by
      heartbeat does not silently flip value model flags. At minimum, record in
      `get_instance` or `health_check` that classification was applied and when.
      Done. The automatic caller is the heartbeat ticker (`RunConsistencyCheckForAll`,
      every tick, every instance), plus the AIM cycle's `align_portfolio` step.
      Switch: `skip_align_portfolio: true` in the instance's `aim_trigger_config`,
      like `skip_foundations`; it stops both automatic runs and an explicit
      `align-portfolio` call still works. Record: a run that changes anything puts a
      summary and what it considered (Key Results found, with targets, by group) on
      the mutations it writes (`batch_description`, `batch_metadata`), so history and
      the sync PR from 3.4 show it; `health_check` gains `value_model_alignment`
      (automatic or not, how to turn it off, last change and counts). The AIM step
      metadata now carries `krs_found` and `krs_by_group`. The record lives on the
      mutations, so a re-import, which replaces the history, clears it. Root cause of
      the flipping (Key Results under `future_okrs_*` invisible to alignment) was fixed
      in WP-002.

## 4. Schema and read gaps (WP-004)

> Decisions 4.1 to 4.4 were canonical schema questions, filed as
> https://github.com/emergent-company/epf-canonical/issues/32 and decided in
> canonical v2.35.0. This repo is synced to it (`.epf-canonical-version`). Each
> decision below is checked by `internal/embedded/roadmap_shapes_test.go`, which
> fails against the v2.33.0 schema.

- [x] 4.1 Decide: is `future_okrs_*` part of the roadmap schema? **Yes.**
      `patternProperties` `^future_okrs_[a-z0-9_]+$` on the track, sharing a
      `future_okrs_group` definition: the same OKR and Key Result shape as `okrs`,
      without its length and count limits. A Key Result in a future group is now
      checked for id, description, target, status and `value_model_target`.
- [x] 4.2 KR id pattern. **One pattern in every schema:**
      `^kr-[psoc]-([a-z0-9]+-)*[0-9]+$` (roadmap, feature definition, work package,
      development brief). OKR ids accept a topic too (`okr-p-security`). The
      assessment report keeps its looser `^kr-[a-z0-9-]+$`, a superset, on purpose.
- [x] 4.3 Decide: add `timeline`? **No.** The roadmap template and
      `docs/guides/TRACK_BASED_ARCHITECTURE.md` document the mapping (`start_date`,
      `target_completion_date`, `execution_plan.key_milestones`). `next_cycle` is not
      added: a `future_okrs_*` group is how the next cycle is expressed.
- [ ] 4.4 Decide: add `status` (enum including `parked`) and `parked_reason` to
      the Key Result item schema? **Yes, in the schema** (done): an optional `status`
      (`active | parked`, plus `not_started`, `in_progress`, `completed` and the
      deprecated `not-started`, which instances already use) and `parked_reason`
      (at least 10 characters), required when parked. **Open here:** have `get_view`
      and the Roadmap page list parked Key Results separately with their reason.
      That is server and web work, not done yet.
- [x] 4.5 `domain/strategyread/slice.go`: when `get_section` truncates content
      and there are no children to offer, return a structured marker
      (`truncated: true`, `size_chars: N`, `budget_chars: M`) instead of
      `Content: nil`. The caller must know the content was dropped, not guess.
      Done, differently from how the task was written. The `Content: nil` with no
      children case does not reproduce: the bounded-read work already returns
      `truncated`, `size_chars` and `max_chars` (the budget; the field keeps its
      name) with every over-budget read, and a hint. Probing every over-budget
      shape found the real defect next to it: an array whose first item is itself
      an array was returned whole, over the budget, while flagged `truncated`
      (3,004 characters against a budget of 1,000), with no children to descend
      into. It now descends into the item's children like an object does. A test
      walks every child path of eight shapes and asserts that a truncated read
      stays within budget or offers children, and that every path it offers reads.
- [x] 4.6 `commit_batch`: when committing a roadmap payload, check
      `schema.required` on the `tracks` object. If a required track is missing,
      refuse the commit or require explicit confirmation. Add test with a payload
      missing `tracks.product`.
      Done as both: the commit is refused before anything is promoted, and
      `confirm_missing_tracks` commits it anyway. The required tracks are read from
      the embedded roadmap schema, not copied. It guards `Service.CommitBatch`, so
      the web commit path is covered too; `CommitBatchAllowingMissingTracks` is the
      confirmed variant. Only a roadmap create or update is checked, and other
      schema problems stay warnings after the commit, because they do not lose
      content. Left for #163: the web commit shows its generic "commit failed" for
      a refusal; the reason is in the log. The alignment test fixtures commit
      single-track roadmaps on purpose and now confirm that through their helper.

## 5. Operational visibility (WP-005)

- [x] 5.1 `health_check`: add a `github_sync` block reporting the state
      (`enabled`, `disabled`, `degraded`) and the reason
      (e.g. `GITHUB_APP_ID not configured`,
      `private key not found: open private-key.pem: no such file`).
      Done. The server records the state once at startup (`Services.GithubSync`,
      `syncdom.Availability`), from what it observed and not from config alone:
      `disabled` = the sync tools are not registered (a setting is missing, named
      exactly, or the key file or PEM is unusable); `degraded` = they are registered
      but the startup probe could not verify the App or found it lacking
      `contents:write` or `pull_requests:write`; `enabled` = verified. The block also
      says whether the sync tools are registered and lists the import routes. A
      server wired without a recorded state reads from its Sync service, so it never
      reads as healthy by default. A key file error is reduced to the file name and
      cause, because any MCP client can read this and the directory is the operator's.
- [x] 5.2 `get_instance`: add `github_sync_available: bool` and, when false, a
      `github_sync_reason` field. Done, with `github_sync_state` too: `degraded`
      is available (the tools exist) and carries its reason, so a bool alone could
      not tell a working sync from a broken one.
- [x] 5.3 `import_instance` tool description: say which import routes are
      available (MCP `import_from_github` when GitHub App is configured, CLI
      `import` always). Done. The description is static text naming both routes and
      pointing at `get_sync_info`; the live answer is in `health_check` and
      `get_sync_info`, because descriptions are generated into `self-model.json`
      without a configured server.
- [x] 5.4 When sync tools are not registered, register a stub `get_sync_info`
      (or similar) read tool that explains the state instead of returning
      `Unknown tool`. Done as `get_sync_info`, registered on every server so a
      client does not have to know which kind it is talking to. Without sync it
      lists the unavailable tools and alternatives (CLI import, `export_instance_yaml`,
      the settings an operator needs). Category admin, access read.

## 6. Verification

- [x] 6.1 `cd apps/strategy-server && go test ./...` green, no regressions from
      baseline. Run on `main` at #182: 54 packages ok, 0 failures (4m34s).
- [x] 6.2 `cd apps/strategy-server && task lint` clean. Whole tree: 0 issues.
- [x] 6.3 `openspec validate fix-real-instance-findings --strict` passes.
- [ ] 6.4 Verify on the real instance (~190 artifacts): `validate_relationships`
      reports ≤14 findings (the real undefined assumptions), not 171.
- [ ] 6.5 Verify: `get_view` with `view=objectives` returns all 46–52 Key
      Results, not just the 9 under `okrs`.
- [ ] 6.6 Verify: `get_sync_state` after a fresh CLI import returns `in_sync`
      or `github_ahead`, not `server_ahead`.

> 6.4 to 6.6 need the reported instance, which is not in this repository, and 6.6
> needs a real GitHub repository behind the App. They are open until the reporter
> confirms them. What stands in for them meanwhile is fixtures shaped like that
> instance, not the instance: `future_okrs_*` groups and the shared Key Result walk
> (2.x), import then sync state (3.x), and relationship validation with
> assumptions on the track. Our own Emergent instance cannot stand in: it uses
> none of those shapes. To confirm, run `validate_relationships`,
> `get_view view=objectives` and `get_sync_state` after a fresh CLI import on
> a build that includes #165 to #182, and compare with the numbers above.
