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

- [ ] 1.1 `validate_relationships`: resolve feature targets by id prefix match
      (e.g. `fd-014` resolves to `fd-014_business_directory`), not only by exact
      artifact key. Add test with both short and full keys.
- [ ] 1.2 `validate_relationships`: resolve `key_result` and `assumption` target
      types against the roadmap recipe payload (they live inside
      `tracks.*.okrs[].key_results[]` and `tracks.*.assumptions[]`, not as
      standalone artifacts). Add test.
- [ ] 1.3 `validate_relationships`: remove `track` from `checkableTypes` (tracks
      are never stored as artifacts; this produces 51 false positives on the
      real instance).
- [ ] 1.4 `add_relationship`: add a `"relationship"` case to
      `ExtractRelationships` in `internal/index/extract.go` so that committing a
      relationship mutation inserts a row into `strategy_relationships`. Test
      end-to-end: stage via `add_relationship`, commit, verify the relationship
      appears in `ListRelationships`.
- [ ] 1.5 `add_relationship`: verify that `validate_relationships` sees the new
      relationship after commit.

## 2. OKR and Key Result visibility (WP-002)

- [ ] 2.1 `domain/strategyread/roadmap.go`: extend `Objectives()` to walk
      `future_okrs_*` groups alongside `okrs`. Return a marker or group label
      so the caller knows which group each objective came from.
- [ ] 2.2 `domain/strategyread/roadmap.go`: extend `KeyResult()` to find Key
      Results in `future_okrs_*` groups.
- [ ] 2.3 `domain/strategy/views.go`: verify `objectivesView` and
      `keyResultView` pick up the extended readers. Add test with a roadmap
      payload containing both `okrs` and `future_okrs_q3_2026`.
- [ ] 2.4 `domain/strategy/align.go`: extend `extractKRTargets` to walk
      `future_okrs_*` groups. Add test: a component targeted only by a
      `future_okrs_*` Key Result stays `active: true`.
- [ ] 2.5 Decide: should `get_roadmap` and the Roadmap web page report how many
      Key Results were found and in which groups? If yes, add the counts.
- [ ] 2.6 `domain/strategyread/fit.go` and any other KR consumer: audit for
      `okrs`-only reads and extend.
- [ ] 2.7 Add a KR-target fitness check (tool or finding family):
      `kr.no_component_path`, `kr.path_not_in_value_model`,
      `kr.reached_only_by_parent`, `feature.reaches_no_kr` (severity:
      `draft`→warning, `in-progress`→error). Wire into `validate_instance` or
      expose as a separate tool.

## 3. Sync and import integrity (WP-003)

- [ ] 3.1 `domain/sync/import.go`: exclude `source = 'import'` from the
      `committedAfterSync` count in `determineSyncState`. Test: import an
      instance, link it to a repo, verify `get_sync_state` returns `in_sync` or
      `github_ahead`, not `server_ahead`.
- [ ] 3.2 `cmd_import.go`: add `--dry-run` flag. When set, parse and diff
      against existing artifacts, print added/removed/changed keys, and exit
      without writing. Refuse re-import without `--force` when the server holds
      non-import mutations the source does not.
- [ ] 3.3 `domain/sync/service.go` / `SyncToGithub`: change to write only
      artifacts that changed since the last import or sync. Use the mutations
      table to identify changed artifact keys; export only those; pass unchanged
      files through from the existing tree.
- [ ] 3.4 `SyncToGithub`: build the publish PR body from batch descriptions
      (the `describe_batch` summaries stored on each batch). List changed
      artifacts and their descriptions.
- [ ] 3.5 `SyncToGithub` / `CommitFiles`: verify that files under the base path
      which the server has no artifact for (e.g. `_meta.yaml`) are not deleted.
      Add a test with a mock repo containing an extra file.
- [ ] 3.6 `AlignPortfolio` write-back: document or add a way to disable
      automatic dormant marking per instance, so a re-import followed by
      heartbeat does not silently flip value model flags. At minimum, record in
      `get_instance` or `health_check` that classification was applied and when.

## 4. Schema and read gaps (WP-004)

- [ ] 4.1 Decide: is `future_okrs_*` part of the roadmap schema? If yes, add
      `additionalProperties` or `patternProperties` for `future_okrs_*` using the
      same item schema as `okrs`. If no, document as free-form.
- [ ] 4.2 KR id pattern: relax `^kr-[psoc]-\d{3}$` to allow a suffix
      (e.g. `kr-p-cyber-001`), since those ids are in production use and
      referenced from feature definitions.
- [ ] 4.3 Decide: add `timeline` (with `cycle_start`, `cycle_end`,
      `key_milestones`, `next_cycle`) to the roadmap schema? Or document where
      milestone dates belong.
- [ ] 4.4 Decide: add `status` (enum including `parked`) and `parked_reason` to
      the Key Result item schema? If yes, have `get_view` and the Roadmap page
      list parked Key Results separately with their reason. If no, document the
      alternative.
- [ ] 4.5 `domain/strategyread/slice.go`: when `get_section` truncates content
      and there are no children to offer, return a structured marker
      (`truncated: true`, `size_chars: N`, `budget_chars: M`) instead of
      `Content: nil`. The caller must know the content was dropped, not guess.
- [ ] 4.6 `commit_batch`: when committing a roadmap payload, check
      `schema.required` on the `tracks` object. If a required track is missing,
      refuse the commit or require explicit confirmation. Add test with a payload
      missing `tracks.product`.

## 5. Operational visibility (WP-005)

- [ ] 5.1 `health_check`: add a `github_sync` block reporting the state
      (`enabled`, `disabled`, `degraded`) and the reason
      (e.g. `GITHUB_APP_ID not configured`,
      `private key not found: open private-key.pem: no such file`).
- [ ] 5.2 `get_instance`: add `github_sync_available: bool` and, when false, a
      `github_sync_reason` field.
- [ ] 5.3 `import_instance` tool description: say which import routes are
      available (MCP `import_from_github` when GitHub App is configured, CLI
      `import` always).
- [ ] 5.4 When sync tools are not registered, register a stub `get_sync_info`
      (or similar) read tool that explains the state instead of returning
      `Unknown tool`.

## 6. Verification

- [ ] 6.1 `cd apps/strategy-server && go test ./...` green, no regressions from
      baseline.
- [ ] 6.2 `cd apps/strategy-server && task lint` clean.
- [ ] 6.3 `openspec validate fix-real-instance-findings --strict` passes.
- [ ] 6.4 Verify on the real instance (~190 artifacts): `validate_relationships`
      reports ≤14 findings (the real undefined assumptions), not 171.
- [ ] 6.5 Verify: `get_view` with `view=objectives` returns all 46–52 Key
      Results, not just the 9 under `okrs`.
- [ ] 6.6 Verify: `get_sync_state` after a fresh CLI import returns `in_sync`
      or `github_ahead`, not `server_ahead`.
