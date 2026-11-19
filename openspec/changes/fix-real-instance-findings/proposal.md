# Change: Fix real-instance findings

Address 15 findings from issue #157 — discovered while importing and operating a
real instance (~190 artifacts, 46–52 Key Results across `okrs` and
`future_okrs_*` groups, six `future_okrs_*` groups) on a local strategy-server.
Each finding was reproduced on `main` at `34509f99` (2026-11-06) and verified
against the source.

The findings span five areas: relationship validation false positives, invisible
Key Results, sync-path data integrity, MCP tool bugs, and schema gaps. They are
grouped into work packages by area so they can be tracked and landed
independently.

Related: `add-instance-content-integrity` (integrity classification),
`fence-memory-graph-per-instance` (Memory scoping). This change has no
dependency on either.

## Why

A real instance with ~190 artifacts exposed failures that unit-scoped tests
missed because they require cross-artifact resolution at scale:

- `validate_relationships` reports 171 broken references, 157 of which are false
  positives — the check cannot pass and therefore cannot gate anything.
- 25–43 of 46–52 Key Results are invisible to every roadmap reader, every view,
  `AlignPortfolio`, and the validators, because they sit under `future_okrs_*`
  groups and every reader walks only `tracks.*.okrs`.
- `AlignPortfolio` silently rewrites all four value models on every import,
  marking ~151 components dormant, because it only sees the 9 Key Results under
  `okrs`. A re-import restores the flags; the next heartbeat (30 s) marks them
  dormant again. `sync_to_github` would propagate this back.
- `add_relationship` commits successfully but writes no `strategy_relationships`
  row — `ExtractRelationships` has no case for `artifact_type="relationship"`.
  The tool is completely broken.
- A freshly imported instance reads `server_ahead` and blocks
  `import_from_github`, because `determineSyncState` counts `source='import'`
  mutations as local changes.
- `sync_to_github` rewrites all 187 files and drops 969 of 974 comments because
  it round-trips every artifact through JSON→YAML and writes all files, not just
  changed ones.
- `get_section` silently returns `Content: nil` when a section exceeds
  `max_chars`, with no data and no children for some paths — the caller gets
  `truncated: true` and nothing else.

## What Changes

### 1. Relationship validation (`strategy-mcp`)

- **FIX** `validate_relationships`: resolve feature targets by id prefix (not
  only full artifact key), resolve `key_result` and `assumption` targets against
  the roadmap payload, remove `track` from `checkableTypes`.
- **ADD** `add_relationship` extraction: add a `"relationship"` case to
  `ExtractRelationships` so committed relationship mutations create
  `strategy_relationships` rows.

### 2. OKR and Key Result visibility (`strategy-core`, `strategy-mcp`)

- **FIX** every OKR reader (`extractKRTargets`, `strategyread.Objectives`,
  `strategyread.KeyResult`, `objectivesView`, `keyResultView`) to also walk
  `future_okrs_*` groups.
- **FIX** `AlignPortfolio` to include `future_okrs_*` Key Results when building
  the targeted set, so components are not incorrectly marked dormant.
- **ADD** a KR-target fitness check: `kr.no_component_path`,
  `kr.path_not_in_value_model`, `kr.reached_only_by_parent`,
  `feature.reaches_no_kr` (severity by feature status).

### 3. Sync and import integrity (`strategy-core`, `strategy-mcp`)

- **FIX** `determineSyncState` to exclude `source='import'` mutations from
  `committedAfterSync`, so a freshly imported instance reads `in_sync` or
  `github_ahead` instead of `server_ahead`.
- **ADD** `import --dry-run` to the CLI import command: prints added, removed
  and changed artifact keys without writing.
- **ADD** diff-based `sync_to_github`: write only artifacts whose content
  changed since the last import or sync, so unchanged files (and their comments)
  are not touched.
- **ADD** publish PR body uses batch descriptions from `describe_batch`.
- **ADD** protection against deleting files the server doesn't know about
  (e.g. `_meta.yaml`).

### 4. Schema and read gaps (`strategy-core`, `strategy-mcp`)

- **ADD** `future_okrs_*` to the roadmap schema (validated against the same item
  schema as `okrs`), or document as free-form with explicit opt-out.
- **ADD** `timeline` to the roadmap schema (or document where milestone dates
  belong).
- **ADD** `status` and `parked_reason` to the Key Result schema (or decide
  against and document the alternative).
- **FIX** `get_section`: when content exceeds `max_chars` and there are no
  children, return a structured marker instead of `Content: nil`.
- **ADD** `commit_batch` refuses a roadmap payload that fails `schema.required`
  on its own tracks, or requires confirmation.

### 5. Operational visibility (`strategy-mcp`)

- **ADD** GitHub sync status to `health_check` and `get_instance`, so agents
  know when sync tools are unavailable and why.
- **FIX** `import_instance` description to say which import routes (MCP vs CLI)
  are available.

## Impact

- Affected specs: `strategy-mcp` (validation, sync, health, descriptions),
  `strategy-core` (OKR reads, alignment, schema).
- Affected code: `internal/mcpserver/` (validation tool, sync tools, read tools,
  lifecycle, server), `domain/strategy/` (align, views, export, service),
  `domain/strategyread/` (roadmap, slice), `domain/sync/` (import, service),
  `internal/index/` (extract), `internal/epfimport/` (parse), `cmd_import.go`,
  `internal/embedded/schemas/`.
- DB: no migrations expected (relationship extraction uses existing tables).
- Dependencies: none.

## Non-Goals

- Memory graph scoping (covered by `fence-memory-graph-per-instance`).
- Content integrity classification (covered by `add-instance-content-integrity`).
- Full YAML comment-preserving round-trip (a changed-only writer avoids the
  problem for unchanged files; comment preservation in edited files is a
  follow-up).
- Cleaning the pilot instance repository.
- KR id pattern changes in `canonical-epf` (the schema change here loosens the
  pattern to match existing ids; canonical changes are a separate repo decision).
