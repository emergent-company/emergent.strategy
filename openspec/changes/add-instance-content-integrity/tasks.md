# Tasks: Instance content integrity

Baseline first, in the worktree you will implement in:
`cd apps/strategy-server && go test ./...` (Postgres up via `task dev-deps`) and
`cd apps/epf-cli && go test ./...`. Record what passes. Write each test before
the code it covers and see it fail.

Order: 1 (canonical) feeds 2 and 3. Sections 2 and 3 are independent of each
other. Section 4 depends on the fence change's scoped read helper for the search
part. Section 5 follows 2 and 3.

## 1. canonical-epf (separate repository)

- [x] 1.1 Manifest generator: normalised-content hash per template, definition,
      value model and AIM file, for every release commit (canonical has no tags;
      releases are `Release: Bump version to X` commits). Implemented as
      `apps/epf-cli/scripts/gen-integrity-manifest` on `internal/integrity`, not as
      a script in canonical-epf, so the normalisation exists in Go once and both
      apps are tested against shared vectors. Output `integrity-manifest.json`.
- [ ] 1.2 Anchor schema: `canonical_definitions: installed | omitted` and
      `adopted_canonical: [ids]`.
- [ ] 1.3 Shipped templates: replace sample values (`Example Product Objective`,
      `Example ... Key Result`, `TBD`, `Your Organization Name`,
      `YYYY-MM-DD`) with `not_defined` where the schema allows, and keep the
      `PLACEHOLDER:` convention where it does not.
- [ ] 1.3b Product value model, AIM templates: header comment and status say
      template. Do not reuse real-looking IDs and outcomes in the AIM templates.
- [ ] 1.4 Distributed `AGENTS.md`: authoring rules (cite a source per claim, use
      `PLACEHOLDER:` for unknowns, ask rather than fill in, prune files you do not
      use, definitions are reference). Fix the claim that unsupported patterns are
      detected.
- [x] 1.5 `sync-embedded` (both apps) copies the manifest from canonical if it
      ships one, else generates it from canonical's git history, else writes an
      empty stub so the build never breaks. `make sync-embedded` into both apps. Never edit `internal/embedded/`
      by hand.

## 2. strategy-server

- [~] 2.1 `internal/integrity` (exact-match part done: normalise, hash, manifest
      lookup, fallback and report, every embedded file classifies as itself;
      near-match, `template_values` and the placeholder patterns remain):
      classifier (normalise, hash, manifest lookup,
      near-match, fallback and report), rule-id constants, and the placeholder
      patterns ported from `epf-cli`. Unit tests over every embedded template and
      definition (each classifies as itself).
- [x] 2.2 Migration (046; adds `integrity_checked_with` too): `integrity_class`, `integrity_ref` on `strategy_artifacts`,
      partial index. Next free number at merge (045 belongs to the fence change).
      Update `domain.StrategyArtifact` and the migration table in `AGENTS.md`.
- [x] 2.3 `deriveIndex` sets the class (verified by running tests: restore and
      scaffold done; evidence stamped; align reaches `deriveIndex`; aim and
      skillexec have no direct `strategy_artifacts` writes). `scaffold_instance`
      did not index at all: fixed. Original text: `deriveIndex` sets the class. Explicit calls in `restore_version`,
      `scaffold_instance` (also run `BackfillIndex`), and the direct seed paths in
      design appendix A. Test that each listed writer leaves the column set.
- [x] 2.4 Reclassify on startup for rows not checked with the current manifest
      (`integrity_checked_with`). A new manifest ships with a new binary, so a
      restart is the on-demand path; no separate admin call.
- [ ] 2.5 `check_content_readiness`: scan all artifacts, emit `integrity.*`
      findings (warning or info, aggregated for definitions), drop the score when
      there are zero features. Contract test: `ok` never changes because of
      integrity findings. Update the `outputSchema` description, `AGENTS.md` rule
      list and `task selfmodel:generate`.
- [ ] 2.6 `health_check`: `content_integrity` block, counts per class.
- [ ] 2.7 Fixtures shared with `epf-cli` (section 3.6): both apps run the same
      cases.

## 3. epf-cli (maintenance mode: additive, defaults unchanged)

- [ ] 3.1 Bug fixes: `canonical.go` matches `.value_model.yaml` (keep old forms,
      add cases to `canonical_test.go`); add the missing patterns to
      `internal/validation/patterns.go` and `internal/checks/instance.go`, from one
      shared list; fix the shadowed `^example:` pattern.
- [ ] 3.2 `ContentIntegrity` on `ContentReadinessResult`, computed inside the
      existing walk after the canonical exclusion step. Structural equality via
      `yaml.v3` into `interface{}`. Score and default exit code unchanged.
- [ ] 3.3 Print it in `health`, include it in `report` and in both MCP health
      handlers; add the `ToolCallSuggestion` naming the files.
- [ ] 3.4 `--strict-integrity` for `health`.
- [ ] 3.5 `init --no-definitions` and the `epf_init_instance` parameter (string,
      like `dry_run`); write `canonical_definitions` to the anchor; make
      `sync-canonical` and the `aim-canonical-incomplete` and
      missing-canonical diagnostics respect `omitted`. Add populate/import keywords
      to the wizard routing so they reach `draft-*`.
- [ ] 3.6 Shared fixture corpus under `testdata/content-integrity/` (input
      artifact, expected class, expected rule id) and a test in each app that
      runs it.

## 4. Answer-facing reads (strategy-server)

- [x] 4.1 (as `ListArtifactPage` with `IncludeFramework`; `ListCurrentArtifacts` and
      therefore export, versioning, ripple, watchdog and align are unchanged, so
      export output cannot change). Original text: `ListArtifactsFiltered` option to include framework content. Default
      excludes it for `get_strategy_context` and `list_artifacts`. Export,
      versioning, ripple, watchdog and align pass include-all. Test that export
      output is byte-identical before and after.
- [~] 4.2 `get_product_vision` returns a structured not-defined result for an
      unmodified template (other single-artifact reads: `get_feature` and the
      value-model tools serve non-template content or framework content on
      purpose). Original text: single-artifact reads return a structured not-defined result for an
      unmodified template, with the reason.
- [ ] 4.3 Ingest stamps property `integrity_class` and label
      `integrity:<class>` on Memory objects, including decomposed objects.
- [ ] 4.4 Search exclusion: through the scoped read helper once the fence change
      lands. Interim: over-fetch and filter on the property in `SearchStrategy`.
      Test with a mock Memory that returns a flagged hit.
- [ ] 4.5 Decide open question 2 (AIM domain and unmodified AIM templates) after
      reading `domain/aim`, and either implement or record the follow-up.

## 5. Instructions, descriptions and evidence

- [ ] 5.1 Rewrite `ServerInstructions()` and the descriptions of
      `search_strategy`, `get_definition`, `list_definitions` and `get_template`
      (design D6). Test that the instruction text contains each rule and that
      the descriptions name their authority. Regenerate `self-model.json`.
- [ ] 5.2 Replay the pilot comparison on the result: full copy against
      cleaned copy against full copy on the new server, three or more runs per
      condition per question, on isolated Memory projects. Record the results in
      the change before archiving.
- [ ] 5.3 `openspec validate add-instance-content-integrity --strict`, then
      archive on merge.
