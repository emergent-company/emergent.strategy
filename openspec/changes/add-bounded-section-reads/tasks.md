# Tasks: Bounded, question-shaped, self-describing reads

Baseline first: `cd apps/strategy-server && go test ./...` with Postgres up
(`task dev-deps`). Record what passes. Write each test before the code it covers
and see it fail.

Order: 1 first. 2 and 3 follow. 4 needs the callers identified (open question 2).
5 and 6 are independent of 4. 7 closes the change.

## 1. Slicer (pure domain logic, no infrastructure)

- [x] 1.1 `domain/strategyread` (pure package): path parser for dot paths and the `[n]`, `[id=..]`
      and `[name=..]` selectors, with the root wrapper key transparent.
- [x] 1.2 Budgeter (`[n:]` continues a list): serialised size, the over-budget rules in design D3 (object
      returns children, array returns whole items plus next index, oversize item
      descends), default 12,000 and cap 40,000. Table-driven tests including an
      item larger than the cap, an empty section and an unknown path (returns the
      nearest valid children).
- [x] 1.3 Outline builder: sections, sizes, gist (first of `title`, `name`,
      `statement`, `description`, truncated), and the read hint.
- [x] 1.4 Label extraction: objectives, key results, assumptions and definitions
      to readable names from the same instance. No labels for identifiers without
      a source. Cap the glossary.
- [x] 1.5 `cite_as` from artifact and path.

## 2. New tools

- [x] 2.1 `get_outline`, `get_section`, `get_view` (tools and behaviour done and
      tested through the MCP handler). Published output schemas are dropped, not
      deferred: `get_section` returns arbitrary stored JSON in `content`, so a
      schema would say little, and it would change the envelope clients receive.
      The read budget contract (7.1) is the contract that matters. Originally: contract test in the style of `verdict_contract_test.go` (read envelope,
      separate from the verdict envelope).
- [x] 2.2 Access map: list the three tools as `AccessRead`. Test that a
      read-only session can call them and that an unlisted tool still defaults to
      write.
- [x] 2.3 Add them to `core` in `tool_filter.go`. Update the expected-tools lists
      in the tests. Run `task selfmodel:generate`.
- [x] 2.4 Integrity interaction (implemented against the real classifier): sections of an artifact classified as
      `unmodified_template` or `canonical_reference` report `defined: false` with
      the reason (no-op until `add-instance-content-integrity` lands, with a test
      using a stubbed class).

## 3. Views

- [x] 3.1 `get_view` with `competitor`, `objectives`, `key_result` and
      `personas`. Each part has its own `defined`.
- [x] 3.2 Test that every path a view reads exists in the embedded schema
      (`TestViewPathsMatchSchemas`). The paths are constants in `views.go`, listed by
      `ViewReads()`, so the code and the test use the same strings. Checked by
      renaming a path: the test fails.
- [x] 3.3 Routing (also: the no-match fallback is now `get_outline`, not
      `search_strategy`): add the keywords to `get_agent_for_task` so questions about
      what the strategy says, who the personas are, dates and figures reach the
      reads.

## 4. Existing tools

- [x] 4.0 Find every caller (in this repository: `ListCurrentArtifacts` has ~10
      internal callers (export/GitHub push, align, value-model tools, coverage,
      health) and is unchanged; only the MCP tools changed. Callers outside this
      repository, such as opencode-harness, are NOT checked and are the open risk.
      Original text: find every caller of `get_strategy_context`, `list_artifacts` and
      `get_roadmap` (the harness, the web UI, agents, skills) and record them
      here. Decide the release note.
- [x] 4.1 `get_personas` reads `target_users` from the insights artifact (bug
      fix, with a test using the pilot-shaped fixture).
- [x] 4.2 `get_competitive_position` includes the formula's per-competitor
      positioning.
- [x] 4.3 `get_strategy_context`, `list_artifacts` and `get_roadmap` return an
      outline by default. `full` returns payloads up to the cap with explicit
      truncation. `list_artifacts` paginates. Update descriptions. Check
      `ExportInstance`, ripple, watchdog and align still use the unbounded
      internal reads.

## 5. Search

- [x] 5.1 Hits carry `artifact_type`, `path`, `section_size_chars` and
      `read_with`, derived from the artifact key where possible and omitted where
      not. Extend the mocked-Memory test in `phase2d_test.go`.
- [x] 5.2 Rewrite the `search_strategy` description (the response stays a plain
      array so existing consumers do not break; exclusion counts are logged): discovery, then confirm with
      a section read. Coordinate with the fence change's description task.

## 6. Visibility

- [x] 6.1 Read-only sessions do not list write tools in `tools/list`. Open
      question 4 decided: keyed on the principal's read-only scope. Test that calling
      a hidden write tool is still refused by the access gate.
- [x] 6.2 Test that the first `tools/list` of a fresh session contains the three
      reads with no filter call.

## 7. Contract, acceptance and evidence

- [x] 7.1 Fixture larger than 1 MB (the pilot shape: six authored artifacts plus
      131 definitions). Contract test: no read tool exceeds the cap without
      `full`, and every truncation is flagged.
      Done in `read_budget_contract_test.go` (about 1.5 MB authored plus the
      embedded definitions). It found one real gap: `get_product_vision` returned
      the whole north star, 242,283 characters on the fixture. It is now bounded
      like `get_roadmap`. A second test lists every read tool that needs only an
      instance id and fails when one returns more than the default budget unless it
      is acknowledged with a reason. On the fixture, five are: `export_instance_yaml`
      (3.6 MB, an export by design), `list_mutations` (0.9 to 1.4 MB, every mutation
      with its payload), `list_installed_skills` (557 KB), `validate_instance`
      (405 KB) and `validate_with_plan` (127 KB), the last two on synthetic content
      that produces many findings. Tools that need more than an instance id are not covered.
      The four that are not exports are now bounded (task 8.1); the list holds only
      `export_instance_yaml`.
- [ ] 7.2 Acceptance table: parse the question bank's "where it lives" entries
      into a test data file. For each, assert the location is reachable in two
      calls or fewer within the default budget and returns the fact the gold
      answer needs.
- [ ] 7.3 Test with a real client session: does it inject `instructions`, does it
      re-list after `tools/list_changed` (open question 3). Record the result in
      the change.
- [ ] 7.4 Evaluation: per question, tokens read and answer accuracy, before and
      after, three or more runs per condition on isolated Memory projects. Record
      silent truncations (expected zero).
- [ ] 7.5 `openspec validate add-bounded-section-reads --strict`; archive on merge.


## 8. Remaining unbounded reads

- [x] 8.1 `list_mutations`, `list_installed_skills`, `validate_instance` and
      `validate_with_plan` return bounded defaults, with `full` and `max_chars`.
      On the pilot-shaped fixture: `list_mutations` 3.2 MB on one page, now 12 KB
      by default and 39 KB with `full`; `list_installed_skills` 557 KB, now 11 KB;
      `validate_instance` text 405 KB, now 4 KB; `validate_with_plan` text 127 KB,
      now 4 KB.
      - `list_mutations` is a summary (no payload, `size_chars` per row) and its
        payloads come with `full`. It no longer returns `instance_id` and
        `batch_metadata`; `get_mutation` returns the whole record. It declares
        `since_mutation_id`, which it already read.
      - `list_installed_skills` returns `{skills, total, truncated, max_chars,
        hints}` and no longer a bare array, with no prompt, YAML or script.
      - The validation tools keep the full text when it fits. Otherwise the text
        lists the invalid artifacts with their first five errors each and says what
        it left out. The verdict in `structuredContent` is unchanged and complete:
        it is a public contract that consumers baseline on, so it is not cut. On the
        fixture it is still 263 KB; whether a client forwards `structuredContent`
        to the model is not verified.
- [x] 8.2 Found and fixed while doing 8.1: `list_mutations` paging lost rows. The
      cursor was the first row of the next page, but the next query asked for rows
      strictly older than it, so that row and every row sharing its timestamp were
      skipped; rows committed in one batch always share one. Paging with a page of 2
      over 7 mutations returned 4. The cursor is now the last row returned and the
      comparison is on `(created_at, id)`. `since_mutation_id` compares timestamps
      only and has the same weakness at ties; not changed here.
